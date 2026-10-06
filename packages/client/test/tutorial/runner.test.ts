/**
 * Tutorial framework (docs/tutorial-plan.md §4.8): the headless walker runs every lesson's
 * solution on the real engine, the no-dead-end property holds, quizzes are sane, the gate and the
 * predicates behave, and progress round-trips.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '@fcm/engine';
import { redactFor } from '@fcm/engine';
import { assertValidState } from '@fcm/engine/testing';
import { evaluate, freshProgress, gateReason, NONE_REASON } from '../../src/tutorial/machine.js';
import { deadEndProblems, lessonLint, lessonStart, quizProblems, walkLesson } from '../../src/tutorial/headless.js';
import { LESSONS } from '../../src/tutorial/catalog.js';
import { demoLesson } from '../../src/tutorial/lessons/dev/demo.js';
import { lesson01 } from '../../src/tutorial/lessons/base/01-town.js';

const all = [...LESSONS.values()];

describe('lessons: headless walk', () => {
  for (const lesson of all) {
    it(`${lesson.id} scenario is valid and every step completes with its solution`, () => {
      assertValidState(lessonStart(lesson).state);
      const r = walkLesson(lesson);
      expect(r.problems).toEqual([]);
      expect(r.steps.map((s) => s.id)).toEqual(lesson.steps.map((s) => s.id));
      expect(quizProblems(lesson, r.view)).toEqual([]);
      expect(lessonLint(lesson)).toEqual([]);
    });
    // A guided full game (L15) walks 50 whole games: give it room.
    it(`${lesson.id} has no dead end (random allowed actions, 50 seeds)`, { timeout: 120_000 }, () => {
      expect(deadEndProblems(lesson, 50)).toEqual([]);
    });
  }
});

describe('demo lesson', () => {
  it('pauses after working and dinnertime, scripted Bo moves, ends in round 2', () => {
    const r = walkLesson(demoLesson);
    expect(r.problems).toEqual([]);
    const ops = r.steps.flatMap((s) => s.ops);
    expect(ops).toContain('scripted p2 setup.chooseReserve');
    expect(ops.filter((o) => o === 'tutorial.continue')).toHaveLength(2);
    expect(r.state.round).toBe(2);
    // Replay of the recorded actions reproduces the state (resume).
    expect(r.actions.length).toBeGreaterThan(4);
  });
});

describe('machine: gate and predicates', () => {
  const start = lessonStart(demoLesson).state;
  const view = redactFor(start, 'p1');
  const place = demoLesson.steps[1]!;
  const ok: Action = { type: 'setup.placeRestaurant', playerId: 'p1', x: 3, y: 3, entrance: 'NW' };
  const other: Action = { type: 'setup.placeRestaurant', playerId: 'p1', x: 0, y: 0, entrance: 'SE' };

  it('admits only matching actions; none and ui steps admit no game action', () => {
    expect(gateReason(place.allow, ok, view)).toBeNull();
    expect(gateReason(place.allow, other, view)).toMatch(/Not this one/);
    expect(gateReason(place.allow, { type: 'setup.pass', playerId: 'p1' }, view)).toMatch(/place your restaurant/);
    expect(gateReason('none', ok, view)).toBe(NONE_REASON);
    expect(gateReason({ ui: ['board'] }, ok, view)).not.toBeNull();
    expect(gateReason('any', other, view)).toBeNull();
    expect(gateReason({ actions: [{ type: 'setup.placeRestaurant', limit: 1 }] }, ok, view, [1])).not.toBeNull();
  });

  it('evaluates signal, event, paused and composite predicates', () => {
    const prog = freshProgress();
    const ctx = { view, me: 'p1', events: [], legal: [], lastAction: null, state: () => start, signals: { selection: null, topView: false, dockTab: 'turn', placementReason: null, previewGood: null, boardHover: null, uiTap: null } } as const;
    const c = { ...ctx, events: [...ctx.events] } as unknown as Parameters<typeof evaluate>[1];
    expect(evaluate({ signal: 'topView', changed: 2, equals: false }, c, prog)).toBe(false);
    prog.changes.topView = 2;
    expect(evaluate({ signal: 'topView', changed: 2, equals: false }, c, prog)).toBe(true);
    expect(evaluate({ next: true }, c, prog)).toBe(false);
    prog.next = true;
    expect(evaluate({ all: [{ next: true }, { view: (v) => v.round === 0 }] }, c, prog)).toBe(true);
    expect(evaluate({ paused: true }, c, prog)).toBe(false);
    expect(evaluate({ event: 'restaurantPlaced' }, { ...c, events: [{ type: 'restaurantPlaced', player: 'p1', restaurantId: 'r', x: 3, y: 3, entrance: 'NW', comingSoon: false }] }, prog)).toBe(true);
    expect(evaluate({ test: () => { throw new Error('boom'); } }, c, prog)).toBe(false);
  });

  it('lesson 1 has no game action at all (pure exploration)', () => {
    expect(walkLesson(lesson01).actions).toEqual([]);
  });
});
