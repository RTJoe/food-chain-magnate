/**
 * Coffee (ketchup.md §4; DLX p10–14).
 *
 * Cards: Barista Trainee (x12, entry, no salary, 1 coffee) → Barista (x6, salary, 2) → Lead
 * Barista (x3, 1x, salary, 5). Coffee is made in the food step; it is not a drink, cannot be
 * marketed or frozen and is thrown away in Cleanup (FoodDef).
 *
 * Coffee shops (3 per chain): 1x1, an entrance on every side, sell only coffee, and are valid
 * starts for every range (base `playerRouteStarts`). Placed only:
 * - when a card is trained into Barista or Lead Barista: within road range 2 of one of your open
 *   restaurants or coffee shops (a `coffeeShop` choice right after the training, or inline via
 *   `work.train.coffeeShop`); one per such step, so Trainee → Lead Barista in one action gives two;
 * - by "First coffee sold": in the Cleanup of that round, in turn order, no range limit (the choice
 *   is queued when Cleanup ends, so it is resolved before the next Restructuring).
 * Always on an empty square orthogonally adjacent to a road, on a tile without a coffee shop (any
 * chain). With all 3 on the map, one of yours is moved instead. No legal square → no shop.
 *
 * Dinnertime: the house first picks its restaurant ignoring coffee. It then travels a shortest
 * route (fewest borders, roadworks included) to that chain — to any of its open restaurants at
 * the winning distance (KX p12 Example 1, p14 Example 3) — and buys 1 coffee (mandatory) at each
 * coffee shop and restaurant entrance of a chain with coffee next to the route, except the route's
 * own end restaurant; each location sells at most 1. A route may trace road squares again and go
 * round loops; it only may not step straight back (DLX p10 Backtracking; KX p13 Example 2, p14
 * Example 4). Among shortest routes the one that would sell the most coffee with the chains' current
 * stock is taken; if several tie, only the locations on all of them sell, as far as stock goes (KX
 * p12 Tied Routes; JD BGG 3013738). A route passes every location it can along its tiles.
 * Implementation: a search over (square, heading, cost, locations passed), bounded by
 * ROUTE_BUDGET expansions. A chain's locations sell nearest-the-house first while it has coffee.
 * Price = the seller's unit price × the house's garden/park multiplier, plus the seller's Fry Chef
 * bonus once per house unless it also served the meal (KX p21; JD BGG 2342129); it is Dinnertime
 * income (CFO applies). The rural area buys too: its route starts at a freeway's road square
 * (KX p25-26: "treated as one (potentially enormous) house"; distance "starting from any Freeway").
 */
import type { CoffeePlaceShop, WorkTrain } from '../../types/actions.js';
import type { MilestoneDef } from '../../types/content.js';
import type { GameModule, HookContext } from '../../types/module.js';
import type { Cell, Direction, GameState, House, PlayerId, Restaurant } from '../../types/index.js';
import type { Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { FOODS } from '../../content/foods.js';
import { DIRECTIONS, opposite, allEmpty, cellAt, cellKey, entranceOutside, houseSquares, onMap, paint, clearCells, restaurantCorners, step, tileOf, touchesRoad } from '../../map/grid.js';
import {
  canStep,
  cornerStarts,
  distanceField,
  distanceToFootprint,
  fieldAt,
  playerRouteStarts,
  restaurantHouseDistance,
  restaurantStarts,
  roadAt,
  routeStartRoads,
  stepCost,
  type DistanceField,
  type RoadStart,
} from '../../map/pathfinding.js';
import { awardMilestone, checkCashMilestones } from '../../rules/milestones.js';
import { payFromBank, payToBank } from '../../rules/bank.js';
import { unitPrice } from '../../rules/pricing.js';
import { freewayRoads } from './ruralMarketeers.js';
import { rulesBefore } from '../../core/rulesVersion.js';
import { headChoice, houseMultiplier, isRejected, kcard, pushChoice, registerChoiceKind, resolveHead, addExtraLuxuriesManager, workDefs } from './shared.js';

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
  text: 'Place one extra coffee shop in this Cleanup, anywhere (normal placement rules, no range limit).',
  rulesRef: 'ketchup.md §4; DLX p11',
};

// ---------------------------------------------------------------------------
// Coffee shops
// ---------------------------------------------------------------------------

