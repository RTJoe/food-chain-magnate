# Animation plan

Goal: every game event gets a small, readable animation that shows *what happened* on the board. Vans deliver dinner along the road, carts collect drinks at each source, campaigns push demand onto houses, pieces arrive and leave with a bit of toy-like life. Nothing ever blocks input or play.

Read with `docs/visual-style.md` (palette, mini style, "Motion"), `docs/architecture.md` §5.3 and `docs/ux-plan.md` §2.3 / WP5. This plan replaces the 1.5 s-per-batch rule in those documents.

Current state (measured in `dev/three-playground.html`, Dinnertime / Marketing buttons): `three/animate.ts` compresses a whole batch into 1.5 s (`BUDGET`), so a 5-house dinner gives each house 0.25 s; goods fly in a straight arc from restaurant to house ignoring roads; the winning route ribbon fades in and out underneath; coins puff over the restaurant. Marketing pulses the campaign, flashes reach rings and drops tokens. All of it is cosmetic: the reconciler already shows the final state before the first tween starts, which the new design keeps.

---

## 1. Motion principles

### 1.1 Tone

- Toy diner town. Pieces are chunky painted miniatures; motion is the hand of a player moving them: short lifts, hops, drops with a little overshoot (`ease.outBack`), dust and steam puffs, no physics, no particles bigger than a token.
- Vehicles are the stars. A chain's van, cart, truck or zeppelin carries the chain colour and mark, so "who" is readable from the vehicle alone. Vehicles always travel on roads (or in the air lane), never cut across lots.
- One idea per moment. Every step has a single focal point (a vehicle, a house, a campaign) and a caption. Secondary motion (coins, puffs) hangs off the focal point and never competes with it.
- Honest motion. Only things that really happened move. Losing chains at a house do not send vans; they get a score chip (existing). Nothing animates a secret (reserve cards, hidden structures).

### 1.2 Readability rules

- Minimum 0.45 s for anything the player must follow (a trip, a drop). Below that, do not animate it, pop it.
- Every moving actor has a drop shadow blob (`ctx.blob`) so height reads at 50° tilt.
- Tokens and vehicles are never smaller than 0.25 world units; captions carry the numbers (`phaseCaption`), the board carries the shapes.
- Colour is never the only cue: vehicles carry the chain mark decal, token flights carry the good's shape.
- Camera does not jump during a step (§1.6).

### 1.3 Pacing model

Each event batch is compiled into a **timeline** (§4) of steps with durations and parallel groups. Durations below are at 1×.

| Phase / batch | Nominal | Cap at 1× | How it compresses |
|---|---|---|---|
| Setup: board build | 2.5 s | 2.5 s | tiles drop in a 0.08 s stagger; roads fade in |
| Setup: restaurant placed | 0.6 s | 0.6 s | — |
| Restructuring reveal | 1.2 s (UI) | 1.2 s | all charts flip at once |
| Order of business | 0.8 s (UI) | 0.8 s | — |
| One working action | 0.4–1.4 s | 1.6 s | trip speed rises with path length (§4.3) |
| Dinnertime | 0.9 s per house | 12 s | pipelining: the next van departs every `max(0.35, 12/N)` s; each trip stays 0.6–1.2 s; at most 4 vans on the road; beyond 30 houses, houses with no seller are grouped into one "N stayed home" beat |
| Payday | 2.0 s | 2.5 s | per-player salary beats overlap 50% |
| Marketing | 0.8 s per campaign | 8 s | campaigns overlap once there are more than 10; tokens still land one house at a time |
| Cleanup | 1.2 s | 1.5 s | — |
| Milestones / bank break | 0.8 s | 1.0 s | — |
| Game over | 4 s, then idle loop | — | — |

Sequencing vs overlapping:
- **Sequential** between focal steps of the same kind (house after house, campaign after campaign) so the caption always matches what moves.
- **Overlapping** for tails: coins, puffs, the van's drive home, pip ticks and chip fades run in the background while the next focal step starts. A focal step may start when the previous one reaches its *landing* (van at the house, token on the stack), not its end.
- **Parallel** for things that are simultaneous in the rules: structures revealed, salaries, the tokens of one campaign dropping on several houses (80 ms stagger so they still read as separate).

### 1.4 Speed controls

- Keep the existing `animationSpeed` cycle (`ui/BoardControls.tsx`, `SPEEDS`) at 1× / 2× / 4× and the Skip button (`skipAnimations`). Speed scales the timeline clock; Skip calls `finish()` (jump to the end states, remove transient actors, show the closing caption).
- Add a per-device remembered setting: speed persists in `settings`.
- Add **Watch again** to the Summary strip (`ui/Summary.tsx`) for Dinnertime and Marketing: replays the batch's timeline from the stored events at the chosen speed, and **Play from here** on the stepper (plays from the selected house or campaign). Replays build all their actors themselves (ghost tokens, vehicles), so they work after the view has moved on (§4.2 "masking").
- Auto-skip: a batch older than 20 s of wall-clock at 1× (tab was hidden, reconnect) is finished without playing; the closing caption still shows.

### 1.5 Reduced motion

`prefers-reduced-motion` or speed 0 compiles the timeline in **reduced** mode:
- No travel, no drops, no scaling pops. Actors appear in place with a 120 ms cross-fade (fades are fine; motion is not).
- Route ribbons draw statically for the duration of their step and the captions and chips are kept; the Summary stepper remains the way to review.
- Per-step hold time is kept (0.6 s per house) so captions are still readable; Skip still works.

### 1.6 Camera

- Default: **do not move the player's camera**. Animations play where they are. If a step's focal actors are entirely off-screen, show a small edge arrow in the chain colour on the board rim pointing to them (nice).
- Setting **Follow the action** (off by default, both desktop and phone): during automatic phases (Dinnertime, Marketing, Setup build, Game over) the camera glides with `cam.focusRect` to the step's actors (restaurant + house, campaign + reached houses), only if the player has not touched the camera in the last 5 s (`CameraController` gets a `lastUserInput` stamp). It never follows during a player's own working turn.
- The Summary stepper keeps framing on click (user-initiated), as today.
- Game over: a slow orbit around the winner's restaurants is allowed because there is nothing left to do; any input stops it.

### 1.7 Online play

- The scene is always the final state: `rec.sync` applies the view before the timeline starts, as now. Animations are a layer of transient actors; nothing waits on them. Input, prompts and the engine never block on animation.
- Every client compiles the same events against the same previous view, so every player sees the same thing (speed and skip are local).
- Arrival of a new batch while a timeline runs:
  - same phase and under 3 s left: queue it behind (queue depth 2 max);
  - otherwise `finish()` the running timeline (jump to end, clean up actors) and start the new one;
  - the animation layer is never more than ~4 s behind the real state.
