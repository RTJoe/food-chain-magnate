/**
 * Road routing: distances, ranges and drink-buyer routes, all measured in TILE BORDERS CROSSED
 * (base.md §14), never in squares.
 *
 * Connectivity (map.md §2, base.md §14): a route moves square by square over road squares. Any
 * two orthogonally adjacent road squares connect, within a tile or across a tile border. Except:
 * - bridge squares (tiles G, P): straight through only, no turning on the bridge;
 * - capped sides (`RoadCell.capped`) and Lobbyist roads under construction (Ketchup);
 * - a restaurant entrance never links two roads: routes start ON a road square next to it.
 * Each step that enters a square on a different tile costs 1. Entering a square with Ketchup
 * roadworks costs +1 per marker (questions.md Q-K2: all road routes).
 *
 * Starting a route (base.md §2.6.4, §6.5, §14): from an entrance corner (all 4 corners with a
 * drive-in) the route begins on one of the road squares orthogonally adjacent to that corner from
 * outside the restaurant. If that road square is on another tile than the corner square, the route
 * starts at cost 1. Ending at a piece (house, campaign, new restaurant entrance): the piece is
 * reached from a road square orthogonally adjacent to one of its squares; if that square and the
 * road square are on different tiles the extra border counts (DLX p19 example C; symmetric with
 * the start rule; questions.md Q-C1).
 *
 * API for other rules code (C2 dinnertime/marketing use the first group):
 * - `restaurantHouseDistance(board, restaurant, house)` → borders or null if not connected.
 * - `chainHouseDistance(board, playerId, house)` → nearest OPEN restaurant of a chain, or null.
 * - `houseRoadCells(board, house)` → road squares adjacent to house or garden.
 * - `restaurantStarts(board, restaurant)`, `routeStartRoads(board, start)`, `playerRouteStarts`.
 * - `distanceField(board, starts)` + `distanceToFootprint(board, field, cells)`: generic
 *   "how far is this piece" (marketeer range, local manager range 3).
 * - Buyers: `validateRoadRoute`, `enumerateRoadRoutes` (cart/truck), `validateAirRoute`,
 *   `enumerateAirRoutes` (zeppelin), `sourcesAdjacentToPath`.
 */
import type { RouteStart } from '../types/actions.js';
import type { Direction } from '../types/content.js';
import type { Board, Cell, Corner, House, PlayerId, Restaurant, RoadCell, SourceId } from '../types/state.js';
import {
  DIRECTIONS,
  adjacentRoadCells,
  cellAt,
  cellIndex,
  cellFromIndex,
  cornerCell,
  dirBetween,
  entranceOutside,
  houseSquares,
  opposite,
  restaurantCorners,
  sameCell,
  step,
  tileCoord,
  tileOf,
} from './grid.js';

/** A road square where a route may begin and the cost already spent getting onto it. */
export interface RoadStart {
  cell: Cell;
  cost: number;
}

const DIR_INDEX: Record<Direction, number> = { N: 0, E: 1, S: 2, W: 3 };
const NO_HEADING = 4;

/** Usable road square (exists, is road, not under construction). */
export function roadAt(board: Board, c: Cell): RoadCell | null {
  const cell = cellAt(board, c);
  if (!cell || cell.kind !== 'road' || !cell.road || cell.road.underConstruction) return null;
  return cell.road;
}

/**
 * Can a route standing on `from`, having last moved in `heading` (null at the start), step in
 * direction `d`? Applies bridges (straight on) and capped sides. Does NOT apply the buyers'
 * no-immediate-reversal rule (shortest routes never reverse).
 */
export function canStep(board: Board, from: Cell, heading: Direction | null, d: Direction): Cell | null {
  const here = roadAt(board, from);
  if (!here) return null;
  if (here.bridge && heading !== null && d !== heading) return null;
  if (here.capped?.includes(d)) return null;
  const to = step(from, d);
  const there = roadAt(board, to);
  if (!there) return null;
  if (there.capped?.includes(opposite(d))) return null;
  return to;
}

/** Cost of stepping from `from` onto adjacent road square `to`. */
export function stepCost(board: Board, from: Cell, to: Cell): number {
  return (tileOf(board, from) !== tileOf(board, to) ? 1 : 0) + (roadAt(board, to)?.roadworks ?? 0);
}

