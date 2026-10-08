/**
 * Vehicle and character actors for animations (animation-plan §3, WP-B): delivery van, scooter
 * with errand boy, hand cart with operator, truck, zeppelin, airplane with banner, mailman.
 *
 * Every actor follows the pool contract (animation-plan "Interfaces (frozen)", `anim/pool.ts`), so
 * `followClip` can drive any of them:
 * - `root` sits at the lane point: the follower sets `root.position` to (x, follow.y, z), i.e.
 *   `ROAD_Y` on roads and `AIR_Y.*` in the air. Wheels touch the asphalt at `ROAD_Y`.
 * - `body` (child named `'body'`) is the only object the follower rotates: `body.rotation.y = yaw`,
 *   nose at local +x (`yawOf(dx, dz)` for a travel direction on the board).
 * - The shadow blob is a round sibling of `body` under the root and is pinned to the ground (world
 *   y), shrinking with height, so aircraft keep their shadow on the board.
 * - The origin is the centre of the footprint (between the axles; the middle of cart + operator).
 * - Anchors under `body`: `cargo` (tokens / crates ride here, see `CARGO_SLOTS`) and `drop`
 *   (leaflet / envelope spawn).
 * - Motion is automatic: on every render the root measures how far it moved, wheels roll by that
 *   distance, propellers spin, figures walk and bob, aircraft float and bank into turns, cars lean
 *   a little. `vehicleOf(root).tick(dt, t, moved)` drives it by hand (tests, previews).
 *
 * Draw calls: every part is an instanced proxy (`ctx.inst`). Hull geometry is cached per kind ×
 * colour, wheels / legs / propellers share geometry across kinds and colours, and the chain-mark
 * decal shares one instanced pool per mark. N vans of one chain cost the same draw calls as one.
 * `lite` (phone tier) bakes wheels into the hull and drops the decal and the ground shadow: one
 * instance per ground vehicle.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FoodId } from '@fcm/engine';
import { ROAD_TOP } from '../coords.js';
import { AIR_Y, ROAD_Y } from '../anim/path.js';
import { badgeTexture, chainMarkTexture, chainOfColor } from '../labels.js';
import { blob, mesh, owned, releaseTree, solid, type MiniCtx } from './ctx.js';
import { Shape, ball, box, color, cone, cyl, hull, lathe, miniGeo, playerPalette, puck, shade, type Paint, type PartOpts } from './kit.js';
import { MARKETING_PLASTIC, signFaceTexture } from './marketing.js';

export type VehicleKind = 'van' | 'scooter' | 'cart' | 'truck' | 'zeppelin' | 'airplane' | 'mailman';

export interface ActorSpec {
  /** Chain (player) base colour. */
  color: string;
  /** 1–2 letter chain mark for the side decal (`chainMark`). Omitted: no decal. */
  mark?: string;
  /** Phone tier: wheels baked in, no decal, no ground shadow. */
  lite?: boolean;
  /** Airplane banner goods (poster). Omitted: plain chain-colour banner. */
  goods?: FoodId[];
}

export interface Actor {
  readonly kind: VehicleKind;
  /** Moved by the follower: (x, lane y, z). */
  readonly root: THREE.Group;
  /** Yawed by the follower; forward is local +x. */
  readonly body: THREE.Group;
  /** Model scale, bob and bank (owned by the actor; never set by the follower). */
  readonly rig: THREE.Group;
  /** Carried props go here (`CARGO_SLOTS`). */
  readonly cargo: THREE.Object3D;
  /** Leaflet / envelope spawn point. */
  readonly drop: THREE.Object3D;
  /** Advance motion by hand. `moved` defaults to the distance `root` moved since the last tick. */
  tick(dt: number, t: number, moved?: number): void;
  /** Back to the rest pose (call before re-using a pooled actor). Leaves `cargo` children alone. */
  reset(): void;
  /** Release instanced slots and owned resources (one-off actors; pooled actors are hidden instead). */
  dispose(): void;
}

export { AIR_Y, LANE, ROAD_Y } from '../anim/path.js';
/**
 * Model scale per kind. The models are built at the plan's sizes (animation-plan §3); at the default
 * board camera they read as specks, so the rig is scaled up. Ground vehicles stay ≤ 0.46 wide, so
 * they fit a lane (offset `LANE`) on the 0.78-wide road with only a sliver of overlap when two
 * pass head-on.
 */
export const ACTOR_SCALE: Record<VehicleKind, number> = { van: 1.4, scooter: 1.5, cart: 1.4, truck: 1.4, zeppelin: 1.8, airplane: 1, mailman: 1.5 };
/** Actor length along +x in world units, scale included (spacing, stop points). */
export const ACTOR_LENGTH: Record<VehicleKind, number> = { van: 0.87, scooter: 0.63, cart: 1.01, truck: 0.98, zeppelin: 1.73, airplane: 1.2, mailman: 0.24 };

/**
 * Where carried props sit, relative to `cargo` (rig units, before `ACTOR_SCALE`): goods tokens at
 * `CARRY_SCALE` on the van roof (2 x 2), crates (`CRATE_W`) on beds and racks. Fill in order;
 * beyond the list, stack on the last slot or show a "×N" chip.
 */
export const CARGO_SLOTS: Record<VehicleKind, [number, number, number][]> = {
  van: [
    [0.09, 0, 0.07],
    [0.09, 0, -0.07],
    [-0.09, 0, 0.07],
    [-0.09, 0, -0.07],
  ],
  scooter: [
    [0, 0, 0],
    [0, 0.105, 0],
  ],
  cart: [
    [0.085, 0, 0],
    [-0.09, 0, 0],
    [0.085, 0.105, 0],
    [-0.09, 0.105, 0],
  ],
  truck: [
    [0.12, 0, 0],
    [-0.01, 0, 0],
    [-0.14, 0, 0],
    [0.12, 0.105, 0],
  ],
  zeppelin: [
    [0.06, 0, 0],
    [-0.06, 0, 0],
  ],
  airplane: [[0, 0, 0]],
  mailman: [[0, 0, 0]],
};

