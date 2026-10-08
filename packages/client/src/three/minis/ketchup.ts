/**
 * Ketchup expansion pieces: park, lobbyist road works (hazard chevrons, barriers, cones), the
 * hazard-striped roadworks token, the freeway with its green FREEWAY gantry; generic fallback.
 */
import * as THREE from 'three';
import type { Cell, Direction } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { FREEWAY } from '../anim/path.js';
import { dirAngle } from '../coords.js';
import { BADGE_MIN_PX, makeBadge } from '../labels.js';
import { paintedTree } from './buildings.js';
import { blob, face, solid, type MiniCtx } from './ctx.js';
import { decalTexture, roundRect } from './marketing.js';
import { Shape, ball, box, cone, cyl, extrude, miniGeo, playerPalette, shade, type Paint, type PartOpts } from './kit.js';
import { PAINT } from './paint.js';

// ---------------------------------------------------------------------------
// Park
// ---------------------------------------------------------------------------

type Add = (geo: THREE.BufferGeometry, paint: Paint, o?: PartOpts) => Shape;
const painter =
  (s: Shape): Add =>
  (geo, paint, o = {}) =>
    s.add(geo, paint, { jitter: 0.03, ...o });

/** Park plate edge (a darker turf verge) and gravel paths. */
const VERGE = PAINT.lawnDark;
const GRAVEL = '#d8cdb4';

/** Park bench (timber seat and back, iron legs) at (x, z), facing +z unless `rot`. */
function parkBench(s: Shape, x: number, z: number, rot = 0): void {
  const b = new Shape();
  b.add(box(0.34, 0.035, 0.12, 0), PAINT.wood, { at: [0, 0.1, 0] });
  b.add(box(0.34, 0.1, 0.03, 0), PAINT.wood, { at: [0, 0.14, -0.06] });
  for (const dx of [-0.13, 0.13]) b.add(box(0.03, 0.1, 0.1, 0), PAINT.trimDark, { at: [dx, 0, 0], mat: 'metal' });
  s.addShape(b, { at: [x, 0.09, z], rot: [0, rot, 0] });
}

/** Pond: a stone rim around glossy water. */
function pond(add: Add, x: number, z: number, r: number, sx = 1): void {
  add(cyl(r, r + 0.02, 0.03, 10), PAINT.stone, { at: [x, 0.09, z], scale: [sx, 1, 1] });
  add(cyl(r - 0.06, r - 0.06, 0.006, 10), PAINT.water, { at: [x, 0.12, z], scale: [sx, 1, 1], mat: 'glass', jitter: 0 });
}

/** Painted park: turf verge, lawn, gravel path, round trees, a bench (a pond on big parks). */
function parkShape(w: number, h: number): Shape {
  const s = new Shape();
  const add = painter(s);
  add(box(w - 0.15, 0.06, h - 0.15, 0.02), VERGE, { jitter: 0 });
  add(box(w - 0.3, 0.03, h - 0.3, 0), PAINT.lawn, { at: [0, 0.06, 0], jitter: 0 });
  // Winding gravel path (two segments).
  add(box(w - 0.3, 0.012, 0.16, 0), GRAVEL, { at: [0, 0.09, h > 1.5 ? 0.15 : 0.0], rot: [0, 0.12, 0], jitter: 0 });
  if (h > 1.5) add(box(0.16, 0.012, h * 0.45, 0), GRAVEL, { at: [0.2, 0.09, -h * 0.2], jitter: 0 });
  if (w * h >= 4) pond(add, -w / 4, -h / 4, 0.4, 1.3);
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
  spots.forEach(([x, z, sz], i) => paintedTree(s, x, z, sz, 0.09, i % 2 ? PAINT.leaf : '#4f8c3e'));
  parkBench(s, -0.05, h > 1.5 ? 0.45 : 0.3);
  return s;
}

/**
 * Park on exactly its squares (I, T and L lobbyist parks), in coordinates relative to the centre
 * of its bounding box: one lawn joined across neighbouring squares, a path linking the squares, a
 * tree per square, a pond on the busiest square of a big park, a bench.
 */
