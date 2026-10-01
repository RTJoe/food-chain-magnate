/**
 * Fluent builder for valid `GameState` objects (tests, fixtures, UI development).
 *
 *   const s = stateBuilder({ players: 3, seed: 7 })
 *     .tiles([['A', 'O1', 'L'], ['E', 'K', 'N2'], ['T', 'C', 'D3']])
 *     .round(2).phase({ kind: 'restructuring' })
 *     .cash('p1', 40)
 *     .card('p1', 'marketing_trainee', 'hand', 'p1-mt')
 *     .restaurant('p1', 3, 4, 'NE')
 *     .demand(2, ['burger'])           // house number 2
 *     .build();
 *
 * The builder keeps supply, house/garden/marketing tile pools and occupancy consistent, and
 * `build()` runs `assertValidState`. Rules legality beyond that (e.g. range) is not checked.
 */
import type { Direction, EmployeeId, FoodId, MilestoneId, ModuleId } from '../types/content.js';
import type {
  AwaitKind,
  Bank,
  Campaign,
  CampaignPlacement,
  Cell,
  ChainId,
  Corner,
  DemandToken,
  FoodCounts,
  GameState,
  House,
  HouseId,
  ModuleEntity,
  PendingChoice,
  Phase,
  PlayerId,
  PlayerSecrets,
  PlayerSeatConfig,
  PlayerState,
  ReserveCard,
  RestaurantStatus,
  TurnState,
  Uid,
} from '../types/state.js';
import { allocId } from '../core/ids.js';
import { clone } from '../core/clone.js';
import { createRng } from '../core/rng.js';
import { buildBoard, paint, parseLayout, rect, touchesRoad } from './board.js';
import { assertValidState } from './validate.js';

// ---------------------------------------------------------------------------
// Testing data (mirrors employees.md / milestones.md; the real tables live in content/)
// ---------------------------------------------------------------------------

/** employees.md §1 box counts (CEO excluded). */
export const BASE_EMPLOYEE_COUNTS: Partial<Record<EmployeeId, number>> = {
  waitress: 12, management_trainee: 18, junior_vp: 12, vice_president: 6, senior_vp: 6, executive_vp: 3,
  new_business_developer: 6, luxuries_manager: 3, pricing_manager: 12, discount_manager: 6, local_manager: 6,
  regional_manager: 3, cfo: 3, recruiting_girl: 12, recruiting_manager: 6, hr_director: 3, trainer: 12, coach: 6,
  guru: 3, errand_boy: 12, cart_operator: 6, truck_driver: 6, zeppelin_pilot: 3, marketing_trainee: 12,
  campaign_manager: 6, brand_manager: 6, brand_director: 3, kitchen_trainee: 12, burger_cook: 6, burger_chef: 3,
  pizza_cook: 6, pizza_chef: 3,
};

/** "1x" cards (employees.md §1). */
export const BASE_UNIQUE: readonly EmployeeId[] = [
  'executive_vp', 'luxuries_manager', 'regional_manager', 'cfo', 'hr_director', 'guru', 'zeppelin_pilot',
  'brand_director', 'burger_chef', 'pizza_chef',
];

export const BASE_MILESTONE_IDS: readonly MilestoneId[] = [
  'first_billboard', 'first_train', 'first_hire_3', 'first_burger_marketed', 'first_pizza_marketed',
  'first_drink_marketed', 'first_errand_boy', 'first_20', 'first_burger_produced', 'first_pizza_produced',
  'first_waitress', 'first_throw_away', 'first_lower_prices', 'first_cart_operator', 'first_airplane',
  'first_radio', 'first_100', 'first_pay_20',
];

const CHAINS: ChainId[] = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc', 'siap_faji'];
/** Default seat colours; keep in sync with packages/client/src/theme.ts PLAYER_COLORS. */
export const DEFAULT_PLAYER_COLORS = ['#d94f3d', '#e8b730', '#3f8fd2', '#4caf6a', '#9b5fc0', '#f08a3c'];
const NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'];

/** Board size in tiles [rows, cols] by player count (base.md §2.1, ketchup.md §17). */
export const MAP_SIZE: Record<number, [number, number]> = { 2: [3, 3], 3: [3, 4], 4: [4, 4], 5: [5, 4], 6: [4, 6] };
const DEFAULT_TILE_ORDER = 'ABCDEFGHIJKLMNOPQRST'.split('');

