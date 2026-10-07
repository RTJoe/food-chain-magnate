/**
 * Small motion helpers shared by the WP-D choreographies (board.ts, phase.ts): reveal / drop /
 * grow / shrink a reconciler piece, puffs, confetti, sparks, coins, ring pulses and floating chips.
 *
 * Every helper follows the choreography rules (choreo.ts): it builds its clips up front, restores
 * the piece's exact transform at raw = 1 (finish / Skip deliver raw = 1), and in reduced mode
 * replaces motion with a plain appear / disappear at the same time.
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { releaseTree } from '../../minis/ctx.js';
import { animateConfetti, animatePuff } from '../../minis/props.js';
import { sparkGeo } from '../../minis/tokens.js';
import { makeChip } from '../../overlays/badges.js';
import { ease, type Ease } from '../../tween.js';
import type { ChoreoCtx } from '../choreo.js';
import type { Timeline } from '../timeline.js';

export const isReduced = (ctx: ChoreoCtx) => ctx.mode === 'reduced';

export interface Base {
  p: THREE.Vector3;
  r: THREE.Euler;
  s: THREE.Vector3;
}
export const baseOf = (o: THREE.Object3D): Base => ({ p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() });
/**
 * Put back the channels the helpers animate (height, rotation, scale). x / z stay where they are:
 * the reconciler may have moved the piece meanwhile (the board re-bases on a Ketchup map tile).
 */
export const restore = (o: THREE.Object3D, b: Base) => {
  o.position.y = b.p.y;
  o.rotation.copy(b.r);
  o.scale.copy(b.s);
};

/** Mount a one-off overlay object for the timeline's lifetime; instanced parts released after. */
export function transient(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D): void {
  ctx.mount(tl, o);
  tl.own(() => releaseTree(o));
}

/** Hide `o` now and show it at `at` (also on finish). */
export function revealAt(tl: Timeline, o: THREE.Object3D, at: number): void {
  o.visible = false;
  tl.call(at, () => void (o.visible = true));
}

/**
 * Drop `o` from `height` above its spot onto it with a small overshoot (a "thud"), hidden until
 * `at`. Returns the landing time. Reduced: appears at `at`.
 */
export function dropIn(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D, at: number, opts: { dur?: number; height?: number; squash?: boolean; e?: Ease } = {}): number {
  const dur = opts.dur ?? 0.45;
  if (isReduced(ctx)) {
    revealAt(tl, o, at);
    return at;
  }
  const b = baseOf(o);
  const h = opts.height ?? 1.2;
  o.visible = false;
  tl.add({
    start: at,
    dur,
    ease: opts.e ?? ease.outBack,
    onStart: () => void (o.visible = true),
    update: (k, raw) => {
      if (raw >= 1) return restore(o, b);
      o.position.y = b.p.y + (1 - k) * h;
      if (opts.squash) {
        // Squash a touch around the landing (k crosses 1 with outBack).
        const sq = 1 - Math.max(0, k - 0.9) * 0.6;
        o.scale.set(b.s.x / Math.sqrt(sq), b.s.y * sq, b.s.z / Math.sqrt(sq));
      }
    },
  });
  return at + dur;
}

/** Scale-in pop with a small drop (the old pop-in), hidden until `at`. Returns the end. */
export function popIn(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D, at: number, dur = 0.38, lift = 0.5): number {
  if (isReduced(ctx)) {
    revealAt(tl, o, at);
    return at;
  }
  const b = baseOf(o);
  o.visible = false;
  tl.add({
    start: at,
    dur,
    ease: ease.outBack,
    onStart: () => void (o.visible = true),
    update: (k, raw) => {
      if (raw >= 1) return restore(o, b);
      const s = Math.max(0.001, k);
      o.scale.set(b.s.x * s, b.s.y * s, b.s.z * s);
      o.position.y = b.p.y + (1 - Math.min(1, k)) * lift;
    },
  });
  return at + dur;
}

