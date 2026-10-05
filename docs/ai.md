# AI opponents

Bots fill seats online (host: **Add bot ▾** in the lobby) and in hot-seat (setup: "played by"). Levels: Easy, Medium, Hard. Easy and Medium exist; Hard falls back to Easy until it is registered (see "Interface for Medium/Hard").

## Package

`packages/ai` (`@fcm/ai`) imports `@fcm/engine` only. Pure TypeScript, no DOM or Node APIs, so the same code runs inline, in a Node worker thread and in a browser Web Worker. Session, server and client may import it (`scripts/check-boundaries.mjs`).

```ts
type BotLevel = 'easy' | 'medium' | 'hard';

interface BotInput {
  view: GameView;        // engine.redactFor(state, playerId): what a human in that seat can see
  playerId: PlayerId;    // always awaited by the engine when choose() is called
  legal: LegalAction[];  // engine.legalActions(viewState(view), playerId)
  engine: EngineApi;     // pure; call it on states you build (viewState / sampleState)
  rng: RngState;         // seeded per decision (mutated in place by the engine rng helpers)
  budgetMs: number;      // soft thinking budget (server default 2000)
}

interface Bot {
  readonly level: BotLevel;
  choose(input: BotInput): Action;   // must not throw; must be legal on the real state
  explain?(input: BotInput): BotExplanation; // optional, bench traces only: { action (== choose), archetype?, candidates?, rollouts?, samples?, horizon?, top?, evalTerms?, warnings?, extra? }
}

createBot(level): Bot                 // registered bot, or Easy wearing that level
registerBot(level, factory)           // install Medium / Hard
runBot(req: BotRequest): Action       // what every host calls; never throws for an awaited seat
runBotDetailed(req) → { action, fellBack, error?, ms }
viewState(view): GameState            // deterministic pseudo-state (own secrets, blanks elsewhere)
sampleState(view, rng): GameState     // determinization hook (below)
decisionSeed(gameSeed, seq, playerId) // reproducible per-decision seed
fallbackAction(state, playerId, engine, legal?) // legal "move the game on" action
heuristics.*                          // shared helpers: simpleStructure, firingPlan, actionFromPlacement, distances, demand…
```

`BotRequest = { level, view, playerId, seed, budgetMs }` is the serializable message hosts send to wherever bots run. `runBot` rebuilds the `BotInput`, calls the bot, validates the answer on the view's state and substitutes `fallbackAction` if the bot threw or answered something illegal.

Information rule: a bot only gets its seat's redacted view. Hidden in a view: the rng and seed, other players' reserve cards (until revealed) and Restructuring drafts (until the reveal), and the order of the leftover map tiles. None of these change which actions are legal for the viewer (tested: `legalActions(viewState(view)) == legalActions(state)` at every step of Ketchup games), so `viewState` is enough to enumerate and validate moves.

Engine helpers for bots are exported from `@fcm/engine` (read-only, pure): `contentFor`, `cardsAtWork`, `cardsInHand`, `cardPlace`, `ceoSlotsFor`, `defOf`, `isManager`, `managerSlots`, `ownsUnique`, `SALARY`, `salaryBreakdown`, `salariedCards`, `voluntarilyFireable`, `submissionProblem`, `isOverfilled`, `freezerCapacity`, `stockOf`, `reserveOptions`, `abilityStage`, `stageIndex`, `stagesFor`, plus the board previews already in `EngineApi` (`campaignReach`, `houseOutlook`, `rangeOverlay`, `placementProblem`).

## Easy bot

`packages/ai/src/easy.ts`. One light heuristic per decision, no lookahead, a little rng noise:

