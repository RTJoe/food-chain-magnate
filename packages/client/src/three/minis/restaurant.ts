/**
 * Restaurant (2x2) and coffee shop (1x1). Built with the entrance at the SE corner and rotated
 * to the real entrance corner. Original "streamline diner" design: rounded entrance corner, window
 * band, player-colour roof and striped awning, tall round sign on the entrance corner.
 */
import * as THREE from 'three';
import type { Corner, RestaurantStatus } from '@fcm/engine';
import { cornerAngle } from '../coords.js';
import { signTexture } from '../labels.js';
import { blob, face, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cone, cyl, extrude, lathe, miniGeo, playerPalette, puck, shade } from './kit.js';

export interface RestaurantParams {
  color: string;
  status: RestaurantStatus;
  entrance: Corner;
  driveIn: boolean;
  /** 1–2 letter chain mark shown on the sign. */
  mark: string;
}

const CYL_R = 0.38;

/** Body footprint: union of two boxes and a cylinder that rounds the SE corner. */
function bodyParts(s: Shape, h: number, grow: number, c: string | THREE.Color, y: number, mat: 'body' | 'glass' = 'body'): void {
  const x0 = -0.82 - grow;
  const z0 = -0.8 - grow;
  const cx = 0.2;
  const cz = 0.16;
  const r = CYL_R + grow;
  // Box A: full width, back part.
  s.add(box(cx + r - x0, h, cz - z0, 0.03), c, { at: [(x0 + cx + r) / 2, y, (z0 + cz) / 2], mat, jitter: 0 });
  // Box B: front-left part.
  s.add(box(cx - x0, h, r, 0.03), c, { at: [(x0 + cx) / 2, y, cz + r / 2], mat, jitter: 0 });
  // Rounded corner.
  s.add(cyl(r, r, h, 14), c, { at: [cx, y, cz], mat, jitter: 0 });
}

function restaurantShape(color: string, status: RestaurantStatus): Shape {
  const pal = playerPalette(color);
  const derelict = status === 'derelict';
  const base = derelict ? '#8f8b88' : pal.base;
  const dark = derelict ? '#6c6866' : pal.dark;
  const wall = derelict ? '#b9b3aa' : P.cream;
  const s = new Shape();
  // Base and forecourt.
  s.add(box(1.86, 0.07, 1.86, 0.035), P.lot, { jitter: 0 });
  s.add(box(1.0, 0.012, 0.5, 0.005), P.stone, { at: [0.5, 0.07, 0.72], rot: [0, -Math.PI / 4, 0] });
  // Walls, window band and chrome stripe.
  bodyParts(s, 0.74, 0, wall, 0.08);
  if (derelict) {
    bodyParts(s, 0.2, 0.012, '#8a7a66', 0.34);
  } else {
    bodyParts(s, 0.22, 0.012, P.windowDark, 0.33, 'glass');
    bodyParts(s, 0.07, 0.02, base, 0.18);
    bodyParts(s, 0.03, 0.022, '#e6e9ee', 0.6);
  }
  // Roof slab + trim.
  bodyParts(s, 0.1, 0.08, dark, 0.82);
  bodyParts(s, 0.05, 0.1, base, 0.86);
  // Door on the rounded corner (facing SE).
  const a = Math.PI / 4;
  const dx = 0.2 + Math.sin(a) * (CYL_R + 0.01);
  const dz = 0.16 + Math.cos(a) * (CYL_R + 0.01);
  s.add(box(0.3, 0.46, 0.05, 0.015), derelict ? '#6e4a2f' : '#f4f6f8', { at: [dx, 0.08, dz], rot: [0, a, 0] });
  s.add(box(0.22, 0.38, 0.06, 0.01), derelict ? '#5a3c26' : P.window, { at: [dx, 0.1, dz], rot: [0, a, 0], mat: derelict ? 'body' : 'glass' });
  if (!derelict) {
    // Striped awning around the rounded corner.
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const ang = -0.15 + t * (Math.PI / 2 + 0.3);
      const rr = CYL_R + 0.13;
      s.add(box(0.15, 0.04, 0.3, 0.01), i % 2 ? P.white : base, {
        at: [0.2 + Math.sin(ang) * rr, 0.66, 0.16 + Math.cos(ang) * rr],
        rot: [0.45, ang, 0],
        jitter: 0,
      });
    }
    // Side awnings over the window bands.
    for (let i = 0; i < 5; i++) {
      s.add(box(0.2, 0.035, 0.24, 0.01), i % 2 ? P.white : base, { at: [-0.7 + i * 0.2, 0.66, 0.66], rot: [0.45, 0, 0], jitter: 0 });
      s.add(box(0.24, 0.035, 0.2, 0.01), i % 2 ? P.white : base, { at: [0.71, 0.66, -0.66 + i * 0.2], rot: [0, 0, -0.45], jitter: 0 });
    }
    // Rooftop units.
    s.add(box(0.36, 0.2, 0.3, 0.03), P.steel, { at: [-0.4, 0.91, -0.42], mat: 'metal' });
    s.add(cyl(0.06, 0.06, 0.18, 6), P.steelDark, { at: [-0.05, 0.91, -0.5] });
    // Planters by the door.
    for (const [x, z] of [
      [0.82, 0.26],
      [0.26, 0.82],
    ] as const) {
      s.add(box(0.18, 0.12, 0.18, 0.03), dark, { at: [x, 0.07, z] });
      s.add(ball(0.1, 0), P.leafLight, { at: [x, 0.24, z] });
    }
  } else {
    // Boards across the door and a weed.
    s.add(box(0.4, 0.05, 0.03, 0.005), P.wood, { at: [dx, 0.3, dz + 0.02], rot: [0, a, 0.5] });
    s.add(box(0.4, 0.05, 0.03, 0.005), P.wood, { at: [dx, 0.3, dz + 0.02], rot: [0, a, -0.5] });
    s.add(cone(0.08, 0.16, 5), '#7c9a52', { at: [0.8, 0.07, 0.5] });
  }
  // Bins at the back.
  s.add(box(0.22, 0.2, 0.16, 0.03), '#4c6a5a', { at: [-0.7, 0.07, -0.88] });
  return s;
}

