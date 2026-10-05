# Food Chain Magnate Online — Architecture & Implementation Plan

Status: approved design, pre-implementation. Companion rules specs live in `docs/rules/` (`base.md`, `employees.md`, `milestones.md`, `map.md`, `ketchup.md`); those documents are the source of truth for rules, this document is the source of truth for structure.

## 0. Summary of decisions

| Area | Decision |
|---|---|
| Language | TypeScript everywhere (strict). The shared `State`/`Action`/`Event`/`Module` types are the contract that lets parallel agents work without talking. |
| Client | Vite + Three.js (3D board) + Preact + `@preact/signals` (2D overlay UI). |
| Server | Node 20+, `ws`, built-in `http` for static files. Compiled with `tsc`; `npm start` = build + run. |
| Engine | Separate zero-dependency ESM package: pure deterministic reducer, seeded RNG in state, plain-JSON state, event emission, per-viewer redaction, module/hook registry. Imported by both server and client (hot-seat). |
| Tests | Vitest (unit + scenario + replay/golden tests for engine; integration tests for server); Playwright for a small set of end-to-end flows (join, reconnect, play a round). |
| Wire format | JSON over WebSocket. Full redacted view after every action (state is small; LAN latency is negligible); events alongside for animation. |
| Persistence | In-memory rooms + debounced JSON snapshot of `{config, seed, actions[]}` per room; replayed on boot. |
| Hot-seat | Same client, `LocalTransport` runs the engine in-process with a pass-the-device screen; no server needed. |

Why these:
- TypeScript: six agents building against one state shape need compile-time contracts; Three.js and Preact have first-class types.
- Preact + signals over vanilla: the overlay is a large derived view of one state object. Signals give fine-grained re-render for free; Preact is ~4 KB and JSX keeps panels (org chart, market, prompts) declarative.
- `ws` + `http`, no Express/Fastify: the HTTP surface is "serve `client/dist` and upgrade `/ws`". Fewer moving parts.
- Full-view broadcast rather than patches: eliminates a whole class of desync bugs; a game state is < 200 KB.
- Compile server with `tsc` rather than run `tsx`: zero runtime TS dependency, so `npm install && npm start` works on any Node 20+.

## 1. Tooling and commands

Root `package.json` uses npm workspaces.

```
npm install          # installs all workspaces
npm start            # tsc -b && vite build && node packages/server/dist/index.js  → prints http://<lan-ip>:3000
npm run dev          # concurrently: tsx watch server (port 3000) + vite dev (port 5173, proxies /ws)
npm test             # vitest run across workspaces
npm run e2e          # build, then Playwright against the real server (e2e/)
npm run typecheck    # tsc -b --noEmit
npm run lint         # import-boundary check (scripts/check-boundaries.mjs) + typecheck
```

Node engines field: `>=20`. Dependencies kept small: `three`, `preact`, `@preact/signals`, `ws`, `zod`; dev: `vite`, `typescript`, `vitest`, `tsx`, `concurrently`, `@types/*`, `eslint`, `prettier`, `playwright`.

## 2. Directory layout and module boundaries