- Hot-seat handoff, reconnect, snapshot (`events` empty): `finish()` then nothing plays; the closing caption from the last batch is kept.
- Bots in a Web Worker produce the same batches as humans. Hot-seat bots (`LocalTransport`, option `boardBusy`) hold each move while the canvas reports `data-anim="playing"`, up to 4 s, so a Dinnertime or Marketing timeline plays out instead of being cut by the bot's instant answer (M176). Online bots keep the server's pacing.

---

## 2. Event → animation catalogue

Columns: event and the data used; what moves; duration at 1×; overlap (S = sequential focal step, T = background tail, P = parallel group, U = UI-layer motion in Preact, not Three); engine data missing; importance (must / should / nice). "prevView" means the view before the batch (`Animator.prevView`), already available.

### 2.1 Flow

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `gameStarted` (players, turnOrder) | Board build: map tiles drop in from +1.5 y in reading order with a dust puff on landing, roads and houses fade in behind. Player rail panels slide in (U). | 2.5 s | S | — | should |
| `roundStarted` (round) | Round banner (U) slides across the top bar. Board: none. | 0.8 s | U | — | should |
| `phaseChanged` (from, to) | Phase banner (U). Board: Dinnertime warms the hemisphere light 10% toward orange and restaurant signs switch to glow for the phase; Marketing restores it. Cross-fade 0.5 s. | 0.5 s | T | — | nice |
| `turnStarted` (player) | The player's restaurants get a 0.4 s ring pulse in their colour; the rail panel lifts (U). | 0.4 s | T | — | should |
| `workStageChanged` (stage) | Stage tabs tick (U). | 0.2 s | U | — | nice |
| `turnEnded` | Rail panel settles (U). | 0.2 s | U | — | nice |
| `turnOrderSet` (turnOrder) | Order-of-business chips reorder with a FLIP move (U). | 0.6 s | U | — | should |
| `choicePending` / `choiceResolved` | Prompt panel slides in / out (U). | 0.25 s | U | — | must (exists) |

### 2.2 Setup

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `setupPassed` (player) | "Pass" stamp on the rail panel (U). | 0.3 s | U | — | nice |
| `reserveChosen` (player, card?) | A face-down card slides from the hand into the reserve slot (U); other viewers see a face-down card only. | 0.5 s | U | — | should |
| `restaurantPlaced` (x, y, entrance, comingSoon) | The restaurant drops from +1.2 y with `outBack`, dust puff on landing; if `comingSoon` the scaffold drops first and the translucent sign pops a beat later. Entrance corner flashes a short arrow on the road (0.4 s). | 0.6 s | S | — | must |

### 2.3 Restructuring and order of business

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `structureSubmitted` (player, structure?) | "Submitted" chip on the player's rail (U); own chart gets a lock icon. | 0.3 s | U | — | should |
| `structureRetracted` | Chip pops off (U). | 0.2 s | U | — | nice |
| `structuresRevealed` (structures) | Every org chart flips face up at once (U, 3D flip 0.5 s, 60 ms stagger per player). Board: each player's restaurants pulse once in order. | 1.2 s | P | — | must |
| `structurePenalty` (player) | Cards fly from the chart to the beach panel one by one (U, 60 ms stagger); the chart shakes first. | 1.0 s | U | — | should |
| `orderChosen` (player, position) | Player chip slides into the chosen order slot (U). | 0.4 s | U | — | should |

### 2.4 Employees (UI layer; `OrgChart`, `EmployeeMarket`, beach)

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `employeeHired` (uid, employeeId, by) | Card lifts from the market stack, flies (FLIP) to the recruiter's slot in the org chart, lands with overshoot; the recruiting card (`by`) nods. Other players' charts: the card lands in their rail count with a "+1" chip. | 0.6 s | U | — | must |
| `employeeGained` (reason) | Card drops into the chart from above with a milestone ribbon flash. | 0.5 s | U | — | should |
| `employeeTrained` (uid, from, to, by[], steps) | Card flips once per step (`steps`) revealing the next card, the trainer(s) nod. | 0.4 s + 0.2 s per step | U | — | must |
| `employeeFired` (uid, forced) | Card slides to the beach; `forced` adds a short shake before it goes. | 0.5 s | U | — | must |
| `cardSkipped` | Card dims with a "skipped" chip. | 0.2 s | U | — | nice |
| `cardsReturned` (player) | Used cards flip back and slide to the pool (U). | 0.5 s | U | — | nice |
| `marketeerReturned` (uid) | Board: the campaign's marketeer chip detaches and flies toward the player's rail edge; UI: card returns to the chart. | 0.6 s | T | campaign id of the chip (client: find the campaign whose `marketeer === uid` in prevView; fine) | should |

### 2.5 Goods (working phase)

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `foodProduced` (player, uid, food, count) | Every open restaurant of the player puffs steam from the roof vent (3 balls, 0.5 s); `count` tokens of `food` pop up out of the first restaurant's roof in a short fountain and fly to the rail panel edge (U counter bounces on arrival). Kimchi / sushi / noodles use their token shapes. `uid === null` (night shift at cleanup) adds a moon chip over the restaurant. | 0.9 s | S | — | must |
| `drinksBought` errand boy (`path: []`, `collected[].sourceId === null`) | A scooter with a crate leaves the restaurant entrance, drives to the nearest road end of the tile and back (0.7 s), crate hops into the restaurant, "+N drink" chip. | 0.9 s | S | `route` (see below) to know the restaurant / coffee shop it starts from | must |
| `drinksBought` cart / truck (road) | Cart or truck spawns at the start corner, follows `path` (§4.3). At each collected source it stops 0.25 s, a crate of that drink hops from the source into the bed and a "+N" chip pops (existing chip style). After the last source the vehicle slows and fades out over 0.3 s; one crate per drink type flies to the player's rail. | 0.5 s + 0.3 s per unit of path (0.9–1.6 s) | S | **Must add**: `drinksBought.route: BuyRoute` (the action's `{ mode, from, path | tiles }`). Today `path` has no start (`from: RouteStart`) and `air` routes have no `tiles`. Keep `path` for log compatibility. | must |
| `drinksBought` zeppelin (air) | The zeppelin rises from the start restaurant to y 2.2, glides tile centre to tile centre over `tiles` (catmull-rom), crates float up from each collected source into the gondola, then it drifts off the board edge and fades. | 1.2–1.8 s | S | as above (`tiles`) | must |
| `drinksBought` from a milestone (`path: []`, `collected[].sourceId === null`, Ketchup `newMilestones.ts`) | Crate drops onto the restaurant roof with a ribbon chip. | 0.5 s | T | `reason` on the event would be cleaner; client can infer from `uid` not being a buyer card | nice |
| `foodDiscarded` (goods) | Cleanup: tokens slide from the rail into a bin and shrink (U); board: each open restaurant gets a small bin-lid puff. | 0.8 s | P | — | should |
| `foodFrozen` (goods) | Tokens get a frost tint and slide to the freezer well (U); board: none. | 0.5 s | U | — | should |

