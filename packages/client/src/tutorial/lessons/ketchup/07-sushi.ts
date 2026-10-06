/**
 * K7 — Sushi (docs/tutorial-plan.md §3, ketchup.md §6). Only houses with a garden want sushi: a
 * chain with at least as many sushi as the house has demand tokens is preferred (all-or-nothing,
 * normal competition among such chains), paid as normal items (garden doubling applies).
 *
 * Scenario: round 3, Working, Ada's turn. House 18 has a garden and wants a burger and a beer;
 * only Bo has both. Ada's Sushi Cook makes 2 sushi, so the house eats sushi at her restaurant.
 */
import type { GameView } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, endTurn, kTown, ME, only, saleAt, usd } from './shared.js';

const isHouse = (n: number) => (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

export const sushiLesson = defineLesson({
  id: 'ketchup.sushi',
  course: 'ketchup',
  title: 'Sushi',
  minutes: 5,
  goal: 'Make sushi and win a garden house with it, even without the items it asked for.',
  concepts: ['module_sushi', 'sushi_cook', 'sushi', 'garden'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:sushi'])
        .cash('p1', 30)
        .card('p1', 'ketchup:sushi_cook', 'work', 'k7-sc')
        .card('p1', 'trainer', 'work', 'k7-tr')
        .card('p1', 'kitchen_trainee', 'beach', 'k7-kt')
        .inventory('p2', { burger: 1, beer: 1 })
        .garden(18, 'S')
        .demand(18, ['burger', 'beer'])
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
      say: 'Only houses with a garden want sushi. If a chain has as many sushi as the house has demand tokens, it eats sushi there.',
      show: [{ house: 18 }],
      until: { next: true },
      checkpoint: true,
      glossary: 'sushi',
    },
    {
      id: 'inspect',
      say: 'Tap house 18. It has a garden and wants a burger and a beer: only Bo has both.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      hint: { say: 'House 18 is on tile A2, with its new garden below it.', show: [{ house: 18 }] },
      glossary: 'garden',
    },
    {
      id: 'train',
      say: 'With Sushi in play, a Kitchen Trainee can become a Sushi Cook. Train the one on the beach with your Trainer.',
      show: [{ card: { player: ME, uid: 'k7-tr' } }, { ui: 'train-ketchup:sushi_cook' }],
      onEnter: [{ select: null }],
      allow: { actions: [only('work.train', (a) => a.targetUid === 'k7-kt' && a.toEmployeeId === 'ketchup:sushi_cook')] },
      until: { event: 'employeeTrained', where: (e) => e.type === 'employeeTrained' && e.player === ME && e.to === 'ketchup:sushi_cook' },
      solution: [{ type: 'work.train', playerId: ME, trainerUid: 'k7-tr', targetUid: 'k7-kt', toEmployeeId: 'ketchup:sushi_cook' }],
      then: 'A second Sushi Cook, at work from next round.',
      hint: { say: 'Tap the Trainer card, then the Sushi Cook option.' },
      glossary: 'sushi_cook',
    },
    {
      id: 'produce',
      say: 'Now tap the Sushi Cook at work and make 2 sushi: one per demand token of house 18.',
      show: [{ card: { player: ME, uid: 'k7-sc' } }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k7-sc')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k7-sc', food: 'sushi' }],
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
        return s?.player === ME ? `House 18 ate 2 sushi at your place instead of Bo's burger and beer: ${usd(s.total)}, garden doubled.` : 'Dinner is over.';
      },
    },
    {
      id: 'all-or-nothing',
      say: 'Sushi is all or nothing: it replaces the whole order, never part of it. Apartments and park-only houses never want it.',
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'Kimchi still beats sushi, and sushi beats the exact order. Noodles only come in when nobody can serve a house.',
      until: { next: true },
      glossary: 'food_priority',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'A garden house wants 3 items. You have 2 sushi. Can it eat your sushi?', options: ['Yes, 2 of the 3', 'No'], answer: 1, why: 'You need at least as many sushi as its demand tokens: all or nothing.' },
      { kind: 'choice', q: 'Which houses want sushi?', options: ['Houses with a garden', 'Every house', 'Apartments'], answer: 0, why: 'Only garden houses; not apartments, park-only houses or the rural area.' },
      { kind: 'number', q: 'A garden house with 2 demand tokens eats 2 sushi at a $10 unit price. How many dollars?', answer: 40, why: '2 sushi × $10 × 2 for the garden.' },
    ],
  },
});
