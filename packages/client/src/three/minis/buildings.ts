/** Houses (printed / placed), apartments, gardens and the rural area. */
import * as THREE from 'three';
import type { Direction } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { dirAngle } from '../coords.js';
import { makeBadge } from '../labels.js';
import { blob, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cone, cyl, gable, hip, lathe, miniGeo, shade } from './kit.js';

const WALLS = [COLORS.houseWall, '#efdcbc', '#f5ecdc'];
const ROOFS = [COLORS.houseRoof, '#b65a3c', '#d9824f'];
const NEW_ROOF = '#4f8a9a';

// ---------------------------------------------------------------------------
// Small reusable bits
// ---------------------------------------------------------------------------

export function tree(s: Shape, x: number, z: number, size = 1, tint: string = P.leaf): Shape {
  s.add(cyl(0.05 * size, 0.07 * size, 0.28 * size, 6), P.trunk, { at: [x, 0, z] });
  s.add(ball(0.24 * size, 0), tint, { at: [x, 0.42 * size, z] });
  s.add(ball(0.16 * size, 0), shade(tint, 0.15), { at: [x + 0.07 * size, 0.58 * size, z - 0.04 * size] });
  return s;
}

export function pine(s: Shape, x: number, z: number, size = 1): Shape {
  s.add(cyl(0.04 * size, 0.05 * size, 0.16 * size, 5), P.trunk, { at: [x, 0, z] });
  s.add(cone(0.24 * size, 0.42 * size, 7), '#4b8a4a', { at: [x, 0.12 * size, z] });
  s.add(cone(0.17 * size, 0.32 * size, 7), '#5a9c55', { at: [x, 0.38 * size, z] });
  return s;
}

export function bush(s: Shape, x: number, z: number, r = 0.12, tint: string = P.leafLight): Shape {
  s.add(ball(r, 0), tint, { at: [x, r * 0.7, z], scale: [1, 0.8, 1] });
  return s;
}

// ---------------------------------------------------------------------------
// House (2x2)
// ---------------------------------------------------------------------------

export interface HouseParams {
  label: string;
  /** Side the front door faces (towards the nearest road). */
  facing: Direction;
  /** New-business-developer house (always has a garden). */
  placed: boolean;
  variant: number;
}

function houseShape(variant: number, placed: boolean): Shape {
  const wall = WALLS[variant % WALLS.length]!;
  const roof = placed ? NEW_ROOF : ROOFS[variant % ROOFS.length]!;
  const s = new Shape();
  // Lot pad (miniature base).
  s.add(box(1.84, 0.07, 1.84, 0.035), P.lot, { jitter: 0 });
  s.add(box(1.7, 0.012, 1.7, 0), shade(COLORS.grass, -0.04), { at: [0, 0.07, 0], jitter: 0 });
  // Path and porch.
  s.add(box(0.3, 0.02, 0.62, 0.008), P.stone, { at: [0, 0.07, 0.6] });
  s.add(box(0.5, 0.08, 0.24, 0.02), P.stone, { at: [0, 0.07, 0.36] });
  // Body.
  s.add(box(1.24, 0.66, 0.98, 0.05), wall, { at: [0, 0.08, -0.12] });
  // Side wing (garage) for silhouette.
  if (variant % 2 === 0) {
    s.add(box(0.5, 0.44, 0.7, 0.04), shade(wall, -0.05), { at: [-0.78, 0.08, -0.04] });
    s.add(gable(0.62, 0.22, 0.8), shade(roof, -0.08), { at: [-0.78, 0.5, -0.04], rot: [0, 0, 0] });
    s.add(box(0.36, 0.3, 0.03, 0.01), '#d7cbb3', { at: [-0.78, 0.08, 0.32] });
  } else {
    bush(s, -0.66, 0.42, 0.14);
    bush(s, -0.78, 0.18, 0.11, P.leaf);
  }
  // Roof (ridge parallel to the front) with overhang.
  s.add(gable(1.24, 0.5, 1.5), roof, { at: [0, 0.72, -0.12], rot: [0, Math.PI / 2, 0] });
  // Chimney.
  s.add(box(0.17, 0.42, 0.17, 0.02), '#b9a48a', { at: [0.38, 0.86, -0.36] });
  s.add(box(0.21, 0.05, 0.21, 0.015), '#8f7d68', { at: [0.38, 1.27, -0.36] });
  // Door + windows on the front.
  s.add(box(0.24, 0.4, 0.05, 0.015), placed ? '#3f6f7c' : '#8b4a3a', { at: [0, 0.1, 0.37] });
  s.add(ball(0.025, 0), '#e8b730', { at: [0.07, 0.3, 0.405] });
  for (const x of [-0.38, 0.38]) {
    s.add(box(0.28, 0.24, 0.04, 0.012), P.white, { at: [x, 0.3, 0.37] });
    s.add(box(0.22, 0.18, 0.05, 0.008), P.window, { at: [x, 0.33, 0.37], mat: 'glass' });
    s.add(box(0.3, 0.035, 0.08, 0.01), P.white, { at: [x, 0.28, 0.4] });
  }
  // Side windows.
  for (const sx of [-1, 1]) {
    if (sx < 0 && variant % 2 === 0) continue;
    s.add(box(0.05, 0.2, 0.26, 0.01), P.window, { at: [sx * 0.62, 0.34, -0.12], mat: 'glass' });
  }
  // Front-yard trimmings.
  bush(s, 0.62, 0.5, 0.12);
  if (variant % 3 === 1) tree(s, 0.66, -0.66, 0.8);
  return s;
}

