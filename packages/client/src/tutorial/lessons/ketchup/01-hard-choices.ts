/**
 * K1 — Hard Choices (docs/tutorial-plan.md §3, ketchup.md §16). Four base milestones are crossed
 * out after round 2, First to Hire 3 after round 3, if nobody has claimed them.
 *
 * Scenario: round 2, Working, Ada's turn. Her Trainer is at work and an Errand Boy waits on the
 * beach, so she can still claim First to Train before its deadline. Cleanup then crosses out the
 * other deadline milestones nobody claimed.
 */
import type { MilestoneId } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, endTurn, kTown, ME, only, runOn } from './shared.js';

const DEADLINES: Partial<Record<MilestoneId, number>> = { first_burger_marketed: 2, first_pizza_marketed: 2, first_drink_marketed: 2, first_train: 2, first_hire_3: 3 };

export const hardChoicesLesson = defineLesson({
  id: 'ketchup.hardChoices',
  course: 'ketchup',
  title: 'Hard Choices',
  minutes: 5,
  goal: 'Claim a milestone before its deadline; see unclaimed ones crossed out at Cleanup.',
  concepts: ['module_hard_choices', 'remove_after_round', 'milestone'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(2, ['ketchup:hardChoices'])
        .cash('p1', 30)
        .card('p1', 'trainer', 'work', 'k1-tr')
        .card('p1', 'errand_boy', 'beach', 'k1-eb')
        .mutate((s) => {
          for (const [id, round] of Object.entries(DEADLINES) as [MilestoneId, number][]) {
            const m = s.milestones[id];
            if (m) m.removeAfterRound = round;
          }
        })
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'cleanup'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'deadlines',
      say: 'Hard Choices puts a deadline on five base milestones. Unclaimed, they are crossed out for everyone.',
      show: [{ ui: 'tab-milestones' }],
      onEnter: [{ openTab: 'milestones' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'module_hard_choices',
    },
    {
      id: 'which',
      say: 'Burger, Pizza and Drink Marketed and First to Train go after round 2. First to Hire 3 goes after round 3.',
      show: [{ ui: 'milestone-first_train' }, { ui: 'milestone-first_hire_3' }],
      until: { next: true },
      glossary: 'remove_after_round',
    },
    {
      id: 'train',
      say: 'This is round 2: last call for First to Train. Tap your Trainer and train the Errand Boy into a Cart Operator.',
      show: [{ card: { player: ME, uid: 'k1-tr' } }, { ui: 'train-cart_operator' }],
      onEnter: [{ openTab: 'turn' }],
      allow: { actions: [only('work.train', (a) => a.targetUid === 'k1-eb' && a.toEmployeeId === 'cart_operator')] },
      until: { event: 'milestoneClaimed', where: (e) => e.type === 'milestoneClaimed' && e.player === ME && e.milestoneId === 'first_train' },
      solution: [{ type: 'work.train', playerId: ME, trainerUid: 'k1-tr', targetUid: 'k1-eb', toEmployeeId: 'cart_operator' }],
      then: 'Claimed in time: $15 off your salaries every Payday, for good.',
      hint: { say: 'Tap the Trainer card in the Turn panel, then the Cart Operator option.' },
      checkpoint: true,
    },
    {
      id: 'end-turn',
      say: 'Nothing else to do. End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: 'p2', action: endTurn('p2') }],
      until: { paused: 'working' },
      solution: [endTurn()],
    },
    {
      id: 'clean-up',
      say: 'Let round 2 finish. Watch the Milestones tab at Cleanup.',
      show: [{ ui: 'continue' }],
      allow: { actions: [only('tutorial.continue'), only('payday.confirm')] },
      until: { paused: 'cleanup' },
      solution: (ctx) => runOn(ctx, 2, ['working'], { payday: true }),
      checkpoint: true,
    },
    {
      id: 'gone',
      say: (ctx) => {
        const gone = (['first_burger_marketed', 'first_pizza_marketed', 'first_drink_marketed'] as const).filter((id) => ctx.view.milestones[id]?.removed).length;
        return `Cleanup crossed out ${gone} unclaimed marketing milestones. Nobody can ever claim them now.`;
      },
      show: [{ ui: 'milestone-first_burger_marketed' }, { ui: 'milestone-first_drink_marketed' }],
      onEnter: [{ openTab: 'milestones' }],
      until: { next: true },
    },
    {
      id: 'hire-3',
      say: 'First to Hire 3 survives one more round: it goes after round 3 unless someone hires three people in one turn.',
      show: [{ ui: 'milestone-first_hire_3' }],
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'Hard Choices only works with the base milestones, so it cannot be combined with New Milestones.',
      until: { next: true },
      glossary: 'module_new_milestones',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'When is First to Hire 3 crossed out if nobody claims it?', options: ['After round 2', 'After round 3', 'Never'], answer: 1, why: 'It carries the "remove after turn 3" token; the four marketing and training milestones go after round 2.' },
      { kind: 'choice', q: 'Which module cannot be played with Hard Choices?', options: ['New Milestones', 'Coffee', 'Movie Stars'], answer: 0, why: 'Hard Choices changes the base milestone set, which New Milestones replaces.' },
      { kind: 'choice', q: 'You claim First to Train in round 2. What happens at Cleanup?', options: ['You lose it', 'You keep it for good', 'Everyone gets it'], answer: 1, why: 'A claimed milestone is permanent; only unclaimed copies are crossed out.' },
    ],
  },
});
