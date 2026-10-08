/**
 * L10 — Turn order and open slots (docs/tutorial-plan.md §2, L10; §1.4 "Simultaneous
 * restructuring"). Order of Business is a choice, made in order of open slots.
 *
 * Scenario: round 5, Order of Business right after the reveal. Ada: CEO with a Management Trainee
 * (holding a Kitchen Trainee) and a Marketing Trainee: 5 slots, 3 cards, 2 open. Bo: CEO with a
 * Waitress and a Kitchen Trainee: 3 slots, 2 cards, 1 open. Bo was first last round, but Ada has
 * more open slots, so she chooses first. In a 2-player game the second chooser gets the spot left.
 * (The plan had Bo choose first; with two players only the first chooser actually chooses, so the
 * learner is given the choice.)
 */
import { town } from '@fcm/engine/testing';
import { defineLesson } from '../../dsl.js';
import { openSlots } from './late.js';

export const lesson10 = defineLesson({
  id: 'base.10',
  course: 'base',
  title: 'Turn order and open slots',
  minutes: 5,
  goal: 'Order of Business: the chain with the most open slots chooses its turn order spot first.',
  concepts: ['open_slots', 'order_of_business', 'turn_order'],
  scenario: {
    build: () =>
      town({ round: 5 })
        .card('p1', 'management_trainee', 'work', 'p1-mt')
        .card('p1', 'kitchen_trainee', { under: 'p1-mt' }, 'p1-kt')
        .card('p1', 'marketing_trainee', 'work', 'p1-mk')
        .card('p2', 'waitress', 'work', 'p2-wa')
        .card('p2', 'kitchen_trainee', 'work', 'p2-kt')
        .cash('p1', 30)
        .cash('p2', 30)
        .milestone('p2', 'first_waitress', 4)
        .turnOrder(['p2', 'p1'])
        .phase({ kind: 'orderOfBusiness', queue: ['p1', 'p2'], picks: {} })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: [],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'count',
      say: (ctx) => `After the reveal, count the empty slots. You have ${openSlots(ctx.view, 'p1')} (5 slots, 3 cards); Bo has ${openSlots(ctx.view, 'p2')}.`,
      show: [{ ui: 'rail-p1' }, { ui: 'rail-p2' }],
      until: { next: true },
      onEnter: [{ openTab: 'company' }],
      checkpoint: true,
      glossary: 'open_slots',
    },
    {
      id: 'most-first',
      say: 'The chain with more open slots chooses its spot first, even though Bo went first last round. Empty slots are the price of that choice.',
      show: [{ ui: 'rail-p1' }],
      until: { next: true },
      glossary: 'order_of_business',
    },
    {
      id: 'not-always-first',
      say: 'Choosing first does not mean going first: acting later lets you see what Bo did. Here, take position 1.',
      show: [{ ui: 'order-pos-1' }],
      allow: { actions: [{ type: 'order.choosePosition', where: (a) => a.type === 'order.choosePosition' && a.position === 0 }] },
      until: { event: 'turnOrderSet' },
      solution: [{ type: 'order.choosePosition', playerId: 'p1', position: 0 }],
      then: 'Bo gets the spot that is left, position 2. You act first in Working 9–5.',
      hint: { say: 'Tap "1" on the turn order track in the Turn panel.', show: [{ ui: 'order-pos-1' }] },
      onEnter: [{ openTab: 'turn' }],
    },
    {
      id: 'ties',
      say: 'With tied open slots, whoever was earlier in last round’s order chooses first. Going first also wins Dinnertime ties that Waitresses don’t settle.',
      show: [{ ui: 'rail-p1' }, { ui: 'rail-p2' }],
      until: { next: true },
      glossary: 'open_slots',
    },
    {
      id: 'hire-first',
      say: 'Going first also means hiring first: when a pile runs low, the first player gets the card. Your turn starts now.',
      show: [{ ui: 'work-stages' }],
      until: { next: true },
      checkpoint: true,
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Who chooses a turn order spot first?', options: ['The richest chain', 'The chain with the most open slots', 'The chain with the fewest cards'], answer: 1, why: 'Open slots: empty slots on the CEO and on managers, counted after the reveal.' },
      { kind: 'choice', q: 'With 3 players, may the first chooser take position 3?', options: ['Yes', 'No, the first chooser goes first'], answer: 0, why: 'It is a free choice of any open spot.' },
      { kind: 'tap', q: 'Tap the restaurant of the chain that chose first this round.', target: { restaurant: 'p1' }, why: 'You had 2 open slots, Bo 1, so you chose first.' },
    ],
  },
});
