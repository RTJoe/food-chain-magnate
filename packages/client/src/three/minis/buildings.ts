/**
 * Houses (printed / placed), apartments, gardens and the rural area, sculpted as Special Edition
 * single-colour plastic minis (docs/art-bible.md §6.2–6.4): burgundy houses and apartments, lime
 * gardens, a green rural slab. Also the embossed-glyph helpers (house numbers, apartment names, ∞).
 */
import * as THREE from 'three';
import type { Direction } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { dirAngle } from '../coords.js';
import { BADGE_MIN_PX, makeBadge } from '../labels.js';
import { blob, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cone, cyl, extrude, gable, lathe, miniGeo, shade, type PartOpts } from './kit.js';

/** SE plastic colours (art bible §2 "Map, houses, goods"). */
export const PLASTIC = {
  house: '#7a2f48',
  garden: '#a9bd62',
  drink: '#4c8a3a',
  rural: '#67ae86',
  park: '#537938',
} as const;
/** Badge ring of placed (new business developer) houses: the minis are identical, the label tells them apart. */
const NEW_RING = '#356a80';
/** Every mini in this family shares one contact-shadow pool. */
const BLOB = 0.6;
/** Base plate height (art bible §6). */
const PLATE = 0.06;

/** Number badge anchors (the demand plaque sits just above them, see minis/tokens.ts). */
export const HOUSE_BADGE_Y = 1.62;
export const APARTMENT_BADGE_Y = 3.0;
export const RURAL_BADGE_Y = 2.2;
/** Number badge world heights. */
export const BADGE_SIZE = { house: 0.46, apartment: 0.52, rural: 0.5 } as const;

// ---------------------------------------------------------------------------
// Plastic pen: one colour, a whisper of per-part jitter, the SE plastic finish
// ---------------------------------------------------------------------------

export type Pen = (geo: THREE.BufferGeometry, tint?: number, o?: PartOpts) => Shape;

/** Adds parts in `base` plastic; `tint` > 0 lightens, < 0 darkens (baked AO for recesses). */
export function plasticPen(s: Shape, base: string): Pen {
  return (geo, tint = 0, o = {}) => s.add(geo, tint ? shade(base, tint) : base, { jitter: 0.015, mat: 'plastic', ...o });
}

/** Recess tint: concave areas 10 % darker (art bible §6 baked AO). */
const RECESS = -0.1;

/** Smooth low dome (sculpted bush / shrub), base at y = 0. */
export function dome(r: number, h: number, seg = 7): THREE.BufferGeometry {
  return lathe(
    [
      [0, 0],
      [r, 0],
      [r * 0.92, h * 0.45],
      [r * 0.6, h * 0.85],
      [0, h],
    ],
    seg,
  );
}

// ---------------------------------------------------------------------------
// Small reusable bits (multi-colour, used by other builders)
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

/** Monochrome sculpted tree: cone trunk + two stacked icospheres (art bible §6.4). */
export function plasticTree(pen: Pen, x: number, z: number, size = 1, y = 0): void {
  pen(cone(0.06 * size, 0.3 * size, 5), RECESS, { at: [x, y, z] });
  pen(ball(0.22 * size, 0), 0, { at: [x, y + 0.36 * size, z] });
  pen(ball(0.15 * size, 0), 0.04, { at: [x + 0.04 * size, y + 0.56 * size, z - 0.03 * size] });
}

/** Monochrome pine: two stacked cones. */
export function plasticPine(pen: Pen, x: number, z: number, size = 1, y = 0): void {
  pen(cone(0.2 * size, 0.4 * size, 6), -0.04, { at: [x, y + 0.04 * size, z] });
  pen(cone(0.14 * size, 0.32 * size, 6), 0, { at: [x, y + 0.3 * size, z] });
}

// ---------------------------------------------------------------------------
// Embossed glyphs: digits (plus π, ¾, ∞) as stroked bars, so a number costs a few instances of
// one shared unit box instead of a geometry per label.
// ---------------------------------------------------------------------------

