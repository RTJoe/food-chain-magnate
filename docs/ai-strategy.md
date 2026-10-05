# Food Chain Magnate — Game AI Design (Medium and Hard bots)

Status: design, pre-implementation. Companion to `architecture.md` (engine API) and `docs/rules/*` (rules). The Easy bot and the `Bot` interface are being built in `packages/ai` in parallel; this document designs Medium and Hard against that interface and specifies the tuning harness.

Numbers in this document that are measured (engine call costs) come from the throwaway script `timing.ts` described in §7; everything else (weights, thresholds) is an initial guess to be tuned with the harness in §8.

---

## 0. Summary

| Bot | Method | Budget per decision | Target |
|---|---|---|---|
| Easy | light heuristics (other engineer) | < 5 ms | plays legally, develops a little |
| Medium | strategy-driven heuristics: archetype + org-chart plan + scored placements, no search | < 50 ms (p95) | beats Easy ≥ 80 % (2p, seat-rotated) |
| Hard | Medium's planner for candidates + determinized rollouts through Dinnertime/Payday + evaluation function | ≈ 2 s (anytime) | beats Medium ≥ 65 % |

Design principles:
- **Legal by construction.** Every action a bot sends is built from `legalActions` / `legalPlacements`. Bots never reimplement rules; they only *value* options. Modules therefore need valuation hooks only (§9).
- **One plan object.** Medium's output per phase is a `MacroPlan`; Hard's candidate generator is "Medium's plan plus perturbations". The two bots share all scoring code.
- **Deterministic.** Given (view, seed, budget) a bot's choice is reproducible, except that Hard's anytime search may stop at a different candidate count on a slower machine. Traces (§8.3) record candidate counts so differences are explainable.

---

## 1. Interface and plumbing

### 1.1 `Bot` interface (as being built in `packages/ai`)

```ts
interface BotInput {
  view: GameView;            // redacted for the bot's seat (engine.redactFor)
  me: PlayerId;
  legal: LegalAction[];      // engine.legalActions(state, me) computed by the host
  engine: EngineApi;
  rng: RngState;             // seeded, bot-private (engine createRng)
  budgetMs: number;          // soft deadline
}
interface Bot { level: 'easy' | 'medium' | 'hard'; choose(input: BotInput): Action; }
```

The host (server bot seat or hot-seat client) calls `choose` once per awaited decision, including every `work.*` action in a Working turn. Medium and Hard therefore keep a small per-seat memory between calls (§1.3) so that a turn planned once is executed action by action without replanning.

### 1.2 View → pseudo-state

Bots receive a `GameView`, not a `GameState`. All engine helpers take a `GameState`. The client already runs `houseOutlook`/`campaignReach` on a pseudo-state built from a view (architecture §3.1), so `packages/ai` does the same:

```ts
function pseudoState(view: GameView, sample: HiddenSample, rng: RngState): GameState {
  const s = { ...view } as unknown as GameState;
  delete s.viewer; delete s.mine; delete s.submitted; delete s.visibleReserves;
  s.seed = 0;
  s.rng = createRng(nextUint32(rng));          // engine only draws randomness in createGame/setup hooks, so this is inert in play
  s.secrets = {};
  for (const pid of Object.keys(view.players)) {
    s.secrets[pid] = {
      reserve: pid === view.viewer ? view.mine?.reserve ?? null : sample.reserve[pid] ?? null,
      structureDraft: pid === view.viewer ? view.mine?.structureDraft ?? null : sample.structureDraft[pid] ?? null,
    };
  }
  return s;
}
```

Medium uses `pseudoState(view, EMPTY_SAMPLE)` (no hidden info filled in) and only calls read-only helpers (`houseOutlook`, `campaignReach`, `rangeOverlay`, `legalPlacements`). Hard fills in samples (§4.2) and runs `applyAction` on clones.

Risk: a module `redact` hook may hide more than secrets (none does in base). `pseudoState` must never throw; if the engine rejects an action during a rollout the rollout is scored as a failure (§4.4), never surfaced to the host.

### 1.3 Package layout (proposed)

```
packages/ai/src/
  index.ts                  createBot(level) ; re-exports
  bot.ts                    Bot, BotInput (owned by the Easy engineer)
  easy/                     (owned by the Easy engineer)
  shared/
    situation.ts            Situation: derived facts computed once per decision (§2)
    pseudoState.ts          §1.2
    valueTables.ts          card values, milestone values, archetype tables (§3.1, §5.3)
    pricing.ts              unit price arithmetic, win-probability model (§3.6)
    income.ts               expectedIncome / production capacity (§5.2)
    plan.ts                 MacroPlan type + executor (plan → next Action) (§3.5.0)
  medium/
    index.ts                MediumBot
    archetype.ts            §3.1
    orgPlanner.ts           §3.2
    restructure.ts          §3.3
    order.ts                §3.4
    working/{recruit,train,campaign,food,develop,restaurant}.ts   §3.5
    payday.ts cleanup.ts reserve.ts                               §3.7–3.8
    memory.ts               per-seat memory (archetype, plan, last structure)
  hard/
    index.ts                HardBot
    determinize.ts          §4.2
    candidates.ts           §4.3
    rollout.ts              §4.4
    evaluate.ts             §4.5
    budget.ts               §4.6
  modules/<ketchupModuleId>.ts   valuation hooks (§9)
  bench/                    tournament CLI, Elo, traces (§8)
```

Per-seat memory (`medium/memory.ts`) is keyed by `(gameId?, me)`; the host may give no game id, so memory is also validated against `view.round`/`view.phase` and discarded on mismatch (reconnects, replays).

---

## 2. Situation model (shared)

`Situation` is computed once per `choose` call (≈ 1–2 ms) and passed to every scorer. It is the bot's "reading of the board".

```ts
interface Situation {
  round: number; players: number; roundsLeftEstimate: number;     // §5.2
  me: PlayerFacts; opp: Record<PlayerId, PlayerFacts>;
  houses: HouseFacts[];                 // every house, with outlook + my reach
  contested: HouseFacts[];              // houses with demand where ≥2 chains connect
  drinks: { sourceId; food; bestRouteCollect: Record<Uid, number> }[];
  campaignSlots: { kind: CampaignKind; tileNumber: number; placement; houses: ReachedHouse[] }[]; // lazily filled
  bank: { cash: number; breaks: 0|1|2; expectedTotalIncome: number };
  supply: Record<EmployeeId, number>;   // view.supply
  milestonesOpen: MilestoneId[];        // not locked, not owned
}
interface PlayerFacts {
  cash: number; cards: Record<EmployeeId, number>;   // owned incl. beach/busy
  atWork: Uid[]; beach: Uid[]; busy: Uid[];
  unitPrice: number;                     // §3.6, with current cards at work
  waitressesAtWork: number;
  capacity: Record<FoodId, number>;      // what they can produce next Working (§5.2)
  restaurants: Restaurant[]; open: Restaurant[];
  salaries: number;                       // owed next Payday after known discounts
  ceoSlots: number; managerSlots: number; openSlots: number;
  milestones: MilestoneId[];
}
interface HouseFacts {
  id: HouseId; order: number; demand: DemandToken[]; capacity: number | null; garden: boolean;
  outlook: HouseOutlook;                 // engine.houseOutlook
  myBest: HouseSeller | null; rivalBest: HouseSeller | null;
  margin: number;                        // rivalBest.score - myBest.score (positive = I win on price+distance)
  value: number;                         // $ if I served it now (§5.2 revenue())
}
```

Costs (measured, 3p): `houseOutlook` 0.1 ms per house × ~12–20 houses; `rangeOverlay` 0.05 ms; `legalPlacements` 0.4 ms per campaign spec. `Situation` stays under 5 ms if campaign placements are enumerated lazily (only when a marketeer is at work).

---

## 3. Medium bot

### 3.1 Opening and archetype

Medium picks an **archetype** at the first Restructuring (round 1 hire is decided by the same scorer) and re-evaluates it every round; it changes archetype only when the score gap exceeds a hysteresis of 25 %. The archetype selects value tables (which cards/milestones the org planner wants) and tie-breaking preferences.