- Setup: first restaurant where houses cluster, away from rivals; random reserve card.
- Restructuring: `heuristics.simpleStructure`: seats as many managers as maximises cards at work, fills slots by a fixed priority (cooks, marketeers, buyers, trainers, recruiters…), never overfills, never puts a manager under a manager, night-shift managers only in CEO slots.
- Order of business: earliest free position.
- Working, one card at a time in sub-step order: hire producers, marketeers (only while tiles of their kind remain), a manager, a trainer, a buyer; skip pointless hires on paid recruiters (the $5 discount); train cooks, managers and marketeers while salaries stay affordable (cash plus a cautious income estimate); cook what is wanted near its restaurants; errand boys fetch the most wanted drink, carts/trucks/zeppelins take the route that collects most; campaigns are scored with `engine.campaignReach` (demand added, weighted by closeness to its restaurants) on a sample of legal spots; houses go next to its restaurants; new restaurants where houses cluster; moving restaurants is skipped.
- Payday: fires salaried cards (beach first, then the least useful) only when salaries exceed cash. Forced firing: non-busy salaried cards first, stops as soon as payable.
- Clean up: freezes the most plentiful freezable goods up to capacity.
- Ketchup choices: places what must be placed (coffee shop, pizza radio, free mailbox, extra map tile), near its restaurants when it matters; accepts optional bonuses (second campaign, freeway); lobbyist roads/parks on a legal spot near its restaurants; declines anything else.

Every candidate is checked with `engine.validateAction` before it is returned; the last resort is `fallbackAction`. Tests: `packages/ai/test/botGames.test.ts` plays full bot-vs-bot games for every level (base, all Ketchup modules, 2–6 players, Hard Choices, intro) and requires zero rejected actions and zero fallbacks.

## Medium bot

`packages/ai/src/medium/` (+ `shared/`), design in `docs/ai-strategy.md` §3. Heuristics, no search; stateless (everything is rebuilt from the view on each call).

- Shared reading of the table (`shared/market.ts`): every house's outlook, a price model (structures known after the reveal, estimated before), `winProb`, and a shadow Dinnertime that predicts sales from stock.
- Archetype (`archetype.ts`): burger/pizza volume (default), drinks, discount, luxury, CFO rush, milestone racer, scored from map fit, sunk cards, contested houses and open milestones. Each has a build list.
- Org planner (`orgPlanner.ts`): matches owned cards to the build list, then says what to hire and whom to train, within salary room and slots. It adds buyers or cooks when the shadow Dinnertime shows a shortfall, a local/regional manager when demand is out of reach, and swaps marketeers whose campaign tiles are gone for the next card up.
- Setup: first restaurant by exact position value (the placement is applied to a copy and the houses re-read). Reserve card by archetype; never the $5 base price.
- Restructuring (`restructure.ts`): for each choice of managers, cards are added greedily (single cards and same-kind bundles) by a one-round forecast: shadow Dinnertime income with the prices, waitresses and production of the set, plus hires, training steps, campaign slots and milestones.
- Order of business: earliest position.
- Working (`working.ts`): a MacroPlan (`shared/plan.ts`) built in sub-step order and executed one step per call. Hires and training follow the org plan. Campaigns are scored with `campaignReach` × win chance × revenue minus leaked demand, over the rounds they run (`campaign.ts`). Food and drink choices maximise the shadow Dinnertime (`food.ts`). Houses, gardens and restaurants are pre-ranked cheaply, then checked exactly (`develop.ts`). Cards Medium has no scorer for (lobbyists) use Easy's choice.
- Payday: fire salaried cards that are idle or outside the plan, and whatever cash cannot carry. Freezer keeps what next round's houses want.
- Ketchup: fry-chef bonus and kimchi/sushi/noodle tiers come through the outlook; night shift managers are CEO-only; "used" milestones (urgent when they expire early) add to structure scores; apartments that no one could serve in one go are not advertised to; scorers for second campaign, free mailbox, pizza radio and coffee shop choices.
- For Hard: `medium.structureCandidates`, `medium.planAlternatives` (base plan, ranked options per card and dimension, single-substitution neighbours), `executePlan`, `medium.fireCandidates`, `medium.orderValue`.
- `explain(input)` reports the archetype and the scored structures or plan steps.

## Where bots run