/** Body yaw for travel direction (dx, dz) in board space (forward = +x). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** Lane height for a kind (where the follower puts `root.position.y`). */
export function laneY(kind: VehicleKind): number {
  return kind === 'zeppelin' ? AIR_Y.zeppelin : kind === 'airplane' ? AIR_Y.airplane : ROAD_Y;
}

/** Put an actor at board point (x, z) at its lane height, facing `yaw`. */
export function place(a: Actor, x: number, z: number, yaw: number, y = laneY(a.kind)): void {
  a.root.position.set(x, y, z);
  a.body.rotation.y = yaw;
}

/** The vehicle handle behind a pooled root object. */
export function vehicleOf(o: THREE.Object3D): Actor | undefined {
  return o.userData.vehicle as Actor | undefined;
}

/** Rig offset so wheels touch the road top when the root is at `ROAD_Y`. */
const GROUND_OFFSET = ROAD_TOP + 0.002 - ROAD_Y;

// ---------------------------------------------------------------------------
// Plastic tones (art bible §6, §6.14): every vehicle and figure is one plastic colour per chain,
// like the Special Edition minis; value steps stand in for sculpted relief, as on the restaurants
// ---------------------------------------------------------------------------

interface Tones {
  main: THREE.Color;
  /** Raised trims catching light (bumpers, hubs, lamps, roof caps). */
  hi: THREE.Color;
  /** Undersides and concave areas (chassis, tyres, seats). */
  ao: THREE.Color;
  /** Recesses: windows, grilles, wheel arches. */
  deep: THREE.Color;
}

function tones(css: string): Tones {
  const base = playerPalette(css).base;
  return { main: color(base), hi: shade(base, 0.16), ao: shade(base, -0.14), deep: shade(base, -0.34) };
}

type Add = (geo: THREE.BufferGeometry, paint: Paint, opts?: PartOpts) => void;
/** Adds plastic parts with the restaurants' low jitter. */
const plastic =
  (s: Shape): Add =>
  (geo, paint, opts = {}) =>
    void s.add(geo, paint, { mat: 'plastic', jitter: 0.012, ...opts });

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

/** Wheel centred at the origin, axle along z, in the chain plastic; a raised hub bar shows the spin. */
function wheelShape(r: number, w: number, css: string, seg = 8): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  add(cyl(r, r, w, seg), t.ao, { at: [0, 0, -w / 2], rot: [Math.PI / 2, 0, 0], jitter: 0 });
  // One hub drum through both faces and one bar across it: ~70 tris per wheel.
  add(cyl(r * 0.55, r * 0.55, w + 0.012, 6), t.hi, { at: [0, 0, -w / 2 - 0.006], rot: [Math.PI / 2, 0, 0], jitter: 0 });
  add(box(r * 1.3, r * 0.22, w + 0.016, 0), t.deep, { at: [0, -r * 0.11, 0], jitter: 0 });
  return s;
}

/** Wheels are cached per size and colour (one plastic per chain); shared across kinds. */
function wheelGeo(r: number, w: number, css: string): THREE.BufferGeometry {
  return miniGeo(`v:wheel:${r}:${w}:${css}`, () => wheelShape(r, w, css));
}

/** Leg pivoting at the hip (top at y = 0), in the figure's plastic. */
function legGeo(css: string): THREE.BufferGeometry {
  return miniGeo(`v:leg:${css}`, () => {
    const t = tones(css);
    const s = new Shape();
    const add = plastic(s);
    add(box(0.045, 0.1, 0.05, 0.012), t.ao, { at: [0, -0.1, 0] });
    add(box(0.06, 0.025, 0.05, 0.01), t.deep, { at: [0.008, -0.118, 0], jitter: 0 });
    return s;
  });
}

/**
 * Torso + head + cap of a standing figure in one plastic (hips at y = 0, facing +x): tunic in the
 * main tone, face and hands a step lighter, cap a step darker, as a single-colour sculpt reads.
 */
function figureTop(s: Shape, t: Tones, at: [number, number, number] = [0, 0, 0], arms: 'down' | 'push' | 'bars' = 'down'): void {
  const [x, y, z] = at;
  const add = plastic(s);
  add(
    lathe(
      [
        [0, 0],
        [0.055, 0.005],
        [0.062, 0.06],
        [0.058, 0.11],
        [0.035, 0.135],
        [0, 0.14],
      ],
      8,
    ),
    t.main,
    { at: [x, y - 0.01, z] },
  );
  add(ball(0.056, 1), t.hi, { at: [x, y + 0.18, z] });
  add(puck(0.058, 0.035, 8, 0.01), t.ao, { at: [x - 0.004, y + 0.205, z] });
  add(box(0.06, 0.012, 0.08, 0), t.ao, { at: [x + 0.045, y + 0.21, z] });
  for (const side of [1, -1]) {
    const zz = z + side * 0.07;
    if (arms === 'down') add(box(0.034, 0.11, 0.034, 0), t.main, { at: [x, y + 0.02, zz], rot: [0, 0, 0.12] });
    else add(box(0.12, 0.032, 0.032, 0), t.main, { at: [x + 0.06, y + (arms === 'bars' ? 0.1 : 0.07), zz], rot: [0, 0, arms === 'bars' ? 0.35 : 0.2] });
    if (arms !== 'down') add(ball(0.02, 0), t.hi, { at: [x + 0.13, y + (arms === 'bars' ? 0.08 : 0.055), zz] });
  }
}

