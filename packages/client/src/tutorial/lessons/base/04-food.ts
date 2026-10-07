/**
 * L4 — Making food (docs/tutorial-plan.md §2, L4). Put a card to work, skip an optional action,
 * produce, see the stock; Dinnertime with no demand; Clean up throws unsold food away.
 *
 * Scenario: round 2 Restructuring. Ada and Bo each own a CEO and a Kitchen Trainee (in hand).
 * Bo (scripted) puts his trainee to work and makes a pizza. Pauses after Dinnertime and Clean up.
 */
import type { GameView } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type Predicate } from '../../dsl.js';
import { continueAction } from '../dev/demo.js';

const B = town({ round: 2 });
const CEO = B.ceoUid('p1');
const KT = 'p1-kt';
const BO_KT = 'p2-kt';

/** The learner's trainee is in a CEO slot of the chart being edited, or the chart is already in. */
/** Uids of a player's cards of one kind. */
const uidsOf = (v: GameView, p: string, id: string) => Object.values(v.players[p]?.employees ?? {}).filter((e) => e.employeeId === id).map((e) => e.uid);

const traineePlaced: Predicate = {
  any: [{ signal: 'draft', match: (d) => Boolean((d as { ceoSubs?: string[] } | null)?.ceoSubs?.includes(KT)) }, { view: (v) => Boolean(v.submitted.p1) || v.phase.kind !== 'restructuring' }],
};

