/**
 * Framework demo (WP-T1 acceptance, docs/tutorial-plan.md §5): a Next step, a gated
 * `setup.placeRestaurant`, scripted opponent moves, and `tutorial.continue` after paused automatic
 * phases. Not in the course map; open it at #/learn/dev.demo. The tests walk it headless and in e2e.
 */
import type { Action } from '@fcm/engine';
import { town, TOWN_RESTAURANTS } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';

const ADA = TOWN_RESTAURANTS.p1;

/** The learner's Continue for the current pause. */
export const continueAction = (ctx: StepCtx): Action[] => {
  const head = ctx.view.pending[0];
  return head?.kind === 'continue' ? [{ type: 'tutorial.continue', playerId: ctx.me, choiceId: head.id }] : [];
};

export const demoLesson = defineLesson({
  id: 'dev.demo',
  course: 'dev',
  title: 'Framework demo',
  minutes: 2,
  goal: 'Exercise the lesson runner: gate, scripted seat, pauses.',
  concepts: ['restaurant', 'dinnertime'],
  scenario: {
    build: () =>
      town({ round: 0, restaurants: ['p2'] })
        .phase({ kind: 'setup.restaurants', round: 1, order: ['p2', 'p1'], idx: 1, placed: ['p2'], passed: [] })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'Bo already opened on tile C2. House 18 is the one you two will fight over.',
      show: [{ house: 18 }, { restaurant: 'p2' }],
      until: { next: true },
      checkpoint: true,
    },
    {
      id: 'place',
      say: 'Place your restaurant on tile A1, door at the top-left.',
      show: [{ tile: 'A1' }, { ui: 'pick-strip' }],
      allow: { actions: [{ type: 'setup.placeRestaurant', where: (a) => a.type === 'setup.placeRestaurant' && a.x === ADA.x && a.y === ADA.y && a.entrance === ADA.entrance }] },
      until: { event: 'restaurantPlaced', where: (e) => e.type === 'restaurantPlaced' && e.player === 'p1' },
      solution: [{ type: 'setup.placeRestaurant', playerId: 'p1', x: ADA.x, y: ADA.y, entrance: ADA.entrance }],
      then: 'Open for business. House 2 is on your tile: distance 0.',
    },
    {
      id: 'reserve',
      say: 'Pick the +$200 reserve card. Bo picks in secret too.',
      show: [{ ui: 'reserve-200' }],
      allow: { actions: [{ type: 'setup.chooseReserve', where: (a) => a.type === 'setup.chooseReserve' && a.card.amount === 200 }] },
      script: [{ player: 'p2', action: { type: 'setup.chooseReserve', playerId: 'p2', card: { kind: 'standard', amount: 100, ceoSlots: 2 } } }],
      until: { view: (v) => v.phase.kind === 'orderOfBusiness' },
      solution: [{ type: 'setup.chooseReserve', playerId: 'p1', card: { kind: 'standard', amount: 200, ceoSlots: 3 } }],
      checkpoint: true,
    },
    {
      id: 'order',
      say: 'Both charts are just a CEO, so you choose turn order first. Take position 1.',
      show: [{ ui: 'order-pos-1' }],
      allow: { actions: [{ type: 'order.choosePosition', where: (a) => a.type === 'order.choosePosition' && a.position === 0 }] },
      until: { view: (v) => v.phase.kind === 'working' },
      solution: [{ type: 'order.choosePosition', playerId: 'p1', position: 0 }],
    },
    {
      id: 'end-turn',
      say: 'Nothing to do with only a CEO yet. End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [{ player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } }],
      until: { paused: 'working' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
    },
    {
      id: 'dinner',
      say: 'Everyone is done. Press Continue to let Dinnertime run.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      checkpoint: true,
    },
    {
      id: 'after-dinner',
      say: 'No house had demand, so nobody sold. Continue to the next round.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { view: (v) => v.round === 2 },
      solution: continueAction,
    },
  ],
  quiz: {
    pass: 1,
    questions: [{ kind: 'choice', q: 'Who pressed Continue after Dinnertime?', options: ['Bo', 'You', 'Nobody'], answer: 1, why: 'Lessons pause after automatic phases until you continue.' }],
  },
});