export function buildHouse(ctx: MiniCtx, p: HouseParams): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = dirAngle(p.facing);
  g.add(body);
  blob(ctx, body, 2.2, 2.0, true, 0.7);
  solid(ctx, body, miniGeo(`house:${p.variant % 6}:${p.placed}`, () => houseShape(p.variant % 6, p.placed)));
  const badge = makeBadge(p.label, { bg: COLORS.surface, ring: p.placed ? NEW_ROOF : COLORS.ink }, 0.46);
  badge.position.set(0, 1.62, 0);
  badge.name = 'badge';
  g.add(badge);
  g.userData.stackY = 1.95;
  return g;
}

// ---------------------------------------------------------------------------
// Apartment (3x3, Ketchup)
// ---------------------------------------------------------------------------

function apartmentShape(): Shape {
  const s = new Shape();
  const c = COLORS.apartment;
  s.add(box(2.84, 0.07, 2.84, 0.035), P.lot, { jitter: 0 });
  s.add(box(2.6, 0.02, 2.6, 0.01), P.stone, { at: [0, 0.07, 0] });
  // Lower block.
  s.add(box(2.3, 1.36, 2.1, 0.06), c, { at: [0, 0.08, -0.1] });
  for (const y of [0.42, 0.88]) {
    s.add(box(2.34, 0.2, 2.14, 0.02), P.windowDark, { at: [0, 0.08 + y - 0.1, -0.1], mat: 'glass' });
    s.add(box(2.36, 0.04, 2.16, 0.01), shade(c, 0.35), { at: [0, 0.08 + y - 0.14, -0.1] });
  }
  s.add(box(2.4, 0.08, 2.2, 0.03), shade(c, -0.2), { at: [0, 1.44, -0.1] });
  // Upper stepped block.
  s.add(box(1.6, 0.78, 1.4, 0.05), shade(c, 0.08), { at: [-0.2, 1.52, -0.3] });
  s.add(box(1.64, 0.2, 1.44, 0.02), P.windowDark, { at: [-0.2, 1.78, -0.3], mat: 'glass' });
  s.add(box(1.7, 0.07, 1.5, 0.03), shade(c, -0.2), { at: [-0.2, 2.3, -0.3] });
  // Roof bits.
  s.add(cyl(0.18, 0.18, 0.28, 8), '#9a8f86', { at: [0.25, 2.37, -0.55] });
  s.add(cone(0.2, 0.12, 8), '#7f756d', { at: [0.25, 2.65, -0.55] });
  s.add(box(0.36, 0.18, 0.28, 0.03), P.steel, { at: [-0.62, 2.37, -0.1] });
  s.add(box(0.5, 0.14, 0.4, 0.03), P.steel, { at: [0.75, 1.52, 0.55] });
  // Entrance canopy and door.
  s.add(box(0.7, 0.5, 0.06, 0.015), '#4d4a5a', { at: [0, 0.08, 0.96] });
  s.add(box(0.5, 0.42, 0.07, 0.01), P.window, { at: [0, 0.09, 0.97], mat: 'glass' });
  s.add(box(0.9, 0.06, 0.4, 0.02), '#d94f3d', { at: [0, 0.62, 1.1] });
  for (const x of [-0.4, 0.4]) s.add(cyl(0.025, 0.025, 0.55, 5), P.steelDark, { at: [x, 0.07, 1.26] });
  // Planters.
  for (const x of [-1.15, 1.15]) {
    s.add(box(0.3, 0.12, 0.3, 0.03), P.stone, { at: [x, 0.07, 1.15] });
    bush(s, x, 1.15, 0.13);
  }
  return s;
}