export const lesson04 = defineLesson({
  id: 'base.4',
  course: 'base',
  title: 'Making food',
  minutes: 6,
  goal: 'Put a card to work, make food, and see what happens to food nobody buys.',
  concepts: ['hand', 'at_work', 'kitchen_trainee', 'stock', 'cleanup'],
  requires: ['base.3'],
  scenario: {
    build: () =>
      town({ round: 2 })
        .reserve('p1', { kind: 'standard', amount: 200, ceoSlots: 3 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .card('p1', 'kitchen_trainee', 'hand', KT)
        .card('p2', 'kitchen_trainee', 'hand', BO_KT)
        .phase({ kind: 'restructuring' })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['dinnertime', 'cleanup'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'hand',
      say: 'Round 2. Cards you put under your CEO work today; cards left in your hand go to the beach.',
      show: [{ ui: 'org-hand' }, { ui: 'org-ceo' }],
      until: { next: true },
      onEnter: [{ openTab: 'company' }],
      checkpoint: true,
      glossary: 'hand',
    },
    {
      id: 'place-trainee',
      say: 'Tap your Kitchen Trainee, then the empty slot under the CEO.',
      show: [{ ui: 'hand-card-kitchen_trainee' }, { ui: 'org-slot-1' }],
      allow: { actions: [{ type: 'restructure.submit', where: (a) => a.type === 'restructure.submit' && a.structure.ceoSubs.includes(KT) }] },
      until: traineePlaced,
      solution: [{ tap: { ui: 'hand-card-kitchen_trainee' } }, { tap: { ui: 'org-slot-1' } }],
      hint: { say: 'Tap the Kitchen Trainee card in your hand, then a dashed slot under the CEO.', show: [{ ui: 'hand-card-kitchen_trainee' }, { ui: 'org-slot-1' }] },
      glossary: 'at_work',
    },
    {
      id: 'submit',
      say: 'Press Submit. Bo is choosing his chart at the same time, in secret.',
      show: [{ ui: 'submit-structure' }],
      allow: { actions: [{ type: 'restructure.submit', where: (a) => a.type === 'restructure.submit' && a.structure.ceoSubs.includes(KT) }] },
      script: [{ player: 'p2', action: { type: 'restructure.submit', playerId: 'p2', structure: { ceoSubs: [BO_KT], managerSubs: {} } } }],
      until: { view: (v) => v.phase.kind !== 'restructuring' },
      solution: [{ type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [KT], managerSubs: {} } }],
      then: 'Revealed together: Bo also put his Kitchen Trainee to work.',
      hint: { say: 'Tap Submit under your chart.', show: [{ ui: 'submit-structure' }] },
    },
    {
      id: 'order',
      say: 'You both kept 2 slots empty, a tie, so last round’s order stands and you choose first. Take position 1.',
      show: [{ ui: 'order-pos-1' }],
      allow: { actions: [{ type: 'order.choosePosition', where: (a) => a.type === 'order.choosePosition' && a.position === 0 }] },
      until: { view: (v) => v.phase.kind === 'working' },
      solution: [{ type: 'order.choosePosition', playerId: 'p1', position: 0 }],
      hint: { say: 'In the Turn panel, tap position 1.', show: [{ ui: 'order-pos-1' }] },
      onEnter: [{ openTab: 'turn' }],
      checkpoint: true,
    },
    {
      id: 'optional',
      say: 'Your CEO could hire again, but every Working action is optional. This round, leave the CEO alone.',
      show: [{ ui: `work-card-${CEO}` }],
      until: { next: true },
      glossary: 'working',
    },
    {
      id: 'produce',
      say: 'Tap the Kitchen Trainee and make a burger.',
      show: [{ ui: `work-card-${KT}` }, { ui: 'produce-burger' }],
      allow: { actions: [{ type: 'work.produce', where: (a) => a.type === 'work.produce' && a.cardUid === KT && a.food === 'burger' }] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === 'p1' },
      solution: [{ type: 'work.produce', playerId: 'p1', cardUid: KT, food: 'burger' }],
      then: 'One burger in your stock. The first burger of the game also wins a milestone: a free Burger Cook, now on your beach.',
      hint: { say: 'Tap the Kitchen Trainee card, then “Cook with Kitchen Trainee” and the burger.', show: [{ ui: `work-card-${KT}` }] },
      glossary: 'stock',
    },
    {
      id: 'end-turn',
      say: 'End your turn. It asks first because your CEO could still hire: press End turn again.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [
        { player: 'p2', action: { type: 'work.produce', playerId: 'p2', cardUid: BO_KT, food: 'pizza' } },
        { player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } },
      ],
      until: { paused: 'dinnertime' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
      then: 'Bo made a pizza. Then Dinnertime ran.',
      hint: { say: 'Tap End turn, then End turn again in the box that asks.', show: [{ ui: 'end-turn' }] },
    },
    {
      id: 'no-dinner',
      say: 'Dinnertime came and went. No house has demand yet, so nobody bought anything.',
      show: [{ house: 2 }, { house: 18 }],
      until: { next: true },
      checkpoint: true,
      glossary: 'dinnertime',
    },
    {
      id: 'run-payday',
      say: 'Press Continue: Payday comes next.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { view: (v) => v.phase.kind === 'payday' },
      solution: continueAction,
    },
    {
      id: 'payday',
      say: 'Payday: your Burger Cook earns $5 a round and you have $0, so he must go. Tap him, then the Fire and pay button.',
      show: [{ card: { player: 'p1', employeeId: 'burger_cook' } }, { ui: 'payday-confirm' }],
      allow: { actions: [{ type: 'payday.fire' }, { type: 'payday.confirm' }] },
      script: [
        { player: 'p2', action: (v) => ({ type: 'payday.fire', playerId: 'p2', uids: uidsOf(v, 'p2', 'pizza_cook') }) },
        { player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } },
      ],
      until: { paused: 'cleanup' },
      // Fire the cook (the forced choice), then pay; the UI does both in one tap ("Fire 1 and pay $0").
      repeatSolution: true,
      solution: (ctx) => {
        const cook = uidsOf(ctx.view, 'p1', 'burger_cook');
        if (cook.length) return [{ type: 'payday.fire', playerId: 'p1', uids: cook }];
        return ctx.view.awaiting.players.includes('p1') ? [{ type: 'payday.confirm', playerId: 'p1' }] : [];
      },
      then: 'Fired cards go back to the supply. Bo could not pay his free Pizza Cook either.',
      hint: { say: 'Tap the Burger Cook card in the Turn panel, then “Fire 1 and pay $0”.', show: [{ ui: 'payday-confirm' }] },
      glossary: 'salary',
    },
    {
      id: 'thrown-away',
      say: (ctx) =>
        ctx.view.milestones.first_throw_away?.claimedBy.includes('p1')
          ? 'Clean up threw your burger away, and being first to throw food away won a milestone: a freezer. From the next Clean up it keeps up to 10 unsold items.'
          : 'Clean up throws unsold food away unless you own a freezer. Make food in the round you can sell it.',
      show: [{ ui: 'rail-p1' }],
      until: { next: true },
      glossary: 'freezer',
      nextLabel: 'Finish',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'What happens to unsold food at Clean up?', options: ['It keeps for next round', 'It is thrown away', 'It sells at half price'], answer: 1, why: 'Without a freezer, every unsold item is discarded at Clean up.' },
      { kind: 'choice', q: 'Must a card at work use its action?', options: ['Yes, always', 'No, it can skip'], answer: 1, why: 'Working actions are optional: you left your CEO’s hire unused.' },
      { kind: 'tap', q: 'Tap the tab where you choose who goes to work.', target: { ui: 'tab-company' }, why: 'The Company tab holds your chart: cards under the CEO work that round.' },
    ],
  },
});
