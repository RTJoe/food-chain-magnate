/** Ketchup expansion pieces: park, lobbyist road works, roadworks marker, freeway; generic fallback. */
import * as THREE from 'three';
import type { Cell, Direction } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { FREEWAY } from '../anim/path.js';
import { dirAngle } from '../coords.js';
import { makeBadge, signTexture } from '../labels.js';
import { PLASTIC, plasticPen, plasticTree, type Pen as PlasticPen } from './buildings.js';
import { blob, face, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cone, cyl, extrude, miniGeo, playerPalette, shade } from './kit.js';

// ---------------------------------------------------------------------------
// Park
// ---------------------------------------------------------------------------

type Pen = PlasticPen & { shape: Shape };

/** Park bench (seat, back, two legs) at (x, z), facing +z unless `rot`. */
function parkBench(pen: Pen, x: number, z: number, rot = 0): void {
  const b = new Shape();
  const bp = plasticPen(b, PLASTIC.park);
  bp(box(0.34, 0.035, 0.12, 0), 0.04, { at: [0, 0.1, 0] });
  bp(box(0.34, 0.1, 0.03, 0), 0.04, { at: [0, 0.14, -0.06] });
  for (const dx of [-0.13, 0.13]) bp(box(0.03, 0.1, 0.1, 0), -0.1, { at: [dx, 0, 0] });
  pen.shape.addShape(b, { at: [x, 0.09, z], rot: [0, rot, 0] });
}

/** Park in SE monochrome park green: plate, lawn, path, round trees, a bench (a pond on big parks). */
function parkShape(w: number, h: number): Shape {
  const s = new Shape();
  const pen = Object.assign(plasticPen(s, PLASTIC.park), { shape: s });
  pen(box(w - 0.15, 0.06, h - 0.15, 0.02), -0.03, { jitter: 0 });
  pen(box(w - 0.3, 0.03, h - 0.3, 0), 0, { at: [0, 0.06, 0], jitter: 0 });
  // Winding path (two segments), embossed lighter.
  pen(box(w - 0.3, 0.012, 0.16, 0), 0.08, { at: [0, 0.09, h > 1.5 ? 0.15 : 0.0], rot: [0, 0.12, 0], jitter: 0 });
  if (h > 1.5) pen(box(0.16, 0.012, h * 0.45, 0), 0.08, { at: [0.2, 0.09, -h * 0.2], jitter: 0 });
  // Pond: a glossy disc with a raised rim.
  if (w * h >= 4) {
    pen(cyl(0.4, 0.42, 0.03, 10), 0.04, { at: [-w / 4, 0.09, -h / 4], scale: [1.3, 1, 1] });
    pen(cyl(0.34, 0.34, 0.006, 10), -0.12, { at: [-w / 4, 0.12, -h / 4], scale: [1.3, 1, 1], mat: 'glass', jitter: 0 });
  }
  const spots: [number, number, number][] =
    w * h >= 4
      ? [
          [w / 3, -h / 3, 1.3],
          [-w / 3 + 0.05, h / 3, 1.15],
          [w / 3 - 0.05, h / 3 - 0.05, 1.0],
        ]
      : [
          [-w / 3, 0.05, 1.15],
          [w / 3, -0.05, 1.05],
          [0.05, -0.2, 0.85],
        ];
  for (const [x, z, sz] of spots) plasticTree(pen, x, z, sz, 0.09);
  parkBench(pen, -0.05, h > 1.5 ? 0.45 : 0.3);
  return s;
}

/**
 * Park on exactly its squares (I, T and L lobbyist parks), in coordinates relative to the centre
 * of its bounding box: one lawn joined across neighbouring squares, a path linking the squares, a
 * tree per square, a pond on the busiest square of a big park, a bench.
 */