/** Road squares a route from an origin square (entrance corner, coffee shop) may begin on. */
export function startsFromOrigin(board: Board, origin: Cell, candidates: Cell[]): RoadStart[] {
  const out: RoadStart[] = [];
  for (const c of candidates) {
    const road = roadAt(board, c);
    if (!road) continue;
    out.push({ cell: c, cost: (tileOf(board, origin) !== tileOf(board, c) ? 1 : 0) + road.roadworks });
  }
  return out;
}

/** Road starts for one entrance corner of a restaurant (base.md §14). */
export function cornerStarts(board: Board, r: Pick<Restaurant, 'x' | 'y'>, corner: Corner): RoadStart[] {
  return startsFromOrigin(board, cornerCell(r.x, r.y, corner), entranceOutside(r.x, r.y, corner));
}

/** Road starts for every usable corner of a restaurant (entrance, or all 4 with a drive-in). */
export function restaurantStarts(board: Board, r: Restaurant): RoadStart[] {
  return restaurantCorners(r).flatMap((corner) => cornerStarts(board, r, corner));
}

/** Road starts for a `RouteStart` (restaurant corner or Ketchup coffee shop). Empty if invalid. */
export function routeStartRoads(board: Board, start: RouteStart): RoadStart[] {
  if (start.kind === 'restaurant') {
    const r = board.restaurants[start.restaurantId];
    if (!r || !restaurantCorners(r).includes(start.corner)) return [];
    return cornerStarts(board, r, start.corner);
  }
  const e = board.entities[start.entityId];
  if (!e || e.kind !== 'coffeeShop') return [];
  const origin = { x: e.x, y: e.y };
  return startsFromOrigin(board, origin, DIRECTIONS.map((d) => step(origin, d)));
}

/** The square a route start sits on (corner square / coffee shop square), or null. */
export function routeStartOrigin(board: Board, start: RouteStart): Cell | null {
  if (start.kind === 'restaurant') {
    const r = board.restaurants[start.restaurantId];
    return r ? cornerCell(r.x, r.y, start.corner) : null;
  }
  const e = board.entities[start.entityId];
  return e && e.kind === 'coffeeShop' ? { x: e.x, y: e.y } : null;
}

/**
 * Every place a player's ranges may start from: each usable corner of each OPEN restaurant
 * (COMING SOON restaurants are not open, base.md §6.4, §6.7), plus Ketchup coffee shops.
 */
export function playerRouteStarts(board: Board, playerId: PlayerId): RouteStart[] {
  const out: RouteStart[] = [];
  const restaurants = Object.values(board.restaurants)
    .filter((r) => r.owner === playerId && r.status === 'open')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of restaurants) for (const corner of restaurantCorners(r)) out.push({ kind: 'restaurant', restaurantId: r.id, corner });
  for (const e of Object.values(board.entities)) if (e.kind === 'coffeeShop' && e.owner === playerId) out.push({ kind: 'coffeeShop', entityId: e.id });
  return out;
}

// ---------------------------------------------------------------------------
// Distance fields
// ---------------------------------------------------------------------------

/** Minimum borders crossed to stand on each road square (`Infinity` = unreachable). Index = y*w+x. */
export interface DistanceField {
  w: number;
  h: number;
  dist: number[];
}

/** Multi-source shortest routes over the road graph (Dial's algorithm; costs are small ints). */
export function distanceField(board: Board, starts: RoadStart[]): DistanceField {
  const n = board.w * board.h;
  const best = new Array<number>(n * 5).fill(Infinity);
  const buckets: number[][] = [];
  const push = (state: number, cost: number) => {
    if (cost >= (best[state] as number)) return;
    best[state] = cost;
    (buckets[cost] ??= []).push(state);
  };
  for (const s of starts) if (roadAt(board, s.cell)) push(cellIndex(board, s.cell) * 5 + NO_HEADING, s.cost);
  for (let cost = 0; cost < buckets.length; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const state = bucket[i] as number;
      if ((best[state] as number) !== cost) continue;
      const ci = Math.floor(state / 5);
      const hi = state % 5;
      const here = cellFromIndex(board, ci);
      const heading = hi === NO_HEADING ? null : (DIRECTIONS[hi] as Direction);
      for (const d of DIRECTIONS) {
        const to = canStep(board, here, heading, d);
        if (!to) continue;
        push(cellIndex(board, to) * 5 + DIR_INDEX[d], cost + stepCost(board, here, to));
      }
    }
  }
  const dist = new Array<number>(n).fill(Infinity);
  for (let i = 0; i < n * 5; i++) {
    const c = Math.floor(i / 5);
    if ((best[i] as number) < (dist[c] as number)) dist[c] = best[i] as number;
  }
  return { w: board.w, h: board.h, dist };
}

