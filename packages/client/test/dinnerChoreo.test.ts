/**
 * WP-C choreographies on a fake stage with a real Tweens clock (animation-plan §2.7, §1.4, §1.7):
 * route-length pacing for sales, the van / goods / coins lifecycle (every actor back in the pool),
 * cash pulses when money lands, "Watch again" / "Play from here" replays with the stepper's
 * `currentBeat`, and batches with nothing to show never cutting a running Dinnertime short.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GameEvent, GameState, GameView } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { makeCtx } from '../../engine/src/core/context.js';
import { runUntilInput } from '../../engine/src/core/phase.js';
import { clone } from '../../engine/src/core/clone.js';
import { compile, deliveryTrip } from '../src/three/anim/compile.js';
import { registerActor } from '../src/three/anim/pool.js';
import '../src/three/anim/index.js';
import { Animator } from '../src/three/animate.js';
import { Tweens } from '../src/three/tween.js';
import { currentBeat } from '../src/state/feedback.js';
import { cashPulse } from '../src/state/interaction.js';
import type { Stage } from '../src/three/scene.js';
import type { Reconciler } from '../src/three/reconcile.js';

const view = (s: GameState): GameView => ({ ...(s as unknown as GameView), viewer: 'spectator', mine: null, submitted: {}, visibleReserves: {} });

function dinner(): { prev: GameState; state: GameState; events: GameEvent[] } {
  const s = FIXTURES.dinnertime();
  s.bank.cash = 2000;
  const next = clone(s);
  const ctx = makeCtx(next);
  runUntilInput(ctx);
  return { prev: s, state: next, events: ctx.events };
}

function fakeStage(): Stage {
  return {
    tweens: new Tweens(),
    overlay: new THREE.Group(),
    entities: new THREE.Group(),
    onFrame: new Set(),
    tier: 'high',
    inst: { proxy: () => new THREE.Object3D() },
    invalidate() {},
    trackSized() {},
    untrackSized() {},
  } as unknown as Stage;
}

const actor = () => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const cargo = new THREE.Object3D();
  cargo.name = 'cargo';
  body.add(cargo);
  g.add(body);
  return g;
};
for (const k of ['van', 'cart', 'truck', 'zeppelin', 'scooter', 'carryToken', 'coin', 'crate', 'puff'] as const) registerActor(k, actor);

const rec = { live: new Map(), board: null, byId: () => [] } as unknown as Reconciler;
const info = (b: { prev: GameState; state: GameState }) => ({ view: view(b.state), prevView: view(b.prev), me: null, added: [], removed: [], prevDemand: new Map() });
const tick = (st: Stage, s: number) => {
  for (let t = 0; t < s; t += 1 / 30) st.tweens.tick(1 / 30);
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('sale pacing (route length)', () => {
  it('delivery trips follow the route at a readable speed, 0.45–1.8 s', () => {
    expect(deliveryTrip(0)).toBe(0.45);
    expect(deliveryTrip(8)).toBeCloseTo(1.3, 9);
    expect(deliveryTrip(40)).toBe(1.8);
  });

  it('a long route gets a longer sale beat than a short one; no-route sales keep 0.9 s', () => {
    const b = dinner();
    const p = compile(b.events, { view: view(b.state), prevView: view(b.prev), mode: 'full' });
    const sales = p.beats.filter((x) => x.kind === 'sale');
    const len = (x: (typeof sales)[number]) => (x.events.find((e) => e.type === 'sale') as Extract<GameEvent, { type: 'sale' }>).route!.path.length;
    const sorted = [...sales].sort((a, c) => len(a) - len(c));
    expect(sorted[sorted.length - 1]!.nominal).toBeGreaterThan(sorted[0]!.nominal);
    const bare = b.events.map((e) => (e.type === 'sale' ? { ...e, route: undefined } : e)) as GameEvent[];
    const q = compile(bare, { view: null, prevView: null, mode: 'full' });
    for (const s of q.beats.filter((x) => x.kind === 'sale')) expect(s.nominal).toBe(0.9);
  });
});

describe('dinner choreography on a fake stage', () => {
  it('vans and goods are out mid-dinner, all back in the pool at the end; cash pulses when coins land', async () => {
    const st = fakeStage();
    const anim = new Animator(st, rec);
    const b = dinner();
    const pulses: string[] = [];
    const stop = cashPulse.subscribe((c) => c && pulses.push(c.player));
    anim.play(b.events, info(b));
    tick(st, 0.5);
    expect(anim.pool.stats().live).toBeGreaterThan(0);
    tick(st, 40);
    await flush();
    expect(anim.active).toBe(false);
    expect(anim.pool.stats().live).toBe(0);
    const sellers = new Set(b.events.flatMap((e) => (e.type === 'sale' ? [e.player] : [])));
    for (const p of sellers) expect(pulses).toContain(p);
    stop();
    anim.dispose();
  });

  it('a batch with nothing to show (hidden submissions, turn rings) does not cut a running Dinnertime', () => {
    const st = fakeStage();
    const anim = new Animator(st, rec);
    const b = dinner();
    anim.play(b.events, info(b));
    const tl = anim.timeline!;
    tick(st, 0.3);
    anim.play([], info({ prev: b.state, state: b.state }));
    anim.play([{ type: 'structureSubmitted', player: 'p2' } as GameEvent], info({ prev: b.state, state: b.state }));
    expect(anim.timeline).toBe(tl);
    expect(tl.active).toBe(true);
    anim.skip();
    anim.dispose();
  });
});

describe('replays ("Watch again" / "Play from here")', () => {
  it('replays only the house beats, from the chosen house, and the stepper follows the beat', async () => {
    const st = fakeStage();
    const anim = new Animator(st, rec);
    const b = dinner();
    const houses = b.events.flatMap((e) => (e.type === 'houseConsidered' ? [e.houseId] : []));
    const from = houses[2]!;
    anim.replay(b.events, from, view(b.state), null);
    const tl = anim.timeline!;
    expect(tl.active).toBe(true);
    expect(currentBeat.peek()).toMatchObject({ id: from, replay: true });
    // Starts at the chosen house: shorter than the whole dinner.
    const full = compile(b.events, { view: view(b.state), prevView: view(b.state), mode: 'full' });
    expect(tl.length).toBeLessThan(full.length);
    tick(st, 40);
    await flush();
    expect(anim.active).toBe(false);
    expect(currentBeat.peek()).toBeNull();
    expect(anim.pool.stats().live).toBe(0);
    anim.dispose();
  });

  it('a live batch arriving during a replay finishes the replay and plays', () => {
    const st = fakeStage();
    const anim = new Animator(st, rec);
    const b = dinner();
    anim.replay(b.events, null, view(b.state), null);
    const replay = anim.timeline!;
    anim.play(b.events, info(b));
    expect(replay.done).toBe(true);
    expect(anim.timeline).not.toBe(replay);
    anim.skip();
    expect(anim.pool.stats().live).toBe(0);
    anim.dispose();
  });
});