function parkCellsShape(cells: readonly [number, number][], w: number, h: number): Shape {
  const s = new Shape();
  const pen = Object.assign(plasticPen(s, PLASTIC.park), { shape: s });
  const has = (x: number, z: number) => cells.some(([cx, cz]) => cx === x && cz === z);
  const ctr = (x: number, z: number): [number, number] => [x + 0.5 - w / 2, z + 0.5 - h / 2];
  const degree = (x: number, z: number) => [has(x + 1, z), has(x - 1, z), has(x, z + 1), has(x, z - 1)].filter(Boolean).length;
  const hub = [...cells].sort((a, b) => degree(b[0], b[1]) - degree(a[0], a[1]))[0]!;
  cells.forEach(([x, z], i) => {
    const [cx, cz] = ctr(x, z);
    const e = (open: boolean, m: number) => (open ? 0 : m);
    const lot = (m: number, y: number, hgt: number, tint: number) => {
      const x0 = cx - 0.5 + e(has(x - 1, z), m);
      const x1 = cx + 0.5 - e(has(x + 1, z), m);
      const z0 = cz - 0.5 + e(has(x, z - 1), m);
      const z1 = cz + 0.5 - e(has(x, z + 1), m);
      pen(box(x1 - x0, hgt, z1 - z0, 0), tint, { at: [(x0 + x1) / 2, y, (z0 + z1) / 2], jitter: 0 });
    };
    lot(0.075, 0, 0.06, -0.03);
    lot(0.15, 0.06, 0.03, 0);
    // Path to the east / south neighbour (each link once).
    if (has(x + 1, z)) pen(box(1.0, 0.012, 0.14, 0), 0.08, { at: [cx + 0.5, 0.09, cz], jitter: 0 });
    if (has(x, z + 1)) pen(box(0.14, 0.012, 1.0, 0), 0.08, { at: [cx, 0.09, cz + 0.5], jitter: 0 });
    const pond = cells.length >= 4 && x === hub[0] && z === hub[1];
    if (pond) {
      pen(cyl(0.3, 0.32, 0.03, 10), 0.04, { at: [cx, 0.09, cz] });
      pen(cyl(0.25, 0.25, 0.006, 10), -0.12, { at: [cx, 0.12, cz], mat: 'glass', jitter: 0 });
    } else {
      const k = (i * 0.37) % 1;
      plasticTree(pen, cx + (k - 0.5) * 0.4, cz - 0.18, 0.95 + k * 0.3, 0.09);
    }
  });
  const [bx, bz] = ctr(cells[0]![0], cells[0]![1]);
  parkBench(pen, bx - 0.05, bz + 0.26);
  return s;
}

export function buildPark(ctx: MiniCtx, p: { w: number; h: number; cells?: readonly [number, number][] }): THREE.Group {
  if (p.cells && p.cells.length < p.w * p.h) {
    const g = new THREE.Group();
    const key = p.cells.map(([x, z]) => `${x}.${z}`).join(',');
    for (const [x, z] of p.cells) {
      const sq = new THREE.Group();
      sq.position.set(x + 0.5 - p.w / 2, 0, z + 0.5 - p.h / 2);
      g.add(sq);
      blob(ctx, sq, 1.05, 1.05, true, 0.6);
    }
    solid(ctx, g, miniGeo(`parkCells:se:${p.w}x${p.h}:${key}`, () => parkCellsShape(p.cells!, p.w, p.h)));
    return g;
  }
  const g = new THREE.Group();
  const vertical = p.h > p.w;
  const body = new THREE.Group();
  if (vertical) body.rotation.y = Math.PI / 2;
  g.add(body);
  const w = Math.max(p.w, p.h);
  const h = Math.min(p.w, p.h);
  blob(ctx, body, w + 0.05, h + 0.05, true, 0.6);
  solid(ctx, body, miniGeo(`park:se:${w}:${h}`, () => parkShape(w, h)));
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
  // Shared with the van's height profile (anim/path.ts freewayY).
  const L = FREEWAY.run;
  const rise = FREEWAY.rise;
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
