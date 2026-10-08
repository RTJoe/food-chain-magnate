/**
 * Marketing campaign minis: the Special Edition sculpts (docs/art-bible.md §6.6–6.9) with a hobby
 * paint job: billboard (sized to its footprint), mailbox, radio tower, airplane on its wavy banner
 * stand, giant billboard (rural), gourmet guide. The family marks stay: every piece stands on a
 * numbered light-blue plate and carries the cyan sign face with the advertised good's token glyph.
 * Owner and duration read from the camera-facing marker and the stack of duration tokens.
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { BADGE_MIN_PX, badgeSprite, campaignBadgeTexture, drawFood } from '../labels.js';
import { embossInstanced, plasticPen, type Pen } from './buildings.js';
import { blob, face, mesh, owned, solid, type MiniCtx } from './ctx.js';
import { tokenShape } from './tokens.js';
import { P, Shape, ball, box, cone, cyl, extrude, lathe, miniGeo, playerPalette, puck, shade, torus, type MatKind, type Paint } from './kit.js';
import { PAINT } from './paint.js';

export interface CampaignVisual {
  color: string;
  goods: FoodId[];
  number: number;
  remaining: number;
  eternal: boolean;
}

/** SE marketing plastic and the printed sign-face cyan (art bible §2). */
export const MARKETING_PLASTIC = '#9cc3d6';
export const SIGN_CYAN = '#2deedd';
const MKT = MARKETING_PLASTIC;
const PLATE_H = 0.06;
const RECESS = -0.1;
const css = (c: THREE.Color) => `#${c.getHexString()}`;
/** Embossed plate numbers: a shade lighter than the plastic so they catch the light. */
const NUMBER_PAINT = css(shade(MKT, 0.4));

type V3 = [number, number, number];

// Local paints (the shared detail paints come from PAINT).
/** Billboard steelwork: dark green enamel. */
const STEEL_GREEN = '#3e5b4b';
/** Aviation red-orange of the radio mast bands and the beacon. */
const MAST_RED = '#c9452f';
/** Light-aircraft livery: cream body, red trim. */
const PLANE_CREAM = '#ede6d3';
const LIVERY_RED = '#c43a2e';
const ROPE = '#c8b18a';
const LEATHER = '#8a2c2a';
const GILT = '#e6b83e';

/** Painted part pen: matte hobby paint in `base`; `tint` > 0 lightens, < 0 darkens (baked AO). */
function paintPen(s: Shape, base: Paint, mat: MatKind = 'body', jitter = 0.03): Pen {
  return (geo, tint = 0, o = {}) => s.add(geo, tint ? shade(base, tint) : base, { jitter, mat, ...o });
}

// ---------------------------------------------------------------------------
// Shared parts: lattice rods, the numbered plate, the cyan sign decal
// ---------------------------------------------------------------------------

let rodGeo: THREE.BufferGeometry | null = null;
/** Unit open triangular rod (6 triangles), bottom at y = 0, 1 long, radius 1. */
function unitRod(): THREE.BufferGeometry {
  return (rodGeo ??= new THREE.CylinderGeometry(1, 1, 1, 3, 1, true).translate(0, 0.5, 0));
}

/** A lattice rod of radius `r` from `a` to `b`. */
function rod(pen: Pen, a: V3, b: V3, r: number, tint = 0): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  pen(unitRod(), tint, { at: a, rot: [Math.acos(dy / len), Math.atan2(dx, dz), 0], scale: [r, len, r] });
}

function markShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(1, 0);
  s.lineTo(-0.6, 0.85);
  s.lineTo(-0.6, -0.85);
  s.closePath();
  return s;
}

/** The SE campaign plate: fills the footprint, two embossed placement arrowheads on the front. */
function plateShape(pen: Pen, w: number, d: number): void {
  pen(box(w - 0.15, PLATE_H, d - 0.15, 0.02), -0.03, { jitter: 0 });
  for (const sx of [-1, 1])
    pen(extrude('mkMark', markShape, 0.016, 0), 0.1, {
      at: [sx * (w / 2 - 0.2), PLATE_H, -d / 2 + 0.2],
      rot: [-Math.PI / 2, sx > 0 ? Math.PI : 0, 0],
      scale: 0.06,
      jitter: 0,
    });
}

function plateGeo(w: number, d: number): THREE.BufferGeometry {
  return miniGeo(`mk:plate:${w}:${d}`, () => {
    const s = new Shape();
    plateShape(plasticPen(s, MKT), w, d);
    return s;
  });
}

/** Campaign number embossed flat on the plate's front-left corner (reads from the south). */
function plateNumber(ctx: MiniCtx, parent: THREE.Object3D, n: number, w: number, d: number): void {
  if (n <= 0) return;
  const text = String(n);
  const h = 0.2;
  embossInstanced(ctx, parent, text, NUMBER_PAINT, { at: [-w / 2 + 0.16 + text.length * 0.07, PLATE_H, d / 2 - 0.2], rot: [-Math.PI / 2, 0, 0], h, depth: 0.014 });
}

