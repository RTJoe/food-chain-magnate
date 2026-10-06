/**
 * Small animation props (animation-plan §3): drink crates, envelope, leaflet, steam / dust puffs,
 * confetti, coins and cash, carried goods tokens, ghost demand tokens, radio rings.
 *
 * Every prop is a `THREE.Group` whose origin is its bottom centre (puffs, confetti and rings: the
 * emission point). Parts are instanced proxies with cached geometry, so a prop costs no extra draw
 * call beyond the first of its kind. Animated props expose a pure `animateX(g, k)` (k = 0..1 raw
 * clip progress) that only touches transforms, so they can be driven by any timeline clip and are
 * safe to reuse from a pool (call with k = 0 to reset).
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { COLORS, FOOD_COLORS } from '../../theme.js';
import { owned, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cyl, lathe, miniGeo, playerPalette, puck, shade, torus } from './kit.js';
import { coinGeo, tokenGeo } from './tokens.js';

export type PropKind = 'crate' | 'envelope' | 'leaflet' | 'steam' | 'dust' | 'confetti' | 'coin' | 'coins' | 'cash' | 'carry' | 'ghostToken' | 'radioRings';

export interface PropSpec {
  /** Chain colour (envelope stamp, leaflet band, confetti, radio rings). */
  color?: string;
  /** Good (crate, carry token, ghost token). */
  good?: FoodId;
  /** Count (coin stack height, confetti pieces, puff balls). */
  count?: number;
}

/** Carried goods ride at this scale on vans, carts and trucks. */
export const CARRY_SCALE = 0.55;
/** Crate size (fits two side by side on a cart bed or flatbed). */
export const CRATE_W = 0.17;

/** Pool contract: root at the ground point, model under a child named `body`. */
function propRoot(name: string): { root: THREE.Group; g: THREE.Group } {
  const root = new THREE.Group();
  root.name = name;
  const g = new THREE.Group();
  g.name = 'body';
  root.add(g);
  return { root, g };
}

/** The group holding a prop's parts (its `body`, or the object itself). */
function partsOf(o: THREE.Object3D): THREE.Object3D {
  return o.getObjectByName('body') ?? o;
}

// ---------------------------------------------------------------------------
// Crates
// ---------------------------------------------------------------------------

function barrelShape(): Shape {
  const s = new Shape();
  s.add(
    lathe(
      [
        [0, 0],
        [0.07, 0],
        [0.085, 0.045],
        [0.09, 0.09],
        [0.085, 0.135],
        [0.07, 0.18],
        [0, 0.18],
      ],
      10,
    ),
    '#a8743f',
  );
  for (const y of [0.035, 0.125]) s.add(cyl(0.089, 0.089, 0.02, 10), P.steelDark, { at: [0, y, 0], mat: 'metal', jitter: 0 });
  s.add(cyl(0.05, 0.05, 0.006, 10), FOOD_COLORS.beer, { at: [0, 0.18, 0], jitter: 0 });
  return s;
}

/** Slatted crate holding four bottles / cans of the good. */
function crateShape(good: FoodId): Shape {
  const s = new Shape();
  const w = CRATE_W;
  const soft = good === 'soft_drink';
  const frame = soft ? '#c0392b' : P.wood;
  s.add(box(w, 0.1, w, 0.014), frame);
  s.add(box(w + 0.004, 0.025, w + 0.004, 0), soft ? '#8e2a20' : P.woodDark, { at: [0, 0.035, 0], jitter: 0 });
  s.add(box(w - 0.03, 0.01, w - 0.03, 0), shade(frame, -0.35), { at: [0, 0.095, 0], jitter: 0 });
  for (const [x, z] of [
    [-0.038, -0.038],
    [0.038, -0.038],
    [-0.038, 0.038],
    [0.038, 0.038],
  ] as const) {
    if (good === 'lemonade') {
      s.add(cyl(0.024, 0.026, 0.07, 6), FOOD_COLORS.lemonade, { at: [x, 0.07, z], mat: 'glass' });
      s.add(cyl(0.01, 0.016, 0.03, 6), FOOD_COLORS.lemonade, { at: [x, 0.14, z], mat: 'glass' });
      s.add(cyl(0.011, 0.011, 0.01, 6), '#e25b8b', { at: [x, 0.17, z], jitter: 0 });
    } else if (soft) {
      s.add(cyl(0.028, 0.028, 0.08, 8), '#b8352c', { at: [x, 0.07, z] });
      s.add(cyl(0.029, 0.029, 0.02, 8), P.white, { at: [x, 0.1, z], jitter: 0 });
      s.add(cyl(0.024, 0.028, 0.01, 8), P.steel, { at: [x, 0.15, z], mat: 'metal', jitter: 0 });
    } else {
      // Any other good: a parcel in its colour.
      s.add(box(0.06, 0.06, 0.06, 0.01), FOOD_COLORS[good] ?? P.cream, { at: [x, 0.07, z] });
    }
  }
  return s;
}