/** Two-sided chain-mark roundel (left and right flanks), UV-mapped for the mark texture. */
const decalGeos = new Map<string, THREE.BufferGeometry>();
function decalGeo(key: string, w: number, h: number, halfDepth: number, at: [number, number]): THREE.BufferGeometry {
  let g = decalGeos.get(key);
  if (!g) {
    const a = new THREE.PlaneGeometry(w, h).translate(at[0], at[1], halfDepth + 0.003);
    const b = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(at[0], at[1], -halfDepth - 0.003);
    g = mergeGeometries([a, b])!;
    g.computeBoundingSphere();
    g.userData.key = `v:decal:${key}`;
    decalGeos.set(key, g);
  }
  return g;
}

/** White decal of the chain mark (art bible §6.14): the chain's glyph when the colour names a chain, else its letters. */
const decalMats = new Map<string, THREE.Material>();
function decalMat(mark: string, css: string): THREE.Material {
  const pal = playerPalette(css);
  const chain = chainOfColor(css);
  const k = `${chain ?? mark}:${pal.base}`;
  let m = decalMats.get(k);
  if (!m) {
    const map = chain ? chainMarkTexture(chain, pal.dark) : badgeTexture(mark, { bg: '#fffaf0', fg: pal.dark, ring: pal.dark });
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0, alphaTest: 0.5, envMapIntensity: 0.5 });
    decalMats.set(k, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Actor implementation
// ---------------------------------------------------------------------------

interface Rig {
  wheels: { o: THREE.Object3D; r: number }[];
  spinners: { o: THREE.Object3D; rate: number }[];
  legs: THREE.Object3D[];
  walker: THREE.Object3D | null;
  stride: number;
  /** Bank gain per rad/s of yaw rate: > 0 leans out (cars), < 0 banks into the turn (aircraft). */
  bank: number;
  maxBank: number;
  float: number;
  banner: THREE.Mesh | null;
  shadow: THREE.Object3D | null;
}

/** Root that runs the actor's motion on every render (no per-frame hook needed by callers). */
class ActorRoot extends THREE.Group {
  impl: ActorImpl | null = null;
  private lastNow = -1;
  override updateMatrixWorld(force?: boolean): void {
    const a = this.impl;
    if (a && this.visible) {
      const now = performance.now() / 1000;
      if (this.lastNow >= 0 && now > this.lastNow) a.tick(Math.min(0.1, now - this.lastNow), now);
      this.lastNow = now;
    } else this.lastNow = -1;
    super.updateMatrixWorld(force);
  }
}

/** Keeps the shadow on the ground (world y) under a root that may fly; shrinks with height. */
class GroundShadow extends THREE.Group {
  override updateMatrixWorld(force?: boolean): void {
    const p = this.parent;
    if (p) {
      const py = p.matrixWorld.elements[13]!;
      const sy = p.matrixWorld.elements[5]! || 1;
      const ground = ROAD_TOP - 0.004; // blob sits 0.006 above: just over the asphalt
      this.position.y = (ground - py) / sy;
      this.scale.setScalar(THREE.MathUtils.clamp(1 - (py - ROAD_Y) * 0.16, 0.5, 1));
    }
    super.updateMatrixWorld(force);
  }
}

class ActorImpl implements Actor {
  readonly root = new ActorRoot();
  readonly body = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly cargo = new THREE.Object3D();
  readonly drop = new THREE.Object3D();
  private dist = 0;
  private last: THREE.Vector3 | null = null;
  private lastYaw: number | null = null;
  private roll = 0;
  private walkAmt = 0;
  readonly parts: Rig = { wheels: [], spinners: [], legs: [], walker: null, stride: 0.2, bank: 0.02, maxBank: 0.06, float: 0, banner: null, shadow: null };

  constructor(readonly kind: VehicleKind, private readonly modelY: number) {
    this.root.name = `actor:${kind}`;
    this.body.name = 'body';
    this.rig.name = 'rig';
    this.cargo.name = 'cargo';
    this.drop.name = 'drop';
    this.root.add(this.body);
    this.body.add(this.rig);
    this.rig.add(this.cargo, this.drop);
    this.root.userData.vehicle = this;
    this.root.impl = this;
    this.rig.scale.setScalar(ACTOR_SCALE[kind]);
    this.rig.position.y = modelY;
  }

  tick(dt: number, t: number, moved?: number): void {
    const p = this.root.position;
    if (moved === undefined) {
      moved = this.last ? Math.hypot(p.x - this.last.x, p.z - this.last.z) : 0;
      if (moved > 1.5) moved = 0; // teleported (pool re-use)
    }
    (this.last ??= new THREE.Vector3()).copy(p);
    this.dist += moved;
    const speed = dt > 0 ? moved / dt : 0;
    const r = this.parts;
    for (const w of r.wheels) w.o.rotation.z = -this.dist / (w.r * ACTOR_SCALE[this.kind]);
    for (const s of r.spinners) s.o.rotation.x = t * s.rate;
    // Walk cycle eases in and out with speed.
    const moving = speed > 0.05 ? 1 : 0;
    this.walkAmt += (moving - this.walkAmt) * Math.min(1, dt * 10);
    if (r.legs.length) {
      const ph = (this.dist / (r.stride * ACTOR_SCALE[this.kind])) * Math.PI;
      r.legs.forEach((l, i) => (l.rotation.z = Math.sin(ph + i * Math.PI) * 0.55 * this.walkAmt));
      if (r.walker) r.walker.position.y = Math.abs(Math.sin(ph)) * 0.02 * this.walkAmt;
    }
    // Bank from yaw rate.
    const yaw = this.body.rotation.y;
    let rate = 0;
    if (this.lastYaw !== null && dt > 0) {
      let d = yaw - this.lastYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      rate = d / dt;
    }
    this.lastYaw = yaw;
    const target = THREE.MathUtils.clamp(rate * r.bank, -r.maxBank, r.maxBank);
    this.roll += (target - this.roll) * Math.min(1, dt * 6);
    this.rig.rotation.x = this.roll;
    // Aircraft always float; ground vehicles get a tiny suspension buzz while driving.
    const bob = r.float ? Math.sin(t * 1.3 + this.root.id) * r.float : r.legs.length ? 0 : Math.sin(t * 55) * 0.004 * this.walkAmt;
    this.rig.position.y = this.modelY + bob;
    if (r.banner) waveBanner(r.banner, t);
  }

  reset(): void {
    this.dist = 0;
    this.last = null;
    this.lastYaw = null;
    this.roll = 0;
    this.walkAmt = 0;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.root.visible = true;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.y = this.modelY;
    for (const w of this.parts.wheels) w.o.rotation.z = 0;
    for (const l of this.parts.legs) l.rotation.z = 0;
    if (this.parts.walker) this.parts.walker.position.y = 0;
  }

  dispose(): void {
    this.root.removeFromParent();
    releaseTree(this.root);
  }
}

/** Round contact shadow (the root never yaws), diameter `d` in model units. */
function addShadow(ctx: MiniCtx, a: ActorImpl, d: number, strength = 0.7): void {
  const g = new GroundShadow();
  g.name = 'shadow';
  a.root.add(g);
  const k = ACTOR_SCALE[a.kind] * d;
  blob(ctx, g, k, k, false, strength);
  a.parts.shadow = g;
}

function addWheels(ctx: MiniCtx, a: ActorImpl, css: string, r: number, w: number, at: [number, number][]): void {
  const geo = wheelGeo(r, w, css);
  for (const [x, z] of at) {
    const o = solid(ctx, a.rig, geo);
    o.position.set(x, r, z);
    a.parts.wheels.push({ o, r });
  }
}

function addDecal(ctx: MiniCtx, a: ActorImpl, spec: ActorSpec, key: string, w: number, h: number, halfDepth: number, at: [number, number], parent: THREE.Object3D = a.rig): void {
  if (spec.lite || ctx.ghost || (!spec.mark && !chainOfColor(spec.color))) return;
  const o = ctx.inst.proxy(decalGeo(key, w, h, halfDepth, at), { castShadow: false, material: decalMat(spec.mark ?? '', spec.color) });
  o.name = 'decal';
  parent.add(o);
}

/** Legs (two instanced proxies swinging at the hip) under a walking group. */
function addLegs(ctx: MiniCtx, a: ActorImpl, css: string, parent: THREE.Object3D, hipY: number): void {
  for (const side of [1, -1]) {
    const o = solid(ctx, parent, legGeo(css));
    o.position.set(0, hipY, side * 0.032);
    a.parts.legs.push(o);
  }
}

const lo = (spec: ActorSpec) => (spec.lite ? ':lo' : '');

// ---------------------------------------------------------------------------
// Delivery van: a 1950s step van (rounded nose, tall box body, split windscreen), roof rack
// ---------------------------------------------------------------------------

const VAN_WHEEL = 0.065;
const VAN_WHEELS: [number, number][] = [
  [0.19, 0.135],
  [0.19, -0.135],
  [-0.17, 0.135],
  [-0.17, -0.135],
];

function vanShape(css: string, lite: boolean): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  // Chassis skirt, box body, rounded nose.
  add(box(0.6, 0.075, 0.27, 0.025), t.ao, { at: [0, 0.035, 0] });
  add(box(0.44, 0.29, 0.32, 0.05), t.main, { at: [-0.07, 0.075, 0] });
  add(
    hull('stepVanNose', [
      [0.12, 0, -0.155],
      [0.12, 0, 0.155],
      [0.3, 0, -0.14],
      [0.3, 0, 0.14],
      [0.325, 0.1, -0.125],
      [0.325, 0.1, 0.125],
      [0.3, 0.17, -0.14],
      [0.3, 0.17, 0.14],
      [0.265, 0.275, -0.13],
      [0.265, 0.275, 0.13],
      [0.12, 0.29, -0.155],
      [0.12, 0.29, 0.155],
    ]),
    t.main,
    { at: [0, 0.075, 0] },
  );
  // Split windscreen (leans back with the nose), cab side windows, rear window.
  add(box(0.014, 0.1, 0.25, 0), t.deep, { at: [0.293, 0.248, 0], rot: [0, 0, 0.32], jitter: 0 });
  add(box(0.018, 0.104, 0.018, 0), t.main, { at: [0.296, 0.247, 0], rot: [0, 0, 0.32], jitter: 0 });
  add(box(0.1, 0.08, 0.324, 0), t.deep, { at: [0.185, 0.245, 0], jitter: 0 });
  // Roof cap, belt moulding, bumpers, headlamps.
  add(box(0.47, 0.03, 0.33, 0.014), t.hi, { at: [-0.07, 0.355, 0] });
  add(box(0.6, 0.018, 0.326, 0), t.hi, { at: [0.0, 0.165, 0], jitter: 0 });
  add(box(0.035, 0.045, 0.3, 0.012), t.hi, { at: [0.33, 0.04, 0] });
  add(box(0.03, 0.045, 0.3, 0.012), t.hi, { at: [-0.31, 0.04, 0] });
  for (const z of [0.1, -0.1]) add(cyl(0.026, 0.026, 0.02, 6), t.hi, { at: [0.318, 0.14, z], rot: [0, 0, -Math.PI / 2], jitter: 0 });
  // Roof rack where sold goods ride.
  for (const z of [0.12, -0.12]) add(box(0.34, 0.016, 0.016, 0), t.ao, { at: [-0.1, 0.39, z], jitter: 0 });
  for (const x of [-0.24, 0.04]) add(box(0.016, 0.022, 0.26, 0), t.ao, { at: [x, 0.38, 0], jitter: 0 });
  if (lite) for (const [x, z] of VAN_WHEELS) s.addShape(wheelShape(VAN_WHEEL, 0.05, css, 6), { at: [x, VAN_WHEEL, z] });
  return s;
}

