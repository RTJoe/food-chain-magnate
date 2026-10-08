/**
 * The six chain restaurants and their turn-order totems, modelled on the Special Edition minis
 * (docs/art-bible.md §6.1, §6.13, §7) with a hobby paint job: walls in the chain colour, roofs a
 * deeper shade of it, realistic glass, trim, metal and wood; one silhouette per chain, the
 * entrance corner cut at 45° with a WELCOME strip, a slot on the roof for the drive-in and
 * coming-soon signs, and the chain wordmark as the one decal.
 *
 * Frame: built with the entrance at the SE corner (+x, +z), origin at the footprint centre on the
 * ground; `restaurant.ts` rotates the body to the real entrance corner.
 */
import * as THREE from 'three';
import type { ChainId } from '@fcm/engine';
import { CHAIN_COLORS, PLAYER_COLORS, contrast, seatColor } from '../../theme.js';
import { Shape, ball, box, color, cone, cyl, hip, hull, lathe, materialsFor, miniGeo, puck, shade, type Paint, type PartOpts } from './kit.js';
import { PAINT } from './paint.js';

export const CHAIN_IDS: readonly ChainId[] = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc', 'siap_faji'];

/** Derelict plastic (art bible §6.1). */
export const DERELICT_GREY = '#9a948c';
/** Brand coral (art bible §2) for the drive-in sign. */
export const CORAL = '#e53d49';
const CARDBOARD = '#d9c7a3';

/**
 * Chain for a seat colour, when the view does not say (placement ghosts, older saves). Seats and
 * chains share an order (LocalGames, session SEAT_CHAINS), so a seat colour maps by index; any
 * other colour maps to the nearest chain colour.
 */
export function chainForColor(css: string): ChainId {
  const c = (seatColor(css) ?? css).toLowerCase();
  let i = CHAIN_IDS.findIndex((id) => CHAIN_COLORS[id]?.toLowerCase() === c);
  if (i < 0) i = PLAYER_COLORS.findIndex((p) => p.base.toLowerCase() === c);
  if (i >= 0) return CHAIN_IDS[i % CHAIN_IDS.length]!;
  const want = color(css);
  let best = 0;
  let bestD = Infinity;
  CHAIN_IDS.forEach((id, j) => {
    const k = color(CHAIN_COLORS[id] ?? '#888888');
    const d = (k.r - want.r) ** 2 + (k.g - want.g) ** 2 + (k.b - want.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  });
  return CHAIN_IDS[best]!;
}

export function isChainId(x: unknown): x is ChainId {
  return typeof x === 'string' && (CHAIN_IDS as readonly string[]).includes(x);
}

// ---------------------------------------------------------------------------
// Paint: the SE sculpt with a hobby paint job. Walls (and, hue-locked, roofs) carry the player
// colour; windows, doors, trims, metal, wood and the roof figures get realistic paints. Derelict
// restaurants stay bare grey plastic: every detail paint falls back to a value step of one hue.
// ---------------------------------------------------------------------------

export interface Tones {
  main: THREE.Color;
  /** Raised trims, catching light. */
  hi: THREE.Color;
  /** Concave areas and plinths (AO 10 %). */
  ao: THREE.Color;
  /** Recesses: windows, doors, slots. */
  deep: THREE.Color;
}

export function tones(c: Paint): Tones {
  return { main: color(c), hi: shade(c, 0.12), ao: shade(c, -0.1), deep: shade(c, -0.26) };
}

/** Player tones plus the detail paints every chain shares. */
export interface Paints extends Tones {
  painted: boolean;
  /** Base plate and its paving joints (player colour, a shade down). */
  plate: THREE.Color;
  plateLine: THREE.Color;
  /** Foundation band under the walls. */
  found: THREE.Color;
  /** Roofs: the player hue, deeper and richer, so the colour still reads from above. */
  roof: THREE.Color;
  roofHi: THREE.Color;
  roofAo: THREE.Color;
  trim: THREE.Color;
  frame: THREE.Color;
  glass: THREE.Color;
  glassLight: THREE.Color;
  door: THREE.Color;
  doorWood: THREE.Color;
  metal: THREE.Color;
  metalDark: THREE.Color;
  chrome: THREE.Color;
  gold: THREE.Color;
  ink: THREE.Color;
  wood: THREE.Color;
  woodDark: THREE.Color;
  woodLight: THREE.Color;
  brick: THREE.Color;
  stone: THREE.Color;
  sign: THREE.Color;
  /** Neon in the player hue (Xango ribs). */
  neon: THREE.Color;
  lantern: THREE.Color;
  bamboo: THREE.Color;
  bambooDark: THREE.Color;
  // Roof figures and food.
  goose: THREE.Color;
  beak: THREE.Color;
  donkey: THREE.Color;
  donkeyDark: THREE.Color;
  bun: THREE.Color;
  patty: THREE.Color;
  cheese: THREE.Color;
  lettuce: THREE.Color;
  bowl: THREE.Color;
  noodles: THREE.Color;
  guitar: THREE.Color;
  china: THREE.Color;
  coffee: THREE.Color;
}

/** Player hue at a lower lightness and a little more saturation (sRGB HSL). */
function deepen(c: Paint, l: number, s = 1.25): THREE.Color {
  const out = color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl, THREE.SRGBColorSpace);
  return out.setHSL(hsl.h, Math.min(1, hsl.s * s), hsl.l * l, THREE.SRGBColorSpace);
}

/** The palette for a piece in `c`; `painted: false` is the bare one-hue plastic (derelict). */
export function paints(c: Paint, painted = true): Paints {
  const t = tones(c);
  const r = (real: Paint, bare: keyof Tones) => (painted ? color(real) : t[bare].clone());
  return {
    ...t,
    painted,
    plate: painted ? deepen(c, 0.9, 1.05) : t.main.clone(),
    plateLine: painted ? deepen(c, 0.76, 1.05) : t.ao.clone(),
    found: r(PAINT.concrete, 'ao'),
    roof: painted ? deepen(c, 0.8, 1.08) : t.main.clone(),
    roofHi: painted ? deepen(c, 0.9, 1.05) : t.hi.clone(),
    roofAo: painted ? deepen(c, 0.62, 1.08) : t.ao.clone(),
    trim: r(PAINT.trimWhite, 'hi'),
    frame: r(PAINT.frame, 'hi'),
    glass: r(PAINT.glassDark, 'deep'),
    glassLight: r(PAINT.glass, 'deep'),
    door: r('#3d5566', 'deep'),
    doorWood: r(PAINT.doorWood, 'deep'),
    metal: r(PAINT.metal, 'hi'),
    metalDark: r(PAINT.metalDark, 'ao'),
    chrome: r(PAINT.chrome, 'hi'),
    gold: r('#d4a52c', 'hi'),
    ink: r(PAINT.signInk, 'deep'),
    wood: r(PAINT.wood, 'main'),
    woodDark: r(PAINT.woodDark, 'ao'),
    woodLight: r(PAINT.woodLight, 'hi'),
    brick: r(PAINT.brick, 'main'),
    stone: r(PAINT.stone, 'hi'),
    sign: r(PAINT.signCream, 'hi'),
    neon: painted ? deepen(c, 1.0, 1.6).lerp(new THREE.Color(1, 1, 1), 0.25) : t.hi.clone(),
    lantern: r(PAINT.neonRed, 'hi'),
    bamboo: r('#cdb46a', 'main'),
    bambooDark: r('#a88f4a', 'hi'),
    goose: r('#f4f1ea', 'main'),
    beak: r('#e8892c', 'hi'),
    donkey: r('#8c8178', 'main'),
    donkeyDark: r('#5a514b', 'ao'),
    bun: r('#d99a4e', 'hi'),
    patty: r('#5e3826', 'deep'),
    cheese: r('#f2c230', 'main'),
    lettuce: r(PAINT.leafLight, 'main'),
    bowl: r('#b8322c', 'main'),
    noodles: r('#f0dba0', 'hi'),
    guitar: r('#c8762e', 'hi'),
    china: r('#f6f2ea', 'hi'),
    coffee: r('#4a2c1c', 'deep'),
  };
}

