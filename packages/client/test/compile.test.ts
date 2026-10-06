/**
 * Animation plans from real engine batches (animation-plan §1.3, §4.5): beat grouping and order,
 * pacing caps, pipelining, reduced mode, the 30-house grouping, determinism, and the Animator's
 * queue policy on a fake stage with a real Tweens clock.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { engine, type GameEvent, type GameState, type GameView } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { makeCtx } from '../../engine/src/core/context.js';
import { runUntilInput } from '../../engine/src/core/phase.js';
import { clone } from '../../engine/src/core/clone.js';
import { compile, deliveryTrip, PACING, type Plan } from '../src/three/anim/compile.js';
import { registerActor } from '../src/three/anim/pool.js';
import { registry } from '../src/three/anim/index.js';
import { Animator } from '../src/three/animate.js';
import { Tweens } from '../src/three/tween.js';
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

function marketing(): { prev: GameState; state: GameState; events: GameEvent[] } {
  let { state } = dinner();
  const prev = state;
  const all: GameEvent[] = [];
  for (const p of ['p1', 'p2', 'p3']) {
    const r = engine.applyAction(state, { type: 'payday.confirm', playerId: p });
    if (!r.ok) continue;
    state = r.state;
    all.push(...r.events);
  }
  return { prev, state, events: all };
}

const plan = (b: { prev: GameState; state: GameState; events: GameEvent[] }, mode: 'full' | 'reduced' = 'full', extra = {}): Plan =>
  compile(b.events, { view: view(b.state), prevView: view(b.prev), mode, ...extra });

/** n synthetic houses: the first `sold` sell, the rest stay home. */
function syntheticDinner(n: number, sold: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const houseId = `h${i}`;
    out.push({ type: 'houseConsidered', houseId, candidates: i < sold ? ['p1'] : [], offers: [] });
    if (i < sold) {
      out.push({ type: 'sale', houseId, player: 'p1', restaurantId: 'r1', distance: 0, unitPrice: 10, lines: [{ good: 'burger', count: 1, each: 10 }], bonuses: [], total: 10 });
      out.push({ type: 'cashChanged', player: 'p1', delta: 10, reason: 'sale', bank: 100 });
    } else out.push({ type: 'houseStayedHome', houseId });
  }
  return out;
}

describe('compile: dinnertime', () => {
  const b = dinner();
  const p = plan(b);
  const houses = p.beats.filter((x) => x.segment === 'dinnertime');

  it('one beat per house, in resolution order, each opened by houseConsidered', () => {
    const order = b.events.filter((e) => e.type === 'houseConsidered').map((e) => (e as { houseId: string }).houseId);
    expect(houses.map((h) => h.id)).toEqual(order);
    for (const h of houses) {
      expect(h.events[0]!.type).toBe('houseConsidered');
      expect(h.kind).toBe(h.events.some((e) => e.type === 'sale') ? 'sale' : 'stayedHome');
    }
    expect(p.phase).toBe('dinnertime');
  });

  it('sales carry the engine route; nominal = van trip by route length + drop (≥ 0.9 s), sequential under the 12 s cap', () => {
    const sales = houses.filter((h) => h.kind === 'sale');
    expect(sales.length).toBeGreaterThan(0);
    for (const s of sales) {
      const sale = s.events.find((e) => e.type === 'sale') as Extract<GameEvent, { type: 'sale' }>;
      expect(sale).toHaveProperty('route');
      expect(s.nominal).toBeCloseTo(Math.max(0.9, deliveryTrip(sale.route!.path.length + 1) + 0.35), 9);
      expect(s.nominal).toBeLessThanOrEqual(1.8 + 0.35);
    }
    // Longer routes get longer beats.
    const byLen = [...sales].sort((a, c) => (a.events.find((e) => e.type === 'sale') as { route: { path: unknown[] } }).route.path.length - (c.events.find((e) => e.type === 'sale') as { route: { path: unknown[] } }).route.path.length);
    expect(byLen[byLen.length - 1]!.nominal).toBeGreaterThanOrEqual(byLen[0]!.nominal);
    for (let i = 1; i < houses.length; i++) expect(houses[i]!.at).toBeCloseTo(houses[i - 1]!.at + houses[i - 1]!.nominal, 9);
    const seg = p.segments.find((s) => s.segment === 'dinnertime')!;
    expect(seg.end - seg.start).toBeLessThanOrEqual(PACING.dinnerCap);
    expect(p.closing).toMatchObject({ kind: 'done', phase: 'dinnertime', sales: sales.length });
  });

  it('is deterministic', () => {
    expect(plan(b)).toEqual(p);
  });

  it('reduced mode keeps a 0.6 s hold per house and the same beats', () => {
    const r = plan(b, 'reduced');
    expect(r.mode).toBe('reduced');
    expect(r.beats.map((x) => x.id)).toEqual(p.beats.map((x) => x.id));
    for (const h of r.beats.filter((x) => x.segment === 'dinnertime')) expect(h.dur).toBe(PACING.reducedHold);
  });

  it('kinds drops beats without a choreography (no dead time)', () => {
    const only = plan(b, 'full', { kinds: new Set(['sale']) });
    expect(only.beats.every((x) => x.kind === 'sale')).toBe(true);
    expect(only.beats[0]!.at).toBe(0);
  });
});

