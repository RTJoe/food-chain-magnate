/**
 * config + seed → initial state (architecture §3.1, §3.8; base.md §2; DLX p2–5).
 *
 * - Map: random draw of rows x cols tiles with random rotations (base.md §2.2), or a fixed
 *   layout. Intro game: redraw until all 3 drink types appear (questions.md Q-B5).
 * - Supply: every non-1x card at its box count; 1x cards 1 (2–3p) / 2 (4p) / 3 (5p+) (§2.3).
 * - Marketing tiles minus the billboards removed at low player counts (§2.1).
 * - Players start with $0, a CEO, 3 restaurants (§2.4). Random initial turn order (§2.5).
 * - Bank $50/player ($75 in the intro game). Intro game: no milestones unless `introMilestones`.
 * - Module `onCreateGame` hooks run last; then the engine advances to the first decision: the
 *   secret reserve cards (§2.7, DLX p4 step 5), then first restaurants in reverse turn order
 *   (§2.6, step 6). The intro game has no reserve cards and starts with the restaurants.
 * Only createGame and module setup hooks draw randomness.
 */
import type { EmployeeId, TileTemplateId } from '../types/content.js';
import type { GameConfig, GameState, PlayerId, PlayerSecrets, PlayerState } from '../types/state.js';
import { contentFor, lifecycle, moduleSetProblem } from '../modules/registry.js';
import { uniqueCopiesFor } from '../content/employees.js';
import { drawLayout, mapSize } from '../map/generate.js';
import { buildBoard, type LayoutEntry } from '../map/grid.js';
import { allocId } from './ids.js';
import { createRng, shuffle } from './rng.js';
import { makeCtx } from './context.js';
import { runUntilInput } from './phase.js';
import { setupRestaurantsPhase } from '../rules/setup.js';
import { legacyRules, RULES_VERSION } from './rulesVersion.js';
import { NEW_DISTRICTS_TILE_OPTIONS, newDistrictsPool } from '../modules/ketchup/newDistricts.js';

export function configProblem(config: GameConfig): string | null {
  if (!config || !Array.isArray(config.players)) return 'Missing players';
  const n = config.players.length;
  const max = config.modules?.includes('ketchup:sixPlayers') ? 6 : 5;
  if (n < 2 || n > max) return `Food Chain Magnate needs 2–${max} players`;
  const ids = new Set(config.players.map((p) => p.id));
  if (ids.size !== n || [...ids].some((id) => typeof id !== 'string' || !id)) return 'Player ids must be unique non-empty strings';
  const v = config.rulesVersion;
  if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > RULES_VERSION)) return `Unknown rules version ${String(v)}`;
  const tiles = (config.options as { 'ketchup:newDistricts'?: { tiles?: unknown } } | undefined)?.['ketchup:newDistricts']?.tiles;
  if (tiles !== undefined && !NEW_DISTRICTS_TILE_OPTIONS.includes(tiles as never)) return 'Unknown New Districts tile option';
  return moduleSetProblem(config.modules ?? []);
}