| Host | Runner | Notes |
|---|---|---|
| Server (online) | `WorkerBotRunner` (`packages/server/src/botRunner.ts`): `worker_threads` pool, lazy, FIFO, size `FCM_BOT_WORKERS` (default half the cores, 1–4). Worker entry `botWorker.ts`. | A job that overruns `budgetMs + 10 s` or crashes is rejected and its worker replaced; the session plays the fallback. Running from source (tsx, vitest) the worker loads `botWorker.ts` through tsx. |
| Session (tests, tools) | `inlineBotRunner` | Same thread. |
| Client (hot-seat) | `workerBotRunner()` (`packages/client/src/net/botRunner.ts`): one module Web Worker per game (`botWorker.ts`), inline fallback. | Vite builds it as `assets/botWorker-*.js` (`worker.format: 'es'`). |

### Session: `BotDriver` (`packages/session/src/bots.ts`)

- Watches one `GameSession`. Whenever the engine awaits a bot seat (`game.awaitedBot()`), it waits the delay (`BotDelay`: default 400–900 ms random; `FCM_BOT_DELAY_MS`; 0 in tests), asks the runner with `game.botRequest(player, budgetMs)` and applies the move with `game.submitBotAction`, which replaces a missing or rejected move with `fallbackAction` on the real state. One bot thinks at a time per room; simultaneous phases take turns.
- A move computed for an older seq (someone acted or undid meanwhile) is discarded and the bot thinks again.
- Bots pause while nobody in the room is connected (`active`); a reconnect, join, action or undo pokes them again.
- Undo: `UndoTracker.undo(…, isBot)` drops bot moves made after the undone human move instead of replaying them, so a quick bot reply never blocks a human's undo; the bots then decide again. Hot-seat (`LocalTransport`) does the same.
- Simultaneous decisions (reserve, structure, firing, freezer) sent against a seq that only *other* players advanced are applied instead of bouncing as STALE, so a human never races a bot's instant reply.

### Seats, protocol, persistence