export function crateGeo(good: FoodId): THREE.BufferGeometry {
  return good === 'beer' ? miniGeo('p:barrel', barrelShape) : miniGeo(`p:crate:${good}`, () => crateShape(good));
}

/** Drink crate (beer: barrel). Origin bottom centre. */
export function buildCrate(ctx: MiniCtx, good: FoodId): THREE.Group {
  const { root, g } = propRoot(`crate:${good}`);
  solid(ctx, g, crateGeo(good));
  return root;
}

// ---------------------------------------------------------------------------
// Envelope / leaflet
// ---------------------------------------------------------------------------

export function envelopeGeo(color: string): THREE.BufferGeometry {
  return miniGeo(`p:envelope:${color}`, () => {
    const pal = playerPalette(color);
    const s = new Shape();
    s.add(box(0.2, 0.022, 0.14, 0), P.white, { jitter: 0 });
    // Flap: two ink-muted lines meeting in a V.
    for (const side of [1, -1]) s.add(box(0.12, 0.004, 0.01, 0), COLORS.inkMuted, { at: [side * 0.05, 0.022, -0.02], rot: [0, side * 0.62, 0], jitter: 0 });
    // Stamp in the chain colour.
    s.add(box(0.04, 0.006, 0.035, 0), pal.base, { at: [0.065, 0.022, 0.035], jitter: 0 });
    return s;
  });
}

/** Mailbox envelope (lies flat, flap up). */
export function buildEnvelope(ctx: MiniCtx, color: string): THREE.Group {
  const { root, g } = propRoot('envelope');
  solid(ctx, g, envelopeGeo(color), { castShadow: true });
  return root;
}

export function leafletGeo(color: string): THREE.BufferGeometry {
  return miniGeo(`p:leaflet:${color}`, () => {
    const pal = playerPalette(color);
    const s = new Shape();
    s.add(box(0.16, 0.006, 0.22, 0), P.white, { jitter: 0 });
    s.add(box(0.162, 0.008, 0.06, 0), pal.base, { at: [0, 0, -0.07], jitter: 0 });
    s.add(box(0.1, 0.008, 0.02, 0), COLORS.inkMuted, { at: [0, 0, 0.03], jitter: 0 });
    s.add(box(0.07, 0.008, 0.02, 0), COLORS.inkMuted, { at: [-0.015, 0, 0.065], jitter: 0 });
    return s;
  });
}

/** Airplane leaflet; flutter with `flutterLeaflet`. */
export function buildLeaflet(ctx: MiniCtx, color: string): THREE.Group {
  const { root, g } = propRoot('leaflet');
  const inner = solid(ctx, g, leafletGeo(color), { castShadow: false });
  inner.name = 'sheet';
  return root;
}

/**
 * Leaflet falling from `fromY` to the ground over k = 0..1: sine sway on x rotation, side drift,
 * lands flat. Moves the inner sheet only (place the group at the landing point).
 */
export function flutterLeaflet(g: THREE.Object3D, k: number, fromY = 2.3, seed = 0): void {
  const sheet = g.getObjectByName('sheet') ?? g;
  const e = 1 - (1 - k) * (1 - k);
  const sway = (1 - k) * Math.sin(k * 14 + seed);
  sheet.position.set(sway * 0.12, (1 - e) * fromY + 0.02, Math.cos(k * 9 + seed) * (1 - k) * 0.08);
  sheet.rotation.set(sway * 0.9, seed + k * 2, (1 - k) * Math.cos(k * 11 + seed) * 0.5);
}

// ---------------------------------------------------------------------------
// Puffs (steam / dust)
// ---------------------------------------------------------------------------

function puffBallGeo(kind: 'steam' | 'dust'): THREE.BufferGeometry {
  return miniGeo(`p:puff:${kind}`, () => new Shape().add(ball(0.1, 0), kind === 'steam' ? '#fffaf0' : shade(COLORS.lot, -0.08), { jitter: 0 }));
}