export function buildVan(ctx: MiniCtx, spec: ActorSpec): Actor {
  const a = new ActorImpl('van', GROUND_OFFSET);
  if (!spec.lite) addShadow(ctx, a, 0.6);
  solid(ctx, a.rig, miniGeo(`v:van2:${spec.color}${lo(spec)}`, () => vanShape(spec.color, !!spec.lite)));
  if (!spec.lite) addWheels(ctx, a, spec.color, VAN_WHEEL, 0.05, VAN_WHEELS);
  addDecal(ctx, a, spec, 'van2', 0.14, 0.14, 0.16, [-0.08, 0.25]);
  a.cargo.position.set(-0.1, 0.4, 0);
  return a;
}

// ---------------------------------------------------------------------------
// Scooter + errand boy
// ---------------------------------------------------------------------------

const SC_WHEEL = 0.055;

function scooterShape(css: string, lite: boolean): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  // Deck and the rounded rear cowl.
  add(box(0.24, 0.035, 0.1, 0.012), t.ao, { at: [0, 0.055, 0] });
  add(
    lathe(
      [
        [0, -0.1],
        [0.05, -0.09],
        [0.065, -0.02],
        [0.06, 0.06],
        [0.03, 0.1],
        [0, 0.1],
      ],
      8,
    ),
    t.main,
    { at: [-0.1, 0.14, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1.05] },
  );
  add(box(0.15, 0.035, 0.09, 0.015), t.ao, { at: [-0.08, 0.2, 0] });
  // Leg shield + steering column + handlebar.
  add(box(0.05, 0.2, 0.13, 0.02), t.main, { at: [0.11, 0.07, 0], rot: [0, 0, 0.22] });
  add(box(0.012, 0.16, 0.11, 0), t.hi, { at: [0.14, 0.09, 0], rot: [0, 0, 0.22], jitter: 0 });
  add(cyl(0.012, 0.012, 0.18, 5), t.ao, { at: [0.17, 0.15, 0], rot: [0, 0, 0.3] });
  add(box(0.03, 0.022, 0.2, 0), t.ao, { at: [0.12, 0.32, 0] });
  add(box(0.03, 0.035, 0.05, 0), t.hi, { at: [0.15, 0.3, 0], jitter: 0 });
  // Front fender.
  add(box(0.1, 0.025, 0.06, 0.01), t.main, { at: [0.16, 0.105, 0] });
  // Rear rack (cargo rides here).
  add(box(0.12, 0.014, 0.11, 0), t.ao, { at: [-0.18, 0.205, 0], jitter: 0 });
  // Rider (errand boy): seated, hands on the bars.
  figureTop(s, t, [-0.04, 0.22, 0], 'bars');
  for (const side of [1, -1]) {
    add(box(0.11, 0.04, 0.045, 0), t.ao, { at: [0.0, 0.2, side * 0.035], rot: [0, 0, -0.1] });
    add(box(0.04, 0.11, 0.04, 0), t.ao, { at: [0.06, 0.09, side * 0.035] });
  }
  if (lite) for (const x of [0.16, -0.15]) s.addShape(wheelShape(SC_WHEEL, 0.04, css, 6), { at: [x, SC_WHEEL, 0] });
  return s;
}