### 2.6 Board pieces

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `restaurantMoved` (restaurantId, x, y, entrance) | The restaurant lifts 0.6 y (shadow blob shrinks), slides to the new spot in an arc, drops with `outBack` and a dust puff; the old spot shows a fading footprint for 0.6 s. | 0.9 s | S | `from: { x, y, entrance }` (nice; client has prevView) | must |
| `restaurantOpened` (restaurantId) | Scaffold pieces fall away (4 posts, 60 ms stagger), the sign switches from translucent to glow, 6 confetti quads burst over the sign. | 0.8 s | S | — | must |
| `driveInsOpened` (restaurantIds) | Arrow markers pop in at each corner with `outBack`, one corner at a time (clockwise), each restaurant in turn. | 0.5 s each | S | — | should |
| `houseBuilt` (houseId, cells, garden) | Dust puff, the house scales up from y 0 (0.4 s), roof lands last with overshoot, number plaque pops, then the garden hedge grows (0.3 s). | 0.8 s | S | — | must |
| `gardenAdded` (houseId, cells) | Hedge grows along its outline, two tree tops pop, a "×2" price badge flips in over the house. | 0.6 s | S | — | must |
| `campaignPlaced` (campaign) | Billboard: posts rise, board drops onto them, face flashes the good. Mailbox: pops with the flag raising. Airplane: flies in from off-board along its side to its hover spot (1.0 s). Radio: mast rises, one ring pulse. Giant billboard / gourmet guide: like billboard, larger, 0.8 s. The reach rings flash once (existing `reachFlash`) so the player sees what it will hit. | 0.6–1.0 s | S | — | must |
| `entityPlaced` (entity) | `coffeeShop`: pop with steam puff. `park`: lawn fades in, trees pop one by one, bench last. `lobbyistRoad` under construction: cones and barriers pop in a row along `cells`; completed: barriers shrink away and asphalt fades in (0.5 s). `roadworks`: single cone drops. `freeway`: ramp slides in from the board edge (0.8 s). | 0.5–0.8 s | S | — | must |
| `entityRemoved` (entityId) | Roadworks cone shrinks with a puff; lobbyist road under-construction pieces pack away; others fade. | 0.4 s | T | `kind` (nice; client uses prevView) | should |
| `mapTileAdded` (row, col, rotation) | New tile slides in from the nearest board edge at y 0.4, drops with a thud and a dust line along the seam; houses and roads on it fade in; the rim extends. The camera does not move; the edge arrow (§1.6) points at it if off-screen. | 1.2 s | S | — | must |

### 2.7 Dinnertime

