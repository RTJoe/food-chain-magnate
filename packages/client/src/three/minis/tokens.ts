/**
 * Goods tokens (docs/art-bible.md §6.12): the Special Edition's screen-printed wooden shapes. Each
 * good is its silhouette from the shared glyph set (goodsGlyphs.ts, also the UI icons and the
 * plaque glyphs) extruded to a flat token in the painted body colour, with the print laid on the
 * top face as thin vertex-coloured inlays (one geometry, one draw call per good). Used for demand
 * stacks above houses, carried goods and flying goods in animations.
 */
import * as THREE from 'three';
import type { DemandToken, FoodId } from '@fcm/engine';
import { GOOD_GLYPHS } from '../../goodsGlyphs.js';
import { COLORS, FOOD_COLORS } from '../../theme.js';
import { BADGE_MIN_PX, LABEL_MIN_PX, compactPlaqueTexture, glyphSubpaths, makeSprite, miniPlaqueTexture, plaqueTexture, setSpriteTexture, type GlyphPath } from '../labels.js';
import { solid, type MiniCtx } from './ctx.js';
import { Shape, ball, box, color, miniGeo, puck, shade } from './kit.js';

/** Token thickness (and stack step): 8 mm of wood on a ~20 mm token, 0.3 across. */
export const TOKEN_H = 0.12;
export const MAX_STACK = 5;
/** Glyph grid (24 units, silhouettes ~21 across) to world units: tokens ~0.29 across. */
const GU = 0.3 / 22;
/** Print details smaller than this (grid units) stay 2D only: sesame seeds, grains, highlights. */
const MIN_DETAIL = 1.8;

/** A glyph sub-path as a THREE.Shape in the token's plane, centred (glyph y down = world north). */
function glyphShape(d: GlyphPath): THREE.Shape {
  const s = new THREE.Shape();
  const X = (x: number) => (x - 12) * GU;
  const Y = (y: number) => -(y - 12) * GU;
  d({
    moveTo: (x, y) => s.moveTo(X(x), Y(y)),
    lineTo: (x, y) => s.lineTo(X(x), Y(y)),
    quadraticCurveTo: (a, b, x, y) => s.quadraticCurveTo(X(a), Y(b), X(x), Y(y)),
    bezierCurveTo: (a, b, c, e, x, y) => s.bezierCurveTo(X(a), Y(b), X(c), Y(e), X(x), Y(y)),
    closePath: () => s.closePath(),
  });
  return s;
}

/** Bounding box of a sub-path (grid units). */
function bbox(d: GlyphPath): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const pt = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  d({ moveTo: pt, lineTo: pt, quadraticCurveTo: (_a, _b, x, y) => pt(x, y), bezierCurveTo: (_a, _b, _c, _d, x, y) => pt(x, y), closePath: () => undefined });
  return { x0, y0, x1, y1 };
}

/** Largest bbox side of a sub-path (grid units). */
function extent(d: GlyphPath): number {
  const b = bbox(d);
  return Math.max(b.x1 - b.x0, b.y1 - b.y0);
}

/** Whether grid point (x, y) lies on the token (inside any outline sub-path, even-odd per path). */
function onToken(outline: THREE.Shape[], x: number, y: number): boolean {
  const px = (x - 12) * GU;
  const py = -(y - 12) * GU;
  return outline.some((s) => {
    const pts = s.getPoints(4);
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  });
}

/** Shape in xy → lying flat (xz), extruded up from y = 0. */
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

