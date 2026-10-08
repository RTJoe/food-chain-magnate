/**
 * Canvas-drawn textures: number badges (sprites), the wooden goods-token glyphs, chain marks,
 * demand plaques and billboard posters (docs/art-bible.md §3, §4 "Board HUD", §6.12, §7). Original
 * flat drawings in the UI style: chrome rims, cream faces, Barlow Condensed numerals. Cached by
 * content so each texture is created once.
 *
 * The goods glyphs come from the shared set (goodsGlyphs.ts, also the UI icons): `glyphSubpaths`
 * replays their SVG paths here (plaques, chips, posters) and into the 3D wooden tokens (minis/tokens.ts).
 */
import * as THREE from 'three';
import type { ChainId, FoodId } from '@fcm/engine';
import { GLYPH_EDGE, GOOD_GLYPHS } from '../goodsGlyphs.js';
import { COLORS, playerColorFor } from '../theme.js';

/** Minimum on-screen size of house labels and plaques (css px per world unit; see Stage.sized). */
export const LABEL_MIN_PX = 58;
/** Minimum on-screen size of house number badges (smaller than plaques, so they stay secondary). */
export const BADGE_MIN_PX = 40;

/** Numerals and caps: Barlow Condensed 700 (self-hosted, styles/fonts.css), as in the UI. */
const FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';
const FONT_PROBE = `700 48px ${FONT}`;
const INK = '#2b2a33';
const CREAM = COLORS.surface;
const texCache = new Map<string, THREE.Texture>();

// Barlow Condensed loads lazily (font-display: swap, only when something uses it). Ask for it up
// front and redraw any texture drawn before it arrived.
const fonts = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
let fontReady = !fonts || typeof fonts.check !== 'function' || safeCheck();
const redraws: (() => void)[] = [];
function safeCheck(): boolean {
  try {
    return fonts!.check(FONT_PROBE);
  } catch {
    return true;
  }
}
if (!fontReady)
  void fonts!
    .load(FONT_PROBE)
    .catch(() => undefined)
    .then(() => {
      fontReady = true;
      for (const r of redraws.splice(0)) r();
    });

function canvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(key, tex);
  if (!fontReady)
    redraws.push(() => {
      ctx.clearRect(0, 0, w, h);
      draw(ctx);
      tex.needsUpdate = true;
    });
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Chrome bevel (UI `--chrome-rim`): light top-left to shade bottom-right. */
function chromeFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): CanvasGradient | string {
  if (typeof ctx.createLinearGradient !== 'function') return COLORS.chrome;
  const g = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
  g.addColorStop(0, '#f4f5f7');
  g.addColorStop(0.38, COLORS.chrome);
  g.addColorStop(0.72, '#b9bbc0');
  g.addColorStop(1, COLORS.chromeShade);
  return g;
}