export function fieldAt(field: DistanceField, c: Cell): number {
  if (c.x < 0 || c.y < 0 || c.x >= field.w || c.y >= field.h) return Infinity;
  return field.dist[c.y * field.w + c.x] ?? Infinity;
}

/**
 * Distance to a piece occupying `cells`: min over a piece square `t` and an orthogonally adjacent
 * road square `r` of field[r] + (t, r on different tiles ? 1 : 0). `Infinity` if not connected.
 */
export function distanceToFootprint(board: Board, field: DistanceField, cells: Cell[]): number {
  let best = Infinity;
  for (const t of cells) {
    for (const d of DIRECTIONS) {
      const r = step(t, d);
      if (!roadAt(board, r)) continue;
      const v = fieldAt(field, r) + (tileOf(board, r) !== tileOf(board, t) ? 1 : 0);
      if (v < best) best = v;
    }
  }
  return best;
}

/** Road squares orthogonally adjacent to a house or its garden (base.md §7.2, §14). */
export function houseRoadCells(board: Board, house: Pick<House, 'cells' | 'garden'>): Cell[] {
  return adjacentRoadCells(board, houseSquares(house));
}

/**
 * Dinnertime distance (base.md §7.5): fewest borders crossed along roads from the restaurant's
 * entrance (nearest corner with a drive-in) to the house or its garden. Null = not connected.
 * Does not check restaurant status.
 */
export function restaurantHouseDistance(board: Board, restaurant: Restaurant, house: Pick<House, 'cells' | 'garden'>): number | null {
  const field = distanceField(board, restaurantStarts(board, restaurant));
  const d = distanceToFootprint(board, field, houseSquares(house));
  return Number.isFinite(d) ? d : null;
}

/**
 * The chain's best OPEN restaurant for a house: lowest distance, ties by restaurant id.
 * Null if no open restaurant of the chain is connected (base.md §7.2).
 */