type Pt = [number, number];
/** Polylines in a box 1 high and `w` wide. */
interface Glyph {
  w: number;
  lines: Pt[][];
}

const flip = (lines: Pt[][], w: number): Pt[][] => lines.map((l) => l.map(([x, y]): Pt => [w - x, 1 - y]));
const fit = (lines: Pt[][], s: number, dx: number, dy: number): Pt[][] => lines.map((l) => l.map(([x, y]): Pt => [x * s + dx, y * s + dy]));
const loop = (cx: number, cy: number, rx: number, ry: number, n = 8): Pt[] =>
  Array.from({ length: n + 1 }, (_, i): Pt => [cx + rx * Math.cos((i / n) * Math.PI * 2 + Math.PI / n), cy + ry * Math.sin((i / n) * Math.PI * 2 + Math.PI / n)]);

const SIX: Pt[][] = [
  [
    [0.52, 1],
    [0.22, 1],
    [0.03, 0.8],
    [0, 0.5],
    [0, 0.16],
    [0.14, 0],
    [0.46, 0],
    [0.6, 0.16],
    [0.6, 0.42],
    [0.46, 0.58],
    [0.14, 0.58],
    [0, 0.44],
  ],
];
const THREE_: Pt[][] = [
  [
    [0, 0.86],
    [0.13, 1],
    [0.47, 1],
    [0.6, 0.86],
    [0.6, 0.66],
    [0.46, 0.53],
    [0.2, 0.53],
  ],
  [
    [0.46, 0.53],
    [0.6, 0.4],
    [0.6, 0.14],
    [0.46, 0],
    [0.13, 0],
    [0, 0.14],
  ],
];
const FOUR: Pt[][] = [
  [
    [0.46, 0],
    [0.46, 1],
    [0, 0.32],
    [0.64, 0.32],
  ],
];

const GLYPHS: Record<string, Glyph> = {
  '0': {
    w: 0.6,
    lines: [
      [
        [0.15, 0],
        [0.45, 0],
        [0.6, 0.16],
        [0.6, 0.84],
        [0.45, 1],
        [0.15, 1],
        [0, 0.84],
        [0, 0.16],
        [0.15, 0],
      ],
    ],
  },
  '1': {
    w: 0.5,
    lines: [
      [
        [0.06, 0.78],
        [0.3, 1],
        [0.3, 0],
      ],
      [
        [0.04, 0],
        [0.56, 0],
      ],
    ],
  },
  '2': {
    w: 0.6,
    lines: [
      [
        [0, 0.84],
        [0.15, 1],
        [0.45, 1],
        [0.6, 0.85],
        [0.6, 0.64],
        [0, 0],
        [0.62, 0],
      ],
    ],
  },
  '3': { w: 0.6, lines: THREE_ },
  '4': { w: 0.64, lines: FOUR },
  '5': {
    w: 0.6,
    lines: [
      [
        [0.58, 1],
        [0.06, 1],
        [0.02, 0.56],
        [0.44, 0.6],
        [0.6, 0.44],
        [0.6, 0.15],
        [0.46, 0],
        [0.13, 0],
        [0, 0.13],
      ],
    ],
  },
  '6': { w: 0.6, lines: SIX },
  '7': {
    w: 0.6,
    lines: [
      [
        [0, 1],
        [0.6, 1],
        [0.18, 0],
      ],
    ],
  },
  '8': {
    w: 0.6,
    lines: [
      [
        [0.13, 0.54],
        [0.04, 0.66],
        [0.04, 0.88],
        [0.15, 1],
        [0.45, 1],
        [0.56, 0.88],
        [0.56, 0.66],
        [0.47, 0.54],
        [0.13, 0.54],
        [0, 0.41],
        [0, 0.13],
        [0.13, 0],
        [0.47, 0],
        [0.6, 0.13],
        [0.6, 0.41],
        [0.47, 0.54],
      ],
    ],
  },
  '9': { w: 0.6, lines: flip(SIX, 0.6) },
  π: {
    w: 0.72,
    lines: [
      [
        [0, 0.86],
        [0.1, 0.96],
        [0.72, 0.96],
      ],
      [
        [0.22, 0.96],
        [0.16, 0],
      ],
      [
        [0.52, 0.96],
        [0.52, 0.12],
        [0.62, 0],
      ],
    ],
  },
  '¾': {
    w: 0.8,
    lines: [
      ...fit(THREE_, 0.44, 0, 0.56),
      [
        [0.08, 0.04],
        [0.72, 0.96],
      ],
      ...fit(FOUR, 0.44, 0.52, 0),
    ],
  },
  '∞': {
    w: 1.1,
    lines: [loop(0.29, 0.5, 0.27, 0.3), loop(0.81, 0.5, 0.27, 0.3)],
  },
};