/** Grow out of the ground: scale y 0 → 1 (x / z from `xz0`), hidden until `at`. */
export function growY(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D, at: number, dur = 0.4, opts: { xz0?: number; e?: Ease; lane?: 'focal' | 'tail' } = {}): number {
  if (isReduced(ctx)) {
    revealAt(tl, o, at);
    return at;
  }
  const b = baseOf(o);
  const xz0 = opts.xz0 ?? 0.85;
  o.visible = false;
  tl.add({
    start: at,
    dur,
    ease: opts.e ?? ease.outBack,
    lane: opts.lane ?? 'focal',
    onStart: () => void (o.visible = true),
    update: (k, raw) => {
      if (raw >= 1) return restore(o, b);
      const xz = xz0 + (1 - xz0) * Math.min(1.05, k);
      o.scale.set(b.s.x * xz, b.s.y * Math.max(0.001, k), b.s.z * xz);
    },
  });
  return at + dur;
}

/**
 * Shrink `o` away from `at` (sinks a little, optional tip), hidden at the end. `o` keeps its
 * transform reset at raw = 1 only when `keep`; graves are buried by the caller anyway.
 */
export function shrinkOut(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D, at: number, dur = 0.35, opts: { sink?: number; tip?: number; flat?: boolean; lane?: 'focal' | 'tail' } = {}): number {
  if (isReduced(ctx)) {
    tl.call(at, () => void (o.visible = false), opts.lane);
    return at;
  }
  const b = baseOf(o);
  tl.add({
    start: at,
    dur,
    ease: ease.inCubic,
    lane: opts.lane ?? 'focal',
    update: (k, raw) => {
      if (raw >= 1) {
        o.visible = false;
        return;
      }
      const s = Math.max(0.001, 1 - k);
      if (opts.flat) o.scale.set(b.s.x * (1 - k * 0.15), b.s.y * s, b.s.z * (1 - k * 0.15));
      else o.scale.set(b.s.x * s, b.s.y * s, b.s.z * s);
      o.position.y = b.p.y - k * (opts.sink ?? 0.1);
      if (opts.tip) o.rotation.z = b.r.z + k * opts.tip;
    },
  });
  return at + dur;
}

/** Steam / dust puff (pooled) at a world point. Tail lane. Reduced: none. */
export function puff(tl: Timeline, ctx: ChoreoCtx, kind: 'steam' | 'dust', x: number, y: number, z: number, at: number, opts: { dur?: number; scale?: number } = {}): void {
  if (isReduced(ctx)) return;
  const a = ctx.actor(tl, 'puff', null, kind);
  const dur = opts.dur ?? 0.5;
  tl.add({
    start: at,
    dur,
    lane: 'tail',
    onStart: () => {
      a.visible = true;
      a.position.set(x, y, z);
      a.scale.setScalar(opts.scale ?? 1);
    },
    update: (_k, raw) => {
      animatePuff(a, raw);
      if (raw >= 1) a.visible = false;
    },
  });
}

/** A line of dust puffs between two ground points (seams, footprints). */
export function dustLine(tl: Timeline, ctx: ChoreoCtx, x0: number, z0: number, x1: number, z1: number, at: number, n = 3, scale = 1.2): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    puff(tl, ctx, 'dust', x0 + (x1 - x0) * t, 0.04, z0 + (z1 - z0) * t, at + i * 0.03, { scale });
  }
}

/** Confetti burst (pooled; none on the low tier or in reduced mode). */
export function confetti(tl: Timeline, ctx: ChoreoCtx, color: string, x: number, y: number, z: number, at: number, dur = 0.9, scale = 1): void {
  if (isReduced(ctx) || ctx.caps.confetti <= 0) return;
  const a = ctx.actor(tl, 'confetti', color);
  tl.add({
    start: at,
    dur,
    lane: 'tail',
    onStart: () => {
      a.visible = true;
      a.position.set(x, y, z);
      a.scale.setScalar(scale);
    },
    update: (_k, raw) => {
      animateConfetti(a, raw);
      if (raw >= 1) a.visible = false;
    },
  });
}

/** `n` sparks fly out from a point and fade (milestones). */
export function sparks(tl: Timeline, ctx: ChoreoCtx, x: number, y: number, z: number, at: number, n = 4, dur = 0.6): void {
  if (isReduced(ctx)) return;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.visible = false;
  const geo = sparkGeo();
  const parts: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const s = ctx.stage.inst.proxy(geo, { castShadow: false });
    g.add(s);
    parts.push(s);
  }
  transient(tl, ctx, g);
  tl.add({
    start: at,
    dur,
    ease: ease.outCubic,
    lane: 'tail',
    update: (k, raw) => {
      g.visible = raw > 0 && raw < 1;
      parts.forEach((s, i) => {
        const a = (i / n) * Math.PI * 2 + 0.6;
        s.position.set(Math.cos(a) * 0.5 * k, 0.3 * k - 0.25 * k * k + (i % 2) * 0.1 * k, Math.sin(a) * 0.5 * k);
        s.scale.setScalar(Math.max(0.001, (1 - k) * 1.6));
      });
    },
  });
}

