/**
 * K15 — Ketchup, "Someone sells your demand" (docs/tutorial-plan.md §3, ketchup.md §8). At the end
 * of a Dinnertime a player gains the milestone when another player sold to a house carrying demand
 * that this player's marketeer created. Effect: in later Dinnertimes their price + distance counts
 * $1 less. Stacks with First Marketeer Used (−2).
 *
 * Scenario: round 3, Working, Ada's turn. Bo's billboard gave house 18 its burger demand; Ada's
 * Kitchen Trainee can serve it, and by doing so hands Bo the milestone.
 */
import type { GameView } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, endTurn, kTown, ME, only, saleAt } from './shared.js';

const BO_BILLBOARD = 'k15-bb14';
const isHouse = (n: number) => (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

export const ketchupLesson = defineLesson({
  id: 'ketchup.ketchup',
  course: 'ketchup',
  title: 'Ketchup',
  minutes: 5,
  goal: "Sell to demand a rival's marketeer created and see who gains the Ketchup milestone.",
  concepts: ['module_ketchup', 'ketchup_milestone', 'demand', 'milestone'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:ketchup'])
        .cash('p1', 20)
        .cash('p2', 20)
        .card('p1', 'kitchen_trainee', 'work', 'k15-kt')
        .marketeerCampaign('marketing_trainee', 'k15-bmt', {
          owner: 'p2',
          kind: 'billboard',
          number: 14,
          goods: ['burger'],
          placement: { kind: 'board', x: 1, y: 6, w: 1, h: 2 },
          remaining: 1,
          id: BO_BILLBOARD,
        })
        .demand(18, ['burger'], 'p2', BO_BILLBOARD)
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
      say: 'Ketchup adds one milestone, Someone Sells Your Demand: you earn it when a rival sells to demand your marketeer created.',
      show: [{ ui: 'tab-milestones' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'ketchup_milestone',
    },
    {
      id: 'inspect',
      say: "Tap house 18. Its burger demand came from Bo's billboard right beside it.",
      show: [{ house: 18 }, { campaign: BO_BILLBOARD }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      hint: { say: 'House 18 is on tile A2, with Bo’s billboard on its left.', show: [{ house: 18 }] },
      glossary: 'demand',
    },
    {
      id: 'produce',
      say: 'You are closer, so sell to it anyway: tap your Kitchen Trainee and make a burger.',
      show: [{ card: { player: ME, uid: 'k15-kt' } }],
      onEnter: [{ select: null }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k15-kt' && a.food === 'burger')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k15-kt', food: 'burger' }],
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
      say: 'Press Continue and watch house 18 eat.',
      show: [{ ui: 'continue' }, { house: 18 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => (saleAt(ctx, 18)?.player === ME ? "You sold house 18 the burger Bo's billboard made it want." : 'Dinner is over.'),
    },
    {
      id: 'claim',
      say: 'Milestones like this one are checked as Dinnertime ends. Press Continue and watch the Milestones tab.',
      show: [{ ui: 'continue' }, { ui: 'tab-milestones' }],
      allow: { actions: [only('tutorial.continue')] },
      until: { event: 'milestoneClaimed', where: (e) => e.type === 'milestoneClaimed' && e.player === BO && e.milestoneId === 'ketchup:ketchup' },
      solution: continueAction,
      then: 'Bo claimed Ketchup: someone else sold the demand his marketeer created.',
      checkpoint: true,
    },
    {
      id: 'effect',
      say: "From the next Dinnertime Bo's price + distance counts $1 less: $10 + 2 − 1 = 11 at house 18, a tie with your 11.",
      show: [{ house: 18 }, { restaurant: BO }],
      onEnter: [{ openTab: 'milestones' }],
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'It works for drink-only orders too, and stacks with First Marketeer Used (−2) from New Milestones.',
      until: { next: true },
      glossary: 'first_marketeer_used',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: "You sell to a house whose demand came from Bo's marketeer. Who gains Ketchup?", options: ['You', 'Bo', 'Both'], answer: 1, why: 'The player whose demand was sold by someone else gains it.' },
      { kind: 'number', q: "Bo has Ketchup. His unit price is $10 and the house is 2 borders away. What is Bo's score?", answer: 11, why: '$10 + 2 − 1 for Ketchup.' },
      { kind: 'choice', q: 'Does Ketchup change the Dinnertime in which it is earned?', options: ['Yes', 'No'], answer: 1, why: 'It is claimed at the end of that Dinnertime and applies from the next one.' },
    ],
  },
});