export function chainHouseDistance(board: Board, playerId: PlayerId, house: Pick<House, 'cells' | 'garden'>): { restaurantId: string; distance: number } | null {
  let best: { restaurantId: string; distance: number } | null = null;
  const rs = Object.values(board.restaurants)
    .filter((r) => r.owner === playerId && r.status === 'open')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of rs) {
    const d = restaurantHouseDistance(board, r, house);
    if (d !== null && (best === null || d < best.distance)) best = { restaurantId: r.id, distance: d };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Shortest routes (delivery paths for animation; same costs as the distance fields)
// ---------------------------------------------------------------------------

/** Route starts grouped by their `RouteStart` (one per usable corner / coffee shop). */
export interface RouteSearchStart {
  from: RouteStart;
  roads: RoadStart[];
}

/**
 * Shortest road route from any start to any target road square: fewest borders (stepCost, so
 * roadworks count) then fewest squares. `targets` maps a road square's index (cellIndex) to an
 * extra cost paid on arrival (house square on another tile). Same moves as `distanceField`
 * (bridges, capped sides), so `cost` equals the distance the field reports. Deterministic.
 */
export function shortestRoute(board: Board, starts: RouteSearchStart[], targets: ReadonlyMap<number, number>): { from: RouteStart; path: Cell[]; cost: number } | null {
  if (!targets.size) return null;
  const n = board.w * board.h * 5;
  // Lexicographic (borders, squares) with a two-level bucket queue: queue[borders][squares] = states.
  const bestC = new Int32Array(n).fill(0x3fffffff);
  const bestS = new Int32Array(n).fill(0x3fffffff);
  const prev = new Int32Array(n).fill(-1);
  const origin = new Int32Array(n);
  const queue: number[][][] = [];
  const better = (st: number, c: number, k: number) => c < (bestC[st] as number) || (c === bestC[st] && k < (bestS[st] as number));
  const push = (st: number, c: number, k: number, from: number, start: number) => {
    if (st < 0 || st >= n || !better(st, c, k)) return;
    bestC[st] = c;
    bestS[st] = k;
    prev[st] = from;
    origin[st] = start;
    ((queue[c] ??= [])[k] ??= []).push(st);
  };
  starts.forEach((st, si) => {
    for (const r of st.roads) if (roadAt(board, r.cell)) push(cellIndex(board, r.cell) * 5 + NO_HEADING, r.cost, 1, -1, si);
  });
  let found: { state: number; c: number; k: number } | null = null;
  for (let c = 0; c < queue.length; c++) {
    if (found && c >= found.c) break;
    const level = queue[c];
    if (!level) continue;
    for (let k = 0; k < level.length; k++) {
      const bucket = level[k];
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const state = bucket[i] as number;
        if (bestC[state] !== c || bestS[state] !== k) continue;
        const ci = Math.floor(state / 5);
        const extra = targets.get(ci);
        if (extra !== undefined && (!found || c + extra < found.c || (c + extra === found.c && k < found.k))) found = { state, c: c + extra, k };
        const here = cellFromIndex(board, ci);
        const hi = state % 5;
        const heading = hi === NO_HEADING ? null : (DIRECTIONS[hi] as Direction);
        for (const d of DIRECTIONS) {
          const to = canStep(board, here, heading, d);
          if (!to) continue;
          push(cellIndex(board, to) * 5 + DIR_INDEX[d], c + stepCost(board, here, to), k + 1, state, origin[state] as number);
        }
      }
    }
  }
  if (!found) return null;
  const path: Cell[] = [];
  for (let st = found.state; st >= 0; st = prev[st] as number) path.unshift(cellFromIndex(board, Math.floor(st / 5)));
  const start = starts[origin[found.state] as number] as RouteSearchStart;
  return { from: start.from, path, cost: found.c };
}

/** Search starts for every usable corner of a restaurant. */
export function restaurantRouteStarts(board: Board, r: Restaurant): RouteSearchStart[] {
  return restaurantCorners(r).map((corner) => ({ from: { kind: 'restaurant', restaurantId: r.id, corner }, roads: cornerStarts(board, r, corner) }));
}

/**
 * The delivery route behind `restaurantHouseDistance`: from the restaurant's entrance (or the best
 * drive-in corner) to a road square next to the house or its garden. Null if not connected.
 */
export function restaurantHouseRoute(board: Board, restaurant: Restaurant, house: Pick<House, 'cells' | 'garden'>): { from: RouteStart; path: Cell[]; cost: number } | null {
  const targets = new Map<number, number>();
  for (const t of houseSquares(house))
    for (const d of DIRECTIONS) {
      const r = step(t, d);
      if (!roadAt(board, r)) continue;
      const extra = tileOf(board, r) !== tileOf(board, t) ? 1 : 0;
      const i = cellIndex(board, r);
      if (extra < (targets.get(i) ?? Infinity)) targets.set(i, extra);
    }
  return shortestRoute(board, restaurantRouteStarts(board, restaurant), targets);
}

// ---------------------------------------------------------------------------
// Drink buyers (base.md §6.5)
// ---------------------------------------------------------------------------

/** Sources orthogonally adjacent to any square of a road path, each once, in id order. */
export function sourcesAdjacentToPath(board: Board, path: Cell[]): SourceId[] {
  const out = new Set<SourceId>();
  for (const c of path) {
    for (const d of DIRECTIONS) {
      const occ = cellAt(board, step(c, d));
      if (occ?.kind === 'drink' && occ.occupant && board.drinkSources[occ.occupant]) out.add(occ.occupant);
    }
  }
  return [...out].sort(byId);
}

const byId = (a: string, b: string): number => {
  const na = Number(/-(\d+)$/.exec(a)?.[1] ?? NaN);
  const nb = Number(/-(\d+)$/.exec(b)?.[1] ?? NaN);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
};

export type RouteCheck = { ok: true; borders: number; sources: SourceId[] } | { ok: false; message: string };

/**
 * Validate a cart/truck route (base.md §6.5): `path[0]` is one of `starts`; each step goes to an
 * orthogonally adjacent connected road square (bridges straight on); never straight back onto the
 * square just left (revisits and loops are fine); borders crossed (incl. the start cost) ≤ range.
 * Every source adjacent to the path is collected (mandatory).
 */
