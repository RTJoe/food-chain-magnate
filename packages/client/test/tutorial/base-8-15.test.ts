/**
 * Late base lessons (docs/tutorial-plan.md §2 L8–L15, WP-T3): each canonical walk teaches what the
 * narration says. The generic walk, no-dead-end, quiz and golden checks live in runner.test.ts and
 * golden.test.ts; here the outcomes the coach cards quote are pinned against the engine.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameState } from '@fcm/engine';
import { applyAction, engine, redactFor } from '@fcm/engine';
import { lessonStart, walkLesson } from '../../src/tutorial/headless.js';
import { lessonById } from '../../src/tutorial/catalog.js';
import type { Lesson } from '../../src/tutorial/dsl.js';
import { coachHints } from '../../src/ui/hints/rules.js';
import { buildCatalog } from '../../src/state/catalog.js';

/** Walk a lesson and replay its actions to collect every event (full information, for assertions). */
function eventsOf(lesson: Lesson): { events: GameEvent[]; state: GameState } {
  const r = walkLesson(lesson);
  expect(r.problems).toEqual([]);
  let s = lessonStart(lesson).state;
  const events: GameEvent[] = [];
  for (const a of r.actions) {
    const res = applyAction(s, a);
    if (!res.ok) throw new Error(`${lesson.id}: ${a.type} rejected on replay: ${res.message}`);
    s = res.state;
    events.push(...res.events);
  }
  return { events, state: s };
}

const get = (id: string): Lesson => {
  const l = lessonById(id);
  if (!l) throw new Error(`missing lesson ${id}`);
  return l;
};
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('late base lessons: what the coach says is what the engine did', () => {
  it('every T3 lesson is registered, 5–16 steps, with a 3-question check', () => {
    for (let n = 8; n <= 15; n++) {
      const l = get(`base.${n}`);
      expect(l.quiz.questions).toHaveLength(3);
      expect(l.quiz.questions.some((q) => q.kind === 'tap')).toBe(true);
      expect(l.steps.length).toBeGreaterThanOrEqual(5);
      expect(l.steps.length).toBeLessThanOrEqual(16);
    }
  });

  it('L8: the errand boy fetches 1 beer, the cart 2 per source (beer + soda on C1), house 2 pays $30', () => {
    const { events } = eventsOf(get('base.8'));
    const hauls = of(events, 'drinksBought').filter((e) => e.player === 'p1');
    expect(hauls.map((h) => h.collected.reduce((n, c) => n + c.count, 0))).toEqual([1, 4]);
    expect(hauls[1]?.collected.map((c) => c.drink).sort()).toEqual(['beer', 'soft_drink']);
    const sale = of(events, 'sale').find((e) => e.player === 'p1');
    expect(sale?.total).toBe(30);
    expect(sale?.distance).toBe(0);
  });

  it('L9: Bo overfills and goes to the beach; Ada has 1 open slot, Bo 3; Bo picks first; training claims First to Train', () => {
    const { events, state } = eventsOf(get('base.9'));
    expect(of(events, 'structurePenalty').map((e) => e.player)).toEqual(['p2']);
    expect(of(events, 'orderChosen')[0]).toMatchObject({ player: 'p2', position: 0 });
    expect(of(events, 'employeeTrained')).toEqual([expect.objectContaining({ player: 'p1', from: 'errand_boy', to: 'cart_operator' })]);
    expect(of(events, 'milestoneClaimed').some((e) => e.player === 'p1' && e.milestoneId === 'first_train')).toBe(true);
    expect(state.turnOrder).toEqual(['p2', 'p1']);
  });

  it('L10: Ada (2 open slots) chooses first over Bo (1), though Bo was first last round', () => {
    const l = get('base.10');
    const start = lessonStart(l).state;
    expect(start.awaiting.players).toEqual(['p1']);
    const { state } = eventsOf(l);
    expect(state.turnOrder).toEqual(['p1', 'p2']);
  });

  it('L11: $8 against $10 forces a fire; round 6 pays without firing', () => {
    const { events } = eventsOf(get('base.11'));
    const fired = of(events, 'employeeFired');
    expect(fired).toEqual([expect.objectContaining({ player: 'p1', employeeId: 'cart_operator', forced: true })]);
    const paid = of(events, 'salaryPaid').filter((e) => e.player === 'p1');
    expect(paid.map((e) => e.paid)).toEqual([5, 10]);
    expect(of(events, 'salaryPaid').filter((e) => e.player === 'p2').map((e) => e.paid)).toEqual([5, 5]);
  });

  it('L12: both claim First Billboard in the same round; the burger and pizza ones are crossed out for the other', () => {
    const { events, state } = eventsOf(get('base.12'));
    const claims = of(events, 'milestoneClaimed');
    expect(claims.filter((e) => e.milestoneId === 'first_billboard').map((e) => e.player).sort()).toEqual(['p1', 'p2']);
    expect(state.milestones.first_burger_marketed).toMatchObject({ claimedBy: ['p1'], removed: true });
    expect(state.milestones.first_pizza_marketed).toMatchObject({ claimedBy: ['p2'], removed: true });
  });

  it('L13: garden on house 18, house 1 built on tiles A1/A2, a COMING SOON restaurant that opens at Clean up', () => {
    const { events, state } = eventsOf(get('base.13'));
    expect(of(events, 'gardenAdded')).toHaveLength(1);
    const built = of(events, 'houseBuilt')[0];
    expect(built && state.board.houses[built.houseId]?.order).toBe(1);
    const placed = of(events, 'restaurantPlaced')[0];
    expect(placed?.comingSoon).toBe(true);
    expect(of(events, 'restaurantOpened').map((e) => e.restaurantId)).toContain(placed?.restaurantId);
  });

  it('L14: the bank breaks twice in one Dinnertime (3 CEO slots from the vote), IOUs, Ada wins', () => {
    const { events, state } = eventsOf(get('base.14'));
    const breaks = of(events, 'bankBroke');
    expect(breaks.map((b) => b.breakNo)).toEqual([1, 2]);
    expect(breaks[0]).toMatchObject({ added: 300, ceoSlots: 3 });
    expect(of(events, 'iouIssued')).toEqual([expect.objectContaining({ player: 'p1', amount: 22 })]);
    expect(state.phase).toMatchObject({ kind: 'gameOver', ranking: ['p1', 'p2'] });
  });

  it('L15: following the coach plays a whole game against the Easy bot to its end', () => {
    const { events, state } = eventsOf(get('base.15'));
    expect(state.phase.kind).toBe('gameOver');
    expect(of(events, 'bankBroke').map((b) => b.breakNo)).toEqual([1, 2]);
    expect(state.round).toBeGreaterThan(5);
  });
});