/** Bars of `text` laid out centred on (0, 0) in the xy plane, `h` tall: [cx, cy, length, angle]. */
export function glyphBars(text: string, h: number, stroke: number): [number, number, number, number][] {
  const glyphs = [...text].map((c) => GLYPHS[c]).filter((g): g is Glyph => !!g);
  const gap = 0.16;
  const width = glyphs.reduce((a, g) => a + g.w, 0) + gap * Math.max(0, glyphs.length - 1);
  const out: [number, number, number, number][] = [];
  let x0 = -width / 2;
  for (const g of glyphs) {
    for (const line of g.lines)
      for (let i = 1; i < line.length; i++) {
        const [ax, ay] = line[i - 1]!;
        const [bx, by] = line[i]!;
        const len = Math.hypot(bx - ax, by - ay) * h;
        out.push([(x0 + (ax + bx) / 2) * h, ((ay + by) / 2 - 0.5) * h, len + stroke, Math.atan2(by - ay, bx - ax)]);
      }
    x0 += g.w + gap;
  }
  return out;
}

let unitBox: THREE.BufferGeometry | null = null;
const embossGeo = (paint: string) =>
  miniGeo(`emboss:${paint}`, () => new Shape().add((unitBox ??= new THREE.BoxGeometry(1, 1, 1)), paint, { jitter: 0, mat: 'plastic' }));

export interface EmbossOpts {
  /** Centre of the text on the face. */
  at: [number, number, number];
  /** Face orientation: default faces +z; [-π/2, 0, 0] lies flat facing up. */
  rot?: [number, number, number];
  h: number;
  stroke?: number;
  depth?: number;
}

/**
 * Embossed text as instances of one shared bar geometry per colour (house numbers: one draw call
 * for every number on the board). Bars stand `depth` proud of the face.
 */
export function embossInstanced(ctx: MiniCtx, parent: THREE.Object3D, text: string, paint: string, o: EmbossOpts): THREE.Group {
  const frame = new THREE.Group();
  frame.position.set(...o.at);
  if (o.rot) frame.rotation.set(o.rot[0], o.rot[1], o.rot[2], 'YXZ');
  parent.add(frame);
  const stroke = o.stroke ?? o.h * 0.17;
  const depth = o.depth ?? 0.03;
  const geo = embossGeo(paint);
  for (const [x, y, len, a] of glyphBars(text, o.h, stroke)) {
    const bar = solid(ctx, frame, geo, { castShadow: false });
    bar.position.set(x, y, depth / 2 - 0.004);
    bar.rotation.z = a;
    bar.scale.set(len, stroke, depth);
  }
  frame.name = 'emboss';
  return frame;
}

/** Embossed text merged into a shape (one-off minis: apartment names, the rural ∞). */
export function embossInto(s: Shape, text: string, paint: string, o: EmbossOpts): void {
  const stroke = o.stroke ?? o.h * 0.17;
  const depth = o.depth ?? 0.03;
  const sub = new Shape();
  const pen = plasticPen(sub, paint);
  for (const [x, y, len, a] of glyphBars(text, o.h, stroke))
    pen((unitBox ??= new THREE.BoxGeometry(1, 1, 1)), 0, { at: [x, y, depth / 2 - 0.004], rot: [0, 0, a], scale: [len, stroke, depth], jitter: 0 });
  s.addShape(sub, { at: o.at, ...(o.rot ? { rot: o.rot } : {}) });
}