Ordering the sequencer relies on, per house: `houseConsidered` → (`coffeeSold`)* → `sale` or `houseStayedHome` → `cashChanged`. The engine emits it this way today (`rules/dinnertime.ts`); add an engine test that pins it.

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `houseConsidered` (houseId, candidates, offers) | The house gets a `focus` ring and its plaque lifts 0.1; a score chip ("$9 + 1") pops over every competing restaurant from `offers` (existing chip art), chains that cannot supply greyed. Chips stay until the house resolves, then the winner's ticks and the rest fade. | 0.3 s | S (opens the house beat) | — | must |
| `sale` (houseId, restaurantId, lines, total, candidates, distance) | The focal step. The chain's **delivery van** spawns at the restaurant's entrance corner, carrying the sold goods as tokens on its roof (max 4 visible, "×N" label beyond), drives the road path to the road square next to the house (§4.3). On arrival: tokens hop one by one from the roof onto the house (80 ms stagger) while the matching ghost demand tokens pop off the plaque and vanish; a "+$total" chip floats up from the house; `bonuses` add a second smaller chip per bonus (fry chef, first burger). The van turns and drives home at 1.5× speed as a tail; coins burst over the restaurant when it arrives (existing coin puff). Caption as today. | 0.6–1.2 s trip + 0.3 s drop; tail 0.6 s | S + T | **Should add**: `sale.route?: { from: RouteStart; path: Cell[] }` (the engine's shortest path; `rules/dinnertime.ts` via `map/pathfinding.ts`). Client fallback `dinnerRoute()` in `overlays/feedback.ts` exists and is used until then. **Must add for Ketchup rural**: `sale.route.exit?: { cell: Cell; side: Direction }` (van leaves the board there; `dinnerRoute` returns null for rural). | must |
| `houseStayedHome` (houseId) | House windows dim (emissive off), a grey "no seller" chip pops (existing, persistent), a small "?" bobs once. When `offers` is non-empty but none `canSupply`, the chips over those restaurants show "no stock" and shake once. | 0.5 s | S | — | must |
| `coffeeSold` (houseId, player, at, amount) | A coffee cup token hops from the coffee shop / restaurant `at` to the house in an arc (it is "on the way", so it plays before the van arrives), "+$amount" chip in the chain colour. | 0.5 s | S (inside the house beat) | — | must (Ketchup) |
| `tipsPaid` (player, waitresses, amount) | A waitress chip and coins puff over each of the player's open restaurants, "+$amount" caption line. | 0.6 s | P | — | should |
| `cfoBonus` (player, amount) | "+N%" roll on the player's cash (U). | 0.4 s | U | — | should |
| `bankBroke` (breakNo, added, ceoSlots, basePrice) | Bank counter cracks and shakes (U), a "Bank break N" banner, reserve cards flip (U) when `reserves` is present; board: every restaurant sign flickers once. | 1.0 s | S | — | must |
| `iouIssued` (player, amount) | IOU chip slides onto the player's rail with a red flash (U). | 0.4 s | U | — | should |
| `bankrupt` (player) | The player's restaurants go derelict: the sign tips and falls (0.6 s), awnings grey out (the reconciler already swaps the mini; animate on the old object before the swap), rail panel greys (U). | 0.8 s | S | — | should |

### 2.8 Payday

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `salaryPaid` (player, gross, discounts, paid, tokens?) | Coins run from the player's cash to each paid card in the org chart (U, 40 ms stagger); `discounts` show as struck-through chips on the discounted cards; `tokens` (paying with food) show the tokens sliding out instead of coins. Board: one coin per open restaurant drops into the ground (tail). | 1.2 s | P (players overlap 50%) | — | must |
| `bankBurned` (player, amount) | Coins drift from the cash to a small fire chip (U). | 0.5 s | U | — | nice |
| `employeeFired` forced (see 2.4) | Card to the beach with a shake. | 0.5 s | U | — | must |

### 2.9 Marketing

Per campaign the beat is: campaign pulse → carrier travels / radiates → tokens land → pip tick. The carrier depends on the kind.

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `campaignRan` (campaignId, pass) + its `demandPlaced`s | **Billboard / giant billboard / gourmet guide**: the face flashes the good, a token spawns on the board and flies in an arc to each reached house (80 ms stagger). **Mailbox**: flag flips up, an envelope pops out per house and flies to it; on arrival it flips into the token. **Airplane**: the plane leaves its hover spot, sweeps across its band at y 2.5 (1.0 s), drops a leaflet over each house as it passes; leaflets flutter down (0.4 s) and become tokens. **Radio**: three rings expand from the mast (0.9 s); when the ring front crosses a house the token drops. Houses in reach that took nothing show the grey "full" chip (existing). Caption as today. | 0.8 s; airplane 1.3 s | S | **Should add**: `campaignRan.reached: HouseId[]`, `full: HouseId[]` so the reach does not depend on prevView and late-joiners / replays agree. | must |
| `demandPlaced` (campaignId, houseId, tokens) | Token landing: drops from 1.6 y with `outBack` onto the stack (existing), plaque cell count ticks. `campaignId === null` (module sources): the token drops from above with a generic sparkle, no carrier. | 0.3 s | P inside the campaign beat | `source` label when `campaignId` is null (nice) | must |
| `marketingIncome` (player, campaignId, amount) | Coins puff over the campaign piece, "+$amount" chip in the chain colour. | 0.5 s | T | — | should |
| `campaignTicked` (campaignId, remaining) | Pip lifts off and fades with the count (existing). | 0.5 s | T | — | should (exists) |
| `campaignExpired` (campaignId, kind, marketeer) | The piece shrinks to the ground with a dust puff; airplane flies off the board edge instead; radio mast telescopes down. If `marketeer` is set, the chip flies toward the owner's rail (see `marketeerReturned`). Position from `campaignInfo` memo (`state/feedback.ts`). | 0.6 s | T | — | must |

### 2.10 Milestones, money, end

| Event | What moves | 1× | Overlap | Missing data | Imp. |
|---|---|---|---|---|---|
| `milestoneClaimed` (player, milestoneId) | Milestone card stamps with a ribbon and slides to the player's rail (U). Board: the player's restaurant signs sparkle once (4 sparks, `sparkGeo`). | 0.8 s | S | — | should |
| `milestonesRemoved` (milestoneIds) | Cards fade and shrink (U). | 0.4 s | U | — | nice |
| `cashChanged` (player, delta, reason, bank) | Cash numeral rolls to the new value (U) and a "+/-$delta" float in ok / danger colour; the roll starts when the matching board step lands (sale: when the van arrives; salary: on the coin run) via a `cashPulse` signal from the timeline, else at once. Bank total rolls likewise. | 0.4 s | U | — | must |
| `gameEnded` (ranking, cash) | Winner's restaurants get confetti (12 quads) and sign glow; ranking panel (U) slides in with cash counters rolling; slow camera orbit (§1.6). | 4 s then idle loop | S | — | should |

### 2.11 Ketchup module summary

| Module | Covered by | Notes |
|---|---|---|
| Coffee (coffee shops, baristas) | `entityPlaced coffeeShop`, `coffeeSold`, `drinksBought` from a coffee shop start | Cart may start at a coffee shop (`RouteStart.kind === 'coffeeShop'`); the pool needs a vehicle spawn at a 1×1 piece |
| Lobbyists (roads, roadworks, new tiles, freeway) | `entityPlaced lobbyistRoad / roadworks / freeway`, `entityRemoved`, `mapTileAdded` | Under-construction roads are not drivable (`dinnerRoute` skips them); path following uses the same rule |
| Rural marketeers (rural area) | `sale` to a rural house, `entityPlaced` (rural campaign) | Van drives to the exit cell, off the board edge and to the rural mini at `ruralCenter`; needs `sale.route.exit` |
| New districts | `mapTileAdded` | — |
| Kimchi / sushi / noodles | `foodProduced`, `sale.lines` | token shapes exist (`tokens.ts`) |
| Night shift | `foodProduced` with `uid === null` at cleanup | moon chip |
| Fry chefs | `sale.bonuses` (`ketchup:fry_chef`) | extra small chip |
| Movie stars / mass marketeers / gourmet critics | `employeeGained`, giant billboard / gourmet guide kinds | — |
| Reserve prices, hard choices, six players | `bankBroke.reserves`, `structurePenalty`, player colour 5 | UI only |
| New milestones | `milestoneClaimed`, extra `drinksBought`, `employeeGained` | — |

---

## 3. Asset list

All built procedurally with `three/minis/kit.ts` (`box`, `cyl`, `puck`, `cone`, `lathe`, `Shape`, `miniGeo` cache, `mats()`), flat shaded, no textures except the chain-mark decal (`labels.ts` sign textures) and the good glyphs. Tri budgets follow visual-style (50–400). Chain colour via `playerPalette`. Every vehicle gets a `blob` shadow and a `name = 'body'` group so the follower rotates the body, not the shadow.

| Asset | Spec (world units) | Tris | Used by |
|---|---|---|---|
| Delivery van (per chain) | Body `box(0.5, 0.26, 0.3)` in chain base, cab `box(0.18, 0.2, 0.3)` in chain light with a dark window band, roof rack where tokens ride, 4 wheel `puck(0.06, 0.05)` in ink, headlight pucks in `surface`, chain mark decal on both sides. Nose at +x. | ~140 | `sale` |
| Scooter + errand boy | Two wheels, a `lathe` seat and leg shield in chain colour, a crate box on the back, rider: capsule torso + ball head + cap in chain dark. | ~110 | `drinksBought` errand |
| Hand cart + cart operator | Cart bed `box(0.34, 0.1, 0.26)` on two large wheels, handle at -x, crates stack on the bed; operator figure (capsule + head + cap) walks behind, bobbing 0.02 at 6 Hz while moving. | ~150 | `drinksBought` cart |
| Truck | Cab `box(0.2, 0.28, 0.3)` + flatbed `box(0.4, 0.08, 0.3)` with low rails, 6 wheels, chain stripe. | ~160 | `drinksBought` truck |
| Zeppelin | Envelope `lathe` ellipsoid 0.9 long × 0.34, two fins, gondola `box(0.22, 0.1, 0.12)` below, chain colour stripe. Flies at y 2.2, tilts 6° into turns. | ~220 | `drinksBought` air |
| Airplane | Existing `buildAirplane` (`marketing.ts`); add a `leaflet` spawn point under the fuselage. Flies at y 2.5. | existing | `campaignRan airplane`, `campaignPlaced`, `campaignExpired` |
| Crate (per drink) | `box(0.18, 0.14, 0.18)` with the drink's colour and a glyph decal; beer: barrel `cyl`. | ~40 | drinks pickups |
| Envelope | `box(0.2, 0.02, 0.14)` in `surface` with an ink flap line. | 12 | mailbox |
| Leaflet | Single quad 0.16 × 0.22, `surface`, flutters with a sine on x rotation. | 2 | airplane |
| Steam / dust puff | 3–4 `ball(0.08–0.14, 0)` in `surface` (steam) or `lot` (dust), scale up and fade over 0.5 s. | ~60 | production, landings |
| Coin, spark | Existing `coinGeo`, `sparkGeo`. | existing | money, milestones |
| Confetti | 6–12 quads 0.06 × 0.1 in player base / light / `accent`, tumble and fall. | 2 each | open, game over |
| Score / result chips | Existing `makeChip`, `makeCount`. | existing | dinnertime, marketing |
| Ghost demand token | Existing `buildToken`, 70% opacity. | existing | masking (§4.2) |
| Scaffold | Existing coming-soon frame, split into 4 posts + 2 bars so they can fall individually. | existing | `restaurantOpened` |

### 3.1 Following roads

- Lane: roads are 0.78 wide (`overlays/routes.ts` `HIT_W`); vehicles are ≤ 0.34 wide and drive on the right of the travel direction with a lane offset of 0.17, so a van going home can pass the next one leaving.
- Height: body base at `ROAD_TOP + 0.02` (0.05); shadow blob at `ROAD_TOP + 0.005`. Air lane y 2.2 (zeppelin), 2.5 (airplane).
- Corners: the follower rounds every 90° turn with a circular arc of radius 0.32 (4 sampled points) so vehicles swing rather than snap; the body yaw follows the tangent with a 0.08 s lag for a little weight.
- Lead-in / lead-out: trips start at the spawn point (restaurant entrance corner, coffee shop centre, source square) and join the road polyline at the edge midpoint `routePolyline` already prepends; at the house the van stops on the road square next to it, nose toward the house.
- Under-construction lobbyist roads and roadworks squares are never on an engine path; the follower trusts the path it is given.
- Rural: the exit cell's outer edge midpoint, then a straight 2-unit run off-board to the rural mini.

---

## 4. Technical design

### 4.1 Timeline (replaces `BUDGET`/`STEP` in `animate.ts`)

New folder `packages/client/src/three/anim/`.

```ts
// anim/timeline.ts
export interface Clip {
  /** Absolute start in timeline seconds (at 1×). */
  start: number;
  dur: number;
  ease?: Ease;
  /** k eased 0..1, raw 0..1. Called once with raw = 1 on finish/skip. */
  update?: (k: number, raw: number) => void;
  onStart?: () => void;
  onEnd?: () => void;        // also called by finish(); must be idempotent
  lane?: 'focal' | 'tail';   // tails may outlive the next focal step
}
export class Timeline {
  constructor(private readonly tweens: Tweens, readonly label: string) {}
  add(clip: Clip): this;
  /** Build helpers return the end time so callers chain: t = seq(t, ...). */
  seq(at: number, ...clips: Omit<Clip, 'start'>[]): number;
  par(at: number, ...clips: Omit<Clip, 'start'>[]): number;
  stagger(at: number, gap: number, clips: Omit<Clip, 'start'>[]): number;
  get length(): number;      // last end
  play(): Promise<void>;     // resolves when every clip ended (or finish())
  finish(): void;            // jump all clips to raw = 1, call onEnd, release actors
  readonly active: boolean;
}
```

Timeline sits on `Tweens` (one tween per clip, group = the timeline label), so speed scaling, finishing and the on-demand render loop keep working unchanged. `Tweens` gets one addition: `now` (sum of scaled dt) so compile-time absolute starts map onto tween delays.

Compile (pure, no Three):

```ts
// anim/compile.ts
export interface Beat {               // one readable moment
  kind: 'sale' | 'stayedHome' | 'campaign' | 'drinks' | 'produce' | 'place' | ...;
  focal: string[];                   // board ids for the edge arrow / follow camera
  nominal: number;                   // seconds at 1× before compression
  events: GameEvent[];               // the events this beat covers
}
export interface Plan { phase: PhaseKind | null; beats: Beat[]; gap: number; mode: 'full' | 'reduced'; closing?: PhaseCaption }
export function compile(events: readonly GameEvent[], ctx: { view: GameView; prevView: GameView | null; me: PlayerId | null; mode: 'full' | 'reduced' }): Plan;
```

`compile` groups events into beats (a house beat = `houseConsidered` + `coffeeSold`* + `sale`/`houseStayedHome` + `cashChanged`), applies the pacing table (§1.3: per-phase caps → `gap` between focal starts, pipelining depth), and is unit-tested with real engine fixtures (`packages/client/test/`). Choreographies turn beats into clips:

```ts
// anim/choreo.ts
export type Choreography = (beat: Beat, at: number, tl: Timeline, ctx: ChoreoCtx) => number; // returns landing time
export const registry = new Map<Beat['kind'], Choreography>();
```

`ChoreoCtx` carries `stage`, `rec`, `feedback`, `pool`, `paths` (route lookup), `caption`, `follow` (camera hook), `tier`. `Animator.play` becomes: `finishOrQueue()` → `compile()` → for each beat `registry.get(kind)(beat, t, tl, ctx)`, where the next focal start is `max(landing of previous, previous start + gap)` → `tl.play()`.

### 4.2 Masking (holding the old state until its beat)

The scene already shows the final state. Each choreography that consumes something draws a transient ghost of the pre-state and hides the real piece's changed part until its beat lands:
- Sales: `rec.sync` returns `prevDemand`; the compile step also gets `prevView`. For each sold house, ghost tokens (70% opacity) are placed at the stack slots that disappeared; they pop off when the van's tokens land. The plaque cell counts update at the landing too (`feedback` sets a `pendingPlaque` map the reconciler respects, same mechanism as today's hidden fresh tokens in `dropDemand`).
- Marketing: fresh tokens are hidden until they land (existing).
- Moves / removals: the reconciler keeps a removed piece's object for one batch (`rec.sync(view, animate)` returns `removed` keys and keeps their `Placed` in a `graveyard` map for the choreography to animate out, then disposes).

