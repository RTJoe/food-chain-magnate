/**
 * L5 — Dinnertime: who sells and why (docs/tutorial-plan.md §2, L5). A house buys its whole order
 * from the connected restaurant with the lowest price + distance; houses eat in number order; the
 * money comes out of the bank.
 *
 * Scenario: round 3, held at the start of Dinnertime. Demand: house 2 one burger, house 5 one
 * pizza, house 18 two burgers. Ada stocks 3 burgers, Bo 1 pizza and 1 burger. Bank $100. After
 * Dinnertime the lesson pauses and replays it house by house (Summary "Watch again").
 */
import type { GameEvent } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { summaries } from '../../../state/store.js';
import { continueAction } from '../dev/demo.js';
import { cashOf, isHouse, sellerLine } from './02-restaurant.js';

const B = town({ round: 3 });
const H2 = B.houseId(2);
const H5 = B.houseId(5);
const H18 = B.houseId(18);
const BANK_START = 100;

/** The `sale` events of the latest Dinnertime the client stored (browser), or none (headless). */
export function lastSales(phase: 'dinnertime' = 'dinnertime'): Extract<GameEvent, { type: 'sale' }>[] {
  const s = [...summaries.peek()].reverse().find((x) => x.phase === phase);
  return (s?.events ?? []).filter((e): e is Extract<GameEvent, { type: 'sale' }> => e.type === 'sale');
}

/** Waitress tips paid to a player in the latest Dinnertime (null when not stored). */
export function lastTips(player: string): number | null {
  const s = [...summaries.peek()].reverse().find((x) => x.phase === 'dinnertime');
  const e = s?.events.find((x): x is Extract<GameEvent, { type: 'tipsPaid' }> => x.type === 'tipsPaid' && x.player === player);
  return e ? e.amount : null;
}

/** "$20" for the sale at a house in the latest Dinnertime, or the fallback when it is not stored. */
export function saleTotal(houseId: string, fallback: number): number {
  return lastSales().find((e) => e.houseId === houseId)?.total ?? fallback;
}

const offers = (ctx: StepCtx, n: number) => [sellerLine(ctx.view, ctx.me, n, 'p1'), sellerLine(ctx.view, ctx.me, n, 'p2')].filter(Boolean);

export const lesson05 = defineLesson({
  id: 'base.5',
  course: 'base',
  title: 'Dinnertime: who sells and why',
  minutes: 8,
  goal: 'See which restaurant a house buys from, and why: road, full order, lowest price + distance.',
  concepts: ['dinnertime', 'demand', 'unit_price', 'winning_a_sale', 'bank'],
  requires: ['base.4'],
  scenario: {
    build: () =>
      town({ round: 3 })
        .reserve('p1', { kind: 'standard', amount: 200, ceoSlots: 3 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .demand(2, ['burger'])
        .demand(5, ['pizza'])
        .demand(18, ['burger', 'burger'])
        .inventory('p1', { burger: 3 })
        .inventory('p2', { pizza: 1, burger: 1 })
        .bank({ cash: BANK_START })
        .phase({ kind: 'dinnertime', houses: B.houseOrder(), idx: 0 })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['dinnertime'],
    startPaused: true,
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'hungry',
      say: 'Three houses want food now; Lesson 7 shows how they got hungry. Dinner goes house by house in number order: 2, then 5, then 18.',
      show: [{ house: 2 }, { house: 5 }, { house: 18 }],
      until: { next: true },
      checkpoint: true,
      glossary: 'demand',
    },
    {
      id: 'house-2',
      say: 'Tap house 2. It wants 1 burger: who can sell it?',
      show: [{ house: 2 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(2) },
      solution: [{ tap: { house: 2 } }],
      then: (ctx) => {
        const [a, b] = offers(ctx, 2);
        return a && b ? `${a} beats ${b}: the lowest price plus distance wins.` : 'The lowest price plus distance wins.';
      },
      hint: { say: 'House 2 is on your own tile, A1, left of your restaurant.', show: [{ house: 2 }] },
      glossary: 'winning_a_sale',
    },
    {
      id: 'price-distance',
      say: 'A house compares price plus distance: each tile border on the road counts as $1. The winner is still paid just the price.',
      show: [{ ui: 'inspect-sellers' }],
      until: { next: true },
      glossary: 'unit_price',
    },
    {
      id: 'house-18',
      say: 'Now tap house 18. It wants 2 burgers, and a house buys its whole order from one restaurant.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      then: (ctx) => `Bo has only ${ctx.view.players.p2?.inventory.burger ?? 0} burger, so he can't serve it at all. You have ${ctx.view.players.p1?.inventory.burger ?? 0}.`,
      hint: { say: 'House 18 is on tile A2, just below your restaurant.', show: [{ house: 18 }] },
    },
    {
      id: 'house-5',
      say: 'House 5 wants a pizza. You have none, so Bo is the only one who can sell it.',
      show: [{ house: 5 }],
      until: { next: true },
      onEnter: [{ select: { kind: 'house', id: H5 } }],
    },
    {
      id: 'run',
      say: 'Press Continue and watch dinner: a van drives each sale along the road.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      onEnter: [{ select: null }, { follow: true }],
      checkpoint: true,
    },
    {
      id: 'replay-2',
      say: () => `Again, house by house. House 2: your van crosses no border and you earn $${saleTotal(H2, 10)} for 1 burger.`,
      show: [{ house: 2 }],
      replay: { phase: 'dinnertime', from: H2 },
      until: { next: true },
      onEnter: [{ summary: 'open' }],
    },
    {
      id: 'replay-5',
      say: () => `House 5: Bo sells his pizza for $${saleTotal(H5, 10)}. With no pizza, you were never in the running.`,
      show: [{ house: 5 }],
      replay: { phase: 'dinnertime', from: H5 },
      until: { next: true },
    },
    {
      id: 'replay-18',
      say: () => `House 18: you sell both burgers for $${saleTotal(H18, 20)}. Bo, with one burger, could not fill the order.`,
      show: [{ house: 18 }],
      replay: { phase: 'dinnertime', from: H18 },
      until: { next: true },
    },
    {
      id: 'bank',
      say: (ctx) => `You now have $${cashOf(ctx.view, 'p1')} and Bo $${cashOf(ctx.view, 'p2')}. It all came out of the bank: $${BANK_START} down to $${ctx.view.bank.cash}.`,
      show: [{ ui: 'bank' }, { ui: 'cash-p1' }],
      until: { next: true },
      onEnter: [{ summary: 'close' }],
      glossary: 'bank',
    },
    {
      id: 'bank-end',
      say: 'When the bank runs dry, the game heads for its end (Lesson 14). Dinnertime is pure arithmetic: you can always predict it.',
      show: [{ ui: 'bank' }],
      until: { next: true },
      nextLabel: 'Finish',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'tap', q: 'Tap the house that ate first.', target: { house: 2 }, why: 'Houses eat in number order, lowest first: house 2.' },
      { kind: 'choice', q: 'Why couldn’t Bo sell to house 18?', options: ['Too far away', 'Not enough burgers', 'Wrong food'], answer: 1, why: 'A house buys its whole order from one restaurant; Bo had 1 burger, it wanted 2.' },
      { kind: 'number', q: 'Your price is $10 and the road crosses 2 tile borders. What total does the house compare?', answer: 12, why: '$10 + 2 borders = 12. You would still be paid $10.' },
    ],
  },
});

