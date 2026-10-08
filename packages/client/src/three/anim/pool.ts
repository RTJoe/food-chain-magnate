/**
 * Actor pool (animation-plan §4.6). Transient actors (vehicles, crates, puffs) are built once per
 * kind × colour × variant and recycled: `get` shows one, `release` hides it again. Pooled actors
 * park their instanced slots (nothing drawn for them); at most `FREE_CAP` per kind × colour ×
 * variant are kept, the rest are released.
 *
 * Builders are registered per kind (`registerActor`). WP-B registers the real minis
 * (three/minis/vehicles.ts, props.ts); until a kind has a builder, `get` returns the placeholder
 * box in the chain colour so choreographies can be written and reviewed today.
 *
 * Actor object contract (what a builder returns):
 * - Root `Object3D` at the actor's ground point; the follower sets root position (x, y, z).
 * - A child named `body` (Group) that carries the model; the follower sets `body.rotation.y` to
 *   the heading (nose at +x) and may tilt / bob it. The shadow blob is a sibling of `body` under
 *   the root, so it never rotates or bobs with the model.
 * - Optional anchors (Object3D children of `body`, by name): `cargo` (where tokens / crates ride),
 *   `drop` (leaflet / envelope spawn).
 * - Built through `MiniCtx` (instanced parts), no per-instance materials; one geometry per
 *   kind × colour via the `miniGeo` cache.
 */
import * as THREE from 'three';
import type { MiniCtx } from '../minis/ctx.js';
import { blob, releaseTree, solid } from '../minis/ctx.js';
import { InstanceProxy } from '../instancer.js';
import { box, miniGeo, playerPalette, Shape } from '../minis/kit.js';
import type { Stage } from '../scene.js';

export type ActorKind =
  | 'van'
  | 'scooter'
  | 'cart'
  | 'truck'
  | 'zeppelin'
  | 'airplane'
  | 'crate'
  | 'envelope'
  | 'leaflet'
  | 'puff'
  | 'confetti'
  | 'ghostToken'
  | 'mailman'
  | 'coin'
  | 'cash'
  | 'carryToken'
  | 'radioRings'
  | 'placeholder';

export interface ActorSpec {
  kind: ActorKind;
  /** Chain colour (CSS) or null for neutral props. */
  color: string | null;
  /** Kind-specific variant: vehicles the chain mark (optional `:lite`), crates / ghost / carry tokens a good id, puffs 'steam' | 'dust', coins a stack count. */
  variant: string | null;
}

/** Builds one actor following the contract above. */
export type ActorBuilder = (ctx: MiniCtx, spec: ActorSpec) => THREE.Object3D;

const builders = new Map<ActorKind, ActorBuilder>();

/** Register (or replace) the builder for a kind. Call at module load (imported from anim/index.ts). */
export function registerActor(kind: ActorKind, build: ActorBuilder): void {
  builders.set(kind, build);
}

/** Whether a real builder exists for `kind` (else `get` returns the placeholder). */
export function hasActor(kind: ActorKind): boolean {
  return builders.has(kind);
}

const keyOf = (s: ActorSpec) => `${s.kind}|${s.color ?? '-'}|${s.variant ?? '-'}`;

/** Parked actors kept per key; a busy dinner's extra vans and puffs are released. */
const FREE_CAP = 4;

/** Park (release) or unpark (re-take) the instanced slots of an actor's parts. */
function parkTree(o: THREE.Object3D, park: boolean): void {
  o.traverse((c) => {
    if (c instanceof InstanceProxy) {
      if (park) c.park();
      else c.unpark();
    }
  });
}

export class ActorPool {
  private free = new Map<string, THREE.Object3D[]>();
  private live = new Set<THREE.Object3D>();
  private ctx: MiniCtx;
  readonly root = new THREE.Group();

  constructor(private readonly stage: Stage) {
    this.ctx = { inst: stage.inst };
    this.root.name = 'actors';
    stage.overlay.add(this.root);
  }