export function buildScooter(ctx: MiniCtx, spec: ActorSpec): Actor {
  const a = new ActorImpl('scooter', GROUND_OFFSET);
  a.parts.bank = -0.05; // two-wheeler leans into turns
  a.parts.maxBank = 0.22;
  if (!spec.lite) addShadow(ctx, a, 0.38);
  solid(ctx, a.rig, miniGeo(`v:scooter2:${spec.color}${lo(spec)}`, () => scooterShape(spec.color, !!spec.lite)));
  if (!spec.lite)
    addWheels(ctx, a, spec.color, SC_WHEEL, 0.04, [
      [0.16, 0],
      [-0.15, 0],
    ]);
  addDecal(ctx, a, spec, 'scooter2', 0.075, 0.075, 0.069, [-0.1, 0.14]);
  a.cargo.position.set(-0.18, 0.212, 0);
  return a;
}

// ---------------------------------------------------------------------------
// Hand cart + cart operator
// ---------------------------------------------------------------------------

const CART_WHEEL = 0.1;
const CART_X = 0.14;

function cartShape(css: string, lite: boolean): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  const x = CART_X;
  // Bed with side boards and a raised rim.
  add(box(0.36, 0.035, 0.26, 0.01), t.ao, { at: [x, 0.13, 0] });
  for (const z of [0.12, -0.12]) add(box(0.36, 0.08, 0.025, 0), t.main, { at: [x, 0.16, z] });
  add(box(0.025, 0.08, 0.24, 0), t.main, { at: [x + 0.17, 0.16, 0] });
  add(box(0.025, 0.06, 0.24, 0), t.ao, { at: [x - 0.17, 0.16, 0] });
  add(box(0.362, 0.018, 0.262, 0), t.hi, { at: [x, 0.235, 0], jitter: 0 });
  // Axle + front stand.
  add(cyl(0.012, 0.012, 0.32, 5), t.deep, { at: [x, CART_WHEEL, -0.16], rot: [Math.PI / 2, 0, 0] });
  add(box(0.02, 0.12, 0.02, 0), t.ao, { at: [x + 0.15, 0.01, 0] });
  // Handles to the operator.
  for (const z of [0.09, -0.09]) add(box(0.2, 0.02, 0.02, 0), t.ao, { at: [x - 0.27, 0.205, z], rot: [0, 0, -0.12] });
  add(cyl(0.014, 0.014, 0.22, 5), t.hi, { at: [x - 0.36, 0.22, -0.11], rot: [Math.PI / 2, 0, 0] });
  if (lite) for (const z of [0.15, -0.15]) s.addShape(wheelShape(CART_WHEEL, 0.03, css, 8), { at: [x, CART_WHEEL, z] });
  return s;
}

