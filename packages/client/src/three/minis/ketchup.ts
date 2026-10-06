/** Ketchup expansion pieces: park, lobbyist road works, roadworks marker, freeway; generic fallback. */
import * as THREE from 'three';
import type { Cell, Direction } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { dirAngle } from '../coords.js';
import { makeBadge, signTexture } from '../labels.js';
import { tree, bush } from './buildings.js';
import { blob, face, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cone, cyl, extrude, miniGeo, playerPalette, shade } from './kit.js';

// ---------------------------------------------------------------------------
// Park
// ---------------------------------------------------------------------------

function parkShape(w: number, h: number): Shape {
  const s = new Shape();
  s.add(box(w - 0.1, 0.06, h - 0.1, 0.03), P.lot, { jitter: 0 });
  s.add(box(w - 0.24, 0.03, h - 0.24, 0.01), COLORS.park, { at: [0, 0.06, 0], jitter: 0 });
  // Winding path (two segments).
  s.add(box(w - 0.3, 0.012, 0.16, 0.005), P.stone, { at: [0, 0.09, h > 1.5 ? 0.15 : 0.0], rot: [0, 0.12, 0] });
  if (h > 1.5) s.add(box(0.16, 0.012, h * 0.45, 0.005), P.stone, { at: [0.2, 0.09, -h * 0.2] });
  // Pond.
  if (w * h >= 4) {
    s.add(cyl(0.34, 0.36, 0.02, 10), COLORS.water, { at: [-w / 4, 0.09, -h / 4], scale: [1.3, 1, 1], mat: 'glass' });
    s.add(cyl(0.38, 0.4, 0.015, 10), P.stone, { at: [-w / 4, 0.085, -h / 4], scale: [1.3, 1, 1] });
  }
  // Trees.
  const spots: [number, number, number][] =
    w * h >= 4
      ? [
          [w / 3, -h / 3, 1.15],
          [-w / 3 + 0.05, h / 3, 1.0],
          [w / 3 - 0.05, h / 3 - 0.05, 0.85],
          [0.05, -h / 3 - 0.05, 0.75],
        ]
      : [
          [-w / 3, 0.05, 1.0],
          [w / 3, -0.05, 0.9],
          [0, -0.18, 0.7],
        ];
  spots.forEach(([x, z, sz], i) => tree(s, x, z, sz, i % 2 ? P.leafLight : P.leaf));
  bush(s, -w / 2 + 0.25, -h / 2 + 0.25, 0.1);
  bush(s, w / 2 - 0.22, 0.05, 0.09, P.leaf);
  // Bench + lamp.
  s.add(box(0.3, 0.04, 0.1, 0.01), P.wood, { at: [-0.05, 0.16, h > 1.5 ? 0.42 : 0.28] });
  s.add(box(0.3, 0.1, 0.03, 0.01), P.wood, { at: [-0.05, 0.2, h > 1.5 ? 0.48 : 0.34] });
  s.add(cyl(0.015, 0.015, 0.45, 4), P.steelDark, { at: [0.3, 0.09, h > 1.5 ? 0.42 : 0.3] });
  s.add(ball(0.04, 0), '#fff3a8', { at: [0.3, 0.56, h > 1.5 ? 0.42 : 0.3], mat: 'glow' });
  // Flowers.
  for (let i = 0; i < 6; i++)
    s.add(ball(0.04, 0), ['#e25b8b', '#fff3a8', '#f08a3c'][i % 3]!, {
      at: [((i * 0.37) % 1 - 0.5) * (w - 0.5), 0.11, (((i * 0.61) % 1) - 0.5) * (h - 0.5)],
    });
  return s;
}

export function buildPark(ctx: MiniCtx, p: { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  const vertical = p.h > p.w;
  const body = new THREE.Group();
  if (vertical) body.rotation.y = Math.PI / 2;
  g.add(body);
  const w = Math.max(p.w, p.h);
  const h = Math.min(p.w, p.h);
  blob(ctx, body, w, h, true, 0.4);
  solid(ctx, body, miniGeo(`park:${w}:${h}`, () => parkShape(w, h)));
  return g;
}

// ---------------------------------------------------------------------------
// Traffic cones / barriers
// ---------------------------------------------------------------------------

function coneShape(): Shape {
  const s = new Shape();
  s.add(box(0.2, 0.025, 0.2, 0.008), '#2f2d36', { jitter: 0 });
  s.add(cone(0.075, 0.28, 8), '#f08a3c', { at: [0, 0.02, 0] });
  s.add(cyl(0.048, 0.056, 0.05, 8), P.white, { at: [0, 0.12, 0], jitter: 0 });
  return s;
}

function barrierShape(color: string): Shape {
  const s = new Shape();
  for (const x of [-0.32, 0.32]) {
    s.add(box(0.05, 0.3, 0.05, 0.01), P.steelDark, { at: [x, 0, 0] });
    s.add(box(0.16, 0.03, 0.12, 0.01), '#2f2d36', { at: [x, 0, 0] });
  }
  for (let i = 0; i < 5; i++)
    s.add(box(0.14, 0.1, 0.03, 0.005), i % 2 ? P.white : '#e25b4b', { at: [-0.28 + i * 0.14, 0.18, 0], jitter: 0 });
  s.add(ball(0.035, 0), '#f8d24a', { at: [-0.32, 0.34, 0], mat: 'glow' });
  s.add(box(0.12, 0.05, 0.035, 0.01), playerPalette(color).base, { at: [0.32, 0.3, 0] });
  return s;
}

function arrowShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.lineTo(0.35, 0.05);
  s.lineTo(0.14, 0.05);
  s.lineTo(0.14, -0.45);
  s.lineTo(-0.14, -0.45);
  s.lineTo(-0.14, 0.05);
  s.lineTo(-0.35, 0.05);
  s.closePath();
  return s;
}