Replays (`Watch again`) run the same choreographies with `prevView` set to the stored pre-batch view and the real pieces left alone: ghost tokens are drawn from the diff and vehicles are transient anyway.

### 4.3 Path follower

```ts
// anim/path.ts
export interface Follow { length: number; at(s: number): { x: number; z: number; yaw: number } }
export function roadPath(pts: readonly [number, number][], opts?: { lane?: number; corner?: number }): Follow;
export function airPath(pts: readonly [number, number][], y: number): Follow;   // catmull-rom
export function tripDuration(length: number): number;  // clamp(0.45, 0.25 + length / 4.5, 1.4) at 1×
```

`roadPath` offsets each segment to the right by `lane`, joins consecutive offsets with a `corner`-radius arc, then builds an arc-length table (sample every 0.05) so `at(s)` is a binary search + lerp. The clip's `update(k)` calls `at(k * length)` with an ease-in-out on k (0.15 s accelerate, 0.2 s brake) and sets body yaw to the tangent. Vehicles that stop en route (cart pickups) get a piecewise profile: the choreography splits the path at each source's nearest `s` and inserts a 0.25 s hold clip.

Route sources: `sale.route` / `dinnerRoute()` fallback; `drinksBought.route`; `routePolyline()` from `overlays/routes.ts` for the world polyline.

