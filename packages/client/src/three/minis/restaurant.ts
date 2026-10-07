/**
 * Restaurant (2x2) and coffee shop (1x1). Restaurants are the Special Edition chain minis
 * (`chains.ts`): one plastic colour, a silhouette per chain, the entrance corner cut at 45° with a
 * WELCOME strip, the wordmark decal on the roof sign and a roof slot for the drive-in and
 * coming-soon signs. Built with the entrance at the SE corner and rotated to the real one.
 */
import * as THREE from 'three';
import type { ChainId, Corner, RestaurantStatus } from '@fcm/engine';
import { cornerAngle } from '../coords.js';
import { BADGE_MIN_PX, makeBadge } from '../labels.js';
import { blob, face, solid, type MiniCtx } from './ctx.js';
import {
  CHAINS,
  CORAL,
  DERELICT_GREY,
  SLOT_SIGN,
  WELCOME_AT,
  chainForColor,
  comingSoonTexture,
  driveInTexture,
  fenceGeo,
  isChainId,
  restaurantShape,
  slotSignGeo,
  totemGeo,
  welcomeTexture,
  wordmarkTexture,
} from './chains.js';
import { P, Shape, ball, box, cyl, extrude, lathe, miniGeo, playerPalette, puck } from './kit.js';

export interface RestaurantParams {
  color: string;
  status: RestaurantStatus;
  entrance: Corner;
  driveIn: boolean;
  /** Owner mark (the player's initial, as in the panels) on the owner badge. */
  mark: string;
  /** The owner's chain (view.players[owner].chain). Without it the chain follows the seat colour. */
  chain?: ChainId;
}

/** The chain a restaurant is drawn as. */
export function restaurantChain(p: { color: string; chain?: string }): ChainId {
  return isChainId(p.chain) ? p.chain : chainForColor(p.color);
}

/** Height of a chain's restaurant mini (for picking and badge anchors). */
export function restaurantHeight(chain: ChainId): number {
  return CHAINS[chain].height;
}

/** `#rrggbb` at a fraction of its value (coming soon: 85 %). */
function dim(css: string, v: number): string {
  const n = Number.parseInt(css.slice(1), 16);
  const ch = (sh: number) => Math.round(((n >> sh) & 255) * v);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export function buildRestaurant(ctx: MiniCtx, p: RestaurantParams): THREE.Group {
  const chain = restaurantChain(p);
  const spec = CHAINS[chain];
  const derelict = p.status === 'derelict';
  const soon = p.status === 'comingSoon';
  const plastic = derelict ? DERELICT_GREY : soon ? dim(p.color, 0.85) : p.color.toLowerCase();
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.rotation.y = cornerAngle(p.entrance);
  g.add(body);
  blob(ctx, body, 2.2, 2.2, true, 0.8);
  solid(ctx, body, miniGeo(`restaurant:${chain}:${plastic}`, () => restaurantShape(chain, plastic)));

  // WELCOME strip, flat on the plate along the chamfer, reading from the entrance.
  const w = face(ctx, body, welcomeTexture(plastic), 0.58, 0.11);
  w.rotation.set(-Math.PI / 2, Math.PI / 4, 0, 'YXZ');
  w.position.set(WELCOME_AT[0], WELCOME_AT[1] + 0.002, WELCOME_AT[2]);

  if (!derelict) {
    const sg = spec.sign;
    const f = face(ctx, body, wordmarkTexture(chain, plastic), sg.w, sg.h);
    f.name = 'wordmark';
    f.position.set(...sg.at);
    f.rotation.y = sg.yaw;
  }
  if (soon) {
    solid(ctx, body, fenceGeo(), { castShadow: false });
    slotSign(ctx, body, spec.slot, 'soon');
  } else if (p.driveIn && p.status === 'open') {
    slotSign(ctx, body, spec.slot, 'driveIn');
    addDriveIn(ctx, g);
  }
  if (!derelict && p.mark) {
    // Above the entrance corner, clear of the roof-centre anchor used by sale chips.
    const v = new THREE.Vector3(0.62, spec.height + 0.38, 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), body.rotation.y);
    addOwnerBadge(g, p.mark, p.color, v.x, v.y, v.z);
  }
  return g;
}

/** Turn-order totem (art bible §6.13): the chain's roof feature on a 0.5 column, ~1.2 tall. */
export function buildTotem(ctx: MiniCtx, p: { chain: ChainId; color: string }): THREE.Group {
  const g = new THREE.Group();
  g.name = 'totem';
  blob(ctx, g, 0.8, 0.8, true, 0.7);
  solid(ctx, g, totemGeo(p.chain, p.color.toLowerCase()));
  return g;
}

/** The drive-in or coming-soon board standing in the roof slot, decal on both sides. */
function slotSign(ctx: MiniCtx, body: THREE.Object3D, at: [number, number, number, number], kind: 'driveIn' | 'soon'): void {
  const o = new THREE.Group();
  o.name = kind === 'soon' ? 'soonSign' : 'driveInSign';
  o.position.set(at[0], at[1], at[2]);
  o.rotation.y = at[3];
  body.add(o);
  solid(ctx, o, slotSignGeo(kind));
  const tex = kind === 'soon' ? comingSoonTexture() : driveInTexture();
  for (const side of [1, -1]) {
    const f = face(ctx, o, tex, SLOT_SIGN.w - 0.02, SLOT_SIGN.h - 0.02);
    f.position.set(0, SLOT_SIGN.y + SLOT_SIGN.h / 2, side * 0.0195);
    if (side < 0) f.rotation.y = Math.PI;
  }
}

