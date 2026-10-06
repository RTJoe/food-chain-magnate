/**
 * K13 — Gourmet Food Critics (docs/tutorial-plan.md §3, ketchup.md §13). Trained from a Marketing
 * Trainee; places a gourmet guide beside the board (no range, 1–3 turns, one good). Each Marketing
 * run puts 1 demand on every house with a garden (not apartments, park-only houses or the rural
 * area); normal caps.
 *
 * Scenario: round 3, Working, Ada's turn. Houses 18 and 5 have gardens; her Gourmet Food Critic is
 * at work. One guide reaches both houses, far apart, at once.
 */
import type { GameView } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, continueThroughPayday, endTurn, kTown, ME, only } from './shared.js';

const demandOf = (v: GameView, n: number) => {
  const id = houseByNumber(v, n);
  return id ? (v.board.houses[id]?.demand.length ?? 0) : 0;
};

export const gourmetCriticsLesson = defineLesson({
  id: 'ketchup.gourmetCritics',
  course: 'ketchup',
  title: 'Gourmet Food Critics',
  minutes: 4,
  goal: 'Place a gourmet guide and watch it market to every garden house at once.',
  concepts: ['module_gourmet_critics', 'gourmet_food_critic', 'gourmet_guide', 'garden'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:gourmetCritics'])
        .cash('p1', 30)
        .card('p1', 'ketchup:gourmet_food_critic', 'work', 'k13-gc')
        .garden(18, 'S')
        .garden(5, 'S')
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'marketing'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'A Gourmet Food Critic places a guide beside the board. It markets to every house with a garden, however far away.',
      show: [{ card: { player: ME, uid: 'k13-gc' } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'gourmet_food_critic',
    },
    {
      id: 'gardens',
      say: 'Two houses here have gardens: 18 near you and 5 near Bo.',
      show: [{ house: 18 }, { house: 5 }],
      until: { next: true },
      glossary: 'garden',
    },
    {
      id: 'guide',
      say: 'Tap the critic and place gourmet guide #17 for pizza, 3 turns. There is no spot to choose: it stands beside the board.',
      show: [{ card: { player: ME, uid: 'k13-gc' } }, { ui: 'good-pizza' }],
      allow: { actions: [only('work.placeCampaign', (a) => a.campaignKind === 'gourmetGuide' && a.goods[0] === 'pizza')] },
      until: { event: 'campaignPlaced', where: (e) => e.type === 'campaignPlaced' && e.player === ME },
      solution: [{ type: 'work.placeCampaign', playerId: ME, cardUid: 'k13-gc', campaignKind: 'gourmetGuide', tileNumber: 17, goods: ['pizza'], placement: { kind: 'offBoard' }, duration: 3 }],
      hint: { say: 'Tap the critic, launch a campaign, pick pizza, then place the guide.' },
      glossary: 'gourmet_guide',
      checkpoint: true,
    },
    {
      id: 'end-turn',
      say: 'End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
    },
    {
      id: 'marketing',
      say: 'Press Continue (confirm Payday if asked) and watch both garden houses at Marketing.',
      show: [{ ui: 'continue' }, { house: 18 }, { house: 5 }],
      allow: { actions: [only('tutorial.continue'), only('payday.confirm')] },
      until: { paused: 'marketing' },
      solution: continueThroughPayday,
      then: (ctx) => `One run of the guide: house 18 wants ${demandOf(ctx.view, 18)} pizza, house 5 wants ${demandOf(ctx.view, 5)}.`,
      checkpoint: true,
    },
    {
      id: 'not',
      say: 'Apartments, park-only houses and the rural area get nothing from a guide. Garden houses still stop at 5 tokens.',
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'Guides run after the numbered campaigns. With Sushi in play, those garden houses may eat sushi instead.',
      until: { next: true },
      glossary: 'sushi',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Which houses does a gourmet guide market to?', options: ['Every house with a garden', 'Houses within 2 borders', 'Every house'], answer: 0, why: 'One token on every garden house, no range.' },
      { kind: 'tap', q: 'Tap the garden house near Bo that your guide reached.', target: { house: 5 }, why: 'House 5 has a garden, so the guide reached it with no range limit.' },
      { kind: 'choice', q: 'Does an apartment get demand from a guide?', options: ['Yes, 2 tokens', 'No'], answer: 1, why: 'Apartments never have gardens, so guides skip them.' },
    ],
  },
});
