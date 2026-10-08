/**
 * K11 — Lobbyists (docs/tutorial-plan.md §3, ketchup.md §2). In the new sub-step between houses and
 * restaurants a Lobbyist places a road (under construction this round; its arrows put roadworks,
 * +1 distance, on the roads they point at) or a park (×2 prices for houses next to it, ×3 with a
 * garden). "First Lobbyist Used" adds a leftover map tile next to the map.
 *
 * Scenario: round 4, Working, Ada's turn with two Lobbyists at work and a burger in stock. House 18
 * wants a burger; a park beside it doubles the sale.
 */
import type { Action, RouteStart } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, BO, continueAction, endTurn, kTown, ME, only, saleAt, usd } from './shared.js';

/** The 1×4 (I) park tile, upright beside house 18 (questions.md Q-K1). */
const PARK = { x: 1, y: 6, w: 1, h: 4 } as const;
const PARK_CELLS = [0, 1, 2, 3].map((dy) => ({ x: PARK.x, y: PARK.y + dy }));
/** A 2-square road tile going south from the road at row 5. */
const ROAD = [
  { x: 6, y: 6 },
  { x: 6, y: 7 },
];
const TILE = { row: 3, col: 0 } as const;
/** Ada's restaurant door: the lobbyist's range is measured from here. */
const FROM = (restaurantId: string): RouteStart => ({ kind: 'restaurant', restaurantId, corner: 'NW' });
const adaRestaurant = (v: { board: { restaurants: Record<string, { owner: string; id: string }> } }) => Object.values(v.board.restaurants).find((r) => r.owner === ME)?.id ?? '';

export const lobbyistsLesson = defineLesson({
  id: 'ketchup.lobbyists',
  course: 'ketchup',
  title: 'Lobbyists',
  minutes: 8,
  goal: 'Lay out a park, build a road and add a map tile with your Lobbyists.',
  concepts: ['module_lobbyists', 'lobbyist', 'park', 'lobbyist_road', 'roadworks'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(4, ['ketchup:lobbyists'])
        .cash('p1', 30)
        .card('p1', 'ketchup:lobbyist', 'work', 'k11-l1')
        .card('p1', 'ketchup:lobbyist', 'work', 'k11-l2')
        .inventory('p1', { burger: 1 })
        .demand(18, ['burger'])
        .mutate((s) => {
          s.tilePool = ['E'];
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
      say: 'Lobbyists act in a new sub-step between houses and restaurants: each places a road or a park within 2 borders of your door.',
      show: [{ card: { player: ME, uid: 'k11-l1' } }, { card: { player: ME, uid: 'k11-l2' } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'lobbyist',
    },
    {
      id: 'park',
      say: 'Houses next to a park pay double. Tap a Lobbyist, choose the park, and place the 1×4 park along the left side of house 18.',
      show: [{ card: { player: ME, uid: 'k11-l1' } }, { cell: [PARK.x, PARK.y + 1] }, { house: 18 }],
      allow: { actions: [only('ketchup:lobbyists.placePark', (a) => a.x === PARK.x && a.y === PARK.y && a.w === PARK.w && a.h === PARK.h)] },
      until: { event: 'entityPlaced', where: (e) => e.type === 'entityPlaced' && e.entity.kind === 'park' },
      solution: (ctx): Action[] => [{ type: 'ketchup:lobbyists.placePark', playerId: ME, cardUid: 'k11-l1', ...PARK, cells: PARK_CELLS, from: FROM(adaRestaurant(ctx.view)) }],
      hint: { say: 'Lay out a park, keep the 1×4 piece, and pick "Park at 1,6".', show: [{ cell: [PARK.x, PARK.y] }] },
      glossary: 'park',
    },
    {
      id: 'map-tile',
      say: 'First Lobbyist Used: you add a leftover map tile next to the map. Put it below tile A3.',
      show: [{ tile: 'A3' }],
      allow: { actions: [only('ketchup:lobbyists.placeMapTile', (a) => a.row === TILE.row && a.col === TILE.col)] },
      until: { event: 'mapTileAdded' },
      solution: (ctx): Action[] => {
        const head = ctx.view.pending[0];
        return head?.kind === 'extraMapTile' ? [{ type: 'ketchup:lobbyists.placeMapTile', playerId: ME, choiceId: head.id, templateId: 'E', ...TILE, rotation: 0 }] : [];
      },
      then: 'The town grew by one tile. Restaurants, roads and parks may go on it this turn.',
      hint: { say: 'Press "Place the extra map tile", pick the tile, then the spot at row 3, column 0.' },
      glossary: 'first_lobbyist_used',
      checkpoint: true,
    },
    {
      id: 'road',
      say: 'Now the other Lobbyist builds a 2-square road on tile B2, south from the road above it.',
      show: [{ card: { player: ME, uid: 'k11-l2' } }, { cell: [6, 7] }],
      allow: { actions: [only('ketchup:lobbyists.placeRoad', (a) => a.cells.length === ROAD.length && a.cells.every((c, i) => c.x === ROAD[i]?.x && c.y === ROAD[i]?.y))] },
      until: { event: 'entityPlaced', where: (e) => e.type === 'entityPlaced' && e.entity.kind === 'lobbyistRoad' },
      solution: (ctx): Action[] => [
        {
          type: 'ketchup:lobbyists.placeRoad',
          playerId: ME,
          cardUid: 'k11-l2',
          cells: ROAD,
          arrows: [
            { from: { x: 6, y: 6 }, dir: 'N' },
            { from: { x: 6, y: 7 }, dir: 'S' },
          ],
          from: FROM(adaRestaurant(ctx.view)),
        },
      ],
      hint: { say: 'Build a road, choose the 2-square piece, and pick "Road over 2 squares from 6,6".', show: [{ cell: [6, 6] }] },
      glossary: 'lobbyist_road',
    },
    {
      id: 'roadworks',
      say: 'The road is under construction: no route may use it this round. Its arrows put roadworks on the roads they point at: +1 distance through them.',
      show: [{ cell: [6, 5] }, { cell: [6, 6] }],
      until: { next: true },
      glossary: 'roadworks',
    },
    {
      id: 'end-turn',
      say: 'You already have a burger for house 18. End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
      checkpoint: true,
    },
    {
      id: 'dinner',
      say: 'Press Continue and watch the price at house 18.',
      show: [{ ui: 'continue' }, { house: 18 }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const s = saleAt(ctx, 18);
        return s ? `House 18 sits next to your park: the $10 burger sold for ${usd(s.total)}.` : 'Dinner is over.';
      },
    },
    {
      id: 'clean-up',
      say: 'At Cleanup the roadworks go and the new road becomes a normal road for everyone.',
      show: [{ cell: [6, 7] }],
      until: { next: true },
    },
    {
      id: 'combine',
      say: 'A park helps every chain that sells there, not just yours: ×2, or ×3 with a garden. Several parks count once.',
      show: [{ cell: [PARK.x, PARK.y + 1] }],
      until: { next: true },
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'A house with a garden sits next to a park. By how much are its item prices multiplied?', answer: 3, why: 'Park ×2, or ×3 when the house also has a garden.' },
      { kind: 'choice', q: 'May a delivery use a road the turn it is built?', options: ['Yes', 'No, it is under construction'], answer: 1, why: 'Under-construction roads carry no route until Cleanup flips them.' },
      { kind: 'tap', q: 'Tap the house your park doubles.', target: { house: 18 }, why: 'House 18 touches the park on its left side.' },
    ],
  },
});