/**
 * Camera-facing owner badge (player initial on the player colour, like the panels' badges) so
 * colour is never the only link between a piece and its owner. Never smaller than a house badge.
 */
export function addOwnerBadge(parent: THREE.Object3D, mark: string, color: string, x: number, y: number, z: number): THREE.Sprite {
  const pal = playerPalette(color);
  const b = makeBadge(mark, { bg: pal.base, fg: lightColor(pal.base) ? '#2b2a33' : '#fffaf0', ring: pal.dark }, 0.4);
  b.position.set(x, y, z);
  b.name = 'owner';
  b.userData.minPx = BADGE_MIN_PX;
  b.userData.obstacle = true;
  parent.add(b);
  return b;
}

/** True for seat colours too light for cream text (Mustard, Tangerine, Pickle). */
function lightColor(hex: string): boolean {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.3;
}

/** Drive-in markers: an outward arrow on every corner of the footprint (white, coral outline). */
function addDriveIn(ctx: MiniCtx, g: THREE.Group): void {
  const geo = miniGeo('driveArrow:sign', () => {
    const s = new Shape();
    s.add(extrude('arrow', arrowShape, 0.03, 0.008), P.white, { rot: [-Math.PI / 2, 0, 0], scale: 0.22, jitter: 0, mat: 'plastic' });
    s.add(extrude('arrow', arrowShape, 0.03, 0.008), CORAL, { at: [0, -0.012, 0], rot: [-Math.PI / 2, 0, 0], scale: 0.28, jitter: 0, mat: 'plastic' });
    return s;
  });
  for (const c of ['NW', 'NE', 'SE', 'SW'] as Corner[]) {
    const o = new THREE.Group();
    // Named so `driveInsOpened` can pop the corners one by one.
    o.name = `driveIn:${c}`;
    o.rotation.y = cornerAngle(c) + Math.PI / 4;
    const a = cornerAngle(c);
    o.position.set(Math.sin(a + Math.PI / 4) * 1.18, 0.09, Math.cos(a + Math.PI / 4) * 1.18);
    g.add(o);
    solid(ctx, o, geo, { castShadow: false });
  }
}

function arrowShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 1);
  s.lineTo(0.8, 0.1);
  s.lineTo(0.3, 0.1);
  s.lineTo(0.3, -0.8);
  s.lineTo(-0.3, -0.8);
  s.lineTo(-0.3, 0.1);
  s.lineTo(-0.8, 0.1);
  s.closePath();
  return s;
}

// ---------------------------------------------------------------------------
// Coffee shop (1x1 kiosk, Ketchup)
// ---------------------------------------------------------------------------

function coffeeShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  s.add(box(0.88, 0.06, 0.88, 0.03), P.lot, { jitter: 0 });
  s.add(box(0.62, 0.5, 0.56, 0.04), P.cream, { at: [0, 0.06, -0.06] });
  s.add(box(0.5, 0.18, 0.05, 0.01), P.window, { at: [0, 0.3, 0.22], mat: 'glass' });
  s.add(box(0.56, 0.04, 0.12, 0.01), pal.dark, { at: [0, 0.24, 0.27] });
  for (let i = 0; i < 4; i++)
    s.add(box(0.16, 0.03, 0.2, 0.008), i % 2 ? P.white : pal.base, { at: [-0.24 + i * 0.16, 0.5, 0.28], rot: [0.5, 0, 0], jitter: 0 });
  s.add(box(0.7, 0.07, 0.64, 0.03), pal.dark, { at: [0, 0.56, -0.06] });
  // Giant cup on the roof.
  s.add(lathe([[0, 0], [0.13, 0], [0.17, 0.24], [0.15, 0.25], [0, 0.25]], 10), P.white, { at: [0, 0.63, -0.06] });
  s.add(cyl(0.165, 0.165, 0.02, 10), '#4a3226', { at: [0, 0.86, -0.06] });
  s.add(lathe([[0.155, 0.05], [0.18, 0.06], [0.19, 0.12], [0.185, 0.16], [0.16, 0.17]], 10), pal.base, { at: [0, 0.63, -0.06] });
  s.add(puck(0.2, 0.03, 12, 0.01), P.white, { at: [0, 0.63, -0.06] });
  // Steam.
  s.add(ball(0.04, 0), '#ffffff', { at: [-0.03, 0.95, -0.06] });
  s.add(ball(0.03, 0), '#ffffff', { at: [0.03, 1.02, -0.04] });
  // Bistro table.
  s.add(cyl(0.012, 0.012, 0.16, 4), P.steelDark, { at: [0.3, 0.06, 0.33] });
  s.add(cyl(0.07, 0.07, 0.015, 8), P.white, { at: [0.3, 0.22, 0.33] });
  return s;
}

export function buildCoffeeShop(ctx: MiniCtx, p: { color: string; mark?: string }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 1.1, 1.1, true, 0.7);
  solid(ctx, g, miniGeo(`coffee:${p.color}`, () => coffeeShape(p.color)));
  if (p.mark) addOwnerBadge(g, p.mark, p.color, 0, 1.4, 0);
  return g;
}

