/**
 * Local stand-ins for engine view data the overlays use (ux-plan §4) until the engine exports
 * them: road range field (`rangeOverlay`), campaign reach (`campaignReach`) and route starts.
 * Approximations of the engine rules (map/pathfinding.ts, map/reach.ts); the engine stays
 * authoritative. Prefer engine results whenever they are available.
 */
import type { Board, CampaignKind, CampaignPlacement, Cell, Corner, Direction, HouseId, PlayerId, RouteStart } from '@fcm/engine';
import type { RangeOverlayData, ReachOverlayData } from '../../state/boardOverlays.js';
import { DELTA, DIRS, OPPOSITE } from '../coords.js';

const CORNERS: readonly Corner[] = ['NW', 'NE', 'SE', 'SW'];

/** Corner square of a 2x2 footprint at (x, y). */
export function cornerCell(x: number, y: number, c: Corner): Cell {
  return { x: x + (c === 'NE' || c === 'SE' ? 1 : 0), y: y + (c === 'SW' || c === 'SE' ? 1 : 0) };
}

/** The two squares outside a 2x2 footprint touching corner `c`. */
export function entranceOutside(x: number, y: number, c: Corner): Cell[] {
  const cc = cornerCell(x, y, c);
  const dx = c === 'NE' || c === 'SE' ? 1 : -1;
  const dy = c === 'SW' || c === 'SE' ? 1 : -1;
  return [
    { x: cc.x + dx, y: cc.y },
    { x: cc.x, y: cc.y + dy },
  ];
}

/** The square a route start sits on (restaurant corner square / coffee shop square). */
export function startOrigin(b: Board, s: RouteStart): Cell | null {
  if (s.kind === 'restaurant') {
    const r = b.restaurants[s.restaurantId];
    return r ? cornerCell(r.x, r.y, s.corner) : null;
  }
  const e = b.entities[s.entityId];
  return e && e.kind === 'coffeeShop' ? { x: e.x, y: e.y } : null;
}

const usable = (b: Board, c: Cell) => {
  const r = b.cells[c.y]?.[c.x]?.road;
  return r && !r.underConstruction ? r : null;
};

/** Road squares a route from `s` may begin on. */
export function startRoads(b: Board, s: RouteStart): Cell[] {
  let cand: Cell[] = [];
  if (s.kind === 'restaurant') {
    const r = b.restaurants[s.restaurantId];
    if (r) cand = entranceOutside(r.x, r.y, s.corner);
  } else {
    const o = startOrigin(b, s);
    if (o) cand = DIRS.map((d) => ({ x: o.x + DELTA[d][0], y: o.y + DELTA[d][1] }));
  }
  return cand.filter((c) => usable(b, c));
}

/** Every range start of a player: each usable corner of each open restaurant, and coffee shops. */
export function playerStarts(b: Board, player: PlayerId): RouteStart[] {
  const out: RouteStart[] = [];
  for (const r of Object.values(b.restaurants)) {
    if (r.owner !== player || r.status !== 'open') continue;
    for (const corner of r.driveIn ? CORNERS : [r.entrance]) out.push({ kind: 'restaurant', restaurantId: r.id, corner });
  }
  for (const e of Object.values(b.entities)) if (e.kind === 'coffeeShop' && e.owner === player) out.push({ kind: 'coffeeShop', entityId: e.id });
  return out;
}

const tileKey = (b: Board, c: Cell) => `${Math.floor(c.x / b.tileSize)},${Math.floor(c.y / b.tileSize)}`;

/**
 * Distance in tile borders from `starts` to every reachable road square, up to `range` (0-1 BFS;
 * bridges go straight on, capped sides block, roadworks add their cost).
 */
