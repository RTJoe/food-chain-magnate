/**
 * Restaurant (2x2) and coffee shop (1x1). Restaurants are the Special Edition chain minis
 * (`chains.ts`), painted: chain-colour walls with realistic details, a silhouette per chain, the entrance corner cut at 45° with a
 * WELCOME strip, the wordmark decal on the roof sign and a roof slot for the drive-in and
 * coming-soon signs. Built with the entrance at the SE corner and rotated to the real one.
 */
import * as THREE from 'three';
import type { ChainId, Corner, Direction, RestaurantStatus } from '@fcm/engine';
import { cornerAngle, dirAngle } from '../coords.js';
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
  paints,
  restaurantShape,
  slotSignGeo,
  totemGeo,
  welcomeTexture,
  wordmarkTexture,
} from './chains.js';
import { P, Shape, box, cone, cyl, extrude, lathe, miniGeo, playerPalette, puck, torus, type PartOpts } from './kit.js';

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

/** Cardboard of the coming-soon sign (art bible §6.1). */
const SOON_CARD = '#d9c7a3';

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
    // The roof-slot sign is edge-on from some yaws and flat in top view: a camera-facing
    // cardboard "SOON" badge over the roof labels the state from anywhere.
    const sb = makeBadge('SOON', { bg: SOON_CARD, fg: '#3a3128', ring: playerPalette(p.color).dark, pill: true }, 0.3);
    sb.position.set(0, spec.height + 0.32, 0);
    sb.name = 'soonBadge';
    sb.userData.minPx = BADGE_MIN_PX * 0.8;
    sb.userData.obstacle = true;
    g.add(sb);
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

/** Drive-in markers: an arrow pointing in at every corner of the footprint (cars may come in from any side; white, coral outline). */
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

/** Kiosk hatch: the wordmark decal sits on the counter front below it. */
const KIOSK = { w: 0.6, h: 0.5, d: 0.56, z: -0.04, counterY: 0.27 };

/**
 * SE coffee kiosk (art bible §6.10), painted: a 0.6² kiosk in the chain colour with a dark hatch,
 * a wooden counter and a propped-up flap, a conical roof a deeper shade of the chain colour with
 * a white rim, and a white china cup and saucer of coffee on top.
 */
function coffeeShape(color: string): Shape {
  const s = new Shape();
  const k = paints(color);
  const pen = (geo: THREE.BufferGeometry, paint: THREE.Color, o: PartOpts = {}) => s.add(geo, paint, { mat: 'body', jitter: 0.02, ...o });
  const { w, h, d, z, counterY } = KIOSK;
  const front = z + d / 2;
  pen(box(0.86, 0.06, 0.86, 0.02), k.plate, { jitter: 0 });
  pen(box(w, h, d, 0.03), k.main, { at: [0, 0.06, z] });
  // Hatch: a dark opening above the counter, the flap propped up over it.
  pen(box(w - 0.14, 0.18, 0.02, 0), k.ink, { at: [0, counterY + 0.04, front] });
  pen(box(w - 0.06, 0.035, 0.12, 0.01), k.wood, { at: [0, counterY, front + 0.04] });
  pen(box(w - 0.06, 0.025, 0.2, 0.006), k.trim, { at: [0, counterY + 0.24, front + 0.09], rot: [0.35, 0, 0] });
  // Conical roof with a rim, the cup and saucer on top.
  const top = 0.06 + h;
  pen(cyl(0.45, 0.45, 0.04, 8), k.trim, { at: [0, top, z], rot: [0, Math.PI / 8, 0] });
  pen(cone(0.44, 0.26, 8), k.roof, { at: [0, top + 0.04, z], rot: [0, Math.PI / 8, 0] });
  const sy = top + 0.24;
  const china: PartOpts = { mat: 'plastic', jitter: 0.01 };
  pen(puck(0.2, 0.03, 10, 0.01), k.china, { at: [0, sy, z], ...china });
  pen(lathe([[0, 0], [0.09, 0], [0.13, 0.15], [0.135, 0.17], [0, 0.17]], 10), k.china, { at: [0, sy + 0.03, z], ...china });
  pen(cyl(0.115, 0.115, 0.012, 10), k.coffee, { at: [0, sy + 0.192, z], mat: 'glass' });
  pen(torus(0.05, 0.016, 8), k.china, { at: [0.15, sy + 0.12, z], rot: [Math.PI / 2, 0, 0], ...china });
  return s;
}

export function buildCoffeeShop(ctx: MiniCtx, p: { color: string; mark?: string; facing?: Direction }): THREE.Group {
  const g = new THREE.Group();
  const plastic = p.color.toLowerCase();
  // The kiosk is built with its hatch to the south; turn it to face its road.
  const body = new THREE.Group();
  body.name = 'body';
  body.rotation.y = dirAngle(p.facing ?? 'S');
  g.add(body);
  blob(ctx, body, 1.0, 1.0, true, 0.6);
  solid(ctx, body, miniGeo(`coffee:se:${plastic}`, () => coffeeShape(plastic)));
  // Chain mark decal on the counter front.
  const wm = face(ctx, body, wordmarkTexture(chainForColor(plastic), plastic), KIOSK.w - 0.14, (KIOSK.w - 0.14) / 2.86);
  wm.position.set(0, 0.06 + (KIOSK.counterY - 0.06) / 2, KIOSK.z + KIOSK.d / 2 + 0.003);
  if (p.mark) addOwnerBadge(g, p.mark, p.color, 0, 1.45, 0);
  return g;
}