export function createGame(config: GameConfig, seed: number): GameState {
  const problem = configProblem(config);
  if (problem) throw new Error(`createGame: ${problem}`);
  const cfg: GameConfig = JSON.parse(JSON.stringify({ ...config, modules: config.modules ?? [], options: config.options ?? {}, introMilestones: config.introMilestones ?? false, map: config.map ?? { kind: 'random' }, rulesVersion: config.rulesVersion ?? RULES_VERSION })) as GameConfig;
  const legacy = legacyRules({ config: cfg });
  const n = cfg.players.length;
  // KX p15 (Lobbyists, map setup): "If playing with 5 or 6 players, you must include all 6 new map
  // tiles in the map pool." Tiles U–Y come with New Districts, so it joins such games.
  if (!legacy && n >= 5 && cfg.modules.includes('ketchup:lobbyists') && !cfg.modules.includes('ketchup:newDistricts')) cfg.modules.push('ketchup:newDistricts');
  const content = contentFor(cfg.modules);
  const rng = createRng(seed);
  const ids = { nextId: 1 };

  // Players (base.md §2.4): $0, CEO, 3 restaurants.
  const players: Record<PlayerId, PlayerState> = {};
  const secrets: Record<PlayerId, PlayerSecrets> = {};
  for (const seat of cfg.players) {
    const ceo = allocId(ids, 'card');
    players[seat.id] = {
      id: seat.id,
      name: seat.name,
      chain: seat.chain,
      color: seat.color,
      cash: 0,
      employees: { [ceo]: { uid: ceo, employeeId: 'ceo', acquiredRound: 0 } },
      structure: { ceo, ceoSubs: [], managerSubs: {} },
      beach: [],
      busy: {},
      inventory: {},
      freezer: {},
      milestones: {},
      restaurantsRemaining: 3,
      reserveCard: null,
      unusedRecruitActions: 0,
      earningsThisRound: 0,
      salaryPaidThisRound: 0,
      bankrupt: false,
    };
    secrets[seat.id] = { reserve: null, structureDraft: null };
  }

  // Initial turn order (base.md §2.5): random.
  const turnOrder = shuffle(rng, cfg.players.map((p) => p.id));

  // Map (base.md §2.2).
  let layout: LayoutEntry[][];
  let tilePool: TileTemplateId[] = [];
  if (cfg.map.kind === 'fixed') {
    layout = cfg.map.layout.map((row) => row.map((e) => ({ templateId: e.templateId, rotation: e.rotation })));
  } else {
    const [rows, cols] = mapSize(n);
    const pool = newDistrictsPool(
      cfg,
      (Object.values(content.tiles) as NonNullable<(typeof content.tiles)[TileTemplateId]>[])
        .filter((t) => !t.requiresModule || cfg.modules.includes(t.requiresModule))
        .map((t) => t.id)
        .sort(),
    );
    const drawn = drawLayout(rng, pool, content.tiles, rows, cols, { requireAllDrinks: cfg.intro });
    layout = drawn.layout;
    tilePool = drawn.leftover;
  }
  const board = buildBoard(layout, content.tiles, ids);

  // Supply (base.md §2.3).
  const supply: Partial<Record<EmployeeId, number>> = {};
  for (const def of Object.values(content.employees)) {
    if (!def || def.id === 'ceo' || def.availability !== 'supply') continue;
    supply[def.id] = def.unique ? uniqueCopiesFor(n) : def.count;
  }
  for (const [id, extra] of Object.entries(content.extraSupply) as [EmployeeId, number][]) supply[id] = (supply[id] ?? 0) + extra;

  const milestones: GameState['milestones'] = {};
  if (!cfg.intro || cfg.introMilestones) {
    for (const def of Object.values(content.milestones)) {
      if (def) milestones[def.id] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: def.removeAfterRound ?? null };
    }
  }

  const marketingTiles = (Object.values(content.marketingTiles) as NonNullable<(typeof content.marketingTiles)[number]>[])
    .filter((t) => (t.minPlayers ?? 0) <= n)
    .map((t) => t.number)
    .sort((a, b) => a - b);

  const state: GameState = {
    version: 1,
    config: cfg,
    seed,
    rng,
    nextId: ids.nextId,
    round: 0,
    // LEGACY(v1): first restaurants before reserve cards (the phase loop then asks for reserves).
    phase: cfg.intro || legacy ? setupRestaurantsPhase(turnOrder) : { kind: 'setup.reserve' },
    awaiting: { kind: 'none', players: [] },
    turnOrder,
    players,
    board,
    supply,
    milestones,
    bank: { cash: (cfg.intro ? 75 : 50) * n, breaks: 0, reserveOpened: false, ious: {}, burned: 0 },
    ceoSlots: 3,
    basePrice: 10,
    houseTiles: content.placeableHouses.map((h) => h.order),
    gardenTiles: 8,
    marketingTiles,
    tilePool,
    secrets,
    pending: [],
    moduleState: {},
    turn: null,
    history: { seq: 0 },
  };

  const ctx = makeCtx(state);
  ctx.emit({ type: 'gameStarted', players: cfg.players.map((p) => p.id), turnOrder: [...turnOrder] });
  lifecycle(ctx, 'onCreateGame');
  runUntilInput(ctx);
  return state;
}