export function validateRoadRoute(board: Board, starts: RoadStart[], path: Cell[], range: number): RouteCheck {
  const first = path[0];
  if (!first) return { ok: false, message: 'Route is empty' };
  const start = starts.find((s) => sameCell(s.cell, first));
  if (!start) return { ok: false, message: 'Route must begin on a road square next to the entrance' };
  let cost = start.cost;
  let heading: Direction | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Cell;
    const b = path[i] as Cell;
    const d = dirBetween(a, b);
    if (!d) return { ok: false, message: `Step ${i} is not to an adjacent square` };
    if (i >= 2 && sameCell(b, path[i - 2] as Cell)) return { ok: false, message: 'A route may not turn straight back' };
    if (!canStep(board, a, heading, d)) return { ok: false, message: `Step ${i} leaves the road (or turns on a bridge)` };
    cost += stepCost(board, a, b);
    heading = d;
  }
  if (cost > range) return { ok: false, message: `Route crosses ${cost} tile borders; range is ${range}` };
  return { ok: true, borders: cost, sources: sourcesAdjacentToPath(board, path) };
}

export interface RoadRouteOption {
  path: Cell[];
  sources: SourceId[];
  borders: number;
}

/**
 * Every distinct set of sources a cart/truck can collect within `range` from `starts`, each with
 * one shortest representative path (base.md §6.5). Search state = (square, heading, collected);
 * the no-reversal and bridge rules are applied. Sorted: most sources first, then source ids.
 */
export function enumerateRoadRoutes(board: Board, starts: RoadStart[], range: number): RoadRouteOption[] {
  const field = distanceField(board, starts);
  // Candidate sources: adjacent to a road square within range.
  const cand: SourceId[] = [];
  const candIndex = new Map<SourceId, number>();
  for (let i = 0; i < field.dist.length; i++) {
    if ((field.dist[i] as number) > range) continue;
    for (const s of sourcesAdjacentToPath(board, [cellFromIndex(board, i)])) {
      if (!candIndex.has(s) && cand.length < 30) {
        candIndex.set(s, cand.length);
        cand.push(s);
      }
    }
  }
  const maskAt = (c: Cell): number => {
    let m = 0;
    for (const s of sourcesAdjacentToPath(board, [c])) {
      const i = candIndex.get(s);
      if (i !== undefined) m |= 1 << i;
    }
    return m;
  };
  const maskCache = new Map<number, number>();
  const cellMask = (c: Cell): number => {
    const k = cellIndex(board, c);
    let m = maskCache.get(k);
    if (m === undefined) {
      m = maskAt(c);
      maskCache.set(k, m);
    }
    return m;
  };

  interface Node {
    cell: Cell;
    heading: number;
    mask: number;
    cost: number;
    parent: Node | null;
  }
  const best = new Map<string, number>();
  const buckets: Node[][] = [];
  const results = new Map<number, Node>();
  const push = (node: Node) => {
    if (node.cost > range) return;
    const key = `${cellIndex(board, node.cell)}|${node.heading}|${node.mask}`;
    const prev = best.get(key);
    if (prev !== undefined && prev <= node.cost) return;
    best.set(key, node.cost);
    (buckets[node.cost] ??= []).push(node);
  };
  for (const s of starts) {
    if (!roadAt(board, s.cell)) continue;
    push({ cell: s.cell, heading: NO_HEADING, mask: cellMask(s.cell), cost: s.cost, parent: null });
  }
  for (let cost = 0; cost < buckets.length; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i] as Node;
      const key = `${cellIndex(board, node.cell)}|${node.heading}|${node.mask}`;
      if (best.get(key) !== node.cost) continue;
      if (!results.has(node.mask)) results.set(node.mask, node);
      const heading = node.heading === NO_HEADING ? null : (DIRECTIONS[node.heading] as Direction);
      for (const d of DIRECTIONS) {
        if (heading !== null && d === opposite(heading)) continue; // no immediate reversal
        const to = canStep(board, node.cell, heading, d);
        if (!to) continue;
        push({ cell: to, heading: DIR_INDEX[d], mask: node.mask | cellMask(to), cost: node.cost + stepCost(board, node.cell, to), parent: node });
      }
    }
  }
  const out: RoadRouteOption[] = [];
  for (const node of results.values()) {
    const path: Cell[] = [];
    for (let n: Node | null = node; n; n = n.parent) path.push(n.cell);
    path.reverse();
    out.push({ path, sources: sourcesAdjacentToPath(board, path), borders: node.cost });
  }
  return out.sort((a, b) => b.sources.length - a.sources.length || a.sources.join(',').localeCompare(b.sources.join(',')) || a.borders - b.borders);
}

