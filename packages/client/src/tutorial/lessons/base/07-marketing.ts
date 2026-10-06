/**
 * L7 — Marketing creates demand (docs/tutorial-plan.md §2, L7). A Marketing Trainee places a
 * billboard within road range 2; the Marketing phase (after Payday) runs campaigns in number order
 * and puts demand on the houses they reach; duration counters; the 3 / 5 demand cap.
 *
 * Scenario: round 3 Working, Ada's turn at the Campaigns step with a Marketing Trainee at work.
 * Bo already owns the First Billboard milestone (round 2): his billboard #13 beside house 5 is
 * eternal, so Ada's billboard runs on duration counters. Pauses after Marketing for the replay.
 */
import type { Action, GameView, Placement, PlayerId } from '@fcm/engine';
import { engine } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { pseudoState } from '../../../state/engine.js';

const B = town({ round: 3 });
const CEO = B.ceoUid('p1');
const MKT = 'p1-mkt';
const H5 = B.houseId(5);
const H18 = B.houseId(18);
const TOKEN = 14;

type CampaignPick = Extract<Placement, { kind: 'campaign' }>;

/** Houses a would-be billboard reaches (engine preview on the learner's view). */
function reaches(view: GameView, me: PlayerId, p: CampaignPick): string[] {
  try {
    const q = { kind: p.campaignKind, placement: p.placement, owner: me, goods: ['burger' as const], tileNumber: p.tileNumber };
    return engine.campaignReach(pseudoState(view, me), q).houses.map((h) => h.houseId);
  } catch {
    return [];
  }
}

/** The learner's billboard #14 for burgers, duration 2, touching house 18. */
const isTheBillboard = (a: Action, view: GameView): boolean =>
  a.type === 'work.placeCampaign' &&
  a.cardUid === MKT &&
  a.tileNumber === TOKEN &&
  a.duration === 2 &&
  a.goods.length === 1 &&
  a.goods[0] === 'burger' &&
  reaches(view, a.playerId, { kind: 'campaign', campaignKind: a.campaignKind, tileNumber: a.tileNumber, placement: a.placement, ...(a.from ? { from: a.from } : {}) }).includes(H18);

/** Canonical placement: the first legal #14 spot whose reach includes house 18. */
function placeBillboard(ctx: StepCtx): Action[] {
  const all = engine.legalPlacements(ctx.state(), ctx.me, { kind: 'campaign', cardUid: MKT, tileNumber: TOKEN }) as Placement[];
  const pick = all.find((p): p is CampaignPick => p.kind === 'campaign' && p.tileNumber === TOKEN && reaches(ctx.view, ctx.me, p).includes(H18));
  if (!pick) return [];
  return [{ type: 'work.placeCampaign', playerId: ctx.me, cardUid: MKT, campaignKind: pick.campaignKind, tileNumber: TOKEN, goods: ['burger'], placement: pick.placement, duration: 2, ...(pick.from ? { from: pick.from } : {}) }];
}

const adaCampaign = (v: GameView) => Object.values(v.board.campaigns).find((c) => c.owner === 'p1');
const demandOf = (v: GameView, id: string) => v.board.houses[id]?.demand.length ?? 0;