/** Marketing tiles in play: 1–16 minus removed billboards (base.md §2.1). */
export function marketingTilesFor(players: number): number[] {
  const removed = players <= 2 ? [12, 15, 16] : players === 3 ? [15, 16] : players === 4 ? [16] : [];
  return Array.from({ length: 16 }, (_, i) => i + 1).filter((n) => !removed.includes(n));
}

export function uniqueCopies(players: number): number {
  return players <= 3 ? 1 : players === 4 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface StateBuilderOptions {
  /** Count (names Ada, Bo, ...) or explicit names. Ids are p1..pN. */
  players?: number | string[];
  seed?: number;
  modules?: ModuleId[];
  intro?: boolean;
  /** Explicit seats (ids, names, chains, colours); overrides `players`. */
  seats?: PlayerSeatConfig[];
}

/**
 * Where a card goes.
 * - `hand`: Restructuring hand. `beach`. `work`: directly under the CEO.
 * - `{ under: managerUid }`: in a manager's slots. `{ busy: campaignId }`: busy marketeer.
 */
export type CardWhere = 'hand' | 'beach' | 'work' | { under: Uid } | { busy: string };

export interface CampaignSpec {
  owner: PlayerId;
  kind: Campaign['kind'];
  number: number;
  goods: FoodId[];
  placement: CampaignPlacement;
  remaining: number;
  eternal?: boolean;
  marketeer?: Uid | null;
  source?: Campaign['source'];
  id?: string;
}

export class StateBuilder {
  private s: GameState;
  private awaitingSet = false;

  constructor(opts: StateBuilderOptions = {}) {
    const names = typeof opts.players === 'object' ? opts.players : NAMES.slice(0, opts.players ?? 2);
    const seats: PlayerSeatConfig[] =
      opts.seats ??
      names.map((name, i) => ({
        id: `p${i + 1}`,
        name,
        chain: CHAINS[i] as ChainId,
        color: DEFAULT_PLAYER_COLORS[i] as string,
      }));
    const n = seats.length;
    if (n < 2 || n > 6) throw new Error('2–6 players');
    const seed = opts.seed ?? 1;
    const ids = { nextId: 1 };
    const supply: Partial<Record<EmployeeId, number>> = {};
    for (const [id, count] of Object.entries(BASE_EMPLOYEE_COUNTS) as [EmployeeId, number][]) {
      supply[id] = BASE_UNIQUE.includes(id) ? uniqueCopies(n) : count;
    }
    const intro = opts.intro ?? false;
    const players: Record<PlayerId, PlayerState> = {};
    const secrets: Record<PlayerId, PlayerSecrets> = {};
    for (const seat of seats) {
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
    const [rows, cols] = MAP_SIZE[n] as [number, number];
    const layout = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => DEFAULT_TILE_ORDER[(r * cols + c) % DEFAULT_TILE_ORDER.length] as string),
    );
    const turnOrder = seats.map((p) => p.id);
    const milestones: GameState['milestones'] = {};
    if (!intro) for (const m of BASE_MILESTONE_IDS) milestones[m] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null };
    this.s = {
      version: 1,
      config: { players: seats, modules: opts.modules ?? [], options: {}, intro, introMilestones: false, map: { kind: 'random' } },
      seed,
      rng: createRng(seed),
      nextId: ids.nextId,
      round: 0,
      phase: { kind: 'setup.restaurants', round: 1, order: [...turnOrder].reverse(), idx: 0, placed: [], passed: [] },
      awaiting: { kind: 'none', players: [] },
      turnOrder,
      players,
      board: buildBoard(parseLayout(layout), ids),
      supply,
      milestones,
      bank: { cash: (intro ? 75 : 50) * n, breaks: 0, reserveOpened: false, ious: {}, burned: 0 },
      ceoSlots: 3,
      basePrice: 10,
      houseTiles: [1, 3, 6, 9, 11, 14, 17, 19],
      gardenTiles: 8,
      marketingTiles: marketingTilesFor(n),
      tilePool: [],
      secrets,
      pending: [],
      moduleState: {},
      turn: null,
      history: { seq: 0 },
    };
    this.s.nextId = ids.nextId;
  }

  /** Replace the map. Codes like 'A' or 'O1' (rotation). Must be done before adding board pieces. */
  tiles(layout: string[][]): this {
    if (Object.keys(this.s.board.restaurants).length || Object.keys(this.s.board.campaigns).length) {
      throw new Error('tiles() must be called before placing pieces');
    }
    this.s.config.map = { kind: 'fixed', layout: parseLayout(layout) };
    this.s.board = buildBoard(parseLayout(layout), this.s);
    return this;
  }

  round(n: number): this {
    this.s.round = n;
    return this;
  }

  phase(p: Phase): this {
    this.s.phase = p;
    return this;
  }

  awaiting(kind: AwaitKind, players: PlayerId[]): this {
    this.s.awaiting = { kind, players };
    this.awaitingSet = true;
    return this;
  }

  turnOrder(order: PlayerId[]): this {
    this.s.turnOrder = order;
    return this;
  }

  modules(mods: ModuleId[]): this {
    this.s.config.modules = mods;
    return this;
  }

  bank(b: Partial<Bank>): this {
    Object.assign(this.s.bank, b);
    return this;
  }

  ceoSlots(n: number): this {
    this.s.ceoSlots = n;
    return this;
  }

  cash(player: PlayerId, amount: number): this {
    this.p(player).cash = amount;
    return this;
  }

  /** Add an owned card (taken from the supply). Returns the builder; pass `uid` to refer to it later. */
  card(player: PlayerId, employeeId: EmployeeId, where: CardWhere = 'beach', uid?: Uid): this {
    const p = this.p(player);
    const id = uid ?? allocId(this.s, 'card');
    if (p.employees[id] || Object.values(this.s.players).some((o) => o.employees[id])) throw new Error(`duplicate uid ${id}`);
    const left = this.s.supply[employeeId];
    if (left !== undefined) {
      if (left <= 0) throw new Error(`supply of ${employeeId} is empty`);
      this.s.supply[employeeId] = left - 1;
    }
    p.employees[id] = { uid: id, employeeId, acquiredRound: Math.max(0, this.s.round - 1) };
    if (where === 'beach') p.beach.push(id);
    else if (where === 'work') p.structure.ceoSubs.push(id);
    else if (where === 'hand') {
      /* in hand: no location */
    } else if ('under' in where) {
      const subs = (p.structure.managerSubs[where.under] ??= []);
      subs.push(id);
    } else {
      const list = (p.busy[id] ??= []);
      list.push(where.busy);
    }
    return this;
  }

  restaurant(player: PlayerId, x: number, y: number, entrance: Corner, status: RestaurantStatus = 'open', id?: string): this {
    const p = this.p(player);
    if (p.restaurantsRemaining <= 0) throw new Error(`${player} has no restaurants left`);
    const rid = id ?? allocId(this.s, 'restaurant');
    const cells = rect(x, y, 2, 2);
    paint(this.s.board, cells, 'restaurant', rid);
    const ex = entrance.endsWith('W') ? x : x + 1;
    const ey = entrance.startsWith('N') ? y : y + 1;
    if (!touchesRoad(this.s.board, [{ x: ex, y: ey }])) throw new Error(`restaurant ${rid}: entrance ${entrance} does not touch a road`);
    this.s.board.restaurants[rid] = { id: rid, owner: player, x, y, entrance, status, placedRound: this.s.round };
    p.restaurantsRemaining -= 1;
    return this;
  }

  /** Add demand tokens to the house with this order number (π = 3.14). */
  demand(houseOrder: number, goods: FoodId[], by: PlayerId | null = null, campaign: string | null = null): this {
    const house = this.house(houseOrder);
    house.demand.push(...goods.map((good): DemandToken => ({ good, by, campaign })));
    return this;
  }

  /** Garden tile on side `side` of a printed house (base.md §6.6). */
  garden(houseOrder: number, side: Direction): this {
    const house = this.house(houseOrder);
    if (house.garden) throw new Error(`house ${houseOrder} already has a garden`);
    if (this.s.gardenTiles <= 0) throw new Error('no garden tiles left');
    const cells = gardenCells(house.cells, side);
    paint(this.s.board, cells, 'garden', house.id);
    house.garden = { cells, source: 'gardenTile' };
    this.s.gardenTiles -= 1;
    return this;
  }

  /** New business developer house (2x2 at x,y) with its garden on `gardenSide` (map.md §5). */
  placedHouse(order: number, x: number, y: number, gardenSide: Direction): this {
    const i = this.s.houseTiles.indexOf(order);
    if (i < 0) throw new Error(`house tile ${order} not available`);
    const id = allocId(this.s, 'house');
    const cells = rect(x, y, 2, 2);
    const garden = gardenCells(cells, gardenSide);
    paint(this.s.board, cells, 'house', id);
    paint(this.s.board, garden, 'garden', id);
    if (!touchesRoad(this.s.board, [...cells, ...garden])) throw new Error(`house ${order} does not touch a road`);
    this.s.board.houses[id] = { id, kind: 'placed', order, label: String(order), cells, garden: { cells: garden, source: 'withHouse' }, demand: [] };
    this.s.houseTiles.splice(i, 1);
    return this;
  }

  /** Ketchup rural area (off-board house that eats last, ketchup.md §12). */
  ruralArea(): this {
    const id = allocId(this.s, 'house');
    this.s.board.houses[id] = { id, kind: 'rural', order: 1000, label: 'Rural', cells: [], garden: null, demand: [] };
    return this;
  }

  campaign(spec: CampaignSpec): this {
    const id = spec.id ?? allocId(this.s, 'campaign');
    if (spec.placement.kind === 'board') {
      const { x, y, w, h } = spec.placement;
      const cells = rect(x, y, w, h);
      paint(this.s.board, cells, 'campaign', id);
      if (!touchesRoad(this.s.board, cells)) throw new Error(`campaign ${id} does not touch a road`);
    }
    const i = this.s.marketingTiles.indexOf(spec.number);
    if (i >= 0) this.s.marketingTiles.splice(i, 1);
    else if (spec.number <= 16) throw new Error(`marketing tile ${spec.number} not available`);
    const marketeer = spec.marketeer ?? null;
    this.s.board.campaigns[id] = {
      id,
      owner: spec.owner,
      number: spec.number,
      kind: spec.kind,
      goods: spec.goods,
      placement: spec.placement,
      remaining: spec.eternal ? 1 : spec.remaining,
      eternal: spec.eternal ?? false,
      marketeer,
      source: spec.source ?? 'marketeer',
      linked: [],
      placedRound: Math.max(1, this.s.round - 1),
    };
    return this;
  }

  /** Busy marketeer + its campaign in one call. */
  marketeerCampaign(employeeId: EmployeeId, uid: Uid, spec: Omit<CampaignSpec, 'marketeer'>): this {
    const id = spec.id ?? allocId(this.s, 'campaign');
    this.card(spec.owner, employeeId, { busy: id }, uid);
    return this.campaign({ ...spec, id, marketeer: uid });
  }

  /** Module board entity. On-board footprints are painted. */
  entity(e: ModuleEntity): this {
    if (e.kind === 'coffeeShop') paint(this.s.board, [{ x: e.x, y: e.y }], 'coffeeShop', e.id);
    if (e.kind === 'park') paint(this.s.board, rect(e.x, e.y, e.w, e.h), 'park', e.id);
    if (e.kind === 'lobbyistRoad') {
      paint(this.s.board, e.cells, 'road', e.id);
      for (const c of e.cells) {
        const cell = this.s.board.cells[c.y]?.[c.x];
        if (cell) cell.road = { links: [], bridge: false, underConstruction: e.underConstruction, roadworks: 0, lobbyistRoad: e.id };
      }
      linkLobbyistRoad(this.s, e.cells);
    }
    if (e.kind === 'roadworks') {
      const road = this.s.board.cells[e.y]?.[e.x]?.road;
      if (!road) throw new Error('roadworks must be on a road');
      road.roadworks += 1;
    }
    this.s.board.entities[e.id] = e;
    return this;
  }

  inventory(player: PlayerId, goods: FoodCounts): this {
    this.p(player).inventory = { ...goods };
    return this;
  }

  freezer(player: PlayerId, goods: FoodCounts): this {
    this.p(player).freezer = { ...goods };
    return this;
  }

  milestone(player: PlayerId, id: MilestoneId, round = Math.max(1, this.s.round - 1)): this {
    this.p(player).milestones[id] = { round, phase: 'working' };
    const m = (this.s.milestones[id] ??= { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null });
    if (!m.claimedBy.includes(player)) m.claimedBy.push(player);
    m.claimedRound = m.claimedRound === null ? round : Math.min(m.claimedRound, round);
    m.removed = round < this.s.round;
    return this;
  }

  reserve(player: PlayerId, card: ReserveCard): this {
    this.sec(player).reserve = card;
    return this;
  }

  secret(player: PlayerId, s: Partial<PlayerSecrets>): this {
    Object.assign(this.sec(player), s);
    return this;
  }

  turn(t: Partial<TurnState> & { player: PlayerId }): this {
    this.s.turn = { stage: 'recruit', uses: {}, hired: [], mustTrain: [], trained: {}, campaignsPlaced: [], used: [], ...t };
    return this;
  }

  pending(choice: PendingChoice): this {
    this.s.pending.push(choice);
    return this;
  }

  moduleState(module: ModuleId, value: unknown): this {
    this.s.moduleState[module] = value;
    return this;
  }

  /** Escape hatch for anything not covered above. */
  mutate(fn: (s: GameState) => void): this {
    fn(this.s);
    return this;
  }

  /** Placed tile id at grid position (row, col). */
  tileId(row: number, col: number): string {
    const t = this.s.board.tiles.find((x) => x.row === row && x.col === col);
    if (!t) throw new Error(`no tile at ${row},${col}`);
    return t.id;
  }

  /** Uid of a player's CEO card. */
  ceoUid(player: PlayerId): Uid {
    return this.p(player).structure.ceo;
  }

  /** House ids in dinnertime order (ascending `order`). */
  houseOrder(): HouseId[] {
    return Object.values(this.s.board.houses)
      .sort((a, b) => a.order - b.order)
      .map((h) => h.id);
  }

  /** Look up a house id by its order number. */
  houseId(order: number): HouseId {
    return this.house(order).id;
  }

  build(): GameState {
    const out = clone(this.s);
    if (!this.awaitingSet) out.awaiting = defaultAwaiting(out);
    assertValidState(out);
    return out;
  }

  private p(id: PlayerId): PlayerState {
    const p = this.s.players[id];
    if (!p) throw new Error(`unknown player ${id}`);
    return p;
  }

  private sec(id: PlayerId): PlayerSecrets {
    const s = this.s.secrets[id];
    if (!s) throw new Error(`unknown player ${id}`);
    return s;
  }

  private house(order: number): House {
    const h = Object.values(this.s.board.houses).find((x) => x.order === order);
    if (!h) throw new Error(`no house ${order} on the board`);
    return h;
  }
}