// ---------------------------------------------------------------------------
// Zeppelin (air) routes (base.md §6.5; DLX p10, p21)
// ---------------------------------------------------------------------------

export interface TileRC {
  row: number;
  col: number;
}

/** Tile of a square in grid coordinates. */
export const tileRCOf = (c: Cell): TileRC => tileCoord(c);

/** Sources lying on any of these tiles, id order. */
export function sourcesOnTiles(board: Board, tiles: TileRC[]): SourceId[] {
  const keys = new Set(tiles.map((t) => `${t.row},${t.col}`));
  return Object.values(board.drinkSources)
    .filter((s) => keys.has(`${Math.floor(s.y / 5)},${Math.floor(s.x / 5)}`))
    .map((s) => s.id)
    .sort(byId);
}

/**
 * Zeppelin route: `tiles[0]` = start tile; orthogonal tile-to-tile steps inside the map; no tile
 * entered twice; at most `range` borders. Collects from every source on every tile incl. the start.
 */
export function validateAirRoute(board: Board, startTiles: TileRC[], tiles: TileRC[], range: number): RouteCheck {
  const first = tiles[0];
  if (!first) return { ok: false, message: 'Route is empty' };
  if (!startTiles.some((t) => t.row === first.row && t.col === first.col)) return { ok: false, message: 'Route must start on the entrance tile' };
  const seen = new Set<string>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i] as TileRC;
    if (t.row < 0 || t.col < 0 || t.row >= board.rows || t.col >= board.cols) return { ok: false, message: 'Route leaves the map' };
    const k = `${t.row},${t.col}`;
    if (seen.has(k)) return { ok: false, message: 'A zeppelin may not enter a tile twice' };
    seen.add(k);
    if (i > 0) {
      const p = tiles[i - 1] as TileRC;
      if (Math.abs(p.row - t.row) + Math.abs(p.col - t.col) !== 1) return { ok: false, message: 'Zeppelin moves to orthogonally adjacent tiles' };
    }
  }
  if (tiles.length - 1 > range) return { ok: false, message: `Route crosses ${tiles.length - 1} borders; range is ${range}` };
  return { ok: true, borders: tiles.length - 1, sources: sourcesOnTiles(board, tiles) };
}

export interface AirRouteOption {
  tiles: TileRC[];
  sources: SourceId[];
}

/** Every distinct source set a zeppelin can collect (one shortest representative route each). */
export function enumerateAirRoutes(board: Board, startTiles: TileRC[], range: number): AirRouteOption[] {
  const results = new Map<string, AirRouteOption>();
  // BFS by length so the first representative found is shortest.
  let frontier: TileRC[][] = [];
  const startSeen = new Set<string>();
  for (const s of startTiles) {
    const k = `${s.row},${s.col}`;
    if (startSeen.has(k)) continue;
    startSeen.add(k);
    frontier.push([s]);
  }
  for (let len = 0; len <= range && frontier.length; len++) {
    const next: TileRC[][] = [];
    for (const route of frontier) {
      const sources = sourcesOnTiles(board, route);
      const key = sources.join(',');
      if (!results.has(key)) results.set(key, { tiles: route, sources });
      if (len === range) continue;
      const last = route[route.length - 1] as TileRC;
      for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]] as const) {
        const t = { row: last.row + dr, col: last.col + dc };
        if (t.row < 0 || t.col < 0 || t.row >= board.rows || t.col >= board.cols) continue;
        if (route.some((r) => r.row === t.row && r.col === t.col)) continue;
        next.push([...route, t]);
      }
    }
    frontier = next;
  }
  return [...results.values()].sort((a, b) => b.sources.length - a.sources.length || a.sources.join(',').localeCompare(b.sources.join(',')));
}