// ---------------------------------------------------------------------------
// House (2x2): three SE-style sculpts, the number on the garage's false front
// ---------------------------------------------------------------------------

export interface HouseParams {
  label: string;
  /** Side the front door faces (towards the nearest road). */
  facing: Direction;
  /** New-business-developer house (always has a garden). */
  placed: boolean;
  variant: number;
}

export const HOUSE_VARIANTS = 3;
/** Garage side per variant: -1 = garage on the left (west when facing south). */
const GARAGE_SIDE = [-1, -1, 1] as const;
/** Embossed numbers and names: 12 % lighter than the plastic so they read (art bible §6.2). */
const HOUSE_EMBOSS = `#${shade(PLASTIC.house, 0.12).getHexString()}`;
/** Number block (garage false front) face centre and digit height. */
const NUM = { x: 0.6, y: PLATE + 0.54, z: 0.205, h: 0.3 } as const;

function houseShape(variant: number): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.house);
  const g = GARAGE_SIDE[variant]!;
  const m = -g; // main house is on the other side
  const X = (x: number) => m * x;
  const top = PLATE;
  // Plate.
  pen(box(1.84, PLATE, 1.84, 0.02), -0.02, { jitter: 0 });
  // Main body (side-gabled, ridge along x).
  const bx = X(0.2);
  const bz = -0.2;
  pen(box(1.0, 0.55, 0.7, 0.025), 0, { at: [bx, top, bz] });
  pen(gable(0.88, 0.34, 1.12), 0.02, { at: [bx, top + 0.55, bz], rot: [0, Math.PI / 2, 0] });
  // Chimney on the back slope.
  pen(box(0.13, 0.36, 0.13, 0), 0, { at: [bx + X(0.3), top + 0.68, bz - 0.2] });
  const front = bz + 0.35;
  // Windows (recesses) on the front, sides and back.
  const win = box(0.15, 0.17, 0.02, 0);
  const winSide = box(0.02, 0.17, 0.15, 0);
  // Door position and porch / front gable by variant.
  let door = bx;
  if (variant === 1) {
    // Cross-gabled: a front-facing gable wing at the outer end, door beside it under a small canopy.
    const wx = bx + X(0.27);
    pen(box(0.44, 0.55, 0.3, 0.02), 0, { at: [wx, top, front - 0.04] });
    pen(gable(0.54, 0.3, 0.42), 0.02, { at: [wx, top + 0.55, front + 0.02] });
    pen(win, RECESS, { at: [wx, top + 0.22, front + 0.26] });
    pen(box(0.1, 0.1, 0.02, 0), RECESS, { at: [wx, top + 0.62, front + 0.2] });
    door = bx - X(0.12);
    pen(box(0.34, 0.03, 0.2, 0), 0.03, { at: [door, top + 0.42, front + 0.09], rot: [0.2, 0, 0] });
    for (const dx of [-0.14, 0.14]) pen(cyl(0.018, 0.018, 0.4, 4), 0, { at: [door + dx, top, front + 0.17] });
    pen(win, RECESS, { at: [bx - X(0.36), top + 0.24, front] });
  } else {
    // Front porch: 3 posts and a shed roof across the front.
    door = bx - X(0.14);
    pen(box(0.86, 0.035, 0.28, 0), 0.03, { at: [bx, top, front + 0.14] });
    pen(box(0.9, 0.03, 0.32, 0), 0.03, { at: [bx, top + 0.42, front + 0.14], rot: [0.22, 0, 0] });
    for (const dx of [-0.4, 0.04, 0.4]) pen(cyl(0.02, 0.02, 0.42, 4), 0, { at: [bx + X(dx), top, front + 0.26] });
    for (const dx of [-0.3, 0.2]) pen(win, RECESS, { at: [bx + X(dx), top + 0.24, front] });
    if (variant === 2) {
      // Dormer on the front slope.
      pen(box(0.2, 0.18, 0.2, 0), 0, { at: [bx + X(0.1), top + 0.62, bz + 0.12] });
      pen(gable(0.26, 0.12, 0.26), 0.02, { at: [bx + X(0.1), top + 0.8, bz + 0.14] });
      pen(box(0.1, 0.1, 0.02, 0), RECESS, { at: [bx + X(0.1), top + 0.65, bz + 0.225] });
    }
  }
  pen(box(0.17, 0.33, 0.02, 0), RECESS - 0.04, { at: [door, top, front] });
  pen(box(0.26, 0.03, 0.1, 0), 0.02, { at: [door, top, front + 0.06] });
  for (const sx of [-1, 1]) pen(winSide, RECESS, { at: [bx + sx * 0.5, top + 0.24, bz] });
  for (const dx of [-0.25, 0.25]) pen(win, RECESS, { at: [bx + dx, top + 0.24, bz - 0.35] });
  // Garage wing: low body with a shed roof and a tall false front (the number block).
  const gx = g * NUM.x;
  pen(box(0.5, 0.38, 0.56, 0), -0.02, { at: [gx, top, bz + 0.07] });
  pen(box(0.54, 0.03, 0.6, 0), 0.02, { at: [gx, top + 0.42, bz + 0.07], rot: [-0.16, 0, 0] });
  pen(box(0.58, 0.72, 0.12, 0.02), 0, { at: [gx, top, NUM.z - 0.06] });
  pen(box(0.38, 0.26, 0.02, 0), RECESS - 0.04, { at: [gx, top, NUM.z] });
  for (const y of [0.09, 0.18]) pen(box(0.38, 0.012, 0.03, 0), RECESS + 0.04, { at: [gx, top + y, NUM.z] });
  // Embossed stepping-stone path from the door to the plate edge.
  for (let i = 0; i < 5; i++)
    pen(cyl(0.07, 0.07, 0.014, 6), 0.05, { at: [door + (i % 2 ? 0.05 : -0.05), top, front + 0.2 + i * 0.13], scale: [1.35, 1, 0.85] });
  // Shrubs by the door.
  pen(ball(0.09, 0), 0, { at: [door + X(0.24), top + 0.05, front + 0.08], scale: [1, 0.8, 1] });
  return s;
}

