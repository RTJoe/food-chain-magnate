/**
 * Marketing campaign minis: billboard (sized to its footprint), mailbox, radio tower, airplane
 * with banner, giant billboard (rural), gourmet guide, plus the campaign number / duration marker.
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { makeBadge, posterTexture } from '../labels.js';
import { blob, face, mesh, owned, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cone, cyl, extrude, lathe, miniGeo, playerPalette, puck, shade, torus } from './kit.js';

export interface CampaignVisual {
  color: string;
  goods: FoodId[];
  number: number;
  remaining: number;
  eternal: boolean;
}

/** Footprint pad with an owner-colour frame, sized w x d world units. */
function padShape(s: Shape, w: number, d: number, color: string): void {
  const pal = playerPalette(color);
  s.add(box(w - 0.12, 0.06, d - 0.12, 0.03), pal.dark, { jitter: 0 });
  s.add(box(w - 0.26, 0.012, d - 0.26, 0.004), P.lot, { at: [0, 0.06, 0], jitter: 0 });
}

/** Number badge + duration pips (or an infinity badge for eternal campaigns). */
export function addCampaignMarker(ctx: MiniCtx, parent: THREE.Object3D, v: CampaignVisual, top: number, pipAnchor: [number, number]): void {
  const pal = playerPalette(v.color);
  const badge = makeBadge(String(v.number), { bg: pal.base, fg: '#fffaf0', ring: pal.dark }, 0.44);
  badge.position.set(0, top, 0);
  badge.name = 'badge';
  parent.add(badge);
  const pips = new THREE.Group();
  pips.name = 'pips';
  pips.position.set(pipAnchor[0], 0.06, pipAnchor[1]);
  parent.add(pips);
  if (v.eternal) {
    const inf = makeBadge('∞', { bg: '#f8d24a', fg: COLORS.ink, ring: COLORS.ink }, 0.3);
    inf.position.set(0.32, top - 0.02, 0);
    inf.name = 'eternal';
    parent.add(inf);
  } else {
    const geo = pipGeo(v.color);
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
// Billboard
// ---------------------------------------------------------------------------

function billboardShape(long: number, color: string, giant: boolean): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  const pw = long - 0.3;
  const ph = giant ? 1.0 : 0.62;
  const y0 = giant ? 0.75 : 0.5;
  const posts = Math.max(2, Math.round(long));
  for (let i = 0; i < posts; i++) {
    const x = -pw / 2 + 0.15 + (i * (pw - 0.3)) / (posts - 1);
    s.add(box(0.12, y0 + ph * 0.6, 0.12, 0.02), P.steelDark, { at: [x, 0.06, -0.08], mat: 'metal' });
    s.add(box(0.22, 0.06, 0.22, 0.02), '#8f8b88', { at: [x, 0.06, -0.08] });
  }
  // Frame + back panel.
  s.add(box(pw + 0.12, ph + 0.12, 0.1, 0.03), pal.dark, { at: [0, y0 - 0.06, 0] });
  s.add(box(pw + 0.04, ph + 0.04, 0.12, 0.02), pal.base, { at: [0, y0 - 0.02, 0.0] });
  // Catwalk and lamps.
  s.add(box(pw, 0.03, 0.22, 0.01), P.steel, { at: [0, y0 - 0.12, 0.14], mat: 'metal' });
  const lamps = Math.max(2, Math.round(long));
  for (let i = 0; i < lamps; i++) {
    const x = -pw / 2 + (pw * (i + 0.5)) / lamps;
    s.add(box(0.03, 0.03, 0.22, 0), P.steelDark, { at: [x, y0 + ph + 0.04, 0.06] });
    s.add(cone(0.06, 0.08, 6), '#3d3b44', { at: [x, y0 + ph - 0.02, 0.18], rot: [Math.PI * 0.75, 0, 0] });
  }
  if (giant) s.add(box(pw + 0.3, 0.12, 0.3, 0.03), pal.dark, { at: [0, y0 + ph + 0.06, 0] });
  return s;
}

export function buildBillboard(ctx: MiniCtx, v: CampaignVisual & { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  const vertical = v.h > v.w;
  const long = Math.max(v.w, v.h);
  const short = Math.min(v.w, v.h);
  const body = new THREE.Group();
  body.rotation.y = vertical ? Math.PI / 2 : 0;
  g.add(body);
  blob(ctx, body, long * 0.95, short * 0.75, true, 0.6);
  solid(ctx, body, miniGeo(`pad:${long}:${short}:${v.color}`, () => {
    const s = new Shape();
    padShape(s, long, short, v.color);
    return s;
  }));
  solid(ctx, body, miniGeo(`billboard:${long}:${v.color}`, () => billboardShape(long, v.color, false)));
  const pw = long - 0.3;
  const tex = posterTexture(v.goods, playerPalette(v.color).base, pw / 0.62);
  const front = face(ctx, body, tex, pw, 0.62);
  front.position.set(0, 0.5 + 0.31, 0.065);
  const back = face(ctx, body, tex, pw, 0.62);
  back.position.set(0, 0.81, -0.065);
  back.rotation.y = Math.PI;
  addCampaignMarker(ctx, body, v, 1.58, [pw / 2 - 0.05, short / 2 - 0.22]);
  return g;
}

export function buildGiantBillboard(ctx: MiniCtx, v: CampaignVisual): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 3.6, 0.9, true, 0.6);
  solid(ctx, g, miniGeo(`giantBillboard:${v.color}`, () => billboardShape(3.6, v.color, true)));
  const pw = 3.3;
  const tex = posterTexture(v.goods, playerPalette(v.color).base, pw);
  const front = face(ctx, g, tex, pw, 1.0);
  front.position.set(0, 1.25, 0.065);
  const back = face(ctx, g, tex, pw, 1.0);
  back.position.set(0, 1.25, -0.065);
  back.rotation.y = Math.PI;
  addCampaignMarker(ctx, g, v, 2.2, [0, 0]);
  return g;
}