/** Soft drop shadow, chrome rim and a face: the shared plate for badges, chips and plaques. */
function chromePlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, rim: number, face: string, band?: { color: string; w: number }): { x: number; y: number; w: number; h: number; r: number } {
  ctx.fillStyle = 'rgba(31,29,38,0.26)';
  roundRect(ctx, x + 2, y + 6, w, h, r);
  ctx.fill();
  ctx.fillStyle = chromeFill(ctx, x, y, w, h);
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  // Thin dark line just inside the chrome, as on the trays.
  ctx.fillStyle = 'rgba(60,60,70,0.35)';
  roundRect(ctx, x + rim - 1.5, y + rim - 1.5, w - rim * 2 + 3, h - rim * 2 + 3, Math.max(2, r - rim + 1.5));
  ctx.fill();
  let ix = x + rim;
  let iy = y + rim;
  let iw = w - rim * 2;
  let ih = h - rim * 2;
  let ir = Math.max(2, r - rim);
  if (band) {
    ctx.fillStyle = band.color;
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.fill();
    ix += band.w;
    iy += band.w;
    iw -= band.w * 2;
    ih -= band.w * 2;
    ir = Math.max(2, ir - band.w);
  }
  ctx.fillStyle = face;
  roundRect(ctx, ix, iy, iw, ih, ir);
  ctx.fill();
  return { x: ix, y: iy, w: iw, h: ih, r: ir };
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center'): void {
  ctx.fillStyle = fill;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export interface BadgeStyle {
  bg?: string;
  fg?: string;
  /** Coloured band inside the chrome rim (house plastic, chain colour). */
  ring?: string;
  /** Pill instead of circle (wider text). */
  pill?: boolean;
}

/** Round (or pill) badge: chrome rim, optional coloured band, cream face, Barlow Condensed numeral. */
export function badgeTexture(label: string, s: BadgeStyle = {}): THREE.Texture {
  const bg = s.bg ?? CREAM;
  const fg = s.fg ?? COLORS.ink;
  const ring = s.ring ?? COLORS.chromeShade;
  const pill = s.pill ?? label.length > 2;
  const W = pill ? 256 : 128;
  return canvasTex(`badge2:${label}:${bg}:${fg}:${ring}:${pill}`, W, 128, (ctx) => {
    const f = chromePlate(ctx, 6, 4, W - 12, 112, 56, 9, bg, { color: ring, w: 8 });
    const size = label.length > 3 ? 62 : label.length > 2 ? 72 : 84;
    text(ctx, label, W / 2, f.y + f.h / 2 + 4, size, fg);
  });
}

/** A camera-facing badge sprite; `size` = world height. */
export function makeBadge(label: string, style: BadgeStyle = {}, size = 0.42): THREE.Sprite {
  return badgeSprite(badgeTexture(label, style), size);
}

/** Depth-tested badge sprite from any cached texture; `size` = world height. */
export function badgeSprite(tex: THREE.Texture, size = 0.42): THREE.Sprite {
  const aspect = (tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height;
  const mat = spriteMat(tex);
  const s = new THREE.Sprite(mat);
  s.scale.set(size * aspect, size, 1);
  s.renderOrder = 10;
  s.userData.aspect = aspect;
  s.userData.baseH = size;
  return s;
}

/**
 * Campaign marker: a chrome-rimmed cream plate with a chain-colour band; the chain's mark on a
 * dark chain disc, the advertised good(s) as token glyphs, and the campaign number on a teal
 * busy-marker disc with a cream numeral (Deluxe busy markers, art bible §6.13).
 */
export function campaignBadgeTexture(number: number, goods: FoodId[], ring: string, edge: string, eternal = false): THREE.Texture {
  const shown = goods.slice(0, 2);
  const num = String(number);
  const chain = chainOfColor(ring);
  const markW = chain ? 98 : 0;
  const numW = Math.max(96, 46 + num.length * 34) + (eternal ? 50 : 0);
  const W = 30 + markW + shown.length * 94 + numW + 22;
  return canvasTex(`campaignBadge2:${num}:${eternal}:${shown.join('+')}:${ring}:${edge}`, W, 128, (ctx) => {
    const f = chromePlate(ctx, 4, 4, W - 8, 114, 57, 8, CREAM, { color: ring, w: 9 });
    const cy = f.y + f.h / 2;
    let x = f.x + 8;
    if (chain) {
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.arc(x + 40, cy, 40, 0, Math.PI * 2);
      ctx.fill();
      drawChainMark(ctx, chain, x + 40, cy, 62, CREAM, edge);
      x += markW;
    }
    for (const g of shown) {
      drawFood(ctx, g, x + 44, cy, 80);
      x += 94;
    }
    // Busy marker: teal disc (pill when wide) with a cream number.
    const dw = numW - 16;
    ctx.fillStyle = COLORS.tealDark;
    roundRect(ctx, x + 4, cy - 40, dw, 80, 40);
    ctx.fill();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 4;
    roundRect(ctx, x + 10, cy - 34, dw - 12, 68, 34);
    ctx.stroke();
    text(ctx, eternal ? `${num} ∞` : num, x + 4 + dw / 2, cy + 3, 64, CREAM);
  });
}

const spriteMats = new Map<string, THREE.SpriteMaterial>();
function spriteMat(tex: THREE.Texture): THREE.SpriteMaterial {
  let m = spriteMats.get(tex.uuid);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: true, transparent: true, toneMapped: false });
    spriteMats.set(tex.uuid, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Glyph paths (shared by canvas and THREE.Shape)
// ---------------------------------------------------------------------------

/** Anything that takes path commands: a canvas context or a THREE.Path adapter. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}
/** One closed sub-path in glyph units: a 100 x 100 box centred on 0, y down. */
export type GlyphPath = (p: PathSink) => void;

const K = 0.5523;
/** Ellipse as four cubic arcs. */
export const ell =
  (cx: number, cy: number, rx: number, ry = rx): GlyphPath =>
  (p) => {
    p.moveTo(cx + rx, cy);
    p.bezierCurveTo(cx + rx, cy + ry * K, cx + rx * K, cy + ry, cx, cy + ry);
    p.bezierCurveTo(cx - rx * K, cy + ry, cx - rx, cy + ry * K, cx - rx, cy);
    p.bezierCurveTo(cx - rx, cy - ry * K, cx - rx * K, cy - ry, cx, cy - ry);
    p.bezierCurveTo(cx + rx * K, cy - ry, cx + rx, cy - ry * K, cx + rx, cy);
    p.closePath();
  };
/** Rounded rectangle (quadratic corners). */
export const rr =
  (x: number, y: number, w: number, h: number, r: number): GlyphPath =>
  (p) => {
    r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h);
    p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r);
    p.quadraticCurveTo(x, y, x + r, y);
    p.closePath();
  };