function operatorTop(css: string): Shape {
  const s = new Shape();
  figureTop(s, tones(css), [0, 0, 0], 'push');
  return s;
}

export function buildCart(ctx: MiniCtx, spec: ActorSpec): Actor {
  const a = new ActorImpl('cart', GROUND_OFFSET);
  if (!spec.lite) addShadow(ctx, a, 0.62);
  solid(ctx, a.rig, miniGeo(`v:cart2:${spec.color}${lo(spec)}`, () => cartShape(spec.color, !!spec.lite)));
  if (!spec.lite)
    addWheels(ctx, a, spec.color, CART_WHEEL, 0.03, [
      [CART_X, 0.15],
      [CART_X, -0.15],
    ]);
  // Operator walks behind the handles.
  const op = new THREE.Group();
  op.name = 'operator';
  op.position.set(CART_X - 0.48, 0, 0);
  a.rig.add(op);
  const walker = new THREE.Group();
  op.add(walker);
  solid(ctx, walker, miniGeo(`v:operator2:${spec.color}`, () => operatorTop(spec.color))).position.y = 0.125;
  addLegs(ctx, a, spec.color, walker, 0.125);
  a.parts.walker = walker;
  a.parts.stride = 0.12;
  addDecal(ctx, a, spec, 'cart2', 0.07, 0.07, 0.133, [CART_X, 0.165]);
  a.cargo.position.set(CART_X, 0.15, 0);
  return a;
}

// ---------------------------------------------------------------------------
// Truck: a 1950s cab-over (flat face, split windscreen, the cover's truck) with a stake bed
// ---------------------------------------------------------------------------

const TRUCK_WHEEL = 0.065;
const TRUCK_WHEELS: [number, number][] = [
  [0.22, 0.14],
  [0.22, -0.14],
  [-0.1, 0.14],
  [-0.1, -0.14],
  [-0.25, 0.14],
  [-0.25, -0.14],
];

function truckShape(css: string, lite: boolean): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  add(box(0.66, 0.06, 0.22, 0.02), t.ao, { at: [0, 0.05, 0] });
  // Cab-over: tall cab on the front axle, rounded roof cap.
  add(box(0.2, 0.29, 0.31, 0.05), t.main, { at: [0.24, 0.075, 0] });
  add(box(0.21, 0.035, 0.315, 0.017), t.hi, { at: [0.24, 0.352, 0] });
  // Face: split windscreen, grille, bumper, headlamps; side windows.
  add(box(0.012, 0.1, 0.27, 0), t.deep, { at: [0.342, 0.235, 0], jitter: 0 });
  add(box(0.016, 0.1, 0.018, 0), t.main, { at: [0.344, 0.235, 0], jitter: 0 });
  add(box(0.012, 0.075, 0.19, 0), t.deep, { at: [0.342, 0.11, 0], jitter: 0 });
  add(box(0.016, 0.014, 0.19, 0), t.hi, { at: [0.345, 0.14, 0], jitter: 0 });
  add(box(0.03, 0.04, 0.33, 0.012), t.hi, { at: [0.35, 0.045, 0] });
  for (const z of [0.12, -0.12]) add(cyl(0.024, 0.024, 0.02, 6), t.hi, { at: [0.341, 0.14, z], rot: [0, 0, -Math.PI / 2], jitter: 0 });
  add(box(0.1, 0.085, 0.314, 0), t.deep, { at: [0.255, 0.24, 0], jitter: 0 });
  // Exhaust stack behind the cab.
  add(cyl(0.014, 0.014, 0.22, 6), t.hi, { at: [0.125, 0.16, 0.135] });
  // Stake bed: floor, slatted side boards, headboard, tailgate.
  add(box(0.44, 0.05, 0.3, 0.012), t.main, { at: [-0.13, 0.12, 0] });
  for (const z of [0.14, -0.14]) {
    add(box(0.44, 0.06, 0.02, 0), t.main, { at: [-0.13, 0.17, z] });
    add(box(0.44, 0.008, 0.024, 0), t.deep, { at: [-0.13, 0.195, z], jitter: 0 });
    add(box(0.24, 0.018, 0.05, 0), t.ao, { at: [-0.175, 0.145, z * 1.07], jitter: 0 });
  }
  add(box(0.02, 0.06, 0.3, 0), t.main, { at: [-0.34, 0.17, 0] });
  add(box(0.03, 0.14, 0.3, 0), t.ao, { at: [0.125, 0.17, 0] });
  if (lite) for (const [x, z] of TRUCK_WHEELS) s.addShape(wheelShape(TRUCK_WHEEL, 0.05, css, 6), { at: [x, TRUCK_WHEEL, z] });
  return s;
}

export function buildTruck(ctx: MiniCtx, spec: ActorSpec): Actor {
  const a = new ActorImpl('truck', GROUND_OFFSET);
  if (!spec.lite) addShadow(ctx, a, 0.64);
  solid(ctx, a.rig, miniGeo(`v:truck2:${spec.color}${lo(spec)}`, () => truckShape(spec.color, !!spec.lite)));
  if (!spec.lite) addWheels(ctx, a, spec.color, TRUCK_WHEEL, 0.05, TRUCK_WHEELS);
  addDecal(ctx, a, spec, 'truck2', 0.09, 0.09, 0.158, [0.23, 0.15]);
  a.cargo.position.set(-0.13, 0.17, 0);
  return a;
}

// ---------------------------------------------------------------------------
// Zeppelin
// ---------------------------------------------------------------------------