const texCache = new Map<string, THREE.Texture>();
/** Cached canvas texture, repainted once web fonts land. */
export function decalTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture {
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
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  (document as Document & { fonts?: FontFaceSet }).fonts?.ready?.then(() => {
    paint();
    tex.needsUpdate = true;
  });
  return tex;
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Cyan sign face (base p.20 print): a cyan panel with a darker rim and the advertised goods as
 * token glyphs, each on a cream token disc so the good reads at phone size.
 */
export function signFaceTexture(goods: FoodId[], aspect: number): THREE.Texture {
  const H = 128;
  const W = Math.round(Math.min(6, Math.max(1, aspect)) * H);
  return decalTexture(`mkSign:${goods.join('+')}:${W}`, W, H, (c) => {
    c.fillStyle = css(shade(SIGN_CYAN, -0.42));
    c.fillRect(0, 0, W, H);
    c.fillStyle = SIGN_CYAN;
    roundRect(c, 7, 7, W - 14, H - 14, 10);
    c.fill();
    // Faint print stripes (the Deluxe billboard art has a halftone band top and bottom).
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(7, 18, W - 14, 6);
    c.fillRect(7, H - 24, W - 14, 6);
    const n = Math.max(1, goods.length);
    const step = Math.min(H - 20, (W - 30) / n);
    goods.forEach((g, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * step;
      c.fillStyle = 'rgba(16,64,60,0.35)';
      c.beginPath();
      c.arc(x + 3, H / 2 + 4, step * 0.42, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fbf6e6';
      c.beginPath();
      c.arc(x, H / 2, step * 0.42, 0, Math.PI * 2);
      c.fill();
      drawFood(c, g, x, H / 2 + 2, step * 0.66);
    });
  });
}

const decalMats = new Map<string, THREE.Material>();
function decalMat(tex: THREE.Texture): THREE.Material {
  let m = decalMats.get(tex.uuid);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    decalMats.set(tex.uuid, m);
  }
  return m;
}

/**
 * Camera-facing marker (advertised good + campaign number, never smaller on screen than a house
 * badge; "N ∞" for eternal campaigns) + duration pips.
 */
export function addCampaignMarker(ctx: MiniCtx, parent: THREE.Object3D, v: CampaignVisual, top: number, pipAnchor: [number, number]): void {
  const pal = playerPalette(v.color);
  const badge = badgeSprite(campaignBadgeTexture(v.number, v.goods, pal.base, pal.dark, v.eternal), 0.44);
  badge.position.set(0, top, 0);
  badge.name = 'badge';
  badge.userData.minPx = BADGE_MIN_PX;
  badge.userData.obstacle = true;
  parent.add(badge);
  const pips = new THREE.Group();
  pips.name = 'pips';
  pips.position.set(pipAnchor[0], 0.06, pipAnchor[1]);
  parent.add(pips);
  // Remaining duration as a stack of the advertised good's tokens (as on the SE plates); eternal
  // campaigns show ∞ in the marker instead.
  if (!v.eternal) {
    const geo = durationTokenGeo(v.goods[0] ?? 'burger');
    for (let i = 0; i < Math.min(v.remaining, 6); i++) {
      const o = new THREE.Group();
      o.position.set(0, i * PIP_STEP, 0);
      pips.add(o);
      solid(ctx, o, geo, { castShadow: false });
    }
  }
}

/** Height of one duration pip in the stack. */
export const PIP_STEP = 0.055;

/** One duration token: the good's wooden token, a little under `PIP_STEP` thick (minis/tokens.ts). */
export function durationTokenGeo(good: FoodId): THREE.BufferGeometry {
  return miniGeo(`durTok:${good}`, () => new Shape().addShape(tokenShape(good, PIP_STEP - 0.004), { scale: [0.62, 1, 0.62] }));
}

/** Duration pip (owner-colour puck with a white centre); shared, cached geometry. */
export function pipGeo(color: string): THREE.BufferGeometry {
  return miniGeo(`pip:${color}`, () => {
    const pal = playerPalette(color);
    const s = new Shape();
    s.add(puck(0.09, 0.05, 10, 0.015), pal.base, { jitter: 0 });
    s.add(puck(0.05, 0.052, 10, 0.01), P.white, { jitter: 0 });
    return s;
  });
}

// ---------------------------------------------------------------------------
// Billboard (and the giant rural billboard)
// ---------------------------------------------------------------------------

interface SignSpec {
  /** Face width / height, bottom edge height, panel centre z. */
  pw: number;
  ph: number;
  y0: number;
  zp: number;
}

function signSpec(long: number, short: number, giant: boolean): SignSpec {
  // Deeper (2-square) billboards get a taller face so it keeps its proportion to the plate.
  const ph = giant ? 1.0 : 0.5 + 0.22 * (short - 1);
  const top = giant ? 1.7 : 1.1 + 0.22 * (short - 1);
  const brace = giant ? 0.34 : 0.28;
  return { pw: long - (giant ? 0.3 : 0.24), ph, y0: top - ph, zp: -short / 2 + 0.075 + brace + 0.07 };
}

/**
 * Sign panel along the plate's back edge on a lattice of A-frame struts, a catwalk ledge under the
 * face; the plate in front stays clear for the number and the duration pips.
 */
function billboardShape(long: number, short: number, giant: boolean): Shape {
  const s = new Shape();
  plateShape(plasticPen(s, MKT), long, short);
  const { pw, ph, y0, zp } = signSpec(long, short, giant);
  const brace = giant ? 0.34 : 0.28;
  // Town billboards stand on green-enamelled steel; the rural giant on weathered timber.
  const post = paintPen(s, giant ? PAINT.wood : STEEL_GREEN);
  const tie = paintPen(s, giant ? PAINT.woodDark : shade(STEEL_GREEN, -0.18));
  const frame = paintPen(s, PAINT.trimWhite);
  const grey = paintPen(s, PAINT.metal);
  // White-painted panel frame (the face decal sits on its front) with a dark cap rail.
  frame(box(pw + 0.08, ph + 0.08, 0.05, 0.015), 0, { at: [0, y0 - 0.04, zp] });
  post(box(pw + 0.12, 0.03, 0.08, 0), 0, { at: [0, y0 + ph + 0.04, zp] });
  // Lattice: posts behind the panel, a back brace on each, zig-zag ties between posts.
  const n = giant ? 7 : Math.max(3, Math.round(long) * 2 + 1);
  const zb = zp - 0.05;
  const xs = Array.from({ length: n }, (_, i) => -pw / 2 + 0.06 + (i * (pw - 0.12)) / (n - 1));
  xs.forEach((x, i) => {
    rod(post, [x, PLATE_H, zb], [x, y0 + ph * 0.85, zb], 0.024);
    rod(tie, [x, PLATE_H, zb - brace], [x, y0 + ph * 0.55, zb], 0.02);
    const nx = xs[i + 1];
    if (nx !== undefined) rod(tie, i % 2 ? [x, PLATE_H + 0.02, zb] : [x, y0 - 0.02, zb], i % 2 ? [nx, y0 - 0.02, zb] : [nx, PLATE_H + 0.02, zb], 0.014);
  });
  rod(post, [-pw / 2 + 0.04, y0 * 0.5, zb - 0.005], [pw / 2 - 0.04, y0 * 0.5, zb - 0.005], 0.016);
  // Grey steel catwalk ledge under the face, with a toe rail.
  grey(box(pw, 0.025, 0.13, 0), 0.04, { at: [0, y0 - 0.1, zp + 0.08] });
  grey(box(pw, 0.03, 0.015, 0), -0.08, { at: [0, y0 - 0.075, zp + 0.14] });
  // Gooseneck lamps over the top edge, shades tipped back at the poster.
  const nl = giant ? 3 : Math.max(2, Math.round(long));
  for (let i = 0; i < nl; i++) {
    const x = -pw / 2 + (pw * (i + 0.5)) / nl;
    rod(post, [x, y0 + ph + 0.05, zp], [x, y0 + ph + 0.1, zp + 0.13], 0.01);
    post(cone(0.05, 0.035, 6), 0.1, { at: [x, y0 + ph + 0.06, zp + 0.14], rot: [0.6, 0, 0] });
  }
  return s;
}

/** Sign face decal on the panel front, repeated on the back for orbiting cameras. */
function signFace(ctx: MiniCtx, parent: THREE.Object3D, goods: FoodId[], sp: SignSpec): void {
  const tex = signFaceTexture(goods, sp.pw / sp.ph);
  for (const side of [1, -1]) {
    const f = face(ctx, parent, tex, sp.pw, sp.ph);
    f.position.set(0, sp.y0 + sp.ph / 2, sp.zp + side * 0.026);
    if (side < 0) f.rotation.y = Math.PI;
  }
}

export function buildBillboard(ctx: MiniCtx, v: CampaignVisual & { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  const vertical = v.h > v.w;
  const long = Math.max(v.w, v.h);
  const short = Math.min(v.w, v.h);
  const body = new THREE.Group();
  body.rotation.y = vertical ? Math.PI / 2 : 0;
  g.add(body);
  blob(ctx, body, long * 0.95, short * 0.9, true, 0.5);
  solid(ctx, body, miniGeo(`mk:billboard:${long}:${short}`, () => billboardShape(long, short, false)));
  const sp = signSpec(long, short, false);
  signFace(ctx, body, v.goods, sp);
  plateNumber(ctx, body, v.number, long, short);
  addCampaignMarker(ctx, body, v, sp.y0 + sp.ph + 0.38, [long / 2 - 0.24, short / 2 - 0.22]);
  return g;
}

export function buildGiantBillboard(ctx: MiniCtx, v: CampaignVisual): THREE.Group {
  const g = new THREE.Group();
  const L = 3.6;
  const D = 0.9;
  blob(ctx, g, L, D, true, 0.5);
  solid(ctx, g, miniGeo(`mk:giant:${L}`, () => billboardShape(L, D, true)));
  const sp = signSpec(L, D, true);
  signFace(ctx, g, v.goods, sp);
  plateNumber(ctx, g, v.number, L, D);
  addCampaignMarker(ctx, g, v, sp.y0 + sp.ph + 0.42, [L / 2 - 0.26, D / 2 - 0.2]);
  return g;
}

// ---------------------------------------------------------------------------
// Mailbox
// ---------------------------------------------------------------------------

/** Mailbox body height range on its post (the side decals sit on the box walls). */
const MAILBOX = { y: 0.69, h: 0.17, half: 0.14, len: 0.42 };

/** US rural mailbox on a post, door open 30°, letters sticking out, flag up (base p.31). */
export function mailboxShape(): Shape {
  const s = new Shape();
  const { y, h, half, len } = MAILBOX;
  const wood = paintPen(s, PAINT.wood);
  const tin = paintPen(s, PAINT.chrome, 'metal', 0.02);
  const dark = paintPen(s, PAINT.trimDark, 'body', 0);
  const red = paintPen(s, PAINT.neonRed);
  // Wooden post with a foot and a plank under the box.
  wood(box(0.16, 0.04, 0.16, 0.01), -0.2, { at: [0, PLATE_H, 0] });
  wood(box(0.08, y - PLATE_H - 0.03, 0.08, 0), 0, { at: [0, PLATE_H, 0] });
  wood(box(0.22, 0.03, len - 0.04, 0), -0.12, { at: [0, y - 0.03, 0] });
  // Galvanised body: straight walls and a half-round roof along z; the dark open mouth at +z.
  tin(box(half * 2, h, len, 0.015), 0, { at: [0, y, 0] });
  tin(cyl(half, half, len, 8), 0.08, { at: [0, y + h, -len / 2], rot: [Math.PI / 2, 0, 0] });
  dark(box(half * 2 - 0.04, h - 0.02, 0.01, 0), 0, { at: [0, y + 0.01, len / 2 + 0.001] });
  dark(cyl(half - 0.02, half - 0.02, 0.01, 8), 0, { at: [0, y + h, len / 2 - 0.008], rot: [Math.PI / 2, 0, 0] });
  // Letters sticking out of the mouth: white, cream and an airmail blue.
  const letters = [PAINT.trimWhite, PAINT.signCream, '#cfdcea'];
  letters.forEach((c, i) =>
    s.add(box(0.17 - i * 0.02, 0.012, 0.16, 0), c, { at: [-0.02 + i * 0.02, y + 0.05 + i * 0.045, len / 2 - 0.02], rot: [0.12 - i * 0.1, 0.1 * (i - 1), 0], jitter: 0 }),
  );
  // Door, hinged at the bottom of the mouth and dropped open 30°.
  const door = new Shape();
  const dp = paintPen(door, PAINT.chrome, 'metal', 0.02);
  dp(box(half * 2, h, 0.02, 0.006), 0.04, { at: [0, 0, 0] });
  dp(cyl(half, half, 0.02, 8), 0.04, { at: [0, h, -0.01], rot: [Math.PI / 2, 0, 0] });
  paintPen(door, PAINT.metalDark)(box(0.08, 0.025, 0.03, 0.006), 0, { at: [0, h + half - 0.06, 0.02] });
  s.addShape(door, { at: [0, y, len / 2 + 0.012], rot: [Math.PI / 6, 0, 0] });
  // Red flag up on the side.
  red(box(0.025, 0.3, 0.025, 0), -0.15, { at: [half + 0.015, y - 0.02, -len / 2 + 0.08] });
  red(box(0.02, 0.08, 0.15, 0.006), 0, { at: [half + 0.02, y + 0.2, -len / 2 + 0.145] });
  return s;
}

export function buildMailbox(ctx: MiniCtx, v: CampaignVisual & { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, v.w * 0.92, v.h * 0.92, true, 0.5);
  solid(ctx, g, plateGeo(v.w, v.h));
  plateNumber(ctx, g, v.number, v.w, v.h);
  // Long axis east-west, slightly turned, so one side decal faces the default camera.
  const k = Math.min(v.w, v.h) > 1 ? 1.4 : 1;
  const mb = new THREE.Group();
  mb.rotation.y = -Math.PI / 2 + 0.3;
  mb.position.z = -0.06 * k;
  mb.scale.setScalar(k);
  g.add(mb);
  solid(ctx, mb, miniGeo('mk:mailbox', mailboxShape));
  // Cyan sign decal on both walls.
  const tex = signFaceTexture(v.goods, 1.8);
  for (const side of [1, -1]) {
    const f = face(ctx, mb, tex, MAILBOX.len - 0.1, MAILBOX.h - 0.03);
    f.position.set(side * (MAILBOX.half + 0.002), MAILBOX.y + MAILBOX.h / 2, -0.02);
    f.rotation.y = (side * Math.PI) / 2;
  }
  addCampaignMarker(ctx, g, v, 1.0 * k + 0.32, [v.w / 2 - 0.22, v.h / 2 - 0.2]);
  return g;
}

// ---------------------------------------------------------------------------
// Radio tower
// ---------------------------------------------------------------------------

/** Peak opacity of the radio pulse rings (art bible §6.9: cyan at 35 %). */
const RING_OPACITY = 0.35;

/** Radio mast centre on its 1x1 plate (the hut sits back-left). */
export const MX = 0.14;
export const MZ = -0.1;
/** Mast: 4 legs tapering 0.5 → 0.12 across over 1.9 (art bible §6.9). */
const MAST = { h: 1.9, r0: 0.25, r1: 0.06, levels: 7 };
export const MAST_TOP = PLATE_H + MAST.h;

function mastCorner(y: number, i: number): V3 {
  const k = (y - PLATE_H) / MAST.h;
  const r = MAST.r0 + (MAST.r1 - MAST.r0) * k;
  return [MX + (i === 0 || i === 3 ? -r : r), y, MZ + (i < 2 ? -r : r)];
}

/**
 * Steel lattice mast banded aviation red and white (one band per brace level, red at both ends),
 * a red beacon, a painted transmitter hut and a sign board.
 */
export function radioShape(): Shape {
  const s = new Shape();
  const { h, levels } = MAST;
  const red = paintPen(s, MAST_RED);
  const white = paintPen(s, PAINT.trimWhite);
  for (let k = 0; k < levels; k++) {
    const band = k % 2 ? white : red;
    const ya = PLATE_H + (h * k) / levels;
    const yb = PLATE_H + (h * (k + 1)) / levels;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      rod(band, mastCorner(ya, i), mastCorner(yb, i), 0.026);
      if (k % 2) rod(band, mastCorner(ya, i), mastCorner(yb, j), 0.013, RECESS);
      else rod(band, mastCorner(ya, j), mastCorner(yb, i), 0.013, RECESS);
      if (k % 2 || k === levels - 1) rod(band, mastCorner(yb, i), mastCorner(yb, j), 0.016);
    }
  }
  rod(paintPen(s, PAINT.metalDark), [MX, MAST_TOP - 0.03, MZ], [MX, MAST_TOP + 0.14, MZ], 0.022);
  s.add(ball(0.1, 0), PAINT.neonRed, { at: [MX, MAST_TOP + 0.22, MZ], mat: 'glow', jitter: 0 });
  // Transmitter hut, back-left: cream walls, slate roof, green door, a small window.
  paintPen(s, PAINT.wallCream)(box(0.27, 0.22, 0.25, 0), 0, { at: [-0.26, PLATE_H, -0.26] });
  paintPen(s, PAINT.roofSlate)(box(0.33, 0.04, 0.31, 0), 0, { at: [-0.26, PLATE_H + 0.22, -0.26] });
  paintPen(s, PAINT.doorGreen)(box(0.08, 0.15, 0.01, 0), 0, { at: [-0.33, PLATE_H, -0.134] });
  s.add(box(0.07, 0.06, 0.01, 0), PAINT.glassDark, { at: [-0.2, PLATE_H + 0.09, -0.134], mat: 'glass', jitter: 0 });
  // White sign board hung on the mast front (decal in buildRadio).
  const [, , zf] = mastCorner(0.68, 2);
  paintPen(s, PAINT.trimWhite)(box(0.28, 0.24, 0.03, 0.008), 0, { at: [MX, 0.56, zf + 0.02] });
  return s;
}

export function buildRadio(ctx: MiniCtx, v: CampaignVisual & { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, v.w * 0.92, v.h * 0.92, true, 0.5);
  solid(ctx, g, plateGeo(v.w, v.h));
  plateNumber(ctx, g, v.number, v.w, v.h);
  solid(ctx, g, miniGeo('mk:radio', radioShape));
  const [, , zf] = mastCorner(0.68, 2);
  const f = face(ctx, g, signFaceTexture(v.goods, 1.1), 0.24, 0.2);
  f.position.set(MX, 0.68, zf + 0.036);
  // Pulse rings (animated by the scene's ambient loop): cyan, faint.
  const rings = new THREE.Group();
  rings.name = 'radioRings';
  rings.position.set(MX, MAST_TOP + 0.22, MZ);
  g.add(rings);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      torus(0.3, 0.025, 20),
      ctx.ghost ?? owned(new THREE.MeshBasicMaterial({ color: SIGN_CYAN, transparent: true, opacity: RING_OPACITY, depthWrite: false, toneMapped: false })),
    );
    m.userData.phase = i / 3;
    rings.add(m);
  }
  g.userData.ambient = 'radio';
  addCampaignMarker(ctx, g, v, MAST_TOP + 0.62, [v.w / 2 - 0.2, v.h / 2 - 0.2]);
  return g;
}