/** KX p11: with all 3 shops on the map a player "MAY move" one, so the choice can be declined (Q-K19). */
const allShopsPlaced = (s: GameState, player: PlayerId): boolean => shopsOf(s, player).length >= SHOPS_PER_CHAIN;

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
      ctx.emit({ type: 'entityRemoved', entityId: moveFrom, kind: old.kind });
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

function coffeeLocations(s: GameState): CoffeeLocation[] {
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
    if (r.status !== 'open' || !sellers.has(r.owner)) continue;
    const roads = roadsAround(restaurantCorners(r).flatMap((corner) => entranceOutside(r.x, r.y, corner)));
    if (roads.size) out.push({ id: r.id, owner: r.owner, roads });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Locations that sell coffee to a house that eats at `dest`'s chain (ketchup.md §4; KX p11–14).
 * Routes go to every open restaurant of that chain at the same distance as `dest` (KX p12
 * Example 1, p14 Example 3). A route may trace a road square again and go round loops; it only
 * may not step straight back onto the square it just left (DLX p10 Backtracking, KX p13
 * Example 2, p14 Example 4). Each route excludes only its own end restaurant. Roughly in route
 * order (nearest the house first). Exported for tests.
 */
export function coffeeRouteSellers(s: GameState, house: House, dest: Restaurant): CoffeeLocation[] {
  // KX p25-26: the rural area is "one (potentially enormous) house" whose route starts at a freeway.
  const rural = house.kind === 'rural';
  if (house.cells.length === 0 && !rural) return [];
  const locations = coffeeLocations(s);
  if (!locations.length) return [];
  const board = s.board;
  const ruralEnds = rural
    ? Object.values(board.entities).flatMap((e) => (e.kind === 'freeway' ? freewayRoads(s, e) : []))
    : [];
  // Distance as Dinnertime measures it (ruralMarketeers.ts `ruralDistance` for the rural area, Q-K7).
  const distanceOf = (r: Restaurant): number | null => {
    if (!rural) return restaurantHouseDistance(board, r, house);
    const field = distanceField(board, restaurantStarts(board, r));
    const d = Math.min(...ruralEnds.map((c) => fieldAt(field, c)));
    return Number.isFinite(d) ? d : null;
  };
  const D = distanceOf(dest);
  if (D === null) return [];
  const dests = Object.values(board.restaurants)
    .filter((r) => r.id === dest.id || (r.owner === dest.owner && r.status === 'open' && distanceOf(r) === D))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fR = distanceField(board, dests.flatMap((r) => restaurantStarts(board, r)));
  const rw = (c: Cell) => roadAt(board, c)?.roadworks ?? 0;
  // Route ends: road squares outside a destination's usable corners, with the border to the corner.
  const endCost = new Map<string, Map<string, number>>();
  for (const r of dests) {
    for (const corner of restaurantCorners(r)) {
      for (const st of cornerStarts(board, r, corner)) {
        const k = cellKey(st.cell);
        const v = st.cost - rw(st.cell);
        const ends = endCost.get(k) ?? new Map<string, number>();
        if (!ends.has(r.id) || (ends.get(r.id) as number) > v) ends.set(r.id, v);
        endCost.set(k, ends);
      }
    }
  }
  // Route starts: road squares next to the house (or its garden); for the rural area, the road
  // squares its freeways touch (Q-K7: entering them costs only their roadworks).
  const starts = new Map<string, RoadStart>();
  for (const c of ruralEnds) {
    const k = cellKey(c);
    const cost = rw(c);
    if (!starts.has(k) || (starts.get(k)?.cost as number) > cost) starts.set(k, { cell: c, cost });
  }
  for (const t of houseSquares(house)) {
    for (const d of DIRECTIONS) {
      const r = step(t, d);
      if (!roadAt(board, r)) continue;
      const cost = (tileOf(board, t) !== tileOf(board, r) ? 1 : 0) + rw(r);
      const k = cellKey(r);
      if (!starts.has(k) || (starts.get(k)?.cost as number) > cost) starts.set(k, { cell: r, cost });
    }
  }
  const fH = distanceField(board, [...starts.values()]);
  const remaining = (c: Cell) => fieldAt(fR, c) - rw(c);
  // Only squares on some shortest walk matter; index the locations next to them (bit per location).
  const onWalk = (c: Cell) => fieldAt(fH, c) + remaining(c) <= D;
  const relevant = locations.filter((l) => [...l.roads].some((k) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return onWalk({ x, y });
  }));
  if (!relevant.length) return [];
  const bit = new Map(relevant.map((l, i) => [l.id, 1n << BigInt(i)]));
  const maskAt = new Map<string, bigint>();
  relevant.forEach((l, i) => {
    for (const k of l.roads) maskAt.set(k, (maskAt.get(k) ?? 0n) | (1n << BigInt(i)));
  });

  // Walk states (square, heading, cost, locations passed); each is expanded once. From rules v3 a
  // state also carries the tiles the walk has crossed into: a route is its sequence of tiles, and
  // walks along the same tiles are the same route (JD BGG 3013738: a route passes every location
  // it can without crossing more borders).
  const legacy = rulesBefore(s, 3);
  const ends = new Set<bigint>();
  const routes = new Map<string, Set<bigint>>();
  const seen = new Set<string>();
  const stack: { c: Cell; heading: Direction | null; cost: number; mask: bigint; tiles: string }[] = [];
  const push = (c: Cell, heading: Direction | null, cost: number, mask: bigint, tiles: string) => {
    const key = `${cellKey(c)}|${heading ?? '-'}|${cost}|${mask}${legacy ? '' : `|${tiles}`}`;
    if (seen.has(key)) return;
    seen.add(key);
    stack.push({ c, heading, cost, mask, tiles });
  };
  for (const [k, st] of [...starts.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (st.cost + remaining(st.cell) <= D) push(st.cell, null, st.cost, maskAt.get(k) ?? 0n, String(tileOf(board, st.cell)));
  }
  let budget = ROUTE_BUDGET;
  while (stack.length && budget-- > 0) {
    const { c, heading, cost, mask, tiles } = stack.pop() as (typeof stack)[number];
    for (const [rid, end] of endCost.get(cellKey(c)) ?? []) {
      // The route's own end restaurant never sells to it (KX p11).
      if (cost + end !== D) continue;
      const m = mask & ~(bit.get(rid) ?? 0n);
      ends.add(m);
      const key = `${tiles}>${rid}`;
      routes.set(key, (routes.get(key) ?? new Set<bigint>()).add(m));
    }
    for (const d of DIRECTIONS) {
      if (heading !== null && d === opposite(heading)) continue;
      const n = canStep(board, c, heading, d);
      if (!n) continue;
      const nc = cost + stepCost(board, c, n);
      if (nc + remaining(n) > D) continue;
      const t = String(tileOf(board, n));
      push(n, d, nc, mask | (maskAt.get(cellKey(n)) ?? 0n), legacy || tiles.endsWith(`/${t}`) || tiles === t ? tiles : `${tiles}/${t}`);
    }
  }
  if (!ends.size) return [];
  const near = (l: CoffeeLocation) => Math.min(...[...l.roads].map((k) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return fieldAt(fH, { x, y });
  }));
  const ordered = relevant
    .map((l) => ({ l, d: near(l) }))
    .sort((a, b) => a.d - b.d || (a.l.id < b.l.id ? -1 : a.l.id > b.l.id ? 1 : 0))
    .map((x) => x.l);
  // KX p12 Tied Routes, JD BGG 3013738: score each route by the coffee it would actually sell with
  // the chains' current stock (nearest the house first), keep the routes selling the most, and let
  // only the selling locations common to all of them sell.
  const selling = (m: bigint): bigint => {
    const used = new Map<PlayerId, number>();
    let out = 0n;
    for (const l of ordered) {
      const b = bit.get(l.id) as bigint;
      if ((m & b) === 0n) continue;
      const n = used.get(l.owner) ?? 0;
      if (n >= coffeeStock(s, l.owner)) continue;
      used.set(l.owner, n + 1);
      out |= b;
    }
    return out;
  };
  const count = (m: bigint) => relevant.reduce((a, l) => a + ((m & (bit.get(l.id) as bigint)) !== 0n ? 1 : 0), 0);
  const all = (1n << BigInt(relevant.length)) - 1n;
  const sells = (m: bigint) => ordered.filter((l) => (m & (bit.get(l.id) as bigint)) !== 0n);
  if (legacy) {
    // LEGACY(v2): only locations that would sell on every best route sold.
    const counted = [...ends].map((m) => {
      const sold = selling(m);
      return { m: sold, n: count(sold) };
    });
    const best = Math.max(...counted.map((x) => x.n));
    if (best === 0) return [];
    return sells(counted.filter((x) => x.n === best).reduce((acc, x) => acc & x.m, all));
  }
  // JD BGG 3013738 (a41573360, a41574037, a41574346): 1. the shortest routes, each passing every
  // location it can (per sequence of tiles, drop a walk that passes a strict subset of another's
  // locations); 2. score each by the coffee it would sell with the chains' actual stock; 3. among
  // the routes selling the most, the locations on all of them sell (stock permitting).
  const candidates = [...routes.values()].flatMap((set) => {
    const ms = [...set];
    return ms.filter((m) => !ms.some((o) => o !== m && (o & m) === m));
  });
  const counted = candidates.map((m) => ({ m, n: count(selling(m)) }));
  const best = Math.max(...counted.map((x) => x.n));
  if (best === 0) return [];
  return sells(selling(counted.filter((x) => x.n === best).reduce((acc, x) => acc & x.m, all)));
}

