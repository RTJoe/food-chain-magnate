/**
 * Choreographies (animation-plan §4.1): one function per beat kind turns a beat into clips on the
 * timeline. Registration is by kind; a later `registerChoreo` for the same kind replaces the
 * earlier one, so WP-C / WP-D modules imported after `basic.ts` in anim/index.ts override the
 * ported defaults without editing them.
 *
 * Rules for a choreography:
 * - Build everything up front (clips, actors, masks); never wait on promises.
 * - The scene already shows the final state. Hide or mask what the beat reveals at build time and
 *   restore it in the clip's raw = 1 update (finish() always delivers raw = 1).
 * - Land the focal motion by `beat.at + beat.dur`; return that landing time. Tails (`lane: 'tail'`)
 *   may run past it.
 * - Get actors with `ctx.actor(tl, kind, color)` (released when the timeline ends) and transient
 *   overlay objects with `ctx.mount(tl, obj)` (removed and disposed when the timeline ends).
 * - In `ctx.mode === 'reduced'`: no travel, drops or scaling pops; fades and static drawings only,
 *   held for `beat.dur`.
 */
import * as THREE from 'three';
import type { GameEvent, GameView, HouseId, PlayerId } from '@fcm/engine';
import type { PhaseCaption } from '../../state/feedback.js';
import type { FeedbackLayer } from '../overlays/feedback.js';
import type { Reconciler } from '../reconcile.js';
import type { Stage, Tier } from '../scene.js';
import type { Beat, BeatKind, Plan } from './compile.js';
import type { Follow, P2, Pose } from './path.js';
import type { ActorKind, ActorPool } from './pool.js';
import type { ClipSpec, Timeline } from './timeline.js';

/** Route lookups (anim/routes.ts). World polylines are (x, z); followers already carry the lane offset. */
export interface RouteLookup {
  /** Delivery van trip for a sale: entrance corner → roads → stop next to the house (rural: off the board edge). Null if not connected. */
  sale(e: Extract<GameEvent, { type: 'sale' }>): SaleTrip | null;
  /** Buyer haul (cart / truck road path, zeppelin air path, errand out-and-back). Null for milestone hauls. */
  buy(e: Extract<GameEvent, { type: 'drinksBought' }>): BuyTrip | null;
  /** Road follower over any world polyline. */
  road(pts: readonly P2[], opts?: { lane?: number; corner?: number }): Follow;
}

export interface SaleTrip {
  /** Spawn point (entrance corner square centre), road polyline, stop point. */
  pts: P2[];
  follow: Follow;
  /** The trip home (reverse polyline, so the van keeps to its own lane). */
  back: Follow;
  /** The house target (centre) the goods hop to. */
  house: P2;
  /** Leaves the board (Ketchup rural area). */
  offBoard: boolean;
}

export interface BuyTrip {
  mode: 'road' | 'air' | 'errand';
  pts: P2[];
  follow: Follow;
  /** Pickups in travel order: arc length along `follow` where the vehicle stops for each source. */
  stops: { sourceId: string; drink: string; count: number; s: number; at: P2 }[];
}

/** Masking (§4.2): the pre-state of a house's demand stack, shown until its beat consumes it. */
export interface GhostStack {
  obj: THREE.Object3D;
  /** Remove at timeline time `at` with a short pop (reduced: a fade-free hide). */
  popAt(at: number): void;
}

export interface ChoreoCtx {
  stage: Stage;
  rec: Reconciler;
  feedback: FeedbackLayer;
  pool: ActorPool;
  view: GameView | null;
  prevView: GameView | null;
  me: PlayerId | null;
  mode: 'full' | 'reduced';
  tier: Tier;
  plan: Plan;
  /** Reconciler keys this batch added / removed; demand stack sizes before the batch (`demand:<houseId>`). */
  added: ReadonlySet<string>;
  removed: ReadonlySet<string>;
  prevDemand: ReadonlyMap<string, number>;
  paths: RouteLookup;
  /** Per-tier caps (§4.6). */
  caps: { vehicles: number; confetti: number; flights: number; shadows: boolean };
  /** Chain colour of a player (grey for null / unknown). */
  color(player: PlayerId | null | undefined): string;
  /** Show a phase caption at timeline time `at`. */
  caption(tl: Timeline, at: number, c: DistributiveOmit<PhaseCaption, 'key'>): void;
  /** Follow-the-action camera hook (no-op until the setting exists). */
  follow(tl: Timeline, at: number, ids: readonly string[]): void;
  /** A pooled actor, hidden until the caller shows it; released when the timeline ends. */
  actor(tl: Timeline, kind: ActorKind, color?: string | null, variant?: string | null): THREE.Object3D;
  /** Mount a transient overlay object (sprites sized) for the timeline's lifetime; disposed at the end. */
  mount(tl: Timeline, o: THREE.Object3D): void;
  /** Ghost of a house's demand stack before this batch (prevView), mounted now; null if none. */
  ghostDemand(tl: Timeline, houseId: HouseId): GhostStack | null;
}

/** Turns a beat into clips starting at `at`; returns the landing time. */
export type Choreography = (beat: Beat, at: number, tl: Timeline, ctx: ChoreoCtx) => number;

export const registry = new Map<BeatKind, Choreography>();

/** Register (or replace) the choreography for one or more beat kinds. */
export function registerChoreo(kinds: BeatKind | readonly BeatKind[], fn: Choreography): void {
  for (const k of typeof kinds === 'string' ? [kinds] : kinds) registry.set(k, fn);
}

/** The first event of `type` in a beat. */
export function beatEvent<T extends GameEvent['type']>(beat: Beat, type: T): Extract<GameEvent, { type: T }> | undefined {
  return beat.events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
}

/** Every event of `type` in a beat. */
export function beatEvents<T extends GameEvent['type']>(beat: Beat, type: T): Extract<GameEvent, { type: T }>[] {
  return beat.events.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}

/**
 * Clip that drives an actor along a follower over `dur`: root position from `at(s)`, `body` yaw
 * from the tangent (lagged ~0.08 s for weight). `from` / `to` are arc lengths (default whole path).
 * Allocation-free per frame.
 */
export function followClip(actor: THREE.Object3D, f: Follow, dur: number, opts: { from?: number; to?: number; ease?: (t: number) => number; lane?: 'focal' | 'tail'; hideAtEnd?: boolean } = {}): ClipSpec {
  const s0 = opts.from ?? 0;
  const s1 = opts.to ?? f.length;
  const body = actor.getObjectByName('body') ?? actor;
  const pose: Pose = { x: 0, z: 0, yaw: 0 };
  let yaw: number | null = null;
  let last = 0;
  return {
    dur,
    ...(opts.ease ? { ease: opts.ease } : {}),
    lane: opts.lane ?? 'focal',
    onStart: () => {
      actor.visible = true;
      yaw = null;
    },
    update: (k, raw) => {
      f.at(s0 + (s1 - s0) * k, pose);
      actor.position.set(pose.x, f.y, pose.z);
      // Heading lag: ease the yaw toward the tangent (shortest way round).
      const target = s1 >= s0 ? pose.yaw : pose.yaw + Math.PI;
      if (yaw === null || raw >= 1) yaw = target;
      else {
        const dt = Math.max(0, raw - last) * dur;
        let d = target - yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw += d * Math.min(1, dt / 0.08);
      }
      last = raw;
      body.rotation.y = yaw;
      if (raw >= 1 && opts.hideAtEnd) actor.visible = false;
    },
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