export function buildApartment(ctx: MiniCtx, p: { label: string; facing: Direction }): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = dirAngle(p.facing);
  g.add(body);
  blob(ctx, body, 3.2, 3.0, true, 0.8);
  solid(ctx, body, miniGeo('apartment', apartmentShape));
  const badge = makeBadge(p.label, { bg: COLORS.surface, ring: '#6b5f8a' }, 0.52);
  badge.position.set(0, 3.0, 0);
  badge.name = 'badge';
  g.add(badge);
  g.userData.stackY = 3.35;
  return g;
}

// ---------------------------------------------------------------------------
// Garden (2x1 strip; origin at its centre, long axis along x)
// ---------------------------------------------------------------------------

function gardenShape(): Shape {
  const s = new Shape();
  s.add(box(1.88, 0.06, 0.88, 0.03), P.lot, { jitter: 0 });
  s.add(box(1.7, 0.03, 0.7, 0.01), COLORS.park, { at: [0, 0.06, 0], jitter: 0 });
  // Hedge border (gap at the middle of the long sides).
  for (const z of [-0.38, 0.38]) {
    s.add(box(0.72, 0.2, 0.12, 0.05), COLORS.garden, { at: [-0.5, 0.06, z] });
    s.add(box(0.72, 0.2, 0.12, 0.05), COLORS.garden, { at: [0.5, 0.06, z] });
  }
  for (const x of [-0.88, 0.88]) s.add(box(0.12, 0.2, 0.86, 0.05), COLORS.garden, { at: [x, 0.06, 0] });
  tree(s, -0.45, 0, 1.05);
  tree(s, 0.48, 0.02, 0.9, P.leafLight);
  // Flower beds.
  for (const [x, z, c] of [
    [0.05, -0.18, '#f08a3c'],
    [0.12, 0.16, '#e25b8b'],
    [-0.08, 0.05, '#fff3a8'],
    [-0.72, 0.22, '#e25b8b'],
    [0.75, -0.2, '#fff3a8'],
  ] as const)
    s.add(ball(0.05, 0), c, { at: [x, 0.11, z] });
  // Bench.
  s.add(box(0.3, 0.04, 0.1, 0.01), P.wood, { at: [0.05, 0.16, 0.24] });
  s.add(box(0.3, 0.1, 0.03, 0.01), P.wood, { at: [0.05, 0.2, 0.3] });
  return s;
}

export function buildGarden(ctx: MiniCtx, p: { vertical: boolean }): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  if (p.vertical) body.rotation.y = Math.PI / 2;
  g.add(body);
  blob(ctx, body, 2.1, 1.1, true, 0.5);
  solid(ctx, body, miniGeo('garden', gardenShape));
  return g;
}