type Add = (geo: THREE.BufferGeometry, paint: Paint, opts?: PartOpts) => void;
/** Painted parts default to matte paint; bare plastic forces every part to the plastic finish. */
const adder =
  (s: Shape, painted = true): Add =>
  (geo, paint, opts = {}) =>
    void s.add(geo, paint, painted ? { mat: 'body', jitter: 0.02, ...opts } : { jitter: 0.012, ...opts, mat: 'plastic' });
// ---------------------------------------------------------------------------
// Footprints (x, z, corner radius) and prisms
// ---------------------------------------------------------------------------

type P3 = [number, number, number?];

/** Rectangle with the SE (entrance) corner cut by `c` along each edge. */
function chamferRect(x0: number, z0: number, x1: number, z1: number, c: number, r = 0): P3[] {
  return [
    [x0, z0, r],
    [x1, z0, r],
    [x1, z1 - c, r * 0.3],
    [x1 - c, z1, r * 0.3],
    [x0, z1, r],
  ];
}

/** Offset a convex outline outwards by `d` (mitred). */
function grow(pts: P3[], d: number): P3[] {
  const n = pts.length;
  const cx = pts.reduce((a, p) => a + p[0], 0) / n;
  const cz = pts.reduce((a, p) => a + p[1], 0) / n;
  const nor = (a: P3, b: P3): [number, number] => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    let nx = dz / l;
    let nz = -dx / l;
    const mx = (a[0] + b[0]) / 2 - cx;
    const mz = (a[1] + b[1]) / 2 - cz;
    if (nx * mx + nz * mz < 0) [nx, nz] = [-nx, -nz];
    return [nx, nz];
  };
  return pts.map((p, i) => {
    const n1 = nor(pts[(i + n - 1) % n]!, p);
    const n2 = nor(p, pts[(i + 1) % n]!);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k, p[2] ? Math.max(0, p[2] + d) : 0];
  });
}

function outline(pts: P3[]): THREE.Shape {
  const sh = new THREE.Shape();
  const n = pts.length;
  pts.forEach((p, i) => {
    const [x, z, r = 0] = p;
    const v = new THREE.Vector2(x, -z);
    if (r <= 1e-3) {
      if (i === 0) sh.moveTo(v.x, v.y);
      else sh.lineTo(v.x, v.y);
      return;
    }
    const prev = pts[(i + n - 1) % n]!;
    const next = pts[(i + 1) % n]!;
    const a = new THREE.Vector2(prev[0], -prev[1]).sub(v).normalize().multiplyScalar(r).add(v);
    const b = new THREE.Vector2(next[0], -next[1]).sub(v).normalize().multiplyScalar(r).add(v);
    if (i === 0) sh.moveTo(a.x, a.y);
    else sh.lineTo(a.x, a.y);
    sh.quadraticCurveTo(v.x, v.y, b.x, b.y);
  });
  sh.closePath();
  return sh;
}

const q3 = (n: number) => Math.round(n * 1000);

const extCache = new Map<string, THREE.BufferGeometry>();
/** Flat extrusion in the xy plane (depth along z, centred) with few curve segments (triangle budget). */
function extrude(key: string, shape: () => THREE.Shape, depth: number, segs = 3): THREE.BufferGeometry {
  const k = `${key}:${q3(depth)}:${segs}`;
  let g = extCache.get(k);
  if (!g) {
    g = new THREE.ExtrudeGeometry(shape(), { depth, bevelEnabled: false, curveSegments: segs }).translate(0, 0, -depth / 2);
    extCache.set(k, g);
  }
  return g;
}
/** Vertical prism over a footprint, from y to y + h. */
function prism(add: Add, pts: P3[], y: number, h: number, paint: Paint, opts: PartOpts = {}): void {
  const key = `fp:${pts.map((p) => `${q3(p[0])},${q3(p[1])},${q3(p[2] ?? 0)}`).join(';')}`;
  add(extrude(key, () => outline(pts), h), paint, { ...opts, rot: [-Math.PI / 2, 0, 0], at: [0, y + h / 2, 0] });
}

/** A wall face of a footprint: centre, width and outward yaw. */
interface Face {
  cx: number;
  cz: number;
  w: number;
  yaw: number;
}

function faces(x0: number, z0: number, x1: number, z1: number, c: number): { front: Face; right: Face; chamfer: Face; back: Face; left: Face } {
  return {
    front: { cx: (x0 + x1 - c) / 2, cz: z1, w: x1 - c - x0, yaw: 0 },
    right: { cx: x1, cz: (z0 + z1 - c) / 2, w: z1 - c - z0, yaw: Math.PI / 2 },
    chamfer: { cx: x1 - c / 2, cz: z1 - c / 2, w: c * Math.SQRT2, yaw: Math.PI / 4 },
    back: { cx: (x0 + x1) / 2, cz: z0, w: x1 - x0, yaw: Math.PI },
    left: { cx: x0, cz: (z0 + z1) / 2, w: z1 - z0, yaw: -Math.PI / 2 },
  };
}

/** Point on a face: `u` along it (local +x), `out` along its normal. */
function on(f: Face, u: number, y: number, out = 0): [number, number, number] {
  const s = Math.sin(f.yaw);
  const c = Math.cos(f.yaw);
  return [f.cx + u * c + out * s, y, f.cz - u * s + out * c];
}

/** `n` glazed window panes spread along a face, each in a white frame unless `framed` is false. */
function panes(add: Add, k: Paints, f: Face, y: number, h: number, n: number, w: number, margin = 0.1, framed = true): void {
  const span = f.w - margin * 2;
  for (let i = 0; i < n; i++) {
    const u = -span / 2 + (span / n) * (i + 0.5);
    if (framed) add(box(w + 0.045, h + 0.045, 0.034, 0), k.frame, { at: on(f, u, y - 0.0225, 0), rot: [0, f.yaw, 0] });
    add(box(w, h, 0.03, 0), k.glass, { at: on(f, u, y, 0.006), rot: [0, f.yaw, 0], mat: 'glass', jitter: 0.06 });
  }
}

/** Sill and lintel bands across a face (window trim without a frame per pane). */
function bands(add: Add, k: Paints, f: Face, y0: number, y1: number, inset = 0.06): void {
  for (const y of [y0 - 0.03, y1]) add(box(f.w - inset * 2, 0.03, 0.04, 0), k.trim, { at: on(f, 0, y, 0.004), rot: [0, f.yaw, 0] });
}

/** Entrance doors on the chamfer: a white surround, glazed (or wooden) leaves and a metal centre bar. */
function doors(add: Add, k: Paints, f: Face, w = 0.3, h = 0.3, arch = false, wood = false): void {
  const leaf = wood ? k.doorWood : k.door;
  const lm: PartOpts = wood ? {} : { mat: 'glass', jitter: 0.03 };
  add(box(w + 0.06, h + 0.04, 0.03, 0), k.trim, { at: on(f, 0, 0.06, 0.004), rot: [0, f.yaw, 0] });
  add(box(w, h, 0.04, 0), leaf, { at: on(f, 0, 0.06, 0.008), rot: [0, f.yaw, 0], ...lm });
  add(box(0.018, h, 0.045, 0), wood ? k.woodDark : k.chrome, { at: on(f, 0, 0.06, 0.01), rot: [0, f.yaw, 0], mat: wood ? 'body' : 'metal' });
  if (arch) {
    add(cyl(w / 2 + 0.03, w / 2 + 0.03, 0.03, 10), k.trim, { at: on(f, 0, 0.06 + h, 0.004), rot: [Math.PI / 2, f.yaw, 0] });
    add(cyl(w / 2, w / 2, 0.04, 10), leaf, { at: on(f, 0, 0.06 + h, 0.008), rot: [Math.PI / 2, f.yaw, 0], ...lm });
  }
}

