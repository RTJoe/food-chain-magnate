/**
 * Spot grouping for board picks (ux-plan §3.2, WP3). A "spot" is what the pointer chooses; its
 * variants are what R / rotate cycles.
 *
 * - Campaigns: spot = anchor square + tile number (`campaign:x,y:#n`); variants = orientations
 *   (landscape / portrait / square) at that anchor, one each. Airplanes are keyed by side + offset,
 *   rural giant billboards by side, gourmet guides by tile number.
 * - Freeways: spot = side + the edge square the piece centres on; variants = end-on / lengthwise.
 * - Everything else: placements sharing a hit rectangle (entrance corners, garden sides...).
 */
import type { Board, CampaignOrientation, Placement } from '@fcm/engine';
import { placementHitRect, spotKey, type Rect } from './layout.js';

export interface Spot {
  key: string;
  variants: Placement[];
  /** Hit rectangle per variant (orientations differ; other kinds share one). */
  rects: Rect[];
  /** Union of `rects`: the pointer is "on" the spot anywhere inside. */
  hit: Rect;
}

export interface SpotIndex {
  spots: Spot[];
  /** Every input placement → the spot and variant that shows it (duplicates map to the kept variant). */
  of: Map<Placement, { spot: Spot; idx: number }>;
}

/**
 * On-board orientation of a campaign placement (engine field, else from w × h). Lobbyist roads and
 * parks (WP5) also rotate in place: landscape = along x, portrait = along y.
 */
export function orientationOf(p: Placement): CampaignOrientation | null {
  if (p.kind === 'lobbyistRoad') return p.cells.length < 2 ? 'square' : p.cells[0]!.y === p.cells[1]!.y ? 'landscape' : 'portrait';
  if (p.kind === 'park') return p.w === p.h ? 'square' : p.w > p.h ? 'landscape' : 'portrait';
  // Freeways (rules v4): end-on runs across its edge, lengthwise along it.
  if (p.kind === 'freeway') return (p.side === 'N' || p.side === 'S') === !!p.lengthwise ? 'landscape' : 'portrait';
  if (p.kind !== 'campaign') return null;
  if (p.orientation) return p.orientation;
  const pl = p.placement;
  if (pl.kind !== 'board') return null;
  return pl.w === pl.h ? 'square' : pl.w > pl.h ? 'landscape' : 'portrait';
}

/** Spot key: campaigns by anchor + tile number (orientation is a variant); others by hit rectangle. */
export function spotKeyFor(b: Board, p: Placement): string {
  // Lobbyist roads pivot on their middle square (first square for length 2), parks on the top-left
  // square: both orientations of one piece are variants of one spot, so R turns it in place.
  if (p.kind === 'lobbyistRoad') {
    const a = p.cells[Math.floor((p.cells.length - 1) / 2)];
    if (a) return `lobbyistRoad:${a.x},${a.y}:L${p.cells.length}`;
  }
  if (p.kind === 'park') return `park:${p.x},${p.y}:${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}`;
  // Freeways pivot on the edge square they centre on: end-on at `offset`, lengthwise its middle.
  if (p.kind === 'freeway') return `freeway:${p.side}:${p.lengthwise ? p.offset + 1 : p.offset}`;
  if (p.kind !== 'campaign') return spotKey(b, p);
  const pl = p.placement;
  switch (pl.kind) {
    case 'board':
      return `campaign:${pl.x},${pl.y}:#${p.tileNumber}`;
    case 'airplane':
      return `campaign:air:${pl.side},${pl.offset}:#${p.tileNumber}`;
    case 'rural':
      return `campaign:rural:${pl.side}:#${p.tileNumber}`;
    case 'offBoard':
      return `campaign:off:#${p.tileNumber}`;
  }
}

/** Within a campaign spot, placements that look the same (differ only in range start) collapse. */
function variantKey(p: Placement): string {
  if (p.kind === 'campaign') return orientationOf(p) ?? JSON.stringify(p.placement);
  if (p.kind === 'lobbyistRoad' || p.kind === 'park' || p.kind === 'freeway') return orientationOf(p) ?? JSON.stringify(p);
  return JSON.stringify(p);
}

export function groupSpots(b: Board, placements: readonly Placement[]): SpotIndex {
  const byKey = new Map<string, Spot>();
  const seen = new Map<string, Map<string, number>>();
  const of = new Map<Placement, { spot: Spot; idx: number }>();
  for (const p of placements) {
    const rect = placementHitRect(b, p);
    if (!rect) continue;
    const k = spotKeyFor(b, p);
    let s = byKey.get(k);
    if (!s) {
      s = { key: k, variants: [], rects: [], hit: { ...rect } };
      byKey.set(k, s);
      seen.set(k, new Map());
    }
    const vs = seen.get(k)!;
    const vk = p.kind === 'campaign' || p.kind === 'lobbyistRoad' || p.kind === 'park' || p.kind === 'freeway' ? variantKey(p) : null;
    const dup = vk !== null ? vs.get(vk) : undefined;
    if (dup !== undefined) {
      of.set(p, { spot: s, idx: dup });
      continue;
    }
    if (vk !== null) vs.set(vk, s.variants.length);
    s.variants.push(p);
    s.rects.push(rect);
    s.hit = { x0: Math.min(s.hit.x0, rect.x0), z0: Math.min(s.hit.z0, rect.z0), x1: Math.max(s.hit.x1, rect.x1), z1: Math.max(s.hit.z1, rect.z1) };
    of.set(p, { spot: s, idx: s.variants.length - 1 });
  }
  return { spots: [...byKey.values()], of };
}

export function rectContains(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}