const poly =
  (...pts: number[]): GlyphPath =>
  (p) => {
    p.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i]!, pts[i + 1]!);
    p.closePath();
  };

// ---------------------------------------------------------------------------
// Goods tokens (art bible §6.12): the shared glyph set (goodsGlyphs.ts, also the UI icons) read
// as path commands, so the canvas glyphs here and the 3D tokens (minis/tokens.ts) use one drawing
// ---------------------------------------------------------------------------

/** Parsed sub-paths of an SVG path string, cached (24 x 24 glyph grid, y down). */
const subpathCache = new Map<string, GlyphPath[]>();

/**
 * SVG path data → closed sub-paths that replay into any `PathSink` (canvas or THREE.Shape).
 * Handles M L H V C S Q T A Z, absolute and relative; arcs become cubic Béziers.
 */
export function glyphSubpaths(d: string): GlyphPath[] {
  const hit = subpathCache.get(d);
  if (hit) return hit;
  type Cmd = (p: PathSink) => void;
  const subs: Cmd[][] = [];
  let cur: Cmd[] = [];
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cx = 0; // last control point (for S / T)
  let cy = 0;
  let prev = '';
  const num = () => Number(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]!);
  const flush = () => {
    if (cur.length > 1) subs.push(cur);
    cur = [];
  };
  while (i < toks.length) {
    if (!isNum()) cmd = toks[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'Z') {
      cur.push((p) => p.closePath());
      x = sx;
      y = sy;
      flush();
      prev = 'Z';
      continue;
    }
    if (C === 'M') {
      flush();
      x = ox + num();
      y = oy + num();
      sx = x;
      sy = y;
      const [px, py] = [x, y];
      cur.push((p) => p.moveTo(px, py));
      cmd = rel ? 'l' : 'L'; // further pairs are line-tos
    } else if (C === 'L' || C === 'H' || C === 'V') {
      if (C !== 'V') x = (C === 'H' ? (rel ? x : 0) : ox) + num();
      if (C !== 'H') y = (C === 'V' ? (rel ? y : 0) : oy) + num();
      const [px, py] = [x, y];
      cur.push((p) => p.lineTo(px, py));
    } else if (C === 'C' || C === 'S') {
      let x1: number;
      let y1: number;
      if (C === 'C') {
        x1 = ox + num();
        y1 = oy + num();
      } else {
        const smooth = /[CS]/.test(prev);
        x1 = smooth ? 2 * x - cx : x;
        y1 = smooth ? 2 * y - cy : y;
      }
      const x2 = ox + num();
      const y2 = oy + num();
      x = ox + num();
      y = oy + num();
      [cx, cy] = [x2, y2];
      const e = [x1, y1, x2, y2, x, y] as const;
      cur.push((p) => p.bezierCurveTo(...e));
    } else if (C === 'Q' || C === 'T') {
      let qx: number;
      let qy: number;
      if (C === 'Q') {
        qx = ox + num();
        qy = oy + num();
      } else {
        const smooth = /[QT]/.test(prev);
        qx = smooth ? 2 * x - cx : x;
        qy = smooth ? 2 * y - cy : y;
      }
      x = ox + num();
      y = oy + num();
      [cx, cy] = [qx, qy];
      const e = [qx, qy, x, y] as const;
      cur.push((p) => p.quadraticCurveTo(...e));
    } else if (C === 'A') {
      const rx = num();
      const ry = num();
      const rot = num();
      const large = num();
      const sweep = num();
      const x2 = ox + num();
      const y2 = oy + num();
      for (const seg of arcBeziers(x, y, rx, ry, rot, large, sweep, x2, y2)) cur.push((p) => p.bezierCurveTo(...seg));
      x = x2;
      y = y2;
    } else {
      i++; // unknown command: skip a token so parsing always ends
    }
    prev = C;
  }
  flush();
  const out = subs.map((cmds): GlyphPath => (p) => {
    for (const c of cmds) c(p);
  });
  subpathCache.set(d, out);
  return out;
}

