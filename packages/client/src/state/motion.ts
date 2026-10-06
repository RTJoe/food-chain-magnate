/**
 * Motion signals shared by the 3D animator (three/anim) and the overlay's motion layer
 * (ui/motion.tsx). Neither side imports the other (architecture §2).
 *
 * - `motionBatch`: every applied batch with its events and the view before it, published by
 *   boardBridge.setView before the overlay re-renders, so the motion layer can measure the old
 *   DOM (FLIP "first" rects) first. `onBeforeMotion` hooks run synchronously at that point.
 * - Cash counters (animation-plan §2.10 `cashChanged`): money a board choreography shows landing
 *   (tips, salaries) is claimed when the batch is published and settled when its coins land
 *   (`settleCash`; Skip, snapshots and a 5 s expiry release it too). Counters show
 *   `cash - claimed` and roll on change; with no claim they roll at once.
 * - `boardPulse`: a board step landed for a player (goods reached the stock, coins hit the cash),
 *   so the matching rail counter bounces.
 */
import { signal } from '@preact/signals';
import { skipAnimations } from './interaction.js';
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';

export interface MotionBatch {
  n: number;
  events: readonly GameEvent[];
  prev: GameView | null;
  view: GameView | null;
}

export const motionBatch = signal<MotionBatch | null>(null);

const before = new Set<(b: MotionBatch) => void>();
let batchNo = 0;

/** Run `fn` synchronously when a batch arrives, before the overlay renders it. */
export function onBeforeMotion(fn: (b: MotionBatch) => void): () => void {
  before.add(fn);
  return () => before.delete(fn);
}

/**
 * boardBridge.setView: an applied batch. Empty events (snapshot, hot-seat handoff, reconnect)
 * settle everything. `boardAnimates`: the 3D board is up and will settle cash claims.
 */
export function publishMotion(prev: GameView | null, view: GameView | null, events: readonly GameEvent[], boardAnimates = false): void {
  if (!events.length) {
    if (view !== prev) clearCashClaims();
    return;
  }
  if (boardAnimates) claimBatch(events);
  const b: MotionBatch = { n: ++batchNo, events, prev, view };
  for (const fn of [...before]) {
    try {
      fn(b);
    } catch (err) {
      console.error('[motion] before hook failed', err);
    }
  }
  motionBatch.value = b;
}

// ---------------------------------------------------------------------------
// Cash claims
// ---------------------------------------------------------------------------

/** Cash still "in flight" per player (counter shows `cash - claimed`). */
export const cashClaims = signal<Readonly<Record<PlayerId, number>>>({});
/** Last settled amount (counters float "+$N" / "-$N"). */
export const cashPulse = signal<{ player: PlayerId; delta: number; n: number } | null>(null);
let pulseNo = 0;

/** Claims expire on their own: the board layer is never more than a few seconds behind. */
const CLAIM_MS = 5000;
const pending: { player: PlayerId; delta: number; timer: ReturnType<typeof setTimeout> }[] = [];

function publishClaims(): void {
  const next: Record<PlayerId, number> = {};
  for (const c of pending) next[c.player] = (next[c.player] ?? 0) + c.delta;
  cashClaims.value = next;
}

/** Hold back `delta` of a player's cash until a board step settles it (or the claim expires). */
export function claimCash(player: PlayerId, delta: number): void {
  if (!delta) return;
  const c = { player, delta, timer: setTimeout(() => settleCash(player, delta), CLAIM_MS) };
  pending.push(c);
  publishClaims();
}

/** A board step landed: release the matching claim (if any) and pulse the counter. */
export function settleCash(player: PlayerId, delta: number): void {
  if (!delta) return;
  const i = pending.findIndex((c) => c.player === player && c.delta === delta);
  if (i >= 0) {
    clearTimeout(pending[i]!.timer);
    pending.splice(i, 1);
    publishClaims();
  }
  cashPulse.value = { player, delta, n: ++pulseNo };
}

/** Release every claim at once (Skip, snapshots, scene teardown). */
export function clearCashClaims(): void {
  if (!pending.length) return;
  for (const c of pending.splice(0)) clearTimeout(c.timer);
  publishClaims();
}

/**
 * Money the board choreographies show landing (three/anim/phase.ts): tips and salaries. Claimed
 * when the batch is published, so a batch the animator queues behind another one still holds the
 * counter until its coins land.
 */
function claimBatch(events: readonly GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'tipsPaid') claimCash(e.player, e.amount);
    else if (e.type === 'salaryPaid' && e.paid > 0) claimCash(e.player, -e.paid);
  }
}

skipAnimations.subscribe(() => clearCashClaims());

// ---------------------------------------------------------------------------
// Board → rail pulses
// ---------------------------------------------------------------------------

export type PulseKind = 'goods' | 'cash' | 'star';
export const boardPulse = signal<{ kind: PulseKind; player: PlayerId; n: number } | null>(null);

export function pulseRail(kind: PulseKind, player: PlayerId): void {
  boardPulse.value = { kind, player, n: ++pulseNo };
}
