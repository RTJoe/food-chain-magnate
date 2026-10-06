/**
 * K12 — Mass Marketeers (docs/tutorial-plan.md §3, ketchup.md §10). Trained from a Marketing
 * Trainee; places no campaign. Each Mass Marketeer at work (all players) adds one full extra
 * Marketing pass; duration pips come off once, after the last pass; demand caps still apply.
 *
 * Scenario: round 4, Working, Ada's turn. A Mass Marketeer and a Trainer are at work, a Marketing
 * Trainee waits on the beach, and Ada's billboard #14 already touches house 18 (2 of 3 burgers).
 */
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, continueThroughPayday, endTurn, kTown, ME, only } from './shared.js';

const CAMPAIGN = 'k12-bb14';

export const massMarketeersLesson = defineLesson({
  id: 'ketchup.massMarketeers',
  course: 'ketchup',
  title: 'Mass Marketeers',
  minutes: 5,
  goal: 'Train a Mass Marketeer and watch Marketing run twice, with one pip removed.',
  concepts: ['module_mass_marketeers', 'mass_marketeer', 'marketing_phase', 'demand_cap'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(4, ['ketchup:massMarketeers'])
        .cash('p1', 40)
        .card('p1', 'ketchup:mass_marketeer', 'work', 'k12-mm')
        .card('p1', 'trainer', 'work', 'k12-tr')
        .card('p1', 'marketing_trainee', 'beach', 'k12-mt')
        .marketeerCampaign('marketing_trainee', 'k12-bmt', {
          owner: 'p1',
          kind: 'billboard',
          number: 14,
          goods: ['burger'],
          placement: { kind: 'board', x: 1, y: 6, w: 1, h: 2 },
          remaining: 2,
          id: CAMPAIGN,
        })
        .demand(18, ['burger', 'burger'], 'p1', CAMPAIGN)
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
      say: 'A Mass Marketeer places no campaign. Each one at work, yours or anyone’s, adds a whole extra Marketing pass.',
      show: [{ card: { player: ME, uid: 'k12-mm' } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'mass_marketeer',
    },
    {
      id: 'train',
      say: 'It trains from a Marketing Trainee. Tap your Trainer and train the one on the beach into a Mass Marketeer.',
      show: [{ card: { player: ME, uid: 'k12-tr' } }, { ui: 'train-ketchup:mass_marketeer' }],
      allow: { actions: [only('work.train', (a) => a.targetUid === 'k12-mt' && a.toEmployeeId === 'ketchup:mass_marketeer')] },
      until: { event: 'employeeTrained', where: (e) => e.type === 'employeeTrained' && e.player === ME && e.to === 'ketchup:mass_marketeer' },
      solution: [{ type: 'work.train', playerId: ME, trainerUid: 'k12-tr', targetUid: 'k12-mt', toEmployeeId: 'ketchup:mass_marketeer' }],
      then: 'Next round two of them work: three passes.',
      hint: { say: 'Tap the Trainer card, then the Mass Marketeer option.' },
    },
    {
      id: 'billboard',
      say: (ctx) => {
        const id = houseByNumber(ctx.view, 18);
        const n = id ? (ctx.view.board.houses[id]?.demand.length ?? 0) : 0;
        return `Your billboard adds 1 burger to house 18 per pass. The house holds ${n} of 3 already.`;
      },
      show: [{ campaign: CAMPAIGN }, { house: 18 }],
      until: { next: true },
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
      id: 'marketing',
      say: 'Press Continue (confirm Payday if asked) and watch Marketing run twice.',
      show: [{ ui: 'continue' }, { house: 18 }],
      allow: { actions: [only('tutorial.continue'), only('payday.confirm')] },
      until: { paused: 'marketing' },
      solution: continueThroughPayday,
      then: (ctx) => {
        const runs = ctx.events.filter((e) => e.type === 'campaignRan' && e.campaignId === CAMPAIGN);
        const full = runs.filter((e) => e.type === 'campaignRan' && (e.full?.length ?? 0) > 0).length;
        return `${runs.length} passes: the first filled house 18 to 3, ${full ? 'the second found it full' : 'the second added more'}.`;
      },
    },
    {
      id: 'pips',
      say: (ctx) => `Pips come off once, after the last pass: your billboard has ${ctx.view.board.campaigns[CAMPAIGN]?.remaining ?? 0} turn left, not 0.`,
      show: [{ campaign: CAMPAIGN }],
      until: { next: true },
      checkpoint: true,
      glossary: 'duration',
    },
    {
      id: 'combine',
      say: 'Caps still apply: 3, or 5 with a garden. Every extra pass runs every campaign, giant billboards and gourmet guides too.',
      until: { next: true },
      glossary: 'demand_cap',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'You and Bo each have one Mass Marketeer at work. How many Marketing passes run?', answer: 3, why: 'One normal pass plus one per Mass Marketeer at work, all players combined.' },
      { kind: 'choice', q: 'How many duration pips does a campaign lose in a Marketing phase with extra passes?', options: ['One', 'One per pass'], answer: 0, why: 'Pips come off once, after the last pass.' },
      { kind: 'choice', q: 'Does a Mass Marketeer place a campaign tile?', options: ['Yes', 'No'], answer: 1, why: 'It only adds passes; it never places a tile.' },
    ],
  },
});