```
food-chain-magnate/
  package.json                     workspaces: packages/*
  tsconfig.base.json
  docs/
    architecture.md                this document
    protocol.md                    wire protocol reference
    visual-style.md                palette, scale, mini style guide
    rules/                         rules specs
  packages/
    engine/                        @fcm/engine  — pure rules. NO imports from other packages, no DOM, no Node APIs.
      src/
        index.ts                   public API (section 3.1)
        types/
          state.ts                 GameState, PlayerState, Board*, Phase union
          actions.ts               Action discriminated union + per-action payloads
          events.ts                GameEvent discriminated union
          module.ts                GameModule interface + hook signatures
          view.ts                  GameView (redacted), Prompt, LegalAction
          content.ts               EmployeeDef, MilestoneDef, FoodDef, EntityDef, TileDef
        core/
          createGame.ts            config + seed → initial state (runs module setup hooks)
          reducer.ts               validate + apply dispatcher, runUntilInput loop
          rng.ts                   xoshiro128** on state.rng; shuffle/int helpers
          phase.ts                 phase transition helpers, awaiting computation
          ids.ts                   deterministic id allocation (state.nextId)
          clone.ts                 structuredClone wrapper
          legal.ts                 legalActions / legalPlacements aggregation
          redact.ts                redactFor(state, viewer), redactEvents
          replay.ts                replay(config, seed, actions)
        rules/                     base game, one file per phase or concern
          setup.ts restructuring.ts orderOfBusiness.ts
          working/ (index.ts recruit.ts train.ts produce.ts buyDrinks.ts campaigns.ts
                    development.ts restaurants.ts stages.ts)
          dinnertime.ts payday.ts marketing.ts cleanup.ts milestones.ts bank.ts pricing.ts
        map/
          tiles.ts                 base tile templates (data)
          generate.ts              seeded layout, rotation, connectivity
          grid.ts                  cell model, footprints, neighbours
          pathfinding.ts           road distance (tile-border count), BFS reach, blocks
          reach.ts                 campaign reach (billboard/mailbox/airplane/radio + module kinds)
        content/
          employees.ts milestones.ts foods.ts   base card data (no logic)
        modules/
          registry.ts              module registration, hook pipeline, ordering
          base.ts                  the base game as a module
          ketchup/                 one file per expansion module + index.ts
        testing/
          stateBuilder.ts          fluent fixture builder for tests and UI dev
          fixtures/                canned states (lobby, mid-working, dinnertime) as JSON
          toyGame.ts               trivial game implementing the same engine interface (for server/client dev)
      test/                        vitest specs mirror src/ layout
    protocol/                      @fcm/protocol — message types + zod schemas. Imports engine types only.
      src/ messages.ts room.ts index.ts
    session/                       @fcm/session — transport-agnostic room/game session logic (seats, undo, checkpoints,
      src/                         redaction fan-out). Imports engine + protocol.
        room.ts gameSession.ts undo.ts
    server/                        @fcm/server — Node runtime
      src/ index.ts ws.ts static.ts roomStore.ts sessions.ts persistence.ts lanAddress.ts
    client/                        @fcm/client — Vite app
      index.html
      src/
        main.tsx                   bootstrap, router (hash routes: #/ , #/room/:id, #/hotseat)
        theme.ts                   colour tokens shared by CSS and 3D
        state/                     store.ts (signals), selectors.ts, prompt.ts
        net/                       transport.ts (interface), socketTransport.ts, localTransport.ts, session.ts
        ui/                        Preact components (section 5.4)
        three/                     Three.js layer (section 5.1–5.3)
        styles/                    CSS (modern, mobile-tolerant)
      dev/                         three-playground.html + fixtures for standalone 3D dev
  e2e/                             Playwright specs
```

Boundary rules (enforced by eslint `no-restricted-imports` and tsconfig `references`):
- `engine` imports nothing from other packages. Everything in it is deterministic and synchronous.
- `protocol` imports engine *types* only.
- `session` imports engine + protocol; no `ws`, no `fs`.
- `server` imports engine, protocol, session. Only place `ws`/`fs`/`http` appear.
- `client` imports engine, protocol. Never imports server/session. `three/` and `ui/` do not import each other; both read the store and call the `interaction` API (section 5.2).

## 3. Engine design

### 3.1 Public API (`packages/engine/src/index.ts`)

```ts
createGame(config: GameConfig, seed: number): GameState
validateAction(state: GameState, action: Action): Ok | Rejected   // Rejected = { code, message }
applyAction(state: GameState, action: Action): Applied | Rejected  // Applied = { state, events, undoable }
legalActions(state: GameState, playerId: PlayerId): LegalAction[]
legalPlacements(state, playerId, spec: PlacementSpec): Placement[]
redactFor(state: GameState, viewer: PlayerId | 'spectator'): GameView
redactEvents(events: GameEvent[], viewer): GameEvent[]
derivePrompt(view: GameView, me: PlayerId | null): Prompt           // UI guidance; shared so hot-seat == online
replay(config, seed, actions: Action[]): { state, events[] }
listModules(): ModuleManifest[]

// Board previews (UI guidance, rules/outlook.ts; ux-plan.md §4). Pure; the client runs them on a pseudo-state from its view.
campaignReach(state, query: CampaignReachQuery): CampaignReachPreview  // houses {houseId, demand, capacity, adds, full}[] + area squares; module reach via the campaignReach pipeline
houseCellsReach(state, cells: Cell[], garden?: Cell[]): CampaignId[]    // campaigns that would reach a house placed there
rangeOverlay(state, playerId, cardUid?, from?: RouteStart): RangeOverlay // { roads: {x,y,distance}[], starts, range | null }; starts = open entrances + coffee shops; no card = pending coffee shop choice
houseOutlook(state, houseId): HouseOutlook | null                     // capacity, demand, sellers ranked as Dinnertime, winner, campaigns
placementProblem(state, playerId, spec, candidate: Placement): string | null // reason from validating the action the placement becomes
```