  /**
   * A visible actor, parented to the actor layer, transform reset (origin, no rotation, scale 1,
   * `body` rotation reset). Release it with `release` (choreographies: `tl.own(() => pool.release(a))`,
   * or `ctx.actor(tl, …)` which does both).
   */
  get(kind: ActorKind, color: string | null = null, variant: string | null = null): THREE.Object3D {
    const spec: ActorSpec = { kind, color, variant };
    const k = keyOf(spec);
    const parked = this.free.get(k)?.pop();
    if (parked) parkTree(parked, false);
    const obj = parked ?? this.build(spec, k);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(1);
    const body = obj.getObjectByName('body');
    if (body) {
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      body.scale.setScalar(1);
    }
    obj.visible = true;
    if (obj.parent !== this.root) this.root.add(obj);
    this.live.add(obj);
    this.stage.invalidate();
    return obj;
  }

  /** Hide and return to the free list (never disposes). Releasing twice is a no-op. */
  release(obj: THREE.Object3D): void {
    if (!this.live.delete(obj)) return;
    obj.visible = false;
    const k = obj.userData.actorKey as string;
    let list = this.free.get(k);
    if (!list) this.free.set(k, (list = []));
    if (list.length >= FREE_CAP) {
      releaseTree(obj);
      obj.removeFromParent();
    } else {
      parkTree(obj, true);
      list.push(obj);
    }
    this.stage.invalidate();
  }

  /** Build `n` hidden actors per colour ahead of time (vans per player at mount). */
  prewarm(kind: ActorKind, colors: readonly (string | null)[], n = 2, variant: string | null = null): void {
    for (const color of colors) {
      const spec: ActorSpec = { kind, color, variant };
      const k = keyOf(spec);
      let list = this.free.get(k);
      if (!list) this.free.set(k, (list = []));
      while (list.length < n) {
        const o = this.build(spec, k);
        o.visible = false;
        parkTree(o, true);
        list.push(o);
      }
    }
  }

  stats(): { live: number; free: number } {
    let free = 0;
    for (const l of this.free.values()) free += l.length;
    return { live: this.live.size, free };
  }

  /** Release everything still out (timeline finish safety net). */
  releaseAll(): void {
    for (const o of [...this.live]) this.release(o);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.live.clear();
    this.free.clear();
  }

  private build(spec: ActorSpec, k: string): THREE.Object3D {
    const b = builders.get(spec.kind) ?? placeholder;
    const obj = b(this.ctx, spec);
    obj.userData.actorKey = k;
    obj.userData.actor = spec;
    obj.visible = false;
    this.root.add(obj);
    return obj;
  }
}

/** Placeholder actor: a chain-coloured box with a light nose block at +x and a shadow blob. */
export const placeholder: ActorBuilder = (ctx, spec) => {
  const root = new THREE.Group();
  root.name = `actor:${spec.kind}`;
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const pal = playerPalette(spec.color ?? '#8f8b88');
  const small = !['van', 'scooter', 'cart', 'truck', 'zeppelin', 'airplane', 'placeholder'].includes(spec.kind);
  const [w, h, d] = small ? [0.18, 0.14, 0.18] : [0.46, 0.24, 0.28];
  const geo = miniGeo(`animPlaceholder:${small ? 's' : 'v'}:${pal.base}`, () =>
    new Shape().add(box(w, h, d, 0.03), pal.base, { at: [0, h / 2 + 0.02, 0], jitter: 0 }).add(box(w * 0.3, h * 0.7, d * 0.9, 0.02), pal.light, { at: [w * 0.42, (h * 0.7) / 2 + 0.03, 0], jitter: 0 }),
  );
  solid(ctx, body, geo, { castShadow: false });
  const cargo = new THREE.Object3D();
  cargo.name = 'cargo';
  cargo.position.set(-w * 0.1, h + 0.04, 0);
  body.add(cargo);
  // Round blob: the root does not yaw, so the shadow must read from every heading.
  blob(ctx, root, w * 1.2, w * 1.2, false, 0.8);
  return root;
};