/** Coins: one coin per point drops from `fromY` into the ground (payday) or bursts up (tips). */
export function coin(tl: Timeline, ctx: ChoreoCtx, x: number, z: number, at: number, mode: 'drop' | 'burst', dur = 0.55, i = 0): void {
  if (isReduced(ctx)) return;
  const c = ctx.actor(tl, 'coin');
  const ang = i * 2.1;
  tl.add({
    start: at,
    dur,
    ease: mode === 'drop' ? ease.inCubic : ease.outCubic,
    lane: 'tail',
    update: (k, raw) => {
      c.visible = raw > 0 && raw < 1;
      if (mode === 'drop') {
        // Falls from above the roof and sinks into the ground.
        c.position.set(x, 1.9 - k * 2.0, z);
        c.rotation.set(Math.PI / 2, k * 8, 0);
        c.scale.setScalar(k > 0.85 ? Math.max(0.001, (1 - k) / 0.15) : 1);
      } else {
        c.position.set(x + Math.cos(ang) * 0.45 * k, 1.5 + k * 0.9 - k * k * 0.6, z + Math.sin(ang) * 0.45 * k);
        c.rotation.set(k * 6, 0, 0);
        c.scale.setScalar(1 - k * 0.5);
      }
    },
  });
}

/** Flat ring that expands and fades on the ground under a piece (turn start, highlights). */
export function ringPulse(tl: Timeline, ctx: ChoreoCtx, color: string, x: number, z: number, r: number, at: number, dur = 0.4, lane: 'focal' | 'tail' = 'tail'): void {
  if (isReduced(ctx)) return;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 40).rotateX(-Math.PI / 2), mat);
  m.renderOrder = 5;
  m.position.set(x, 0.09, z);
  m.visible = false;
  ctx.mount(tl, m);
  tl.add({
    start: at,
    dur,
    ease: ease.outCubic,
    lane,
    update: (k, raw) => {
      m.visible = raw > 0 && raw < 1;
      m.scale.setScalar(0.7 + k * 0.6);
      mat.opacity = 0.9 * (1 - k);
    },
  });
}

/**
 * A chip (text, optional good glyph) that pops in at a world point, rises, and shrinks away.
 * Reduced: shown in place for the same time.
 */
export function chip(tl: Timeline, ctx: ChoreoCtx, text: string, good: FoodId | null, bg: string, x: number, y: number, z: number, at: number, dur = 0.7, opts: { rise?: number; size?: number; flip?: boolean } = {}): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const s = makeChip(text, good, bg, opts.size ?? 0.36);
  s.center.set(0.5, 0);
  g.add(s);
  g.visible = false;
  ctx.mount(tl, g);
  const still = isReduced(ctx);
  const rise = still ? 0 : (opts.rise ?? 0.45);
  tl.add({
    start: at,
    dur,
    lane: 'tail',
    update: (_k, raw) => {
      g.visible = raw > 0 && raw < 1;
      const pin = still ? 1 : raw < 0.2 ? ease.outBack(raw / 0.2) : raw > 0.8 ? (1 - raw) / 0.2 : 1;
      // Flip in: the chip's width opens from 0 (a card turning over).
      g.scale.set(opts.flip && raw < 0.2 && !still ? Math.max(0.001, raw / 0.2) : Math.max(0.001, pin), Math.max(0.001, pin), 1);
      g.position.y = y + ease.outCubic(raw) * rise;
    },
  });
}

/** World position of a named child (sign, roof anchor), or the piece origin. */
export function worldOf(o: THREE.Object3D, name: string | null, local?: THREE.Vector3): THREE.Vector3 {
  const n = (name && o.getObjectByName(name)) || o;
  n.updateWorldMatrix(true, false);
  const v = local ? local.clone() : new THREE.Vector3();
  return n.localToWorld(v);
}
