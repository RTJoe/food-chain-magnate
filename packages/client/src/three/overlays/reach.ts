/**
 * Reach overlay (ux-plan §3.2): houses a campaign would reach get a pulsing ring and a "+1 good"
 * chip; full houses get a grey "full" chip instead. Optional tinted cells (mailbox block, radio
 * tiles) and an airplane band across the covered rows or columns.
 */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import type { ReachOverlayData } from '../../state/boardOverlays.js';
import { COLORS } from '../../theme.js';
import type { Rect } from '../layout.js';
import { flatMat, makeChip, quads } from './badges.js';

export interface ReachTarget {
  rect: Rect;
  /** Chip anchor height (house badge). */
  y: number;
}

export function buildReach(b: Board, data: ReachOverlayData, target: (houseId: string) => ReachTarget | null): { group: THREE.Group; tick(t: number): boolean } {
  const g = new THREE.Group();
  g.name = 'reach';
  const color = data.color ?? COLORS.focus;
  const full = new Set(data.full ?? []);
  if (data.cells?.length) {
    const m = quads(
      data.cells.map((c) => ({ x0: c.x, z0: c.y, x1: c.x + 1, z1: c.y + 1 })),
      flatMat(color, 0.16),
      0.074,
    );
    if (m) {
      m.renderOrder = 4;
      g.add(m);
    }
  }
  if (data.band) {
    const { axis, from, to } = data.band;
    const r = axis === 'row' ? { x0: -0.4, z0: from, x1: b.w + 0.4, z1: to + 1 } : { x0: from, z0: -0.4, x1: to + 1, z1: b.h + 0.4 };
    const m = quads([r], flatMat(color, 0.14), 0.08);
    if (m) {
      m.renderOrder = 4;
      g.add(m);
    }
  }
  const rings: THREE.Mesh[] = [];
  for (const id of data.houseIds) {
    const t = target(id);
    if (!t) continue;
    const isFull = full.has(id);
    const cx = (t.rect.x0 + t.rect.x1) / 2;
    const cz = (t.rect.z0 + t.rect.z1) / 2;
    const rad = Math.max(t.rect.x1 - t.rect.x0, t.rect.z1 - t.rect.z0) * 0.62;
    // Ink outline under the colour ring: a pale chain colour still reads on the off-white print.
    const outline = new THREE.Mesh(new THREE.RingGeometry(rad - 0.04, rad + 0.18, 48).rotateX(-Math.PI / 2), flatMat(COLORS.ink, 0.85));
    outline.position.y = -0.001;
    outline.renderOrder = 4;
    const ring = new THREE.Mesh(new THREE.RingGeometry(rad, rad + 0.14, 48).rotateX(-Math.PI / 2), flatMat(isFull ? '#8f8b88' : color, 0.9));
    ring.position.set(cx, 0.09, cz);
    ring.renderOrder = 5;
    ring.userData.base = 0.9;
    ring.add(outline);
    rings.push(ring);
    g.add(ring);
    const chip = isFull ? makeChip('full', null, '#8f8b88') : makeChip('+1', data.good, color);
    chip.position.set(cx, t.y, cz);
    // To the right of the number badge in screen space (the plaque sits above it).
    chip.center.set(-0.45, 0.5);
    g.add(chip);
  }
  return {
    group: g,
    tick(t) {
      if (!rings.length) return false;
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      for (const r of rings) {
        r.scale.setScalar(1 + k * 0.08);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.55 + k * 0.4;
      }
      return true;
    },
  };
}
