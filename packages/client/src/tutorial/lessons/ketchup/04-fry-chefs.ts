/**
 * K4 — Fry Chefs (docs/tutorial-plan.md §3, ketchup.md §9). Any cook trains into a Fry Chef; each
 * Fry Chef at work adds +$10 to every sale (per house, not per item; not doubled by gardens; the
 * CFO counts it).
 *
 * Scenario: round 4, Working, Ada's turn. Two Fry Chefs and a Burger Cook are at work, a Trainer
 * too, and a Pizza Cook waits on the beach. House 2 (distance 0) wants 3 burgers: $30 + $20.
 */
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, BO, continueAction, endTurn, eventOf, kTown, ME, only, usd } from './shared.js';

export const fryChefsLesson = defineLesson({
  id: 'ketchup.fryChefs',
  course: 'ketchup',
  title: 'Fry Chefs',
  minutes: 5,
  goal: 'Train a cook into a Fry Chef and see the +$10 per house bonus at Dinnertime.',
  concepts: ['module_fry_chefs', 'fry_chef', 'training', 'winning_a_sale'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(4, ['ketchup:fryChefs'])
        .cash('p1', 40)
        .card('p1', 'management_trainee', 'work', 'k4-mt')
        .card('p1', 'burger_cook', { under: 'k4-mt' }, 'k4-bc')
        .card('p1', 'ketchup:fry_chef', { under: 'k4-mt' }, 'k4-f1')
        .card('p1', 'ketchup:fry_chef', 'work', 'k4-f2')
        .card('p1', 'trainer', 'work', 'k4-tr')
        .card('p1', 'pizza_cook', 'beach', 'k4-pc')
        .demand(2, ['burger', 'burger', 'burger'])
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
      say: 'Fry Chefs make no food. Each one at work adds $10 to every house you sell to, however many items it buys.',
      show: [{ card: { player: ME, uid: 'k4-f1' } }, { card: { player: ME, uid: 'k4-f2' } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'fry_chef',
    },
    {
      id: 'train',
      say: 'Any cook can train into one. Tap your Trainer and train the Pizza Cook on the beach into a Fry Chef.',
      show: [{ card: { player: ME, uid: 'k4-tr' } }, { ui: 'train-ketchup:fry_chef' }],
      allow: { actions: [only('work.train', (a) => a.targetUid === 'k4-pc' && a.toEmployeeId === 'ketchup:fry_chef')] },
      until: { event: 'employeeTrained', where: (e) => e.type === 'employeeTrained' && e.player === ME && e.to === 'ketchup:fry_chef' },
      solution: [{ type: 'work.train', playerId: ME, trainerUid: 'k4-tr', targetUid: 'k4-pc', toEmployeeId: 'ketchup:fry_chef' }],
      then: 'Your third Fry Chef starts work next round.',
      hint: { say: 'Tap the Trainer card, then the Fry Chef option.' },
    },
    {
      id: 'produce',
      say: 'House 2 wants 3 burgers. Tap your Burger Cook and make them.',
      show: [{ card: { player: ME, uid: 'k4-bc' } }, { house: 2 }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k4-bc')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k4-bc', food: 'burger' }],
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
      say: 'Press Continue: house 2 eats at your restaurant, 0 borders away.',
      show: [{ ui: 'continue' }, { house: 2 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const s = eventOf(ctx, 'sale', (e) => e.player === ME);
        if (!s) return 'Dinner is over.';
        const items = s.lines.reduce((a, l) => a + l.count * l.each, 0);
        const fry = s.bonuses.filter((b) => b.source === 'ketchup:fry_chef').reduce((a, b) => a + b.amount, 0);
        return `${usd(items)} for 3 burgers plus ${usd(fry)} from two Fry Chefs: ${usd(s.total)}.`;
      },
    },
    {
      id: 'per-house',
      say: 'The bonus is per house, not per burger. A garden doubles item prices, never the Fry Chef bonus.',
      show: [{ house: 2 }],
      until: { next: true },
      glossary: 'winning_a_sale',
    },
    {
      id: 'combine',
      say: 'It is Dinnertime income, so a CFO adds 50% to it. It never changes which chain a house picks.',
      until: { next: true },
      glossary: 'cfo',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'Two Fry Chefs at work. A house buys 3 burgers at $10. How many dollars do you earn?', answer: 50, why: '$30 for the burgers plus $10 per Fry Chef for the house: $20.' },
      { kind: 'choice', q: 'Which cards can train into a Fry Chef?', options: ['Only Burger Cooks', 'Any cook', 'Kitchen Trainees'], answer: 1, why: 'Burger, pizza, sushi and noodle cooks all have the Fry Chef step.' },
      { kind: 'choice', q: 'Does a garden double the Fry Chef bonus?', options: ['Yes', 'No'], answer: 1, why: 'Gardens double item prices; the bonus is a flat $10 per house.' },
    ],
  },
});