function signPole(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  s.add(box(0.2, 0.06, 0.2, 0.02), P.steelDark, { jitter: 0 });
  s.add(cyl(0.035, 0.045, 1.22, 6), '#d8dce2', { at: [0, 0.06, 0], mat: 'metal' });
  // Round sign: rim in player colour, cream face, decal on both sides (added separately).
  s.add(puck(0.36, 0.1, 16, 0.025), pal.dark, { at: [0, 1.48, -0.05], rot: [Math.PI / 2, 0, 0] });
  s.add(puck(0.3, 0.12, 16, 0.02), pal.base, { at: [0, 1.48, -0.06], rot: [Math.PI / 2, 0, 0] });
  // Star on top.
  s.add(
    extrude('star', starShape, 0.06, 0.01),
    '#f8d24a',
    { at: [0, 1.9, 0], scale: 0.13 },
  );
  return s;
}

function starShape(): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  sh.closePath();
  return sh;
}

function scaffoldShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  s.add(box(1.86, 0.07, 1.86, 0.035), '#d8c9a3', { jitter: 0 });
  s.add(box(1.5, 0.02, 1.4, 0.01), '#c7b48a', { at: [-0.1, 0.07, -0.1] });
  // Foundations.
  s.add(box(1.4, 0.1, 1.3, 0.02), '#c9c4bb', { at: [-0.12, 0.07, -0.15] });
  // Scaffold poles and rails.
  const xs = [-0.86, -0.12, 0.62];
  const zs = [-0.84, -0.15, 0.54];
  for (const x of xs) for (const z of zs) if (x !== -0.12 || z !== -0.15) s.add(cyl(0.025, 0.025, 1.0, 5), '#e8a530', { at: [x, 0.07, z], jitter: 0 });
  for (const y of [0.45, 0.98]) {
    for (const z of [-0.84, 0.54]) s.add(box(1.5, 0.035, 0.035, 0), '#e8a530', { at: [-0.12, y, z], jitter: 0 });
    for (const x of [-0.86, 0.62]) s.add(box(0.035, 0.035, 1.4, 0), '#e8a530', { at: [x, y, -0.15], jitter: 0 });
  }
  // Planks.
  s.add(box(1.5, 0.03, 0.22, 0.005), P.wood, { at: [-0.12, 0.46, 0.66] });
  s.add(box(0.22, 0.03, 1.4, 0.005), P.wood, { at: [0.74, 0.46, -0.15] });
  // Materials pile and a cone.
  s.add(box(0.3, 0.12, 0.2, 0.02), '#c9c4bb', { at: [0.7, 0.07, 0.78] });
  s.add(box(0.24, 0.1, 0.16, 0.02), pal.base, { at: [0.7, 0.19, 0.78] });
  s.add(cone(0.08, 0.2, 8), '#f08a3c', { at: [0.4, 0.07, 0.85] });
  return s;
}