### 4.4 Plugging in

- `state/boardBridge.ts`: unchanged contract. `setView(view, me, events)` still reaches `Animator.play`. `Animator` keeps `prevView`.
- `three/index.ts`: `anim.play(events, res)` gets `res.removed` too; `window.__fcmBoard.internals.timeline` exposes `{ active, finish(), length }`; the canvas carries `data-anim="playing" | "idle"` for e2e waits.
- `state/interaction.ts`: `animationSpeed`, `skipAnimations` as today; new `followAction` setting; new `cashPulse` signal (`{ player, delta }`) the UI counters listen to.
- `state/feedback.ts`: new `replayRequest` signal `{ events, prevView, fromStep? }` written by `ui/Summary.tsx` ("Watch again" / "Play from here"), read by the Animator. The Summary strip's stepper is unchanged; while a replay plays, the stepper follows the current beat (`currentBeat` signal) and clicking a step stops the replay.
- Queue policy (§1.7) lives in `Animator`: `pending: Plan[]` max 2.

### 4.5 Determinism and tests

- `compile` is pure and timing-free: unit tests assert beat order, gap and total length for the `dinnertime` and marketing fixtures (`FIXTURES`, as `test/feedback.test.ts` does), the reduced-mode plan, the 30-house grouping and the queue policy.
- `Timeline` is driven by `Tweens.tick(dt)` with a manual clock in tests (no `requestAnimationFrame`); a fake `Stage` with a real `Tweens` is enough to check clip ordering, `finish()` idempotence and that every actor returns to the pool.
- `roadPath` tests: length of an L-shaped path with a corner, lane side, `at(0)` / `at(length)` endpoints, yaw at a corner.
- e2e (`e2e/*.spec.ts`): keep running with `animationSpeed` 4× and wait on `data-anim="idle"` before asserting; one spec screenshots a dinnertime mid-trip at 1× with the timeline paused (`internals.timeline.pause()` test-only) for a visual check of the van on the road.
- Playground: `dev/playground.ts` gets Drinks (cart / truck / zeppelin / errand), Vehicles (all minis in a row), Build (tile + house + campaign placements) and a speed select; this is how the choreographies are reviewed.

### 4.6 Performance (phones) and pooling

- Actors are instanced through `stage.inst.proxy` like the coins today, so moving them costs a matrix update, not a draw call.
- `anim/pool.ts`: `ActorPool.get(kind, color): Object3D` / `release(obj)`. Vans are pre-warmed two per player colour when the scene mounts (a few hundred tris each); other vehicles build on first use through the `miniGeo` cache; pooled actors are hidden, not disposed. `releaseTree` is only for one-off actors (puffs, chips).
- Caps per tier (`stage.tier`): high: 4 vehicles, 12 confetti, 6 token flights per beat; medium: 3 / 8 / 4; low: 2 vehicles, no confetti, 3 token flights, no vehicle shadows. Token flights beyond the cap collapse into one token with a "×N" label.
- The render loop stays on-demand: a running timeline keeps `tweens.active` true; an idle board renders nothing.
- Per-frame cost: ≤ 6 `at(s)` lookups (binary search) and ≤ 40 small object updates; no allocations inside `update` (vectors reused).
- Memory: one geometry per vehicle kind per colour (≤ 6 colours × 5 kinds), shared materials.

---

## Interfaces (frozen)

Fixed by WP-A in `packages/client/src/three/anim/`. B, C and D build against these; changes go through WP-A. Source files carry the full doc comments.

### Timeline (`anim/timeline.ts`)

```ts
interface Clip {
  start: number; dur: number;              // seconds at 1×, absolute
  ease?: Ease;                             // default linear
  update?: (k: number, raw: number) => void; // every frame; once with raw = 1 at the end / finish()
  onStart?: () => void; onEnd?: () => void;  // once each; onEnd also on finish()
  lane?: 'focal' | 'tail';                 // default focal; tails may outlive the next focal step
}
type ClipSpec = Omit<Clip, 'start'>;
class Timeline {
  constructor(tweens: Tweens, label: string);
  add(clip: Clip): this;
  seq(at, ...clips: ClipSpec[]): number;   // returns end time
  par(at, ...clips: ClipSpec[]): number;
  stagger(at, gap, clips: ClipSpec[]): number;
  call(at, fn, lane?): this;               // zero-length clip (fires on finish too)
  own(cleanup: () => void): this;          // runs once when the timeline ends or finishes
  readonly length: number; readonly focalEnd: number; readonly time: number; readonly remaining: number;
  readonly active: boolean; readonly done: boolean;
  play(): Promise<void>; finish(): void;   // finish() idempotent: every clip to raw = 1, cleanup, resolve
  pause(): void; resume(): void;           // test hooks
}
```

One driver tween per timeline on `stage.tweens` (unique group), so speed, `finish()` and the on-demand render loop work unchanged. `Tweens.now` is the scaled clock. Add clips before `play()`. A throwing callback is logged and dropped.

### Plan and beats (`anim/compile.ts`)

```ts
type BeatKind = 'sale' | 'stayedHome' | 'stayedHomeGroup' | 'tips' | 'bankBroke' | 'bankrupt'
  | 'campaign' | 'demand' | 'campaignExpired' | 'drinks' | 'produce' | 'discard'
  | 'restaurantPlaced' | 'restaurantMoved' | 'restaurantOpened' | 'driveIns' | 'houseBuilt' | 'gardenAdded'
  | 'campaignPlaced' | 'entityPlaced' | 'entityRemoved' | 'mapTile'
  | 'salary' | 'milestone' | 'turn' | 'phase' | 'gameStarted' | 'gameEnded' | 'pop';
type Segment = 'dinnertime' | 'marketing' | 'payday' | 'other';
interface Beat {
  kind: BeatKind;
  id: string;          // house id, campaign id, piece key, or `${kind}:${n}`
  focal: string[];     // board ids (edge arrow, follow camera, stepper)
  keys: string[];      // reconciler keys the beat reveals (pop-ins)
  events: GameEvent[]; // engine order
  nominal: number;     // s at 1× before compression
  at: number;          // planned start, s at 1×
  dur: number;         // budget: focal motion lands by at + dur
  segment: Segment;
}
interface Plan {
  phase: PhaseKind | null; mode: 'full' | 'reduced'; beats: Beat[];
  gap: number;         // focal gap of the main segment (dinner houses / campaigns)
  length: number;      // last at + dur
  segments: { segment: Segment; start: number; end: number; gap: number }[];
  closing: ClosingCaption | null; // 'done' PhaseCaption without key
}
function compile(events, ctx: { view; prevView; me?; mode: 'full' | 'reduced'; added?: string[]; kinds?: ReadonlySet<BeatKind> }): Plan;
const PACING: { dinnerCap: 12; dinnerMinGap: 0.35; maxVans: 4; groupAbove: 30; marketingCap: 8; paydayCap: 2.5; workingCap: 1.6; cleanupCap: 1.5; otherCap: 2.5; minReadable: 0.45; reducedHold: 0.6; reducedOther: 0.3 };
```

