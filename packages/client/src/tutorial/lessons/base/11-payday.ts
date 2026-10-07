/**
 * L11 — Payday and salaries (docs/tutorial-plan.md §2, L11; §1.4 "Salaries and firing"). Salaried
 * cards cost $5 each wherever they are; everyone decides firing at once; a chain that cannot pay
 * must fire until it can; firing is optional when you can pay; discounts.
 *
 * Scenario: round 5 Payday. Ada: $8, Cart Operator ($) and Burger Cook ($) at work with a Trainer
 * and a Waitress: owes $10. Bo: $40, a Burger Cook on the beach: owes $5. House 2 still wants 2
 * burgers (nobody had them this round). Second half: round 6 is played to the next Payday, where Ada
 * can pay and firing becomes a choice.
 */
import type { Action, GameEvent } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { cashOf, continueAction, salesIn } from './late.js';

const CO = 'p1-co';
const BC = 'p1-bc';
const TR = 'p1-tr';
const WA = 'p1-wa';

const paid = (e: GameEvent, p: string) => e.type === 'salaryPaid' && e.player === p;
const salaryOf = (ctx: StepCtx, p: string) => {
  const e = ctx.events.find((x) => paid(x, p));
  return e && e.type === 'salaryPaid' ? e.paid : 0;
};
const owedNow = (ctx: StepCtx) => {
  const p = ctx.view.players.p1;
  if (!p) return 0;
  const salaried = new Set(['cart_operator', 'burger_cook']);
  return Object.values(p.employees).filter((c) => salaried.has(c.employeeId)).length * 5;
};
const CHART = { ceoSubs: [BC, TR, WA], managerSubs: {} };
const sameChart = (a: Action) => a.type === 'restructure.submit' && a.structure.ceoSubs.length === 3 && [BC, TR, WA].every((u) => a.structure.ceoSubs.includes(u));