function parkCellsShape(cells: readonly [number, number][], w: number, h: number): Shape {
  const s = new Shape();
  const add = painter(s);
  const has = (x: number, z: number) => cells.some(([cx, cz]) => cx === x && cz === z);
  const ctr = (x: number, z: number): [number, number] => [x + 0.5 - w / 2, z + 0.5 - h / 2];
  const degree = (x: number, z: number) => [has(x + 1, z), has(x - 1, z), has(x, z + 1), has(x, z - 1)].filter(Boolean).length;
  const hub = [...cells].sort((a, b) => degree(b[0], b[1]) - degree(a[0], a[1]))[0]!;
  cells.forEach(([x, z], i) => {
    const [cx, cz] = ctr(x, z);
    const e = (open: boolean, m: number) => (open ? 0 : m);
    const lot = (m: number, y: number, hgt: number, paint: string) => {
      const x0 = cx - 0.5 + e(has(x - 1, z), m);
      const x1 = cx + 0.5 - e(has(x + 1, z), m);
      const z0 = cz - 0.5 + e(has(x, z - 1), m);
      const z1 = cz + 0.5 - e(has(x, z + 1), m);
      add(box(x1 - x0, hgt, z1 - z0, 0), paint, { at: [(x0 + x1) / 2, y, (z0 + z1) / 2], jitter: 0 });
    };
    lot(0.075, 0, 0.06, VERGE);
    lot(0.15, 0.06, 0.03, PAINT.lawn);
    // Gravel path to the east / south neighbour (each link once).
    if (has(x + 1, z)) add(box(1.0, 0.012, 0.14, 0), GRAVEL, { at: [cx + 0.5, 0.09, cz], jitter: 0 });
    if (has(x, z + 1)) add(box(0.14, 0.012, 1.0, 0), GRAVEL, { at: [cx, 0.09, cz + 0.5], jitter: 0 });
    const isPond = cells.length >= 4 && x === hub[0] && z === hub[1];
    if (isPond) pond(add, cx, cz, 0.3);
    else {
      const k = (i * 0.37) % 1;
      paintedTree(s, cx + (k - 0.5) * 0.4, cz - 0.18, 0.95 + k * 0.3, 0.09, i % 2 ? PAINT.leaf : '#4f8c3e');
    }
  });
  const [bx, bz] = ctr(cells[0]![0], cells[0]![1]);
  parkBench(s, bx - 0.05, bz + 0.26);
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
// Road works: cones, barriers, chevron edge strips (art bible §6.11)
// ---------------------------------------------------------------------------

/** Hazard orange and white of the Ketchup "under construction" print. */
const HAZARD = '#f08a3c';
const HAZARD_WHITE = '#fdfcfa';
/** Freeway sign green (Ketchup p.25). */
const FREEWAY_GREEN = '#2f7a46';
/** Yellow road edge line. */
const EDGE_YELLOW = PAINT.lineYellow;

/** Traffic cone: black rubber foot, orange body with a white reflective band. */
function coneShape(): Shape {
  const s = new Shape();
  s.add(box(0.2, 0.025, 0.2, 0.008), PAINT.rubber, { jitter: 0 });
  s.add(cone(0.075, 0.28, 8), HAZARD, { at: [0, 0.02, 0] });
  s.add(cyl(0.048, 0.056, 0.05, 8), HAZARD_WHITE, { at: [0, 0.12, 0], jitter: 0.02 });
  return s;
}

/** Striped A-barrier: two legs, an orange / white striped board, a lamp, an owner tab. */
function barrierShape(color: string): Shape {
  const s = new Shape();
  for (const x of [-0.32, 0.32]) {
    s.add(box(0.05, 0.3, 0.05, 0.01), PAINT.metalDark, { at: [x, 0, 0], mat: 'metal' });
    s.add(box(0.16, 0.03, 0.12, 0.01), PAINT.rubber, { at: [x, 0, 0] });
  }
  for (let i = 0; i < 5; i++)
    s.add(box(0.14, 0.1, 0.03, 0.005), i % 2 ? HAZARD_WHITE : HAZARD, { at: [-0.28 + i * 0.14, 0.18, 0], jitter: 0.03 });
  s.add(ball(0.035, 0), '#f8d24a', { at: [-0.32, 0.34, 0], mat: 'glow' });
  s.add(box(0.12, 0.05, 0.035, 0.01), playerPalette(color).base, { at: [0.32, 0.3, 0] });
  return s;
}

/** One diagonal hazard stripe (a parallelogram), lying in the xy plane. */
function stripeShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.07, -0.5);
  s.lineTo(0.03, -0.5);
  s.lineTo(0.07, 0.5);
  s.lineTo(-0.03, 0.5);
  s.closePath();
  return s;
}

