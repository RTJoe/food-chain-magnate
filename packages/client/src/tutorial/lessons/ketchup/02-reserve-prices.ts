/**
 * K2 — Reserve Prices (docs/tutorial-plan.md §3, ketchup.md §14). Every reserve card is +$200 with
 * a base price ($5 / $10 / $20). At the first bank break the bank gets $200 per player, CEO slots
 * stay, and the most frequent card sets the base unit price (tie: $20 > $5 > $10).
 *
 * Scenario: setup, both restaurants open, reserve cards still to choose. The bank holds only $15
 * and three houses already want food that Ada and Bo have in stock, so round 1's Dinnertime
 * breaks the bank with Ada's $20 card against Bo's $5 card: a 1–1 tie, so $20 wins.
 */
import type { Action, GameView } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, cash, continueAction, endTurn, eventOf, kTown, ME, only, usd } from './shared.js';

const pick20: Action = { type: 'setup.chooseReserve', playerId: ME, card: { kind: 'price', amount: 200, basePrice: 20 } };
const isHouse = (n: number) => (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

export const reservePricesLesson = defineLesson({
  id: 'ketchup.reservePrices',
  course: 'ketchup',
  title: 'Reserve Prices',
  minutes: 6,
  goal: 'Choose a reserve price card and see the first bank break set a new base price.',
  concepts: ['module_reserve_prices', 'reserve_card', 'bank_break', 'unit_price'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(0, ['ketchup:reservePrices'])
        .bank({ cash: 15 })
        .inventory('p1', { burger: 2 })
        .inventory('p2', { pizza: 1 })
        .demand(2, ['burger'])
        .demand(5, ['pizza'])
        .demand(18, ['burger'])
        .phase({ kind: 'setup.reserve' })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'cards',
      say: 'With Reserve Prices every reserve card adds $200. Instead of CEO slots, each names a base price: $5, $10 or $20.',
      show: [{ ui: 'reserve-200-5' }, { ui: 'reserve-200-10' }, { ui: 'reserve-200-20' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'module_reserve_prices',
    },
    {
      id: 'choose',
      say: 'Pick the $20 card: you vote for dear food. Bo picks in secret too.',
      show: [{ ui: 'reserve-200-20' }],
      allow: { actions: [only('setup.chooseReserve', (a) => a.card.kind === 'price' && a.card.basePrice === 20)] },
      script: [{ player: BO, action: { type: 'setup.chooseReserve', playerId: BO, card: { kind: 'price', amount: 200, basePrice: 5 } } }],
      until: { view: (v) => v.phase.kind === 'orderOfBusiness' },
      solution: [pick20],
      glossary: 'reserve_card',
    },
    {
      id: 'order',
      say: 'Open slots are equal, so the starting order breaks the tie: you choose first. Take position 1.',
      show: [{ ui: 'order-pos-1' }],
      allow: { actions: [only('order.choosePosition', (a) => a.position === 0)] },
      until: { view: (v) => v.phase.kind === 'working' },
      solution: [{ type: 'order.choosePosition', playerId: ME, position: 0 }],
    },
    {
      id: 'tight-bank',
      say: (ctx) => `The bank holds ${usd(ctx.view.bank.cash)}. Houses 2, 5 and 18 want food worth more than that: the bank will break tonight.`,
      show: [{ ui: 'bank' }, { house: 2 }, { house: 5 }],
      until: { next: true },
      glossary: 'bank_break',
    },
    {
      id: 'inspect',
      say: 'Tap house 18. Offers still use the $10 base price.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      hint: { say: 'House 18 is on tile A2, just below your restaurant.', show: [{ house: 18 }] },
    },
    {
      id: 'end-turn',
      say: 'Nothing to do yet. End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      onEnter: [{ select: null }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
      checkpoint: true,
    },
    {
      id: 'dinner',
      say: 'Press Continue and watch the bank counter during Dinnertime.',
      show: [{ ui: 'continue' }, { ui: 'bank' }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const b = eventOf(ctx, 'bankBroke');
        return b ? `The bank broke: ${usd(b.added)} went in, $200 for each of you.` : 'Dinner is over.';
      },
    },
    {
      id: 'new-price',
      say: (ctx) => `Your $20 and Bo's $5 tie 1–1, and $20 wins ties. The base price is now ${usd(ctx.view.basePrice)} for the rest of the game.`,
      show: [{ ui: 'bank' }],
      until: { next: true },
      checkpoint: true,
    },
    {
      id: 'house-18',
      say: (ctx) => `You now have ${usd(cash(ctx.view))}: house 2 paid $10 before the break, house 18 paid ${usd(cash(ctx.view) - 10)} after it.`,
      show: [{ house: 18 }],
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'Pricing, Discount and Luxuries Managers still change the price on top of it. CEO slots never change with these cards.',
      until: { next: true },
      glossary: 'unit_price',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Revealed cards: one $5, one $20. What is the new base price?', options: ['$5', '$10', '$20'], answer: 2, why: 'A tie in frequency goes to $20 first, then $5, then $10.' },
      { kind: 'choice', q: 'What does the first bank break add with Reserve Prices?', options: ['$200 per player', 'The sum of the base prices', 'Nothing'], answer: 0, why: 'Every card is a +$200 card.' },
      { kind: 'choice', q: 'Does the first break change the number of CEO slots?', options: ['Yes, to the most common vote', 'No, they stay as they are'], answer: 1, why: 'Price cards carry no slot vote.' },
    ],
  },
});