export function buildHouse(ctx: MiniCtx, p: HouseParams): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = dirAngle(p.facing);
  g.add(body);
  // Spread the sculpts over house numbers (ids hash poorly); fall back to the caller's variant.
  const n = parseInt(p.label, 10);
  const variant = (Number.isFinite(n) ? n : p.variant) % HOUSE_VARIANTS;
  blob(ctx, body, 2.1, 2.1, true, BLOB);
  solid(ctx, body, miniGeo(`house:se:${variant}`, () => houseShape(variant)));
  embossInstanced(ctx, body, p.label, HOUSE_EMBOSS, {
    at: [GARAGE_SIDE[variant]! * NUM.x, NUM.y, NUM.z],
    h: NUM.h,
    stroke: 0.055,
  });
  const badge = makeBadge(p.label, { bg: COLORS.surface, ring: p.placed ? NEW_RING : PLASTIC.house }, BADGE_SIZE.house);
  badge.position.set(0, HOUSE_BADGE_Y, 0);
  badge.name = 'badge';
  badge.userData.minPx = BADGE_MIN_PX;
  badge.userData.obstacle = true;
  g.add(badge);
  g.userData.stackY = 1.95;
  return g;
}

// ---------------------------------------------------------------------------
// Apartment (3x3, Ketchup): a burgundy block, window grid, shopfront, roof plaque with the name
// ---------------------------------------------------------------------------