export function stateBuilder(opts?: StateBuilderOptions): StateBuilder {
  return new StateBuilder(opts);
}

/** Garden 2x1 strip on one side of a 2x2 house. */
export function gardenCells(house: Cell[], side: Direction): Cell[] {
  const xs = house.map((c) => c.x);
  const ys = house.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  switch (side) {
    case 'N':
      return rect(x0, y0 - 1, 2, 1);
    case 'S':
      return rect(x0, y0 + 2, 2, 1);
    case 'W':
      return rect(x0 - 1, y0, 1, 2);
    case 'E':
      return rect(x0 + 2, y0, 1, 2);
  }
}

/** Lobbyist roads connect to any orthogonally adjacent road ("parallel roads connect", ketchup.md §2). */
function linkLobbyistRoad(s: GameState, cells: Cell[]) {
  const dirs: [Direction, number, number, Direction][] = [
    ['N', 0, -1, 'S'],
    ['E', 1, 0, 'W'],
    ['S', 0, 1, 'N'],
    ['W', -1, 0, 'E'],
  ];
  for (const c of cells) {
    const road = s.board.cells[c.y]?.[c.x]?.road;
    if (!road) continue;
    for (const [d, dx, dy, back] of dirs) {
      const other = s.board.cells[c.y + dy]?.[c.x + dx]?.road;
      if (!other) continue;
      if (!road.links.includes(d)) road.links.push(d);
      if (!other.links.includes(back)) other.links.push(back);
    }
  }
}