describe('compile: pacing', () => {
  it('20 houses pipeline under 12 s: the last house lands on the cap, at most 4 vans on the road', () => {
    const p = compile(syntheticDinner(20, 20), { view: null, prevView: null, mode: 'full' });
    expect(p.gap).toBeCloseTo((12 - 0.9) / 19, 9);
    expect(p.length).toBeLessThanOrEqual(PACING.dinnerCap);
    for (const h of p.beats) expect(h.dur).toBeLessThanOrEqual(PACING.maxVans * p.gap + 1e-9);
    expect(p.beats[1]!.at - p.beats[0]!.at).toBeCloseTo(p.gap, 9);
    expect(p.length).toBeCloseTo(12, 9);
  });

  it('13 sold houses already exceed 12 s nominal and pipeline (gap < nominal)', () => {
    const p = compile(syntheticDinner(14, 14), { view: null, prevView: null, mode: 'full' });
    expect(p.gap).toBeLessThan(0.9);
    expect(p.length).toBeLessThanOrEqual(PACING.dinnerCap + 1e-9);
  });

  it('beyond 30 houses the no-seller houses collapse into one beat after the sales', () => {
    const p = compile(syntheticDinner(40, 25), { view: null, prevView: null, mode: 'full' });
    const kinds = p.beats.map((x) => x.kind);
    expect(kinds.filter((k) => k === 'stayedHome')).toHaveLength(0);
    expect(kinds.filter((k) => k === 'sale')).toHaveLength(25);
    expect(kinds[kinds.length - 1]).toBe('stayedHomeGroup');
    expect(p.beats[p.beats.length - 1]!.focal).toHaveLength(15);
    expect(p.gap).toBeCloseTo(Math.max(PACING.dinnerMinGap, (12 - 0.8) / 25), 9);
    expect(p.closing).toMatchObject({ sales: 25, stayedHome: 15 });
  });

  it('a working action is capped at 1.6 s; leftover added keys become one pop beat', () => {
    const s = FIXTURES.working();
    const events: GameEvent[] = [
      { type: 'restaurantPlaced', player: 'p1', restaurantId: 'rA', x: 0, y: 0, entrance: 'NW', comingSoon: false },
      { type: 'houseBuilt', player: 'p1', houseId: 'hA', cells: [], garden: [] },
      { type: 'campaignPlaced', player: 'p1', campaign: { id: 'cA', kind: 'airplane' } as never },
    ];
    const p = compile(events, { view: view(s), prevView: view(s), mode: 'full', added: ['restaurant:rA', 'entity:e9', 'demand:h1'] });
    expect(p.beats.map((x) => x.kind)).toEqual(['restaurantPlaced', 'houseBuilt', 'campaignPlaced', 'pop']);
    expect(p.beats[3]!.keys).toEqual(['entity:e9']);
    expect(p.length).toBeLessThanOrEqual(PACING.workingCap + PACING.minReadable);
    expect(p.beats[1]!.keys).toEqual(['house:hA', 'garden:hA']);
  });
});

