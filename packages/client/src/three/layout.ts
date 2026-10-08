/**
 * Where things go: world anchors for board pieces and off-board pieces (airplanes, rural area,
 * gourmet guides), and the squares a legal placement covers. Shared by the reconciler and the
 * interaction layer so ghosts land exactly where the real mini will.
 */
import type { Board, CampaignPlacement, Cell, Direction, GameView, Placement } from '@fcm/engine';
import { playerMark } from '../state/selectors.js';
import { PLAYER_COLORS } from '../theme.js';
import { AIR_STRIP, DELTA, RIM, cellsRect, dirAngle, edgeStrip } from './coords.js';

/** World rectangle on the ground (x/z), plus a pick height. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const rectOf = (x: number, y: number, w: number, h: number): Rect => ({ x0: x, z0: y, x1: x + w, z1: y + h });
export const rectCenter = (r: Rect): [number, number] => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
export const cellsToRect = (cells: readonly Cell[]): Rect => {
  const r = cellsRect(cells);
  return rectOf(r.x, r.y, r.w, r.h);
};

export const RURAL_SIZE = 6.2;
const RURAL_DIST = RIM + RURAL_SIZE / 2 + 0.8;

/** Side of the board the rural area sits on: where the first freeway is, else east. */
export function ruralSide(b: Board): Direction {
  for (const e of Object.values(b.entities)) if (e.kind === 'freeway') return e.side;
  return 'E';
}

export function ruralCenter(b: Board): [number, number] {
  const side = ruralSide(b);
  const len = side === 'N' || side === 'S' ? b.w : b.h;
  const s = edgeStrip(side, 0, len, b.w, b.h, RURAL_DIST);
  return [s.x, s.z];
}

export function hasRural(b: Board): boolean {
  return Object.values(b.houses).some((h) => h.kind === 'rural');
}

/**
 * What the camera framing depends on: the grid (size and tiles; a change re-bases coordinates),
 * the rural area's side (it moves to the first freeway) and the airplane strips in use.
 */
export function boardFrameKey(b: Board): { grid: string; rural: string; key: string } {
  const grid = `${b.w}x${b.h}:${b.tiles.map((t) => t.id).join(',')}`;
  const rural = hasRural(b) ? ruralSide(b) : '';
  const air = [...new Set(Object.values(b.campaigns).flatMap((c) => (c.placement.kind === 'airplane' ? [c.placement.side] : [])))].sort().join('');
  return { grid, rural, key: `${grid}|${rural}|${air}` };
}

/** Off-board spots for gourmet guides: the four outer rim corners, then along the north rim. */
export function guideSpot(b: Board, i: number): [number, number] {
  const m = RIM / 2;
  const corners: [number, number][] = [
    [-m, -m],
    [b.w + m, -m],
    [b.w + m, b.h + m],
    [-m, b.h + m],
  ];
  return corners[i] ?? [2 + (i - 4) * 1.6, -m];
}

/** Door side for a house: the side with the most road squares next to it (ties: S, E, W, N). */
export function houseFacing(b: Board, cells: readonly Cell[], garden?: readonly Cell[]): Direction {
  const r = cellsRect(cells);
  const count = (d: Direction): number => {
    let n = 0;
    const [dx, dy] = DELTA[d];
    for (const c of cells) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
      if (b.cells[y]?.[x]?.road) n++;
    }
    return n;
  };
  let best: Direction = 'S';
  let bestN = -1;
  for (const d of ['S', 'E', 'W', 'N'] as const) {
    const n = count(d);
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  // No road touches the house itself: the way out is through its garden.
  if (bestN === 0 && garden?.length) {
    const g = cellsRect(garden);
    if (g.y >= r.y + r.h) return 'S';
    if (g.y + g.h <= r.y) return 'N';
    if (g.x >= r.x + r.w) return 'E';
    if (g.x + g.w <= r.x) return 'W';
  }
  return best;
}

export interface Anchor {
  x: number;
  z: number;
  y: number;
  rotY: number;
  rect: Rect;
  height: number;
}

/**
 * Squares of empty slot between the board edge on `side` and the outermost real tile, over the
 * lines `offset … offset + width - 1` (a grown board leaves slots on the edge). Edge pieces
 * (airplanes, freeways) sit against that tile, not the board's bounding box. 0 when every line is
 * empty or the edge is a real tile.
 */
export function edgeGap(b: Board, side: Direction, offset: number, width = 1): number {
  const alongX = side === 'N' || side === 'S';
  const depth = alongX ? b.h : b.w;
  let gap = Infinity;
  for (let i = offset; i < offset + width; i++) {
    for (let d = 0; d < depth; d++) {
      const x = alongX ? i : side === 'W' ? d : b.w - 1 - d;
      const y = alongX ? (side === 'N' ? d : b.h - 1 - d) : i;
      const c = b.cells[y]?.[x];
      if (c && c.tile !== '') {
        gap = Math.min(gap, d);
        break;
      }
    }
  }
  return Number.isFinite(gap) ? gap : 0;
}