// ---------------------------------------------------------------------------
// Shared restaurant parts
// ---------------------------------------------------------------------------

export const PLATE = 0.93;
export const PLATE_CHAMFER = 0.5;
export const PLATE_H = 0.06;
/** Centre of the WELCOME strip (on the plate, along the chamfer). */
export const WELCOME_AT: [number, number, number] = [0.6, PLATE_H + 0.022, 0.6];

function plate(add: Add, k: Paints): void {
  prism(add, chamferRect(-PLATE, -PLATE, PLATE, PLATE, PLATE_CHAMFER), 0, PLATE_H, k.plate);
  // Square grid (2x2) of paving joints in the plate, and the WELCOME strip along the chamfer.
  add(box(0.02, 0.006, 1.7, 0), k.plateLine, { at: [0, PLATE_H, -0.08] });
  add(box(1.7, 0.006, 0.02, 0), k.plateLine, { at: [-0.08, PLATE_H, 0] });
  add(box(0.62, 0.022, 0.13, 0), k.hi, { at: [WELCOME_AT[0], PLATE_H, WELCOME_AT[2]], rot: [0, Math.PI / 4, 0] });
}

/** The roof slot that holds the drive-in / coming-soon sign. */
function slot(add: Add, k: Paints, at: [number, number, number], yaw: number): void {
  add(box(0.36, 0.03, 0.1, 0), k.metalDark, { at, rot: [0, yaw, 0], mat: 'metal' });
  add(box(0.3, 0.032, 0.035, 0), k.ink, { at: [at[0], at[1] + 0.001, at[2]], rot: [0, yaw, 0] });
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** Donkey facing +x, hooves at y = 0, about 0.3 tall. */
function donkey(k: Paints): Shape {
  const s = new Shape();
  const a = adder(s, k.painted);
  a(box(0.21, 0.095, 0.085, 0.02), k.donkey, { at: [0, 0.09, 0] });
  for (const [x, z] of [
    [0.075, 0.025],
    [0.075, -0.025],
    [-0.075, 0.025],
    [-0.075, -0.025],
  ] as const)
    a(box(0.028, 0.1, 0.028, 0), k.donkeyDark, { at: [x, 0, z] });
  a(box(0.065, 0.1, 0.055, 0), k.donkey, { at: [0.09, 0.14, 0], rot: [0, 0, -0.7] });
  a(box(0.14, 0.065, 0.06, 0.015), k.donkey, { at: [0.16, 0.19, 0], rot: [0, 0, -0.55] });
  a(box(0.02, 0.1, 0.024, 0), k.donkeyDark, { at: [0.12, 0.24, 0.02], rot: [0.2, 0, 0.15] });
  a(box(0.02, 0.1, 0.024, 0), k.donkeyDark, { at: [0.12, 0.24, -0.02], rot: [-0.2, 0, 0.3] });
  a(box(0.014, 0.09, 0.014, 0), k.donkeyDark, { at: [-0.1, 0.1, 0], rot: [0, 0, 0.5] });
  return s;
}

/** Goose facing +x, feet at y = 0, about 0.28 tall. */
function goose(k: Paints): Shape {
  const s = new Shape();
  const a = adder(s, k.painted);
  a(ball(1, 0), k.goose, { at: [0, 0.1, 0], scale: [0.105, 0.065, 0.068] });
  a(cyl(0.01, 0.01, 0.05, 4), k.beak, { at: [0.01, 0, 0.022] });
  a(cyl(0.01, 0.01, 0.05, 4), k.beak, { at: [0.01, 0, -0.022] });
  a(cyl(0.018, 0.026, 0.16, 6), k.goose, { at: [0.06, 0.12, 0], rot: [0, 0, -0.22] });
  a(ball(0.036, 0), k.goose, { at: [0.1, 0.275, 0] });
  a(cone(0.016, 0.055, 5), k.beak, { at: [0.12, 0.27, 0], rot: [0, 0, -Math.PI / 2 - 0.15] });
  a(cone(0.035, 0.07, 4), k.goose, { at: [-0.085, 0.11, 0], rot: [0, 0, Math.PI / 2 + 0.5] });
  return s;
}

/** Sitting duck facing +x, about 0.35 long and 0.3 tall: gilded, with an orange bill. */
function duck(k: Paints): Shape {
  const s = new Shape();
  const a = adder(s, k.painted);
  const gilt: PartOpts = { mat: 'metal', jitter: 0.03 };
  a(ball(1, 1), k.gold, { at: [0, 0.09, 0], scale: [0.16, 0.09, 0.105], ...gilt });
  a(ball(1, 0), shade(k.gold, 0.18), { at: [-0.02, 0.125, 0], scale: [0.1, 0.045, 0.112], ...gilt });
  a(cone(0.055, 0.1, 5), k.gold, { at: [-0.12, 0.1, 0], rot: [0, 0, Math.PI / 2 + 0.75], ...gilt });
  a(cyl(0.042, 0.055, 0.09, 6), k.gold, { at: [0.09, 0.13, 0], ...gilt });
  a(ball(0.068, 1), k.gold, { at: [0.1, 0.25, 0], ...gilt });
  a(box(0.08, 0.028, 0.06, 0), k.beak, { at: [0.19, 0.22, 0] });
  return s;
}

/** Guitar lying in the xz plane, neck along +z, body centre at the origin; ~1 long. */
function guitar(k: Paints): Shape {
  const s = new Shape();
  const a = adder(s, k.painted);
  a(cyl(0.17, 0.17, 0.07, 12), k.guitar);
  a(cyl(0.13, 0.13, 0.07, 12), k.guitar, { at: [0, 0, 0.19] });
  a(cyl(0.05, 0.05, 0.012, 8), k.ink, { at: [0, 0.066, 0.1] });
  a(box(0.12, 0.02, 0.035, 0), k.woodDark, { at: [0, 0.068, -0.06] });
  a(box(0.055, 0.035, 0.44, 0), k.woodDark, { at: [0, 0.012, 0.49] });
  for (let i = 0; i < 4; i++) a(box(0.06, 0.04, 0.008, 0), k.chrome, { at: [0, 0.012, 0.33 + i * 0.09], mat: 'metal' });
  a(box(0.09, 0.035, 0.14, 0), k.ink, { at: [0, 0.012, 0.77] });
  return s;
}

/** Burger: bun, patty, cheese, bun (base at y = 0, ~0.22 tall). */
function burger(k: Paints, r = 0.2): Shape {
  const s = new Shape();
  const a = adder(s, k.painted);
  a(puck(r, 0.055, 10, 0.02), k.bun);
  a(cyl(r * 1.08, r * 1.08, 0.045, 10), k.patty, { at: [0, 0.055, 0] });
  a(cyl(r * 1.1, r * 1.12, 0.014, 10), k.cheese, { at: [0, 0.1, 0], rot: [0, Math.PI / 10, 0] });
  a(
    lathe(
      [
        [0, 0],
        [r * 1.02, 0],
        [r * 1.04, r * 0.18],
        [r * 0.88, r * 0.45],
        [r * 0.5, r * 0.62],
        [0, r * 0.66],
      ],
      10,
    ),
    k.bun,
    { at: [0, 0.114, 0], mat: 'plastic' },
  );
  return s;
}

/** Noodle bowl with chopsticks (~0.36 tall). */
function noodleBowl(k: Paints): Shape {
  const s = new Shape();
  const a = adder(s, k.painted);
  a(
    lathe(
      [
        [0, 0],
        [0.08, 0],
        [0.09, 0.02],
        [0.17, 0.08],
        [0.2, 0.14],
        [0.18, 0.145],
        [0, 0.13],
      ],
      12,
    ),
    k.bowl,
    { mat: 'plastic' },
  );
  a(ball(1, 0), k.noodles, { at: [0, 0.13, 0], scale: [0.16, 0.045, 0.16] });
  a(cyl(0.011, 0.014, 0.34, 4), k.woodLight, { at: [0.02, 0.1, 0.02], rot: [0.1, 0, -0.4] });
  a(cyl(0.011, 0.014, 0.34, 4), k.woodLight, { at: [0.06, 0.1, -0.03], rot: [-0.1, 0, -0.5] });
  return s;
}

/** Pagoda eave: hip roof with upturned gilded corner tips. */
function eave(add: Add, k: Paints, w: number, h: number, at: [number, number, number], tip = 0.16): void {
  add(hip(w, h, w, w * 0.2), k.roof, { at });
  add(box(w * 0.94, 0.03, w * 0.94, 0), k.woodDark, { at: [at[0], at[1] - 0.03, at[2]] });
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const)
    add(cone(0.045, tip, 4), k.gold, { at: [at[0] + (sx * w) / 2 - sx * 0.03, at[1] - 0.02, at[2] + (sz * w) / 2 - sz * 0.03], rot: [sz * 0.5, 0, -sx * 0.5], mat: 'metal' });
}


// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

/** Where the wordmark decal goes (a face's local +z points out of it). */
export interface SignSpot {
  at: [number, number, number];
  yaw: number;
  w: number;
  h: number;
}

export interface ChainSpec {
  /** Wordmark lines: script, then condensed caps. */
  name: [string, string];
  height: number;
  /** Roof slot centre (top of the slot) and yaw. */
  slot: [number, number, number, number];
  sign: SignSpot;
  totemHeight: number;
}

const F = faces(-0.8, -0.8, 0.66, 0.66, 0.5);

export const CHAINS: Record<ChainId, ChainSpec> = {
  fried_geese_donkey: {
    name: ['Fried Geese', '& DONKEY'],
    height: 1.4,
    slot: [0.3, 0.6, 0.38, Math.PI / 4],
    sign: { at: [-0.12, 0.88, -0.535], yaw: 0, w: 0.82, h: 0.22 },
    totemHeight: 1.24,
  },
  golden_duck_diner: {
    name: ['Golden', 'DUCK DINER'],
    height: 1.02,
    slot: [0.42, 0.64, 0.42, Math.PI / 4],
    sign: { at: [0.16, 0.72, -0.414], yaw: 0, w: 0.44, h: 0.16 },
    totemHeight: 1.16,
  },
  santa_maria_pizza: {
    name: ['Santa Maria', 'PIZZA'],
    height: 1.38,
    slot: [-0.17, 1.07, -0.06, 0],
    sign: { at: [0.22, 1.09, 0.02], yaw: 0, w: 0.38, h: 0.15 },
    totemHeight: 1.1,
  },
  xango_blues_bar: {
    name: ['Xango', 'BLUES BAR'],
    height: 1.42,
    slot: [0.52, 0.64, -0.5, Math.PI / 2],
    sign: { at: on(F.chamfer, 0, 0.72, 0.032), yaw: Math.PI / 4, w: 0.6, h: 0.2 },
    totemHeight: 1.15,
  },
  gluttony_inc: {
    name: ['Gluttony', 'INC.'],
    height: 1.5,
    slot: [0.3, 0.88, 0.1, Math.PI / 4],
    sign: { at: [-0.53, 1.03, -0.274], yaw: 0, w: 0.44, h: 0.2 },
    totemHeight: 1.22,
  },
  siap_faji: {
    name: ['Siap Faji', 'ASIAN FOOD'],
    height: 1.42,
    slot: [0.48, 0.76, 0.48, Math.PI / 4],
    sign: { at: [-0.07, 0.875, 0.257], yaw: 0, w: 0.46, h: 0.13 },
    totemHeight: 1.3,
  },
};

type Builder = (add: Add, k: Paints, s: Shape) => void;

