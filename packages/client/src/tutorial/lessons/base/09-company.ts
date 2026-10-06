/**
 * L9 — Building a company (docs/tutorial-plan.md §2, L9; §1.4 "Org chart", "Training vs hiring",
 * "Simultaneous restructuring"). Managers add slots; managers only report to the CEO; cards left in
 * hand go to the beach, where a Trainer can train them; Bo overfills his chart and loses everyone
 * but his CEO; open slots decide who picks turn order first.
 *
 * Scenario: round 4 Restructuring. Ada's hand: Management Trainee, Trainer, Errand Boy, Waitress,
 * Kitchen Trainee. Bo (scripted) puts all five of his cards under his CEO (3 slots): the overfill
 * penalty. Bo then picks turn order first and, with only his CEO, hires an Errand Boy.
 */
import type { Action, LegalAction, StructureSubmission } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { claimed, openSlots, openSlotsOf } from './late.js';

const MT = 'p1-mt';
const TR = 'p1-tr';
const EB = 'p1-eb';
const WA = 'p1-wa';
const KT = 'p1-kt';
const BO_CARDS = ['p2-kt', 'p2-wa', 'p2-eb', 'p2-mk', 'p2-rg'];
const ADA_CEO = 'card-1';

const ADA_STRUCTURE: StructureSubmission = { ceoSubs: [MT, TR], managerSubs: { [MT]: [WA, KT] } };

const draftOf = (ctx: StepCtx) => ctx.signals.draft;
const has = (list: readonly string[] | undefined, ...uids: string[]) => uids.every((u) => list?.includes(u));

/** The draft holds the structure in the order the lesson builds it (any slot order). */
const sameStructure = (a: StructureSubmission, b: StructureSubmission) =>
  a.ceoSubs.length === b.ceoSubs.length && has(a.ceoSubs, ...b.ceoSubs) && Object.keys(b.managerSubs).every((m) => (a.managerSubs[m]?.length ?? 0) === (b.managerSubs[m]?.length ?? 0) && has(a.managerSubs[m], ...(b.managerSubs[m] ?? []))) && Object.values(a.managerSubs).flat().length === Object.values(b.managerSubs).flat().length;

const ready = (legal: LegalAction[], pred: (a: Action) => boolean): Action | null => {
  for (const l of legal) if (l.kind === 'ready' && pred(l.action)) return l.action;
  return null;
};