Guidance data on existing types (additive): `buyerRoute` placements carry `range` and `bordersUsed`; on-board `campaign` placements carry `orientation` (`landscape` / `portrait` / `square`; filter a token with `spec.tileNumber`); a card's `work.skip` legal action carries `disabledReason` when skipping is all it can do; `sale` events carry `candidates` (chains that could deliver, winner first) and `houseConsidered` carries `offers` (every connected chain, ranked, with `canSupply`).

All functions are pure. `applyAction` never mutates its input (it `structuredClone`s then mutates the clone).

### 3.2 State shape (plain JSON; no Set/Map/class instances/shared references)

```ts
interface GameState {
  version: 1;
  config: GameConfig;              // { playerCount, modules: ModuleId[], options: Record<ModuleId, unknown>, intro: boolean }
  seed: number;
  rng: RngState;
  nextId: number;                  // all ids are `${kind}-${nextId++}`
  round: number;
  phase: Phase;
  awaiting: { kind: AwaitKind; players: PlayerId[] };
  turnOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  board: Board;
  supply: Record<EmployeeId, number>;
  milestones: Record<MilestoneId, { owner: PlayerId | null; locked: boolean }>;
  bank: { cash: number; breaks: 0 | 1 | 2; reserveOpened: boolean };
  ceoSlots: number;
  secrets: Record<PlayerId, PlayerSecrets>;
  moduleState: Record<ModuleId, unknown>;
  turn: TurnState | null;          // working-phase sub-state; also the undo checkpoint boundary
  history: { seq: number };
}

interface PlayerState {
  id: PlayerId; name: string; color: string; cash: number;
  employees: Record<Uid, { uid: Uid; employeeId: EmployeeId }>;
  structure: { ceoSubs: Uid[]; managerSubs: Record<Uid, Uid[]> };
  beach: Uid[];
  busy: Record<Uid, CampaignId>;
  inventory: Record<FoodId, number>;
  freezer: Record<FoodId, number>;
  milestones: MilestoneId[];
  restaurantsRemaining: number;
  reserveCard: ReserveCard | null;
  unusedRecruitActions: number; earningsThisRound: number;
}

interface Board {
  w: number; h: number; tileSize: 5;
  tiles: { id; row; col; templateId; rotation }[];
  cells: CellKind[][];                 // derived occupancy index, rebuilt by engine
  houses: Record<HouseId, House>;
  restaurants: Record<RestaurantId, Restaurant>;
  campaigns: Record<CampaignId, Campaign>;
  drinkSources: Record<SourceId, { id, x, y, food }>;
  entities: Record<EntityId, ModuleEntity>;
}
```

### 3.3 Actions

```ts
type Action =
  | { type: 'setup.placeRestaurant'; playerId; x; y; entrance: Corner }
  | { type: 'setup.pass'; playerId }
  | { type: 'setup.chooseReserve'; playerId; amount: 100 | 200 | 300 }          // secret
  | { type: 'restructure.submit'; playerId; structure: Structure }              // secret until all submitted
  | { type: 'restructure.retract'; playerId }
  | { type: 'order.choosePosition'; playerId; position: number }
  | { type: 'work.recruit'; playerId; cardUid; employeeId }
  | { type: 'work.train'; playerId; trainerUid; targetUid; toEmployeeId; steps?: number }
  | { type: 'work.produce'; playerId; cardUid; food?: FoodId }
  | { type: 'work.buyDrinks'; playerId; cardUid; restaurantId; entrance: Corner; sourceIds: SourceId[] }
  | { type: 'work.placeCampaign'; playerId; cardUid; kind; food; placement: Placement; duration }
  | { type: 'work.placeHouse'; playerId; cardUid; x; y } | { type: 'work.placeGarden'; playerId; cardUid; houseId }
  | { type: 'work.placeRestaurant'; playerId; cardUid; x; y; entrance } | { type: 'work.moveRestaurant'; ... }
  | { type: 'work.skip'; playerId; cardUid }
  | { type: 'work.endTurn'; playerId }
  | { type: 'payday.fire'; playerId; uids: Uid[] } | { type: 'payday.confirm'; playerId }
  | { type: 'cleanup.freezer'; playerId; keep: Record<FoodId, number> }
  | ModuleAction;   // `${moduleId}.${name}`
```