/** Chevron strips along both edges of one road square (flat, on the road surface). */
function chevronShape(): Shape {
  const s = new Shape();
  for (const z of [-0.42, 0.42]) {
    s.add(box(0.98, 0.01, 0.1, 0), HAZARD_WHITE, { at: [0, 0, z], jitter: 0 });
    for (let i = 0; i < 6; i++)
      s.add(extrude('hzStripe', stripeShape, 0.012, 0), HAZARD, { at: [-0.41 + i * 0.165, 0.008, z], rot: [-Math.PI / 2, 0, 0], scale: [1, 0.1, 1], jitter: 0 });
  }
  return s;
}

const arrowShape = (): THREE.Shape => {
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
};

const arrowGeo = (color: string) =>
  miniGeo(`roadArrow:${color}`, () =>
    new Shape().add(extrude('roadArrowShape', arrowShape, 0.012, 0), color, { rot: [-Math.PI / 2, 0, 0], scale: 0.7, jitter: 0 }),
  );

/**
 * Lobbyist road overlay: arrows at the connection ends; while under construction, orange / white
 * chevron strips along both edges of every square, a striped barrier and a cone on each.
 */
export function buildLobbyistRoad(
  ctx: MiniCtx,
  p: { color: string; cells: Cell[]; underConstruction: boolean; arrows: { from: Cell; dir: Direction }[]; origin: [number, number] },
): THREE.Group {
  const g = new THREE.Group();
  const [ox, oz] = p.origin;
  // Arrows are printed on the under-construction side only; the flipped (finished) tile is plain
  // road, which the road layer already draws.
  for (const a of p.underConstruction ? p.arrows : []) {
    const o = new THREE.Group();
    o.name = 'arrow';
    o.position.set(a.from.x + 0.5 - ox, 0.045, a.from.y + 0.5 - oz);
    // dirAngle maps +z to the direction; the arrow shape points to -z, so add PI.
    o.rotation.y = dirAngle(a.dir) + Math.PI;
    const inner = new THREE.Group();
    inner.position.z = 0.15;
    o.add(inner);
    g.add(o);
    solid(ctx, inner, arrowGeo('#f8d24a'), { castShadow: false });
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
      solid(ctx, b, miniGeo('hzChevrons', chevronShape), { castShadow: false });
      const bar = new THREE.Group();
      bar.position.z = i % 2 ? 0.3 : -0.3;
      b.add(bar);
      solid(ctx, bar, miniGeo(`barrier:${p.color}`, () => barrierShape(p.color)));
      const cn = new THREE.Group();
      cn.position.set(i % 2 ? -0.32 : 0.32, 0, i % 2 ? -0.28 : 0.28);
      b.add(cn);
      solid(ctx, cn, miniGeo('cone', coneShape));
    });
    const badge = makeBadge('Works', { bg: '#f8d24a', fg: COLORS.ink, ring: COLORS.ink, pill: true }, 0.3);
    badge.position.set(0, 0.9, 0);
    badge.name = 'badge';
    badge.userData.minPx = BADGE_MIN_PX * 0.8;
    badge.userData.obstacle = true;
    g.add(badge);
  }
  return g;
}

