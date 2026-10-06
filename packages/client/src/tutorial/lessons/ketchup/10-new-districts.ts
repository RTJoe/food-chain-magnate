/**
 * K10 — New Districts (docs/tutorial-plan.md §3, ketchup.md §1). Five new tiles; apartments (π on
 * tile X, 9¾ on tile Y) take 2 demand tokens for every 1, have no demand cap, never get a garden,
 * and eat between houses 3 and 4 (π) or 9 and 10 (9¾).
 *
 * Scenario: the tutorial town with tile X in place of tile B1, round 3, Working, Ada's turn. Her
 * Marketing Trainee places a billboard touching apartment π; Marketing drops 2 burgers on it.
 */
import type { CampaignPlacement, GameView } from '@fcm/engine';
import { stateBuilder, TOWN_RESTAURANTS } from '@fcm/engine/testing';
import { defineLesson } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { BASE_COURSE, BO, continueAction, endTurn, ME, only, withModuleSetup } from './shared.js';

const MAP = [
  ['A', 'X', 'S'],
  ['K', 'C', 'N'],
  ['T', 'D', 'B'],
];
const PI = 3.14;
/** #14 standing upright left of the block (squares 5,3–5,4): it touches π. */
const SPOT = { kind: 'board', x: 5, y: 3, w: 1, h: 2 } as const;

const build = () =>
  withModuleSetup(
    stateBuilder({ players: ['Ada', 'Bo'], seed: 2010 })
      .tiles(MAP)
      .modules(['ketchup:newDistricts'])
      .round(3)
      .restaurant('p1', TOWN_RESTAURANTS.p1.x, TOWN_RESTAURANTS.p1.y, TOWN_RESTAURANTS.p1.entrance)
      .restaurant('p2', TOWN_RESTAURANTS.p2.x, TOWN_RESTAURANTS.p2.y, TOWN_RESTAURANTS.p2.entrance)
      .cash('p1', 20)
      .card('p1', 'marketing_trainee', 'work', 'k10-mt'),
  )
    .phase({ kind: 'working', player: 'p1', idx: 0 })
    .build();
/** Apartment π's house id in this scenario (for the Inspect card). */
const PI_ID = Object.values(build().board.houses).find((h) => h.kind === 'apartment')?.id ?? '';

const apartmentDemand = (v: GameView) => {
  const id = houseByNumber(v, PI);
  return id ? (v.board.houses[id]?.demand.length ?? 0) : 0;
};
/** A board campaign footprint orthogonally adjacent to apartment π. */
const touchesPi = (p: CampaignPlacement, v: GameView) => {
  const id = houseByNumber(v, PI);
  const h = id ? v.board.houses[id] : undefined;
  if (!h || p.kind !== 'board') return false;
  const { x, y, w, h: hh } = p;
  return h.cells.some((c) => (c.x >= x - 1 && c.x <= x + w && c.y >= y && c.y < y + hh) || (c.y >= y - 1 && c.y <= y + hh && c.x >= x && c.x < x + w));
};

export const newDistrictsLesson = defineLesson({
  id: 'ketchup.newDistricts',
  course: 'ketchup',
  title: 'New Districts',
  minutes: 7,
  goal: 'Market to an apartment block: double tokens, no cap, its own place in the eating order.',
  concepts: ['module_new_districts', 'apartment', 'demand_cap', 'billboard'],
  requires: BASE_COURSE,
  scenario: {
    build,
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'marketing'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'New Districts adds five map tiles. Here tile X replaces B1: the big block in it is apartment π.',
      show: [{ house: PI }, { tile: 'B1' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'module_new_districts',
    },
    {
      id: 'inspect',
      say: 'Its card is open: apartment π is a house for every rule, with three exceptions you are about to see.',
      show: [{ house: PI }, { ui: 'inspect' }],
      onEnter: [{ select: { kind: 'house', id: PI_ID } }],
      until: { next: true },
      glossary: 'apartment',
    },
    {
      id: 'billboard',
      say: 'Tap your Marketing Trainee and place billboard #14 upright against π, on its left side. Advertise burgers.',
      show: [{ card: { player: ME, uid: 'k10-mt' } }, { cell: [SPOT.x, SPOT.y] }, { house: PI }],
      onEnter: [{ select: null }],
      allow: { actions: [only('work.placeCampaign', (a, v) => a.campaignKind === 'billboard' && a.goods[0] === 'burger' && touchesPi(a.placement, v))] },
      until: { event: 'campaignPlaced', where: (e) => e.type === 'campaignPlaced' && e.player === ME },
      solution: [{ type: 'work.placeCampaign', playerId: ME, cardUid: 'k10-mt', campaignKind: 'billboard', tileNumber: 14, goods: ['burger'], placement: SPOT, duration: 2 }],
      hint: { say: 'Pick token #14, choose burgers, then the spot just left of the block.', show: [{ cell: [SPOT.x, SPOT.y] }] },
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
      say: 'Press Continue. Dinner and Payday pass quietly; then watch your billboard at Marketing.',
      show: [{ ui: 'continue' }, { house: PI }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'marketing' },
      solution: continueAction,
      then: (ctx) => `One marketing run, ${apartmentDemand(ctx.view)} burgers on π: an apartment takes 2 tokens for each 1.`,
      checkpoint: true,
    },
    {
      id: 'no-cap',
      say: 'Apartments have no demand cap. Tokens pile up until one chain serves the whole order at once.',
      show: [{ house: PI }],
      until: { next: true },
      glossary: 'demand_cap',
    },
    {
      id: 'order',
      say: 'π eats between houses 3 and 4; 9¾ on tile Y between 9 and 10. An apartment can never get a garden.',
      show: [{ house: PI }, { house: 4 }],
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'With Lobbyists, a park still doubles an apartment’s prices. Six-player games must use New Districts.',
      until: { next: true },
      glossary: 'park',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'When does apartment π eat?', options: ['Before house 2', 'Between houses 3 and 4', 'Last'], answer: 1, why: 'π counts as 3.14 in the eating order.' },
      { kind: 'number', q: 'A campaign would place 1 token. How many does an apartment get?', answer: 2, why: 'Apartments take 2 tokens instead of each 1.' },
      { kind: 'choice', q: 'How many demand tokens can an apartment hold?', options: ['3', '5', 'No limit'], answer: 2, why: 'Apartments have no maximum demand.' },
    ],
  },
});
