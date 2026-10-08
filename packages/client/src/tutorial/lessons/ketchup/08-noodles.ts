/**
 * K8 — Noodles (docs/tutorial-plan.md §3, ketchup.md §7). Only when no chain can satisfy a house
 * (and, for garden houses, none has enough sushi) does it look for chains with at least as many
 * noodles as its demand tokens. All-or-nothing; houses, apartments and the rural area.
 *
 * Scenario: round 3, Working, Ada's turn. House 18 wants a burger, a pizza and a beer; Bo has no
 * beer and Ada has nothing, until her Noodle Cook makes 6 noodles.
 */
import type { GameView } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, endTurn, kTown, ME, only, saleAt, usd } from './shared.js';

const isHouse = (n: number) => (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

export const noodlesLesson = defineLesson({
  id: 'ketchup.noodles',
  course: 'ketchup',
  title: 'Noodles',
  minutes: 6,
  goal: 'Feed a house nobody can serve with noodles; learn the full food priority.',
  concepts: ['module_noodles', 'noodle_cook', 'noodles', 'food_priority'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:noodles'])
        .cash('p1', 30)
        .card('p1', 'ketchup:noodle_cook', 'work', 'k8-nc')
        .inventory('p2', { burger: 1, pizza: 1 })
        .demand(18, ['burger', 'pizza', 'beer'])
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'Noodles are the fallback: a house nobody can serve takes as many noodles as it has demand tokens.',
      show: [{ card: { player: ME, uid: 'k8-nc' } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'noodles',
    },
    {
      id: 'inspect',
      say: 'Tap house 18: a burger, a pizza and a beer. Bo has no beer and you have nothing, so nobody can serve it.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      hint: { say: 'House 18 is on tile A2, just below your restaurant.', show: [{ house: 18 }] },
    },
    {
      id: 'produce',
      say: 'Tap your Noodle Cook and make 6 noodles.',
      show: [{ card: { player: ME, uid: 'k8-nc' } }],
      onEnter: [{ select: null }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k8-nc')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k8-nc', food: 'noodles' }],
      glossary: 'noodle_cook',
    },
    {
      id: 'end-turn',
      say: 'End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
      checkpoint: true,
    },
    {
      id: 'dinner',
      say: 'Press Continue and watch house 18.',
      show: [{ ui: 'continue' }, { house: 18 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const s = saleAt(ctx, 18);
        return s?.player === ME ? `Nobody could fill the order, so house 18 took 3 noodles from you: ${usd(s.total)}.` : 'Dinner is over.';
      },
    },
    {
      id: 'priority',
      say: 'The full order: kimchi on top of any order first, then enough sushi (garden houses), then the exact order, then noodles.',
      until: { next: true },
      glossary: 'food_priority',
    },
    {
      id: 'combine',
      say: 'Noodles also feed apartments and the rural area. They go in the freezer but can never be marketed.',
      until: { next: true },
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Garden house: one chain has enough sushi, another has the exact order. Who sells?', options: ['The sushi chain', 'The exact-order chain', 'The cheaper one'], answer: 0, why: 'Sushi comes before the exact order at garden houses.' },
      { kind: 'choice', q: 'One chain can fill the exact order. Another has plenty of noodles but no kimchi. Who sells?', options: ['The exact order', 'The noodles'], answer: 0, why: 'Without kimchi, noodles only count when nobody can fill the order.' },
      { kind: 'number', q: 'Nobody can serve a house with 4 demand tokens. How many noodles must a chain have to feed it?', answer: 4, why: 'At least as many noodles as demand tokens.' },
    ],
  },
});
