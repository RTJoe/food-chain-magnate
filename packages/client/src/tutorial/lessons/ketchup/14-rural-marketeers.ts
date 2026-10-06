/**
 * K14 — Rural Marketeers (docs/tutorial-plan.md §3, ketchup.md §12). A Rural Marketeer places a
 * giant billboard on a side of the rural area (eternal, no range, 2 tokens per pass, no cap). The
 * rural area eats last, reached only through freeways; "First Rural Marketeer Used" may place one.
 *
 * Scenario: round 4, Working, Ada's turn. The rural area already wants 2 burgers and Ada has 2 in
 * stock, but no freeway exists yet. Her Rural Marketeer places a giant billboard, the milestone
 * lets her open a freeway on her own tile, and the rural area eats at her restaurant.
 */
import type { Action } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, BO, continueAction, continueThroughPayday, endTurn, eventOf, kTown, ME, only, usd } from './shared.js';

const FREEWAY = { side: 'W', offset: 2 } as const;
const ruralDemand = (v: { board: { houses: Record<string, { kind: string; demand: unknown[] }> } }) => Object.values(v.board.houses).find((h) => h.kind === 'rural')?.demand.length ?? 0;

export const ruralMarketeersLesson = defineLesson({
  id: 'ketchup.ruralMarketeers',
  course: 'ketchup',
  title: 'Rural Marketeers',
  minutes: 7,
  goal: 'Place a giant billboard, open a freeway and feed the rural area.',
  concepts: ['module_rural_marketeers', 'rural_marketeer', 'rural_area', 'giant_billboard', 'freeway'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(4, ['ketchup:ruralMarketeers'])
        .cash('p1', 30)
        .card('p1', 'ketchup:rural_marketeer', 'work', 'k14-rm')
        .ruralArea()
        .inventory('p1', { burger: 2 })
        .demand(1000, ['burger', 'burger'])
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
      say: 'The rural area lies beside the board: one big house with no squares. It eats last, and only freeways reach it.',
      until: { next: true },
      checkpoint: true,
      glossary: 'rural_area',
    },
    {
      id: 'billboard',
      say: 'Tap your Rural Marketeer and place a giant billboard on the north side of the rural area, for burgers.',
      show: [{ card: { player: ME, uid: 'k14-rm' } }, { ui: 'good-burger' }],
      allow: { actions: [only('work.placeCampaign', (a) => a.campaignKind === 'giantBillboard' && a.goods[0] === 'burger')] },
      until: { event: 'choicePending', where: (e) => e.type === 'choicePending' && e.kind === 'freeway' },
      solution: [{ type: 'work.placeCampaign', playerId: ME, cardUid: 'k14-rm', campaignKind: 'giantBillboard', tileNumber: 21, goods: ['burger'], placement: { kind: 'rural', side: 'N' }, duration: 1 }],
      then: 'Giant billboards are always eternal: your marketeer is busy for the rest of the game.',
      hint: { say: 'Tap the Rural Marketeer, launch a campaign, pick burgers, then the north side.' },
      glossary: 'giant_billboard',
    },
    {
      id: 'freeway',
      say: 'First Rural Marketeer Used lets you open a freeway. Put it on the west edge, at the top road of your tile A1.',
      show: [{ cell: [0, 2] }, { tile: 'A1' }],
      allow: { actions: [only('ketchup:ruralMarketeers.placeFreeway', (a) => a.side === FREEWAY.side && a.offset === FREEWAY.offset)] },
      until: { event: 'entityPlaced', where: (e) => e.type === 'entityPlaced' && e.entity.kind === 'freeway' },
      solution: (ctx): Action[] => {
        const head = ctx.view.pending[0];
        return head?.kind === 'freeway' ? [{ type: 'ketchup:ruralMarketeers.placeFreeway', playerId: ME, choiceId: head.id, ...FREEWAY }] : [];
      },
      then: 'Deliveries to the rural area now count their borders from that road square: 0 from your door.',
      hint: { say: 'Press "Place a freeway", then pick "Freeway W edge, offset 2".', show: [{ cell: [0, 2] }] },
      glossary: 'freeway',
      checkpoint: true,
    },
    {
      id: 'end-turn',
      say: 'You already hold the 2 burgers the rural area wants. End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
    },
    {
      id: 'dinner',
      say: 'Press Continue. The rural area eats after every numbered house.',
      show: [{ ui: 'continue' }, { cell: [0, 2] }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const s = eventOf(ctx, 'sale', (e) => e.player === ME);
        if (!s) return 'Dinner is over.';
        const bonus = s.bonuses.reduce((a, b) => a + b.amount, 0);
        return `Your van left the board at the freeway: the rural area paid ${usd(s.total)}${bonus ? `, ${usd(bonus)} of it from First Burger Marketed` : ''}.`;
      },
      checkpoint: true,
    },
    {
      id: 'marketing',
      say: 'Continue to Marketing (confirm Payday if asked) and watch the giant billboard.',
      show: [{ ui: 'continue' }],
      allow: { actions: [only('tutorial.continue'), only('payday.confirm')] },
      until: { paused: 'marketing' },
      solution: continueThroughPayday,
      then: (ctx) => `The giant billboard put ${ruralDemand(ctx.view)} burgers on the rural area: 2 per pass, no cap, forever.`,
    },
    {
      id: 'combine',
      say: 'Like an apartment, the rural area takes 2 tokens per campaign run. It eats noodles and kimchi, never sushi.',
      until: { next: true },
      glossary: 'food_priority',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'How many demand tokens does a giant billboard put on the rural area each Marketing pass?', answer: 2, why: 'The rural area takes 2 tokens per campaign run, with no cap.' },
      { kind: 'choice', q: 'When does the rural area eat?', options: ['First', 'Last', 'By its number'], answer: 1, why: 'It eats after every numbered house and apartment.' },
      { kind: 'choice', q: 'No freeway is on the board. Who can sell to the rural area?', options: ['Nobody', 'The closest chain', 'Anyone'], answer: 0, why: 'Distance is counted from a freeway; without one nobody reaches it.' },
    ],
  },
});
