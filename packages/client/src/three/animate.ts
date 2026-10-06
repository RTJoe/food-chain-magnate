/**
 * Event animations (animation-plan §4; architecture §5.3). The scene already shows the final
 * state (`rec.sync` runs before this); the Animator is a layer of transient actors on top that
 * nothing waits on. Each batch is compiled into a plan (anim/compile.ts), every beat is handed to
 * its registered choreography (anim/basic.ts and the modules in anim/index.ts) which lays clips
 * on one Timeline, and the timeline plays on the shared Tweens (speed, Skip, on-demand render).
 *
 * Queue policy (§1.7): a batch arriving while a timeline runs is queued (max 2) when it belongs to
 * the same phase and the running one has under 3 s left at the current speed; otherwise the running
 * timeline finishes (jump to end, actors released) and the new one starts. A batch with nothing to
 * show on the board (submissions, ambient turn / phase beats) never interrupts. A batch that arrives
 * while the tab is hidden, or has waited more than 20 s, is finished without playing (its closing
 * caption still shows). Reduced motion (`prefers-reduced-motion` or speed 0) compiles the plan in
 * reduced mode: holds, captions and static drawings, no travel.
 */
import { effect } from '@preact/signals';
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';
import { boardView } from '../state/boardBridge.js';
import { currentBeat, replayRequest, showCaption } from '../state/feedback.js';
import { animationSpeed } from '../state/interaction.js';
import { markReplay } from './anim/choreos/carriers.js';
import { FeedbackLayer } from './overlays/feedback.js';
import type { Reconciler } from './reconcile.js';
import type { Stage } from './scene.js';
import { compile, createChoreoCtx, registry, Timeline, ActorPool, type Plan } from './anim/index.js';

const GROUP = 'anim';
/** How long the closing caption stays (it never blocks input). */
const CAPTION_HOLD_MS = 3800;
/** Queue a same-phase batch only when the running timeline ends within this (wall-clock s). */
const QUEUE_WITHIN = 3;
const QUEUE_MAX = 2;
/** Batches older than this (wall-clock ms) are finished without playing. */
const STALE_MS = 20_000;
/** Beats that never interrupt a running timeline (dropped while one plays). */
const AMBIENT = new Set<string>(['turn', 'phase']);

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/** What `play` needs besides the events (index.ts passes `rec.sync`'s result). */
export interface BatchInfo {
  view: GameView | null;
  prevView: GameView | null;
  me: PlayerId | null;
  added: readonly string[];
  removed: readonly string[];
  prevDemand: ReadonlyMap<string, number>;
}

interface Pending {
  events: readonly GameEvent[];
  info: BatchInfo;
  plan: Plan;
  arrived: number;
  /** "Watch again": the real pieces are left alone (choreographies check `isReplay`). */
  replay?: boolean;
}

export class Animator {
  readonly feedback: FeedbackLayer;
  readonly pool: ActorPool;
  private tl: Timeline | null = null;
  private current: Pending | null = null;
  private queue: Pending[] = [];
  private startedAt = 0;
  private onVisibility = () => {
    if (typeof document !== 'undefined' && !document.hidden && this.tl?.active && performance.now() - this.startedAt > STALE_MS) this.finish();
  };
  /** Called with true when a timeline starts, false when the layer goes idle. */
  onActive: ((active: boolean) => void) | null = null;
  private lastView: { view: GameView | null; me: PlayerId | null } = { view: null, me: null };
  private stopReplays: () => void;

  constructor(
    private readonly stage: Stage,
    private readonly rec: Reconciler,
  ) {
    this.feedback = new FeedbackLayer(stage, rec);
    this.pool = new ActorPool(stage);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    let first = true;
    this.stopReplays = effect(() => {
      const r = replayRequest.value;
      if (first) return void (first = false);
      if (r) this.replay(r.events, r.fromId);
    });
  }

  dispose(): void {
    this.stopReplays();
    this.finish();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.pool.dispose();
    this.feedback.dispose();
  }

  /** The running timeline (dev / e2e hooks), or null when idle. */
  get timeline(): Timeline | null {
    return this.tl;
  }

  get active(): boolean {
    return !!this.tl?.active;
  }

  /** Skip: finish the running timeline and everything queued; settle reconciler pop / shrink tweens. */
  skip(): void {
    this.finish();
    // Chained tweens start a tick later; finish twice so follow-ups land too.
    this.stage.tweens.finish(GROUP);
    queueMicrotask(() => this.stage.tweens.finish(GROUP));
  }

  /** Jump to the end of everything (snapshots, hot-seat handoff, reconnect). Keeps the last caption. */
  finish(): void {
    const queued = this.queue;
    this.queue = [];
    this.tl?.finish();
    // Queued batches never play; the newest closing caption wins.
    const last = queued[queued.length - 1];
    if (last?.plan.closing) showCaption(last.plan.closing, CAPTION_HOLD_MS);
  }