const ghostWalls = new Map<string, THREE.Material>();
function ghostWall(color: string): THREE.Material {
  let m = ghostWalls.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: shade(color, 0.6), transparent: true, opacity: 0.42, roughness: 0.5, depthWrite: false, flatShading: true });
    ghostWalls.set(color, m);
  }
  return m;
}

export function buildRestaurant(ctx: MiniCtx, p: RestaurantParams): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.rotation.y = cornerAngle(p.entrance);
  g.add(body);
  blob(ctx, body, 2.2, 2.2, true, 0.8);
  const pal = playerPalette(p.color);
  if (p.status === 'comingSoon') {
    solid(ctx, body, miniGeo(`scaffold:${p.color}`, () => scaffoldShape(p.color)));
    // Translucent future building.
    const ghostGeo = miniGeo('restaurantGhostVolume', () => {
      const s = new Shape();
      bodyParts(s, 0.82, 0, '#ffffff', 0.17);
      return s;
    });
    const m = new THREE.Mesh(ghostGeo, ctx.ghost ?? ghostWall(p.color));
    m.renderOrder = 2;
    body.add(m);
    // "SOON" banner on the scaffold front.
    const banner = face(ctx, body, signTexture('SOON', pal.base, '#fffaf0'), 0.9, 0.34);
    banner.position.set(-0.12, 0.72, 0.575);
    const back = face(ctx, body, signTexture('SOON', pal.base, '#fffaf0'), 0.9, 0.34);
    back.position.set(0.645, 0.72, -0.15);
    back.rotation.y = Math.PI / 2;
  } else {
    solid(ctx, body, miniGeo(`restaurant:${p.status}:${p.color}`, () => restaurantShape(p.color, p.status)));
  }
  if (p.status !== 'derelict') {
    const sign = new THREE.Group();
    sign.name = 'sign';
    sign.position.set(0.8, 0, 0.8);
    sign.rotation.y = Math.PI / 4;
    body.add(sign);
    solid(ctx, sign, miniGeo(`sign:${p.color}`, () => signPole(p.color)));
    const tex = signTexture(p.mark, pal.base, '#fffaf0');
    for (const side of [1, -1]) {
      const f = face(ctx, sign, tex, 0.5, 0.19, true);
      f.position.set(0, 1.48, side > 0 ? 0.072 : -0.072);
      if (side < 0) f.rotation.y = Math.PI;
      if (p.status === 'comingSoon') {
        f.material = ctx.ghost ?? faceGhost(tex);
      }
    }
  }
  if (p.driveIn && p.status === 'open') addDriveIn(ctx, g, p.color);
  return g;
}

const faceGhosts = new Map<string, THREE.Material>();
function faceGhost(tex: THREE.Texture): THREE.Material {
  let m = faceGhosts.get(tex.uuid);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
    faceGhosts.set(tex.uuid, m);
  }
  return m;
}

/** Drive-in markers: an outward arrow on every corner of the footprint. */
function addDriveIn(ctx: MiniCtx, g: THREE.Group, color: string): void {
  const geo = miniGeo(`driveArrow:${color}`, () => {
    const s = new Shape();
    s.add(extrude('arrow', arrowShape, 0.03, 0.008), playerPalette(color).base, { rot: [-Math.PI / 2, 0, 0], scale: 0.22, jitter: 0 });
    s.add(extrude('arrow', arrowShape, 0.03, 0.008), P.white, { at: [0, -0.012, 0], rot: [-Math.PI / 2, 0, 0], scale: 0.27, jitter: 0 });
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

export function buildCoffeeShop(ctx: MiniCtx, p: { color: string }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 1.1, 1.1, true, 0.7);
  solid(ctx, g, miniGeo(`coffee:${p.color}`, () => coffeeShape(p.color)));
  return g;
}

