/**
 * Route lookups for choreographies (animation-plan §3.1, §4.3): engine routes on the events
 * (`sale.route`, `drinksBought.route`) turned into world polylines and followers. Old events
 * without a route fall back to the client's shortest path (`dinnerRoute`).
 */
import type { Board, Cell, Direction, GameEvent, RouteStart } from '@fcm/engine';
import { bridgeLift } from '../board/roads.js';
import { DELTA } from '../coords.js';
import { dinnerRoute } from '../overlays/feedback.js';
import { startOrigin, startRoads } from '../overlays/fallback.js';
import { routePolyline } from '../overlays/routes.js';
import type { BuyTrip, RouteLookup, SaleTrip } from './choreo.js';
import { AIR_Y, airPath, freewayGround, roadPath, withHeight, type Follow, type P2, type Pose } from './path.js';

const centre = (c: Cell): P2 => [c.x + 0.5, c.y + 0.5];

/**
 * A stored route on the board as it is now. "Watch again" replays events recorded before an extra
 * map tile re-based the grid (north / west growth shifts every square by whole tiles): when the
 * path no longer starts at the start's road or runs off the roads, try it shifted by whole tiles.
 * Unchanged when no shift fits (live routes always fit as they are).
 */
export function fitRoute<R extends { from: RouteStart; path: Cell[]; exit?: { cell: Cell; side: Direction } }>(b: Board, r: R): R {
  const fits = (dx: number, dy: number) => {
    const first = r.path[0];
    if (!first || !r.path.every((c) => !!b.cells[c.y + dy]?.[c.x + dx]?.road)) return false;
    return startRoads(b, r.from).some((c) => c.x === first.x + dx && c.y === first.y + dy);
  };
  if (fits(0, 0)) return r;
  const t = b.tileSize;
  for (const [dx, dy] of [
    [t, 0],
    [0, t],
    [t, t],
    [2 * t, 0],
    [0, 2 * t],
  ] as const) {
    if (!fits(dx, dy)) continue;
    const mv = (c: Cell): Cell => ({ x: c.x + dx, y: c.y + dy });
    return { ...r, path: r.path.map(mv), ...(r.exit ? { exit: { ...r.exit, cell: mv(r.exit.cell) } } : {}) };
  }
  return r;
}

/** Spawn point of a route start: the entrance corner square / coffee shop square centre. */
export function spawnPoint(b: Board, from: RouteStart): P2 | null {
  const o = startOrigin(b, from);
  return o ? centre(o) : null;
}

/** Road polyline from the spawn point along `path` (spawn → edge midpoint → square centres). */
function roadPts(b: Board, from: RouteStart, path: readonly Cell[]): P2[] {
  const pts = routePolyline(b, { route: { mode: 'road', from, path: [...path] }, collects: [] }) as P2[];
  const s = spawnPoint(b, from);
  if (s) pts.unshift(s);
  return pts;
}

/**
 * `f` driving over overpass decks: on the upper (E-W) road the vehicle climbs the ramps instead
 * of driving through them; traffic on the lower (N-S) road stays on the ground.
 */
export function overBridges(b: Board, f: Follow): Follow {
  let any = false;
  for (const row of b.cells) for (const c of row) if (c.road?.bridge) any = true;
  if (!any) return f;
  const p: Pose = { x: 0, z: 0, yaw: 0 };
  const q: Pose = { x: 0, z: 0, yaw: 0 };
  return {
    ...f,
    at: (s, out) => f.at(s, out),
    nearest: (x, z) => f.nearest(x, z),
    yAt: (s) => {
      const base = f.yAt ? f.yAt(s) : f.y;
      f.at(Math.max(0, s - 0.05), p);
      f.at(Math.min(f.length, s + 0.05), q);
      if (Math.abs(q.x - p.x) <= Math.abs(q.z - p.z)) return base;
      f.at(s, p);
      return base + bridgeLift(b, p.x, p.z);
    },
  };
}