// ---------------------------------------------------------------------------
// Mailbox
// ---------------------------------------------------------------------------

function mailboxShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  s.add(cyl(0.04, 0.05, 0.42, 6), P.woodDark, { at: [0, 0.06, 0] });
  s.add(box(0.26, 0.04, 0.4, 0.01), P.woodDark, { at: [0, 0.46, 0] });
  // Body: box + half-cylinder dome (classic rural postbox, chunky).
  s.add(box(0.3, 0.2, 0.5, 0.03), pal.base, { at: [0, 0.5, 0] });
  s.add(cyl(0.15, 0.15, 0.5, 10), pal.base, { at: [0, 0.7, 0.25], rot: [Math.PI / 2, 0, 0] });
  s.add(puck(0.15, 0.03, 10, 0.01), pal.dark, { at: [0, 0.7, 0.26], rot: [Math.PI / 2, 0, 0] });
  s.add(box(0.12, 0.02, 0.02, 0.005), P.white, { at: [0, 0.66, 0.28] });
  // Flag.
  s.add(box(0.025, 0.36, 0.025, 0), '#e2e2e2', { at: [0.17, 0.52, -0.08] });
  s.add(box(0.02, 0.12, 0.17, 0.01), '#f8d24a', { at: [0.17, 0.76, -0.01] });
  // Letters peeking out.
  s.add(box(0.2, 0.02, 0.14, 0.004), P.white, { at: [0, 0.64, 0.3], rot: [0.5, 0, 0] });
  return s;
}

export function buildMailbox(ctx: MiniCtx, v: CampaignVisual & { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, v.w * 0.9, v.h * 0.9, true, 0.5);
  solid(ctx, g, miniGeo(`pad:${v.w}:${v.h}:${v.color}`, () => {
    const s = new Shape();
    padShape(s, v.w, v.h, v.color);
    return s;
  }));
  const box_ = new THREE.Group();
  box_.rotation.y = -0.35;
  g.add(box_);
  solid(ctx, box_, miniGeo(`mailbox:${v.color}`, () => mailboxShape(v.color)));
  // Food poster on the side of the mailbox.
  const icon = face(ctx, box_, posterTexture(v.goods, playerPalette(v.color).dark, 1.4), 0.32, 0.22);
  icon.position.set(0.152, 0.61, 0.02);
  icon.rotation.y = Math.PI / 2;
  const icon2 = face(ctx, box_, posterTexture(v.goods, playerPalette(v.color).dark, 1.4), 0.32, 0.22);
  icon2.position.set(-0.152, 0.61, 0.02);
  icon2.rotation.y = -Math.PI / 2;
  addCampaignMarker(ctx, g, v, 1.18, [v.w / 2 - 0.2, v.h / 2 - 0.2]);
  return g;
}