  /**
   * Replay a finished Dinnertime / Marketing from its stored events ("Watch again", animation-plan
   * §1.4): only the house / campaign beats, against the current board, starting at the beat with
   * id `fromId` when given ("Play from here"). Real pieces stay as they are; choreographies draw
   * ghosts and transient carriers. Anything running finishes first.
   */
  replay(events: readonly GameEvent[], fromId: string | null = null, view?: GameView | null, me?: PlayerId | null): void {
    const v = view ?? this.lastView.view ?? boardView.peek().view;
    const who = me ?? this.lastView.me ?? boardView.peek().me;
    if (!v) return;
    this.finish();
    const plan = compile(events, { view: v, prevView: v, me: who, mode: this.mode(), kinds: new Set(registry.keys()) });
    let beats = plan.beats.filter((b) => b.segment === 'dinnertime' || b.segment === 'marketing');
    const from = fromId ? Math.max(0, beats.findIndex((b) => b.id === fromId)) : 0;
    beats = beats.slice(from);
    if (!beats.length) return;
    const t0 = beats[0]!.at;
    for (const b of beats) b.at -= t0;
    const length = beats.reduce((m, b) => Math.max(m, b.at + b.dur), 0);
    const p: Pending = {
      events,
      info: { view: v, prevView: v, me: who, added: [], removed: [], prevDemand: new Map() },
      plan: { ...plan, beats, length, segments: plan.segments.filter((s) => s.segment === 'dinnertime' || s.segment === 'marketing') },
      arrived: performance.now(),
      replay: true,
    };
    this.start(p);
  }

  private mode(): 'full' | 'reduced' {
    return reducedMotion() || animationSpeed.peek() <= 0 || this.stage.tweens.speed <= 0 ? 'reduced' : 'full';
  }

  /** Animate one applied batch. */
  play(events: readonly GameEvent[], info: BatchInfo): void {
    this.lastView = { view: info.view, me: info.me };
    const speed = this.stage.tweens.speed;
    const mode = this.mode();
    const plan = compile(events, { view: info.view, prevView: info.prevView, me: info.me, mode, added: info.added, kinds: new Set(registry.keys()) });
    const p: Pending = { events, info, plan, arrived: performance.now() };
    if (typeof document !== 'undefined' && document.hidden) {
      this.finish();
      this.settle(p);
      return;
    }
    if (this.tl?.active && this.current) {
      // Nothing to show on the board (submissions, prompts, ambient turn / phase beats): a busy
      // table (bots answering within a second) must not cut a running Dinnertime or replay short.
      if (plan.beats.every((b) => AMBIENT.has(b.kind))) {
        this.settle(p);
        return;
      }
      const left = this.tl.remaining / Math.max(0.01, speed);
      if (plan.phase === this.current.plan.phase && left < QUEUE_WITHIN && this.queue.length < QUEUE_MAX) {
        this.queue.push(p);
        return;
      }
      this.finish();
    }
    this.start(p);
  }

  // ---------------------------------------------------------------------------

  /** Finished without playing: only the closing caption. */
  private settle(p: Pending): void {
    if (p.plan.closing) showCaption(p.plan.closing, CAPTION_HOLD_MS);
  }

  private start(p: Pending): void {
    if (performance.now() - p.arrived > STALE_MS) {
      this.settle(p);
      return this.next();
    }
    const { plan, info } = p;
    const tl = new Timeline(this.stage.tweens, GROUP);
    const ctx = createChoreoCtx({ stage: this.stage, rec: this.rec, feedback: this.feedback, pool: this.pool, plan, ...info });
    if (p.replay) markReplay(ctx);
    const replay = !!p.replay;
    for (const beat of plan.beats) {
      const fn = registry.get(beat.kind);
      if (!fn) continue;
      // The results strip's stepper follows the house / campaign being played.
      if (beat.segment === 'dinnertime' || beat.segment === 'marketing') tl.call(beat.at, () => void (currentBeat.value = { id: beat.id, kind: beat.kind, replay }));
      try {
        fn(beat, beat.at, tl, ctx);
      } catch (err) {
        console.error(`[anim] ${beat.kind} choreography failed`, err);
      }
    }
    tl.own(() => void (currentBeat.value = null));
    if (plan.closing) {
      const closing = plan.closing;
      tl.call(Math.max(plan.length, tl.focalEnd), () => showCaption(closing, CAPTION_HOLD_MS), 'tail');
    }
    if (!tl.length && !plan.beats.length) {
      tl.finish();
      return this.next();
    }
    this.tl = tl;
    this.current = p;
    this.startedAt = performance.now();
    this.onActive?.(true);
    this.stage.invalidate();
    void tl.play().then(() => {
      if (this.tl !== tl) return;
      this.tl = null;
      this.current = null;
      this.next();
    });
  }

  private next(): void {
    const p = this.queue.shift();
    if (p) return this.start(p);
    this.onActive?.(false);
  }
}