/** SVG endpoint arc → cubic Bézier segments (≤ 90° each). */
function arcBeziers(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number): [number, number, number, number, number, number][] {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const ccx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const ccy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= Math.PI * 2;
  if (sweep && dt < 0) dt += Math.PI * 2;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-6));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number) => [ccx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP, ccy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP] as const;
  const dv = (t: number) => [-rx * Math.sin(t) * cosP - ry * Math.cos(t) * sinP, -rx * Math.sin(t) * sinP + ry * Math.cos(t) * cosP] as const;
  const out: [number, number, number, number, number, number][] = [];
  for (let s = 0; s < n; s++) {
    const a = t1 + s * step;
    const b = a + step;
    const [ax, ay] = pt(a);
    const [bx, by] = pt(b);
    const [dax, day] = dv(a);
    const [dbx, dby] = dv(b);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

function fillAll(ctx: CanvasRenderingContext2D, paths: GlyphPath[], color: string): void {
  ctx.fillStyle = color;
  for (const d of paths) {
    ctx.beginPath();
    d(ctx);
    ctx.fill();
  }
}

function strokeAll(ctx: CanvasRenderingContext2D, paths: GlyphPath[], w: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  for (const d of paths) {
    ctx.beginPath();
    d(ctx);
    ctx.stroke();
  }
}

function darken(hex: string, t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - t));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * A goods token as a flat glyph (plaques, chips, posters, campaign markers): the shared glyph
 * (goodsGlyphs.ts) with the wooden token's thickness showing below it. `s` = glyph size in px.
 */
