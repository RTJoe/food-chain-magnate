/**
 * Coffee (ketchup.md §4; DLX p10–14).
 *
 * Cards: Barista Trainee (x12, entry, no salary, 1 coffee) → Barista (x6, salary, 2) → Lead
 * Barista (x3, 1x, salary, 5). Coffee is made in the food step; it is not a drink, cannot be
 * marketed or frozen and is thrown away in Clean up (FoodDef).
 *
 * Coffee shops (3 per chain): 1x1, an entrance on every side, sell only coffee, and are valid
 * starts for every range (base `playerRouteStarts`). Placed only:
 * - when a card is trained into Barista or Lead Barista: within road range 2 of one of your open
 *   restaurants or coffee shops (a `coffeeShop` choice right after the training, or inline via
 *   `work.train.coffeeShop`);
 * - by "First coffee sold": in the Clean up of that round, in turn order, no range limit (the choice
 *   is queued when Clean up ends, so it is resolved before the next Restructuring).
 * Always on an empty square orthogonally adjacent to a road, on a tile without a coffee shop (any
 * chain). With all 3 on the map, one of yours is moved instead. No legal square → no shop.
 *
 * Dinnertime: the house first picks its restaurant ignoring coffee. It then travels a shortest
 * route (fewest borders, roadworks included) to that restaurant and buys 1 coffee (mandatory) at
 * each coffee shop and restaurant entrance of a chain with coffee next to the route, except the
 * destination restaurant; each location sells at most 1. Among shortest routes the one passing
 * the most coffee is taken; if several tie, only locations common to all of them sell.
 * Implementation: routes are simple paths (no square twice) of minimal cost; the search is
 * bounded (ROUTE_BUDGET expansions) and the best routes found are used. A chain's locations sell
 * in route order while it has coffee. Price = the seller's unit price × the house's garden/park
 * multiplier; it is Dinnertime income (CFO applies). Not for the rural area (no road route).
 */