| Archetype | Core idea | Key cards (in order) | Milestones targeted | Map signal that favours it |
|---|---|---|---|---|
| `burger_volume` | burger cooks + billboards/mailboxes, cheap price, sell many | Marketing Trainee, Kitchen Trainee → Burger Cook, Pricing Manager ×2–3, Recruiting Girl, MT → JVP | first_billboard (if available R2), first_burger_marketed, first_burger_produced, first_lower_prices | many houses within distance ≤1 of my restaurant; few rival restaurants near |
| `pizza_volume` | same with pizza | as above with pizza | first_pizza_* | same; pick pizza when a rival already markets burgers |
| `drinks_waitress` | errand boys/cart → drinks (no salary until cart), waitresses for cash, market drinks | Errand Boy ×2, Waitress ×2, Marketing Trainee, Cart Operator | first_errand_boy, first_waitress, first_drink_marketed, first_cart_operator | drink sources within road range 2 of my entrance; soda/lemonade/beer coverage |
| `cfo_rush` | train MT→JVP→VP→SVP→CFO fast, then sell high | Trainer ×2 / Coach, MT, Pricing, cooks after | first_train, first_pay_20 (stack training), first_100 | slow neighbourhood (few houses, rivals far): time to build |
| `discount` | 2 discount managers + pricing → price ≈ $1–3, win every contested house, rely on volume + CFO | MT→JVP→Discount ×2, Pricing ×3, cooks, CFO later | first_lower_prices | highly contested area (margin ≤ 1 on most houses) |
| `luxury` | luxuries manager ($20) on uncontested houses with gardens, NBD gardens | MT→Luxuries, NBD, Marketing Trainee, Waitress | first_billboard, first_throw_away (freezer) | ≥ 3 houses only I can reach (rivals disconnected or distance ≥ 3 worse) |
| `milestone_racer` | grab First Billboard + First Train + First Hire 3 early, convert to salary-free engine | Marketing Trainee R1, Trainer, Recruiting Girl | first_billboard, first_train, first_hire_3, first_airplane | 2p games; opponents visibly slow (Easy) |

Archetype score at decision time (all terms normalised to 0..1, weights initial):

```
score(arch) = 0.35*mapFit(arch) + 0.25*progress(arch) + 0.20*uncontestedness(arch) + 0.20*milestoneAvailability(arch)
mapFit:      burger/pizza: houses within distance ≤1 / 6 (cap 1); drinks: drink sources in cart range (≥2 types) ; luxury: uncontested houses / 3
progress:    fraction of the archetype's key cards already owned (sunk investment)
uncontested: 1 - (contested houses / houses I reach)      // discount inverts this term
milestoneAvailability: fraction of the archetype's target milestones still open
```

Opponent reading (only cheap signals): if a rival already owns ≥ 2 marketeers, burger billboards near my houses will leak demand to them → penalise `*_volume` by 0.1 per such rival; if a rival has a discount manager, `luxury` loses 0.2, `discount` gains 0.1 (price war must be answered).

Round 1 hire, by archetype (pile availability checked): burger/pizza_volume → Marketing Trainee if `first_billboard` is open and I act ≤ 2nd in turn order else Recruiting Girl; drinks_waitress → Errand Boy; cfo_rush → Trainer; discount → Management Trainee; luxury → Management Trainee; milestone_racer → Marketing Trainee. Second hire (round 2, after Recruiting Girl) follows the org plan (§3.2).

### 3.2 Org-chart planning

The org planner produces a **target roster** for 3 rounds ahead and a **training path** for each roster line.

```
plan = {
  targets: [{ employeeId, count, by: round, via: EmployeeId[] /* training path from an owned or hireable card */ }],
  hires: EmployeeId[] (next 1–2 rounds, ordered),
  trains: { targetUid | 'new', path: EmployeeId[] }[],
}
```

Algorithm each round (≈ 1 ms):

1. Take the archetype's key-card list. Remove what is owned. For each missing card, compute the cheapest path: entry-level hire (0 steps) or training chain from the Management Trainee / Errand Boy / Marketing Trainee / Kitchen Trainee root (steps = chain length). Mark unreachable targets (empty pile, 1x already owned by me, "no CFO after first_100") as skipped.
2. **Trainer capacity**: steps available next round = trainers×1 + coaches×2 + gurus×3 (+ stacking if `first_pay_20`). If the plan needs more than 2 rounds of steps, add a Trainer (or Coach via JVP) to the front of the hire list. Coach is preferred over a second Trainer when ≥ 4 steps remain and cash ≥ $30.
3. **Slot capacity**: cards the plan wants *at work next round* must fit `ceoSlots + Σ managerSlots(managers at work)` − managers themselves occupy CEO slots. If not, insert a Management Trainee (2 slots, free, entry-level) or train MT → JVP (3 slots). Rule of thumb table:

   | Cards wanted at work | Minimum structure (3 CEO slots) |
   |---|---|
   | ≤ 3 | all under CEO |
   | 4–5 | MT (2) + 2 others under CEO → 4 ; two MTs → 5 (but 2 slots are managers) |
   | 6–7 | JVP (3) + MT (2) + 1 → 6 ; JVP + JVP + 1 → 7 |
   | 8–9 | VP (4) + JVP (3) + 1 → 8 ; VP + VP + 1 → 9 |
   | 10+ | SVP (5) + VP (4) + 1 → 10 ; Executive VP (10) + 2 → 12 |

   After the bank breaks the slot count changes (§3.8); the planner re-runs.
4. **Salary affordability**: the planner caps salaried cards so that `cash + conservativeIncome ≥ salaries + $5`, where `conservativeIncome = 0.6 × expectedIncome(me)` (§5.2) and salaries include cards to be hired/trained this round (they are paid this Payday). If over the cap, the lowest-value salaried card (§5.3 table) is removed from the plan; existing cards are never fired by the planner — firing is §3.7.
5. **CEO slot management**: Keep one CEO slot free for a *flex* card (waitress or pricing manager) that can be swapped in at Restructuring without changing managers; a manager at work with empty slots is fine (open slots also buy turn order, §3.4).

Training choices within a round: when several cards could be trained, order by `value(to) − value(from) − 5×salaryAdded` from §5.3, bonus +15 if the step completes a milestone this round (`first_train` for the first training ever; `first_pay_20` lets later rounds stack).

### 3.3 Restructuring (which cards go to work)

Medium evaluates a handful of structures with a one-round forecast, not a full search.

1. Build the **wanted set** from the plan: cards whose action this round has value > 0 (see per-card value below), ordered by value.
2. Lay them into the pyramid with the deterministic packer (managers into CEO slots first, highest slot count first; fill their slots; then the rest into CEO slots). Never overfill (penalty rule base.md §4.5).
3. Variants: (a) base; (b) +1 pricing manager / −1 lowest; (c) −1 pricing manager; (d) swap waitress↔kitchen trainee; (e) luxuries in/out; (f) leave one more open slot (turn-order bid, only when `first_airplane` or a contested restaurant/campaign spot makes going first matter, §3.4). At most 6 structures.
4. Score = `forecastIncome(structure) − salariesDue + developmentValue(actions enabled)` where
   - `forecastIncome` = §5.2 expectedIncome with `me.unitPrice` recomputed for the pricing cards in the variant and `waitresses` = waitresses in the variant; rivals use their *last round's* prices at work (public) blended 70/30 with the price their owned cards *could* set.
   - `developmentValue` = Σ over non-dinner cards at work: hire ×8 (×12 if a plan hire is waiting), train step ×10 per step the trainers can apply to planned paths, marketeer × campaign value of its best slot (§3.5.3, cached from last round if not yet computed), NBD × best house/garden value (§3.5.5), local/regional manager × best restaurant value (§3.5.6) or 0 if nothing to do, cooks/buyers × value of the goods they produce *that will be sold* (surplus is worth 0 unless a freezer exists, then 0.3 per item).
5. Round 1: only the CEO; submit immediately.

Per-card "action value this round" used in step 1:

| Card | Value at work this round |
|---|---|
| Waitress | 3 (+2 with first_waitress) + 4 if it breaks a tie on a contested house with `margin == 0` |
| Pricing / Discount / Luxuries | Δ forecastIncome from the price change (§3.6), can be negative |
| Kitchen trainee / cooks | §5.2 `value of goods produced that will be sold` |
| Errand boy / cart / truck / zeppelin | same for drinks, with `bestRouteCollect` |
| Marketing cards | best campaign value (§3.5.3), 0 if no legal spot |
| Recruiting girl/manager, HR | 8 per hire the plan wants; recruiting manager/HR unused action = 5 (salary discount), so always worth playing once owned |
| Trainer / Coach / Guru | 10 per planned step it can apply (card must be on the beach to be trained: the *target* goes to the beach, the trainer goes to work) |
| MT / JVP / VP / SVP / EVP | 0 own value; chosen by the packer when their slots are needed |
| NBD | best house/garden value |
| Local manager | best COMING SOON spot value (§3.5.6) |
| Regional manager | max(best new open restaurant, best relocation) |
| CFO | 0.5 × forecastIncome |