const BODIES: Record<ChainId, Builder> = {
  // Barn-like block with a single-pitch roof rising to the back, and a box sign at the back edge
  // carrying a goose and a donkey. Painted as a barn: chain-colour boards, white battens and trim.
  fried_geese_donkey(add, k, s) {
    const foot = chamferRect(-0.8, -0.8, 0.66, 0.66, 0.5);
    prism(add, foot, PLATE_H, 0.06, k.found);
    prism(add, chamferRect(-0.78, -0.78, 0.64, 0.64, 0.49), PLATE_H + 0.06, 0.42, k.main);
    panes(add, k, F.front, 0.2, 0.2, 4, 0.16, 0.1, false);
    panes(add, k, F.right, 0.2, 0.2, 4, 0.16, 0.1, false);
    panes(add, k, F.left, 0.2, 0.2, 4, 0.18, 0.1, false);
    doors(add, k, F.chamfer, 0.34, 0.3);
    // Barn battens between the windows, with a sill and lintel on each side.
    for (const face of [F.front, F.right, F.left]) {
      for (let i = 0; i <= 4; i++) add(box(0.03, 0.4, 0.025, 0), k.trim, { at: on(face, -face.w / 2 + 0.1 + ((face.w - 0.2) / 4) * i, PLATE_H + 0.08, 0.0), rot: [0, face.yaw, 0] });
      bands(add, k, face, 0.2, 0.4, 0.08);
    }
    // Long awning along the entrance side.
    add(box(0.96, 0.03, 0.2, 0), k.roofHi, { at: [-0.31, 0.43, 0.74], rot: [0.32, 0, 0] });
    add(box(0.2, 0.03, 0.96, 0), k.roofHi, { at: [0.74, 0.43, -0.31], rot: [0, 0, -0.32] });
    // Single-pitch roof: 0.54 at the front to 0.76 at the back, with eaves.
    const eaves = grow(foot, 0.05);
    const pts: [number, number, number][] = [];
    for (const [x, z] of eaves) {
      pts.push([x, 0.5, z]);
      pts.push([x, 0.56 + ((0.71 - z) / 1.56) * 0.2, z]);
    }
    add(hull('fgd-roof', pts), k.roof);
    // Standing seams down the metal roof.
    const slope = Math.atan2(0.2, 1.56);
    for (const x of [-0.66, -0.36, -0.06, 0.24, 0.54]) {
      const z0 = -0.84;
      const z1 = Math.min(0.7, 0.88 - x);
      const zc = (z0 + z1) / 2;
      add(box(0.024, 0.02, (z1 - z0) / Math.cos(slope), 0), k.roofHi, { at: [x, 0.548 + ((0.71 - zc) / 1.56) * 0.2, zc], rot: [slope, 0, 0] });
    }
    // Ridge flashing and the sign box at the back edge.
    add(box(1.52, 0.04, 0.06, 0), k.metal, { at: [-0.07, 0.75, -0.82], mat: 'metal' });
    add(box(0.96, 0.32, 0.24, 0.02), k.main, { at: [-0.12, 0.72, -0.66] });
    add(box(1.0, 0.04, 0.28, 0), k.trim, { at: [-0.12, 1.04, -0.66] });
    s.addShape(goose(k), { at: [-0.42, 1.08, -0.66], scale: 1.15 });
    s.addShape(donkey(k), { at: [0.2, 1.08, -0.66], rot: [0, Math.PI, 0], scale: 1.05 });
    const [sx, sy, sz, sr] = CHAINS.fried_geese_donkey.slot;
    slot(add, k, [sx, sy - 0.03, sz], sr);
  },

  // Streamlined diner: low rounded box, three chrome ribs, ribbon windows, an overhanging flat
  // roof with a gilded duck on top and a thin sign plate behind it.
  golden_duck_diner(add, k, s) {
    const foot = chamferRect(-0.82, -0.76, 0.66, 0.66, 0.46, 0.2);
    prism(add, grow(foot, -0.06), PLATE_H, 0.1, k.metalDark, { mat: 'metal' });
    prism(add, grow(foot, -0.02), PLATE_H + 0.1, 0.36, k.main);
    for (const y of [0.19, 0.225, 0.26]) prism(add, grow(foot, -0.005), y, 0.016, k.chrome, { mat: 'metal' });
    prism(add, grow(foot, -0.012), 0.3, 0.13, k.glass, { mat: 'glass', jitter: 0.03 });
    const f = faces(-0.82, -0.76, 0.66, 0.66, 0.46);
    for (const face of [f.front, f.right, f.left])
      for (let i = 1; i < 5; i++) add(box(0.025, 0.13, 0.03, 0), k.chrome, { at: on(face, -face.w / 2 + (face.w / 5) * i, 0.3, -0.006), rot: [0, face.yaw, 0], mat: 'metal' });
    doors(add, k, f.chamfer, 0.3, 0.3);
    prism(add, grow(foot, 0.08), 0.52, 0.1, k.main);
    prism(add, grow(foot, 0.09), 0.555, 0.03, k.trim);
    prism(add, grow(foot, -0.2), 0.62, 0.04, k.roof);
    add(box(0.9, 0.2, 0.045, 0.015), k.roofHi, { at: [-0.06, 0.62, -0.44] });
    add(extrude('gd-wave', () => scallopShape(0.94, 0.05, 6, false), 0.05, 2), k.trim, { at: [-0.06, 0.81, -0.44] });
    s.addShape(duck(k), { at: [-0.32, 0.66, 0.02], rot: [0, 0.25, 0], scale: 1.75 });
    const [sx, sy, sz, sr] = CHAINS.golden_duck_diner.slot;
    slot(add, k, [sx, sy - 0.03, sz], sr);
  },

  // Hacienda: block with a deep-eaved hip roof of barrel tiles, a brick pizza-oven stack and a
  // white bell gable on the ridge; arched wooden entrance.
  santa_maria_pizza(add, k) {
    const foot = chamferRect(-0.8, -0.72, 0.66, 0.6, 0.44);
    prism(add, foot, PLATE_H, 0.06, k.stone);
    prism(add, grow(foot, -0.02), PLATE_H + 0.06, 0.52, k.main);
    const f = faces(-0.8, -0.72, 0.66, 0.6, 0.44);
    for (const face of [f.front, f.right]) {
      panes(add, k, face, 0.22, 0.2, 3, 0.13, 0.14);
      const span = face.w - 0.28;
      for (let i = 0; i < 3; i++) add(cyl(0.065, 0.065, 0.03, 8), k.glass, { at: on(face, -span / 2 + (span / 3) * (i + 0.5), 0.42, 0.002), rot: [Math.PI / 2, face.yaw, 0], mat: 'glass' });
    }
    panes(add, k, f.left, 0.22, 0.2, 3, 0.13, 0.14);
    doors(add, k, f.chamfer, 0.24, 0.26, true, true);
    // Hip roof, 30° pitch, 0.1 eaves.
    const W = 1.68;
    const D = 1.54;
    const H = 0.42;
    const R = 0.62;
    const cx = -0.07;
    const cz = -0.06;
    tiledHip(add, k, W, D, H, R, [cx, 0.6, cz], 12, 6);
    add(box(R + 0.06, 0.05, 0.08, 0.015), k.roofAo, { at: [cx, 0.6 + H - 0.02, cz] });
    // Brick pizza-oven stack at the back with a stone cap and a sooty flue.
    add(box(0.24, 0.6, 0.24, 0.02), k.brick, { at: [-0.5, 0.74, -0.38] });
    add(box(0.3, 0.05, 0.3, 0.015), k.stone, { at: [-0.5, 1.32, -0.38] });
    add(cyl(0.06, 0.06, 0.06, 8), k.ink, { at: [-0.5, 1.33, -0.38] });
    // Bell gable on the ridge (decal on its face) with a bronze bell above.
    add(extrude('sm-gable', gableShape, 0.06), k.trim, { at: [0.22, 0.98, -0.02] });
    add(cone(0.035, 0.06, 6), k.gold, { at: [0.22, 1.27, -0.02], mat: 'metal' });
    add(ball(0.016, 0), k.gold, { at: [0.22, 1.33, -0.02], mat: 'metal' });
    const [sx, sy, sz, sr] = CHAINS.santa_maria_pizza.slot;
    slot(add, k, [sx, sy - 0.03, sz], sr);
  },

  // Jukebox bar: block with a scalloped parapet on the street sides, a barrel vault with neon
  // ribs, chrome portholes and a giant guitar across the front, neck towards the entrance.
  xango_blues_bar(add, k, s) {
    const foot = chamferRect(-0.8, -0.8, 0.66, 0.66, 0.5);
    prism(add, foot, PLATE_H, 0.06, k.found);
    prism(add, grow(foot, -0.02), PLATE_H + 0.06, 0.5, k.main);
    for (const face of [F.front, F.right]) {
      const span = face.w - 0.3;
      for (let i = 0; i < 2; i++) {
        const u = -span / 2 + span * i;
        add(cyl(0.11, 0.11, 0.03, 10), k.chrome, { at: on(face, u, 0.36, 0.002), rot: [Math.PI / 2, face.yaw, 0], mat: 'metal' });
        add(cyl(0.08, 0.08, 0.04, 10), k.glass, { at: on(face, u, 0.36, 0.004), rot: [Math.PI / 2, face.yaw, 0], mat: 'glass' });
      }
    }
    panes(add, k, F.left, 0.24, 0.22, 3, 0.16);
    doors(add, k, F.chamfer, 0.32, 0.32);
    // Marquee over the door (carries the decal), and the scalloped parapet with a white coping.
    add(box(0.66, 0.24, 0.05, 0.015), k.ink, { at: on(F.chamfer, 0, 0.6, 0.004), rot: [0, Math.PI / 4, 0] });
    prism(add, grow(foot, 0.03), 0.6, 0.04, k.roofHi);
    for (const face of [F.front, F.right]) {
      add(extrude(`xg-scallop:${q3(face.w)}`, () => scallopShape(face.w, 0.14, 5, false), 0.04, 2), k.main, { at: on(face, 0, 0.64, 0.0), rot: [0, face.yaw, 0] });
    }
    // Barrel vault along the front-back axis, with three neon ribs.
    add(extrude('xg-vault', () => archShape(0.46, 0.0), 1.2, 5), k.roof, { at: [-0.22, 0.62, -0.2] });
    for (const z of [-0.72, -0.2, 0.32]) add(extrude('xg-rib', () => archShape(0.49, 0.44), 0.035, 5), k.neon, { at: [-0.22, 0.62, z], mat: 'glow' });
    // Giant guitar: body on the vault crown, neck rising towards the entrance, head at 1.4.
    s.addShape(guitar(k), { at: [-0.4, 0.76, 0.52], rot: [-0.22, Math.PI / 2 - 0.25, 1.0], scale: 1.1 });
    const [sx, sy, sz, sr] = CHAINS.xango_blues_bar.slot;
    slot(add, k, [sx, sy - 0.03, sz], sr);
  },

  // Burger box: tall square block with a scalloped white valance under the roofline, striped
  // awnings and big shop windows; a square tower at the back corner carries a burger.
  gluttony_inc(add, k, s) {
    const foot = chamferRect(-0.8, -0.8, 0.66, 0.66, 0.5);
    prism(add, foot, PLATE_H, 0.06, k.found);
    prism(add, grow(foot, -0.02), PLATE_H + 0.06, 0.73, k.main);
    for (const face of [F.front, F.right]) {
      add(box(face.w - 0.18, 0.34, 0.03, 0), k.glass, { at: on(face, 0, 0.14, 0.002), rot: [0, face.yaw, 0], mat: 'glass', jitter: 0.06 });
      for (const u of [-0.25, 0, 0.25]) add(box(0.03, 0.34, 0.04, 0), k.trim, { at: on(face, u * (face.w / 0.96), 0.14, 0.004), rot: [0, face.yaw, 0] });
      // Striped awning: white and a deep chain colour.
      const n = 7;
      const sw = (face.w - 0.08) / n;
      for (let i = 0; i < n; i++)
        add(box(sw, 0.03, 0.2, 0), i % 2 ? k.roof : k.trim, { at: on(face, -face.w / 2 + 0.04 + sw * (i + 0.5), 0.5, 0.08), rot: [0.42, face.yaw, 0] });
    }
    panes(add, k, F.left, 0.2, 0.32, 3, 0.2);
    doors(add, k, F.chamfer, 0.32, 0.34);
    // Roof slab with a scalloped valance on every street side.
    prism(add, grow(foot, 0.055), 0.83, 0.06, k.roof);
    for (const face of [F.front, F.right, F.chamfer])
      add(extrude(`gl-curtain:${q3(face.w)}`, () => scallopShape(face.w + 0.04, 0.2, Math.max(2, Math.round(face.w / 0.24)), true), 0.04, 2), k.trim, {
        at: on(face, 0, 0.64, 0.035),
        rot: [0, face.yaw, 0],
      });
    // Tower at the back corner.
    add(box(0.5, 0.36, 0.5, 0.02), k.main, { at: [-0.53, 0.86, -0.53] });
    add(box(0.56, 0.05, 0.56, 0.015), k.roofHi, { at: [-0.53, 1.2, -0.53] });
    s.addShape(burger(k, 0.19), { at: [-0.53, 1.25, -0.53] });
    const [sx, sy, sz, sr] = CHAINS.gluttony_inc.slot;
    slot(add, k, [sx, sy - 0.03, sz], sr);
  },

  // Pagoda-eave kiosk: block with upturned eaves, a second small tier, a red noodle bowl on top, a
  // paper lantern on a pole and a bamboo-slat screen on one side.
  siap_faji(add, k, s) {
    const foot = chamferRect(-0.76, -0.76, 0.62, 0.62, 0.46);
    const f = faces(-0.76, -0.76, 0.62, 0.62, 0.46);
    prism(add, foot, PLATE_H, 0.06, k.stone);
    prism(add, grow(foot, -0.02), PLATE_H + 0.06, 0.5, k.main);
    panes(add, k, f.front, 0.22, 0.24, 3, 0.16);
    panes(add, k, f.right, 0.22, 0.24, 3, 0.16);
    doors(add, k, f.chamfer, 0.3, 0.32);
    // Bamboo screen on the west side.
    for (let i = 0; i < 9; i++) add(cyl(0.022, 0.022, 0.5, 5), i % 2 ? k.bamboo : k.bambooDark, { at: [-0.8, PLATE_H + 0.06, -0.62 + i * 0.155] });
    for (const y of [0.24, 0.48]) add(box(0.03, 0.03, 1.36, 0), k.woodDark, { at: [-0.81, y, -0.0] });
    // Eaves, second tier, eave.
    eave(add, k, 1.56, 0.22, [-0.07, 0.62, -0.07], 0.11);
    add(box(0.6, 0.3, 0.6, 0.015), k.main, { at: [-0.07, 0.7, -0.07] });
    eave(add, k, 0.86, 0.12, [-0.07, 1.0, -0.07], 0.1);
    s.addShape(noodleBowl(k), { at: [-0.07, 1.08, -0.07], scale: 0.9 });
    // Paper lantern on a pole at the front-left corner.
    add(cyl(0.018, 0.024, 0.86, 5), k.woodDark, { at: [-0.8, PLATE_H, 0.8] });
    add(box(0.16, 0.025, 0.025, 0), k.woodDark, { at: [-0.74, 0.88, 0.8] });
    add(
      lathe(
        [
          [0, 0],
          [0.045, 0],
          [0.075, 0.04],
          [0.08, 0.08],
          [0.075, 0.12],
          [0.045, 0.16],
          [0, 0.16],
        ],
        8,
      ),
      k.lantern,
      { at: [-0.68, 0.7, 0.8], mat: 'glow' },
    );
    add(cone(0.06, 0.05, 6), k.ink, { at: [-0.68, 0.86, 0.8] });
    add(box(0.5, 0.15, 0.04, 0), k.woodDark, { at: [-0.07, 0.8, 0.235] });
    const [sx, sy, sz, sr] = CHAINS.siap_faji.slot;
    // Slot rides on the lower eave over the entrance.
    add(box(0.3, 0.12, 0.3, 0), k.roof, { at: [sx, sy - 0.15, sz], rot: [0, Math.PI / 4, 0] });
    slot(add, k, [sx, sy - 0.03, sz], sr);
  },
};