const ZEP_L = 0.48; // half length
const ZEP_R = 0.18;

function envelopeProfile(r: number, l: number, n = 8): [number, number][] {
  const out: [number, number][] = [[0, -l]];
  for (let i = 1; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    // Fatter at the nose, tapering to the tail.
    const y = Math.sin(a) * l;
    const k = Math.cos(a) * (1 + 0.12 * Math.sin(a));
    out.push([r * Math.max(0, k), y]);
  }
  out.push([0, l]);
  return out;
}

function zeppelinShape(css: string): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  // Envelope along +x (lathe +y → +x) with two raised rib bands and a nose cap.
  add(lathe(envelopeProfile(ZEP_R, ZEP_L), 12), t.main, { rot: [0, 0, -Math.PI / 2] });
  for (const x of [0.22, -0.24]) add(cyl(ZEP_R * (x > 0 ? 0.97 : 0.87), ZEP_R * (x > 0 ? 0.97 : 0.87), 0.03, 12), t.hi, { at: [x - 0.015, 0, 0], rot: [0, 0, -Math.PI / 2], jitter: 0 });
  add(cone(0.04, 0.05, 8), t.hi, { at: [ZEP_L - 0.025, 0, 0], rot: [0, 0, -Math.PI / 2] });
  // Cross tail fins.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    add(
      hull('zepFin', [
        [0, 0, -0.008],
        [0, 0, 0.008],
        [-0.16, 0, -0.008],
        [-0.16, 0, 0.008],
        [-0.17, 0.15, -0.006],
        [-0.17, 0.15, 0.006],
        [-0.08, 0.15, -0.006],
        [-0.08, 0.15, 0.006],
      ]),
      i % 2 ? t.ao : t.main,
      { at: [-ZEP_L + 0.17, 0, 0], rot: [a, 0, 0] },
    );
  }
  // Gondola with a window band; engine pod; struts.
  add(box(0.24, 0.085, 0.12, 0.03), t.ao, { at: [0.02, -ZEP_R - 0.075, 0] });
  add(box(0.18, 0.03, 0.124, 0), t.deep, { at: [0.03, -ZEP_R - 0.045, 0], jitter: 0 });
  add(box(0.06, 0.02, 0.1, 0), t.ao, { at: [-0.12, -ZEP_R - 0.06, 0] });
  for (const x of [-0.06, 0.1]) add(box(0.012, 0.04, 0.012, 0), t.deep, { at: [x, -ZEP_R - 0.01, 0] });
  return s;
}

function zepPropShape(css: string): Shape {
  const d = tones(css).deep;
  const s = new Shape();
  s.add(box(0.012, 0.14, 0.03, 0), d, { at: [0, -0.07, 0], mat: 'plastic', jitter: 0 });
  s.add(box(0.012, 0.03, 0.14, 0), d, { at: [0, -0.015, 0], mat: 'plastic', jitter: 0 });
  return s;
}

export function buildZeppelin(ctx: MiniCtx, spec: ActorSpec): Actor {
  const a = new ActorImpl('zeppelin', 0);
  a.parts.bank = -0.12; // banks into turns, up to 6°
  a.parts.maxBank = 0.105;
  a.parts.float = 0.04;
  addShadow(ctx, a, 0.75, 0.75);
  solid(ctx, a.rig, miniGeo(`v:zeppelin2:${spec.color}`, () => zeppelinShape(spec.color)));
  if (!ctx.ghost) {
    const hub = new THREE.Group();
    hub.position.set(-0.13, -ZEP_R - 0.06, 0);
    a.rig.add(hub);
    const prop = solid(ctx, hub, miniGeo(`v:zepProp:${spec.color}`, () => zepPropShape(spec.color)), { castShadow: false });
    prop.position.x = -0.03;
    a.parts.spinners.push({ o: prop, rate: 26 });
  }
  addDecal(ctx, a, spec, 'zeppelin2', 0.17, 0.17, ZEP_R * 0.99, [0.0, 0.02]);
  a.cargo.position.set(0.02, -ZEP_R - 0.13, 0);
  a.drop.position.copy(a.cargo.position);
  return a;
}

// ---------------------------------------------------------------------------
// Airplane with banner
// ---------------------------------------------------------------------------

function waveBanner(banner: THREE.Mesh, t: number): void {
  const base = banner.userData.base as Float32Array;
  const pos = banner.geometry.attributes.position as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const len = banner.userData.len as number;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3]!;
    const u = (len / 2 - x) / len;
    arr[i * 3 + 2] = Math.sin(t * 5 - u * 7) * 0.06 * u;
  }
  pos.needsUpdate = true;
}

/**
 * Low-wing monoplane in the marketing minis' light-blue plastic (as the campaign mini in
 * marketing.ts, art bible §6.8), nose at +x, a little larger so it reads in flight.
 */
function flyingPlaneShape(): Shape {
  const t = tones(MARKETING_PLASTIC);
  const s = new Shape();
  const add = plastic(s);
  const k = 1.3;
  add(
    lathe(
      [
        [0, -0.47],
        [0.06, -0.44],
        [0.1, -0.15],
        [0.13, 0.12],
        [0.125, 0.3],
        [0.1, 0.38],
        [0, 0.4],
      ].map(([r, y]) => [r! * k, y! * k] as [number, number]),
      8,
    ),
    t.main,
    { rot: [0, 0, -Math.PI / 2] },
  );
  add(cyl(0.11 * k, 0.11 * k, 0.05 * k, 8), t.deep, { at: [0.33 * k, 0, 0], rot: [0, 0, -Math.PI / 2] });
  // Low wing with a slight dihedral, the pilot's head under a bump, tailplane and fin.
  for (const sz of [-1, 1]) add(box(0.28 * k, 0.035 * k, 0.5 * k, 0), t.hi, { at: [0.08 * k, -0.09 * k, sz * 0.25 * k], rot: [sz * -0.08, 0, 0] });
  add(ball(0.08 * k, 0), t.hi, { at: [0, 0.12 * k, 0], scale: [1.4, 1, 1] });
  add(box(0.15 * k, 0.025 * k, 0.42 * k, 0), t.hi, { at: [-0.4 * k, -0.005 * k, 0] });
  add(
    hull('flyFin', [
      [0, 0, -0.013],
      [0, 0, 0.013],
      [0.23, 0, -0.013],
      [0.23, 0, 0.013],
      [0.05, 0.26, -0.013],
      [0.05, 0.26, 0.013],
      [-0.03, 0.26, -0.013],
      [-0.03, 0.26, 0.013],
    ]),
    t.main,
    { at: [-0.61, 0.02, 0] },
  );
  return s;
}