Every action carries `playerId`; the server overwrites it from the seat. Working phase: the structure's cards form `turn.pending`; stages follow the rules' fixed order. Mandatory/auto cards are consumed by the engine.

### 3.4 Phase state machine

```ts
type Phase =
  | { kind: 'setup.restaurants'; order: PlayerId[]; idx: number; placed: PlayerId[]; passed: PlayerId[] }
  | { kind: 'setup.reserve' }
  | { kind: 'restructuring' }
  | { kind: 'orderOfBusiness'; chooser: PlayerId; taken: number[] }
  | { kind: 'working'; player: PlayerId; idx: number }
  | { kind: 'dinnertime' } | { kind: 'marketing' }
  | { kind: 'payday' }
  | { kind: 'cleanup' }
  | { kind: 'gameOver'; ranking: PlayerId[] };
```

`runUntilInput(state)` auto-resolves phases needing no input, emitting fine-grained events (`sale`, `demandPlaced`, `salaryPaid`, `campaignExpired`…) for animation. Simultaneous phases collect submissions in `secrets`, reveal on the last one.

### 3.5 Redaction

`redactFor` hides other players' secrets, removes `rng`, applies module `redact` hooks. Events are redacted the same way.

### 3.6 Undo

`Applied.undoable` is false when the action revealed hidden info, consumed randomness, or ended a decision window. The session keeps a checkpoint at each decision window start; undo replays from it.

### 3.7 Module / plugin system

```ts
interface GameModule {
  id; name; description; requires?: ModuleId[];
  options?: OptionSchema;
  content?: { employees?; milestones?; foods?; tiles?; entities? };
  actions?: Record<string, ActionHandler>;
  hooks?: Partial<Hooks>;
}
interface Hooks {
  onCreateGame; onPhaseEnter; onPhaseExit;
  workingStages; cardActions; unitPrice; demandCapacity;
  dinnerCandidates; saleRevenue; campaignReach; legalPlacements;
  onEvent;            // milestone triggers live here
  redact; salaryTotal;
  // added by C6 (risk #2), all defaulting to base behaviour:
  onAction; actionProblem; legalActions; houseDistance; campaignPlacementProblem;
  campaignGoods; tips; reserveOptions; freezerCapacity; forcedFiring; cardSalaried; trainAtWork;
}
```

`ModuleContent.careerAdditions` appends career steps across modules (Ketchup replacement cards). Ketchup modules live in `modules/ketchup/` (one file per rules section) and are registered by `modules/registry.ts`.

Content ids are namespaced (`ketchup:...`). Client renders employees/milestones/foods generically from `ModuleManifest`.

### 3.8 Determinism and tests

Only `createGame` and module setup hooks draw randomness. `(config, seed, actions)` replay is the persistence, reconnection and regression format. Tests: unit, scenario (stateBuilder), golden replays, fuzz (random legal walks; no throws; JSON round-trip; no secret leaks).

## 4. Network protocol and server

### 4.1 Messages (`packages/protocol`), `{ t: string, ... }`, zod-validated

Client → Server: `hello { clientVersion, sessionToken? }`, `room.create`, `room.join`, `room.leave`, `room.sit`, `room.stand`, `room.ready`, `room.config` (host), `room.kick` (host), `room.start` (host), `game.action { id, expectedSeq, action }`, `game.undo`, `game.resync`, `chat`, `ping`.

Server → Client: `welcome`, `error`, `pong`, `room.update { room }`, `game.snapshot { seq, view, manifest }`, `game.applied { seq, action, events, view }`, `game.rejected { id, code, message }`, `game.undone`, `chat`.

### 4.2 Room lifecycle

`lobby` → `playing` → `finished`. 5-char room codes; lobby shows join URL + QR. Host passes on if disconnected > 60 s. Idle rooms are unloaded from memory after 6 h (flushed to disk first) and loaded again on demand by `room.join` or a reconnecting `hello`.