const arrowGeo = (color: string) =>
  miniGeo(`roadArrow:${color}`, () =>
    new Shape().add(extrude('roadArrowShape', arrowShape, 0.012, 0), color, { rot: [-Math.PI / 2, 0, 0], scale: 0.7, jitter: 0 }),
  );

/** Lobbyist road overlay: arrows at the connection ends; cones and barriers while under construction. */
export function buildLobbyistRoad(
  ctx: MiniCtx,
  p: { color: string; cells: Cell[]; underConstruction: boolean; arrows: { from: Cell; dir: Direction }[]; origin: [number, number] },
): THREE.Group {
  const g = new THREE.Group();
  const [ox, oz] = p.origin;
  const pal = playerPalette(p.color);
  for (const a of p.arrows) {
    const o = new THREE.Group();
    o.name = 'arrow';
    o.position.set(a.from.x + 0.5 - ox, 0.045, a.from.y + 0.5 - oz);
    // dirAngle maps +z to the direction; the arrow shape points to -z, so add PI.
    o.rotation.y = dirAngle(a.dir) + Math.PI;
    const inner = new THREE.Group();
    inner.position.z = 0.15;
    o.add(inner);
    g.add(o);
    solid(ctx, inner, arrowGeo(p.underConstruction ? '#f8d24a' : pal.light), { castShadow: false });
  }
  if (p.underConstruction) {
    p.cells.forEach((c, i) => {
      const cx = c.x + 0.5 - ox;
      const cz = c.y + 0.5 - oz;
      const b = new THREE.Group();
      // Named per square so the choreographies pop / pack the works one by one.
      b.name = `works:${i}`;
      b.position.set(cx, 0.04, cz);
      const horiz = p.cells.some((d) => d.y === c.y && Math.abs(d.x - c.x) === 1);
      b.rotation.y = horiz ? 0 : Math.PI / 2;
      g.add(b);
      const bar = new THREE.Group();
      bar.position.z = i % 2 ? 0.34 : -0.34;
      b.add(bar);
      solid(ctx, bar, miniGeo(`barrier:${p.color}`, () => barrierShape(p.color)));
      for (const dx of [-0.3, 0.3]) {
        const cn = new THREE.Group();
        cn.position.set(dx, 0, i % 2 ? -0.3 : 0.3);
        b.add(cn);
        solid(ctx, cn, miniGeo('cone', coneShape));
      }
    });
    const badge = makeBadge('Works', { bg: '#f8d24a', fg: COLORS.ink, ring: COLORS.ink, pill: true }, 0.3);
    badge.position.set(0, 0.9, 0);
    badge.name = 'badge';
    g.add(badge);
  }
  return g;
}

/** Roadworks marker: one big cone with a sign. */
export function buildRoadworks(ctx: MiniCtx): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 0.6, 0.6, false, 0.6);
  const c = new THREE.Group();
  c.scale.setScalar(1.5);
  g.add(c);
  solid(ctx, c, miniGeo('cone', coneShape));
  const sgn = new THREE.Group();
  sgn.position.set(0.25, 0.03, 0.12);
  g.add(sgn);
  solid(
    ctx,
    sgn,
    miniGeo('roadworksSign', () => {
      const s = new Shape();
      s.add(cyl(0.015, 0.015, 0.36, 4), P.steelDark);
      s.add(extrude('tri', triShape, 0.03, 0.01), '#f8d24a', { at: [0, 0.4, 0], scale: 0.14 });
      s.add(extrude('tri', triShape, 0.032, 0), '#e25b4b', { at: [0, 0.4, 0], scale: 0.17 });
      return s;
    }),
  );
  return g;
}

function triShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 1);
  s.lineTo(0.95, -0.6);
  s.lineTo(-0.95, -0.6);
  s.closePath();
  return s;
}

// ---------------------------------------------------------------------------
// Freeway (beside an outer tile edge; canonical side S, ramp runs outwards to +z)
// ---------------------------------------------------------------------------

function freewayShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  const L = 3.2;
  const rise = 0.95;
  const slope = Math.atan2(rise, L);
  const len = Math.hypot(L, rise);
  // Deck (inclined slab) from the board edge outwards.
  s.add(box(0.86, 0.09, len, 0.02), '#8f8b88', { at: [0, rise / 2 - 0.02, L / 2 + 0.05], rot: [-slope, 0, 0] });
  s.add(box(0.7, 0.012, len, 0), COLORS.road, { at: [0, rise / 2 + 0.065, L / 2 + 0.05], rot: [-slope, 0, 0], jitter: 0 });
  for (const x of [-0.42, 0.42])
    s.add(box(0.05, 0.12, len, 0.01), P.kerb, { at: [x, rise / 2 + 0.03, L / 2 + 0.05], rot: [-slope, 0, 0] });
  for (let i = 0; i < 5; i++)
    s.add(box(0.05, 0.012, 0.22, 0), COLORS.roadLine, { at: [0, 0.1 + ((i + 0.5) / 5) * rise + 0.06, ((i + 0.5) / 5) * L], rot: [-slope, 0, 0], jitter: 0 });
  // Pillars.
  for (const t of [0.4, 0.7, 0.95]) {
    const h = t * rise;
    s.add(box(0.2, h, 0.2, 0.03), P.stone, { at: [0, 0, t * L] });
  }
  // Elevated end platform.
  s.add(box(0.9, 0.1, 0.8, 0.02), '#8f8b88', { at: [0, rise - 0.04, L + 0.4] });
  s.add(box(0.74, 0.012, 0.8, 0), COLORS.road, { at: [0, rise + 0.06, L + 0.4], jitter: 0 });
  s.add(box(0.24, rise, 0.24, 0.03), P.stone, { at: [0, 0, L + 0.5] });
  // Sign gantry.
  for (const x of [-0.5, 0.5]) s.add(cyl(0.025, 0.025, 1.0, 5), P.steelDark, { at: [x, rise, L - 0.2], mat: 'metal' });
  s.add(box(1.04, 0.05, 0.05, 0.01), P.steelDark, { at: [0, rise + 0.95, L - 0.2], mat: 'metal' });
  s.add(box(0.14, 0.04, 0.04, 0.01), pal.base, { at: [0.42, rise + 0.99, L - 0.2] });
  return s;
}

export function buildFreeway(ctx: MiniCtx, p: { color: string; side: Direction }): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = dirAngle(p.side);
  g.add(body);
  const shadow = new THREE.Group();
  shadow.position.z = 1.9;
  body.add(shadow);
  blob(ctx, shadow, 1.2, 4.0, true, 0.5);
  solid(ctx, body, miniGeo(`freeway:${p.color}`, () => freewayShape(p.color)));
  const sign = face(ctx, body, signTexture('RURAL', '#2f7a46', '#fffaf0'), 0.8, 0.3, false);
  sign.position.set(0, 0.95 + 0.78, 3.2 - 0.17);
  const back = face(ctx, body, signTexture('RURAL', '#2f7a46', '#fffaf0'), 0.8, 0.3, false);
  back.position.set(0, 0.95 + 0.78, 3.2 - 0.23);
  back.rotation.y = Math.PI;
  return g;
}

// ---------------------------------------------------------------------------
// Generic fallback for unknown module entity kinds
// ---------------------------------------------------------------------------

export function buildGeneric(ctx: MiniCtx, p: { label: string; color?: string; w?: number; h?: number }): THREE.Group {
  const g = new THREE.Group();
  const w = p.w ?? 1;
  const h = p.h ?? 1;
  blob(ctx, g, w, h, true, 0.5);
  solid(
    ctx,
    g,
    miniGeo(`generic:${w}:${h}:${p.color ?? ''}`, () => {
      const s = new Shape();
      s.add(box(w - 0.15, 0.06, h - 0.15, 0.03), p.color ? shade(p.color, -0.2) : P.lot, { jitter: 0 });
      s.add(box(0.45, 0.4, 0.45, 0.05), P.wood, { at: [0, 0.06, 0] });
      s.add(box(0.47, 0.06, 0.47, 0.02), P.woodDark, { at: [0, 0.22, 0] });
      return s;
    }),
  );
  const badge = makeBadge(p.label.slice(0, 6) || '?', { pill: true }, 0.3);
  badge.position.set(0, 0.85, 0);
  badge.name = 'badge';
  g.add(badge);
  return g;
}
