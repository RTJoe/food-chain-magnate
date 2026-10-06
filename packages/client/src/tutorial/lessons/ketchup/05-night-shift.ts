/**
 * K5 — Night Shift Managers (docs/tutorial-plan.md §3, ketchup.md §11). A 0-slot manager that may
 * only sit in a CEO slot. While it is at work, every card without a salary acts a second time; the
 * CEO does not. Salary, 1x, hired directly, cannot be trained.
 *
 * Scenario: round 3, Restructuring. Ada holds a Night Shift Manager, a Kitchen Trainee and an
 * Errand Boy. Houses 2 and 18 want food and beer; with the night shift on, the two unsalaried cards
 * cover both orders.
 */
import type { Action, StructureSubmission } from '@fcm/engine';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { BASE_COURSE, BO, cash, continueAction, endTurn, kTown, ME, only, usd } from './shared.js';

const CHART: StructureSubmission = { ceoSubs: ['k5-ns', 'k5-kt', 'k5-eb'], managerSubs: {} };
const count = (ctx: StepCtx, type: 'foodProduced' | 'drinksBought') => ctx.events.filter((e) => e.type === type && e.player === ME).length;
const beer = (): Action => ({ type: 'work.buyDrinks', playerId: ME, cardUid: 'k5-eb', route: { mode: 'errand', drink: 'beer' } });

export const nightShiftLesson = defineLesson({
  id: 'ketchup.nightShift',
  course: 'ketchup',
  title: 'Night Shift Managers',
  minutes: 6,
  goal: 'Put a Night Shift Manager in a CEO slot and let your unsalaried cards act twice.',
  concepts: ['module_night_shift', 'night_shift_manager', 'salary', 'ceo_slots'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:nightShift'])
        .cash('p1', 20)
        .card('p1', 'ketchup:night_shift_manager', 'hand', 'k5-ns')
        .card('p1', 'kitchen_trainee', 'hand', 'k5-kt')
        .card('p1', 'errand_boy', 'hand', 'k5-eb')
        .demand(2, ['burger', 'beer'])
        .demand(18, ['pizza', 'beer'])
        .phase({ kind: 'restructuring' })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'A Night Shift Manager has no slots of its own. While it works, every card of yours without a salary acts twice.',
      show: [{ ui: 'hand-card-ketchup:night_shift_manager' }],
      onEnter: [{ openTab: 'company' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'night_shift_manager',
    },
    {
      id: 'structure',
      say: 'It may only sit in a CEO slot. Put it, the Kitchen Trainee and the Errand Boy in your three CEO slots, then submit.',
      show: [{ ui: 'org-ceo' }, { ui: 'submit-structure' }],
      allow: { actions: [only('restructure.submit', (a) => a.structure.ceoSubs.includes('k5-ns'))] },
      until: { view: (v) => v.phase.kind !== 'restructuring' },
      solution: [{ type: 'restructure.submit', playerId: ME, structure: CHART }],
      hint: { say: 'Tap a card in your hand, then an empty CEO slot. Submit when all three are placed.' },
      glossary: 'ceo_slots',
    },
    {
      id: 'order',
      say: 'Bo has 3 open slots to your 0, so he picks first. He takes position 2, which leaves you position 1.',
      show: [{ ui: 'order-pos-1' }, { ui: 'rail-p2' }],
      onEnter: [{ openTab: 'turn' }],
      script: [{ player: BO, action: { type: 'order.choosePosition', playerId: BO, position: 1 } }],
      until: { view: (v) => v.phase.kind === 'working' },
      solution: [],
    },
    {
      id: 'uses',
      say: 'Your Kitchen Trainee and Errand Boy now show 2 uses. The night shift itself takes no action.',
      show: [{ card: { player: ME, uid: 'k5-kt' } }, { card: { player: ME, uid: 'k5-eb' } }],
      until: { next: true },
      checkpoint: true,
    },
    {
      id: 'produce',
      say: 'House 2 wants a burger, house 18 a pizza. Make both with the Kitchen Trainee.',
      show: [{ card: { player: ME, uid: 'k5-kt' } }, { house: 2 }, { house: 18 }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k5-kt', 2)] },
      until: { test: (ctx) => count(ctx, 'foodProduced') >= 2 },
      solution: [
        { type: 'work.produce', playerId: ME, cardUid: 'k5-kt', food: 'burger' },
        { type: 'work.produce', playerId: ME, cardUid: 'k5-kt', food: 'pizza' },
      ],
      hint: { say: 'Tap the Kitchen Trainee, make a burger, then tap her again for a pizza.' },
    },
    {
      id: 'drinks',
      say: 'Both houses also want a beer. Fetch two with the Errand Boy.',
      show: [{ card: { player: ME, uid: 'k5-eb' } }],
      allow: { actions: [only('work.buyDrinks', (a) => a.cardUid === 'k5-eb', 2)] },
      until: { test: (ctx) => count(ctx, 'drinksBought') >= 2 },
      solution: [beer(), beer()],
      hint: { say: 'Tap the Errand Boy, fetch a beer, then tap him again for the second.' },
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
      say: 'Press Continue: two cards just filled two orders.',
      show: [{ ui: 'continue' }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => `Both houses ate at your restaurant: you have ${usd(cash(ctx.view))}.`,
    },
    {
      id: 'passive',
      say: 'Passive cards count twice too: a Waitress tips $6 and counts as two in ties, a Pricing Manager gives −$2.',
      until: { next: true },
      glossary: 'waitress',
    },
    {
      id: 'combine',
      say: 'Cards with a salary still act once. The manager costs $5, is 1x, is hired directly and cannot be trained.',
      until: { next: true },
      glossary: 'salary',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'Night Shift Manager at work: how many items does one Kitchen Trainee make this turn?', answer: 2, why: 'She has no salary, so she acts twice: 1 item each time.' },
      { kind: 'choice', q: 'A Burger Cook (salary) with the night shift on acts…', options: ['Once', 'Twice'], answer: 0, why: 'Only cards without a salary act twice.' },
      { kind: 'choice', q: 'Where may a Night Shift Manager sit?', options: ['In a CEO slot only', 'Under another manager', 'Anywhere'], answer: 0, why: 'It is a manager with 0 slots that reports to the CEO.' },
    ],
  },
});