// ---------------------------------------------------------------------------
// Airplane on its wavy banner stand
// ---------------------------------------------------------------------------

interface Banner {
  /** Ribbon centreline from the plane's tail (u = 0, high) to its foot on the plate (u = 1). */
  x0: number;
  x1: number;
  zc: number;
  amp: number;
  periods: number;
  /** Bottom edge height at u = 0, ribbon height, half thickness. */
  y0: number;
  bh: number;
  t: number;
  seg: number;
}

/** Plane scale on its plate (1-square planes get a smaller plane). */
const planeScale = (width: number) => (width >= 3 ? 1 : 0.62);

function bannerSpec(width: number): Banner {
  const k = planeScale(width);
  const tail = width / 2 - 0.3 - 0.47 * k;
  return {
    x0: tail,
    x1: -width / 2 + 0.16,
    zc: -0.12,
    amp: width >= 3 ? 0.11 : 0.07,
    periods: width >= 3 ? 2 : 1,
    y0: 0.95 * k + 0.08,
    bh: 0.4 * k,
    t: 0.018,
    seg: width >= 3 ? 20 : 12,
  };
}

/** Point on the ribbon surface: u along, v across (0 bottom … 1 top), side offset along the normal. */
function bannerPoint(b: Banner, u: number, v: number, off: number): V3 {
  const x = b.x0 + (b.x1 - b.x0) * u;
  const w = 2 * Math.PI * b.periods;
  const z = b.zc + b.amp * Math.sin(w * u);
  // Tangent in plan (dx, dz) → horizontal normal (-dz, dx).
  const dx = b.x1 - b.x0;
  const dz = b.amp * w * Math.cos(w * u);
  const l = Math.hypot(dx, dz);
  const nx = -dz / l;
  const nz = dx / l;
  const yb = PLATE_H + (b.y0 - PLATE_H) * Math.pow(1 - u, 1.6);
  // dx < 0 (the ribbon runs to -x), so flip the normal to face +z (the camera side).
  const sgn = nz < 0 ? -1 : 1;
  return [x + nx * off * sgn, yb + b.bh * v, z + nz * off * sgn];
}