/** Roof plaque face centre (the name is embossed on it as instances, like house numbers). */
const APT_PLAQUE: [number, number, number] = [-0.3, PLATE + 0.56 + 1.6 + 0.27, -0.15 + 0.62 + 0.03];

function apartmentShape(): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.house);
  const top = PLATE;
  const z0 = -0.15;
  pen(box(2.84, PLATE, 2.84, 0.02), -0.02, { jitter: 0 });
  // Ground floor (set back) with a cornice over the shopfront.
  pen(box(2.1, 0.5, 1.7, 0), RECESS, { at: [0, top, z0] });
  pen(box(2.3, 0.06, 1.9, 0.015), 0.02, { at: [0, top + 0.5, z0] });
  // Shopfront: six tall recesses across the front and the entrance in the middle.
  for (let i = 0; i < 6; i++) {
    const x = -0.9 + i * 0.36;
    if (i === 2 || i === 3) continue;
    pen(box(0.24, 0.34, 0.02, 0), RECESS - 0.06, { at: [x, top + 0.06, z0 + 0.85] });
  }
  pen(box(0.5, 0.4, 0.02, 0), RECESS - 0.1, { at: [0, top, z0 + 0.85] });
  pen(box(0.7, 0.04, 0.3, 0), 0.03, { at: [0, top + 0.44, z0 + 0.98] });
  // Upper storeys: the body is the window glass (darker), sills and pilasters frame a 5-row grid.
  const y0 = top + 0.56;
  const H = 1.6;
  pen(box(2.16, H, 1.76, 0), -0.12, { at: [0, y0, z0] });
  for (let r = 0; r < 5; r++) pen(box(2.22, 0.1, 1.82, 0), 0, { at: [0, y0 + r * (H / 5), z0] });
  for (let i = 0; i < 6; i++) pen(box(0.08, H, 1.84, 0), 0.02, { at: [-1.0 + i * 0.4, y0, z0] });
  for (let i = 0; i < 5; i++) pen(box(2.24, H, 0.08, 0), 0.02, { at: [0, y0, z0 - 0.8 + i * 0.4] });
  // Cornice and parapet.
  const yr = y0 + H;
  pen(box(2.34, 0.1, 1.94, 0.02), 0.03, { at: [0, yr, z0] });
  for (const sz of [-1, 1]) pen(box(2.3, 0.14, 0.07, 0), 0, { at: [0, yr + 0.1, z0 + sz * 0.92] });
  for (const sx of [-1, 1]) pen(box(0.07, 0.14, 1.8, 0), 0, { at: [sx * 1.12, yr + 0.1, z0] });
  // Water tank on crossed legs.
  pen(box(0.42, 0.2, 0.05, 0), RECESS, { at: [0.55, yr + 0.1, z0 - 0.35] });
  pen(box(0.05, 0.2, 0.42, 0), RECESS, { at: [0.55, yr + 0.1, z0 - 0.35] });
  pen(cyl(0.22, 0.22, 0.34, 8), 0, { at: [0.55, yr + 0.3, z0 - 0.35] });
  pen(cone(0.25, 0.14, 8), 0.03, { at: [0.55, yr + 0.64, z0 - 0.35] });
  // Roof plaque with the name (π / 9¾) facing the street.
  const pz = z0 + 0.62;
  pen(box(0.66, 0.34, 0.06, 0.015), 0, { at: [-0.3, yr + 0.1, pz] });
  return s;
}

export function buildApartment(ctx: MiniCtx, p: { label: string; facing: Direction }): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = dirAngle(p.facing);
  g.add(body);
  blob(ctx, body, 3.2, 3.2, true, BLOB);
  solid(ctx, body, miniGeo('apartment:se', apartmentShape));
  embossInstanced(ctx, body, p.label, HOUSE_EMBOSS, { at: APT_PLAQUE, h: 0.2, stroke: 0.04 });
  const badge = makeBadge(p.label, { bg: COLORS.surface, ring: PLASTIC.house }, BADGE_SIZE.apartment);
  badge.position.set(0, APARTMENT_BADGE_Y, 0);
  badge.name = 'badge';
  badge.userData.minPx = BADGE_MIN_PX;
  badge.userData.obstacle = true;
  g.add(badge);
  g.userData.stackY = 3.35;
  return g;
}