describe('compile: marketing', () => {
  const b = marketing();
  const p = plan(b);
  const runs = p.beats.filter((x) => x.kind === 'campaign');

  it('one beat per campaign run, in run order, holding its demand and tick', () => {
    const order = b.events.filter((e) => e.type === 'campaignRan').map((e) => (e as { campaignId: string }).campaignId);
    expect(runs.map((r) => r.id)).toEqual(order);
    const drops = b.events.filter((e) => e.type === 'demandPlaced').length;
    expect(runs.reduce((n, r) => n + r.events.filter((e) => e.type === 'demandPlaced').length, 0)).toBe(drops);
    for (const r of runs) {
      const ran = r.events[0] as Extract<GameEvent, { type: 'campaignRan' }>;
      expect(ran.reached).toBeDefined();
      for (const d of r.events.filter((e) => e.type === 'demandPlaced')) expect((d as { campaignId: string }).campaignId).toBe(r.id);
    }
    const seg = p.segments.find((s) => s.segment === 'marketing')!;
    expect(seg.end - seg.start).toBeLessThanOrEqual(PACING.marketingCap + 1.3);
  });
});

// ---------------------------------------------------------------------------
// Animator queue policy (fake stage, real Tweens)
// ---------------------------------------------------------------------------

function fakeStage(): Stage {
  const overlay = new THREE.Group();
  return {
    tweens: new Tweens(),
    overlay,
    entities: new THREE.Group(),
    onFrame: new Set(),
    tier: 'high',
    inst: { proxy: () => new THREE.Object3D() },
    invalidate() {},
    trackSized() {},
    untrackSized() {},
  } as unknown as Stage;
}

const simpleActor = () => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);
  return g;
};

describe('Animator queue policy (§1.7)', () => {
  for (const k of ['van', 'cart', 'truck', 'zeppelin', 'scooter'] as const) registerActor(k, simpleActor);
  const rec = { live: new Map(), board: null, byId: () => [] } as unknown as Reconciler;
  const info = (b: { prev: GameState; state: GameState }) => ({ view: view(b.state), prevView: view(b.prev), me: null, added: [], removed: [], prevDemand: new Map() });
  const tick = (st: Stage, s: number) => {
    for (let t = 0; t < s; t += 1 / 30) st.tweens.tick(1 / 30);
  };

  it('a same-phase batch with > 3 s left finishes the running one; under 3 s it queues; skip clears all', async () => {
    expect(registry.has('sale')).toBe(true);
    const st = fakeStage();
    const anim = new Animator(st, rec);
    const b = dinner();
    anim.play(b.events, info(b));
    const first = anim.timeline!;
    expect(first.active).toBe(true);
    expect(first.length).toBeGreaterThan(3);

    anim.play(b.events, info(b));
    expect(first.done).toBe(true);
    const second = anim.timeline!;
    expect(second).not.toBe(first);

    // Near the end: queue behind.
    tick(st, second.length - 2);
    anim.play(b.events, info(b));
    expect(anim.timeline).toBe(second);
    expect(second.active).toBe(true);
    tick(st, 2.5);
    await Promise.resolve();
    await Promise.resolve();
    const third = anim.timeline!;
    expect(third).not.toBe(second);
    expect(third.active).toBe(true);

    // A different phase finishes at once.
    const m = marketing();
    anim.play(m.events, info(m));
    expect(third.done).toBe(true);
    expect(anim.timeline!.active).toBe(true);

    anim.skip();
    expect(anim.active).toBe(false);
    expect(anim.pool.stats().live).toBe(0);
    anim.dispose();
  });

  it('every actor returns to the pool when a timeline ends', async () => {
    const st = fakeStage();
    const anim = new Animator(st, rec);
    const b = dinner();
    anim.play(b.events, info(b));
    tick(st, 1);
    expect(anim.pool.stats().live).toBeGreaterThan(0);
    tick(st, 30);
    await Promise.resolve();
    expect(anim.active).toBe(false);
    expect(anim.pool.stats().live).toBe(0);
    anim.dispose();
  });
});
