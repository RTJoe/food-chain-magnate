/**
 * L3 — The CEO and your first hire (docs/tutorial-plan.md §2, L3). Restructuring with only the
 * CEO, turn order, Working 9–5, hiring one card, the beach, the supply; the automatic phases.
 *
 * Scenario: round 1 Restructuring after setup (both restaurants, reserves chosen). `settle: false`
 * so the learner submits the CEO-only chart; Bo (scripted, empty hand) is submitted by the engine.
 * Bo hires a Kitchen Trainee on his turn. Pauses after Clean up so the round's end can be read.
 */
import { town } from '@fcm/engine/testing';
import { defineLesson } from '../../dsl.js';
import { continueAction } from '../dev/demo.js';

const B = town({ round: 1 });
const CEO = B.ceoUid('p1');
const BO_CEO = B.ceoUid('p2');

export const lesson03 = defineLesson({
  id: 'base.3',
  course: 'base',
  title: 'The CEO and your first hire',
  minutes: 7,
  goal: 'Restructuring, turn order and Working 9–5: hire your first employee.',
  concepts: ['restructuring', 'ceo', 'order_of_business', 'working', 'hiring', 'entry_level', 'beach', 'supply'],
  requires: ['base.2'],
  scenario: {
    build: () =>
      town({ round: 1 })
        .reserve('p1', { kind: 'standard', amount: 200, ceoSlots: 3 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .phase({ kind: 'restructuring' })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['cleanup'],
    settle: false,
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'restructuring',
      say: 'Every round starts with Restructuring: you choose which of your cards work today. You own only the CEO, and the CEO always works.',
      show: [{ ui: 'org-ceo' }],
      until: { next: true },
      onEnter: [{ openTab: 'company' }],
      checkpoint: true,
      glossary: 'restructuring',
    },
    {
      id: 'submit',
      say: 'Your chart is just the CEO. Press Submit to lock it in.',
      show: [{ ui: 'submit-structure' }],
      allow: { actions: [{ type: 'restructure.submit' }] },
      until: { view: (v) => v.phase.kind !== 'restructuring' },
      solution: [{ type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [], managerSubs: {} } }],
      then: 'Bo also had only a CEO. Both charts are revealed at the same moment.',
      hint: { say: 'Tap Submit under your chart in the Company tab.', show: [{ ui: 'submit-structure' }] },
      glossary: 'structure',
    },
    {
      id: 'order',
      say: 'Now turn order. You and Bo are tied, so you choose first: take position 1 to act first.',
      show: [{ ui: 'order-pos-1' }],
      allow: { actions: [{ type: 'order.choosePosition', where: (a) => a.type === 'order.choosePosition' && a.position === 0 }] },
      until: { view: (v) => v.phase.kind === 'working' },
      solution: [{ type: 'order.choosePosition', playerId: 'p1', position: 0 }],
      hint: { say: 'In the Turn panel, tap position 1.', show: [{ ui: 'order-pos-1' }] },
      onEnter: [{ openTab: 'turn' }],
      glossary: 'order_of_business',
    },
    {
      id: 'working',
      say: 'Working 9–5: every card at work does its job, in the order of the steps shown. The CEO’s job is to hire one new employee.',
      show: [{ ui: 'work-stages' }, { ui: `work-card-${CEO}` }],
      until: { next: true },
      checkpoint: true,
      glossary: 'working',
    },
    {
      id: 'hire',
      say: 'Tap your CEO, then hire a Kitchen Trainee. Only cards with the sparkle can be hired straight away.',
      show: [{ ui: `work-card-${CEO}` }, { ui: 'hire-kitchen_trainee' }],
      allow: { actions: [{ type: 'work.recruit', where: (a) => a.type === 'work.recruit' && a.employeeId === 'kitchen_trainee' }] },
      until: { event: 'employeeHired', where: (e) => e.type === 'employeeHired' && e.player === 'p1' },
      solution: [{ type: 'work.recruit', playerId: 'p1', cardUid: CEO, employeeId: 'kitchen_trainee' }],
      then: 'Hired! A new card goes to the beach: hired today, working from next round.',
      hint: { say: 'Tap the CEO card in the Turn panel, then the Kitchen Trainee card.', show: [{ ui: `work-card-${CEO}` }, { ui: 'hire-kitchen_trainee' }] },
      glossary: 'entry_level',
    },
    {
      id: 'beach',
      say: 'Open the Company tab. Your Kitchen Trainee sits on the beach: yours, but not working today.',
      show: [{ ui: 'tab-company' }],
      allow: { ui: ['tab-company'] },
      until: { signal: 'dockTab', equals: 'company' },
      solution: [{ tap: { ui: 'tab-company' } }],
      hint: { say: 'Tap Company at the top of the panel.', show: [{ ui: 'tab-company' }] },
      glossary: 'beach',
    },
    {
      id: 'supply',
      say: (ctx) => `Now open the Staff tab: it counts the cards left to hire. Kitchen Trainees left: ${ctx.view.supply.kitchen_trainee ?? 0}.`,
      show: [{ ui: 'tab-market' }],
      allow: { ui: ['tab-market'] },
      until: { signal: 'dockTab', equals: 'market' },
      solution: [{ tap: { ui: 'tab-market' } }],
      then: 'Every pile is limited: when it is empty, nobody can hire that card.',
      hint: { say: 'Tap Staff at the top of the panel.', show: [{ ui: 'tab-market' }] },
      glossary: 'supply',
    },
    {
      id: 'end-turn',
      say: 'You are done for this round. End your turn; then Bo takes his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [
        { player: 'p2', action: { type: 'work.recruit', playerId: 'p2', cardUid: BO_CEO, employeeId: 'kitchen_trainee' } },
        { player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } },
      ],
      until: { view: (v) => v.phase.kind === 'payday' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
      then: 'Bo hired a Kitchen Trainee too. Dinnertime ran next: no house wanted food, so nothing sold.',
      hint: { say: 'Tap End turn in the Turn panel.', show: [{ ui: 'end-turn' }] },
      onEnter: [{ openTab: 'turn' }],
    },
    {
      id: 'payday',
      say: 'Now Payday: some cards earn a salary, but none of yours does yet. Press Pay to go on.',
      show: [{ ui: 'payday-confirm' }],
      allow: { actions: [{ type: 'payday.confirm' }] },
      script: [{ player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } }],
      until: { paused: 'cleanup' },
      solution: [{ type: 'payday.confirm', playerId: 'p1' }],
      hint: { say: 'Tap the Pay button in the Turn panel.', show: [{ ui: 'payday-confirm' }] },
      glossary: 'payday',
    },
    {
      id: 'auto-phases',
      say: 'Marketing and Clean up then ran by themselves. Nothing happened yet: no campaigns, no food to throw away.',
      until: { next: true },
      checkpoint: true,
      glossary: 'phase',
    },
    {
      id: 'next-round',
      say: 'Press Continue to start round 2. Your Kitchen Trainee comes back to your hand, ready to work.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { view: (v) => v.round === 2 },
      solution: continueAction,
      onEnter: [{ openTab: 'company' }],
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Where does a card go on the round you hire it?', options: ['The beach', 'Straight to work', 'Back to the pile'], answer: 0, why: 'New hires wait on the beach and can work from the next round.' },
      { kind: 'choice', q: 'Which cards can your CEO hire?', options: ['Any card', 'Cards with the sparkle', 'Only managers'], answer: 1, why: 'Only entry-level cards, marked with a sparkle, are hired directly.' },
      { kind: 'tap', q: 'Tap the tab that counts the cards left to hire.', target: { ui: 'tab-market' }, why: 'The Staff tab shows every card and how many are left in its pile.' },
    ],
  },
});