// ---------------------------------------------------------------------------
// Garden (2x1 strip; origin at its centre, long axis along x): lime hedge ring, fountain, bushes
// ---------------------------------------------------------------------------

function gardenShape(): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.garden);
  const top = PLATE;
  pen(box(1.88, PLATE, 0.88, 0), -0.02, { jitter: 0 });
  // Hedge ring, open in the middle of both long sides (the house can be on either).
  for (const z of [-0.36, 0.36]) for (const x of [-0.5, 0.5]) pen(box(0.76, 0.14, 0.1, 0), 0, { at: [x, top, z] });
  for (const x of [-0.89, 0.89]) pen(box(0.1, 0.14, 0.62, 0), 0, { at: [x, top, 0] });
  // Cross path and the fountain at its centre.
  pen(box(0.18, 0.012, 0.62, 0), 0.05, { at: [0, top, 0] });
  pen(cyl(0.22, 0.24, 0.1, 8), 0, { at: [0, top, 0] });
  pen(cyl(0.17, 0.17, 0.012, 8), RECESS, { at: [0, top + 0.095, 0] });
  pen(cyl(0.035, 0.05, 0.16, 5), 0.03, { at: [0, top + 0.1, 0] });
  // Two round bushes and two raised flower beds.
  for (const x of [-0.62, 0.62]) pen(dome(0.18, 0.26, 5), 0.02, { at: [x, top, -0.04] });
  for (const x of [-0.34, 0.34]) pen(cyl(0.1, 0.1, 0.025, 6), 0.06, { at: [x, top, 0.12], scale: [1.4, 1, 0.8] });
  return s;
}

export function buildGarden(ctx: MiniCtx, p: { vertical: boolean }): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  if (p.vertical) body.rotation.y = Math.PI / 2;
  g.add(body);
  blob(ctx, body, 2.1, 1.1, true, BLOB);
  solid(ctx, body, miniGeo('garden:se', gardenShape));
  return g;
}

// ---------------------------------------------------------------------------
// Rural area (Ketchup, off-board 5x5 tile): a green sculpted slab with a lake, jetty, slat shed,
// trees and an embossed ∞ (se-rural-area-mini.jpg)
// ---------------------------------------------------------------------------

/** Lake outline in plate coordinates (x, z). */
const LAKE: Pt[] = Array.from({ length: 28 }, (_, i): Pt => {
  const a = (i / 28) * Math.PI * 2;
  const r = 1.0 + 0.16 * Math.sin(a * 3 + 0.6) + 0.08 * Math.cos(a * 5);
  return [0.95 + r * 1.15 * Math.cos(a), 0.45 + r * Math.sin(a)];
});