Pure and deterministic. `kinds` keeps only beats with a registered choreography (no dead time). Grouping: a house beat is `houseConsidered` → `sale` | `houseStayedHome` plus the `coffeeSold`, `cashChanged`, `iouIssued`, `milestoneClaimed` that follow. **The engine emits coffee after the sale** (houseConsidered → sale → (coffeeSold → cashChanged)* → cashChanged), not before as §2.7 assumed; the engine test pins this order. A campaign beat is `campaignRan` plus its `demandPlaced`, `marketingIncome`, `campaignTicked` / `campaignExpired`, `marketeerReturned`, `cashChanged`.

### Choreographies (`anim/choreo.ts`)

```ts
type Choreography = (beat: Beat, at: number, tl: Timeline, ctx: ChoreoCtx) => number; // returns landing time
const registry: Map<BeatKind, Choreography>;
function registerChoreo(kinds: BeatKind | BeatKind[], fn: Choreography): void; // later call replaces
function beatEvent(beat, type) / beatEvents(beat, type);
function followClip(actor, follow: Follow, dur, opts?: { from?; to?; ease?; lane?; hideAtEnd? }): ClipSpec; // root position + lagged body yaw
interface ChoreoCtx {
  stage; rec; feedback: FeedbackLayer; pool: ActorPool;
  view: GameView | null; prevView: GameView | null; me: PlayerId | null;
  mode: 'full' | 'reduced'; tier: Tier; plan: Plan;
  added: ReadonlySet<string>; removed: ReadonlySet<string>; prevDemand: ReadonlyMap<string, number>;
  paths: RouteLookup;
  caps: { vehicles: number; confetti: number; flights: number; shadows: boolean };
  color(player): string;
  caption(tl, at, caption): void;         // phaseCaption at timeline time
  follow(tl, at, ids): void;              // camera hook (no-op for now)
  actor(tl, kind, color?, variant?): Object3D; // pooled, hidden until shown, released at the end
  mount(tl, obj): void;                   // transient overlay object, disposed at the end
  ghostDemand(tl, houseId): GhostStack | null; // pre-batch demand stack, mounted now; popAt(t)
}
interface RouteLookup {
  sale(e): SaleTrip | null;   // { pts, follow, back, house, offBoard }  (sale.route, else dinnerRoute fallback)
  buy(e): BuyTrip | null;     // { mode: 'road' | 'air' | 'errand', pts, follow, stops: { sourceId, drink, count, s, at }[] }
  road(pts, opts?): Follow;
}
```

Registration: `anim/index.ts` imports `basic.ts` (WP-A ports of the old animations, placeholder actors) first, then one line per WP-C / WP-D module; a later registration for a kind wins. Rules: build everything up front; the scene already shows the final state, so hide or mask what a beat reveals at build time and restore it at raw = 1; land by `beat.at + beat.dur`; reduced mode = no travel / drops / scale pops, fades and static drawings held for `beat.dur`.

### Path follower (`anim/path.ts`)

```ts
interface Pose { x: number; z: number; yaw: number }  // yaw = rotation.y, nose at +x: atan2(-dz, dx)
interface Follow { length: number; y: number; at(s: number, out?: Pose): Pose; nearest(x: number, z: number): number }
function roadPath(pts: [x, z][], opts?: { lane?: number; corner?: number; y?: number }): Follow; // lane 0.2 right of travel (WP-B vehicles are up to 0.46 wide), corner 0.32
function airPath(pts: [x, z][], y: number): Follow;   // Catmull-Rom
function tripDuration(length: number): number;        // clamp(0.45, 0.25 + length / 4.5, 1.4)
function tripEase(dur: number): (t: number) => number; // 0.15 s accelerate, 0.2 s brake
const LANE = 0.2, CORNER = 0.32, ROAD_Y = 0.05, AIR_Y = { zeppelin: 2.2, airplane: 2.5 };
```

### Actor pool (`anim/pool.ts`)

```ts
type ActorKind = 'van' | 'scooter' | 'cart' | 'truck' | 'zeppelin' | 'airplane'
  | 'crate' | 'envelope' | 'leaflet' | 'puff' | 'confetti' | 'ghostToken'
  | 'mailman' | 'coin' | 'cash' | 'carryToken' | 'radioRings' | 'placeholder';
interface ActorSpec { kind: ActorKind; color: string | null; variant: string | null }
// variant: vehicles = chain mark (optional ':lite'); crate / ghostToken / carryToken = good id; puff = 'steam' | 'dust'; coin = stack count
type ActorBuilder = (ctx: MiniCtx, spec: ActorSpec) => THREE.Object3D;
function registerActor(kind: ActorKind, build: ActorBuilder): void;  // WP-B: one call per mini
function hasActor(kind: ActorKind): boolean;
class ActorPool {
  get(kind, color?, variant?): Object3D;  // visible, under the actor layer, transform + body reset
  release(obj): void;                     // hide, back to the free list, never disposed; twice = no-op
  prewarm(kind, colors, n?, variant?): void;
  stats(): { live: number; free: number }; releaseAll(): void;
}
```

Actor contract (WP-B builders): root at the ground point (the follower sets its position), a child Group named `body` holding the model (the follower sets `body.rotation.y`, nose at +x, and may tilt / bob it), the shadow blob a sibling of `body` under the root (so it never yaws: keep it round or square), optional anchors under `body` named `cargo` (tokens / crates ride here) and `drop` (leaflets / envelopes). Built via `MiniCtx` (instanced, `miniGeo` cache, one geometry per kind × colour). Kinds without a registered builder return the placeholder box (chain colour, light nose block at +x, `cargo` anchor). WP-B's minis register in `minis/vehiclesActors.ts`, imported by `anim/index.ts`. Vehicle decals: `three/index.ts` calls `setActorMarks(colour → chainMark)` on view change, so choreographies pass `variant = null` for vehicles (pre-warmed vans share that pool key); pass a mark only to override. WP-B vehicles are ~1.4–1.5× the §3 sizes (zeppelin 1.8×), hence the 0.2 lane.

### Engine event fields (added by WP-A)