export const lesson07 = defineLesson({
  id: 'base.7',
  course: 'base',
  title: 'Marketing creates demand',
  minutes: 9,
  goal: 'Place a billboard in range and watch the Marketing phase make a house hungry.',
  concepts: ['marketing_trainee', 'billboard', 'range', 'marketing_phase', 'duration', 'demand_cap', 'busy_marketeer'],
  requires: ['base.6'],
  scenario: {
    build: () => {
      const b = town({ round: 3 })
        .reserve('p1', { kind: 'standard', amount: 200, ceoSlots: 3 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .cash('p1', 10)
        .cash('p2', 10)
        .card('p1', 'marketing_trainee', 'work', MKT)
        .card('p2', 'kitchen_trainee', 'work', 'p2-kt')
        .marketeerCampaign('marketing_trainee', 'p2-mkt', {
          owner: 'p2',
          kind: 'billboard',
          number: 13,
          goods: ['pizza'],
          placement: { kind: 'board', x: 6, y: 8, w: 3, h: 1 },
          remaining: 1,
          eternal: true,
          id: 'cmp-bo-13',
        })
        .milestone('p2', 'first_billboard', 2)
        .phase({ kind: 'working', player: 'p1', idx: 0 });
      return b.turn({ player: 'p1', stage: 'marketing', uses: { [CEO]: 0, [MKT]: 1 }, used: [CEO] }).build();
    },
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['marketing'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'why',
      say: 'Houses only eat when a campaign has made them hungry. Your Marketing Trainee can place a billboard campaign.',
      show: [{ ui: `work-card-${MKT}` }],
      until: { next: true },
      onEnter: [{ openTab: 'turn' }],
      checkpoint: true,
      glossary: 'marketing_trainee',
    },
    {
      id: 'token',
      say: 'Tap your Marketing Trainee, choose Launch a campaign, then billboard #14 (the small 2×1).',
      show: [{ ui: `work-card-${MKT}` }, { ui: 'token-14' }],
      allow: { ui: [`work-card-${MKT}`, 'launch-campaign', 'token-14'] },
      until: { signal: 'uiTap', equals: 'token-14' },
      solution: [{ tap: { ui: `work-card-${MKT}` } }, { tap: { ui: 'launch-campaign' } }, { tap: { ui: 'token-14' } }],
      hint: { say: 'Tap the Marketing Trainee card, then Launch a campaign, then the #14 token.', show: [{ ui: `work-card-${MKT}` }, { ui: 'token-14' }] },
      glossary: 'billboard',
    },
    {
      id: 'good',
      say: 'Pick burgers as the food to advertise, and keep the duration at 2: two Marketing phases.',
      show: [{ ui: 'good-burger' }, { ui: 'duration' }],
      allow: { ui: ['good-burger', 'duration'] },
      until: { any: [{ signal: 'previewGood', equals: 'burger' }, { signal: 'uiTap', equals: 'good-burger' }] },
      solution: [{ tap: { ui: 'good-burger' } }],
      hint: { say: 'Tap the burger chip in the Turn panel.', show: [{ ui: 'good-burger' }] },
      glossary: 'duration',
    },
    {
      id: 'range',
      say: 'The tinted roads are in range: up to 2 tile borders from your door. Your billboard must stand beside one of them.',
      show: [{ tile: 'A1' }, { tile: 'A2' }, { seam: ['A1', 'A2'] }],
      until: { next: true },
      glossary: 'range',
    },
    {
      id: 'place',
      say: 'Tap a spot on tile A2 touching house 18, then press Place. The ring shows the houses it will reach.',
      show: [{ house: 18 }, { ui: 'pick-strip' }],
      allow: { actions: [{ type: 'work.placeCampaign', where: isTheBillboard }] },
      until: { event: 'campaignPlaced', where: (e) => e.type === 'campaignPlaced' && e.player === 'p1' },
      solution: placeBillboard,
      then: 'Placed. Your trainee is now busy on the board, not in your chart, until the billboard runs out.',
      hint: { say: 'Point just below house 18 until the ring lands on it, tap, then Place. R or Rotate turns the billboard.', show: [{ house: 18 }] },
      checkpoint: true,
      glossary: 'busy_marketeer',
    },
    {
      id: 'end-turn',
      say: 'End your turn. Dinner and Payday come first and pass quietly; then the Marketing phase runs.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [
        { player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } },
        { player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } },
      ],
      until: { paused: 'marketing' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
      hint: { say: 'Tap End turn.', show: [{ ui: 'end-turn' }] },
      onEnter: [{ follow: true }],
    },
    {
      id: 'replay',
      say: 'Watch again. Campaigns run in number order: Bo’s #13 first, then your #14.',
      show: [{ campaign: 'cmp-bo-13' }],
      replay: { phase: 'marketing' },
      until: { next: true },
      onEnter: [{ summary: 'open' }],
      checkpoint: true,
      glossary: 'marketing_phase',
    },
    {
      id: 'results',
      say: (ctx) => `Bo’s billboard gave house 5 a pizza (${demandOf(ctx.view, H5)} now). Yours gave house 18 a burger (${demandOf(ctx.view, H18)} now).`,
      show: [{ house: 5 }, { house: 18 }],
      until: { next: true },
    },
    {
      id: 'duration',
      say: (ctx) => {
        const c = adaCampaign(ctx.view);
        const left = c?.remaining ?? 1;
        return c?.eternal
          ? 'Your billboard is eternal, so it never runs out. Bo’s is eternal too: he was first to place a billboard, a milestone.'
          : `Each run uses one duration counter: your billboard has ${left} left. Bo’s never runs out: he was first to place a billboard, a milestone.`;
      },
      show: [{ house: 18 }],
      until: { next: true },
      onEnter: [{ summary: 'close' }],
      glossary: 'eternal_campaign',
    },
    {
      id: 'cap',
      say: 'A house holds at most 3 demand tokens, or 5 with a garden. When it is full, a campaign adds nothing.',
      show: [{ house: 18 }],
      until: { next: true },
      onEnter: [{ select: { kind: 'house', id: H18 } }],
      glossary: 'demand_cap',
    },
    {
      id: 'next-dinner',
      say: 'Next dinner house 18 wants a burger, and you have none. A Kitchen Trainee at work next round would fix that.',
      show: [{ house: 18 }],
      until: { next: true },
      onEnter: [{ select: null }],
      nextLabel: 'Finish',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'How far from your door can a Marketing Trainee’s billboard stand?', options: ['1 tile border', '2 tile borders', 'Anywhere'], answer: 1, why: 'A Marketing Trainee has road range 2.' },
      { kind: 'choice', q: 'When do campaigns add demand to houses?', options: ['During your turn', 'In the Marketing phase, after Payday', 'At dinner'], answer: 1, why: 'Campaigns run in the Marketing phase, after Dinnertime and Payday.' },
      { kind: 'tap', q: 'Tap the house your billboard made hungry.', target: { house: 18 }, why: 'Your billboard touches house 18 and gave it a burger.' },
    ],
  },
});