/** Who the engine would be waiting on for this phase (approximation good enough for fixtures). */
export function defaultAwaiting(s: GameState): GameState['awaiting'] {
  const all = s.turnOrder.filter((id) => !s.players[id]?.bankrupt);
  const head = s.pending[0];
  if (head) return { kind: 'choice', players: [head.player] };
  const p = s.phase;
  switch (p.kind) {
    case 'setup.restaurants': {
      const who = p.order[p.idx];
      return { kind: 'setup.restaurant', players: who ? [who] : [] };
    }
    case 'setup.reserve':
      return { kind: 'setup.reserve', players: all.filter((id) => !s.secrets[id]?.reserve) };
    case 'restructuring':
      return { kind: 'restructure', players: all.filter((id) => !s.secrets[id]?.structureDraft) };
    case 'orderOfBusiness': {
      const who = p.queue.find((id) => p.picks[id] === undefined);
      return { kind: 'order', players: who ? [who] : [] };
    }
    case 'working':
      return { kind: 'work', players: [p.player] };
    case 'payday': {
      const who = p.queue[p.idx];
      return { kind: 'payday.fire', players: who ? [who] : [] };
    }
    case 'cleanup':
      return { kind: 'cleanup.freezer', players: all.filter((id) => s.players[id]?.milestones.first_throw_away) };
    default:
      return { kind: 'none', players: [] };
  }
}