/** Anchor of a campaign by its placement. `guideIndex` orders off-board guides. */
export function campaignAnchor(b: Board, p: CampaignPlacement, guideIndex = 0): Anchor {
  switch (p.kind) {
    case 'board': {
      const rect = rectOf(p.x, p.y, p.w, p.h);
      const [x, z] = rectCenter(rect);
      return { x, z, y: 0, rotY: 0, rect, height: 1.6 };
    }
    case 'airplane': {
      const s = edgeStrip(p.side, p.offset, p.width, b.w, b.h, AIR_STRIP - edgeGap(b, p.side, p.offset, p.width));
      const half = p.width / 2;
      const rect = s.along === 'x' ? { x0: s.x - half, z0: s.z - 0.6, x1: s.x + half, z1: s.z + 0.6 } : { x0: s.x - 0.6, z0: s.z - half, x1: s.x + 0.6, z1: s.z + half };
      return { x: s.x, z: s.z, y: 0, rotY: s.angle, rect, height: 3 };
    }
    case 'rural': {
      const [cx, cz] = ruralCenter(b);
      const [dx, dz] = DELTA[p.side];
      const d = RURAL_SIZE / 2 + 0.7;
      const x = cx + dx * d;
      const z = cz + dz * d;
      const vertical = p.side === 'E' || p.side === 'W';
      const rect = vertical ? { x0: x - 0.5, z0: z - 1.8, x1: x + 0.5, z1: z + 1.8 } : { x0: x - 1.8, z0: z - 0.5, x1: x + 1.8, z1: z + 0.5 };
      return { x, z, y: 0, rotY: dirAngle(p.side), rect, height: 2.4 };
    }
    case 'offBoard': {
      const [x, z] = guideSpot(b, guideIndex);
      return { x, z, y: 0.06, rotY: 0, rect: { x0: x - 0.6, z0: z - 0.5, x1: x + 0.6, z1: z + 0.5 }, height: 1.4 };
    }
  }
}

/** Freeway foot (on the board edge) for side/offset. */
export function freewayAnchor(b: Board, side: Direction, offset: number): Anchor {
  const s = edgeStrip(side, offset, 1, b.w, b.h, -edgeGap(b, side, offset));
  const [dx, dz] = DELTA[side];
  const far = { x: s.x + dx * 3.6, z: s.z + dz * 3.6 };
  const rect = { x0: Math.min(s.x, far.x) - 0.6, z0: Math.min(s.z, far.z) - 0.6, x1: Math.max(s.x, far.x) + 0.6, z1: Math.max(s.z, far.z) + 0.6 };
  return { x: s.x, z: s.z, y: 0, rotY: 0, rect, height: 1.8 };
}

/** Squares a placement covers on the board (empty for off-board picks). */
export function placementCells(p: Placement): Cell[] {
  const rect = (x: number, y: number, w: number, h: number) => {
    const out: Cell[] = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push({ x: x + i, y: y + j });
    return out;
  };
  switch (p.kind) {
    case 'restaurant':
    case 'moveRestaurant':
      return rect(p.x, p.y, 2, 2);
    case 'house': {
      const [gx, gy, gw, gh] = gardenRect(p.x, p.y, p.gardenSide);
      return [...rect(p.x, p.y, 2, 2), ...rect(gx, gy, gw, gh)];
    }
    case 'garden':
    case 'lobbyistRoad':
      return [...p.cells];
    case 'campaign':
      return p.placement.kind === 'board' ? rect(p.placement.x, p.placement.y, p.placement.w, p.placement.h) : [];
    case 'coffeeShop':
    case 'pizzaRadio':
    case 'freeMailbox':
      return rect(p.x, p.y, 1, 1);
    case 'park':
      return p.cells?.length ? [...p.cells] : rect(p.x, p.y, p.w, p.h);
    case 'mapTile':
      return rect(p.col * 5, p.row * 5, 5, 5);
    case 'freeway':
    case 'buyerRoute':
      return [];
  }
}

/** Garden squares (x, y, w, h) beside a 2x2 house at (x, y). */
export function gardenRect(x: number, y: number, side: Direction): [number, number, number, number] {
  switch (side) {
    case 'N':
      return [x, y - 1, 2, 1];
    case 'S':
      return [x, y + 2, 2, 1];
    case 'W':
      return [x - 1, y, 1, 2];
    case 'E':
      return [x + 2, y, 1, 2];
  }
}

/**
 * The world rectangle a pointer must be over to choose this placement. Board picks use their
 * "body" (house without its garden, restaurant footprint); off-board picks use their strip.
 */
export function placementHitRect(b: Board, p: Placement): Rect | null {
  switch (p.kind) {
    case 'house':
      return rectOf(p.x, p.y, 2, 2);
    case 'campaign':
      return campaignAnchor(b, p.placement).rect;
    case 'freeway':
      return freewayAnchor(b, p.side, p.offset).rect;
    case 'buyerRoute':
      return null;
    default: {
      const cells = placementCells(p);
      return cells.length ? cellsToRect(cells) : null;
    }
  }
}