export function createRouteLookup(board: () => Board | null): RouteLookup {
  return {
    road: (pts, opts) => roadPath(pts, opts),

    sale(e: Extract<GameEvent, { type: 'sale' }>): SaleTrip | null {
      const b = board();
      if (!b) return null;
      const h = b.houses[e.houseId];
      const route = e.route ? fitRoute(b, e.route) : dinnerRoute(b, e.restaurantId, e.houseId);
      if (!route || !route.path.length) return null;
      const pts = roadPts(b, route.from, route.path);
      const last = route.path[route.path.length - 1]!;
      let house: P2 = centre(last);
      let offBoard = false;
      const exit = e.route?.exit;
      if (exit) {
        // Leave the board by the freeway: outer edge midpoint, then a straight 2-unit run.
        const [dx, dz] = DELTA[exit.side];
        const [cx, cz] = centre(exit.cell);
        pts.push([cx + dx * 0.5, cz + dz * 0.5], [cx + dx * 2.5, cz + dz * 2.5]);
        house = [cx + dx * 3.5, cz + dz * 3.5];
        offBoard = true;
      } else if (h) {
        // Stop on the road square next to the house, nose toward it.
        const into = [...h.cells, ...(h.garden?.cells ?? [])].find((c) => Math.abs(c.x - last.x) + Math.abs(c.y - last.y) === 1);
        if (into) {
          const [lx, lz] = centre(last);
          pts.push([lx + (into.x - last.x) * 0.3, lz + (into.y - last.y) * 0.3]);
          const xs = h.cells.map((c) => c.x);
          const ys = h.cells.map((c) => c.y);
          house = [(Math.min(...xs) + Math.max(...xs) + 1) / 2, (Math.min(...ys) + Math.max(...ys) + 1) / 2];
        }
      }
      let follow = roadPath(pts);
      let back = roadPath([...pts].reverse());
      let ground: SaleTrip['ground'];
      if (exit) {
        // Up the freeway deck instead of under it (animation-plan §2.11).
        const [dx, dz] = DELTA[exit.side];
        const [cx, cz] = centre(exit.cell);
        ground = freewayGround([cx + dx * 0.5, cz + dz * 0.5], [dx, dz]);
        follow = withHeight(follow, ground);
        back = withHeight(back, ground);
      }
      follow = overBridges(b, follow);
      back = overBridges(b, back);
      return { pts, follow, back, house, offBoard, ...(ground ? { ground } : {}) };
    },

    buy(e: Extract<GameEvent, { type: 'drinksBought' }>): BuyTrip | null {
      const b = board();
      const r0 = e.route;
      if (!b || !r0) return null;
      // Road hauls recorded before a re-base: shifted onto the current squares.
      const r = r0.mode === 'road' ? fitRoute(b, r0) : r0;
      const sources = e.collected.flatMap((c) => {
        const src = c.sourceId ? b.drinkSources[c.sourceId] : undefined;
        return src ? [{ sourceId: src.id, drink: c.drink as string, count: c.count, at: centre(src) }] : [];
      });
      if (r.mode === 'errand') {
        // Out to the nearest road square of the player's first open restaurant and back.
        const rest = Object.values(b.restaurants)
          .filter((x) => x.owner === e.player && x.status === 'open')
          .sort((a, c) => (a.id < c.id ? -1 : 1))[0];
        if (!rest) return null;
        const from: RouteStart = { kind: 'restaurant', restaurantId: rest.id, corner: rest.entrance };
        const s = spawnPoint(b, from);
        const road = startRoads(b, from)[0];
        if (!s || !road) return null;
        const pts: P2[] = [s, centre(road), s];
        return { mode: 'errand', pts, follow: roadPath(pts, { lane: 0.08 }), stops: [] };
      }
      if (r.mode === 'road') {
        const pts = roadPts(b, r.from, r.path);
        const follow = overBridges(b, roadPath(pts));
        const stops = sources.map((x) => ({ ...x, s: follow.nearest(x.at[0], x.at[1]) })).sort((a, c) => a.s - c.s);
        return { mode: 'road', pts, follow, stops };
      }
      const s = spawnPoint(b, r.from);
      const t = b.tileSize;
      const pts: P2[] = [...(s ? [s] : []), ...r.tiles.map((x): P2 => [x.col * t + t / 2, x.row * t + t / 2])];
      const follow = airPath(pts, AIR_Y.zeppelin);
      const stops = sources.map((x) => ({ ...x, s: follow.nearest(x.at[0], x.at[1]) })).sort((a, c) => a.s - c.s);
      return { mode: 'air', pts, follow, stops };
    },
  };
}