import type { CoffeePlaceShop, WorkTrain } from '../../types/actions.js';
import type { MilestoneDef } from '../../types/content.js';
import type { GameModule, HookContext } from '../../types/module.js';
import type { Cell, Direction, GameState, House, PlayerId, Restaurant } from '../../types/index.js';
import type { Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { FOODS } from '../../content/foods.js';
import { DIRECTIONS, allEmpty, cellAt, cellKey, entranceOutside, houseSquares, onMap, paint, clearCells, restaurantCorners, step, tileOf, touchesRoad } from '../../map/grid.js';
import {
  canStep,
  cornerStarts,
  distanceField,
  distanceToFootprint,
  fieldAt,
  playerRouteStarts,
  restaurantStarts,
  roadAt,
  routeStartRoads,
  stepCost,
  type DistanceField,
} from '../../map/pathfinding.js';
import { awardMilestone, checkCashMilestones } from '../../rules/milestones.js';
import { payFromBank, payToBank } from '../../rules/bank.js';
import { unitPrice } from '../../rules/pricing.js';
import { headChoice, houseMultiplier, isRejected, kcard, pushChoice, registerChoiceKind, resolveHead, addExtraLuxuriesManager } from './shared.js';

const ID = 'ketchup:coffee' as const;
const REF = 'employees.md §2; ketchup.md §4';
export const SHOPS_PER_CHAIN = 3;
const ROUTE_BUDGET = 60_000;
const BARISTAS = ['ketchup:barista', 'ketchup:lead_barista'];

const FIRST_COFFEE_SOLD: MilestoneDef = {
  id: 'ketchup:first_coffee_sold',
  name: 'First coffee sold',
  module: ID,
  trigger: { kind: 'sold', good: 'coffee' },
  effects: [{ kind: 'extraCoffeeShop' }],
  timing: 'immediately',
  text: 'Place one extra coffee shop in this Clean up, anywhere (normal placement rules, no range limit).',
  rulesRef: 'ketchup.md §4; DLX p11',
};

// ---------------------------------------------------------------------------
// Coffee shops
// ---------------------------------------------------------------------------

export function shopsOf(s: GameState, player: PlayerId) {
  return Object.values(s.board.entities).filter((e): e is Extract<typeof e, { kind: 'coffeeShop' }> => e.kind === 'coffeeShop' && e.owner === player);
}

/** Why a coffee shop cannot go at (x, y) (null = legal). */
export function shopProblem(s: GameState, player: PlayerId, x: number, y: number, source: 'training' | 'milestone', moveFrom?: string, field?: DistanceField): string | null {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad coordinates';
  const c = { x, y };
  if (!onMap(s.board, c)) return 'The coffee shop must be on the map';
  const mine = shopsOf(s, player);
  if (moveFrom !== undefined) {
    if (!mine.some((e) => e.id === moveFrom)) return 'You can only move one of your own coffee shops';
    if (mine.length < SHOPS_PER_CHAIN) return 'You may only move a coffee shop when all yours are on the map';
  } else if (mine.length >= SHOPS_PER_CHAIN) return 'All your coffee shops are on the map: move one';
  if (!allEmpty(s.board, [c])) return 'Coffee shops go on empty squares';
  if (!touchesRoad(s.board, [c])) return 'A coffee shop must be next to a road';
  const tile = tileOf(s.board, c);
  for (const e of Object.values(s.board.entities)) {
    if (e.kind === 'coffeeShop' && e.id !== moveFrom && tileOf(s.board, e) === tile) return 'That tile already has a coffee shop';
  }
  if (source === 'training') {
    const f = field ?? shopRangeField(s, player, moveFrom);
    const d = distanceToFootprint(s.board, f, [c]);
    if (!(d <= 2)) return 'Out of range (road range 2 from your restaurants and coffee shops)';
  }
  return null;
}

/** Road distances from the player's open restaurants and coffee shops (a moved shop excluded). */
function shopRangeField(s: GameState, player: PlayerId, moveFrom?: string): DistanceField {
  const starts = playerRouteStarts(s.board, player).filter((st) => !(st.kind === 'coffeeShop' && st.entityId === moveFrom));
  return distanceField(s.board, starts.flatMap((st) => routeStartRoads(s.board, st)));
}

/** Every legal coffee shop placement for the player. */
export function shopPlacements(s: GameState, player: PlayerId, source: 'training' | 'milestone'): Extract<Placement, { kind: 'coffeeShop' }>[] {
  const mine = shopsOf(s, player);
  const moves: (string | undefined)[] = mine.length >= SHOPS_PER_CHAIN ? mine.map((e) => e.id) : [undefined];
  const out: Extract<Placement, { kind: 'coffeeShop' }>[] = [];
  for (const moveFrom of moves) {
    const field = source === 'training' ? shopRangeField(s, player, moveFrom) : undefined;
    for (let y = 0; y < s.board.h; y++) {
      for (let x = 0; x < s.board.w; x++) {
        if (cellAt(s.board, { x, y })?.kind !== 'empty') continue;
        if (!shopProblem(s, player, x, y, source, moveFrom, field)) out.push(moveFrom ? { kind: 'coffeeShop', x, y, moveFrom } : { kind: 'coffeeShop', x, y });
      }
    }
  }
  return out;
}

function placeShop(ctx: HookContext, player: PlayerId, x: number, y: number, moveFrom?: string): void {
  const s = ctx.state;
  if (moveFrom) {
    const old = s.board.entities[moveFrom];
    if (old?.kind === 'coffeeShop') {
      clearCells(s.board, [{ x: old.x, y: old.y }]);
      delete s.board.entities[moveFrom];
      ctx.emit({ type: 'entityRemoved', entityId: moveFrom });
    }
  }
  const id = ctx.id('entity');
  paint(s.board, [{ x, y }], 'coffeeShop', id);
  const entity = { kind: 'coffeeShop' as const, id, owner: player, x, y };
  s.board.entities[id] = entity;
  ctx.emit({ type: 'entityPlaced', player, entity: { ...entity } });
}

registerChoiceKind('coffeeShop', (s, c) => c.kind === 'coffeeShop' && shopPlacements(s, c.player, c.source).length > 0);

// ---------------------------------------------------------------------------
// Dinnertime coffee
// ---------------------------------------------------------------------------

interface CoffeeLocation {
  id: string;
  owner: PlayerId;
  /** Road squares the route must touch to pass it. */
  roads: Set<string>;
}

const coffeeStock = (s: GameState, player: PlayerId): number => {
  const p = s.players[player];
  return p ? (p.inventory.coffee ?? 0) + (p.freezer.coffee ?? 0) : 0;
};

function coffeeLocations(s: GameState, dest: Restaurant): CoffeeLocation[] {
  const out: CoffeeLocation[] = [];
  const sellers = new Set(s.turnOrder.filter((id) => !s.players[id]?.bankrupt && coffeeStock(s, id) > 0));
  if (!sellers.size) return out;
  const roadsAround = (cells: Cell[]) => new Set(cells.filter((c) => roadAt(s.board, c)).map(cellKey));
  for (const e of Object.values(s.board.entities)) {
    if (e.kind !== 'coffeeShop' || !sellers.has(e.owner)) continue;
    const roads = roadsAround(DIRECTIONS.map((d) => step({ x: e.x, y: e.y }, d)));
    if (roads.size) out.push({ id: e.id, owner: e.owner, roads });
  }
  for (const r of Object.values(s.board.restaurants)) {
    if (r.id === dest.id || r.status !== 'open' || !sellers.has(r.owner)) continue;
    const roads = roadsAround(restaurantCorners(r).flatMap((corner) => entranceOutside(r.x, r.y, corner)));
    if (roads.size) out.push({ id: r.id, owner: r.owner, roads });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Locations that sell coffee to a house routed to `dest`, in route order (ketchup.md §4).
 * Exported for tests.
 */
export function coffeeRouteSellers(s: GameState, house: House, dest: Restaurant): CoffeeLocation[] {
  if (house.cells.length === 0) return [];
  const locations = coffeeLocations(s, dest);
  if (!locations.length) return [];
  const board = s.board;
  const fR = distanceField(board, restaurantStarts(board, dest));
  const D = distanceToFootprint(board, fR, houseSquares(house));
  if (!Number.isFinite(D)) return [];
  const rw = (c: Cell) => roadAt(board, c)?.roadworks ?? 0;
  // Route ends: road squares outside the destination's usable corners, with the border to the corner.
  const endCost = new Map<string, number>();
  for (const corner of restaurantCorners(dest)) {
    for (const st of cornerStarts(board, dest, corner)) {
      const k = cellKey(st.cell);
      const v = st.cost - rw(st.cell);
      if (!endCost.has(k) || (endCost.get(k) as number) > v) endCost.set(k, v);
    }
  }
  // Route starts: road squares next to the house (or its garden).
  const starts = new Map<string, { cell: Cell; cost: number }>();
  for (const t of houseSquares(house)) {
    for (const d of DIRECTIONS) {
      const r = step(t, d);
      if (!roadAt(board, r)) continue;
      const cost = (tileOf(board, t) !== tileOf(board, r) ? 1 : 0) + rw(r);
      const k = cellKey(r);
      if (!starts.has(k) || (starts.get(k)?.cost as number) > cost) starts.set(k, { cell: r, cost });
    }
  }
  const remaining = (c: Cell) => fieldAt(fR, c) - rw(c);
  const byRoad = new Map<string, CoffeeLocation[]>();
  for (const loc of locations) for (const k of loc.roads) byRoad.set(k, [...(byRoad.get(k) ?? []), loc]);

  const found: string[][] = [];
  let budget = ROUTE_BUDGET;
  const path: Cell[] = [];
  const onPath = new Set<string>();
  const record = () => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const c of path) for (const loc of byRoad.get(cellKey(c)) ?? []) if (!seen.has(loc.id)) {
      seen.add(loc.id);
      order.push(loc.id);
    }
    found.push(order);
  };
  const dfs = (c: Cell, heading: Direction | null, cost: number) => {
    if (budget-- <= 0) return;
    const k = cellKey(c);
    const end = endCost.get(k);
    if (end !== undefined && cost + end === D) record();
    for (const d of DIRECTIONS) {
      const n = canStep(board, c, heading, d);
      if (!n) continue;
      const nk = cellKey(n);
      if (onPath.has(nk)) continue;
      const nc = cost + stepCost(board, c, n);
      if (nc + remaining(n) > D) continue;
      path.push(n);
      onPath.add(nk);
      dfs(n, d, nc);
      path.pop();
      onPath.delete(nk);
    }
  };
  for (const [k, st] of [...starts.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (st.cost + remaining(st.cell) > D) continue;
    path.push(st.cell);
    onPath.add(k);
    dfs(st.cell, null, st.cost);
    path.pop();
    onPath.delete(k);
  }
  if (!found.length) return [];
  const best = Math.max(...found.map((f) => f.length));
  if (best === 0) return [];
  const tied = found.filter((f) => f.length === best);
  const common = tied.slice(1).reduce((acc, f) => acc.filter((id) => f.includes(id)), tied[0] as string[]);
  const byId = new Map(locations.map((l) => [l.id, l]));
  return common.map((id) => byId.get(id) as CoffeeLocation);
}

function sellCoffee(ctx: HookContext, houseId: string, restaurantId: string): void {
  const s = ctx.state;
  const house = s.board.houses[houseId];
  const dest = s.board.restaurants[restaurantId];
  if (!house || !dest) return;
  for (const loc of coffeeRouteSellers(s, house, dest)) {
    const p = s.players[loc.owner];
    if (!p || coffeeStock(s, loc.owner) <= 0) continue;
    if ((p.inventory.coffee ?? 0) > 0) p.inventory.coffee = (p.inventory.coffee ?? 0) - 1;
    else p.freezer.coffee = (p.freezer.coffee ?? 0) - 1;
    if (p.inventory.coffee === 0) delete p.inventory.coffee;
    if (p.freezer.coffee === 0) delete p.freezer.coffee;
    const amount = unitPrice(ctx, loc.owner) * houseMultiplier(s, house);
    ctx.emit({ type: 'coffeeSold', houseId, player: loc.owner, at: loc.id, amount });
    p.earningsThisRound += amount;
    if (amount >= 0) payFromBank(ctx, loc.owner, amount, `coffee to house ${house.label}`);
    else payToBank(ctx, loc.owner, -amount, `coffee to house ${house.label}`);
    checkCashMilestones(ctx, loc.owner);
  }
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const COFFEE_MODULE: GameModule = {
  id: ID,
  name: 'Coffee',
  description: 'Baristas make coffee and open coffee shops; houses buy coffee on the way to dinner.',
  content: {
    foods: FOODS.filter((f) => f.id === 'coffee'),
    employees: [
      kcard('ketchup:barista_trainee', 'Barista Trainee', ID, 12, 'teal', 'coffee', { kind: 'produce', foods: ['coffee'], amount: 1, timing: 'working' }, 'Produce 1 coffee.', REF, {
        entry: true,
        trainsInto: ['ketchup:barista'],
      }),
      kcard('ketchup:barista', 'Barista', ID, 6, 'teal', 'coffee', { kind: 'produce', foods: ['coffee'], amount: 2, timing: 'working' }, 'Produce 2 coffee. Training into this card places a coffee shop.', REF, {
        salary: true,
        trainsInto: ['ketchup:lead_barista'],
      }),
      kcard('ketchup:lead_barista', 'Lead Barista', ID, 3, 'teal', 'coffee', { kind: 'produce', foods: ['coffee'], amount: 5, timing: 'working' }, 'Produce 5 coffee. Training into this card places a coffee shop.', REF, {
        salary: true,
        unique: true,
      }),
    ],
    milestones: [FIRST_COFFEE_SOLD],
    entities: [{ kind: 'coffeeShop', name: 'Coffee shop', module: ID, w: 1, h: 1, limit: { scope: 'perPlayer', count: SHOPS_PER_CHAIN }, rulesRef: 'ketchup.md §4' }],
  },
  actions: {
    'ketchup:coffee.placeShop': {
      validate(state, action) {
        const a = action as CoffeePlaceShop;
        const head = headChoice(state, a.playerId, a.choiceId, 'coffeeShop');
        if (isRejected(head)) return head;
        const problem = shopProblem(state, a.playerId, a.x, a.y, head.source, a.moveFrom);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as CoffeePlaceShop;
        placeShop(ctx, a.playerId, a.x, a.y, a.moveFrom);
        resolveHead(ctx, a.choiceId);
        return { undoable: true };
      },
    },
  },
  hooks: {
    onCreateGame(ctx) {
      addExtraLuxuriesManager(ctx, ID);
    },
    onEvent(ctx, event) {
      switch (event.type) {
        case 'employeeTrained':
          if (BARISTAS.includes(event.to) && ctx.state.phase.kind === 'working') pushChoice(ctx, { kind: 'coffeeShop', player: event.player, source: 'training', optional: false });
          return;
        case 'coffeeSold':
          awardMilestone(ctx, event.player, 'ketchup:first_coffee_sold');
          return;
        case 'sale':
          sellCoffee(ctx, event.houseId, event.restaurantId);
          return;
        default:
          return;
      }
    },
    onPhaseExit(ctx, phase) {
      // "First coffee sold": one extra shop each, at the end of that round's Clean up, in turn order.
      if (phase.kind !== 'cleanup') return;
      const s = ctx.state;
      const round = s.round - 1; // startRound already advanced the round
      for (const id of s.turnOrder) {
        const m = s.players[id]?.milestones['ketchup:first_coffee_sold'];
        if (m && m.round === round && !s.players[id]?.bankrupt) pushChoice(ctx, { kind: 'coffeeShop', player: id, source: 'milestone', optional: false });
      }
    },
    actionProblem(problem, ctx, { action }) {
      if (problem || action.type !== 'work.train' || !action.coffeeShop) return problem;
      const a = action as WorkTrain;
      const shop = a.coffeeShop as NonNullable<WorkTrain['coffeeShop']>;
      if (!BARISTAS.includes(a.toEmployeeId)) return 'Only training into a Barista or Lead Barista places a coffee shop';
      return shopProblem(ctx.state, a.playerId, shop.x, shop.y, 'training', shop.moveFrom);
    },
    onAction(ctx, action) {
      if (action.type !== 'work.train' || !action.coffeeShop) return;
      const head = ctx.state.pending[0];
      if (head?.kind !== 'coffeeShop' || head.player !== action.playerId || head.source !== 'training') return;
      const shop = action.coffeeShop;
      if (shopProblem(ctx.state, action.playerId, shop.x, shop.y, 'training', shop.moveFrom)) return;
      placeShop(ctx, action.playerId, shop.x, shop.y, shop.moveFrom);
      resolveHead(ctx, head.id);
    },
    legalActions(list, ctx, { player }) {
      const head = ctx.state.pending[0];
      if (head?.kind !== 'coffeeShop' || head.player !== player) return list;
      return [...list, { kind: 'placement', label: 'Place a coffee shop', actionType: 'ketchup:coffee.placeShop', spec: { kind: 'coffeeShop', choiceId: head.id } }];
    },
    legalPlacements(list, ctx, { player, spec }) {
      if (spec.kind !== 'coffeeShop') return list;
      const head = ctx.state.pending[0];
      if (head?.kind !== 'coffeeShop' || head.player !== player || (spec.choiceId && spec.choiceId !== head.id)) return list;
      return [...list, ...shopPlacements(ctx.state, player, head.source)];
    },
  },
};
