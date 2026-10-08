/**
 * L14 — The bank, reserve cards and the end (docs/tutorial-plan.md §2, L14; §1.4 "The bank breaking
 * and reserve cards"). The bank breaks when it hits $0 during Dinnertime; the reserve cards refill
 * it and vote on CEO slots; a second break pays the rest as IOUs and ends the game; most cash wins.
 *
 * Scenario: round 7, the start of a big Dinnertime (held so the learner can read first). Bank $8;
 * reserves Ada +$200 (3 slots), Bo +$100 (2 slots). Ada sells 1 burger to house 2 ($10: the first
 * break, mid-sale), Bo sells pizzas to houses 4, 5 and 7 (gardens on 4 and 7), Ada sells 5 burgers
 * to house 18 (garden): $320 against the refilled $298, so the bank breaks a second time during the
 * same Dinnertime and the game ends. (The plan's two scenarios are one dinner here: a lesson has
 * one scenario.)
 */
import type { GameEvent, GameView } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson } from '../../dsl.js';
import { cashOf, continueAction } from './late.js';

const reserveOf = (v: GameView, p: string) => v.visibleReserves[p] ?? null;
const broke = (events: readonly GameEvent[], n: 1 | 2) => events.find((e) => e.type === 'bankBroke' && e.breakNo === n);

export const lesson14 = defineLesson({
  id: 'base.14',
  course: 'base',
  title: 'The bank, reserve cards and the end',
  minutes: 8,
  goal: 'The bank breaks at $0 in Dinnertime; reserve cards refill it and set CEO slots; the second break ends the game.',
  concepts: ['bank', 'bank_break', 'reserve_card', 'ceo_slots', 'game_end', 'cfo'],
  scenario: {
    build: () => {
      const b = town({ round: 7 })
        .reserve('p1', { kind: 'standard', amount: 200, ceoSlots: 3 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .garden(18, 'W')
        .garden(7, 'E')
        .garden(4, 'N')
        .demand(2, ['burger'])
        .demand(4, ['pizza', 'pizza', 'pizza', 'pizza', 'pizza'])
        .demand(5, ['pizza', 'pizza'])
        .demand(7, ['pizza', 'pizza', 'pizza', 'pizza', 'pizza'])
        .demand(18, ['burger', 'burger', 'burger', 'burger', 'burger'])
        .inventory('p1', { burger: 6 })
        .inventory('p2', { pizza: 12 })
        .cash('p1', 160)
        .cash('p2', 40)
        .bank({ cash: 8 });
      return b.phase({ kind: 'dinnertime', houses: b.houseOrder(), idx: 0 }).build();
    },
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['dinnertime'],
    startPaused: true,
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'low-bank',
      say: (ctx) => `The bank has $${ctx.view.bank.cash}. House 2 eats first and pays you $10 for its burger: something has to give.`,
      show: [{ ui: 'bank' }, { house: 2 }],
      until: { next: true },
      checkpoint: true,
      glossary: 'bank',
    },
    {
      id: 'reserves',
      say: (ctx) => {
        const r = reserveOf(ctx.view, 'p1');
        return `At setup you picked a secret reserve card: ${r?.kind === 'standard' ? `+$${r.amount}, ${r.ceoSlots} slots` : 'yours'}. Bo picked one too; nobody has seen his.`;
      },
      show: [{ ui: 'rail-p1' }, { ui: 'rail-p2' }],
      until: { next: true },
      glossary: 'reserve_card',
    },
    {
      id: 'run',
      say: 'Press Continue and watch the bank counter.',
      show: [{ ui: 'continue' }, { ui: 'bank' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { event: 'gameEnded' },
      solution: continueAction,
      onEnter: [{ follow: true }],
      then: (ctx) => (broke(ctx.events, 1) ? 'The bank broke, and later broke again.' : 'Dinner is over.'),
    },
    {
      id: 'first-break',
      say: 'Your $10 sale hit $0 after $8: the bank broke. Both reserve cards flipped and their money went in: +$200 and +$100.',
      show: [{ ui: 'bank' }, { house: 2 }],
      replay: { phase: 'dinnertime' },
      until: { next: true },
      checkpoint: true,
      glossary: 'bank_break',
    },
    {
      id: 'slot-vote',
      say: (ctx) => {
        const a = reserveOf(ctx.view, 'p1');
        const b = reserveOf(ctx.view, 'p2');
        const sa = a?.kind === 'standard' ? a.ceoSlots : 3;
        const sb = b?.kind === 'standard' ? b.ceoSlots : 2;
        const why = sa === sb ? 'Both votes match' : 'Each number got one vote, a tie, so the higher one wins';
        return `Each card also votes for CEO slots: ${sa} and ${sb}. The most common vote wins. ${why}: every CEO has ${ctx.view.ceoSlots} slots from now on.`;
      },
      show: [{ ui: 'rail-p1' }, { ui: 'rail-p2' }],
      until: { next: true },
      then: 'Had both of you picked +$100, every CEO would have dropped to 2 slots.',
      glossary: 'reserve_card',
    },
    {
      id: 'continued',
      say: 'You were paid the rest of your $10, and dinner went on: Bo sold to houses 4, 5 and 7 for $220.',
      show: [{ house: 4 }, { house: 5 }, { house: 7 }],
      until: { next: true },
    },
    {
      id: 'second-break',
      say: (ctx) => {
        const iou = ctx.view.bank.ious.p1 ?? 0;
        return `Then your $100 garden sale at house 18 emptied it again. A second break has no refill: $${iou} was paid as an IOU, and the game ends after this Dinnertime.`;
      },
      show: [{ house: 18 }, { ui: 'bank' }],
      until: { next: true },
      glossary: 'game_end',
    },
    {
      id: 'winner',
      say: (ctx) => {
        const a = cashOf(ctx.view, 'p1');
        const b = cashOf(ctx.view, 'p2');
        return `Most cash wins: you have $${a}, Bo $${b}. ${a >= b ? 'You win' : 'Bo wins'}, and there is no Payday after the last Dinnertime.`;
      },
      show: [{ ui: 'cash-p1' }, { ui: 'cash-p2' }],
      until: { next: true },
    },
    {
      id: 'cfo',
      say: 'A CFO, or First to have $100, adds 50% to your Dinnertime income: the fastest way to break a bank while you are ahead.',
      show: [{ ui: 'tab-market' }],
      until: { next: true },
      glossary: 'cfo',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'When can the bank break in the base game?', options: ['In any phase', 'Only during Dinnertime', 'Only at Payday'], answer: 1, why: 'Only Dinnertime income empties the bank; Payday puts money back in.' },
      { kind: 'number', q: 'Reserve cards vote 2, 2, 4 and 4 CEO slots. How many slots does every CEO get?', answer: 4, why: 'A tie between the most common votes goes to the highest number.' },
      { kind: 'tap', q: 'Tap the house whose sale broke the bank the second time.', target: { house: 18 }, why: 'Your 5 garden burgers at house 18 emptied the refilled bank.' },
    ],
  },
});