### 4.3 Sessions and reconnection

Server issues a 128-bit `sessionToken`, stored in `localStorage['fcm.session']`. Reconnect re-attaches seat and sends snapshot. Action ids are idempotent. Host can kick a seat so another device takes it over. Spectators get spectator views.

### 4.4 Server-authoritative handling

Validate message → set `playerId` from seat → check `expectedSeq` → `applyAction` → log, persist, fan out per-viewer views.

### 4.5 Persistence

`data/rooms/<id>.json` = `{ id, createdAt, config, seed, seats, status, actions[] }`, debounced writes. On boot every file is indexed, seat-holder sessions are re-created from their token hashes, games in progress are loaded and the rest load on demand. A seat's token hash is kept across writes even when its session is not in memory; a seat whose hash is lost can be reclaimed by joining under its name. Files are deleted after `FCM_ROOM_RETENTION_DAYS` (30) without activity, lobbies whose game never started after `FCM_LOBBY_RETENTION_DAYS` (2). SIGTERM/SIGINT flush before exit. Env: `FCM_DATA_DIR`, `FCM_PERSIST=0`, `PORT` (3000), `HOST` (0.0.0.0).

## 5. Client

### 5.1 Three.js scene

One cell = 1 unit; tile = 5 units. Flat-shaded low-poly, soft shadows. Scene: Lights, BoardGroup (ground, instanced roads, rim), EntitiesGroup (houses, gardens, demand tokens, restaurants, drink sources, billboard/mailbox/airplane/radio minis, module minis), OverlayGroup (highlights, ghost placement, range rings), CSS2D labels. `three/minis/*.ts` export procedural builders; `three/reconcile.ts` diffs views and tweens.

### 5.2 Interaction / picking

`three/interaction.ts`: `setMode`, `onHover`, `onPick`, `highlight`, `focus`. Raycast to ground → snap to engine-provided legal placements. Ghost mesh shows validity; rotate with R/button; touch uses tap + confirm.

### 5.3 Camera and animation

Custom controller: tilted view, yaw, pan/zoom bounds, pinch zoom, "top" toggle. Events queued and animated with speed control/skip; never block input > 1.5 s.

### 5.4 UI overlay (Preact)

Store signals: `connection`, `room`, `view`, `seq`, `me`, `manifest`, `legal`, `prompt`, `draft`, `settings` (game events skip the store: they reach the 3D animator through `boardBridge.setView`, which plays each batch within 1.5 s and fast-forwards the previous one). Components: Lobby, TopBar, PromptPanel, OrgChart, EmployeeMarket, Milestones, PlayerPanels, Log, Chat, Modals, HotseatHandoff. Mobile: bottom sheets, 44 px touch targets.

### 5.5 Transports

`Transport` interface; `SocketTransport` (auto-reconnect, session token); `LocalTransport` (hot-seat, in-process engine, handoff pseudo-events).

## 6. Task breakdown

- **C0** Scaffold, contracts, fixtures, toy engine, move old code to `legacy/`. (wave 0)
- **C1** Engine A: core, map, setup, restructuring, order of business, working phase. (wave 1)
- **C2** Engine B: dinnertime, payday, marketing, cleanup, milestones, bank. (wave 1)
- **C3** Server + session layer. (wave 1)
- **C4** Client shell + 2D UI. (wave 1)
- **C5** 3D board, minis, interaction, animation. (wave 1)
- **C6** Ketchup modules. (wave 2, after C1+C2)
- **C7** Integration, E2E, polish, README, delete `legacy/` (done: the vanilla-JS original is gone; see git history). (waves 2–3)

Each chunk owns disjoint files; `npm run typecheck && npm test` must stay green.

## 7. Risks

1. Rules ambiguity — tests cite rule paragraphs; open questions in `docs/rules/questions.md`.
2. Hooks too narrow for a module — C6 may extend `module.ts`/`registry.ts` compatibly.
3. Client/engine drift — fixtures, toy engine, cross-workspace typecheck.
4. Working-phase free-order and buyer-route UX — engine supplies legal placements.
5. Mobile 3D performance — instancing, shadow tiering.
6. Undo limited to own-turn and pre-reveal retraction.