/** Total Fry Chef bonus ($ per sale) of a player's cards at work (ketchup.md §9). */
function fryChefBonus(s: GameState, player: PlayerId): number {
  const p = s.players[player];
  return p ? workDefs(s, p).reduce((a, x) => a + (x.def.ability.kind === 'fryChef' ? x.def.ability.bonusPerSale : 0), 0) : 0;
}

function sellCoffee(ctx: HookContext, houseId: string, restaurantId: string, mealSeller: PlayerId): void {
  const s = ctx.state;
  const house = s.board.houses[houseId];
  const dest = s.board.restaurants[restaurantId];
  if (!house || !dest) return;
  const paidBonus = new Set<PlayerId>([mealSeller]);
  for (const loc of coffeeRouteSellers(s, house, dest)) {
    const p = s.players[loc.owner];
    if (!p || coffeeStock(s, loc.owner) <= 0) continue;
    if ((p.inventory.coffee ?? 0) > 0) p.inventory.coffee = (p.inventory.coffee ?? 0) - 1;
    else p.freezer.coffee = (p.freezer.coffee ?? 0) - 1;
    if (p.inventory.coffee === 0) delete p.inventory.coffee;
    if (p.freezer.coffee === 0) delete p.freezer.coffee;
    // Fry Chefs: +$10 each, once per house a chain sells to; none again for the chain that served the meal (JD BGG 2342129, KX p21).
    const bonus = paidBonus.has(loc.owner) ? 0 : fryChefBonus(s, loc.owner);
    paidBonus.add(loc.owner);
    const amount = unitPrice(ctx, loc.owner) * houseMultiplier(s, house) + bonus;
    ctx.emit({ type: 'coffeeSold', houseId, player: loc.owner, at: loc.id, amount, ...(bonus ? { fryChefBonus: bonus } : {}) });
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
          if (ctx.state.phase.kind !== 'working') return;
          // KX p11: each step into a Barista or a Lead Barista places a shop, so a Coach/Guru taking a
          // Barista Trainee straight to Lead Barista places two, in step order (JD BGG 2379732).
          (event.path ?? [event.to]).filter((id) => BARISTAS.includes(id)).forEach((_, i) => {
            const optional = shopsOf(ctx.state, event.player).length + i >= SHOPS_PER_CHAIN;
            pushChoice(ctx, { kind: 'coffeeShop', player: event.player, source: 'training', optional });
          });
          return;
        case 'coffeeSold':
          awardMilestone(ctx, event.player, 'ketchup:first_coffee_sold');
          return;
        case 'sale':
          sellCoffee(ctx, event.houseId, event.restaurantId, event.player);
          return;
        default:
          return;
      }
    },
    onPhaseExit(ctx, phase) {
      // "First coffee sold": one extra shop each, at the end of that round's Cleanup, in turn order.
      if (phase.kind !== 'cleanup') return;
      const s = ctx.state;
      for (const id of s.turnOrder) {
        const m = s.players[id]?.milestones['ketchup:first_coffee_sold'];
        if (m && m.round === s.round && !s.players[id]?.bankrupt) pushChoice(ctx, { kind: 'coffeeShop', player: id, source: 'milestone', optional: allShopsPlaced(s, id) });
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