/**
 * Variant grouping: placements sharing a hit rectangle are one "spot"; R / rotate cycles through
 * them (entrance corners, garden sides, airplane goods...).
 */
export function spotKey(b: Board, p: Placement): string {
  const r = placementHitRect(b, p);
  return r ? `${p.kind}:${r.x0},${r.z0},${r.x1},${r.z1}` : `${p.kind}:${JSON.stringify(p)}`;
}

export function playerColor(view: GameView, id: string | null | undefined): string {
  if (!id) return '#8f8b88';
  const p = view.players[id];
  if (p?.color) return p.color;
  const i = view.turnOrder?.indexOf(id) ?? -1;
  return PLAYER_COLORS[Math.max(0, i) % PLAYER_COLORS.length]!.base;
}

/** Owner mark on restaurants, coffee shops and vehicles: the same mark as every player badge (playerMark). */
export function ownerMark(view: GameView, id: string): string {
  return playerMark(view, id);
}

/** Short chain mark (e.g. "golden_duck_diner" → "GD"). */

export function chainMark(chain: string | undefined, fallback: string): string {
  if (!chain) return fallback.slice(0, 2).toUpperCase();
  const words = chain.split(/[_\s-]+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : chain.slice(0, 2)).toUpperCase();
}

/** World rectangle covering the board, a slice of its rim, and off-board pieces (rural area). */
/**
 * What the default camera frames: the board squares with a slim margin (the rim may run off the
 * free area), plus the airplane strips in use and the rural area when there is one.
 */
export function frameRect(b: Board): Rect {
  const m = 0.45;
  // The near (south) rim keeps its tile letters in the home view: label band = LABEL_OFF 0.62 +
  // half a 0.72 label (board/ground.ts, seams.ts buildRimLabels) + a little air. Portrait boards
  // (5–6 players) are height-bound and used to cut them.
  const r = { x0: -m, z0: -m, x1: b.w + m, z1: b.h + 1.1 };
  // Airplanes fly beside the board: keep their strip in view.
  const air = AIR_STRIP + 0.9;
  for (const c of Object.values(b.campaigns)) {
    if (c.placement.kind !== 'airplane') continue;
    const side = c.placement.side;
    if (side === 'N') r.z0 = Math.min(r.z0, -air);
    else if (side === 'S') r.z1 = Math.max(r.z1, b.h + air);
    else if (side === 'W') r.x0 = Math.min(r.x0, -air);
    else r.x1 = Math.max(r.x1, b.w + air);
  }
  if (hasRural(b)) {
    const [cx, cz] = ruralCenter(b);
    const h = RURAL_SIZE / 2 + 0.6;
    r.x0 = Math.min(r.x0, cx - h);
    r.x1 = Math.max(r.x1, cx + h);
    r.z0 = Math.min(r.z0, cz - h);
    r.z1 = Math.max(r.z1, cz + h);
  }
  return r;
}

/**
 * Price multiplier a park gives a house (ketchup.md §2 Parks): ×2, or ×3 with a garden, when a
 * park square touches a house or garden square orthogonally; 1 otherwise. `parks` defaults to the
 * board's parks; pass extra rectangles to preview a park being placed.
 */
export function parkMultiplier(b: Board, h: Board['houses'][string], parks?: readonly { x: number; y: number; w: number; h: number; cells?: { x: number; y: number }[] }[]): number {
  if (h.kind === 'rural' || !h.cells.length) return 1;
  const list = parks ?? Object.values(b.entities).flatMap((e) => (e.kind === 'park' ? [e] : []));
  if (!list.length) return 1;
  const own = [...h.cells, ...(h.garden?.cells ?? [])];
  const ownSet = new Set(own.map((c) => `${c.x},${c.y}`));
  const near = new Set<string>();
  for (const c of own)
    for (const [dx, dy] of Object.values(DELTA)) {
      const k = `${c.x + dx},${c.y + dy}`;
      if (!ownSet.has(k)) near.add(k);
    }
  for (const p of list) {
    // Parks that are not full rectangles (T / L tiles) list their squares.
    if (p.cells?.length) {
      if (p.cells.some((c) => near.has(`${c.x},${c.y}`))) return h.garden ? 3 : 2;
      continue;
    }
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (near.has(`${x},${y}`)) return h.garden ? 3 : 2;
  }
  return 1;
}

export function contentRect(b: Board): Rect {
  const m = RIM * 0.6;
  const r = { x0: -m, z0: -m, x1: b.w + m, z1: b.h + m };
  if (hasRural(b)) {
    const [cx, cz] = ruralCenter(b);
    const h = RURAL_SIZE / 2 + 1.4;
    r.x0 = Math.min(r.x0, cx - h);
    r.x1 = Math.max(r.x1, cx + h);
    r.z0 = Math.min(r.z0, cz - h);
    r.z1 = Math.max(r.z1, cz + h);
  }
  return r;
}