describe('coach hints in the guided game use only what the learner sees', () => {
  it('rules run on the redacted view: the order-of-business hint appears for the learner; off shows nothing', () => {
    const l = get('base.15');
    const r = walkLesson(l, { until: 'reserve' });
    const v = redactFor(r.state, 'p1');
    expect('secrets' in v).toBe(false);
    expect(v.phase.kind).toBe('orderOfBusiness');
    const catalog = buildCatalog(engine.listModules(), v.config.modules);
    expect(coachHints({ view: v, me: 'p1', catalog, draft: null }, 'full').map((h) => h.id)).toContain('order_position');
    expect(coachHints({ view: v, me: 'p1', catalog, draft: null }, 'off')).toEqual([]);
  });
});

describe('coach level and L16 free play (ui/hints/coach.ts)', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('defaults to off once the guided game (base.15) is passed; dismissed hints survive a reload', async () => {
    const g = globalThis as unknown as { localStorage?: unknown; sessionStorage?: unknown };
    const ls = store();
    g.localStorage = ls;
    g.sessionStorage = store();
    ls.setItem('fcm.learn', JSON.stringify({ v: 1, lessons: { 'base.15': { status: 'passed' } }, badges: [] }));
    vi.resetModules();
    let coach = await import('../../src/ui/hints/coach.js');
    expect(coach.coachLevel.value).toBe('off');
    coach.dismissHint('bank_low');
    vi.resetModules();
    coach = await import('../../src/ui/hints/coach.js');
    expect(coach.dismissedHints.value.has('bank_low')).toBe(true);
    // L16: the free-play tile switches the coach on and marks the table to return to the hub, once.
    coach.startFreePlay();
    expect(coach.coachLevel.value).toBe('full');
    expect(coach.takeFreePlayReturn()).toBe(true);
    expect(coach.takeFreePlayReturn()).toBe(false);
    delete g.localStorage;
    delete g.sessionStorage;
  });
});