export const lesson11 = defineLesson({
  id: 'base.11',
  course: 'base',
  title: 'Payday and salaries',
  minutes: 9,
  goal: 'Salaries: $5 per salaried card, firing decided by everyone at once, forced firing when you cannot pay.',
  concepts: ['salary', 'payday', 'fire', 'forced_fire', 'salary_discount'],
  scenario: {
    build: () =>
      town({ round: 5 })
        .card('p1', 'cart_operator', 'work', CO)
        .card('p1', 'burger_cook', 'work', BC)
        .card('p1', 'trainer', 'work', TR)
        .card('p1', 'waitress', 'work', WA)
        .card('p2', 'burger_cook', 'beach', 'p2-bc')
        .card('p2', 'kitchen_trainee', 'work', 'p2-kt')
        .cash('p1', 8)
        .cash('p2', 40)
        .demand(2, ['burger', 'burger'])
        .phase({ kind: 'payday', queue: ['p1', 'p2'], idx: 0 })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['payday', 'working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'salary-badges',
      say: 'Cards with a $5 badge are paid every Payday, at work, on the beach or busy. Your Cart Operator and Burger Cook have one; the Trainer and Waitress are free.',
      show: [{ ui: `fire-${CO}` }, { ui: `fire-${BC}` }],
      until: { next: true },
      onEnter: [{ openTab: 'turn' }],
      checkpoint: true,
      glossary: 'salary',
    },
    {
      id: 'pay-short',
      say: (ctx) => `You owe $${owedNow(ctx)} and have $${cashOf(ctx.view, 'p1')}. Press the pay button and see what happens.`,
      show: [{ ui: 'payday-confirm' }],
      allow: { actions: [{ type: 'payday.confirm' }] },
      script: [{ player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } }],
      until: { view: (v) => v.pending[0]?.kind === 'forcedFire' && v.pending[0].player === 'p1' },
      solution: [{ type: 'payday.confirm', playerId: 'p1' }],
      then: 'Bo decided at the same time. Salaries are paid only once everyone has decided.',
      hint: { say: 'Press the pay button at the bottom of the Payday panel.', show: [{ ui: 'payday-confirm' }] },
      glossary: 'payday',
    },
    {
      id: 'forced-fire',
      say: 'You cannot pay everyone, so you must fire salaried cards until you can. Fire the Cart Operator: then you owe $5.',
      show: [{ ui: `fire-${CO}` }],
      allow: { actions: [{ type: 'payday.fire', where: (a) => a.type === 'payday.fire' && a.uids.length === 1 && a.uids[0] === CO }] },
      until: { event: 'salaryPaid', where: (e) => paid(e, 'p1') },
      solution: [{ type: 'payday.fire', playerId: 'p1', uids: [CO] }],
      then: (ctx) => `You paid $${salaryOf(ctx, 'p1')} and have $${cashOf(ctx.view, 'p1')} left. The Cart Operator went back to the supply.`,
      hint: { say: 'Tap the Cart Operator card, then "Fire 1".', show: [{ ui: `fire-${CO}` }] },
      checkpoint: true,
      glossary: 'forced_fire',
    },
    {
      id: 'bo-beach',
      say: (ctx) => `Bo paid $5 for his Burger Cook, who sat on the beach all round. Bo has $${cashOf(ctx.view, 'p2')}; salaries go back to the bank.`,
      show: [{ ui: 'cash-p2' }, { ui: 'bank' }],
      until: { next: true },
    },
    {
      id: 'next-round',
      say: 'Next, the voluntary case. Press Continue: Marketing and Clean up run, and round 6 starts.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { view: (v) => v.round === 6 && v.phase.kind === 'restructuring' },
      solution: continueAction,
    },
    {
      id: 'chart',
      say: 'Put the Burger Cook, the Trainer and the Waitress in your three CEO slots, then submit.',
      show: [{ ui: 'hand-card-burger_cook' }, { ui: 'org-slot-1' }, { ui: 'submit-structure' }],
      allow: { actions: [{ type: 'restructure.submit', where: (a) => sameChart(a) }] },
      script: [
        { player: 'p2', action: { type: 'restructure.submit', playerId: 'p2', structure: { ceoSubs: ['p2-bc', 'p2-kt'], managerSubs: {} } } },
        { player: 'p2', action: { type: 'order.choosePosition', playerId: 'p2', position: 1 } },
      ],
      until: { view: (v) => v.phase.kind === 'working' && v.turn?.player === 'p1' },
      solution: [
        { tap: { ui: 'hand-card-burger_cook' } },
        { tap: { ui: 'org-slot-1' } },
        { tap: { ui: 'hand-card-trainer' } },
        { tap: { ui: 'org-slot-2' } },
        { tap: { ui: 'hand-card-waitress' } },
        { tap: { ui: 'org-slot-3' } },
        { type: 'restructure.submit', playerId: 'p1', structure: CHART },
      ],
      then: 'Bo had an open slot and chose first; he took position 2, so you work first.',
      onEnter: [{ summary: 'close' }, { openTab: 'turn' }],
      hint: { say: 'Tap a card in your hand, then a dashed CEO slot. Then "Submit structure".', show: [{ ui: 'submit-structure' }] },
      checkpoint: true,
    },
    {
      id: 'cook',
      say: 'House 2 still wants 2 burgers. Tap your Burger Cook and make 3.',
      show: [{ ui: `work-card-${BC}` }, { house: 2 }],
      allow: { actions: [{ type: 'work.produce', where: (a) => a.type === 'work.produce' && a.cardUid === BC }] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === 'p1' },
      solution: [{ type: 'work.produce', playerId: 'p1', cardUid: BC }],
      hint: { say: 'Tap the Burger Cook card in the Turn panel, then "Produce".', show: [{ ui: `work-card-${BC}` }] },
    },
    {
      id: 'end-turn',
      say: 'End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [{ player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } }],
      until: { paused: 'working' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
    },
    {
      id: 'dinner',
      say: 'Press Continue to run Dinnertime.',
      show: [{ ui: 'continue' }, { house: 2 }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      onEnter: [{ follow: true }],
      then: (ctx) => {
        const sale = salesIn(ctx.events).find((e) => e.player === 'p1');
        const tips = ctx.events.find((e) => e.type === 'tipsPaid' && e.player === 'p1');
        return `House 2 paid you $${sale?.total ?? 0}, and your Waitress earned $${tips && tips.type === 'tipsPaid' ? tips.amount : 0} in tips.`;
      },
    },
    {
      id: 'idle-cook',
      say: 'Making your first burger claimed First Burger Produced: a free Burger Cook, now on your beach. He costs $5 too, even while idle.',
      show: [{ ui: 'tab-milestones' }, { ui: 'rail-p1' }],
      until: { next: true },
      glossary: 'salary',
    },
    {
      id: 'voluntary',
      say: (ctx) => `Payday again: you owe $${owedNow(ctx)} and have $${cashOf(ctx.view, 'p1')}. You can pay, so firing is your choice: Continue, then pay or fire.`,
      show: [{ ui: 'continue' }, { ui: 'payday-confirm' }],
      allow: { actions: [{ type: 'tutorial.continue' }, { type: 'payday.confirm' }, { type: 'payday.fire' }] },
      script: [{ player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } }],
      until: { event: 'salaryPaid', where: (e) => paid(e, 'p1') },
      solution: (ctx) => [...continueAction(ctx), { type: 'payday.confirm', playerId: 'p1' }],
      then: (ctx) => `You paid $${salaryOf(ctx, 'p1')}. Each cook you keep costs $5 a round and makes 3 burgers when he works.`,
      hint: { say: 'Press Continue, then the pay button in the Payday panel.', show: [{ ui: 'payday-confirm' }] },
      onEnter: [{ summary: 'close' }, { openTab: 'turn' }],
      checkpoint: true,
      glossary: 'fire',
    },
    {
      id: 'discounts',
      say: 'Discounts: First to Train takes $15 off every Payday, and each unused Recruiting Manager hire takes $5. The total never goes below $0.',
      show: [{ ui: 'tab-milestones' }],
      until: { next: true },
      glossary: 'salary_discount',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Does a salaried card on the beach cost salary?', options: ['Yes, $5', 'No, only cards at work'], answer: 0, why: 'Salaries are paid for every salaried card you own: at work, on the beach or busy.' },
      { kind: 'choice', q: 'You owe $15 and have $12. Your cards: three Burger Cooks ($), a Waitress, a Kitchen Trainee. What must you do?', options: ['Nothing: pay the $12 you have', 'Fire one Burger Cook', 'Fire the Waitress'], answer: 1, why: 'You must pay in full, so fire until you can. One Burger Cook drops $15 to $10; the Waitress has no salary.' },
      { kind: 'tap', q: 'Tap the house that bought your burgers.', target: { house: 2 }, why: 'House 2, on your tile, 0 borders away.' },
    ],
  },
});