### 3.4 Order of business

Open slots are a consequence of §3.3; the *choice of position* is made when asked:

- Compute for each free position p: `value(p) = firstMoverValue × (N − p) / (N − 1)` where `firstMoverValue` = max of: value of the best contested campaign spot / restaurant spot / NBD house that a rival with a marketeer / manager / NBD at work could also take this round (from their revealed structure); tie-break value: `4 × (number of contested houses with margin == 0 and equal waitresses)` (earlier in turn order wins ties).
- Going **last** has value when I want to see rivals' restaurant moves before placing mine (regional manager at work) or when a rival's billboard could feed my house: `lastMoverValue = 0.5 × regionalManagerValue`.
- Choose argmax; ties → earliest position.

### 3.5 Working 9–5

#### 3.5.0 MacroPlan and executor

At the first `choose` of my Working turn Medium builds one `MacroPlan` and stores it in memory; subsequent `choose` calls pop the next step. If the engine rejects a step (host reports via a new `legal` without that option) the executor drops it and continues; a plan is never re-built mid-turn unless `view.turn.stage` moved past the step's stage.

```ts
interface MacroPlan {
  hires: { cardUid: Uid; employeeId: EmployeeId }[];
  trains: { trainerUid: Uid; targetUid: Uid; toEmployeeId: EmployeeId; path?: EmployeeId[] }[];
  campaigns: { cardUid; campaignKind; tileNumber; goods: FoodId[]; placement; duration; from? }[];
  produce: { cardUid; food?: FoodId }[];
  routes: { cardUid; route: BuyerRoute }[];
  houses: ({ cardUid; kind: 'house'; houseOrder; x; y; gardenSide } | { cardUid; kind: 'garden'; houseId; side })[];
  restaurants: ({ cardUid; kind: 'place'; x; y; entrance; from? } | { cardUid; kind: 'move'; restaurantId; x; y; entrance })[];
  skips: Uid[];                     // cards deliberately unused
}
// executor: emit steps in BASE_WORK_STAGE_ORDER (recruit, train, driveIns(auto), marketing, food, houses, lobbyists, restaurants), then work.endTurn
```

Stage order matters: a route (food stage) closes hiring and marketing, so the executor never emits a later-stage action while an earlier-stage step remains.

#### 3.5.1 Recruit

For each hire action available (CEO, recruiting girl, recruiting manager ×2, HR ×4): pick the top of `plan.hires` whose pile is non-empty (or empty but trainable this turn with a planned step), subject to the salary cap (§3.2.4). Milestone bonus: if 3 hires are possible this turn and `first_hire_3` is open, fill remaining hire actions with Management Trainees (free, useful slots) even if unplanned: value +2 free MTs. Unused recruiting manager/HR actions are left unused (salary discount); unused CEO/girl actions hire a Pricing Manager (free, no salary, always useful) if the plan has no better idea and the pile is non-empty.

#### 3.5.2 Train

Apply `plan.trains` in order while trainer uses remain; a card may be trained only on the beach, so the restructuring step already arranged that. Coach/guru multi-step on one card is preferred when it completes a target this round. Never train into a 1x card already owned; never train a card that `turn.mustTrain` does not require if the pile of the target is empty.

#### 3.5.3 Campaign placement (scoring with `campaignReach`)

For each marketeer at work, for each allowed kind (billboard < mailbox < airplane < radio by card), enumerate `legalPlacements({kind:'campaign', cardUid, campaignKind, tileNumber})` for every available tile number of that kind (billboards: prefer the largest footprint that fits; it does not change reach, so tile choice is by footprint fit only — try at most 2 tile numbers per kind), then score each `(placement, good, duration)`:

```
campaignValue(pl, good, dur):
  reach = campaignReach(state, { kind, placement: pl.placement, owner: me, goods: [good] })
  v = 0
  for h in reach.houses:
    if h.adds == 0: continue
    pWin = winProb(h.houseId, good)                     // §3.6
    perItem = unitRevenue(me, h.houseId, good)          // price ×2 garden + $5 marketed-milestone bonus
    leak = (1 - pWin) * 0.5 * unitRevenue(rivalBest, h.houseId, good)   // demand I create for a rival
    v += h.adds * (pWin * perItem - leak)
  rounds = eternal ? ETERNAL_HORIZON(6) : dur
  v *= rounds * DISCOUNT(rounds)      // DISCOUNT = 1 - 0.08*(rounds-1)
  v -= supplyGap(good, totalAdds)     // $ of demand I could not produce next round, 0.5 per item
  v += milestoneValue(first_<good>_marketed, first_billboard/airplane/radio)   // §5.3 if still open
  v -= 2 * dur if the marketeer is salaried and not covered by first_billboard  // busy card still paid
  return v
```

`winProb` uses the house outlook with demand hypothetically extended by `good` (rivals who cannot produce `good` are skipped). Duration: take `argmax(dur)` but cap at the duration where the house would be full anyway (`capacity − demand`) and at `roundsLeftEstimate`. Eternal (owner has `first_billboard`): the marketeer is lost forever, so require `v ≥ 25` or skip.

Airplane: enumerate all edge placements (there are ≤ 2×(w+h) × widths); radio: 1 per tile. Mailbox: flood area from `reach.area` size is a tiebreaker (bigger area = more future houses from NBD).

Goods choice: the good with the best `capacity − committed demand` for me, else my archetype's good; never market a good I cannot produce next round unless `v` after `supplyGap` is still the best and `first_<good>_marketed` is open (milestone grab).

#### 3.5.4 Produce food and buy drinks

Demand this Dinnertime is known: it is the demand on houses now (campaigns run *after* dinnertime). Target quantity per good:

```
need[good] = Σ over houses h with demand: demand_h[good] × (winProb(h) ≥ 0.5 ? 1 : winProb(h) ≥ 0.25 ? 0.5 : 0)
           + reserve: +1 per good for houses with margin == 0 (ties can go either way)
stock[good] = inventory + freezer
```

Production is all-or-nothing per card. Choose the subset of cooks/trainees/buyers at work that minimises `Σ |produced + stock − need|` weighted 1.0 for shortfall (lost sale) and `0.3` (freezer) / `0.05` (no freezer) for surplus. With ≤ 8 producing cards this is a brute-force subset enumeration (≤ 256 combos, each O(goods)). Kitchen trainees pick the good with the largest shortfall. Buyers: enumerate `legalPlacements({kind:'buyerRoute', cardUid})` (0.4 ms, max 4 ms measured) and pick the route whose `collects` best reduces shortfall; errand boys choose the drink with the largest shortfall.

"First burger/pizza produced" gives a free cook: when either is open and I have a kitchen trainee at work, produce that good even with need 0 (value ≈ cook value 20 − 5 salary).

Freezer: with a freezer, surplus up to 10 is kept (§3.7); the production rule above then overproduces by up to `min(10, nextRoundNeed)` where `nextRoundNeed` adds campaign demand that will land in Marketing (preview each of my campaigns with `campaignReach` on the current board).

#### 3.5.5 Houses and gardens (NBD)

- **Garden** on house h: value = `Σ over expected demand × unitPrice × (2 − 1)` (price doubles) + `(5 − 3) × avgItem × pWin(h)` (capacity 3 → 5) for the next 4 rounds × pWin(h). Only consider houses where pWin ≥ 0.6; the garden also helps rivals who serve the house.
- **New house** (combo with garden): enumerate `legalPlacements({kind:'house', houseOrder})`; placing it decides its *number*: choose a number that puts it **early** in Dinnertime order if I want its demand consumed before rivals' stock runs out, or **late** if my stock is thin (default: lowest available number). Position value = pWin at that spot (distance from my restaurants vs rivals') × `houseCellsReach` (campaigns that already reach the spot: immediate demand) × 2 (garden price) + adjacency to my planned billboards. Prefer spots at distance 0 from me and ≥ 2 from every rival.

#### 3.5.6 Restaurant placement and moves

Local manager (range 3, COMING SOON, opens next Cleanup) and regional manager (anywhere, opens now with drive-in): enumerate `legalPlacements` and score each spot:

```
restaurantValue(spot):
  v = 0
  for h in houses connected to spot (BFS via rangeOverlay from the spot's entrance; distance d):
    gain = pWin(h | new distance d) − pWin(h | current best distance)       // only improvement counts
    v += gain × expectedHouseValue(h, next 4 rounds)                        // demand now + campaigns reaching it
  v += 3 × (number of drink sources within cart range 2 of spot not already in range)   // supply
  v += 2 × (empty road-adjacent squares within range 2 for future billboards)
  v −= 10 if the spot's entrance tile already holds my restaurant (self-competition)
  v −= 5 × distance penalty if COMING SOON (one round lost): v *= 0.8 for local manager
  return v
```

Regional manager move: `max(restaurantValue(newSpot) − restaurantValue(currentSpot of moved restaurant))`; also use the regional manager purely for drive-ins (all restaurants get drive-ins while it is at work: distances shrink by using the nearest corner) — this is already accounted for by `houseOutlook` once the drive-in flag is set in the pseudo-state (set `driveIn=true` on my open restaurants when scoring a structure with a local/regional manager).

Do not place a third restaurant if `restaurantValue < 15` (salary and slot are better spent elsewhere).

### 3.6 Pricing relative to competitors

Unit price is set by which price cards are at work: `10 − pricing − 3×discount + 10×luxuries − (first_lower_prices ? 1 : 0)`. Medium does not choose a number; it chooses how many of each to put at work (§3.3 variants), using the win model:

```
winProb(h, extraGood?):
  mine  = myBest.unitPrice + myBest.distance   (with the structure under evaluation)
  rival = min over rivals that can supply h's demand (+extraGood) of (unitPrice + distance)
         // rival unitPrice: cards at work this round if known (post-reveal) else blend 0.7×lastRound + 0.3×min achievable
  if no rival: return 1
  m = rival − mine
  if m > 0: return 1
  if m < 0: return 0
  // tie: waitresses then turn order
  if myWaitresses > rivalWaitresses: 1 ; if fewer: 0 ; else earlierInTurnOrder ? 1 : 0   (pre-reveal: 0.5)
```

Pre-reveal uncertainty (Restructuring) is softened: `winProb = sigmoid(m / 1.5)` instead of the step so one pricing manager of margin is worth ~0.66, not 1. Luxuries (+$10) is only put at work when `Σ over houses with pWin==1 even at +10 of demand × 20` exceeds the loss on contested houses; in practice "no rival connects to ≥ 3 houses with demand that I connect to".

Negative prices are allowed by the rules; Medium never goes below $1 (two discounts + three pricing = $1).

### 3.7 Payday firing and Cleanup freezer

Firing (simultaneous): fire a salaried card when `value(card, remaining rounds) < 5 × roundsLeftEstimate` and it is not in the 3-round plan; always fire a card the plan has abandoned (archetype switch) and any cook of a good I no longer market. Forced firing (cannot pay): fire in ascending §5.3 value, never a manager that holds planned cards, never a busy marketeer unless forced by the rules. Keep enough cash for next round's salaries after firing: `cash − owed ≥ 0.4 × nextSalaries`.

