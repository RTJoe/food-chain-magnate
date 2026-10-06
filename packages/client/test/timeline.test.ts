/** Timeline on Tweens with a manual clock (animation-plan §4.5): order, speed, finish, pause, cleanup. */
import { describe, expect, it } from 'vitest';
import { Tweens } from '../src/three/tween.js';
import { Timeline } from '../src/three/anim/timeline.js';

function run(tw: Tweens, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) tw.tick(dt);
}

describe('Timeline', () => {
  it('starts clips at their absolute times, in order, and ends each with raw = 1', async () => {
    const tw = new Tweens();
    const tl = new Timeline(tw, 'anim');
    const log: string[] = [];
    let lastRaw = -1;
    tl.add({ start: 0.5, dur: 0.2, onStart: () => log.push('b'), update: (_k, raw) => (lastRaw = raw), onEnd: () => log.push('b-end') });
    tl.add({ start: 0, dur: 0.1, onStart: () => log.push('a'), onEnd: () => log.push('a-end') });
    tl.call(0.3, () => log.push('call'));
    expect(tl.length).toBeCloseTo(0.7, 9);
    const done = tl.play();
    expect(tl.active).toBe(true);
    run(tw, 0.35);
    expect(log).toEqual(['a', 'a-end', 'call']);
    run(tw, 0.5);
    await done;
    expect(log).toEqual(['a', 'a-end', 'call', 'b', 'b-end']);
    expect(lastRaw).toBe(1);
    expect(tl.active).toBe(false);
    expect(tw.active).toBe(false);
  });

  it('seq / par / stagger return their end times', () => {
    const tl = new Timeline(new Tweens(), 'anim');
    expect(tl.seq(1, { dur: 0.5 }, { dur: 0.25 })).toBeCloseTo(1.75, 9);
    expect(tl.par(2, { dur: 0.5 }, { dur: 1 })).toBeCloseTo(3, 9);
    expect(tl.stagger(4, 0.1, [{ dur: 0.3 }, { dur: 0.3 }, { dur: 0.3 }])).toBeCloseTo(4.5, 9);
    expect(tl.length).toBeCloseTo(4.5, 9);
  });

  it('speed scales the clock (Tweens.speed)', () => {
    const tw = new Tweens();
    tw.speed = 4;
    const tl = new Timeline(tw, 'anim');
    let ended = false;
    tl.add({ start: 1, dur: 1, onEnd: () => (ended = true) });
    void tl.play();
    run(tw, 0.45);
    expect(ended).toBe(false);
    run(tw, 0.1);
    expect(ended).toBe(true);
    expect(tw.now).toBeGreaterThan(2);
  });

  it('finish() is idempotent: every clip reaches raw = 1 once, cleanup runs once, play resolves', async () => {
    const tw = new Tweens();
    const tl = new Timeline(tw, 'anim');
    const counts = { start: 0, end: 0, raw1: 0, own: 0 };
    for (let i = 0; i < 3; i++)
      tl.add({ start: i, dur: 0.5, onStart: () => counts.start++, onEnd: () => counts.end++, update: (_k, raw) => void (raw === 1 && counts.raw1++) });
    tl.own(() => counts.own++);
    const done = tl.play();
    run(tw, 0.2);
    tl.finish();
    tl.finish();
    await done;
    expect(counts).toEqual({ start: 3, end: 3, raw1: 3, own: 1 });
    expect(tw.active).toBe(false);
    // Late registrations settle at once.
    let late = 0;
    tl.own(() => late++);
    tl.add({ start: 9, dur: 1, onEnd: () => late++ });
    expect(late).toBe(2);
  });

  it('Tweens.finish() (scene dispose) finishes the timeline too', async () => {
    const tw = new Tweens();
    const tl = new Timeline(tw, 'anim');
    let ended = false;
    tl.add({ start: 5, dur: 1, onEnd: () => (ended = true) });
    const done = tl.play();
    tw.finish();
    await done;
    expect(ended).toBe(true);
    expect(tl.done).toBe(true);
  });

  it('pause() freezes the clock; resume() continues from there', () => {
    const tw = new Tweens();
    const tl = new Timeline(tw, 'anim');
    let ended = false;
    tl.add({ start: 0, dur: 1, onEnd: () => (ended = true) });
    void tl.play();
    run(tw, 0.5);
    tl.pause();
    const t = tl.time;
    run(tw, 2);
    expect(ended).toBe(false);
    expect(tl.time).toBeCloseTo(t, 9);
    tl.resume();
    run(tw, 0.6);
    expect(ended).toBe(true);
  });

  it('a throwing clip is dropped without wedging the timeline', async () => {
    const tw = new Tweens();
    const tl = new Timeline(tw, 'anim');
    const err = console.error;
    console.error = () => {};
    let ok = false;
    tl.add({ start: 0, dur: 0.1, update: () => { throw new Error('boom'); } });
    tl.add({ start: 0.2, dur: 0.1, onEnd: () => (ok = true) });
    const done = tl.play();
    run(tw, 0.5);
    await done;
    console.error = err;
    expect(ok).toBe(true);
  });
});