/** Hip roof of barrel tiles: ribs down the long slopes (`n` each) and the hip ends (`m` each). */
function tiledHip(add: Add, k: Paints, W: number, D: number, H: number, R: number, at: [number, number, number], n: number, m: number): void {
  const [cx, y, cz] = at;
  add(hip(W, H, D, R), k.roof, { at });
  add(box(W, 0.04, D, 0), k.trim, { at: [cx, y - 0.035, cz] });
  const a = Math.atan2(H, D / 2);
  const L = Math.hypot(H, D / 2);
  for (const side of [1, -1])
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      const l = L * (Math.abs(x) <= R / 2 ? 1 : (W / 2 - Math.abs(x)) / (W / 2 - R / 2));
      if (l < L * 0.3) continue;
      add(box(Math.min(0.045, W / n - 0.01), 0.028, l, 0), i % 2 ? k.roof : k.roofHi, {
        at: [cx + x, y - 0.012 + (l / 2) * Math.sin(a), cz + side * (D / 2 - (l / 2) * Math.cos(a))],
        rot: [a, side > 0 ? 0 : Math.PI, 0],
      });
    }
  const b = Math.atan2(H, (W - R) / 2);
  const Ls = Math.hypot(H, (W - R) / 2);
  for (const side of [1, -1])
    for (let i = 0; i < m; i++) {
      const z = -D / 2 + (D / m) * (i + 0.5);
      const l = Ls * (1 - Math.abs(z) / (D / 2));
      if (l < Ls * 0.3) continue;
      add(box(l, 0.028, Math.min(0.045, D / m - 0.01), 0), i % 2 ? k.roof : k.roofHi, {
        at: [cx + side * (W / 2 - (l / 2) * Math.cos(b)), y - 0.012 + (l / 2) * Math.sin(b), cz + z],
        rot: [0, 0, -side * b],
      });
    }
}

/** Bell gable outline (xy, base at y = 0). */
function gableShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.24, 0);
  s.lineTo(0.24, 0);
  s.lineTo(0.24, 0.16);
  s.quadraticCurveTo(0.2, 0.2, 0.1, 0.22);
  s.quadraticCurveTo(0.03, 0.24, 0, 0.3);
  s.quadraticCurveTo(-0.03, 0.24, -0.1, 0.22);
  s.quadraticCurveTo(-0.2, 0.2, -0.24, 0.16);
  s.closePath();
  return s;
}

/** Half-disc (outer r) or half-ring (outer r, inner ri) in xy, flat side on y = 0. */
function archShape(r: number, ri: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(r, 0);
  s.absarc(0, 0, r, 0, Math.PI, false);
  if (ri > 0) {
    s.lineTo(-ri, 0);
    s.absarc(0, 0, ri, Math.PI, 0, true);
  }
  s.closePath();
  return s;
}

/** A band `w` wide and `h` tall with `n` scallops on its top (parapet) or bottom (curtain) edge. */
function scallopShape(w: number, h: number, n: number, curtain: boolean): THREE.Shape {
  const s = new THREE.Shape();
  const r = w / n / 2;
  if (curtain) {
    // Flat top at y = h, scallops hanging down to y = 0.
    s.moveTo(-w / 2, h);
    s.lineTo(w / 2, h);
    for (let i = n - 1; i >= 0; i--) {
      const cx = -w / 2 + r * (2 * i + 1);
      s.lineTo(cx + r, r);
      s.absarc(cx, r, r, 0, -Math.PI, true);
    }
  } else {
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    for (let i = n - 1; i >= 0; i--) {
      const cx = -w / 2 + r * (2 * i + 1);
      s.lineTo(cx + r, h - r);
      s.absarc(cx, h - r, r, 0, Math.PI, false);
    }
  }
  s.closePath();
  return s;
}

