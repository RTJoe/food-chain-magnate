/** Minimal tween engine driven by the render loop. All durations are in seconds. */

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
} satisfies Record<string, Ease>;

interface Tween {
  elapsed: number;
  delay: number;
  dur: number;
  ease: Ease;
  update: (k: number, raw: number) => void;
  done: () => void;
  group: string | undefined;
}

export interface TweenOpts {
  delay?: number;
  ease?: Ease;
  /** Tag so a group can be cancelled / finished together. */
  group?: string;
}

export class Tweens {
  private list: Tween[] = [];
  /** Global time scale (animation speed setting). */
  speed = 1;

  /** Run `update(k)` from k = 0 to 1 over `dur` seconds. Resolves when finished (or finished early). */
  add(dur: number, update: (k: number, raw: number) => void, opts: TweenOpts = {}): Promise<void> {
    return new Promise((resolve) => {
      const t: Tween = {
        elapsed: 0,
        delay: Math.max(0, opts.delay ?? 0),
        dur: Math.max(1e-4, dur),
        ease: opts.ease ?? ease.outCubic,
        update,
        done: resolve,
        group: opts.group,
      };
      update(t.ease(0), 0);
      this.list.push(t);
    });
  }

  wait(dur: number, group?: string): Promise<void> {
    return this.add(dur, () => {}, { group, ease: ease.linear });
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  /** Advance by `dt` seconds of wall-clock time (speed is applied here). */
  tick(dt: number): void {
    if (!this.list.length) return;
    const step = dt * this.speed;
    const cur = this.list;
    this.list = []; // tweens added from callbacks land here
    const keep: Tween[] = [];
    for (const t of cur) {
      if (t.delay > 0) {
        t.delay -= step;
        if (t.delay > 0) {
          keep.push(t);
          continue;
        }
        t.elapsed = -t.delay;
        t.delay = 0;
      } else t.elapsed += step;
      const raw = Math.min(1, t.elapsed / t.dur);
      t.update(t.ease(raw), raw);
      if (raw >= 1) t.done();
      else keep.push(t);
    }
    this.list = keep.concat(this.list);
  }

  /** Jump every tween (optionally one group) to its end state. */
  finish(group?: string): void {
    // Loop: finishing may start follow-up tweens (chained promises resolve asynchronously, so
    // those appear on a later tick; callers that need a settled scene call finish() again).
    const cur = this.list;
    this.list = [];
    const keep: Tween[] = [];
    for (const t of cur) {
      if (group !== undefined && t.group !== group) {
        keep.push(t);
        continue;
      }
      t.update(t.ease(1), 1);
      t.done();
    }
    this.list = keep.concat(this.list);
  }

  clear(): void {
    this.finish();
  }
}
