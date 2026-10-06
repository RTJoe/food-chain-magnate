/**
 * Shared pieces for the WP-C choreographies (dinner, drinks, marketing): arc flights, floating
 * chips, coin bursts, puffs, pulses, masking of fresh demand tokens, and the replay flag.
 *
 * Everything is built up front and driven by clips; every clip's raw = 1 update leaves the scene in
 * its final state (transients hidden, real pieces restored), because `finish()` delivers raw = 1.
 */
import * as THREE from 'three';
import type { DemandToken, FoodId, GameEvent, HouseId } from '@fcm/engine';
import { pulseCash } from '../../../state/interaction.js';
import { makeChip } from '../../overlays/badges.js';
import { animatePuff } from '../../minis/props.js';
import { ease } from '../../tween.js';
import type { ChoreoCtx } from '../choreo.js';
import type { ClipSpec, Timeline } from '../timeline.js';

export type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;
type V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// Replay flag
// ---------------------------------------------------------------------------

const replays = new WeakSet<ChoreoCtx>();

/** Mark a context as a replay ("Watch again"): choreographies leave the real pieces alone. */
export function markReplay(ctx: ChoreoCtx): void {
  replays.add(ctx);
}

export function isReplay(ctx: ChoreoCtx): boolean {
  return replays.has(ctx);
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/** Top centre of a live piece (restaurant roof, campaign top), or null. */
export function pieceTop(ctx: ChoreoCtx, key: string, dy = 0): V3 | null {
  const p = ctx.rec.live.get(key);
  if (!p) return null;
  return new THREE.Vector3((p.rect.x0 + p.rect.x1) / 2, p.height + dy, (p.rect.z0 + p.rect.z1) / 2);
}

/** Top of the first live piece with this engine id (restaurant / entity / source). */
export function idTop(ctx: ChoreoCtx, id: string, dy = 0): V3 | null {
  const p = ctx.rec.byId(id)[0];
  if (!p) return null;
  return new THREE.Vector3((p.rect.x0 + p.rect.x1) / 2, p.height + dy, (p.rect.z0 + p.rect.z1) / 2);
}

/** The house's number-badge anchor (where the demand plaque sits). */
export function houseAnchor(ctx: ChoreoCtx, houseId: string): V3 | null {
  const a = ctx.feedback.anchors.house(houseId);
  return a ? new THREE.Vector3(a.x, a.y, a.z) : null;
}

export function worldOf(o: THREE.Object3D, out = new THREE.Vector3()): V3 {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(out);
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

/**
 * Arc flight of `o` from `from` to `to` (world, `o` parented to the actor / overlay layer).
 * Shown at the start, hidden at the end unless `keep`. `shrink` scales it away over the last 30%.
 */
export function arcClip(o: THREE.Object3D, from: V3, to: V3, dur: number, opts: { height?: number; spin?: number; lane?: 'focal' | 'tail'; keep?: boolean; shrink?: boolean; scale?: number; ease?: (t: number) => number } = {}): ClipSpec {
  const h = opts.height ?? 0.35 + from.distanceTo(to) * 0.15;
  const s0 = opts.scale ?? 1;
  return {
    dur,
    ease: opts.ease ?? ease.inOutCubic,
    lane: opts.lane ?? 'focal',
    onStart: () => void (o.visible = true),
    update: (k, raw) => {
      o.position.lerpVectors(from, to, k);
      o.position.y += Math.sin(k * Math.PI) * h;
      o.rotation.y = k * (opts.spin ?? 3);
      const s = opts.shrink && k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      o.scale.setScalar(Math.max(0.001, s0 * s));
      if (raw >= 1 && !opts.keep) o.visible = false;
    },
  };
}

/** Scale pulse of an object around its current scale (pieces "nod"). Reduced: nothing. */
export function pulse(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D | null | undefined, at: number, dur = 0.35, amp = 0.14): void {
  if (!o || ctx.mode === 'reduced') return;
  const s0 = o.scale.clone();
  tl.add({
    start: at,
    dur,
    update: (_k, raw) => {
      const f = 1 + Math.sin(raw * Math.PI) * amp;
      o.scale.set(s0.x * f, s0.y * f, s0.z * f);
      if (raw >= 1) o.scale.copy(s0);
    },
  });
}

/** Horizontal shake (chips "no stock"). */
function shake(o: THREE.Object3D, raw: number, x0: number): void {
  o.position.x = x0 + Math.sin(raw * Math.PI * 6) * 0.06 * (1 - raw);
}

let chipWarned = false;

export interface ChipOpts {
  size?: number;
  /** Rise over the chip's life (world units). */
  rise?: number;
  /** Sprite centre (0..1); default bottom centre. */
  center?: [number, number];
  lane?: 'focal' | 'tail';
  /** Shake once after popping. */
  shake?: boolean;
  fg?: string;
  /** Good glyph on the chip. */
  good?: FoodId | null;
}

/**
 * A chip that pops at `start` (outBack), optionally floats up, holds and shrinks away at
 * `start + life`. Reduced: appears and disappears in place.
 */
export function chip(tl: Timeline, ctx: ChoreoCtx, text: string, color: string, at: V3, start: number, life: number, opts: ChipOpts = {}): THREE.Group {
  const w = new THREE.Group();
  let s: THREE.Sprite;
  try {
    s = makeChip(text, opts.good ?? null, color, opts.size ?? 0.4, opts.fg);
  } catch (err) {
    // No canvas (tests, lost context): the beat goes on without its chip.
    if (!chipWarned) console.warn('[anim] chip failed', err);
    chipWarned = true;
    return w;
  }
  const c = opts.center ?? [0.5, 0];
  s.center.set(c[0], c[1]);
  w.add(s);
  w.visible = false;
  w.position.copy(at);
  ctx.mount(tl, w);
  const reduced = ctx.mode === 'reduced';
  const rise = reduced ? 0 : (opts.rise ?? 0);
  const x0 = at.x;
  tl.add({
    start,
    dur: Math.max(0.2, life),
    lane: opts.lane ?? 'tail',
    update: (_k, raw) => {
      w.visible = raw > 0 && raw < 1;
      const t = raw * life;
      const pop = reduced ? 1 : t < 0.18 ? ease.outBack(t / 0.18) : t > life - 0.15 ? Math.max(0, (life - t) / 0.15) : 1;
      w.scale.setScalar(Math.max(0.001, pop));
      w.position.y = at.y + rise * ease.outCubic(raw);
      if (opts.shake && !reduced) shake(w, Math.min(1, t / 0.45), x0);
    },
  });
  return w;
}

/** Coins fountain over a point and fall back in (pooled coins). Fires `onLand` as they land. */
export function coins(tl: Timeline, ctx: ChoreoCtx, at: V3, start: number, opts: { n?: number; dur?: number; onLand?: () => void } = {}): number {
  const n = ctx.mode === 'reduced' ? 0 : (opts.n ?? 5);
  const dur = opts.dur ?? 0.6;
  for (let i = 0; i < n; i++) {
    const c = ctx.actor(tl, 'coin');
    const ang = (i / n) * Math.PI * 2 + 0.3;
    const dx = Math.cos(ang) * 0.32;
    const dz = Math.sin(ang) * 0.32;
    tl.add({
      start: start + i * 0.04,
      dur,
      lane: 'tail',
      onStart: () => void (c.visible = true),
      update: (k, raw) => {
        // Up out of the roof, over and down into it again.
        const up = Math.sin(k * Math.PI) * 0.75;
        c.position.set(at.x + dx * Math.sin(k * Math.PI), at.y + up, at.z + dz * Math.sin(k * Math.PI));
        c.rotation.set(k * 9, k * 4, 0);
        c.scale.setScalar(Math.max(0.001, k > 0.85 ? (1 - k) / 0.15 : 1) * 1.1);
        if (raw >= 1) c.visible = false;
      },
    });
  }
  const end = start + (n ? (n - 1) * 0.04 + dur : 0);
  if (opts.onLand) tl.call(start + dur * 0.8, opts.onLand, 'tail');
  return end;
}

/** Cash counter pulse when money lands (UI listens to `cashPulse`). */
export function cashAt(tl: Timeline, at: number, player: string, delta: number): void {
  if (!delta) return;
  tl.call(at, () => pulseCash(player, delta), 'tail');
}

/** Steam / dust puff at a point. */
export function puff(tl: Timeline, ctx: ChoreoCtx, kind: 'steam' | 'dust', at: V3, start: number, dur = 0.5, scale = 1): void {
  if (ctx.mode === 'reduced') return;
  const p = ctx.actor(tl, 'puff', null, kind);
  p.position.copy(at);
  p.scale.setScalar(scale);
  tl.add({
    start,
    dur,
    lane: 'tail',
    onStart: () => void (p.visible = true),
    update: (k, raw) => {
      animatePuff(p, k);
      if (raw >= 1) p.visible = false;
    },
  });
}

/** Hide an object from `from` until `to` (pieces masked during a beat), restoring it at the end. */
export function hideDuring(tl: Timeline, o: THREE.Object3D | null | undefined, from: number, to: number): void {
  if (!o) return;
  tl.add({
    start: from,
    dur: Math.max(0.01, to - from),
    lane: 'tail',
    update: (_k, raw) => void (o.visible = raw >= 1),
  });
}

// ---------------------------------------------------------------------------
// Fresh demand tokens (marketing): hidden until their carrier lands
// ---------------------------------------------------------------------------

/** Tokens already landed per house in this batch (several campaigns can hit one house). */
const landed = new WeakMap<ChoreoCtx, Map<string, number>>();
/** Roof plaque holds per house: the plaque shows the pre-batch demand plus what has landed so far. */
const plaques = new WeakMap<ChoreoCtx, Map<string, { tokens: DemandToken[]; release: () => void }>>();

function plaqueHold(tl: Timeline, ctx: ChoreoCtx, houseId: string): { tokens: DemandToken[]; release: () => void } | null {
  if (typeof ctx.rec.holdPlaque !== 'function') return null;
  let m = plaques.get(ctx);
  if (!m) plaques.set(ctx, (m = new Map()));
  let st = m.get(houseId);
  if (!st) {
    const before = [...(ctx.prevView?.board.houses[houseId]?.demand ?? [])];
    const hold = { tokens: before, release: ctx.rec.holdPlaque(houseId, before) };
    st = hold;
    m.set(houseId, hold);
    // The newest hold wins; releasing it at the end restores the real plaque.
    tl.own(() => hold.release());
  }
  return st;
}

export interface DemandLanding {
  houseId: HouseId;
  /** Where carriers aim (the first fresh token, else the plaque anchor). */
  target: V3;
  /** Reveal the fresh tokens at timeline time `t` with a short squash; returns the end time. */
  reveal(t: number): number;
}

/**
 * The real tokens a `demandPlaced` added, hidden now and revealed when the carrier lands. In a
 * replay (real stack has moved on) nothing is hidden: the carrier lands on the plaque anchor.
 */
export function demandLanding(tl: Timeline, ctx: ChoreoCtx, e: Ev<'demandPlaced'>): DemandLanding | null {
  const anchor = houseAnchor(ctx, e.houseId);
  if (!anchor) return null;
  const key = `demand:${e.houseId}`;
  const p = ctx.rec.live.get(key);
  if (isReplay(ctx) || !p) {
    return { houseId: e.houseId, target: anchor.clone().setY(anchor.y + 0.1), reveal: (t) => t };
  }
  let seen = landed.get(ctx);
  if (!seen) landed.set(ctx, (seen = new Map()));
  const base = ctx.prevDemand.get(key) ?? 0;
  const before = base + (seen.get(key) ?? 0);
  seen.set(key, before - base + e.tokens.length);
  const fresh = p.obj.children.filter((c) => {
    if (!c.name.startsWith('token:')) return false;
    const i = Number(c.name.slice(6));
    return i >= before && i < before + e.tokens.length;
  });
  // The roof plaque counts up as tokens land (reconciler hold), else it pops with the first token.
  const hold = plaqueHold(tl, ctx, e.houseId);
  const extra: THREE.Object3D[] = [];
  if (before === 0) {
    // The whole stack is new: plinth (and plaque, without a hold) appear with the first token.
    for (const n of hold ? ['plinth'] : ['plinth', 'plaque']) {
      const o = p.obj.getObjectByName(n);
      if (o) extra.push(o);
    }
  }
  const target = fresh[0] ? worldOf(fresh[0]) : anchor.clone();
  const all = [...extra, ...fresh];
  for (const o of all) o.visible = false;
  const reduced = ctx.mode === 'reduced';
  let revealed = false;
  // Safety: whatever happens, the real stack is fully visible when the timeline ends.
  tl.own(() => {
    for (const o of all) o.visible = true;
  });
  return {
    houseId: e.houseId,
    target,
    reveal(t: number): number {
      if (revealed) return t;
      revealed = true;
      if (hold)
        tl.call(t, () => {
          hold.tokens = [...hold.tokens, ...e.tokens];
          hold.release = ctx.rec.holdPlaque(e.houseId, hold.tokens);
        });
      if (reduced) {
        tl.call(t, () => all.forEach((o) => (o.visible = true)));
        return t;
      }
      const ys = all.map((o) => o.position.y);
      const ss = all.map((o) => o.scale.x);
      tl.add({
        start: t,
        dur: 0.22,
        update: (k, raw) => {
          all.forEach((o, i) => {
            o.visible = true;
            if (o.name === 'plaque') return;
            // Squash on landing: drop the last bit, flatten, spring back.
            const sq = raw >= 1 ? 1 : 1 - Math.sin(k * Math.PI) * 0.25;
            o.scale.set(ss[i]! * (2 - sq), ss[i]! * sq, ss[i]! * (2 - sq));
            o.position.y = ys[i]! + (raw >= 1 ? 0 : (1 - k) * 0.12);
          });
        },
      });
      return t + 0.22;
    },
  };
}

/** The ghost stack's token children (for per-token pops), in stack order. */
export function ghostTokens(g: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  g.traverse((o) => {
    if (o.name.startsWith('token:')) out.push(o);
  });
  return out.sort((a, b) => Number(a.name.slice(6)) - Number(b.name.slice(6)));
}

/** Pop a single token: up a little and shrink away. */
export function popClip(o: THREE.Object3D, dur = 0.2): ClipSpec {
  const y0 = o.position.y;
  const s0 = o.scale.x;
  return {
    dur,
    ease: ease.inCubic,
    update: (k, raw) => {
      o.position.y = y0 + k * 0.18;
      o.scale.setScalar(Math.max(0.001, s0 * (1 + k * 0.3) * (1 - k)));
      if (raw >= 1) o.visible = false;
    },
  };
}

/** `count` goods of each line, capped. */
export const goodsOf = (lines: readonly { good: string; count: number }[], max: number): string[] =>
  lines.flatMap((l) => Array.from({ length: l.count }, () => l.good)).slice(0, max);

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