export const lesson09 = defineLesson({
  id: 'base.9',
  course: 'base',
  title: 'Building a company',
  minutes: 10,
  goal: 'Managers and slots, training on the beach, the overfill penalty and the simultaneous reveal.',
  concepts: ['manager', 'slots', 'management_trainee', 'trainer', 'career_path', 'train', 'overfill', 'simultaneous_reveal', 'one_x'],
  scenario: {
    build: () => {
      const b = town({ round: 4 })
        .card('p1', 'management_trainee', 'hand', MT)
        .card('p1', 'trainer', 'hand', TR)
        .card('p1', 'errand_boy', 'hand', EB)
        .card('p1', 'waitress', 'hand', WA)
        .card('p1', 'kitchen_trainee', 'hand', KT)
        .card('p2', 'kitchen_trainee', 'hand', 'p2-kt')
        .card('p2', 'waitress', 'hand', 'p2-wa')
        .card('p2', 'errand_boy', 'hand', 'p2-eb')
        .card('p2', 'marketing_trainee', 'hand', 'p2-mk')
        .card('p2', 'recruiting_girl', 'hand', 'p2-rg')
        .cash('p1', 25)
        .cash('p2', 25)
        .phase({ kind: 'restructuring' });
      return b.build();
    },
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['restructuring', 'working'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'manager-slots',
      say: 'Five cards, three CEO slots. A manager adds slots: put the Management Trainee in a CEO slot (drag, or tap her then the slot).',
      show: [{ ui: 'hand-card-management_trainee' }, { ui: 'org-slot-1' }],
      allow: { ui: ['org'] },
      until: { test: (ctx) => Boolean(draftOf(ctx)?.ceoSubs.includes(MT)) },
      solution: [{ tap: { ui: 'hand-card-management_trainee' } }, { tap: { ui: 'org-slot-1' } }],
      then: 'Two new slots appeared under her: a manager turns one slot into two.',
      hint: { say: 'Tap the Management Trainee in your hand, then the first dashed CEO slot.', show: [{ ui: 'hand-card-management_trainee' }] },
      checkpoint: true,
      glossary: 'manager',
    },
    {
      id: 'fill-manager',
      say: 'Managers report only to the CEO and hold only non-managers. Put the Waitress and the Kitchen Trainee under the trainee.',
      show: [{ ui: 'hand-card-waitress' }, { ui: 'hand-card-kitchen_trainee' }, { ui: `org-mslot-${MT}-1` }],
      allow: { ui: ['org'] },
      until: { test: (ctx) => has(draftOf(ctx)?.managerSubs[MT], WA, KT) },
      solution: [{ tap: { ui: 'hand-card-waitress' } }, { tap: { ui: `org-mslot-${MT}-1` } }, { tap: { ui: 'hand-card-kitchen_trainee' } }, { tap: { ui: `org-mslot-${MT}-1` } }],
      hint: { say: 'Tap the Waitress, then a slot under the trainee. Same for the Kitchen Trainee.', show: [{ ui: `org-mslot-${MT}-1` }] },
      glossary: 'slots',
    },
    {
      id: 'trainer-slot',
      say: 'Put the Trainer in a CEO slot. Leave the Errand Boy in your hand: he goes to the beach, where he can be trained.',
      show: [{ ui: 'hand-card-trainer' }, { ui: 'org-slot-2' }, { ui: 'hand-card-errand_boy' }],
      allow: { ui: ['org'] },
      until: {
        test: (ctx) => {
          const d = draftOf(ctx);
          return Boolean(d && d.ceoSubs.includes(TR) && ![...d.ceoSubs, ...Object.values(d.managerSubs).flat()].includes(EB));
        },
      },
      solution: [{ tap: { ui: 'hand-card-trainer' } }, { tap: { ui: 'org-slot-2' } }],
      then: (ctx) => {
        const d = draftOf(ctx);
        const p = ctx.view.players.p1;
        return d && p ? `Open slots: ${openSlotsOf(ctx.view, p, d)}. The editor counts them as you go.` : 'Your chart is ready.';
      },
      hint: { say: 'Tap the Trainer, then the dashed CEO slot next to the trainee.', show: [{ ui: 'hand-card-trainer' }] },
      glossary: 'beach',
    },
    {
      id: 'submit',
      say: 'Bo has already locked his chart in, but nobody sees a chart until everyone has submitted. Submit yours.',
      show: [{ ui: 'submit-structure' }, { ui: 'rail-p2' }],
      allow: { actions: [{ type: 'restructure.submit', where: (a) => a.type === 'restructure.submit' && sameStructure(a.structure, ADA_STRUCTURE) }] },
      script: [{ player: 'p2', action: { type: 'restructure.submit', playerId: 'p2', structure: { ceoSubs: BO_CARDS, managerSubs: {} } } }],
      until: { paused: 'restructuring' },
      solution: [{ type: 'restructure.submit', playerId: 'p1', structure: ADA_STRUCTURE }],
      then: 'Both charts are revealed at the same moment.',
      hint: { say: 'Press "Submit structure" under your chart.', show: [{ ui: 'submit-structure' }] },
      checkpoint: true,
      glossary: 'simultaneous_reveal',
    },
    {
      id: 'overfill',
      say: (ctx) => {
        const n = ctx.view.players.p2?.beach.length ?? 0;
        return `Bo put 5 cards under a CEO with ${ctx.view.ceoSlots} slots: too many. All ${n} of them went to the beach; Bo works this round with his CEO alone.`;
      },
      show: [{ ui: 'rail-p2' }, { restaurant: 'p2' }],
      until: { next: true },
      glossary: 'overfill',
    },
    {
      id: 'open-slots',
      say: (ctx) => `Open slots decide who picks turn order first: you have ${openSlots(ctx.view, 'p1')}, Bo has ${openSlots(ctx.view, 'p2')}. Press Continue: Bo chooses first.`,
      show: [{ ui: 'continue' }, { ui: 'rail-p2' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      script: [
        { player: 'p2', action: { type: 'order.choosePosition', playerId: 'p2', position: 0 } },
        { player: 'p2', action: (_v, legal) => ready(legal, (a) => a.type === 'work.recruit' && a.employeeId === 'errand_boy') ?? { type: 'work.endTurn', playerId: 'p2' } },
        { player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } },
      ],
      until: { view: (v) => v.phase.kind === 'working' && v.turn?.player === 'p1' },
      solution: (ctx) => {
        const head = ctx.view.pending[0];
        return head?.kind === 'continue' ? [{ type: 'tutorial.continue', playerId: ctx.me, choiceId: head.id }] : [];
      },
      glossary: 'open_slots',
    },
    {
      id: 'order',
      say: (ctx) => `Bo took position 1, so position 2 was left for you. Bo worked first: his CEO hired an Errand Boy (${ctx.view.supply.errand_boy ?? 0} left in the pile).`,
      show: [{ ui: 'rail-p2' }],
      until: { next: true },
      glossary: 'turn_order',
    },
    {
      id: 'hire',
      say: 'Your turn. Hiring comes before training: tap your CEO and hire a Marketing Trainee.',
      show: [{ ui: `work-card-${ADA_CEO}` }, { ui: 'hire-marketing_trainee' }],
      allow: { actions: [{ type: 'work.recruit', where: (a) => a.type === 'work.recruit' && a.cardUid === ADA_CEO && a.employeeId === 'marketing_trainee' }] },
      until: { event: 'employeeHired', where: (e) => e.type === 'employeeHired' && e.player === 'p1' },
      solution: [{ type: 'work.recruit', playerId: 'p1', cardUid: ADA_CEO, employeeId: 'marketing_trainee' }],
      then: 'She goes to the beach: she works from next round, but beach cards can be trained right away.',
      hint: { say: 'Tap your CEO card in the Turn panel, then the Marketing Trainee.', show: [{ ui: `work-card-${ADA_CEO}` }] },
      glossary: 'hire',
    },
    {
      id: 'train',
      say: 'Training moves a beach card one step along its career line. Tap the Trainer, then the Errand Boy, and make him a Cart Operator.',
      show: [{ ui: `work-card-${TR}` }, { ui: `train-target-${EB}` }, { ui: 'train-cart_operator' }],
      allow: { actions: [{ type: 'work.train', where: (a) => a.type === 'work.train' && a.trainerUid === TR && a.targetUid === EB && a.toEmployeeId === 'cart_operator' }] },
      until: { event: 'employeeTrained', where: (e) => e.type === 'employeeTrained' && e.player === 'p1' },
      solution: [{ type: 'work.train', playerId: 'p1', trainerUid: TR, targetUid: EB, toEmployeeId: 'cart_operator' }],
      then: (ctx) => `The Errand Boy went back to the pile and a Cart Operator came out (${ctx.view.supply.cart_operator ?? 0} left).${claimed(ctx.events, 'p1', 'first_train') ? ' Training first also claimed First to Train: $15 off every Payday.' : ''}`,
      hint: { say: 'Tap the Trainer card, the Errand Boy, then "Cart Operator".', show: [{ ui: `work-card-${TR}` }] },
      checkpoint: true,
      glossary: 'train',
    },
    {
      id: 'only-beach',
      say: 'The Trainer offered your two beach cards, not the Waitress or the Kitchen Trainee: the Waitress has no career line, and only beach cards train.',
      show: [{ card: { player: 'p1', uid: WA } }, { card: { player: 'p1', uid: KT } }],
      until: { next: true },
      glossary: 'career_path',
    },
    {
      id: 'one-x',
      say: 'Some cards are 1x: you may own only one copy. Open the Staff tab and look for the 1x mark.',
      show: [{ ui: 'tab-market' }],
      allow: { ui: ['tab-market'] },
      until: { signal: 'dockTab', equals: 'market' },
      solution: [{ tap: { ui: 'tab-market' } }],
      then: 'Chefs, the CFO and the top managers are 1x. The pile counts show how many are left.',
      hint: { say: 'The Staff tab is in the dock, next to Company.', show: [{ ui: 'tab-market' }] },
      glossary: 'one_x',
    },
    {
      id: 'end-turn',
      say: 'Nothing left to do this turn. End it.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      until: { paused: 'working' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
      onEnter: [{ openTab: 'turn' }],
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'How many slots does a Management Trainee have?', answer: 2, why: 'Management Trainee: 2 slots. A Junior VP has 3, a VP 4.' },
      { kind: 'choice', q: 'Which cards can a Trainer train?', options: ['Any card', 'Only cards on the beach', 'Only cards at work'], answer: 1, why: 'Training happens on the beach, including cards hired this turn.' },
      { kind: 'tap', q: 'Tap the restaurant of the chain that overfilled its chart.', target: { restaurant: 'p2' }, why: "Bo put 5 cards into 3 slots, so everyone but his CEO went to the beach." },
    ],
  },
});