function flyingPropShape(): Shape {
  const s = new Shape();
  s.add(box(0.026, 0.44, 0.06, 0.008), tones(MARKETING_PLASTIC).ao, { at: [0, -0.22, 0], mat: 'plastic', jitter: 0 });
  return s;
}

/** Flying airplane (campaign sweep / fly-in / fly-off): the campaign mini's plane towing its banner. */
export function buildPlane(ctx: MiniCtx, spec: ActorSpec & { bannerLength?: number }): Actor {
  const a = new ActorImpl('airplane', 0);
  a.parts.bank = -0.18;
  a.parts.maxBank = 0.35;
  a.parts.float = 0.05;
  addShadow(ctx, a, 1.0, 0.7);
  solid(ctx, a.rig, miniGeo('v:sePlane', flyingPlaneShape));
  const prop = mesh(ctx, a.rig, miniGeo('v:seProp', flyingPropShape), false);
  prop.position.set(0.56, 0, 0);
  a.parts.spinners.push({ o: prop, rate: 30 });
  a.drop.position.set(0, -0.22, 0);
  a.cargo.position.set(0, -0.22, 0);
  const len = spec.bannerLength ?? 1.4;
  if (len > 0 && !spec.lite) {
    const rope = solid(ctx, a.rig, miniGeo('v:rope2', () => new Shape().add(cyl(0.01, 0.01, 0.32, 3), tones(MARKETING_PLASTIC).ao, { rot: [0, 0, Math.PI / 2], mat: 'plastic', jitter: 0 })), { castShadow: false });
    rope.position.set(-0.62, 0, 0);
    // The banner: light-blue plastic, with the cyan sign face of the campaign minis when it has goods.
    const geo = owned(new THREE.PlaneGeometry(len, 0.42, 12, 1));
    const goods = spec.goods?.length ? spec.goods : null;
    const mat = ctx.ghost ?? owned(new THREE.MeshStandardMaterial({ map: goods ? signFaceTexture(goods, len / 0.42) : null, color: goods ? 0xffffff : new THREE.Color(MARKETING_PLASTIC), side: THREE.DoubleSide, roughness: 0.6 }));
    const banner = new THREE.Mesh(geo, mat);
    banner.position.set(-0.94 - len / 2, 0, 0);
    banner.name = 'banner';
    banner.castShadow = !ctx.ghost;
    banner.userData.base = (geo.attributes.position!.array as Float32Array).slice();
    banner.userData.len = len;
    a.rig.add(banner);
    a.parts.banner = banner;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Mailman
// ---------------------------------------------------------------------------

function mailmanTop(css: string): Shape {
  const t = tones(css);
  const s = new Shape();
  const add = plastic(s);
  figureTop(s, t, [0, 0, 0], 'down');
  // Satchel on the hip with an envelope peeking out; strap across the chest.
  add(box(0.08, 0.07, 0.035, 0.012), t.ao, { at: [-0.005, 0.02, 0.075] });
  add(box(0.05, 0.03, 0.01, 0), t.hi, { at: [0, 0.085, 0.075], jitter: 0 });
  add(box(0.012, 0.15, 0.13, 0), t.deep, { at: [0.0, 0.03, 0.005], rot: [0.75, 0, 0], jitter: 0 });
  return s;
}

export function buildMailman(ctx: MiniCtx, spec: ActorSpec): Actor {
  const a = new ActorImpl('mailman', GROUND_OFFSET);
  if (!spec.lite) addShadow(ctx, a, 0.22);
  const walker = new THREE.Group();
  a.rig.add(walker);
  const top = solid(ctx, walker, miniGeo(`v:mailman2:${spec.color}`, () => mailmanTop(spec.color)));
  top.position.y = 0.125;
  addLegs(ctx, a, spec.color, walker, 0.125);
  a.parts.walker = walker;
  a.parts.stride = 0.1;
  a.cargo.position.set(0.12, 0.17, 0.06);
  a.drop.position.set(0.0, 0.2, 0.075);
  return a;
}

// ---------------------------------------------------------------------------
// Registry (for the actor pool)
// ---------------------------------------------------------------------------

export type ActorFactory = (ctx: MiniCtx, spec: ActorSpec) => Actor;

export const ACTOR_FACTORIES: Record<VehicleKind, ActorFactory> = {
  van: buildVan,
  scooter: buildScooter,
  cart: buildCart,
  truck: buildTruck,
  zeppelin: buildZeppelin,
  airplane: buildPlane,
  mailman: buildMailman,
};

/** Pool bucket key: actors with the same key are interchangeable. */
export function actorKey(kind: VehicleKind, spec: ActorSpec): string {
  return `${kind}:${spec.color}:${spec.mark ?? ''}:${spec.lite ? 1 : 0}:${kind === 'airplane' ? (spec.goods ?? []).join('+') : ''}`;
}

export function buildActor(ctx: MiniCtx, kind: VehicleKind, spec: ActorSpec): Actor {
  return ACTOR_FACTORIES[kind](ctx, spec);
}