function ruralShape(): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.rural);
  pen(box(4.9, 0.1, 4.9, 0.04), -0.03, { at: [0, -0.04, 0], jitter: 0 });
  // Land: a raised layer with the lake cut out (the lake floor is the plate, glossy).
  const land = 0.07;
  const geo = extrude(
    'rural-land',
    () => {
      const sh = new THREE.Shape();
      const h = 2.38;
      sh.moveTo(-h, -h).lineTo(h, -h).lineTo(h, h).lineTo(-h, h).lineTo(-h, -h);
      // Shape y = -z (the layer is rotated flat).
      const hole = new THREE.Path();
      LAKE.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
      hole.closePath();
      sh.holes.push(hole);
      return sh;
    },
    land,
  );
  pen(geo, 0, { at: [0, 0.06 + land / 2, 0], rot: [-Math.PI / 2, 0, 0], jitter: 0 });
  pen(cyl(1.0, 1.0, 0.004, 16), -0.05, { at: [0.95, 0.06, 0.45], scale: [1.35, 1, 1.25], mat: 'glass', jitter: 0 });
  const top = 0.06 + land;
  // Rolling mounds and shrub clumps along the shore (the SE slab is lumpy with foliage).
  for (const [x, z, r] of [
    [-1.6, 1.3, 0.75],
    [-1.9, -0.9, 0.5],
  ] as const)
    pen(dome(r, r * 0.22, 9), 0.02, { at: [x, top - 0.01, z] });
  LAKE.forEach(([x, z], i) => {
    if (i % 3 !== 1 || (z < 0.2 && x < 0.6)) return;
    const k = 1.12 + 0.1 * Math.sin(i * 2.1);
    pen(dome(0.17 + 0.05 * Math.sin(i), 0.17, 6), 0.03, { at: [0.95 + (x - 0.95) * k, top - 0.01, 0.45 + (z - 0.45) * k] });
  });
  // Slat shed (log cabin) by the shore, ridge along x.
  const [hx, hz] = [-0.75, -0.55];
  pen(box(0.96, 0.44, 0.66, 0), RECESS, { at: [hx, top, hz] });
  for (let i = 0; i < 4; i++) pen(box(1.02, 0.06, 0.72, 0), 0, { at: [hx, top + 0.03 + i * 0.11, hz] });
  pen(gable(0.86, 0.2, 1.16), 0.03, { at: [hx, top + 0.46, hz], rot: [0, Math.PI / 2, 0] });
  pen(box(0.18, 0.3, 0.02, 0), RECESS - 0.06, { at: [hx + 0.2, top, hz + 0.36] });
  pen(box(0.13, 0.14, 0.02, 0), RECESS - 0.06, { at: [hx - 0.22, top + 0.16, hz + 0.36] });
  // Jetty of six planks into the lake.
  for (let i = 0; i < 6; i++) pen(box(0.12, 0.03, 0.42, 0), i % 2 ? 0.04 : 0.01, { at: [-0.24 + i * 0.15, top + 0.01, 0.15] });
  for (const x of [0.2, 0.58]) for (const z of [-0.04, 0.34]) pen(cyl(0.025, 0.025, 0.1, 4), RECESS, { at: [x, 0.06, z] });
  // Eight round trees and three pines, clustered like the SE sculpt.
  for (const [x, z, sz] of [
    [-2.0, 2.0, 1.25],
    [-1.4, 1.9, 1.0],
    [-1.8, 1.3, 1.1],
    [-0.9, 1.5, 0.9],
    [-2.0, -1.6, 1.1],
    [-0.7, -1.95, 1.0],
    [2.0, 2.0, 1.15],
    [-0.1, 2.05, 0.95],
  ] as const)
    plasticTree(pen, x, z, sz * 1.15, top);
  for (const [x, z, sz] of [
    [-2.05, -0.5, 1.3],
    [1.95, -1.4, 1.2],
    [-1.6, -2.05, 1.0],
  ] as const)
    plasticPine(pen, x, z, sz * 1.2, top);
  // Embossed ∞ in the back corner.
  embossInto(s, '∞', `#${shade(PLASTIC.rural, 0.14).getHexString()}`, { at: [1.2, top, -1.95], rot: [-Math.PI / 2, 0, 0], h: 0.6, stroke: 0.09, depth: 0.05 });
  return s;
}

export function buildRural(ctx: MiniCtx): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 5.8, 5.8, true, BLOB);
  solid(ctx, g, miniGeo('rural:se', ruralShape));
  const badge = makeBadge('Rural', { bg: COLORS.surface, ring: `#${shade(PLASTIC.rural, -0.4).getHexString()}`, pill: true }, BADGE_SIZE.rural);
  badge.position.set(0, RURAL_BADGE_Y, 0);
  badge.name = 'badge';
  badge.userData.minPx = BADGE_MIN_PX;
  badge.userData.obstacle = true;
  g.add(badge);
  g.userData.stackY = 2.6;
  return g;
}