export function localRangeField(b: Board, starts: readonly RouteStart[], range: number): RangeOverlayData['roads'] {
  const best = new Map<string, number>();
  const key = (c: Cell, h: Direction | null) => `${c.x},${c.y},${h ?? '-'}`;
  const dq: { c: Cell; h: Direction | null; d: number }[] = [];
  for (const s of starts) {
    const o = startOrigin(b, s);
    for (const c of startRoads(b, s)) {
      const d = (o && tileKey(b, o) !== tileKey(b, c) ? 1 : 0) + (usable(b, c)?.roadworks ?? 0);
      if (d > range) continue;
      const k = key(c, null);
      if ((best.get(k) ?? Infinity) <= d) continue;
      best.set(k, d);
      dq.push({ c, h: null, d });
    }
  }
  dq.sort((a, z) => a.d - z.d);
  while (dq.length) {
    const cur = dq.shift()!;
    if ((best.get(key(cur.c, cur.h)) ?? Infinity) < cur.d) continue;
    const here = usable(b, cur.c);
    if (!here) continue;
    for (const d of DIRS) {
      if (here.bridge && cur.h !== null && d !== cur.h) continue;
      if (here.capped?.includes(d)) continue;
      const to = { x: cur.c.x + DELTA[d][0], y: cur.c.y + DELTA[d][1] };
      const there = usable(b, to);
      if (!there || there.capped?.includes(OPPOSITE[d])) continue;
      const nd = cur.d + (tileKey(b, cur.c) !== tileKey(b, to) ? 1 : 0) + (there.roadworks ?? 0);
      if (nd > range) continue;
      const k = key(to, d);
      if ((best.get(k) ?? Infinity) <= nd) continue;
      best.set(k, nd);
      // 0-cost steps go to the front (0-1 BFS), the rest to the back.
      if (nd === cur.d) dq.unshift({ c: to, h: d, d: nd });
      else dq.push({ c: to, h: d, d: nd });
    }
  }
  const out = new Map<string, { x: number; y: number; distance: number }>();
  for (const [k, d] of best) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const ck = `${x},${y}`;
    const prev = out.get(ck);
    if (!prev || d < prev.distance) out.set(ck, { x, y, distance: d });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Campaign reach (base kinds)
// ---------------------------------------------------------------------------

function houseAt(b: Board, c: Cell): HouseId | null {
  const cell = b.cells[c.y]?.[c.x];
  if (!cell || cell.kind !== 'house' || !cell.occupant) return null;
  return cell.occupant as HouseId;
}

/** Houses (and cells to tint, or a band) a base-kind campaign at `p` would reach. */
export function localCampaignReach(b: Board, kind: CampaignKind, p: CampaignPlacement): Pick<ReachOverlayData, 'houseIds' | 'cells' | 'band'> {
  const ids = new Set<HouseId>();
  if (p.kind === 'airplane') {
    const axis = p.side === 'N' || p.side === 'S' ? 'col' : 'row';
    const from = p.offset;
    const to = p.offset + p.width - 1;
    for (const h of Object.values(b.houses))
      if (h.cells.some((c) => (axis === 'col' ? c.x : c.y) >= from && (axis === 'col' ? c.x : c.y) <= to)) ids.add(h.id);
    return { houseIds: [...ids], band: { axis, from, to } };
  }
  if (p.kind !== 'board') return { houseIds: [] };
  const cells: Cell[] = [];
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) cells.push({ x: p.x + i, y: p.y + j });
  if (kind === 'radio') {
    const ts = b.tileSize;
    const tc = Math.floor(p.x / ts);
    const tr = Math.floor(p.y / ts);
    const area: Cell[] = [];
    for (let y = (tr - 1) * ts; y < (tr + 2) * ts; y++) for (let x = (tc - 1) * ts; x < (tc + 2) * ts; x++) if (x >= 0 && y >= 0 && x < b.w && y < b.h) area.push({ x, y });
    for (const c of area) {
      const id = houseAt(b, c);
      if (id) ids.add(id);
    }
    return { houseIds: [...ids], cells: area };
  }
  if (kind === 'mailbox') {
    // Flood fill through non-road squares (roads bound the block).
    const seen = new Set<string>();
    const q = [...cells];
    for (const c of q) seen.add(`${c.x},${c.y}`);
    while (q.length) {
      const c = q.pop()!;
      const id = houseAt(b, c);
      if (id) ids.add(id);
      for (const d of DIRS) {
        const n = { x: c.x + DELTA[d][0], y: c.y + DELTA[d][1] };
        const k = `${n.x},${n.y}`;
        const cell = b.cells[n.y]?.[n.x];
        if (!cell || seen.has(k) || cell.road || cell.kind === 'road') continue;
        seen.add(k);
        q.push(n);
      }
    }
    const area = [...seen].map((k) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return { x, y };
    });
    return { houseIds: [...ids], cells: area };
  }
  // Billboard (and fallback): houses orthogonally adjacent to the footprint.
  for (const c of cells)
    for (const d of DIRS) {
      const id = houseAt(b, { x: c.x + DELTA[d][0], y: c.y + DELTA[d][1] });
      if (id) ids.add(id);
    }
  return { houseIds: [...ids] };
}