/** 3–4 balls that swell and shrink away (`animatePuff`). Steam rises, dust spreads at ground level. */
export function buildPuff(ctx: MiniCtx, kind: 'steam' | 'dust', count = kind === 'steam' ? 3 : 4): THREE.Group {
  const { root, g } = propRoot(`puff:${kind}`);
  g.userData.puff = kind;
  for (let i = 0; i < count; i++) {
    const o = solid(ctx, g, puffBallGeo(kind), { castShadow: false });
    const a = (i / count) * Math.PI * 2 + 0.4;
    o.userData.dir = [Math.cos(a), Math.sin(a)];
    o.userData.size = 0.8 + ((i * 37) % 10) / 25;
    o.userData.delay = i * 0.08;
    o.scale.setScalar(0);
  }
  return root;
}

export function animatePuff(prop: THREE.Object3D, k: number): void {
  const g = partsOf(prop);
  const steam = g.userData.puff === 'steam';
  for (const o of g.children) {
    const d = o.userData.delay as number;
    const u = THREE.MathUtils.clamp((k - d) / (1 - d), 0, 1);
    const [dx, dz] = o.userData.dir as [number, number];
    const grow = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
    o.scale.setScalar(Math.max(0, grow) * (o.userData.size as number) * (steam ? 1 : 0.9));
    if (steam) o.position.set(dx * 0.06 * u, 0.05 + u * 0.45, dz * 0.06 * u);
    else o.position.set(dx * (0.08 + u * 0.28), 0.05 + Math.sin(u * Math.PI) * 0.05, dz * (0.08 + u * 0.28));
  }
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

function confettiGeo(c: string): THREE.BufferGeometry {
  return miniGeo(`p:confetti:${c}`, () => new Shape().add(box(0.06, 0.006, 0.1, 0), c, { at: [0, -0.003, 0], jitter: 0 }));
}

/** Confetti burst in the chain colours + accent; `animateConfetti` throws and drops it. */
export function buildConfetti(ctx: MiniCtx, color: string, count = 10): THREE.Group {
  const pal = playerPalette(color);
  const cols = [pal.base, pal.light, COLORS.accent === pal.base ? '#f8d24a' : COLORS.accent];
  const { root, g } = propRoot('confetti');
  for (let i = 0; i < count; i++) {
    const o = solid(ctx, g, confettiGeo(cols[i % 3]!), { castShadow: false });
    const a = i * 2.39996; // golden angle spread
    const r = 0.25 + ((i * 53) % 10) / 22;
    o.userData.v = [Math.cos(a) * r, 1.1 + ((i * 29) % 10) / 14, Math.sin(a) * r];
    o.userData.spin = [3 + (i % 4), 5 + ((i * 7) % 5), 2 + (i % 3)];
    o.scale.setScalar(0);
  }
  return root;
}

/** k = 0..1 over ~0.9 s: burst up, tumble, fall (no physics; a parabola per piece). */
export function animateConfetti(prop: THREE.Object3D, k: number): void {
  const g = partsOf(prop);
  for (const o of g.children) {
    const [vx, vy, vz] = o.userData.v as [number, number, number];
    const [sx, sy, sz] = o.userData.spin as [number, number, number];
    const t = k * 0.9;
    o.position.set(vx * t, vy * t - 2.4 * t * t + 0.1, vz * t);
    o.rotation.set(sx * t * 2, sy * t * 2, sz * t * 2);
    o.scale.setScalar(k <= 0 ? 0 : k > 0.85 ? (1 - k) / 0.15 : 1);
  }
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** One coin (existing `coinGeo`). */
export function buildCoin(ctx: MiniCtx): THREE.Group {
  const { root, g } = propRoot('coin');
  solid(ctx, g, coinGeo(), { castShadow: true });
  return root;
}

/** A short stack of coins (each coin its own child for staggered pops). */
export function buildCoinStack(ctx: MiniCtx, count = 3): THREE.Group {
  const { root, g } = propRoot('coins');
  for (let i = 0; i < count; i++) {
    const o = solid(ctx, g, coinGeo(), { castShadow: true });
    o.position.set(((i * 13) % 5) * 0.004, i * 0.042, ((i * 7) % 5) * 0.004);
    o.rotation.y = i * 0.7;
  }
  return root;
}

export function cashGeo(): THREE.BufferGeometry {
  return miniGeo('p:cash', () => {
    const s = new Shape();
    for (let i = 0; i < 3; i++) s.add(box(0.22, 0.016, 0.12, 0), i % 2 ? '#7fbf73' : '#6aac60', { at: [((i * 7) % 3) * 0.006 - 0.006, i * 0.016, 0], rot: [0, (i - 1) * 0.06, 0] });
    s.add(box(0.05, 0.052, 0.124, 0), '#f4ead5', { at: [0, -0.001, 0], jitter: 0 });
    s.add(puck(0.025, 0.004, 8, 0.001), '#3f7a3a', { at: [0.07, 0.048, 0], jitter: 0 });
    return s;
  });
}

/** A banded bundle of banknotes (bigger payouts, bank break). */
export function buildCash(ctx: MiniCtx): THREE.Group {
  const { root, g } = propRoot('cash');
  solid(ctx, g, cashGeo(), { castShadow: true });
  return root;
}

// ---------------------------------------------------------------------------
// Goods tokens
// ---------------------------------------------------------------------------

/** A goods token as cargo (van roof, flights to houses), at `CARRY_SCALE`. */
export function buildCarryToken(ctx: MiniCtx, good: FoodId): THREE.Group {
  const { root, g } = propRoot(`carry:${good}`);
  const o = solid(ctx, g, tokenGeo(good), { castShadow: true });
  o.scale.setScalar(CARRY_SCALE);
  return root;
}

let ghostMat: THREE.Material | null = null;
function ghostTokenMat(): THREE.Material {
  return (ghostMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, transparent: true, opacity: 0.7, depthWrite: false }));
}

