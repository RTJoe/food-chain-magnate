/**
 * K16 — New Milestones (docs/tutorial-plan.md §3, ketchup.md §3). 17 milestones replace the base
 * set; most need a card USED (an effect resolved in Working, Dinnertime or Payday), not just played.
 * Three expire after round 2. Here: First Marketeer Used (+$5 per token, −2 dinner score), First
 * Marketing Trainee Used (free Kitchen Trainee and Errand Boy), First Burger Sold (CEO 4 slots) and
 * First Pizza Sold (the seller places a pizza radio on the house's tile).
 *
 * Scenario: round 2, Working, Ada's turn: a Marketing Trainee at work, a burger and a pizza in
 * stock, house 2 wants a burger and house 18 a pizza.
 */
import type { Action } from '@fcm/engine';
import { legalPlacements } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, BO, cash, continueAction, continueThroughPayday, endTurn, kTown, ME, only, usd } from './shared.js';

const SPOT = { kind: 'board', x: 1, y: 6, w: 1, h: 2 } as const;

export const newMilestonesLesson = defineLesson({
  id: 'ketchup.newMilestones',
  course: 'ketchup',
  title: 'New Milestones',
  minutes: 8,
  goal: 'Claim four of the new "used" and "sold" milestones in one round and resolve the pizza radio.',
  concepts: ['module_new_milestones', 'used_card', 'first_marketeer_used', 'first_pizza_sold', 'first_burger_sold'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(2, ['ketchup:newMilestones'])
        .cash('p1', 20)
        .card('p1', 'marketing_trainee', 'work', 'k16-mt')
        .inventory('p1', { burger: 1, pizza: 1 })
        .demand(2, ['burger'])
        .demand(18, ['pizza'])
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime', 'marketing'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'New Milestones replaces the whole base set with 17 new milestones. Most need a card used, not just played.',
      show: [{ ui: 'tab-milestones' }],
      onEnter: [{ openTab: 'milestones' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'module_new_milestones',
    },
    {
      id: 'used',
      say: 'A card is used when one of its effects happens. A marketeer counts only if it really places a campaign.',
      show: [{ card: { player: ME, uid: 'k16-mt' } }],
      onEnter: [{ openTab: 'turn' }],
      until: { next: true },
      glossary: 'used_card',
    },
    {
      id: 'billboard',
      say: 'Tap your Marketing Trainee and place billboard #14 upright left of house 18, for burgers.',
      show: [{ card: { player: ME, uid: 'k16-mt' } }, { cell: [SPOT.x, SPOT.y] }, { house: 18 }],
      allow: { actions: [only('work.placeCampaign', (a) => a.campaignKind === 'billboard')] },
      until: { event: 'milestoneClaimed', where: (e) => e.type === 'milestoneClaimed' && e.player === ME && e.milestoneId === 'ketchup:first_marketeer_used' },
      solution: [{ type: 'work.placeCampaign', playerId: ME, cardUid: 'k16-mt', campaignKind: 'billboard', tileNumber: 14, goods: ['burger'], placement: SPOT, duration: 2 }],
      hint: { say: 'Pick token #14, choose burgers, then the spot just left of house 18.', show: [{ cell: [SPOT.x, SPOT.y] }] },
      checkpoint: true,
    },
    {
      id: 'rewards',
      say: 'Two at once: First Marketeer Used pays $5 per token your campaigns place, First Marketing Trainee Used gives a free Kitchen Trainee and Errand Boy.',
      show: [{ ui: 'milestone-ketchup:first_marketeer_used' }, { ui: 'milestone-ketchup:first_marketing_trainee_used' }],
      onEnter: [{ openTab: 'milestones' }],
      until: { next: true },
      glossary: 'first_marketeer_used',
    },
    {
      id: 'end-turn',
      say: 'End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      onEnter: [{ openTab: 'turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
    },
    {
      id: 'dinner',
      say: 'Press Continue. House 2 buys your burger, house 18 your pizza: two "sold" milestones.',
      show: [{ ui: 'continue' }, { house: 2 }, { house: 18 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { view: (v) => v.pending[0]?.kind === 'pizzaRadio' && v.pending[0].player === ME },
      solution: continueAction,
      then: 'First Burger Sold: your CEO has 4 slots for the rest of the game.',
      glossary: 'first_burger_sold',
      checkpoint: true,
    },
    {
      id: 'pizza-radio',
      say: 'First Pizza Sold: you must place a radio with 2 pizzas on the tile of the house that bought it, tile A2.',
      show: [{ tile: 'A2' }, { house: 18 }],
      allow: { actions: [only('ketchup:newMilestones.placePizzaRadio')] },
      until: { paused: 'dinnertime' },
      solution: (ctx): Action[] => {
        const head = ctx.view.pending[0];
        if (head?.kind !== 'pizzaRadio') return [];
        const spot = legalPlacements(ctx.state(), ME, { kind: 'pizzaRadio', choiceId: head.id }).find((p) => p.kind === 'pizzaRadio');
        return spot?.kind === 'pizzaRadio' ? [{ type: 'ketchup:newMilestones.placePizzaRadio', playerId: ME, choiceId: head.id, x: spot.x, y: spot.y }] : [];
      },
      hint: { say: 'Press "Place a pizza radio" and pick any highlighted square on tile A2.', show: [{ tile: 'A2' }] },
      glossary: 'first_pizza_sold',
    },
    {
      id: 'marketing',
      say: 'Continue to Marketing (confirm Payday if asked). Watch your cash as the billboard runs.',
      show: [{ ui: 'continue' }, { ui: 'cash-p1' }],
      allow: { actions: [only('tutorial.continue'), only('payday.confirm')] },
      until: { paused: 'marketing' },
      solution: continueThroughPayday,
      then: (ctx) => {
        let paid = 0;
        for (const e of ctx.events) if (e.type === 'cashChanged' && e.player === ME && /marketeer used/i.test(e.reason)) paid += e.delta;
        return `+${usd(paid)} from your billboard's tokens. The pizza radio pays nothing: no marketeer placed it. Cash: ${usd(cash(ctx.view))}.`;
      },
      checkpoint: true,
    },
    {
      id: 'combine',
      say: 'First Marketeer, Trainer and Recruiting Girl Used vanish after round 2 if unclaimed. Hard Choices cannot be played alongside.',
      until: { next: true },
      glossary: 'module_hard_choices',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'A Marketing Trainee works but places no campaign. Was she "used"?', options: ['Yes', 'No'], answer: 1, why: 'A marketeer counts as used only when it places a campaign.' },
      { kind: 'choice', q: 'What does First Burger Sold give you?', options: ['A CEO with 4 slots', '+$5 per burger', 'A free Burger Cook'], answer: 0, why: 'Your CEO has 4 slots for the rest of the game.' },
      { kind: 'number', q: 'With First Marketeer Used, your campaign places 3 tokens. How many dollars do you get?', answer: 15, why: '$5 per token placed by your marketeers’ campaigns.' },
    ],
  },
});