/** Derelict pieces stay bare grey plastic; every other piece is painted. */
const isBare = (c: Paint) => typeof c === 'string' && c.toLowerCase() === DERELICT_GREY;

/** The whole restaurant (plate, building, slot): chain-colour walls, painted details. */
export function restaurantShape(chain: ChainId, plastic: Paint): Shape {
  const k = paints(plastic, !isBare(plastic));
  const s = new Shape();
  const add = adder(s, k.painted);
  plate(add, k);
  BODIES[chain](add, k, s);
  return s;
}

// ---------------------------------------------------------------------------
// Turn-order totems: the restaurant's roof feature on a 0.5 column (art bible §6.13)
// ---------------------------------------------------------------------------

const TOTEMS: Record<ChainId, Builder> = {
  fried_geese_donkey(add, k, s) {
    column(add, k, 0.62);
    add(box(0.54, 0.05, 0.54, 0.015), k.roof, { at: [0, 0.62, 0] });
    add(box(0.46, 0.24, 0.3, 0.015), k.main, { at: [0, 0.67, -0.06] });
    add(box(0.42, 0.16, 0.03, 0), k.sign, { at: [0, 0.71, 0.095] });
    add(box(0.5, 0.03, 0.34, 0), k.trim, { at: [0, 0.91, -0.06] });
    s.addShape(goose(k), { at: [-0.15, 0.94, -0.02], rot: [0, -0.2, 0] });
    s.addShape(donkey(k), { at: [0.13, 0.94, -0.1], rot: [0, Math.PI + 0.2, 0], scale: 0.95 });
  },
  golden_duck_diner(add, k, s) {
    const r = chamferRect(-0.25, -0.25, 0.25, 0.25, 0.1, 0.08);
    add(box(0.56, 0.04, 0.56, 0), k.plate);
    prism(add, r, 0.04, 0.5, k.main);
    const sq = chamferRect(-0.25, -0.25, 0.25, 0.25, 0.1);
    for (const y of [0.12, 0.16, 0.2]) prism(add, grow(sq, 0.008), y, 0.015, k.chrome, { mat: 'metal' });
    prism(add, grow(sq, 0.006), 0.3, 0.12, k.glass, { mat: 'glass' });
    prism(add, grow(r, 0.05), 0.54, 0.08, k.main);
    prism(add, grow(sq, 0.07), 0.57, 0.025, k.trim);
    prism(add, grow(sq, -0.05), 0.62, 0.1, k.roof);
    prism(add, grow(sq, -0.02), 0.72, 0.05, k.roofHi);
    s.addShape(duck(k), { at: [0, 0.76, 0.02], rot: [0, -Math.PI / 2 + 0.5, 0], scale: 1.25 });
  },
  santa_maria_pizza(add, k) {
    column(add, k, 0.6, true);
    add(cyl(0.06, 0.06, 0.03, 8), k.glass, { at: [0.15, 0.46, 0.25], rot: [Math.PI / 2, 0, 0], mat: 'glass' });
    add(cyl(0.06, 0.06, 0.03, 8), k.glass, { at: [-0.15, 0.46, 0.25], rot: [Math.PI / 2, 0, 0], mat: 'glass' });
    add(cyl(0.08, 0.08, 0.035, 10), k.doorWood, { at: [0, 0.27, 0.25], rot: [Math.PI / 2, 0, 0] });
    tiledHip(add, k, 0.7, 0.7, 0.34, 0.12, [0, 0.6, 0], 7, 4);
    add(box(0.12, 0.26, 0.12, 0.015), k.brick, { at: [-0.12, 0.8, -0.12] });
    add(box(0.16, 0.04, 0.16, 0), k.stone, { at: [-0.12, 1.06, -0.12] });
  },
  xango_blues_bar(add, k, s) {
    column(add, k, 0.62);
    add(extrude('xg-totem-vault', () => archShape(0.25, 0), 0.5), k.roof, { at: [0, 0.62, 0] });
    for (const z of [-0.18, 0.0, 0.18]) add(extrude('xg-totem-rib', () => archShape(0.27, 0.23), 0.03), k.neon, { at: [0, 0.62, z], mat: 'glow' });
    add(cyl(0.07, 0.07, 0.03, 10), k.glass, { at: [0, 0.5, 0.25], rot: [Math.PI / 2, 0, 0], mat: 'glass' });
    // Guitar standing up the front face, head above the vault, with two notes.
    s.addShape(guitar(k), { at: [0.0, 0.42, 0.29], rot: [-Math.PI / 2 + 0.12, Math.PI, 0.18], scale: 0.78 });
    add(ball(0.045, 0), k.ink, { at: [-0.17, 0.94, 0.12] });
    add(box(0.016, 0.16, 0.016, 0), k.ink, { at: [-0.135, 0.94, 0.12] });
    add(ball(0.04, 0), k.ink, { at: [0.18, 0.86, 0.1] });
    add(box(0.016, 0.14, 0.016, 0), k.ink, { at: [0.21, 0.86, 0.1] });
  },
  gluttony_inc(add, k, s) {
    add(cyl(0.3, 0.3, 0.04, 12), k.plate);
    add(cyl(0.25, 0.26, 0.62, 12), k.main, { at: [0, 0.04, 0] });
    add(cyl(0.262, 0.262, 0.26, 12), k.glass, { at: [0, 0.18, 0], mat: 'glass' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(box(0.03, 0.26, 0.04, 0), k.trim, { at: [Math.sin(a) * 0.255, 0.18, Math.cos(a) * 0.255], rot: [0, a, 0] });
    }
    add(extrude('gl-totem-door', () => archShape(0.07, 0), 0.03), k.door, { at: [0, 0.32, 0.27], mat: 'glass' });
    add(box(0.14, 0.14, 0.03, 0), k.door, { at: [0, 0.18, 0.27], mat: 'glass' });
    add(cyl(0.29, 0.29, 0.05, 12), k.roof, { at: [0, 0.66, 0] });
    s.addShape(burger(k, 0.24), { at: [0, 0.71, 0] });
    add(cone(0.03, 0.1, 5), k.lantern, { at: [0, 0.97, 0] });
  },
  siap_faji(add, k, s) {
    column(add, k, 0.55);
    eave(add, k, 0.72, 0.14, [0, 0.58, 0], 0.12);
    add(box(0.32, 0.14, 0.32, 0), k.main, { at: [0, 0.72, 0] });
    eave(add, k, 0.48, 0.09, [0, 0.86, 0], 0.08);
    s.addShape(noodleBowl(k), { at: [0, 0.93, 0], scale: 0.9 });
  },
};

/** Totem base and square column (0.5², with a door and a plinth). */
function column(add: Add, k: Paints, h: number, woodDoor = false): void {
  add(box(0.56, 0.04, 0.56, 0), k.plate);
  add(box(0.5, h - 0.04, 0.5, 0.02), k.main, { at: [0, 0.04, 0] });
  add(box(0.52, 0.06, 0.52, 0), k.found, { at: [0, 0.04, 0] });
  add(box(0.2, 0.25, 0.026, 0), k.trim, { at: [0, 0.06, 0.25] });
  add(box(0.16, 0.22, 0.03, 0), woodDoor ? k.doorWood : k.door, { at: [0, 0.07, 0.25], ...(woodDoor ? {} : { mat: 'glass' as const }) });
}

export function totemShape(chain: ChainId, plastic: Paint): Shape {
  const k = paints(plastic, !isBare(plastic));
  const s = new Shape();
  TOTEMS[chain](adder(s, k.painted), k, s);
  return s;
}

export function totemGeo(chain: ChainId, plastic: string): THREE.BufferGeometry {
  return miniGeo(`totem:${chain}:${plastic}`, () => totemShape(chain, plastic));
}

/** Triangle count of a built mini geometry. */
export function triangles(geo: THREE.BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.attributes.position!.count) / 3;
}

// ---------------------------------------------------------------------------
// Decals (canvas textures): chain wordmark, WELCOME strip, slot signs
// ---------------------------------------------------------------------------