/** Pre-sale demand token at 70% opacity (masking, animation-plan §4.2); one shared material. */
export function buildGhostToken(ctx: MiniCtx, good: FoodId): THREE.Group {
  const { root, g } = propRoot(`ghost:${good}`);
  if (ctx.ghost) {
    solid(ctx, g, tokenGeo(good));
    return root;
  }
  g.add(ctx.inst.proxy(tokenGeo(good), { castShadow: false, material: ghostTokenMat() }));
  return root;
}

// ---------------------------------------------------------------------------
// Radio rings
// ---------------------------------------------------------------------------

const RING_N = 3;
const RING_GAP = 0.2;

/**
 * Three expanding rings from a radio mast (place the group at the mast top). Each ring has its own
 * material (opacity fades), so this prop costs three draw calls while visible; pool it.
 */
export function buildRadioRings(ctx: MiniCtx, color: string): THREE.Group {
  const pal = playerPalette(color);
  const { root, g } = propRoot('radioRings');
  for (let i = 0; i < RING_N; i++) {
    const m = new THREE.Mesh(
      torus(1, 0.035, 32),
      ctx.ghost ?? owned(new THREE.MeshBasicMaterial({ color: shade(pal.base, 0.15), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })),
    );
    m.renderOrder = 3;
    m.scale.setScalar(0.001);
    g.add(m);
  }
  return root;
}

/** Ring i's progress for clip progress k (rings leave RING_GAP apart). */
function ringU(k: number, i: number): number {
  const span = 1 - RING_GAP * (RING_N - 1);
  return THREE.MathUtils.clamp((k - i * RING_GAP) / span, 0, 1);
}

/** Radius of the leading ring at k (drop a house's token when this passes its distance). */
export function ringFront(k: number, maxR: number): number {
  return 0.3 + ringU(k, 0) * (maxR - 0.3);
}

export function animateRadioRings(prop: THREE.Object3D, k: number, maxR: number): void {
  partsOf(prop).children.forEach((r, i) => {
    const u = ringU(k, i);
    const radius = 0.3 + u * (maxR - 0.3);
    // Tube thickens a little as it grows so it stays visible from far away.
    r.scale.set(radius, 1 + u * 1.5, radius);
    const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial;
    if (m.transparent) m.opacity = u <= 0 || u >= 1 ? 0 : 0.9 * (1 - u) * Math.min(1, u * 8);
  });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type PropFactory = (ctx: MiniCtx, spec: PropSpec) => THREE.Group;

const NEUTRAL = '#d94f3d';
export const PROP_FACTORIES: Record<PropKind, PropFactory> = {
  crate: (c, s) => buildCrate(c, s.good ?? 'beer'),
  envelope: (c, s) => buildEnvelope(c, s.color ?? NEUTRAL),
  leaflet: (c, s) => buildLeaflet(c, s.color ?? NEUTRAL),
  steam: (c, s) => buildPuff(c, 'steam', s.count),
  dust: (c, s) => buildPuff(c, 'dust', s.count),
  confetti: (c, s) => buildConfetti(c, s.color ?? NEUTRAL, s.count),
  coin: (c) => buildCoin(c),
  coins: (c, s) => buildCoinStack(c, s.count),
  cash: (c) => buildCash(c),
  carry: (c, s) => buildCarryToken(c, s.good ?? 'burger'),
  ghostToken: (c, s) => buildGhostToken(c, s.good ?? 'burger'),
  radioRings: (c, s) => buildRadioRings(c, s.color ?? NEUTRAL),
};

/** Pool bucket key for a prop. */
export function propKey(kind: PropKind, spec: PropSpec): string {
  return `${kind}:${spec.color ?? ''}:${spec.good ?? ''}:${spec.count ?? ''}`;
}