Freezer (`cleanup.freezer`): keep up to 10 items, preferring goods with the largest `nextRoundNeed` (§3.5.4), ties → drinks (cheapest to replace? no: drinks are *harder* to replace — keep drinks first, then the archetype's food).

### 3.8 Bank-break awareness and reserve card

Bank model: `roundsLeftEstimate = bank.cash / max(1, Σ_p expectedIncome(p)) ` (before first break the reserves will refill, so `roundsLeft = roundsToFirstBreak + (expectedReserveTotal) / Σ income`; `expectedReserveTotal` = known reserves + 200 × unknown players).

Behaviour:
- **Leading** (my cash + nextIncome > every rival's): prefer actions that *shorten* the game: higher prices, no new salaried hires with payback > roundsLeft, CFO/luxuries at work, pricing managers out (higher income drains the bank faster).
- **Trailing**: prefer actions that lengthen it: lower prices (steal houses, reduce total bank drain), invest in training with payback within roundsLeft.
- Payback rule for any salaried investment: `value × roundsLeft − 5 × roundsLeft ≥ 0`, with `value` from §5.3 per round.
- Slot vote: after the first break CEO slots = mode of revealed reserves (ties → highest). The planner re-runs with the new `ceoSlots`.

Reserve card choice (setup, hidden): `+$300 / 4 slots` by default (more money lengthens the game, 4 slots helps a wide org); `+$100 / 2 slots` when my archetype is `milestone_racer` or `cfo_rush` in 2p (fast game, I plan a narrow org — and 2 slots cripples wide rivals); `+$200 / 3` for `drinks_waitress`. In Ketchup "Reserve Prices" (`kind: 'price'`), prefer `basePrice 20` with `luxury`/`cfo_rush`, `5` with `discount`, else `10`.

---

## 4. Hard bot

### 4.1 Loop

```
choose(input):
  sit = situation(input.view)
  switch (phase):
    restructuring:  structures = medium.structureCandidates(sit, 6) → search(structures)
    orderOfBusiness: positions = free positions → search(positions)         (cheap)
    working (first call of my turn): plans = candidates(sit) → search(plans) ; store best plan; execute
    working (later calls): executor pops next step of the stored plan (no search)
    payday: fireSets = medium.fireCandidates(sit, 4) → search(fireSets) with 1-round horizon
    cleanup / setup / choices: Medium policy (search gain is negligible)
  search(candidates): §4.6 anytime loop over (candidate × determinization) rollouts, §4.4; return argmax mean evaluation
```

A `search` always starts with Medium's own choice as candidate 0 and keeps it as the fallback if the budget is exhausted before every candidate has ≥ 1 rollout.

### 4.2 Determinization of hidden information

Hidden in the base game: (a) other players' reserve cards (until `first_20` or the first break), (b) other players' structure drafts during Restructuring. Everything else is public (`base.md` §4.8).

Sampler (seeded by `input.rng`, so it is reproducible):

```
sampleHidden(view, k):
  for each rival r:
    reserve[r] = view.visibleReserves[r] ?? draw from prior P(100)=0.2, P(200)=0.4, P(300)=0.4
                 (Reserve Prices module: P(5)=0.3, P(10)=0.4, P(20)=0.3)
    if phase == restructuring and !view.submitted-revealed:
      cands = medium.structureCandidates(situation seen from r's seat, 5)     // r's hand is public
      structureDraft[r] = softmax-sample(cands by medium score, temperature T=8 $)   // k=0 takes the argmax
  return { reserve, structureDraft }
```

Samples are *consistent with the view by construction*: structures fit r's cards and slots; reserves are among the three cards. K samples per decision: Restructuring 4, Working 3 (only reserves matter, and only near a break — if `bank.cash > 2 × Σ income` use K=1), Payday 2.

Rollouts also need rival **future decisions** (not hidden information but unknown): the opponent model is Medium (§4.4), deterministic, so one rollout per (candidate, sample) is enough — the engine draws no randomness in play, so repeated rollouts of the same determinization are identical.

### 4.3 Candidate generation (macro-plans)

Raw Working-phase branching is enormous (hires × trains × campaign spots × goods × durations × routes × restaurant spots). Hard never enumerates actions; it enumerates **plans** built from Medium's scorers:

1. `base = medium.plan(sit)`.
2. Per dimension, Medium's scorer returns a ranked list; keep the top alternatives:
   - hires: top 3 employee choices for the first hire action;
   - trains: top 2 paths;
   - each marketeer: top 3 placements × top 2 goods × {max duration, half duration};
   - production: {match demand (base), max production, no production} and, per buyer, top 2 routes;
   - NBD: top 3 house/garden options;
   - restaurants: top 3 spots (+ "do nothing");
   - pricing is not a Working decision (it is in the structure) — but the *implied* price matters for rollouts, so no variant here.
3. **Single-substitution neighbours**: every plan that differs from `base` in exactly one dimension (typically 10–20 plans).
4. After round 1 of the search (every neighbour evaluated once), take the top 3 neighbours and form **pairwise combinations** of their substitutions (≤ 3 plans). Then, budget permitting, triple combinations.
5. Prune by plausibility before rollout: salary cap (§3.2.4), `supplyGap` of a campaign > 3 items with no cook planned → drop.

For Restructuring the candidates are Medium's 6 structures (§3.3) plus up to 4 "plan-driven" structures: for the top 2 Working plans Hard would like next (computed with the current beach/hand as if everything were at work), the minimal structure that enables them.

For Order of Business the candidates are the free positions (≤ 5).

### 4.4 Rollouts

```
rollout(view, sample, candidate, horizon):
  s = pseudoState(view, sample, rng)
  apply candidate:
    restructuring: restructure.submit for me; for rivals use sample.structureDraft (apply as their submits)
    order: order.choosePosition; rivals who choose later use medium.order
    working: run candidate MacroPlan via the executor, work.endTurn
    payday: payday.fire(candidate) + confirm
  then drive the game with Medium for every player (including me from here on) until:
    horizon 1: end of this round's Cleanup (state in next round's Restructuring, or gameOver)
    horizon 2: end of next round's Cleanup
  every applyAction result that is !ok → return FAILED (candidate gets −1e6 for this sample; two failures drop it)
  return evaluate(s, me)                                                            // §4.5
```

Opponent model details:
- Rivals play **Medium with `fast: true`**: no structure variants (deterministic packer with the wanted set), top-1 everywhere, no `legalPlacements` for buyer routes beyond the first 8 candidates, and `Situation` cached per rollout step where unchanged. Target ≤ 3 ms per rival turn.
- My own continuation inside the rollout is also Medium-fast (Hard inside Hard is unaffordable).
- Dinnertime, Marketing, Cleanup are automatic in the engine (`runUntilInput`); Payday needs `payday.fire`/`confirm` from each player (Medium's firing rule), Cleanup needs `cleanup.freezer` from freezer owners.

Horizon: default 1 round for Working/Payday, 1 round for Restructuring; extend to 2 rounds when the budget has > 40 % left after all candidates have ≥ 1 sample and `roundsLeftEstimate ≥ 2`. Evaluations at different horizons are never mixed in one mean: horizon-2 results replace horizon-1 results for that candidate once every sample has them.

### 4.5 Evaluation function

Evaluated at a round boundary (phase `restructuring` of the next round, or `gameOver`). All terms are in dollars of "my advantage".

```
evaluate(s, me):
  if s.phase.kind == 'gameOver':
    rank = s.phase.ranking.indexOf(me)
    return (rank == 0 ? +10_000 : −10_000 × rank) + cashLead(s, me)

  cash      = s.players[me].cash
  cashLead  = cash − max over rivals r of s.players[r].cash
  incMe     = expectedIncome(s, me)                              // §5.2, next Dinnertime
  incRival  = max over rivals of expectedIncome(s, r)
  salMe     = salariesDue(s, me)                                 // next Payday, after known discounts
  salRival  = max over rivals of salariesDue(s, r)
  horizon   = clamp(roundsLeftEstimate(s), 1, 6)
  emp       = Σ cards c of me: cardValue(c, horizon) − Σ rivals max(... same ...) × 0.5
  ms        = Σ milestones m of me: milestoneValue(m, horizon) − Σ rivals Σ milestoneValue × 0.5
  org       = 2 × (openSlotsNextRound − neededSlotsNextRound)⁺ ... capped at 6     // flexibility
  pos       = Σ houses h: pWin(h) × expectedHouseValue(h, horizon) − rivals' equivalent × 0.5   // board position incl. houses without demand now but reached by campaigns
  bankTerm  = sign(cashLead + incMe − incRival) × BANK_W × (1 − s.bank.cash / initialBank(s))   // leader wants the break
  reserveT  = s.bank.breaks == 0 ? 0 : (ceoSlots(s) − 3) × 4 × (wideOrg(me) ? 1 : −1)

  return W.cash × cash
       + W.lead × cashLead
       + W.inc  × (incMe − salMe) × horizon
       − W.incR × (incRival − salRival) × horizon
       + W.emp × emp + W.ms × ms + W.org × org + W.pos × pos + bankTerm + reserveT
```

Initial weights:

| Weight | Value | Rationale |
|---|---|---|
| `W.cash` | 1.0 | the win condition |
| `W.lead` | 0.6 | relative position matters more as the game shortens; scaled by `1 + (1 − roundsLeft/10)` |
| `W.inc` | 0.8 | $1 of next-round net income is worth 0.8 × remaining rounds |
| `W.incR` | 0.4 | rivals' income hurts half as much as mine helps (N−1 rivals split the loss) |
| `W.emp` | 1.0 | `cardValue` is already in $ per remaining horizon |
| `W.ms` | 1.0 | idem |
| `W.org` | 1.0 | $2 per spare slot, cap $12 |
| `W.pos` | 0.5 | board position already partly counted in `inc` |
| `BANK_W` | 15 | ≈ one house of income; tune |

`cardValue(c, horizon)` = (per-round value from the table in §5.3 − salary 5) × horizon, discounted 0.9^round, with a floor of 0 for salary-free cards and a floor of −5 × horizon for salaried idle cards. `milestoneValue` likewise (§5.3).

The function is cheap (≈ 0.3 ms: `expectedIncome` for N players with cached `houseOutlook`).

### 4.6 Time budget and anytime behaviour

```
search(candidates, budgetMs):
  deadline = now + budgetMs − SAFETY(50 ms)
  results = map candidate → [scores]
  samples = sampleHidden(view, K)
  // pass 1: every candidate with sample 0, Medium's choice first
  for c in candidates: if now > deadline: break; results[c].push(rollout(view, samples[0], c, 1))
  // pass 2: remaining samples, best-first (UCB-lite: mean + 10/√n)
  while now < deadline:
    c = argmax over candidates with n < K of mean(c) + 10/√n(c)
    if none: break
    results[c].push(rollout(view, samples[n(c)], c, 1))
  // pass 3 (optional): horizon 2 for the top 3 if ≥ 40 % budget left
  // combinations (§4.3 step 4) are injected after pass 1
  return argmax mean, ties → Medium's candidate
```

Deadline checks happen between rollouts only (a rollout is ≤ 60 ms), so worst-case overrun is one rollout + safety margin. The host's `budgetMs` is honoured as given; the default is 2000 ms. With `budgetMs < 150` Hard returns Medium's choice directly.

**Restructuring (simultaneous).** The host asks each bot once; Hard's search uses sampled rival drafts (§4.2) and its own structure candidates. Because the engine reveals all structures at once, Hard cannot see rivals' choices; the K=4 samples cover the plausible space. Budget 2 s → ≈ 10 candidates × 4 samples × ≈ 30 ms = 1.2 s at 3p.

**Order of business.** Positions ≤ 5, rival structures now known, rivals' remaining position choices modelled by Medium. ≈ 5 × 3 samples × 30 ms = 0.45 s. Hard also uses this phase to *precompute* its Working plan candidates for the chosen position (stored in memory) so the first Working call starts the search with warm `Situation` data.

**Working.** One search at the first call (≈ 15–25 plans × 3 samples ≈ 45–75 rollouts ≈ 1.5–2 s at 3p; fewer at 4–5p since rival turns are more expensive); the remaining calls of the turn are instant. A rejected step mid-turn (should not happen; the executor validates with `placementProblem`/`validateAction` on the pseudo-state before sending) makes the executor fall back to Medium for the rest of the turn and logs a trace warning.

**Payday.** ≤ 4 fire sets × 2 samples × a cheaper rollout (from Payday to next round's Restructuring: ≈ 5 ms) — negligible.

---

## 5. Shared scoring reference

### 5.1 Decision → scorer map (what an engineer implements)

| Decision (action type) | Medium scorer | Hard candidate set | Section |
|---|---|---|---|
| `setup.placeRestaurant` | `restaurantValue` on `legalPlacements({kind:'restaurant'})`; pass only if every spot < 10 and I am not last | top 4 spots (no rollout: Dinnertime is empty for 2 rounds; use scorer) | 3.5.6 |
| `setup.chooseReserve` | archetype rule | same | 3.8 |
| `restructure.submit` | 6 structures, one-round forecast | 6 + 4 structures, rollouts | 3.3, 4.3 |
| `order.choosePosition` | `value(p)` | all free positions, rollouts | 3.4 |
| `work.recruit` | plan hires + salary cap | top 3 | 3.5.1 |
| `work.train` | plan paths | top 2 | 3.5.2 |
| `work.placeCampaign` | `campaignValue` | top 3 spots × 2 goods × 2 durations | 3.5.3 |
| `work.produce` / `work.buyDrinks` | demand-matching subset | 3 production modes × 2 routes | 3.5.4 |
| `work.placeHouse` / `placeGarden` | house/garden value | top 3 | 3.5.5 |
| `work.placeRestaurant` / `moveRestaurant` | `restaurantValue` | top 3 + none | 3.5.6 |
| `work.skip` / `work.endTurn` | executor | executor | 3.5.0 |
| `payday.fire` / `confirm` | value < salary rule | ≤ 4 sets | 3.7 |
| `cleanup.freezer` | nextRoundNeed | same | 3.7 |
| `choice.*` (Ketchup pending choices) | per-module scorer (§9) | same | 9 |

### 5.2 `expectedIncome` and production capacity

```
capacity(s, p)[good]:
  burger/pizza: Σ cooks of that type owned (not busy) × yield (1 / 3 / 8), kitchen trainees counted as 1 toward the archetype's good
  drinks: errand boys × 1 (2 with first_errand_boy, one type) + Σ buyers × bestRouteCollect[good]
          (bestRouteCollect from legalPlacements buyerRoute once per round per buyer card; cached in Situation)
  + inventory + freezer
  (Ketchup: coffee from baristas; sushi/noodles/kimchi from their cooks — module hook)

expectedIncome(s, p):
  price = unitPrice(p, cards at work last round if in a rollout; else the forecast structure)
  stock = capacity(s, p)   (copy; decremented as houses are served in order)
  income = 0
  for h in houses sorted by order with demand ≠ ∅:
    sellers = houseOutlook(s, h).sellers              // ranked by score then waitresses then order
    for seller in sellers:
      if canSupply(stock[seller.player], h.demand):   // every demanded item ≤ remaining capacity
        if seller.player == p:
          income += revenue(p, h)                     // Σ items × unitPrice × (garden ? 2 : 1) + $5 per item with *_marketed milestones (+ module per-sale bonuses)
        stock[seller.player] −= h.demand
        break
  income += waitressesAtWork(p) × (3 + (first_waitress ? 2 : 0))
  if CFO at work or first_100: income = ceil(income × 1.5)
  return income
```

This is a deterministic "shadow dinnertime" and costs ≈ 0.1 ms per house. In rollouts the engine's real Dinnertime replaces it; `expectedIncome` is only used for the *next* round at evaluation time, and by Medium at Restructuring.

`roundsLeftEstimate(s)`: `bank.cash / Σ_p expectedIncome(p)` (+ reserves if `breaks == 0`), clamped to [0.5, 12].

### 5.3 Value tables (initial)

Per-round value of a card at work ($), before salary; used by `cardValue`, the org planner and firing.

| Card | Value/round | Notes |
|---|---|---|
| Waitress | 3 (5 with first_waitress) | + tie-break value in contested rounds |
| Pricing Manager | 4 | ≈ margin on one contested house; 0 if no contested houses |
| Discount Manager | 6 | only in `discount`; else 2 |
| Luxuries Manager | 0 or Σ uncontested demand × 10 | computed, not tabled |
| Kitchen Trainee | 4 | 1 item |
| Burger/Pizza Cook | 10 | 3 items at ≈ $8 net of risk |
| Burger/Pizza Chef | 22 | 8 items; only worth it with ≥ 8 demand |
| Errand Boy | 5 | 1 drink (2 with milestone) |
| Cart Operator | 9 (12 with first_errand_boy) | if a source in range |
| Truck Driver | 13 | |
| Zeppelin Pilot | 16 | |
| Marketing Trainee | 8 | billboard, 2 rounds |
| Campaign Manager | 14 | |
| Brand Manager | 20 | airplanes |
| Brand Director | 26 | radios |
| Recruiting Girl | 6 | while the plan has hires; else 0 |
| Recruiting Manager | 10 | 2 actions or $10 salary discount → always ≥ 5 net |
| HR Director | 18 | |
| Trainer | 8 | while the plan has steps; else 0 |
| Coach | 14 | |
| Guru | 18 | |
| MT / JVP / VP / SVP / EVP | 2 / 4 / 6 / 8 / 12 | slot value; 0 if the slots are not needed |
| New Business Developer | 10 | while gardens/houses remain |
| Local Manager | 12 once (restaurant), then 3 (drive-ins) | |
| Regional Manager | 15 | |
| CFO | 0.5 × expectedIncome | computed |

Milestone values (total, over the rest of the game, used ×`horizon/6`):

| Milestone | Value | Comment |
|---|---|---|
| first_billboard | 30 (+5 per marketeer owned) − 10 if I have ≥ 2 marketeers I wanted to reuse | eternal campaigns + no marketeer salaries |
| first_train | 15 × horizon | −$15 every Payday |
| first_hire_3 | 12 | two free MTs |
| first_burger/pizza/drink_marketed | 5 × expected items sold per round × horizon | |
| first_errand_boy | 8 × horizon × (buyers owned) | |
| first_20 | 3 | information only |
| first_burger/pizza_produced | 10 (free cook, salary to pay) | |
| first_waitress | 2 × waitresses × horizon | |
| first_throw_away | 6 × horizon (freezer) | |
| first_lower_prices | 4 × horizon | permanent −$1 |
| first_cart_operator | 6 × horizon | range +1 |
| first_airplane | 4 × horizon | +2 open slots for turn order |
| first_radio | 10 × horizon if I own/plan a brand director | |
| first_100 | 0.5 × expectedIncome × horizon (free CFO) | |
| first_pay_20 | 8 if the plan has ≥ 4 steps left | stacking |

---

## 6. Worked example of a Medium turn (round 3, `burger_volume`)

View: I own Marketing Trainee (busy? no), Kitchen Trainee, Recruiting Girl, Pricing Manager, cash $18; a rival at distance 1 of houses 5 and 8 with a pricing manager; house 5 has 2 burger demand, house 8 has 1 burger. `first_burger_produced` open.

1. Situation: house 5 margin 0 (both at $9 + 1), house 8 margin +1 (I am distance 0). pWin(5) = 0.5 (tie → waitresses → order), pWin(8) = 1.
2. Restructuring variants: base {MT? none} → CEO slots: Pricing, Kitchen Trainee, Marketing Trainee; variant (b) Recruiting Girl instead of Marketing Trainee. Forecast: base income 1 burger × $9 + 2 × $9 × 0.5 = $18 + campaign value 14 ; (b) hire value 8 + 8 (MT and Trainer wanted). Base wins.
3. Working plan: recruit (CEO): Management Trainee (plan wants slots). Campaign: billboard at the spot that reaches houses 8 and 10 (both mine at distance 0) with burger, duration 2, value ≈ 2 houses × 2 adds × $9 × 1.0 × 2 rounds × 0.92 ≈ 66 − supplyGap (next round capacity 1 vs demand 4 → 1.5) + first_burger_marketed 20 → ≈ 85. Produce: kitchen trainee → burger (need = 1 + 2 × 0.5 = 2, stock 0; gains the free cook milestone).
4. Executor sends `work.recruit`, `work.placeCampaign`, `work.produce`, `work.endTurn`.

---

## 7. Performance notes (measured)

Script: `/private/tmp/claude-501/-Users-joe-Projects-Personal-food-chain-magnate/ace6039c-7847-4666-aa60-c9f7ac35beae/scratchpad/timing.ts` (run with `npx tsx`), Node 24, Apple Silicon, engine at commit `33a39e3`, random map, test-helper random bot driving whole games. Medians over thousands of calls.

| Call | Cost | Notes |
|---|---|---|
| `createGame` 2p/3p/4p | 0.15–0.25 ms | not needed in play |
| `applyAction` (any type) | 0.24–0.30 ms | dominated by `structuredClone` of the state (≈ 0.2 ms at 36–50 KB JSON) |
| `applyAction work.endTurn` that runs **Dinnertime + Payday start** | 0.22 ms (2p), 0.52 ms (3p), 0.37 ms (4p) | the whole automatic Dinnertime is cheap |
| `runUntilInput` on the Dinnertime fixture | 0.52 ms | 3p, 6 houses with demand, 4 campaigns |
| `legalActions` in Working | 0.08 ms (max 1.5) | |
| `legalActions` other phases | < 0.01 ms | |
| `legalPlacements` campaign | 0.39 ms (max 2.2) | per spec (card × kind × tile) |
| `legalPlacements` buyerRoute | 0.41 ms (max 4.3) | |
| `houseOutlook` | 0.11 ms per house | |
| `campaignReach` billboard | 0.02 ms | |
| `rangeOverlay` | 0.05 ms | |
| `clone` (structuredClone) | 0.21 ms (3p), 0.29 ms (4p) | `JSON.parse(JSON.stringify())` is 0.12–0.15 ms: use it for rollout clones |
| `redactFor` | 0.21–0.28 ms | |
| **Whole random round** (all players, incl. legalActions/legalPlacements per step) | 4.9 ms (2p), 8.4 ms (3p), 8.9 ms (4p) | ≈ 24 engine steps per round at 3p |

Implications:
- The engine is not the bottleneck; **the heuristics are**. A Medium-fast rival turn that calls `houseOutlook` on ~15 houses (1.6 ms), `legalPlacements` for 1–2 marketeers (0.8 ms) and 1–2 buyers (0.8 ms) and applies ~8 actions (2.4 ms) costs ≈ 6–8 ms. A 1-round rollout at 3p ≈ my plan (3 ms) + 2 rivals (15 ms) + Dinnertime/Payday/Cleanup (2 ms) + evaluation (1 ms) ≈ **20–25 ms**; at 5p ≈ 45 ms.
- Budget 2 s ⇒ ≈ **80 one-round rollouts at 3p, ≈ 40 at 5p**, or half that at horizon 2. §4.3's 15–25 candidates × 3 samples fits at 3p; at 5p drop to K=2 and 12 candidates.
- `applyAction` clones every call; a rollout of ~30 actions pays ~6 ms of cloning. If profiling shows rollouts dominated by cloning, add an internal `applyActionInPlace` (engine change, WP-B stretch) — not needed to meet the 2 s budget.
- Run bots off the server's main thread? The server is single-process; a 2 s Hard decision blocks WebSocket handling. Run bot seats in a `worker_threads` worker (WP-C) or set `budgetMs` ≤ 500 for server-hosted bots until then. Hot-seat (client) likewise: a Web Worker.
- Memory: a rollout keeps one state (50 KB) alive; the candidate table a few hundred numbers. No concern.

---

## 8. Tuning harness

### 8.1 Tournament CLI (`packages/ai/bench/tournament.ts`)

```
npm run ai:tournament -- --bots medium,easy --players 2 --games 200 --seed 1 --modules "" --budget 2000 --out runs/2026-10-05-medium-vs-easy
npm run ai:tournament -- --bots hard,medium,medium --players 3 --games 100 --rotate
```

- Each game: `createGame(config(players, modules), seed)`; bots assigned to seats; with `--rotate` every bot takes every seat equally (seat order is a confound: turn order and map draw matter). Game seed → map; bot seed = hash(game seed, seat).
- Loop: `who = state.awaiting.players[0]` → `bot.choose({ view: redactFor(state, who), legal: legalActions(state, who), … })` → `applyAction`. Any rejection is a **harness failure** (recorded, game aborted, counts as a loss for the offending bot).
- Guard rails: max 60 rounds (abort = draw, flagged), max 20 000 steps, per-decision wall time recorded.
- Parallelism: `worker_threads` pool, one game per task; results streamed as JSONL.
- Outputs: `summary.json` (win matrix, mean cash, mean rounds, p50/p95 decision ms per bot per phase, failure counts), `elo.json`, `games.jsonl` (per game: seed, seats, ranking, cash, rounds, breaks), `traces/<seed>.jsonl` (optional, `--trace`).

### 8.2 Elo

Multiplayer Elo: for each game, every ordered pair (i beats j) is a pairwise result; update with K=16 from a 1500 start, two passes over the shuffled game list (reduces order bias), and report the mean of 10 shuffles with ± spread. Also report plain head-to-head win rates with a Wilson 95 % interval; the acceptance criteria use the interval's lower bound.

### 8.3 Decision traces

One JSONL line per `choose` call when `--trace` is on:

```json
{ "seed": 17, "round": 5, "phase": "working", "stage": "marketing", "player": "p2", "bot": "hard",
  "archetype": "burger_volume", "ms": 1840, "candidates": 18, "rollouts": 54, "samples": 3, "horizon": 1,
  "chosen": { "type": "work.placeCampaign", "summary": "billboard#13 burger d2 @ (11,5)" },
  "top": [ { "summary": "...", "mean": 212.4, "n": 3 }, { "summary": "...", "mean": 205.1, "n": 3 } ],
  "evalTerms": { "cash": 48, "lead": 11, "inc": 36, "emp": 40, "ms": 27, "pos": 15, "bank": -4 },
  "warnings": [] }
```

`bench/replay.ts <trace> <seed> <round>` rebuilds the state via `engine.replay` and re-runs the bot at that decision with a larger budget, for debugging. `bench/inspect.ts` prints the Situation (houses, margins, pWin) as ASCII next to the board (`renderAscii` from `@fcm/engine/testing`).

### 8.4 Tuning loop

1. Freeze Easy. Tune Medium's value tables (§5.3) and thresholds against Easy until §8.5 passes; then Medium-vs-Medium self-play to catch degenerate loops (price wars to $1, never breaking the bank: enforce the 60-round abort as a failure).
2. Tune Hard's evaluation weights (§4.5) by coordinate descent: for each weight try ×0.5 / ×2, 100 games vs Medium (2p, rotated), keep improvements ≥ 3 points of win rate outside the CI noise. One sweep ≈ 9 weights × 2 × 100 games × ~2 s × ~25 decisions… too slow at full budget: tune at `--budget 300` (search depth still meaningful: ≈ 12 rollouts), then confirm the final weights at 2000 ms.
3. Keep the trace of every tuning run under `packages/ai/bench/runs/` (git-ignored) with the weight set in `summary.json`.

### 8.5 Success criteria

| Criterion | Target | How measured |
|---|---|---|
| Medium beats Easy | ≥ 80 % win rate, Wilson lower bound ≥ 75 % | 2p, 200 games, seat-rotated, base game, random maps |
| Medium beats Easy, 4p | ≥ 60 % (1 Medium + 3 Easy) | 100 games |
| Hard beats Medium | ≥ 65 %, lower bound ≥ 60 % | 2p, 200 games, `budget 2000` |
| Hard beats Medium, 3p | ≥ 50 % (1 Hard + 2 Medium) | 100 games |
| Legality | 0 rejected actions | all runs |
| Game completion | ≥ 95 % of Medium-vs-Medium games end by bank break within 40 rounds | 100 games |
| Latency | Medium p95 < 50 ms per decision; Hard p95 < `budgetMs + 100 ms`; Hard with `budget 150` returns Medium's choice | all runs |
| Determinism | same (game seed, bot seeds, budget ≥ ∞) → identical action log | 20 games replayed twice with `--budget 1e9 --rollout-cap N` (cap rollouts instead of time) |
| Ketchup | all §9 modules on: 0 rejections, Medium ≥ 70 % vs Easy | 100 games, 3p |

CI gate (`npm run ai:gate`): 2p Medium-vs-Easy 20 games + Hard-vs-Medium 10 games at `budget 300`, fixed seeds, must finish < 5 min, asserts only legality, completion and that Medium's win rate has not dropped below 60 % (noise-tolerant).

---

## 9. Ketchup module adjustments

Both bots are legal by construction (engine `legalActions`/`legalPlacements` include module actions and pending choices). Each module needs a `packages/ai/src/modules/<id>.ts` providing valuation deltas via one interface:

```ts
interface AiModuleHooks {
  cardValues?: Partial<Record<EmployeeId, (sit: Situation, p: PlayerId) => number>>;
  milestoneValues?: Partial<Record<MilestoneId, (sit, p) => number>>;
  capacity?: (sit, p, cap: Record<FoodId, number>) => void;      // add module foods
  campaignValueAdjust?: (sit, cand: CampaignCandidate, v: number) => number;
  choice?: (input: BotInput, choice: PendingChoice) => Action;    // scorer for module pending choices
  hiddenPrior?: (view, rival) => Partial<HiddenSample>;           // reserve prices etc.
  archetypeAdjust?: (sit, scores: Record<Archetype, number>) => void;
}
```

| Module | Adjustment |
|---|---|
| New Districts | Apartments: `capacity = null`, 2 counters per marketing event, dinner order 3.14 / 9.75. `campaignValue` counts `adds` as reported (already doubled by `campaignReach`); `winProb` for apartments requires supplying *all* accumulated demand — large orders favour chefs; add +50 % to chef card values when an apartment is reachable. Tile W house 25 already has a garden; tile U lemonade ×3 raises cart/truck value on that tile. |
| Lobbyists | Lobbyist is entry-level with salary. Value: park next to a house I win with margin ≥ 1 (×2 price, ×3 with garden): `Σ demand × unitPrice × (multiplier − 1)` over 4 rounds; road to connect a disconnected house cluster to my restaurant: `Σ expectedHouseValue of newly connected houses × pWin`. Roadworks add +1 distance this round: avoid placing where my own dinner routes pass. `extraMapTile` choice (First Lobbyist Used): place the leftover tile adjacent to my restaurant's tile on the side with the most road exits toward me; pick a tile with houses over one with drinks. Hard's determinization is unchanged (roads are public). |
| New Milestones | Replace the base milestone value table (§5.3) by one for the 17 replacements; the three "remove after turn 2" milestones (marketeer/trainer/recruiting girl *used*) get a ×2 urgency multiplier in rounds 1–2. "First marketeer used": +$5 per counter placed → add `5 × Σ adds` per campaign run to `campaignValue` and prefer apartments (×2). "First burger sold" → CEO 4 slots: org planner uses 4. "First beer sold" lets tokens pay salaries: firing rule counts stock. "First lemonade sold": training at work — the restructuring packer no longer needs the target on the beach. |
| Ketchup milestone ("Someone sells your demand") | `campaignValueAdjust`: demand that a rival serves is partly refunded → reduce `leak` to 0.25 × instead of 0.5 ×. |
| Coffee | Barista line: coffee demand, coffee shops are range starts (`rangeOverlay` handles it). Capacity hook adds coffee. Coffee shop placement (`coffeeShop` choice): score like a mini-restaurant: `restaurantValue` restricted to range gain for buyers/marketeers + coffee reach. |
| Kimchi / Sushi / Noodles | `HouseSeller.tier`: lower tier wins regardless of price. `winProb` must compare tiers before scores (use the outlook's ranking as-is, which already does). Capacity hook adds the foods; cooks' values: sushi cook 2 items at tier priority ≈ 12, noodle cook 6 items ≈ 14. Kimchi Master must produce 1 kimchi at Cleanup — value it as a tier-winning item. |
| Fry Chefs | +$10 per sale: `revenue()` adds 10 per item for the chain with a fry chef at work; fry chef card value = 10 × expected items sold. |
| Night Shift Manager | 0 slots, CEO slot only, doubles salary-free cards: value = Σ value of salary-free cards at work; the packer treats it as a manager with 0 slots. |
| Mass Marketeers | Extra marketing phase *during* Working: demand is no longer fixed at Working time. `need[good]` (§3.5.4) adds `campaignReach` of every campaign on the board once per extra phase the mass marketeer will trigger; Hard's rollouts handle it exactly. |
| Rural Marketeers | Rural area: `capacity = null`, giant billboards, freeways. Value a rural campaign as an apartment-like target reachable only by road through a freeway; `freeway` choice: side that connects my restaurant's tile to the rural area with fewest borders. |
| Gourmet Food Critics | Markets to every house with a garden: value = Σ over garden houses of `adds × pWin × unitRevenue`; strongly favours `luxury`. |
| Movie Stars | B/C/D stars win ties and pick turn order: `winProb` tie rule uses stars before waitresses; Order of Business value adds the star's choice. |
| Reserve Prices | Hidden prior per §4.2; base price 5/10/20 changes `unitPrice` for everyone after the first break → `roundsLeftEstimate` must use the expected base price. |
| Hard Choices | Base milestones removed after round 2/3 if unclaimed: urgency multiplier like New Milestones. |
| 6 Players | 4×6 map, Siap Faji chain: nothing bot-specific beyond K=2 samples and 10 candidates (rollouts cost ≈ 55 ms). |

Ketchup module hooks are WP-C scope; the base bots must not break when a module is on (unknown module card → value 0, unknown pending choice → first legal option).

---

## 10. Work packages

Three engineers, one package each, sharing `packages/ai/src/shared` (owned by WP-A, interface frozen in the first two days). All three depend on the Easy engineer's `Bot`/`BotInput` and on `packages/ai` existing with `createBot`.

### WP-A — Medium bot (1 engineer, ~2 weeks)

Scope: `shared/*` (Situation, pseudoState, pricing, income, plan executor, value tables), `medium/*` (§3), base game only.

Acceptance:
- Unit tests on engine fixtures (`FIXTURES.working`, `FIXTURES.dinnertime`, `FIXTURES.restructuring`): `expectedIncome` equals the engine's actual Dinnertime income when run on the fixture (shadow dinnertime matches real dinnertime for every player); `winProb` is 1/0/0.5 on hand-built houses; campaign scorer prefers the spot reaching 2 houses over 1; production matches demand on the fixture.
- `MacroPlan` executor emits only actions present in `legal` (property test over 200 random states from the fuzz bot).
- Medium beats Easy ≥ 80 % (2p, 200 games, rotated) and ≥ 60 % at 4p; 0 rejections; p95 < 50 ms.
- Medium-vs-Medium games finish by bank break within 40 rounds ≥ 95 %.
- `medium.fast` mode exists and runs a Working turn in ≤ 3 ms at 3p (needed by WP-B).
- Exposes `structureCandidates(sit, n)`, `plan(sit)`, `planAlternatives(sit)` (per-dimension ranked lists), `fireCandidates(sit, n)`, `orderValue(sit, p)` for WP-B.

### WP-B — Hard bot (1 engineer, ~2 weeks, starts after WP-A's interface freeze, can develop against Easy as the opponent model until Medium lands)

Scope: `hard/*` (§4): determinizer, candidate generator, rollout runner, evaluator, anytime budget, traces.

Acceptance:
- Rollout runner plays a full round from any `GameView` + sample without rejection on 500 random states (fuzz-bot generated, every phase), rejections counted and reported as 0.
- `evaluate` unit tests: gameOver dominates; more cash > less cash with equal everything; a sure next-round sale of $20 is worth more than an idle salaried card.
- Anytime: with `budgetMs ∈ {150, 500, 2000, 5000}` returns a legal action; at 150 returns Medium's choice; wall time p95 ≤ `budget + 100 ms` (3p).
- Determinism: with a rollout cap instead of a time cap, two runs produce identical action logs.
- Hard beats Medium ≥ 65 % (2p, 200 games) and ≥ 50 % at 3p vs two Mediums.
- Trace lines per §8.3 for every decision when enabled.
- Stretch: `applyActionInPlace` in the engine behind an internal flag if cloning > 30 % of rollout time (profile first).

### WP-C — Harness, tuning, Ketchup (1 engineer, ~2 weeks; harness first, in the first 3 days, so WP-A/B use it)

Scope: `bench/*` (§8), worker-thread bot execution for the server/hot-seat seats, weight tuning runs, `modules/*` hooks (§9).

Acceptance:
- `npm run ai:tournament` produces `summary.json`, `elo.json`, `games.jsonl`, traces; runs games in a worker pool; `--rotate` gives every bot every seat equally.
- `npm run ai:gate` finishes < 5 min in CI and fails on any rejection or on Medium < 60 % vs Easy.
- `bench/replay.ts` reproduces any traced decision from `(seed, actions)`.
- Server bot seats run in a `worker_threads` worker; a 2 s Hard decision does not delay other rooms' messages by more than 50 ms (integration test).
- All Ketchup modules enabled: 100 games 3p with Medium and Hard seats, 0 rejections; Medium ≥ 70 % vs Easy with modules on.
- Tuning report: before/after win rates for Medium tables and Hard weights, with the final weights committed to `valueTables.ts` / `evaluate.ts`.

Dependencies and order: WP-C harness (days 1–3) → WP-A Medium core (uses the harness from day 4) → WP-B (interface freeze from WP-A on day 2; full Medium opponent model from ~day 8) → WP-C tuning and Ketchup (from day 8, after Medium is stable).

---

## 11. Risks and open points

1. **Heuristic cost, not engine cost, bounds Hard.** If Medium-fast rival turns exceed ~8 ms, Hard's rollout count halves. Mitigation: cache `Situation` per rollout, use the JSON clone (0.12 ms) for rollouts, cap buyer-route enumeration.
2. **Simultaneous Restructuring is where Hard's edge is smallest** (K=4 samples of rival drafts). If Hard-vs-Medium stalls below 65 %, spend more of the budget there (K=6) rather than on Working-phase combinations.
3. **Price wars.** Two `discount` Mediums can drive prices to $1 and never break the bank. The 60-round abort and the bank-awareness rule (§3.8, trailing player lowers, leader raises) should prevent it; verify in self-play.
4. **Archetype thrash.** Hysteresis of 25 % and the sunk-cost `progress` term; trace `archetype` per decision to detect flapping.
5. **Milestone same-round sharing** means a rival can match my milestone in the same round; values in §5.3 assume exclusive ownership. Rollouts capture it; Medium ignores it (acceptable).
6. **Rules in flux** (`docs/rules/questions.md`): bots never encode rules, so engine rulings change only values, not legality.