const SCRIPT = `'Yellowtail', 'Brush Script MT', 'Snell Roundhand', cursive`;
const CAPS = `'Barlow Condensed', 'Oswald', 'Arial Narrow', 'Helvetica Neue', sans-serif`;

const texCache = new Map<string, THREE.CanvasTexture>();
function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture {
  let t = texCache.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const paint = () => {
    c.clearRect(0, 0, w, h);
    draw(c);
  };
  paint();
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  // Web fonts may land after the first draw: repaint once they are ready.
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  const tex = t;
  fonts?.ready?.then(() => {
    paint();
    tex.needsUpdate = true;
  });
  return t;
}

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const css = (c: Paint) => `#${color(c).getHexString()}`;

/** Darken a chain colour until text in it reads on cream (>= 4.5:1). */
function inkOf(plastic: string): string {
  for (let t = 0.2; t < 0.9; t += 0.05) {
    const c = `#${shade(plastic, -t).getHexString()}`;
    if (contrast(c, '#fffaf0') >= 4.5) return c;
  }
  return '#2b2a33';
}

function fitFont(c: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number): void {
  let p = px;
  c.font = font(p);
  while (p > 10 && c.measureText(text).width > maxW) {
    p -= 2;
    c.font = font(p);
  }
}

/**
 * Chain wordmark on the roof sign: a cream plate with a chain-colour border, the name in script
 * and a condensed-caps line (art bible §7: two colours, chain plastic and cream).
 */
export function wordmarkTexture(chain: ChainId, plastic: string): THREE.Texture {
  const W = 320;
  const H = 112;
  return canvasTex(`wm:${chain}:${plastic}`, W, H, (c) => {
    const [script, caps] = CHAINS[chain].name;
    const ink = inkOf(plastic);
    c.fillStyle = plastic;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fffaf0';
    rrect(c, 7, 7, W - 14, H - 14, 18);
    c.fill();
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    fitFont(c, script, (p) => `${p}px ${SCRIPT}`, 52, W - 40);
    c.fillText(script, W / 2, 60);
    c.fillRect(40, 70, W - 80, 3);
    fitFont(c, caps, (p) => `700 ${p}px ${CAPS}`, 26, W - 60);
    c.fillText(caps, W / 2, 98);
  });
}

/** WELCOME strip: letters raised a shade lighter than the plastic. */
export function welcomeTexture(plastic: string): THREE.Texture {
  return canvasTex(`welcome:${plastic}`, 256, 56, (c) => {
    c.fillStyle = css(shade(plastic, 0.1));
    c.fillRect(0, 0, 256, 56);
    c.font = `700 40px ${CAPS}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = css(shade(plastic, 0.55));
    c.fillText('WELCOME', 127, 28);
    c.fillStyle = css(shade(plastic, -0.32));
    c.fillText('WELCOME', 128, 30);
  });
}

export function driveInTexture(): THREE.Texture {
  return canvasTex('slot:drivein', 256, 128, (c) => {
    c.fillStyle = '#fffaf0';
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = CORAL;
    c.lineWidth = 8;
    rrect(c, 8, 8, 240, 112, 14);
    c.stroke();
    c.fillStyle = CORAL;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, 'DRIVE-IN', (p) => `700 ${p}px ${CAPS}`, 58, 220);
    c.fillText('DRIVE-IN', 128, 52);
    c.font = `40px ${SCRIPT}`;
    c.fillText('Open', 128, 96);
  });
}

export function comingSoonTexture(): THREE.Texture {
  return canvasTex('slot:soon', 256, 128, (c) => {
    c.fillStyle = CARDBOARD;
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = '#8a6f45';
    c.lineWidth = 5;
    c.setLineDash([10, 6]);
    rrect(c, 9, 9, 238, 110, 8);
    c.stroke();
    c.fillStyle = '#4a3a24';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, 'COMING', (p) => `700 ${p}px ${CAPS}`, 50, 220);
    c.fillText('COMING', 128, 44);
    c.fillText('SOON', 128, 90);
  });
}

// ---------------------------------------------------------------------------
// Slot signs and the coming-soon fence (separate pooled geometries)
// ---------------------------------------------------------------------------

export const SLOT_SIGN = { w: 0.46, h: 0.24, y: 0.07 };

/** A board on two legs that stands in the roof slot; front faces +z. */
export function slotSignGeo(kind: 'driveIn' | 'soon'): THREE.BufferGeometry {
  return miniGeo(`slotSign:${kind}`, () => {
    const s = new Shape();
    const a = adder(s);
    const face = kind === 'soon' ? CARDBOARD : PAINT.signCream;
    const legs = kind === 'soon' ? '#a88c5c' : PAINT.metal;
    const legMat: PartOpts = kind === 'soon' ? {} : { mat: 'metal' };
    a(box(0.025, SLOT_SIGN.y + 0.04, 0.025, 0), legs, { at: [-0.12, 0, 0], ...legMat });
    a(box(0.025, SLOT_SIGN.y + 0.04, 0.025, 0), legs, { at: [0.12, 0, 0], ...legMat });
    a(box(SLOT_SIGN.w + 0.03, SLOT_SIGN.h + 0.03, 0.03, 0), kind === 'soon' ? '#b89d6a' : CORAL, { at: [0, SLOT_SIGN.y - 0.015, 0] });
    a(box(SLOT_SIGN.w, SLOT_SIGN.h, 0.036, 0), face, { at: [0, SLOT_SIGN.y, 0] });
    return s;
  });
}

/** Construction fence ring round the plate, open at the entrance (coming soon). */
export function fenceGeo(): THREE.BufferGeometry {
  return miniGeo('restaurantFence', () => {
    const s = new Shape();
    const a = adder(s);
    const e = 0.88;
    const post = '#b89d6a';
    const rail = CARDBOARD;
    const runs: [number, number, number, number][] = [
      [-e, -e, e, -e],
      [-e, -e, -e, e],
      [-e, e, 0.3, e],
      [e, -e, e, 0.3],
    ];
    for (const [x0, z0, x1, z1] of runs) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 0.44));
      for (let i = 0; i <= n; i++) a(box(0.035, 0.24, 0.035, 0), post, { at: [x0 + ((x1 - x0) * i) / n, PLATE_H, z0 + ((z1 - z0) * i) / n] });
      for (const y of [0.12, 0.24])
        a(box(0.02, 0.04, len, 0), rail, { at: [(x0 + x1) / 2, PLATE_H + y - 0.02, (z0 + z1) / 2], rot: [0, yaw, 0] });
    }
    // Striped barrier across the entrance gap, set back.
    a(box(0.8, 0.05, 0.03, 0), '#e8a530', { at: [0.62, PLATE_H + 0.16, 0.62], rot: [0, Math.PI / 4, 0] });
    a(box(0.035, 0.18, 0.035, 0), post, { at: [0.34, PLATE_H, 0.9] });
    a(box(0.035, 0.18, 0.035, 0), post, { at: [0.9, PLATE_H, 0.34] });
    return s;
  });
}

// ---------------------------------------------------------------------------
// Totem snapshots for the 2D turn-order track
// ---------------------------------------------------------------------------

/**
 * Render each chain's totem to a PNG data URL (transparent background, three-quarter view), for the
 * 2D turn-order track. Uses a short-lived WebGL context; returns {} where WebGL is missing.
 */
export function totemSnapshots(entries: { chain: ChainId; color: string }[], px = 128): Record<string, string> {
  const out: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(px, Math.round(px * 1.25), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff3dc', '#b49b78', 2.0));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(24, 0.8, 0.1, 20);
  cam.position.set(1.3, 1.9, 3.1);
  cam.lookAt(0, 0.62, 0);
  for (const { chain, color: c } of entries) {
    const geo = totemGeo(chain, c);
    const m = new THREE.Mesh(geo, materialsFor(geo));
    scene.add(m);
    renderer.render(scene, cam);
    out[`${chain}:${c}`] = renderer.domElement.toDataURL('image/png');
    scene.remove(m);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
