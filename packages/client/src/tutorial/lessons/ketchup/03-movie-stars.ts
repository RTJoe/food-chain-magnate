/**
 * K3 — Movie Stars (docs/tutorial-plan.md §3, ketchup.md §15). A Waitress trains into a movie star
 * (B only with two players). A star at work chooses turn order before everyone else and wins the
 * Dinnertime ties that waitresses would decide. One star per player; salary; no tips.
 *
 * Scenario: round 2, Working, Ada's turn: her Trainer is at work, a Waitress and a Kitchen Trainee
 * wait on the beach. Bo runs a Pricing Manager and a Waitress. Round 3: Ada has fewer open slots
 * yet chooses first, and her star beats Bo's waitress in an 11 vs 11 tie for house 18.
 */
import type { Action, StructureSubmission } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, BO, continueAction, endTurn, kTown, ME, only, runOn, saleAt } from './shared.js';

const STAR = 'k3-w';
const ADA_CHART: StructureSubmission = { ceoSubs: [STAR, 'k3-kt', 'k3-tr'], managerSubs: {} };
const BO_CHART: StructureSubmission = { ceoSubs: ['k3-bmt', 'k3-bpm'], managerSubs: { 'k3-bmt': ['k3-bw', 'k3-bkt'] } };

export const movieStarsLesson = defineLesson({
  id: 'ketchup.movieStars',
  course: 'ketchup',
  title: 'Movie Stars',
  minutes: 6,
  goal: 'Train a Waitress into a movie star; choose turn order first and win a tie with her.',
  concepts: ['module_movie_stars', 'b_movie_star', 'order_of_business', 'tie_break'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(2, ['ketchup:movieStars'])
        .cash('p1', 40)
        .cash('p2', 40)
        .card('p1', 'trainer', 'work', 'k3-tr')
        .card('p1', 'waitress', 'beach', STAR)
        .card('p1', 'kitchen_trainee', 'beach', 'k3-kt')
        .card('p2', 'management_trainee', 'work', 'k3-bmt')
        .card('p2', 'pricing_manager', 'work', 'k3-bpm')
        .card('p2', 'waitress', { under: 'k3-bmt' }, 'k3-bw')
        .card('p2', 'kitchen_trainee', { under: 'k3-bmt' }, 'k3-bkt')
        .demand(18, ['burger'])
        // Keep the tie clean: "First to Lower Prices" is already gone (its extra −$1 would decide it).
        .mutate((s) => {
          const m = s.milestones.first_lower_prices;
          if (m) m.removed = true;
        })
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'Movie Stars adds a new career step: a Waitress can train into a movie star. With two players only the B-Movie Star is in play.',
      show: [{ card: { player: ME, uid: STAR } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'module_movie_stars',
    },
    {
      id: 'train',
      say: 'Tap your Trainer and train the Waitress on the beach into the B-Movie Star.',
      show: [{ card: { player: ME, uid: 'k3-tr' } }, { ui: 'train-ketchup:b_movie_star' }],
      allow: { actions: [only('work.train', (a) => a.targetUid === STAR && a.toEmployeeId === 'ketchup:b_movie_star')] },
      until: { event: 'employeeTrained', where: (e) => e.type === 'employeeTrained' && e.player === ME && e.to === 'ketchup:b_movie_star' },
      solution: [{ type: 'work.train', playerId: ME, trainerUid: 'k3-tr', targetUid: STAR, toEmployeeId: 'ketchup:b_movie_star' }],
      hint: { say: 'Tap the Trainer card, then the B-Movie Star option.' },
      glossary: 'b_movie_star',
    },
    {
      id: 'one-x',
      say: 'All movie stars count as one 1x type: one star per player. She costs $5 salary and earns no tips.',
      show: [{ card: { player: ME, uid: STAR } }],
      until: { next: true },
      glossary: 'one_x',
    },
    {
      id: 'end-round',
      say: 'End your turn and let the round run on to round 3: press Continue at each pause and confirm Payday.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn'), only('payday.confirm'), only('tutorial.continue')] },
      script: [
        { player: BO, action: endTurn(BO) },
        { player: BO, action: { type: 'payday.confirm', playerId: BO } },
      ],
      until: { view: (v) => v.round === 3 && v.phase.kind === 'restructuring' },
      solution: (ctx) => runOn(ctx, 2, ['working', 'dinnertime'], { payday: true }),
      checkpoint: true,
    },
    {
      id: 'structure',
      say: 'Round 3. Put the star, the Kitchen Trainee and the Trainer in your three CEO slots, then submit.',
      show: [{ ui: 'tab-company' }, { ui: 'submit-structure' }],
      onEnter: [{ openTab: 'company' }],
      allow: { actions: [only('restructure.submit', (a) => a.structure.ceoSubs.includes(STAR))] },
      script: [{ player: BO, action: { type: 'restructure.submit', playerId: BO, structure: BO_CHART } }],
      until: { view: (v) => v.phase.kind === 'orderOfBusiness' },
      solution: [{ type: 'restructure.submit', playerId: ME, structure: ADA_CHART }],
      hint: { say: 'Tap a card in your hand, then an empty CEO slot. Submit when all three are placed.' },
    },
    {
      id: 'order',
      say: 'Bo has 1 open slot and you have 0, yet your star at work chooses first. Take position 1.',
      show: [{ ui: 'order-pos-1' }],
      onEnter: [{ openTab: 'turn' }],
      allow: { actions: [only('order.choosePosition', (a) => a.position === 0)] },
      until: { view: (v) => v.phase.kind === 'working' },
      solution: [{ type: 'order.choosePosition', playerId: ME, position: 0 }],
      glossary: 'order_of_business',
    },
    {
      id: 'produce',
      say: 'House 18 wants a burger. Tap your Kitchen Trainee and make one.',
      show: [{ card: { player: ME, uid: 'k3-kt' } }, { house: 18 }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k3-kt' && a.food === 'burger')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k3-kt', food: 'burger' } satisfies Action],
    },
    {
      id: 'end-turn',
      say: 'End your turn. Bo makes a burger too.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [
        { player: BO, action: { type: 'work.produce', playerId: BO, cardUid: 'k3-bkt', food: 'burger' } },
        { player: BO, action: endTurn(BO) },
      ],
      until: { paused: 'working' },
      solution: [endTurn()],
      checkpoint: true,
    },
    {
      id: 'tie',
      say: "House 18: your $10 + 1 border = 11, and Bo's Pricing Manager makes his $9 + 2 = 11. A tie, and Bo has a waitress.",
      show: [{ house: 18 }, { restaurant: BO }],
      until: { next: true },
      glossary: 'tie_break',
    },
    {
      id: 'dinner',
      say: 'Press Continue and watch who sells to house 18.',
      show: [{ ui: 'continue' }, { house: 18 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => (saleAt(ctx, 18)?.player === ME ? 'You won the tie: a star at work beats any number of waitresses.' : 'Dinner is over.'),
    },
    {
      id: 'combine',
      say: 'Stars beat waitresses even when Night Shift Managers double them. With more players, B beats C beats D.',
      until: { next: true },
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Who chooses turn order first?', options: ['Most open slots', 'A player with a movie star at work', 'Most cash'], answer: 1, why: 'Players with a star at work choose before everyone else; then open slots decide.' },
      { kind: 'choice', q: 'Tie at 11: Bo has two waitresses, you have the B-Movie Star at work. Who sells?', options: ['Bo', 'You', 'Nobody'], answer: 1, why: 'The star wins the tie before waitresses are counted.' },
      { kind: 'number', q: 'How many movie stars may one player own?', answer: 1, why: 'All movie stars together are one 1x type.' },
    ],
  },
});