/** Clip the band c0 ≤ x + z ≤ c1 to the square |x|, |z| ≤ a (convex polygon, ccw). */
function bandInSquare(a: number, c0: number, c1: number): [number, number][] {
  let poly: [number, number][] = [
    [-a, -a],
    [a, -a],
    [a, a],
    [-a, a],
  ];
  const clip = (keep: (p: [number, number]) => number) => {
    const out: [number, number][] = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      const dp = keep(p);
      const dq = keep(q);
      if (dp >= 0) out.push(p);
      if (dp * dq < 0) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    poly = out;
  };
  clip(([x, z]) => x + z - c0);
  clip(([x, z]) => c1 - (x + z));
  return poly;
}

/** Roadworks token: an orange plate with white diagonal stripes, a cone and a red-edged warning sign. */
function roadworksShape(): Shape {
  const s = new Shape();
  const A = 0.43;
  s.add(box(A * 2, 0.04, A * 2, 0.012), HAZARD, { jitter: 0.02 });
  for (let i = -3; i <= 3; i++) {
    const poly = bandInSquare(A - 0.04, i * 0.26 - 0.06, i * 0.26 + 0.06);
    if (poly.length < 3) continue;
    s.add(
      extrude(`rwStripe:${i}`, () => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), 0.008, 0),
      HAZARD_WHITE,
      { at: [0, 0.042, 0], rot: [-Math.PI / 2, 0, 0], jitter: 0 },
    );
  }
  s.addShape(coneShape(), { at: [-0.2, 0.04, 0.16], scale: 1.1 });
  s.add(cyl(0.015, 0.015, 0.36, 4), PAINT.metal, { at: [0.2, 0.04, -0.12], mat: 'metal' });
  s.add(extrude('tri', triShape, 0.03, 0.01), PAINT.flowerWhite, { at: [0.2, 0.44, -0.11], scale: 0.14 });
  s.add(extrude('tri', triShape, 0.032, 0), PAINT.neonRed, { at: [0.2, 0.44, -0.11], scale: 0.17 });
  return s;
}

/** Roadworks marker: the hazard-striped token. */
export function buildRoadworks(ctx: MiniCtx): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 0.95, 0.95, true, 0.5);
  solid(ctx, g, miniGeo('roadworks:se', roadworksShape));
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

/** Gantry sign size and height above the elevated end. */
const GANTRY = { w: 0.92, h: 0.34, y: 0.78 };

function freewayShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  // Shared with the van's height profile (anim/path.ts freewayY).
  const L = FREEWAY.run;
  const rise = FREEWAY.rise;
  const slope = Math.atan2(rise, L);
  const len = Math.hypot(L, rise);
  const deck = (geo: THREE.BufferGeometry, paint: string, x: number, y: number, jitter = 0.04) =>
    s.add(geo, paint, { at: [x, rise / 2 + y, L / 2 + 0.05], rot: [-slope, 0, 0], jitter });
  // Deck (inclined slab) from the board edge outwards, in road grey with yellow edge lines.
  deck(box(0.86, 0.09, len, 0.02), PAINT.concrete, 0, -0.02);
  deck(box(0.7, 0.012, len, 0), PAINT.asphalt, 0, 0.065, 0.02);
  for (const x of [-0.3, 0.3]) deck(box(0.03, 0.012, len, 0), EDGE_YELLOW, x, 0.068, 0);
  for (const x of [-0.42, 0.42]) deck(box(0.05, 0.12, len, 0.01), PAINT.kerb, x, 0.03);
  for (let i = 0; i < 5; i++)
    s.add(box(0.04, 0.012, 0.22, 0), PAINT.lineWhite, { at: [0, 0.1 + ((i + 0.5) / 5) * rise + 0.062, ((i + 0.5) / 5) * L], rot: [-slope, 0, 0], jitter: 0 });
  // Pillars.
  for (const t of [0.4, 0.7, 0.95]) {
    const h = t * rise;
    s.add(box(0.2, h, 0.2, 0.03), PAINT.concrete, { at: [0, 0, t * L] });
  }
  // Elevated end platform.
  s.add(box(0.9, 0.1, 0.8, 0.02), PAINT.concrete, { at: [0, rise - 0.04, L + 0.4] });
  s.add(box(0.74, 0.012, 0.8, 0), PAINT.asphalt, { at: [0, rise + 0.06, L + 0.4], jitter: 0.02 });
  for (const x of [-0.3, 0.3]) s.add(box(0.03, 0.012, 0.8, 0), EDGE_YELLOW, { at: [x, rise + 0.063, L + 0.4], jitter: 0 });
  s.add(box(0.24, rise, 0.24, 0.03), PAINT.concrete, { at: [0, 0, L + 0.5] });
  // Sign gantry with the green FREEWAY board.
  for (const x of [-0.5, 0.5]) s.add(cyl(0.025, 0.025, GANTRY.y + GANTRY.h + 0.06, 5), PAINT.metalDark, { at: [x, rise, L - 0.2], mat: 'metal' });
  s.add(box(1.04, 0.05, 0.05, 0.01), PAINT.metalDark, { at: [0, rise + GANTRY.y + GANTRY.h + 0.04, L - 0.2], mat: 'metal' });
  s.add(box(GANTRY.w + 0.04, GANTRY.h + 0.04, 0.04, 0.01), FREEWAY_GREEN, { at: [0, rise + GANTRY.y - 0.02, L - 0.2] });
  s.add(box(0.14, 0.04, 0.04, 0.01), pal.base, { at: [0.42, rise + GANTRY.y + GANTRY.h + 0.08, L - 0.2] });
  return s;
}

/** Green highway sign: white condensed FREEWAY with an arrow either side. */
function freewaySignTexture(): THREE.Texture {
  const W = 384;
  const H = 142;
  return decalTexture('freewaySign', W, H, (c) => {
    c.fillStyle = FREEWAY_GREEN;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = HAZARD_WHITE;
    c.lineWidth = 6;
    roundRect(c, 9, 9, W - 18, H - 18, 14);
    c.stroke();
    c.fillStyle = HAZARD_WHITE;
    c.font = `700 74px 'Barlow Condensed', 'Oswald', 'Arial Narrow', sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('FREEWAY', W / 2, H / 2 + 4);
    for (const sx of [-1, 1]) {
      const x = W / 2 + sx * 158;
      c.beginPath();
      c.moveTo(x, 36);
      c.lineTo(x + 18, 62);
      c.lineTo(x + 7, 62);
      c.lineTo(x + 7, 106);
      c.lineTo(x - 7, 106);
      c.lineTo(x - 7, 62);
      c.lineTo(x - 18, 62);
      c.closePath();
      c.fill();
    }
  });
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
  const y = FREEWAY.rise + GANTRY.y + GANTRY.h / 2;
  const z = FREEWAY.run - 0.2;
  for (const side of [1, -1]) {
    const f = face(ctx, body, freewaySignTexture(), GANTRY.w, GANTRY.h);
    f.position.set(0, y, z + side * 0.022);
    if (side < 0) f.rotation.y = Math.PI;
  }
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
      s.add(box(w - 0.15, 0.06, h - 0.15, 0.03), p.color ? shade(p.color, -0.2) : PAINT.pavement, { jitter: 0 });
      s.add(box(0.45, 0.4, 0.45, 0.05), PAINT.wood, { at: [0, 0.06, 0], jitter: 0.06 });
      s.add(box(0.47, 0.06, 0.47, 0.02), PAINT.woodDark, { at: [0, 0.22, 0] });
      return s;
    }),
  );
  const badge = makeBadge(p.label.slice(0, 6) || '?', { pill: true }, 0.3);
  badge.position.set(0, 0.85, 0);
  badge.name = 'badge';
  g.add(badge);
  return g;
}
