/**
 * Timeline (animation-plan §4.1): clips with absolute starts (seconds at 1×), built up front by
 * the choreographies, then played. One driver tween on `Tweens` advances the whole timeline, so
 * the speed setting, `finish()` and the on-demand render loop keep working unchanged.
 *
 * Contract:
 * - Add every clip before `play()`. Clips may start in the past of a running timeline only by
 *   accident; they then run from their current raw value on the next frame.
 * - `update(k, raw)` is called every frame between start and end, and once with raw = 1 at the end
 *   (also on `finish()`). `onStart` runs once before the first update, `onEnd` once after the last.
 * - `own(fn)` registers cleanup (pool release, transient removal) run exactly once when the
 *   timeline ends or is finished.
 * - `finish()` is idempotent: every pending clip jumps to raw = 1, onEnd runs, owned cleanup runs.
 * - A throwing callback is logged and that clip is dropped; the timeline never wedges.
 */
import { ease as eases, type Ease, type Tweens } from '../tween.js';

export interface Clip {
  /** Absolute start in timeline seconds (at 1×). */
  start: number;
  dur: number;
  /** Default linear. */
  ease?: Ease;
  /** k eased 0..1, raw 0..1. Called once with raw = 1 on finish/skip. */
  update?: (k: number, raw: number) => void;
  onStart?: () => void;
  /** Also called by finish(). */
  onEnd?: () => void;
  /** Tails (van going home, coins) may outlive the next focal step. Default 'focal'. */
  lane?: 'focal' | 'tail';
}

export type ClipSpec = Omit<Clip, 'start'>;

interface Live extends Clip {
  state: 0 | 1 | 2; // pending, running, ended
  seq: number;
}

let uid = 0;

export class Timeline {
  private clips: Live[] = [];
  private owned: (() => void)[] = [];
  private t = 0;
  private gen = 0;
  private seqNo = 0;
  private started = false;
  private ended = false;
  private paused = false;
  private resolve: (() => void) | null = null;
  private promise: Promise<void> | null = null;
  private readonly group: string;

  constructor(
    private readonly tweens: Tweens,
    readonly label: string,
  ) {
    this.group = `${label}#${++uid}`;
  }

  add(clip: Clip): this {
    const c: Live = { ...clip, dur: Math.max(0, clip.dur), start: Math.max(0, clip.start), state: 0, seq: this.seqNo++ };
    if (this.ended) {
      // Too late to play: settle it at once.
      this.settle(c);
      return this;
    }
    // Keep clips sorted by start (stable), so callbacks fire in time order within a frame.
    let i = this.clips.length;
    while (i > 0 && this.clips[i - 1]!.start > c.start) i--;
    this.clips.splice(i, 0, c);
    return this;
  }

  /** Clips one after another from `at`; returns the end time. */
  seq(at: number, ...clips: ClipSpec[]): number {
    let t = at;
    for (const c of clips) {
      this.add({ ...c, start: t });
      t += Math.max(0, c.dur);
    }
    return t;
  }

  /** Clips together at `at`; returns the latest end. */
  par(at: number, ...clips: ClipSpec[]): number {
    let end = at;
    for (const c of clips) {
      this.add({ ...c, start: at });
      end = Math.max(end, at + Math.max(0, c.dur));
    }
    return end;
  }

  /** Clips `gap` apart from `at`; returns the latest end. */
  stagger(at: number, gap: number, clips: ClipSpec[]): number {
    let end = at;
    clips.forEach((c, i) => {
      const s = at + i * gap;
      this.add({ ...c, start: s });
      end = Math.max(end, s + Math.max(0, c.dur));
    });
    return end;
  }

  /** Run `fn` once at `at` (also on finish if not reached yet). */
  call(at: number, fn: () => void, lane: Clip['lane'] = 'focal'): this {
    return this.add({ start: at, dur: 0, onStart: fn, lane });
  }

  /** Cleanup run exactly once when the timeline ends or is finished (runs now if already ended). */
  own(fn: () => void): this {
    if (this.ended) safe(fn);
    else this.owned.push(fn);
    return this;
  }

  /** Last clip end (seconds at 1×). */
  get length(): number {
    let l = 0;
    for (const c of this.clips) l = Math.max(l, c.start + c.dur);
    return l;
  }

  /** Last end among focal clips (tails excluded). */
  get focalEnd(): number {
    let l = 0;
    for (const c of this.clips) if (c.lane !== 'tail') l = Math.max(l, c.start + c.dur);
    return l;
  }

  /** Current timeline time (seconds at 1×). */
  get time(): number {
    return this.t;
  }

  /** Seconds at 1× until the last clip ends. */
  get remaining(): number {
    return this.ended ? 0 : Math.max(0, this.length - this.t);
  }

  /** Playing (started, not ended). */
  get active(): boolean {
    return this.started && !this.ended;
  }

  get done(): boolean {
    return this.ended;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Start playing; resolves when every clip ended (or on finish()). Calling again returns the same promise. */
  play(): Promise<void> {
    if (this.promise) return this.promise;
    this.promise = new Promise<void>((r) => (this.resolve = r));
    this.started = true;
    this.advance(this.t);
    if (!this.ended) {
      if (this.length <= this.t) this.finish();
      else this.drive();
    }
    return this.promise;
  }

  /** Jump every clip to its end, run cleanup, resolve play(). Idempotent. */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.gen++;
    this.tweens.finish(this.group);
    this.t = Math.max(this.t, this.length);
    for (const c of this.clips) this.settle(c);
    const owned = this.owned;
    this.owned = [];
    for (const fn of owned) safe(fn);
    this.started = true;
    this.resolve?.();
  }

  /** Test hook: freeze the clock (e2e screenshots mid-trip). */
  pause(): void {
    if (!this.active || this.paused) return;
    this.paused = true;
    this.gen++;
    this.tweens.finish(this.group);
  }

  resume(): void {
    if (!this.paused || this.ended) return;
    this.paused = false;
    this.drive();
  }

  // ---------------------------------------------------------------------------

  private drive(): void {
    const gen = ++this.gen;
    const t0 = this.t;
    const len = Math.max(1e-4, this.length - t0);
    void this.tweens.add(
      len,
      (_k, raw) => {
        if (gen !== this.gen || this.ended) return;
        this.advance(t0 + raw * len);
        if (raw >= 1) this.finish();
      },
      { ease: eases.linear, group: this.group },
    );
  }

  private advance(t: number): void {
    this.t = Math.max(this.t, t);
    // Index loop: callbacks may add clips (inserted in start order; picked up this frame if due).
    for (let i = 0; i < this.clips.length; i++) {
      const c = this.clips[i]!;
      if (c.state === 2) continue;
      if (this.t < c.start) break;
      const raw = c.dur <= 0 ? 1 : Math.min(1, (this.t - c.start) / c.dur);
      this.step(c, raw);
    }
  }

  private settle(c: Live): void {
    if (c.state !== 2) this.step(c, 1);
  }

  private step(c: Live, raw: number): void {
    try {
      if (c.state === 0) {
        c.state = 1;
        c.onStart?.();
      }
      c.update?.((c.ease ?? eases.linear)(raw), raw);
      if (raw >= 1) {
        c.state = 2;
        c.onEnd?.();
      }
    } catch (err) {
      c.state = 2;
      console.error(`[timeline ${this.label}] clip failed`, err);
    }
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error('[timeline] cleanup failed', err);
  }
}