- `Seat.bot: BotLevel | null`. A bot seat has `clientId: null`, is always `ready` and `connected`, counts towards the 2–6 players, and keeps its level through start (seats compact to `p1..pN`).
- `room.addBot { seat, level }` (host, lobby; also changes a bot's level) and `room.removeBot { seat }` (host, lobby; `room.kick` on a bot seat does the same). Bots cannot be added, removed or kicked during a game; humans cannot sit on or act for a bot seat.
- Persisted with the seats (`data/rooms/<id>.json`); `GameSession({ bots })` is rebuilt from them on restore and the driver resumes. Old files without `bot` load as human seats.
- Clients show a robot badge with the level, and "thinking…" while the engine awaits a bot seat (derived from `view.awaiting` and the seats; no extra message).

## Interface for Medium/Hard

Implement a `Bot` and register it; nothing else changes (server worker, session, hot-seat worker all call `runBot` → `createBot`):

```ts
// packages/ai/src/medium.ts
import type { Bot } from './types.js';
export function createMediumBot(): Bot {
  return { level: 'medium', choose(input) { /* … */ } };
}
// packages/ai/src/registry.ts
const factories = new Map<BotLevel, BotFactory>([['easy', createEasyBot], ['medium', createMediumBot], ['hard', createHardBot]]);
```

Contract and tips:

1. `choose` gets `{ view, playerId, legal, engine, rng, budgetMs }` and returns one `Action` for `playerId`. It must be legal on the real state; validate candidates with `engine.validateAction(viewState(view), a)`. Don't throw (the host falls back to `fallbackAction` and logs it, and the tests count that as a failure).
2. Use only the view. For lookahead, simulate with `engine.applyAction` on `sampleState(view, rng)`: it fills the hidden parts with plausible values (fresh rng/seed, other players' hidden reserve cards sampled from `reserveOptions`, submitted-but-unrevealed structures built with `simpleStructure`, shuffled tile pool). Determinize several times and aggregate (PIMC / ISMCTS). If a module ever adds a `redact` hook, extend `sampleState` for what it hides.
3. Opponent models for rollouts: `createBot('easy').choose` on each opponent's `redactFor(sample, opp)` view, or `fallbackAction` for speed.
4. Respect `budgetMs` (check `Date.now()`; it is allowed in `@fcm/ai`'s pure code). The server cancels a move after `budgetMs + 10 s` and plays the fallback. The decision rng (`input.rng`) is seeded per (game seed, seq, seat): use it for all randomness so games reproduce.
5. Reuse `heuristics` (structure, firing, placements → actions, demand and distance scores) and the Easy bot's per-phase coverage: every awaited situation needs an answer (pending choices first, then the phase: setup restaurant/reserve, restructuring, order, working card by card, payday, freezer, Ketchup choices).
6. Keep `choose` stateless, or treat any memory as a cache that may be missing: the server runs bots in a pool of worker threads, so consecutive decisions of one seat may land in different workers (and a restart or undo can happen between them). A per-turn plan should be keyed by something in the view (round, `view.turn`, `history.seq`) and rebuilt from the view when absent or stale.
7. The seat is `input.playerId` (not `me`); `input.legal` is computed on `viewState(view)`, which equals the legal actions on the real state.
8. Add the level to `packages/ai/test/botGames.test.ts` (it already loops over `BOT_LEVELS`) and keep `fellBack` at zero; add a test that Medium beats Easy more often than not over a few seeds.

## Tuning harness (`packages/ai/src/bench/`)

Node-only (worker_threads, fs). Excluded from the `@fcm/ai` build and its exports; `check-boundaries` lets only `bench/` use `node:*` / `@fcm/engine/testing` and forbids the rest of `ai/src` from importing it. Type-checked by `tsconfig.test.json`.

```
npm run ai:bench -- --a medium --b easy --players 2 --games 200 --seed 1 --modules none|all|a,b --budget 2000 [--workers n] [--trace] [--out dir] [--phases] [--json]
npm run ai:bench -- --bots hard,medium,medium --games 99
npm run ai:inspect -- <run>/traces/game-0003.jsonl [--round 5 --player p2 --phase working --fellback]
npm run ai:inspect -- <run>/traces/game-0003.jsonl --step 120 [--board] [--rerun [--level hard] [--budget 5000]] [--dump state.json]
npm run ai:gate [-- --profile ci|full] [--only name] [--set name.field=value] [--config gate.json] [--strict]
```

- `--a` plays one seat, `--b` the rest (same level on both sides → labelled `A:x` / `B:x`); `--bots` gives one level per seat. Every seat list is played in every cyclic rotation on the same map seed (`--no-rotate` to disable), so `--games` should be a multiple of the player count. Easy vs Easy rotations are mirror games (same bot, same decision seeds).
- Games run on a `worker_threads` pool, default half the cores (`--workers`, 0 = inline). Each decision mirrors `runBotDetailed` (same input, decision seed and fallback) and records thinking time, invalid answers (fallback sent), throws, and real-state rejections (game aborted, offender ranked last). Caps: 60 rounds (draw, flagged), 20 000 decisions.
- Report: win rate with Wilson 95 % CI (capped games count as no win), expected share, multiplayer Elo (K 16, 2 passes, mean ± sd of 10 shuffles), head-to-head (seat pairs; draws ½), mean final cash and place, fallbacks/invalid/threw/rejected, p50/p95/max decision ms per level (`--phases` per phase), completion, game length, wins by seat.
- Output (default `packages/ai/runs/<stamp>-<label>/`, git-ignored): `summary.json`, `elo.json`, `games.jsonl`, and with `--trace` `traces/game-NNNN.jsonl` (a header line with config and seed, then one line per decision: phase, stage, player, bot, ms, applied action, summary, up to 40 legal alternatives, fallback/error, and the bot's `explain()` fields). With `--trace` the harness calls `explain` instead of `choose` when a bot has it.
- `ai:inspect` rebuilds the exact state before any traced decision by replaying the actions from the header's config and seed, prints players, legal actions and the traced explanation, and with `--rerun` asks the bot again (same decision seed) and says whether it reproduces the traced action.
- `ai:gate` checks the §8.5 success criteria of `docs/ai-strategy.md` (`ci`: legality, completion, Medium ≥ 60 % vs Easy; `full`: the whole table plus a determinism replay). Thresholds and sizes are overridable; checks needing an unregistered level are skipped (failed with `--strict`); exit code 1 on failure.