/** A token of `food`, `h` thick (duration tokens on campaign plates are thinner). */
export function tokenShape(food: FoodId, h = TOKEN_H): Shape {
  const s = new Shape();
  const g = GOOD_GLYPHS[food];
  // Body: each silhouette sub-path extruded (no bevel: the low-poly flat sides read as cut wood).
  const outline = glyphSubpaths(g.outline).map(glyphShape);
  // Busy silhouettes (the coffee cup, handle and saucer) take coarser curves to stay in the
  // token budget (art bible §6: 60–120 triangles).
  const curveSegments = outline.reduce((n, sh) => n + sh.getPoints(3).length, 0) > 30 ? 2 : 3;
  for (const sh of outline) {
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments });
    s.add(geo, g.body, { rot: FLAT, mat: 'plastic', jitter: 0 });
  }
  // Print: flat inlays just above the top face, stepped so they never z-fight. Translucent
  // highlights are skipped (the plastic sheen does that job), and so is print that lies off the
  // token (the coffee steam is drawn above the cup in the icon; on wood it would float in air).
  let k = 0;
  for (const l of g.layers) {
    if (l.opacity !== undefined && l.opacity < 1) continue;
    for (const d of glyphSubpaths(l.d)) {
      if (extent(d) < MIN_DETAIL) continue;
      const b = bbox(d);
      if (!onToken(outline, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)) continue;
      const geo = new THREE.ShapeGeometry(glyphShape(d), 2);
      s.add(geo, color(l.fill), { at: [0, h + 0.0015 * ++k, 0], rot: FLAT, mat: 'plastic', jitter: 0 });
    }
  }
  return s;
}

export function tokenGeo(food: FoodId): THREE.BufferGeometry {
  return miniGeo(`token:${food}`, () => tokenShape(food));
}

export function buildToken(ctx: MiniCtx, food: FoodId): THREE.Group {
  const g = new THREE.Group();
  solid(ctx, g, tokenGeo(food), { castShadow: true });
  return g;
}

/** World height of the demand plaque at close zoom. */
export const PLAQUE_H = 0.74;
const STACK_SCALE = 0.7;

export interface DemandParams {
  /** Capacity; null = unlimited (apartment, rural). */
  capacity: number | null;
  noSeller?: boolean;
  /** Height of the plaque anchor above the stack origin's ground (the house number badge). */
  badgeH?: number;
}

/** Goods grouped and ordered for display (food order, then count). */
export function demandGoods(demand: readonly DemandToken[]): { good: FoodId; count: number }[] {
  const order = Object.keys(FOOD_COLORS);
  const counts = new Map<FoodId, number>();
  for (const d of demand) counts.set(d.good, (counts.get(d.good) ?? 0) + 1);
  return [...counts].map(([good, count]) => ({ good, count })).sort((a, b) => order.indexOf(a.good) - order.indexOf(b.good));
}

/**
 * Demand on a house (ux-plan §3.3): a roof plaque (good glyphs with counts, capacity pips) drawn
 * just above the house number badge, plus the token stack, scaled down and set behind the plaque
 * as the "stock" the animations drop into and take from. The group origin is the badge anchor;
 * each token is its own child (`token:i`) so animations can pop or fly single tokens.
 */
export function buildDemandStack(ctx: MiniCtx, demand: DemandToken[], p: DemandParams = { capacity: 3 }): THREE.Group {
  const g = new THREE.Group();
  g.name = 'demand';
  const n = demand.length;
  const shown = Math.min(n, MAX_STACK);
  const badgeH = p.badgeH ?? 0.46;
  if (n > 0) {
    const content = { goods: demandGoods(demand), count: n, capacity: p.capacity, noSeller: p.noSeller };
    const plaque = makeSprite(plaqueTexture(content), PLAQUE_H);
    // Bottom edge just above the number badge; Stage.updateSized keeps it there as both scale,
    // switches to the compact / mini form when zoomed out and nudges plaques apart (no overlap).
    plaque.center.set(0.5, -((badgeH / 2 + 0.04) / PLAQUE_H));
    plaque.userData.minPx = LABEL_MIN_PX;
    plaque.userData.above = { baseH: badgeH, minPx: BADGE_MIN_PX, gap: 0.04 };
    plaque.userData.plaque = { full: plaqueTexture(content), compact: compactPlaqueTexture(content), mini: miniPlaqueTexture(content), count: n };
    plaque.name = 'plaque';
    g.add(plaque);
    // Plinth disc so the stack reads as one floating piece.
    const plinth = new THREE.Group();
    plinth.name = 'plinth';
    plinth.position.set(0, STACK_DY, -STACK_BEHIND);
    plinth.userData.screenBehind = STACK_BEHIND;
    plinth.scale.setScalar(STACK_SCALE);
    g.add(plinth);
    solid(ctx, plinth, miniGeo('stackPlinth', () => new Shape().add(puck(0.2, 0.03, 14, 0.01), shade(COLORS.ink, 0.15), { jitter: 0 })), { castShadow: true });
  }
  for (let i = 0; i < shown; i++) {
    const t = buildToken(ctx, demand[i]!.good);
    t.name = `token:${i}`;
    t.scale.setScalar(STACK_SCALE);
    t.position.set(0, STACK_DY + (0.03 + i * TOKEN_H) * STACK_SCALE, -STACK_BEHIND);
    t.userData.screenBehind = STACK_BEHIND;
    // Hand-stacked: a little twist per token, prints still facing the viewer.
    t.rotation.y = (((i * 0.37) % 0.6) - 0.3) * (i % 2 ? 1 : -1);
    g.add(t);
  }
  g.userData.count = n;
  return g;
}

