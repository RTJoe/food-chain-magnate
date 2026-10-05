/**
 * Range overlay (ux-plan §3.2): road squares within range in the player colour at three alpha
 * levels by distance (0, 1, 2+ tile borders), start markers on the road squares a range begins
 * on, and map tiles with no road in range dimmed 15%.
 */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import type { RangeOverlayData } from '../../state/boardOverlays.js';
import { COLORS } from '../../theme.js';
import { ROAD_TOP } from '../coords.js';
import { flatMat, quads, startMarker } from './badges.js';
import { startRoads } from './fallback.js';

export const RANGE_ALPHA = [0.62, 0.42, 0.24] as const;
const Y = ROAD_TOP + 0.01;

export function buildRange(b: Board, data: RangeOverlayData): THREE.Group {
  const g = new THREE.Group();
  g.name = 'range';
  const color = data.color ?? COLORS.focus;
  const inRange = data.roads.filter((r) => r.distance <= data.range);
  const levels: { x0: number; z0: number; x1: number; z1: number }[][] = [[], [], []];
  for (const r of inRange) levels[Math.min(2, Math.max(0, r.distance))]!.push({ x0: r.x, z0: r.y, x1: r.x + 1, z1: r.y + 1 });
  levels.forEach((rects, i) => {
    const m = quads(rects, flatMat(color, RANGE_ALPHA[i]!), Y + i * 0.0005, 0.04);
    if (m) {
      m.renderOrder = 4;
      m.name = `range:${i}`;
      g.add(m);
    }
  });
  // Start markers.
  const seen = new Set<string>();
  for (const s of data.starts ?? [])
    for (const c of startRoads(b, s)) {
      const k = `${c.x},${c.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const mk = startMarker(color, 0.26);
      mk.position.set(c.x + 0.5, Y + 0.004, c.y + 0.5);
      g.add(mk);
    }
  // Dim tiles with no road in range.
  if (data.dimOutside !== false) {
    const ts = b.tileSize;
    const live = new Set(inRange.map((r) => `${Math.floor(r.x / ts)},${Math.floor(r.y / ts)}`));
    const dim = b.tiles.filter((t) => !live.has(`${t.col},${t.row}`)).map((t) => ({ x0: t.col * ts, z0: t.row * ts, x1: t.col * ts + ts, z1: t.row * ts + ts }));
    const m = quads(dim, flatMat(COLORS.shadow, 0.15), 0.075, 0.02);
    if (m) {
      m.renderOrder = 3;
      m.name = 'range:dim';
      g.add(m);
    }
  }
  return g;
}