// ---------------------------------------------------------------------------
// Radio tower
// ---------------------------------------------------------------------------

function radioShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  // Hut.
  s.add(box(0.36, 0.26, 0.3, 0.03), P.cream, { at: [-0.22, 0.06, 0.22] });
  s.add(box(0.42, 0.05, 0.36, 0.02), pal.dark, { at: [-0.22, 0.32, 0.22] });
  s.add(box(0.12, 0.18, 0.02, 0.005), P.woodDark, { at: [-0.22, 0.06, 0.38] });
  // Lattice mast: three tapering legs with bands.
  const H = 1.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const r = 0.17;
    s.add(cyl(0.012, 0.022, H, 4), '#d9dde3', {
      at: [Math.cos(a) * r, 0.06, Math.sin(a) * r],
      rot: [Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1],
      mat: 'metal',
      jitter: 0,
    });
  }
  for (let k = 0; k < 6; k++) {
    const y = 0.16 + k * 0.26;
    const r = 0.17 * (1 - (y - 0.06) / (H * 1.12));
    s.add(torus(r, 0.012, 3), k % 2 ? '#e8e8e8' : pal.base, { at: [0, y, 0], jitter: 0 });
  }
  s.add(cyl(0.012, 0.012, 0.3, 4), '#d9dde3', { at: [0, H, 0] });
  s.add(ball(0.05, 0), '#e25b4b', { at: [0, H + 0.32, 0], mat: 'glow' });
  // Dish.
  s.add(lathe([[0, 0], [0.12, 0.03], [0.16, 0.08]], 8), '#eeeeee', { at: [0.08, 1.0, 0.05], rot: [Math.PI / 2, 0.6, 0] });
  return s;
}

export function buildRadio(ctx: MiniCtx, v: CampaignVisual & { w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, v.w * 0.9, v.h * 0.9, true, 0.5);
  solid(ctx, g, miniGeo(`pad:${v.w}:${v.h}:${v.color}`, () => {
    const s = new Shape();
    padShape(s, v.w, v.h, v.color);
    return s;
  }));
  solid(ctx, g, miniGeo(`radio:${v.color}`, () => radioShape(v.color)));
  // Pulse rings (animated by the scene's ambient loop).
  const pal = playerPalette(v.color);
  const rings = new THREE.Group();
  rings.name = 'radioRings';
  rings.position.y = 1.92;
  g.add(rings);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      torus(0.3, 0.02, 20),
      ctx.ghost ?? owned(new THREE.MeshBasicMaterial({ color: shade(pal.base, 0.2), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })),
    );
    m.userData.phase = i / 3;
    rings.add(m);
  }
  g.userData.ambient = 'radio';
  // Small poster on the hut.
  const icon = face(ctx, g, posterTexture(v.goods, pal.base, 1.2), 0.26, 0.2);
  icon.position.set(-0.22, 0.2, 0.39);
  addCampaignMarker(ctx, g, v, 2.35, [v.w / 2 - 0.2, -v.h / 2 + 0.2]);
  return g;
}

// ---------------------------------------------------------------------------
// Airplane
// ---------------------------------------------------------------------------