| Event | Field | Notes |
|---|---|---|
| `sale` | `route?: SaleRoute` = `{ from: RouteStart; path: Cell[]; exit?: { cell; side } }` | Shortest road route of the winning restaurant (`restaurantHouseRoute`, same costs as the distance field: its borders equal `distance`). Rural area: path to a freeway square, `exit` = that square and its board edge (pipeline `saleRoute`, Ketchup rural marketeers). |
| `drinksBought` | `route?: BuyerRoute`, `reason?: string` | The played route (errand / road / air). Milestone hauls have no route and `reason` = milestone id. `path` kept for logs. |
| `campaignRan` | `reached?: HouseId[]`, `full?: HouseId[]` | Houses in reach in run order; the reached ones that took nothing. Emitted before the `demandPlaced` events, as before. |
| `restaurantMoved` | `from?: { x; y; entrance }` | Position before the move. |
| `entityRemoved` | `kind?: ModuleEntity['kind']` | |

All optional (old logs and fixtures stay valid). Redaction clones events, so the fields reach every viewer; the protocol's event schema is structural and passes them.

---

## 5. Work packages

Interfaces in §4 (`Timeline`, `Clip`, `compile`, `Beat`, `Choreography`, `Follow`, `ActorPool`) are fixed in WP-A's first commit as type-only stubs so B, C and D can start the same day. `three/anim/index.ts` is the only shared file (one import line per choreography module).

### WP-A: Sequencer, path follower, engine events (one engineer)

Files: `three/anim/timeline.ts`, `three/anim/compile.ts`, `three/anim/path.ts`, `three/anim/choreo.ts`, `three/anim/index.ts`, `three/animate.ts` (becomes the dispatcher), `three/tween.ts` (`now`), `three/reconcile.ts` (graveyard, `pendingPlaque`), `three/index.ts` (internals, `data-anim`), `state/interaction.ts` (`followAction`, `cashPulse`), `three/camera.ts` (`lastUserInput`), `engine/src/types/events.ts`, `engine/src/rules/dinnertime.ts`, `engine/src/rules/working/buyDrinks.ts`, `engine/src/rules/marketing.ts`, `engine/src/modules/ketchup/ruralMarketeers.ts`, engine tests, `packages/client/test/timeline.test.ts`, `test/compile.test.ts`, `test/path.test.ts`, `docs/architecture.md` §5.3.

Acceptance:
- `sale.route` (with `exit` for rural), `drinksBought.route`, `campaignRan.reached/full` emitted; redaction unchanged; engine event-order test for the house beat passes.
- `compile` plans for the fixtures match the pacing table (dinner ≤ 12 s at 1×, per-house nominal 0.9 s, pipelining past 13 houses, reduced mode has no travel clips).
- `Timeline.finish()` is idempotent, releases every actor, and a new batch mid-play follows the queue policy (test with two batches).
- Existing pop-in / pulse / drop / pip animations run through the new timeline with no visual regression in the playground; `feedback.test.ts` and e2e still pass.
- Speed 1×/2×/4×, Skip, reduced motion and `data-anim` work in the real app.

### WP-B: Vehicle and character minis, actors, pool (one engineer)

Files: `three/minis/vehicles.ts` (van, scooter + errand boy, cart + operator, truck, zeppelin), `three/minis/props.ts` (crate, envelope, leaflet, puffs, confetti, ghost token), `three/minis/marketing.ts` (airplane leaflet anchor only), `three/minis/restaurant.ts` (scaffold split into parts; entrance spawn anchor `name = 'spawn'`), `three/anim/pool.ts`, `dev/playground.ts` + `dev/three-playground.html` (Vehicles button), `docs/visual-style.md` (asset table).

Acceptance:
- Every asset within its tri budget (§3), identifiable by silhouette in a 390 px-wide playground screenshot at the default camera, chain colour and mark readable.
- All actors instanced via `stage.inst`; `cacheStats()` shows one geometry per kind × colour.
- Pool: get / release round-trips 100 times with no growth in `rec.live` or `inst` counts.
- Vehicles have a `body` group (yaw) and a shadow blob; the airplane keeps `animatePlane` working.

### WP-C: Dinnertime, drinks and marketing choreographies (one engineer)

Files: `three/anim/dinner.ts`, `three/anim/drinks.ts`, `three/anim/marketing.ts`, `three/overlays/feedback.ts` (route helpers, rural exit), `state/feedback.ts` (`replayRequest`, `currentBeat`), `ui/Summary.tsx` (Watch again, Play from here, follows `currentBeat`), `dev/playground.ts` (Drinks button), `e2e/animation.spec.ts`.

Acceptance:
- Dinnertime (playground fixture and a real hot-seat game): van leaves the entrance, follows the road with rounded corners in its lane, tokens hop off at the house while ghost tokens pop, "+$" chip, van returns as a tail, coins at the restaurant; stayed-home and coffee beats as in §2.7; a 20-house dinner finishes in ≤ 12 s at 1× and reads house by house.
- Drinks: errand, cart, truck and zeppelin each follow their route and pick up at every collected source with a stop and a crate hop; the zeppelin uses the air path.
- Marketing: all five carrier behaviours (billboard, mailbox, airplane sweep, radio rings, giant / gourmet) land tokens on the right houses in run order; "full" chips; pip tick; expiry.
- Watch again replays a finished dinnertime correctly after the view has moved on; Play from here starts at the chosen house; the stepper tracks the running beat.
- Reduced mode shows static routes + chips + captions with the same beat holds.

### WP-D: Remaining phases, Ketchup pieces, UI card motion (one engineer)

Files: `three/anim/board.ts` (placements, open, move, drive-in, house, garden, campaign placed / expired, entities, map tile, bankrupt), `three/anim/phase.ts` (setup build, turn ring, phase light, payday restaurant coins, tips, milestone sparks, game over confetti + orbit), `ui/motion.ts` (FLIP helper, counter roll), `ui/OrgChart.tsx`, `ui/EmployeeMarket.tsx`, `ui/TopBar.tsx`, `ui/PlayerPanels.tsx`, `ui/Milestones.tsx`, `ui/Modals.tsx` (bank break), CSS, `dev/playground.ts` (Build button).

Acceptance:
- Every row in §2.1–2.4, 2.6, 2.8, 2.10 and the Ketchup table marked must or should is implemented; nice rows are listed as follow-ups in the PR.
- Card motion uses FLIP with `prefers-reduced-motion` honoured; cash counters roll on `cashPulse` and fall back to immediate updates when no board step pulses.
- Map tile add, lobbyist road states, freeway and rural placement animate in a Ketchup hot-seat game; bankrupt and game over play once and leave the scene clean.
- No animation blocks a prompt; e2e suite passes at 4× and with reduced motion.

Order: A stubs → B and A in parallel → C and D start on A's stubs and B's first vehicles (van, crate) within the first week; C needs the engine events from A before the rural and zeppelin cases.