/** What a held plaque restores to (reconciler `holdPlaque`). */
export interface PlaqueHold {
  plaque: unknown;
  visible: boolean;
}

/**
 * Re-point a demand plaque sprite (masking, animation-plan §4.2): show `demand` (pre-batch
 * content), hide it, or restore a `PlaqueHold`. Stage.layoutPlaques picks the form per frame
 * from `userData.plaque`, so swapping it is enough.
 */
export function setPlaque(s: THREE.Sprite, to: PlaqueHold | { visible: false } | { demand: readonly DemandToken[]; capacity: number | null; noSeller?: boolean }): void {
  if ('demand' in to) {
    const content = { goods: demandGoods(to.demand), count: to.demand.length, capacity: to.capacity, noSeller: to.noSeller };
    s.userData.plaque = { full: plaqueTexture(content), compact: compactPlaqueTexture(content), mini: miniPlaqueTexture(content), count: to.demand.length };
    setSpriteTexture(s, s.userData.plaque.full);
    s.visible = true;
    return;
  }
  if ('plaque' in to) {
    s.userData.plaque = to.plaque;
    const pq = to.plaque as { full?: THREE.Texture } | undefined;
    if (pq?.full) setSpriteTexture(s, pq.full);
  }
  s.visible = to.visible;
}

/** Stack offset from the badge anchor: a little lower, and behind the plaque on screen (Stage.behind). */
const STACK_DY = -0.28;
const STACK_BEHIND = 0.6;

export function demandKey(demand: DemandToken[]): string {
  return demand.map((d) => d.good).join(',');
}

/**
 * Money chip for sale / salary animations (the name stays for the pool): FCM has no coins, so it
 * is a folded $10 banknote (art bible §2 money colours), flat, with a darker frame and an engraved
 * centre oval. Stacks at 0.042 like the old coin.
 */
export function coinGeo(): THREE.BufferGeometry {
  return miniGeo('coin:note', () => {
    const s = new Shape();
    s.add(box(0.26, 0.034, 0.15, 0.008), '#f2dc7e', { mat: 'plastic', jitter: 0 });
    s.add(box(0.22, 0.004, 0.11, 0), '#c9b25a', { at: [0, 0.034, 0], jitter: 0 });
    s.add(box(0.205, 0.004, 0.095, 0), '#f6e59a', { at: [0, 0.036, 0], jitter: 0 });
    s.add(puck(0.034, 0.004, 10, 0.001), '#3c3a36', { at: [0, 0.038, 0], scale: [1.35, 1, 1], jitter: 0 });
    s.add(puck(0.026, 0.004, 10, 0.001), '#f6e59a', { at: [0, 0.039, 0], scale: [1.35, 1, 1], jitter: 0 });
    return s;
  });
}

/** Ball for generic effects. */
export function sparkGeo(): THREE.BufferGeometry {
  return miniGeo('spark', () => new Shape().add(ball(0.06, 0), '#fff3a8', { mat: 'glow', jitter: 0 }));
}
