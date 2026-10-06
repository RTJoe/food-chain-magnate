/**
 * K6 — Kimchi (docs/tutorial-plan.md §3, ketchup.md §5). The Kimchi Master makes 1 kimchi at the
 * end of Clean up. At Dinnertime a chain that can fill the order AND add a kimchi is preferred
 * regardless of price and distance, and sells exactly 1 kimchi extra.
 *
 * Scenario: round 3, Working, Ada's turn. Her Kimchi Master made a kimchi last Clean up. House 5
 * wants a pizza; Bo is 1 border away ($11), Ada 2 ($12), yet Ada's kimchi wins the house.
 */
import type { GameView } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, endTurn, kTown, ME, only, runOn, saleAt, usd } from './shared.js';

const isHouse = (n: number) => (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

export const kimchiLesson = defineLesson({
  id: 'ketchup.kimchi',
  course: 'ketchup',
  title: 'Kimchi',
  minutes: 6,
  goal: 'Win a house you are dearer for, thanks to a kimchi; see the Kimchi Master make the next one.',
  concepts: ['module_kimchi', 'kimchi_master', 'kimchi', 'food_priority'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:kimchi'])
        .cash('p1', 20)
        .card('p1', 'ketchup:kimchi_master', 'work', 'k6-km')
        .card('p1', 'kitchen_trainee', 'work', 'k6-kt')
        .inventory('p1', { kimchi: 1 })
        .inventory('p2', { pizza: 1 })
        .demand(5, ['pizza'])
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
      say: 'Your Kimchi Master does nothing during Working. At the end of Clean up she makes 1 kimchi, which keeps until next round.',
      show: [{ card: { player: ME, uid: 'k6-km' } }, { ui: 'rail-p1' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'kimchi_master',
    },
    {
      id: 'inspect',
      say: 'Tap house 5. It wants a pizza, and Bo is closer: $10 + 1 = 11 against your $10 + 2 = 12.',
      show: [{ house: 5 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(5) },
      solution: [{ tap: { house: 5 } }],
      hint: { say: 'House 5 is in the middle of the town, tile B2.', show: [{ house: 5 }] },
    },
    {
      id: 'rule',
      say: 'But you hold a kimchi. A house prefers a chain that can fill its order and add a kimchi, whatever the price.',
      show: [{ ui: 'rail-p1' }, { house: 5 }],
      onEnter: [{ select: null }],
      until: { next: true },
      glossary: 'kimchi',
    },
    {
      id: 'produce',
      say: 'Tap your Kitchen Trainee and make a pizza for house 5.',
      show: [{ card: { player: ME, uid: 'k6-kt' } }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k6-kt' && a.food === 'pizza')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k6-kt', food: 'pizza' }],
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
      say: 'Press Continue and watch house 5.',
      show: [{ ui: 'continue' }, { house: 5 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const s = saleAt(ctx, 5);
        return s?.player === ME ? `House 5 bought your pizza and your kimchi for ${usd(s.total)}, though Bo was cheaper.` : 'Dinner is over.';
      },
    },
    {
      id: 'clean-up',
      say: 'Continue through Payday and Clean up to round 4, and watch your stock.',
      show: [{ ui: 'continue' }, { ui: 'rail-p1' }],
      allow: { actions: [only('tutorial.continue'), only('payday.confirm')] },
      until: { view: (v) => v.round === 4 },
      solution: (ctx) => runOn(ctx, 3, ['dinnertime'], { payday: true }),
      then: (ctx) => `Leftovers were thrown away, then your master made a fresh kimchi: you hold ${ctx.view.players[ME]?.inventory.kimchi ?? 0}.`,
      checkpoint: true,
    },
    {
      id: 'combine',
      say: 'Kimchi cannot be marketed. Freeze any kimchi and nothing else may go in the freezer.',
      until: { next: true },
      glossary: 'freezer',
    },
    {
      id: 'priority',
      say: 'With Sushi or Noodles in play, kimchi still comes first: it adds to whichever order wins its tier.',
      until: { next: true },
      glossary: 'food_priority',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Your offer is 12 and you hold a kimchi; Bo offers 11 without one. Both can fill the order. Who sells?', options: ['You', 'Bo', 'Nobody'], answer: 0, why: 'A chain that adds a kimchi wins regardless of price and distance.' },
      { kind: 'choice', q: 'How many kimchi does a house buy with its order?', options: ['Exactly 1', 'One per demand token', 'All you have'], answer: 0, why: 'The chosen chain sells exactly one kimchi extra.' },
      { kind: 'choice', q: 'When does the Kimchi Master make kimchi?', options: ['During Working', 'At Dinnertime', 'At the end of Clean up'], answer: 2, why: 'After food is thrown away or frozen, she adds 1 kimchi.' },
    ],
  },
});
