/**
 * L6 — Prices and competition (docs/tutorial-plan.md §2, L6). Price + distance decides; Pricing
 * Managers lower the price; a tie goes to more waitresses at work, then to turn order.
 *
 * Scenario: two dinners for house 18 (Ada 1 border away, Bo 2), each wanting one burger.
 *   Dinner 1 (round 3, held at the start of Dinnertime): Bo has a Pricing Manager at work and the
 *     First to Lower Prices milestone (claimed in round 2): $8 + 2 = 10 beats Ada's $10 + 1 = 11.
 *   Round 4: Bo's eternal billboard makes house 18 hungry again. Ada puts her Pricing Manager,
 *     Waitress and Kitchen Trainee to work: $9 + 1 = 10 against Bo's $8 + 2 = 10, a tie that
 *     Ada's waitress wins. (The milestone is gone for Ada: Bo claimed it in round 2.)
 */
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { continueAction } from '../dev/demo.js';
import { isHouse, sellerLine } from './02-restaurant.js';
import { lastTips, saleTotal } from './05-dinnertime.js';

const B = town({ round: 3 });
const H18 = B.houseId(18);
const ADA = { pm: 'p1-pm', w: 'p1-w', kt: 'p1-kt' };
const BO = { pm: 'p2-pm', kt: 'p2-kt', mkt: 'p2-mkt' };
const TEAM = [ADA.pm, ADA.w, ADA.kt];

const offers = (ctx: StepCtx) => ({ me: sellerLine(ctx.view, ctx.me, 18, 'p1'), bo: sellerLine(ctx.view, ctx.me, 18, 'p2') });