/** Airplane body (nose at +x); shared with the flying actor in `vehicles.ts`. */
export function planeShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  // Fuselage along +x (nose at +x).
  s.add(
    lathe(
      [
        [0, -0.62],
        [0.08, -0.55],
        [0.13, -0.2],
        [0.16, 0.15],
        [0.15, 0.38],
        [0.1, 0.5],
        [0, 0.54],
      ],
      10,
    ),
    P.white,
    { rot: [0, 0, -Math.PI / 2] },
  );
  s.add(lathe([[0.162, -0.02], [0.17, 0.0], [0.17, 0.16], [0.162, 0.18]], 10), pal.base, { rot: [0, 0, -Math.PI / 2] });
  // Cockpit.
  s.add(ball(0.1, 1), P.windowDark, { at: [0.18, 0.11, 0], scale: [1.4, 0.8, 0.9], mat: 'glass' });
  // Wings (high wing).
  s.add(box(0.3, 0.04, 1.3, 0.015), pal.base, { at: [0.08, 0.13, 0] });
  s.add(box(0.06, 0.042, 1.31, 0.01), P.white, { at: [0.14, 0.13, 0] });
  // Struts.
  for (const z of [-0.32, 0.32]) s.add(cyl(0.012, 0.012, 0.26, 4), P.steelDark, { at: [0.08, -0.12, z * 0.6], rot: [z > 0 ? -0.9 : 0.9, 0, 0] });
  // Tail.
  s.add(box(0.2, 0.03, 0.5, 0.01), pal.base, { at: [-0.5, 0.02, 0] });
  s.add(box(0.22, 0.24, 0.03, 0.01), pal.base, { at: [-0.5, 0.02, 0], rot: [0, 0, 0.2] });
  // Wheels.
  for (const z of [-0.12, 0.12]) s.add(cyl(0.045, 0.045, 0.03, 8), '#3d3b44', { at: [0.18, -0.2, z], rot: [Math.PI / 2, 0, 0] });
  s.add(box(0.02, 0.1, 0.26, 0), P.steelDark, { at: [0.18, -0.2, 0] });
  // Nose cone.
  s.add(cone(0.05, 0.08, 8), pal.dark, { at: [0.56, 0, 0], rot: [0, 0, -Math.PI / 2] });
  return s;
}

export function propShape(): Shape {
  const s = new Shape();
  s.add(box(0.02, 0.36, 0.05, 0.008), '#3d3b44', { at: [0, -0.18, 0] });
  return s;
}

export function buildAirplane(ctx: MiniCtx, v: CampaignVisual & { width: number }): THREE.Group {
  const g = new THREE.Group();
  const pal = playerPalette(v.color);
  // Shadow strip on the rim beneath the covered rows.
  const strip = new THREE.Mesh(
    owned(new THREE.PlaneGeometry(v.width - 0.1, 1.0).rotateX(-Math.PI / 2)),
    ctx.ghost ?? owned(new THREE.MeshBasicMaterial({ color: pal.base, transparent: true, opacity: 0.32, depthWrite: false })),
  );
  strip.position.y = 0.075;
  strip.name = 'strip';
  g.add(strip);
  blob(ctx, g, Math.min(1.4, v.width * 0.6), 0.9, false, 0.7);
  // Flying group bobs (ambient).
  const fly = new THREE.Group();
  fly.name = 'fly';
  fly.position.y = 2.1;
  g.add(fly);
  g.userData.ambient = 'plane';
  const plane = new THREE.Group();
  plane.position.x = v.width / 2 - 0.55;
  plane.rotation.z = 0.04;
  fly.add(plane);
  solid(ctx, plane, miniGeo(`plane:${v.color}`, () => planeShape(v.color)));
  const prop = mesh(ctx, plane, miniGeo('prop', propShape), false);
  prop.position.set(0.61, 0, 0);
  prop.name = 'prop';
  // Leaflet spawn point under the fuselage (airplane sweep, animation-plan §2.9).
  const leaflet = new THREE.Object3D();
  leaflet.name = 'leaflet';
  leaflet.position.set(0, -0.22, 0);
  plane.add(leaflet);
  // Banner trailing behind (towards -x): rope + cloth with the poster.
  const bannerLen = Math.max(0.8, v.width - 1.35);
  const rope = new THREE.Mesh(cyl(0.008, 0.008, 0.32, 3), ctx.ghost ?? owned(new THREE.MeshBasicMaterial({ color: 0x4a4650 })));
  rope.rotation.z = Math.PI / 2;
  rope.position.set(plane.position.x - 0.62 - 0.0, 0, 0);
  fly.add(rope);
  const tex = posterTexture(v.goods, pal.base, bannerLen / 0.42, v.number);
  const bannerGeo = owned(new THREE.PlaneGeometry(bannerLen, 0.42, 12, 1));
  const bannerMat = ctx.ghost ?? owned(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(plane.position.x - 0.78 - bannerLen / 2, 0, 0);
  banner.name = 'banner';
  banner.castShadow = !ctx.ghost;
  banner.userData.base = (bannerGeo.attributes.position!.array as Float32Array).slice();
  fly.add(banner);
  addCampaignMarker(ctx, g, v, 2.95, [v.width / 2 - 0.2, 0.25]);
  return g;
}

/** Wave the banner and spin the prop (called per frame for planes). */
export function animatePlane(g: THREE.Object3D, t: number): void {
  const fly = g.getObjectByName('fly');
  if (fly) {
    fly.position.y = 2.1 + Math.sin(t * 1.3 + g.id) * 0.06;
    fly.rotation.x = Math.sin(t * 0.9 + g.id) * 0.03;
  }
  const prop = g.getObjectByName('prop');
  if (prop) prop.rotation.x = t * 30;
  const banner = g.getObjectByName('banner') as THREE.Mesh | undefined;
  if (banner) {
    const base = banner.userData.base as Float32Array;
    const pos = banner.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const len = (banner.geometry as THREE.PlaneGeometry).parameters.width;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!;
      const u = (len / 2 - x) / len;
      arr[i * 3 + 2] = Math.sin(t * 5 - u * 7) * 0.06 * u;
    }
    pos.needsUpdate = true;
  }
}