// ---------------------------------------------------------------------------
// Rural area (Ketchup, off-board 5x5 tile)
// ---------------------------------------------------------------------------

function ruralShape(): Shape {
  const s = new Shape();
  s.add(box(5.0, 0.24, 5.0, 0.08), '#cbbd9c', { at: [0, -0.2, 0], jitter: 0 });
  s.add(box(4.84, 0.05, 4.84, 0.03), '#b9d58a', { at: [0, 0.03, 0], jitter: 0 });
  // Fields: striped crops.
  const crops = ['#e3c766', '#d8b54e', '#9bc66a', '#86b45a'];
  for (let i = 0; i < 6; i++) {
    s.add(box(2.1, 0.06, 0.26, 0.02), crops[i % 2]!, { at: [-1.2, 0.07, -2.0 + i * 0.36] });
    s.add(box(0.26, 0.06, 1.9, 0.02), crops[2 + (i % 2)]!, { at: [0.55 + i * 0.36, 0.07, 1.2] });
  }
  // Barn.
  s.add(box(1.3, 0.8, 1.0, 0.04), '#b8432f', { at: [1.2, 0.08, -1.2] });
  s.add(gable(1.12, 0.5, 1.44), '#5a4a42', { at: [1.2, 0.88, -1.2], rot: [0, Math.PI / 2, 0] });
  s.add(box(0.5, 0.56, 0.04, 0.01), '#f4ead5', { at: [1.2, 0.08, -0.69] });
  s.add(box(0.42, 0.48, 0.05, 0.01), '#8e3424', { at: [1.2, 0.11, -0.68] });
  // Silo.
  s.add(cyl(0.3, 0.3, 1.3, 10), '#cfd3d8', { at: [2.15, 0.08, -1.55], mat: 'metal' });
  s.add(lathe([[0.32, 0], [0.3, 0.12], [0.18, 0.26], [0, 0.32]], 10), '#8b929c', { at: [2.15, 1.38, -1.55], mat: 'metal' });
  // Farmhouse.
  s.add(box(0.8, 0.5, 0.6, 0.04), '#f2e6cf', { at: [-1.3, 0.08, 0.9] });
  s.add(hip(0.96, 0.36, 0.76, 0.3), '#7a5a46', { at: [-1.3, 0.58, 0.9] });
  s.add(box(0.16, 0.26, 0.04, 0.01), '#8b4a3a', { at: [-1.3, 0.1, 1.21] });
  // Fences.
  for (let i = 0; i < 9; i++) s.add(box(0.04, 0.2, 0.04, 0), P.wood, { at: [-2.3 + i * 0.28, 0.08, -0.15] });
  s.add(box(2.3, 0.035, 0.03, 0), P.wood, { at: [-1.18, 0.22, -0.15] });
  s.add(box(2.3, 0.035, 0.03, 0), P.wood, { at: [-1.18, 0.14, -0.15] });
  // Trees.
  tree(s, -2.1, 2.1, 1.2);
  tree(s, -0.4, 2.15, 1.0, P.leafLight);
  pine(s, 2.1, 0.0, 1.2);
  pine(s, -2.2, -2.2, 1.0);
  tree(s, 0.4, -2.1, 1.1);
  // Hay bales.
  for (const [x, z] of [
    [0.2, -0.6],
    [0.5, -0.45],
  ] as const)
    s.add(cyl(0.13, 0.13, 0.2, 8), '#e3c766', { at: [x, 0.18, z], rot: [Math.PI / 2, 0, 0] });
  return s;
}

export function buildRural(ctx: MiniCtx): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 6.2, 6.2, true, 0.7);
  solid(ctx, g, miniGeo('rural', ruralShape));
  const badge = makeBadge('Rural', { bg: COLORS.surface, ring: '#7a5a46', pill: true }, 0.5);
  badge.position.set(0, 2.2, 0);
  badge.name = 'badge';
  g.add(badge);
  g.userData.stackY = 2.6;
  return g;
}