export const lesson06 = defineLesson({
  id: 'base.6',
  course: 'base',
  title: 'Prices and competition',
  minutes: 9,
  goal: 'Price + distance decides; Pricing Managers cut prices; ties go to waitresses, then turn order.',
  concepts: ['pricing_manager', 'unit_price', 'tie_break', 'waitress', 'turn_order'],
  requires: ['base.5'],
  scenario: {
    build: () =>
      town({ round: 3 })
        .reserve('p1', { kind: 'standard', amount: 200, ceoSlots: 3 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .cash('p1', 20)
        .cash('p2', 20)
        .card('p1', 'kitchen_trainee', 'work', ADA.kt)
        .card('p1', 'pricing_manager', 'beach', ADA.pm)
        .card('p1', 'waitress', 'beach', ADA.w)
        .card('p2', 'pricing_manager', 'work', BO.pm)
        .card('p2', 'kitchen_trainee', 'work', BO.kt)
        .marketeerCampaign('marketing_trainee', BO.mkt, {
          owner: 'p2',
          kind: 'billboard',
          number: 13,
          goods: ['burger'],
          placement: { kind: 'board', x: 1, y: 6, w: 1, h: 3 },
          remaining: 1,
          eternal: true,
          id: 'cmp-bo-13',
        })
        .milestone('p2', 'first_billboard', 2)
        .milestone('p2', 'first_lower_prices', 2)
        .milestone('p2', 'first_burger_produced', 2)
        .demand(18, ['burger'], 'p2', 'cmp-bo-13')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .phase({ kind: 'dinnertime', houses: B.houseOrder(), idx: 0 })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    startPaused: true,
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'distance',
      say: 'House 18 wants a burger. It is 1 tile border from you and 2 from Bo, so at equal prices you would win it.',
      show: [{ house: 18 }, { restaurant: 'p1' }, { restaurant: 'p2' }],
      until: { next: true },
      checkpoint: true,
    },
    {
      id: 'bo-price',
      say: 'But Bo has a Pricing Manager at work (−$1) and the First to Lower Prices milestone (−$1 for good). Tap house 18.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      then: (ctx) => {
        const o = offers(ctx);
        return o.me && o.bo ? `${o.bo} beats ${o.me}.` : 'Bo’s lower price beats your shorter road.';
      },
      hint: { say: 'House 18 is on tile A2, just below your restaurant.', show: [{ house: 18 }] },
      glossary: 'pricing_manager',
    },
    {
      id: 'run-1',
      say: 'Press Continue and watch who gets house 18.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      onEnter: [{ select: null }, { follow: true }],
    },
    {
      id: 'replay-1',
      say: () => `Bo sold the burger for $${saleTotal(H18, 8)}. His lower price beat your shorter distance.`,
      show: [{ house: 18 }],
      replay: { phase: 'dinnertime', from: H18 },
      until: { next: true },
      onEnter: [{ summary: 'open' }],
      checkpoint: true,
    },
    {
      id: 'next-round',
      say: 'Press Continue to play on. Payday is next.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { view: (v) => v.phase.kind === 'payday' },
      solution: continueAction,
      onEnter: [{ summary: 'close' }],
    },
    {
      id: 'payday',
      say: 'None of these cards earns a salary, so press Pay. Then Bo’s billboard beside house 18 makes it hungry again.',
      show: [{ ui: 'payday-confirm' }, { campaign: 'cmp-bo-13' }],
      allow: { actions: [{ type: 'payday.confirm' }] },
      script: [{ player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } }],
      until: { view: (v) => v.round === 4 && v.phase.kind === 'restructuring' },
      solution: [{ type: 'payday.confirm', playerId: 'p1' }],
      hint: { say: 'Tap the Pay button in the Turn panel.', show: [{ ui: 'payday-confirm' }] },
    },
    {
      id: 'restructure',
      say: 'Round 4. Put your Pricing Manager, Waitress and Kitchen Trainee all under your CEO, then press Submit.',
      show: [{ ui: 'org-hand' }, { ui: 'submit-structure' }],
      allow: { actions: [{ type: 'restructure.submit', where: (a) => a.type === 'restructure.submit' && TEAM.every((u) => a.structure.ceoSubs.includes(u)) }] },
      script: [{ player: 'p2', action: { type: 'restructure.submit', playerId: 'p2', structure: { ceoSubs: [BO.pm, BO.kt], managerSubs: {} } } }],
      until: { view: (v) => v.phase.kind !== 'restructuring' },
      solution: [{ type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: TEAM, managerSubs: {} } }],
      then: 'Revealed: Bo kept his Pricing Manager and Kitchen Trainee at work.',
      hint: { say: 'Tap each card in your hand, then an empty slot under the CEO. Then Submit.', show: [{ ui: 'org-hand' }] },
      onEnter: [{ summary: 'close' }, { openTab: 'company' }],
      checkpoint: true,
    },
    {
      id: 'bo-order',
      say: 'Bo left a slot empty and you filled all three, so Bo picks turn order first. He takes position 1 and plays first.',
      show: [{ ui: 'rail-p2' }],
      script: [
        { player: 'p2', action: { type: 'order.choosePosition', playerId: 'p2', position: 0 } },
        { player: 'p2', action: { type: 'work.produce', playerId: 'p2', cardUid: BO.kt, food: 'burger' } },
        { player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } },
      ],
      until: { all: [{ view: (v) => v.phase.kind === 'working' && v.awaiting.players.includes('p1') }, { next: true }] },
      onEnter: [{ openTab: 'turn' }],
      glossary: 'turn_order',
    },
    {
      id: 'produce',
      say: 'Bo made a burger. Your turn: tap your Kitchen Trainee and make a burger too.',
      show: [{ ui: `work-card-${ADA.kt}` }, { ui: 'produce-burger' }],
      allow: { actions: [{ type: 'work.produce', where: (a) => a.type === 'work.produce' && a.cardUid === ADA.kt && a.food === 'burger' }] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === 'p1' },
      solution: [{ type: 'work.produce', playerId: 'p1', cardUid: ADA.kt, food: 'burger' }],
      hint: { say: 'Tap the Kitchen Trainee card, then “Cook with Kitchen Trainee” and the burger.', show: [{ ui: `work-card-${ADA.kt}` }] },
    },
    {
      id: 'end-turn',
      say: 'Your Pricing Manager and Waitress work on their own: nothing to tap. End your turn.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      until: { paused: 'working' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
      hint: { say: 'Tap End turn (and End turn again if it asks).', show: [{ ui: 'end-turn' }] },
    },
    {
      id: 'tie',
      say: 'Before dinner, tap house 18 and compare the two offers.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      then: (ctx) => {
        const o = offers(ctx);
        return o.me && o.bo ? `${o.me} against ${o.bo}: a tie.` : 'The two offers are equal: a tie.';
      },
      hint: { say: 'House 18, on tile A2.', show: [{ house: 18 }] },
    },
    {
      id: 'tie-break',
      say: 'A tie goes to the chain with more Waitresses at work: you 1, Bo 0. If that is equal too, the earlier player in turn order wins.',
      show: [{ ui: 'rail-p1' }, { ui: 'rail-p2' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'tie_break',
    },
    {
      id: 'run-2',
      say: 'Press Continue and watch house 18.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      onEnter: [{ select: null }, { follow: true }],
    },
    {
      id: 'replay-2',
      say: () => {
        const tips = lastTips('p1');
        return `Your Waitress won the tie: you sold the burger for $${saleTotal(H18, 9)}. She also brought in ${tips === null ? 'tips' : `$${tips} in tips`} at the end of dinner.`;
      },
      show: [{ house: 18 }, { ui: 'cash-p1' }],
      replay: { phase: 'dinnertime', from: H18 },
      until: { next: true },
      onEnter: [{ summary: 'open' }],
      glossary: 'waitress',
    },
    {
      id: 'staff',
      say: 'Price is a lever you set with cards. Open the Staff tab to find the price cards.',
      show: [{ ui: 'tab-market' }],
      allow: { ui: ['tab-market'] },
      until: { signal: 'dockTab', equals: 'market' },
      solution: [{ tap: { ui: 'tab-market' } }],
      then: 'Pricing Manager −$1, Discount Manager −$3, Luxuries Manager +$10. Lesson 9 shows how to get them.',
      hint: { say: 'Tap Staff at the top of the panel.', show: [{ ui: 'tab-market' }] },
      onEnter: [{ summary: 'close' }],
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'tap', q: 'Tap the house where you and Bo tied.', target: { house: 18 }, why: 'House 18: your $9 + 1 border and Bo’s $8 + 2 borders both came to 10.' },
      { kind: 'choice', q: 'A tie on price + distance goes first to the chain with…', options: ['more cash', 'more Waitresses at work', 'the closer restaurant'], answer: 1, why: 'Waitresses at work break ties; distance is already in the total.' },
      { kind: 'choice', q: 'Waitresses are equal too. Who wins the tie?', options: ['The earlier player in turn order', 'The later player in turn order', 'Nobody sells'], answer: 0, why: 'After waitresses, turn order decides: earlier wins.' },
    ],
  },
});