export function animateRadio(g: THREE.Object3D, t: number): void {
  const rings = g.getObjectByName('radioRings');
  if (!rings) return;
  for (const r of rings.children) {
    const ph = ((t * 0.6 + (r.userData.phase as number)) % 1 + 1) % 1;
    r.scale.setScalar(0.3 + ph * 1.6);
    const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial;
    if (m.transparent) m.opacity = 0.85 * (1 - ph);
  }
}

// ---------------------------------------------------------------------------
// Gourmet guide (Ketchup, off-board)
// ---------------------------------------------------------------------------

function guideShape(color: string): Shape {
  const pal = playerPalette(color);
  const s = new Shape();
  s.add(box(0.9, 0.06, 0.7, 0.03), pal.dark, { jitter: 0 });
  s.add(cyl(0.05, 0.07, 0.5, 6), P.woodDark, { at: [0, 0.06, 0] });
  s.add(box(0.5, 0.06, 0.4, 0.02), P.wood, { at: [0, 0.54, 0], rot: [0.5, 0, 0] });
  // Open book: two tilted pages and a cover.
  s.add(box(0.62, 0.035, 0.44, 0.01), pal.base, { at: [0, 0.6, 0.02], rot: [0.5, 0, 0] });
  s.add(box(0.28, 0.03, 0.4, 0.005), P.white, { at: [-0.15, 0.63, 0.02], rot: [0.5, 0, 0.12] });
  s.add(box(0.28, 0.03, 0.4, 0.005), P.white, { at: [0.15, 0.63, 0.02], rot: [0.5, 0, -0.12] });
  // Ribbon + stars.
  s.add(box(0.03, 0.01, 0.22, 0), '#d94f3d', { at: [0.02, 0.62, 0.22], rot: [0.8, 0, 0] });
  for (let i = 0; i < 3; i++)
    s.add(extrude('star', guideStar, 0.04, 0.005), '#f8d24a', { at: [-0.16 + i * 0.16, 0.95, -0.05], scale: 0.07 });
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
  blob(ctx, g, 1.1, 0.9, true, 0.6);
  solid(ctx, g, miniGeo(`guide:${v.color}`, () => guideShape(v.color)));
  const icon = face(ctx, g, posterTexture(v.goods, playerPalette(v.color).base, 1.3), 0.3, 0.22);
  icon.position.set(0.15, 0.665, 0.03);
  icon.rotation.set(-(Math.PI / 2 - 0.5), 0, 0);
  addCampaignMarker(ctx, g, v, 1.4, [0.32, 0.22]);
  return g;
}