/** Solid wavy ribbon: front, back, top and bottom strips plus end caps. */
function bannerGeo(b: Banner): THREE.BufferGeometry {
  const pos: number[] = [];
  const tri = (a: V3, c: V3, d: V3) => pos.push(...a, ...d, ...c);
  const quad = (a: V3, c: V3, d: V3, e: V3) => {
    tri(a, c, d);
    tri(a, d, e);
  };
  for (let i = 0; i < b.seg; i++) {
    const u0 = i / b.seg;
    const u1 = (i + 1) / b.seg;
    const p = (u: number, v: number, o: number) => bannerPoint(b, u, v, o);
    quad(p(u0, 0, b.t), p(u1, 0, b.t), p(u1, 1, b.t), p(u0, 1, b.t));
    quad(p(u1, 0, -b.t), p(u0, 0, -b.t), p(u0, 1, -b.t), p(u1, 1, -b.t));
    quad(p(u0, 1, b.t), p(u1, 1, b.t), p(u1, 1, -b.t), p(u0, 1, -b.t));
    quad(p(u1, 0, b.t), p(u0, 0, b.t), p(u0, 0, -b.t), p(u1, 0, -b.t));
  }
  for (const [u, s] of [
    [0, 1],
    [1, -1],
  ] as const) {
    const p = (v: number, o: number) => bannerPoint(b, u, v, o);
    if (s > 0) quad(p(0, -b.t), p(0, b.t), p(1, b.t), p(1, -b.t));
    else quad(p(0, b.t), p(0, -b.t), p(1, -b.t), p(1, b.t));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Decal strip on one face of the ribbon (u0…u1), with UVs; `side` +1 front, -1 back. */
function bannerDecalGeo(b: Banner, u0: number, u1: number, side: 1 | -1): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const n = Math.max(4, Math.round(b.seg * (u1 - u0)));
  const o = side * (b.t + 0.002);
  const vm = 0.1;
  for (let i = 0; i < n; i++) {
    const a = u0 + ((u1 - u0) * i) / n;
    const c = u0 + ((u1 - u0) * (i + 1)) / n;
    const sa = (a - u0) / (u1 - u0);
    const sc = (c - u0) / (u1 - u0);
    const [ta, tc] = side > 0 ? [sa, sc] : [1 - sa, 1 - sc];
    const P = [bannerPoint(b, a, vm, o), bannerPoint(b, c, vm, o), bannerPoint(b, c, 1 - vm, o), bannerPoint(b, a, 1 - vm, o)];
    const T = [
      [ta, 0],
      [tc, 0],
      [tc, 1],
      [ta, 1],
    ];
    const order = side > 0 ? [0, 2, 1, 0, 3, 2] : [1, 3, 0, 1, 2, 3];
    for (const k of order) {
      pos.push(...P[k]!);
      uv.push(...T[k]!);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const decalGeos = new Map<string, THREE.BufferGeometry>();

/** Stand: a post from the plate's far end up to the plane, and the wavy banner down to the plate. */
function standShape(width: number): Shape {
  const s = new Shape();
  const steel = paintPen(s, PAINT.metalDark);
  const b = bannerSpec(width);
  const k = planeScale(width);
  const px = width / 2 - 0.3;
  steel(box(0.14, 0.03, 0.14, 0.008), -0.1, { at: [px, PLATE_H, 0] });
  rod(steel, [px, PLATE_H, 0], [px, b.y0 + b.bh * 0.5 + 0.02 * k, 0], 0.035);
  // Tow rope from the tail to the ribbon's top end.
  const [bx, by, bz] = bannerPoint(b, 0, 0.6, 0);
  rod(paintPen(s, ROPE), [px - 0.4 * k, b.y0 + b.bh * 0.55, 0], [bx + 0.01, by, bz], 0.018);
  // Cream canvas banner.
  s.add(bannerGeo(b), PAINT.signCream, { jitter: 0 });
  return s;
}

/** Low-wing monoplane (nose at +x): cream body, red cowling, wing tips, fin and tail band, glazed canopy; the prop spins separately. */
function sePlaneShape(): Shape {
  const s = new Shape();
  const pen = paintPen(s, PLANE_CREAM);
  const trim = paintPen(s, LIVERY_RED);
  pen(
    lathe(
      [
        [0, -0.47],
        [0.06, -0.44],
        [0.1, -0.15],
        [0.13, 0.12],
        [0.125, 0.3],
        [0.1, 0.38],
        [0, 0.4],
      ],
      8,
    ),
    0,
    { rot: [0, 0, -Math.PI / 2] },
  );
  // Red cowling ring and a chrome spinner on the nose; a red band round the rear fuselage.
  trim(cyl(0.11, 0.11, 0.05, 8), 0, { at: [0.33, 0, 0], rot: [0, 0, -Math.PI / 2] });
  s.add(cone(0.045, 0.07, 6), PAINT.chrome, { at: [0.39, 0, 0], rot: [0, 0, -Math.PI / 2], mat: 'metal', jitter: 0 });
  trim(
    lathe(
      [
        [0.077, -0.36],
        [0.084, -0.3],
      ],
      8,
    ),
    0,
    { rot: [0, 0, -Math.PI / 2] },
  );
  // Low wing (span 1.0) with a slight dihedral and red tips; the pilot under a glazed canopy.
  for (const sz of [-1, 1]) {
    pen(box(0.28, 0.035, 0.5, 0), 0.04, { at: [0.08, -0.09, sz * 0.25], rot: [sz * -0.08, 0, 0] });
    trim(box(0.284, 0.039, 0.08, 0), 0, { at: [0.08, -0.092 + 0.21 * Math.sin(0.08), sz * (0.25 + 0.21 * Math.cos(0.08))], rot: [sz * -0.08, 0, 0] });
  }
  s.add(ball(0.08, 0), PAINT.glassDark, { at: [0.0, 0.12, 0], scale: [1.4, 1, 1], mat: 'glass', jitter: 0 });
  // Tail: cream tailplane, red fin.
  pen(box(0.15, 0.025, 0.42, 0), 0.04, { at: [-0.4, -0.005, 0] });
  trim(
    extrude('mkFin', () => {
      const f = new THREE.Shape();
      f.moveTo(0, 0);
      f.lineTo(0.18, 0);
      f.lineTo(0.04, 0.2);
      f.lineTo(-0.02, 0.2);
      f.closePath();
      return f;
    }, 0.02, 0),
    0,
    { at: [-0.47, 0.02, 0] },
  );
  return s;
}

/** Dark prop with yellow warning tips. */
function seProp(): Shape {
  const s = new Shape();
  s.add(box(0.02, 0.34, 0.045, 0.006), PAINT.trimDark, { at: [0, -0.17, 0], jitter: 0 });
  for (const y of [-0.172, 0.13]) s.add(box(0.022, 0.042, 0.047, 0), PAINT.flowerYellow, { at: [0, y, 0], jitter: 0 });
  return s;
}

export function buildAirplane(ctx: MiniCtx, v: CampaignVisual & { width: number }): THREE.Group {
  const g = new THREE.Group();
  const W = v.width;
  const D = 0.9;
  // The numbered plate (revealed with the plane by the placement choreography).
  const strip = new THREE.Group();
  strip.name = 'strip';
  g.add(strip);
  blob(ctx, strip, W * 0.95, D * 0.9, true, 0.5);
  solid(ctx, strip, plateGeo(W, D));
  plateNumber(ctx, strip, v.number, W, D);
  // Stand, banner and plane fly in together; only the plane bobs.
  const fly = new THREE.Group();
  fly.name = 'fly';
  g.add(fly);
  g.userData.ambient = 'plane';
  solid(ctx, fly, miniGeo(`mk:stand:${W}`, () => standShape(W)));
  const b = bannerSpec(W);
  const [ua, ub] = W >= 3 ? [0.3, 0.72] : [0.2, 0.85];
  let len = 0;
  for (let i = 0; i < 12; i++) {
    const p = bannerPoint(b, ua + ((ub - ua) * i) / 12, 0.5, 0);
    const q = bannerPoint(b, ua + ((ub - ua) * (i + 1)) / 12, 0.5, 0);
    len += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  }
  const tex = signFaceTexture(v.goods, len / (b.bh * 0.8));
  for (const side of [1, -1] as const) {
    const key = `${W}:${side}`;
    let geo = decalGeos.get(key);
    if (!geo) decalGeos.set(key, (geo = bannerDecalGeo(b, ua, ub, side)));
    const m = new THREE.Mesh(geo, ctx.ghost ?? decalMat(tex));
    m.name = side > 0 ? 'banner' : 'bannerBack';
    fly.add(m);
  }
  const k = planeScale(W);
  const plane = new THREE.Group();
  plane.name = 'plane';
  plane.position.set(W / 2 - 0.3, b.y0 + b.bh * 0.55, 0);
  plane.userData.y = plane.position.y;
  plane.scale.setScalar(k);
  fly.add(plane);
  solid(ctx, plane, miniGeo('mk:plane', sePlaneShape));
  const prop = mesh(ctx, plane, miniGeo('mk:prop', seProp), false);
  prop.position.set(0.42, 0, 0);
  prop.name = 'prop';
  // Leaflet spawn point under the fuselage (airplane sweep, animation-plan §2.9).
  const leaflet = new THREE.Object3D();
  leaflet.name = 'leaflet';
  leaflet.position.set(0, -0.15, 0);
  plane.add(leaflet);
  addCampaignMarker(ctx, g, v, b.y0 + b.bh + 0.62, [W / 2 - 0.22, D / 2 - 0.2]);
  return g;
}

/** Bob the plane on its stand and spin the prop (called per frame for planes). */
export function animatePlane(g: THREE.Object3D, t: number): void {
  const plane = g.getObjectByName('plane');
  if (plane) {
    plane.position.y = (plane.userData.y as number) + Math.sin(t * 1.3 + g.id) * 0.025;
    plane.rotation.x = Math.sin(t * 0.9 + g.id) * 0.05;
  }
  const prop = g.getObjectByName('prop');
  if (prop) prop.rotation.x = t * 30;
}

export function animateRadio(g: THREE.Object3D, t: number): void {
  const rings = g.getObjectByName('radioRings');
  if (!rings) return;
  for (const r of rings.children) {
    const ph = ((t * 0.6 + (r.userData.phase as number)) % 1 + 1) % 1;
    r.scale.setScalar(0.3 + ph * 1.6);
    const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial;
    if (m.transparent) m.opacity = RING_OPACITY * (1 - ph);
  }
}

// ---------------------------------------------------------------------------
// Gourmet guide (Ketchup, off-board)
// ---------------------------------------------------------------------------

/** Lectern tilt and book page centre (the decal sits on the pages). */
const BOOK = { tilt: 0.55, y: 0.6, z: 0.02 };

function guideShape(): Shape {
  const s = new Shape();
  plateShape(plasticPen(s, MKT), 1.1, 0.85);
  const wood = paintPen(s, PAINT.wood);
  const gilt = paintPen(s, GILT);
  // Wooden lectern.
  wood(box(0.16, 0.04, 0.16, 0.01), -0.2, { at: [0, PLATE_H, -0.05] });
  wood(cyl(0.045, 0.06, 0.5, 6), 0, { at: [0, PLATE_H, -0.05] });
  wood(box(0.5, 0.05, 0.36, 0.015), -0.15, { at: [0, BOOK.y - 0.07, BOOK.z], rot: [BOOK.tilt, 0, 0] });
  // Open book: red leather cover, two cream pages bowed into a V, a gold ribbon.
  paintPen(s, LEATHER)(box(0.6, 0.03, 0.42, 0.01), 0, { at: [0, BOOK.y - 0.03, BOOK.z], rot: [BOOK.tilt, 0, 0] });
  for (const sx of [-1, 1]) paintPen(s, PAINT.signCream)(box(0.27, 0.03, 0.38, 0.006), 0, { at: [sx * 0.145, BOOK.y, BOOK.z], rot: [BOOK.tilt, 0, 0] });
  gilt(box(0.03, 0.01, 0.2, 0), 0, { at: [0.02, BOOK.y + 0.02, BOOK.z + 0.24], rot: [1.0, 0, 0] });
  // Three gilt stars on a dark wood arch behind the book.
  const arch = paintPen(s, PAINT.woodDark);
  rod(arch, [-0.3, PLATE_H, -0.3], [-0.3, 0.98, -0.3], 0.02);
  rod(arch, [0.3, PLATE_H, -0.3], [0.3, 0.98, -0.3], 0.02);
  arch(box(0.66, 0.05, 0.04, 0.01), 0, { at: [0, 0.96, -0.3] });
  for (let i = 0; i < 3; i++) gilt(extrude('star', guideStar, 0.04, 0), 0.05, { at: [-0.2 + i * 0.2, 1.1 + (i === 1 ? 0.05 : 0), -0.3], scale: 0.08 });
  return s;
}

function guideStar(): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  sh.closePath();
  return sh;
}

export function buildGourmetGuide(ctx: MiniCtx, v: CampaignVisual): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 1.1, 0.85, true, 0.5);
  solid(ctx, g, miniGeo('mk:guide', guideShape));
  plateNumber(ctx, g, v.number, 1.1, 0.85);
  const f = face(ctx, g, signFaceTexture(v.goods, 1.5), 0.48, 0.32);
  f.position.set(0, BOOK.y + 0.033 * Math.cos(BOOK.tilt), BOOK.z + 0.033 * Math.sin(BOOK.tilt));
  f.rotation.set(-(Math.PI / 2 - BOOK.tilt), 0, 0);
  addCampaignMarker(ctx, g, v, 1.72, [0.36, 0.22]);
  return g;
}