export function drawFood(ctx: CanvasRenderingContext2D, food: FoodId, cx: number, cy: number, s: number): void {
  const g = GOOD_GLYPHS[food];
  if (!g) return;
  const outline = glyphSubpaths(g.outline);
  ctx.save();
  ctx.translate(cx, cy - s * 0.03);
  ctx.scale(s / 25, s / 25);
  ctx.translate(-12, -12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Side of the token (8 mm of painted wood), then the top face and its print.
  ctx.save();
  ctx.translate(0, 1.6);
  strokeAll(ctx, outline, 1.5, GLYPH_EDGE);
  fillAll(ctx, outline, darken(g.body, 0.28));
  ctx.restore();
  strokeAll(ctx, outline, 1.5, GLYPH_EDGE);
  fillAll(ctx, outline, g.body);
  for (const l of g.layers) {
    ctx.globalAlpha = l.opacity ?? 1;
    fillAll(ctx, glyphSubpaths(l.d), l.fill);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Bowl outline, reused by the Siap Faji mark. */
const bowl: GlyphPath = (p) => {
  p.moveTo(-45, -4);
  p.lineTo(45, -4);
  p.quadraticCurveTo(43, 42, 0, 42);
  p.quadraticCurveTo(-43, 42, -45, -4);
  p.closePath();
};

// ---------------------------------------------------------------------------
// Chain marks (art bible §7): one silhouette per chain, our own drawings
// ---------------------------------------------------------------------------

/** Chain for a seat colour (current or earlier palette); undefined for a custom colour. */
export function chainOfColor(css: string): ChainId | undefined {
  return playerColorFor(css)?.id;
}

const CHAIN_MARKS: Record<ChainId, { fg: GlyphPath[]; cut?: GlyphPath[] }> = {
  // Goose head and neck over a donkey ear pair: long neck, beak to the left.
  fried_geese_donkey: {
    fg: [ell(10, 24, 32, 17), poly(-12, 18, -2, 18, -8, -24, -20, -24), ell(-16, -28, 11, 9), poly(-24, -33, -44, -28, -24, -21), poly(30, 12, 48, -2, 42, 20)],
    cut: [ell(-15, -31, 2.6)],
  },
  // Sitting duck.
  golden_duck_diner: {
    fg: [ell(6, 16, 35, 20), ell(-18, -14, 16, 15), poly(-31, -16, -48, -10, -31, -5), poly(34, 10, 47, -8, 41, 20)],
    cut: [ell(-20, -18, 3), poly(-6, 14, 22, 8, 26, 16, 0, 22)],
  },
  // Pizza slice as a sail on a hull.
  santa_maria_pizza: {
    fg: [poly(-26, 26, 32, 26, -8, -46), rr(-2, -48, 4, 78, 2), poly(-40, 30, 40, 30, 28, 46, -28, 46)],
    cut: [ell(-6, 6, 5), ell(8, 14, 4.5), ell(-14, 18, 4)],
  },
  // Guitar.
  xango_blues_bar: {
    fg: [ell(0, 26, 25, 21), ell(0, 0, 17, 15), rr(-4.5, -44, 9, 46, 3), rr(-8, -50, 16, 12, 3)],
    cut: [ell(0, 18, 6.5), rr(-11, 32, 22, 4, 2)],
  },
  // Burger stack.
  gluttony_inc: {
    fg: [
      (p) => {
        p.moveTo(-38, -6);
        p.bezierCurveTo(-38, -46, 38, -46, 38, -6);
        p.closePath();
      },
      rr(-42, 0, 84, 9, 4),
      rr(-40, 14, 80, 11, 5),
      rr(-37, 30, 74, 14, 7),
    ],
  },
  // Noodle bowl, chopsticks, steam.
  siap_faji: {
    fg: [bowl, poly(6, -8, 26, -48, 32, -45, 14, -8), poly(18, -8, 40, -42, 45, -37, 25, -8), rr(-38, 40, 76, 7, 3)],
    cut: [rr(-30, 8, 60, 5, 2.5)],
  },
};

/** A chain's mark in `fg`, with cut-out details in `bg`; `s` = size in px. */
export function drawChainMark(ctx: CanvasRenderingContext2D, chain: ChainId, cx: number, cy: number, s: number, fg: string, bg: string): void {
  const m = CHAIN_MARKS[chain];
  if (!m) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  fillAll(ctx, m.fg, fg);
  if (m.cut) fillAll(ctx, m.cut, bg);
  ctx.restore();
}

/** Round decal with a chain's mark (vehicle doors): cream roundel, mark in the chain's dark colour. */
export function chainMarkTexture(chain: ChainId, fg: string, bg: string = CREAM): THREE.Texture {
  return canvasTex(`chainMark:${chain}:${fg}:${bg}`, 128, 128, (ctx) => {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();
    drawChainMark(ctx, chain, 64, 64, 80, fg, bg);
  });
}

export function foodIconTexture(food: FoodId, bg: string | null = null): THREE.Texture {
  return canvasTex(`food:${food}:${bg}`, 128, 128, (ctx) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(64, 64, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFood(ctx, food, 64, 66, 100);
  });
}

/** Billboard / banner poster: player-colour frame, cream panel, food icon(s), optional number. */
export function posterTexture(goods: FoodId[], frame: string, aspect: number, number?: number): THREE.Texture {
  const H = 160;
  const W = Math.round(Math.min(5, Math.max(1, aspect)) * H);
  return canvasTex(`poster:${goods.join('+')}:${frame}:${W}:${number ?? ''}`, W, H, (ctx) => {
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, 10, 10, W - 20, H - 20, 14);
    ctx.fill();
    // Sunburst stripes behind the icon (diner-poster feel, original).
    ctx.save();
    roundRect(ctx, 10, 10, W - 20, H - 20, 14);
    ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = 'rgba(232,183,48,0.22)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, -W * 0.13);
      ctx.lineTo(W, W * 0.13);
      ctx.fill();
    }
    ctx.restore();
    const n = goods.length || 1;
    const step = Math.min(H - 30, (W - 40) / n);
    goods.forEach((g, i) => drawFood(ctx, g, W / 2 + (i - (n - 1) / 2) * step, H / 2 + 4, Math.min(step, H) * 0.95));
    if (number !== undefined) {
      ctx.fillStyle = frame;
      ctx.beginPath();
      ctx.arc(34, 34, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffaf0';
      ctx.font = `800 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), 34, 36);
    }
  });
}

/** Soft round contact-shadow texture used under minis (fake ambient occlusion). */
export function blobTexture(): THREE.Texture {
  return canvasTex('blob', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Square soft-edged contact shadow (for boxy footprints). */
export function squareBlobTexture(): THREE.Texture {
  return canvasTex('blobSq', 128, 128, (ctx) => {
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, 22, 22, 84, 84, 16);
    ctx.fill();
  });
}

/** Text label texture for signs (e.g. "SOON", chain initials): condensed caps on a rounded plate. */
export function signTexture(label: string, bg: string, fg: string): THREE.Texture {
  const W = 256;
  return canvasTex(`sign:${label}:${bg}:${fg}`, W, 96, (ctx) => {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, W, 96, 20);
    ctx.fill();
    text(ctx, label.toUpperCase(), W / 2, 51, label.length > 4 ? 60 : 76, fg);
  });
}

// ---------------------------------------------------------------------------
// Demand plaque (ux-plan §3.3, art bible §4 "Board HUD"): a cream plate with a chrome rim, the
// demand as wooden token glyphs with counts, capacity pips underneath
// ---------------------------------------------------------------------------

export interface PlaqueContent {
  /** Goods with counts, in display order. */
  goods: readonly { good: FoodId; count: number }[];
  /** Demand tokens on the house. */
  count: number;
  /** Capacity; null = unlimited (bar instead of pips). */
  capacity: number | null;
  /** Grey "no seller" dot (no road-connected seller last dinnertime). */
  noSeller?: boolean;
}

const PQ = { pad: 14, cell: 92, countW: 50, gap: 4, row: 92, rail: 30, railGap: 6 };
/** Pip colour for a full house (amber, 3:1 on the cream face). */
const FULL_PIP = '#b9781a';

export function plaqueKey(c: PlaqueContent): string {
  return `${c.goods.map((g) => `${g.good}${g.count}`).join('+')}|${c.count}/${c.capacity ?? 'inf'}|${c.noSeller ? 'ns' : ''}`;
}

/** "×2" after a glyph. */
function countLabel(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, size: number): void {
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`×${n}`, x, y);
}

function noSellerDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#8f8b88';
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.28);
  ctx.strokeStyle = CREAM;
  ctx.stroke();
}

/** Plaque texture; the canvas width depends on how many goods it shows. */
export function plaqueTexture(c: PlaqueContent): THREE.Texture {
  const cellW = (n: number) => PQ.cell + (n > 1 ? PQ.countW : 0);
  const inner = c.goods.reduce((s, g, i) => s + cellW(g.count) + (i ? PQ.gap : 0), 0);
  const pipsW = c.capacity === null ? 120 : c.capacity * 30;
  const W = Math.ceil(Math.max(inner, pipsW, PQ.cell) + PQ.pad * 2 + 8);
  const H = PQ.pad * 2 + PQ.row + PQ.railGap + PQ.rail + 8;
  const full = c.capacity !== null && c.count >= c.capacity;
  return canvasTex(`plaque2:${plaqueKey(c)}`, W, H, (ctx) => {
    // Chrome rim; full houses get an amber band inside it.
    const f = chromePlate(ctx, 2, 2, W - 8, H - 10, 22, 6, CREAM, full ? { color: COLORS.warn, w: 5 } : undefined);
    // Goods row.
    let x = (W - 4 - inner) / 2;
    const cy = PQ.pad + 4 + PQ.row / 2;
    for (const g of c.goods) {
      drawFood(ctx, g.good, x + PQ.cell / 2, cy, PQ.cell * 0.94);
      if (g.count > 1) countLabel(ctx, g.count, x + PQ.cell - 6, cy + 14, 50);
      x += cellW(g.count) + PQ.gap;
    }
    // Capacity rail on a sunk strip.
    const ry = PQ.pad + 4 + PQ.row + PQ.railGap + PQ.rail / 2;
    if (c.capacity === null) {
      const bw2 = 96;
      const bx = (W - 4) / 2 - bw2 / 2 - 14;
      ctx.fillStyle = COLORS.ink;
      roundRect(ctx, bx, ry - 6, bw2, 12, 6);
      ctx.fill();
      text(ctx, '∞', bx + bw2 + 18, ry + 1, 40, COLORS.ink);
    } else {
      const n = c.capacity;
      const step = 30;
      const x0 = (W - 4) / 2 - ((n - 1) * step) / 2;
      ctx.fillStyle = COLORS.surfaceSunk;
      roundRect(ctx, x0 - 17, ry - 15, (n - 1) * step + 34, 30, 15);
      ctx.fill();
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * step, ry, 10, 0, Math.PI * 2);
        if (i < c.count) {
          ctx.fillStyle = full ? FULL_PIP : COLORS.ink;
          ctx.fill();
        } else {
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = COLORS.lineStrong;
          ctx.stroke();
        }
      }
    }
    if (c.noSeller) noSellerDot(ctx, f.x + f.w - 18, f.y + 18, 13);
  });
}

/**
 * Compact plaque (zoomed out): one row of good glyphs with small counts and a thin capacity bar
 * along the bottom (amber when full). About a third of the full plaque's height.
 */
export function compactPlaqueTexture(c: PlaqueContent): THREE.Texture {
  const G = 64;
  const cnt = 30;
  const cellW = (n: number) => G + (n > 1 ? cnt : 0);
  const inner = c.goods.reduce((sum, g, i) => sum + cellW(g.count) + (i ? 2 : 0), 0);
  const W = Math.ceil(inner + 24);
  const H = 92;
  const full = c.capacity !== null && c.count >= c.capacity;
  return canvasTex(`plaqueC2:${plaqueKey(c)}`, W, H, (ctx) => {
    const f = chromePlate(ctx, 1, 1, W - 4, H - 7, 18, 4, CREAM, full ? { color: COLORS.warn, w: 3 } : undefined);
    let x = (W - 2 - inner) / 2;
    const cy = 39;
    for (const g of c.goods) {
      drawFood(ctx, g.good, x + G / 2, cy, G * 0.94);
      if (g.count > 1) countLabel(ctx, g.count, x + G - 6, cy + 10, 36);
      x += cellW(g.count) + 2;
    }
    // Capacity: filled share of a thin bar (apartments / rural: a full muted bar).
    const bx = 16;
    const bw = W - 2 - 32;
    const by = H - 22;
    ctx.fillStyle = COLORS.surfaceSunk;
    roundRect(ctx, bx, by, bw, 7, 3.5);
    ctx.fill();
    const share = c.capacity === null ? 1 : Math.min(1, c.count / Math.max(1, c.capacity));
    ctx.fillStyle = full ? FULL_PIP : c.capacity === null ? COLORS.inkMuted : COLORS.ink;
    roundRect(ctx, bx, by, Math.max(7, bw * share), 7, 3.5);
    ctx.fill();
    if (c.noSeller) noSellerDot(ctx, f.x + f.w - 10, f.y + 10, 8);
  });
}

/** Smallest plaque (crowded): the most-wanted good and the total demand count. */
export function miniPlaqueTexture(c: PlaqueContent): THREE.Texture {
  const top = [...c.goods].sort((a, b) => b.count - a.count)[0];
  const W = 128;
  const H = 76;
  const full = c.capacity !== null && c.count >= c.capacity;
  return canvasTex(`plaqueM2:${top?.good}:${c.count}:${full}`, W, H, (ctx) => {
    chromePlate(ctx, 1, 1, W - 4, H - 6, 34, 4, CREAM, full ? { color: COLORS.warn, w: 3 } : undefined);
    if (top) drawFood(ctx, top.good, 38, H / 2 - 2, 54);
    text(ctx, String(c.count), 92, H / 2, 52, COLORS.ink);
  });
}

/** Swap a sprite made by `makeSprite` to another cached texture (keeps its world height). */
export function setSpriteTexture(s: THREE.Sprite, tex: THREE.Texture): void {
  if (s.material.map === tex) return;
  const img = tex.image as HTMLCanvasElement;
  s.material = topSpriteMat(tex);
  s.userData.aspect = img.width / img.height;
}

/** Small chip for overlays: optional token glyph plus text ("+1", "+2", "full"), in a colour. */
export function chipTexture(label: string, good: FoodId | null, bg: string, fg = '#fffaf0'): THREE.Texture {
  const W = (good ? 120 : 30) + Math.max(1, label.length) * 36 + 30;
  return canvasTex(`chip2:${label}:${good}:${bg}:${fg}`, W, 128, (ctx) => {
    const f = chromePlate(ctx, 2, 4, W - 8, 112, 30, 7, bg, { color: fg, w: 4 });
    let x = f.x + 12;
    if (good) {
      ctx.fillStyle = CREAM;
      roundRect(ctx, x, f.y + 8, 84, f.h - 16, 22);
      ctx.fill();
      drawFood(ctx, good, x + 42, f.y + f.h / 2, 74);
      x += 96;
    }
    text(ctx, label, x, f.y + f.h / 2 + 3, 70, fg, 'left');
  });
}

/** Camera-facing sprite from any cached texture; `size` = world height. Drawn on top of the board. */
export function makeSprite(tex: THREE.Texture, size: number, onTop = true): THREE.Sprite {
  const img = tex.image as HTMLCanvasElement;
  const mat = onTop ? topSpriteMat(tex) : spriteMat(tex);
  const s = new THREE.Sprite(mat);
  s.scale.set((size * img.width) / img.height, size, 1);
  s.renderOrder = onTop ? 20 : 10;
  s.userData.aspect = img.width / img.height;
  s.userData.baseH = size;
  return s;
}

const topMats = new Map<string, THREE.SpriteMaterial>();
function topSpriteMat(tex: THREE.Texture): THREE.SpriteMaterial {
  let m = topMats.get(tex.uuid);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true, toneMapped: false });
    topMats.set(tex.uuid, m);
  }
  return m;
}

export function disposeTextures(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const m of spriteMats.values()) m.dispose();
  spriteMats.clear();
  for (const m of topMats.values()) m.dispose();
  topMats.clear();
}
