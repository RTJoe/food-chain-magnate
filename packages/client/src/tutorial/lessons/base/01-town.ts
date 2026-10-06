/**
 * L1 — The town (docs/tutorial-plan.md §2, L1). Read the map: tiles, roads, tile borders, houses
 * with numbers, drink sources. Pure exploration: no game action.
 *
 * Scenario: the tutorial town before setup. Bo (scripted) is to place first and has no script in
 * this lesson, so the learner is never awaited and every board tap inspects a piece.
 */
import { town, TOWN_SOURCES } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { houseByNumber, tileLabelAt } from '../../targets.js';

const SOURCES = Object.values(TOWN_SOURCES).map((source) => ({ source }));
const LEMONADE = TOWN_SOURCES.lemonadeA3;

/** Selection is house number `n`. */
const isHouse = (n: number) => (value: unknown, view: StepCtx['view']) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

/** A square of tile `label` is under the pointer, or a piece on it is selected. */
const onTile = (label: string) => (ctx: StepCtx) => {
  const cell = ctx.signals.boardHover?.cell;
  if (cell && tileLabelAt(cell.x, cell.y) === label) return true;
  const sel = ctx.signals.selection;
  const h = sel?.kind === 'house' ? ctx.view.board.houses[sel.id] : undefined;
  const c = h?.cells[0];
  return Boolean(c && tileLabelAt(c.x, c.y) === label);
};

export const lesson01 = defineLesson({
  id: 'base.1',
  course: 'base',
  title: 'The town',
  minutes: 5,
  goal: 'Read the map: tiles, roads, tile borders, houses and drink sources.',
  concepts: ['tile', 'tile_border', 'road', 'house', 'drink_source', 'distance'],
  scenario: {
    build: () =>
      town({ round: 0, restaurants: false })
        .phase({ kind: 'setup.restaurants', round: 1, order: ['p2', 'p1'], idx: 0, placed: [], passed: [] })
        .build(),
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: [],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'tiles',
      say: 'This is a town of nine map tiles. Each tile is five squares wide.',
      show: [{ tile: 'A1' }, { seam: ['A1', 'B1'] }, { seam: ['A1', 'A2'] }],
      camera: { kind: 'board' },
      until: { next: true },
      checkpoint: true,
      glossary: 'tile',
    },
    {
      id: 'tap-b2',
      say: 'Tiles have letters and numbers on the rim. Tap tile B2.',
      show: [{ tile: 'B2' }],
      allow: { ui: ['board'] },
      until: { test: onTile('B2') },
      solution: [{ tap: { tile: 'B2' } }],
      then: "That's B2: the ring road with house 5.",
      hint: { say: 'B is the middle column, 2 the middle row: tap the centre tile.', show: [{ tile: 'B2' }] },
    },
    {
      id: 'roads',
      say: 'Roads connect wherever two road squares touch, even across a tile border.',
      show: [{ seam: ['A1', 'A2'] }, { cell: [2, 4] }, { cell: [2, 5] }],
      until: { next: true },
      glossary: 'road',
    },
    {
      id: 'distance',
      say: 'Distance in this game is the number of tile borders a road trip crosses. From A1 to C1 is 2.',
      show: [{ seam: ['A1', 'B1'] }, { seam: ['B1', 'C1'] }],
      until: { next: true },
      checkpoint: true,
      glossary: 'distance',
    },
    {
      id: 'tap-house-18',
      say: 'Houses have numbers. Tap house 18.',
      show: [{ house: 18 }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isHouse(18) },
      solution: [{ tap: { house: 18 } }],
      then: (ctx) => {
        const id = houseByNumber(ctx.view, 18);
        const h = id ? ctx.view.board.houses[id] : undefined;
        const demand = h?.demand.length ?? 0;
        return `Its card opens: ${demand === 0 ? 'no demand yet' : `${demand} demand`}, room for ${h?.garden ? 5 : 3}.`;
      },
      hint: { say: 'House 18 is on tile A2, just below your future corner.', show: [{ house: 18 }] },
      glossary: 'house',
    },
    {
      id: 'demand',
      say: 'Houses eat only when they have demand. Nobody has demand yet; marketing will change that later.',
      show: [{ ui: 'inspect' }, { house: 18 }],
      until: { next: true },
      checkpoint: true,
      glossary: 'demand',
    },
    {
      id: 'sources',
      say: 'The bottle icons are drink sources: beer, lemonade, soda. Restaurants fetch drinks from them.',
      show: SOURCES,
      until: { next: true },
      onEnter: [{ select: null }],
      glossary: 'drink_source',
    },
    {
      id: 'tap-lemonade',
      say: 'Tap the lemonade source.',
      show: [{ source: LEMONADE }],
      allow: { ui: ['board'] },
      until: {
        signal: 'selection',
        match: (value, view) => {
          const sel = value as { kind?: string; id?: string } | null;
          const s = sel?.kind === 'source' ? view.board.drinkSources[sel.id ?? ''] : undefined;
          return s?.x === LEMONADE[0] && s.y === LEMONADE[1];
        },
      },
      solution: [{ tap: { source: LEMONADE } }],
      then: 'Lemonade, on tile A3.',
      hint: { say: 'Bottom-left tile, A3: the yellow bottle.', show: [{ source: LEMONADE }] },
    },
    {
      id: 'top-view',
      say: 'Top view can make counting easier. Toggle it, then back.',
      show: [{ ui: 'camera-top' }],
      allow: { ui: ['camera-top'] },
      until: { signal: 'topView', changed: 2, equals: false },
      solution: [{ tap: { ui: 'camera-top' } }, { tap: { ui: 'camera-top' } }],
      checkpoint: true,
      onEnter: [{ select: null }],
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'tap', q: 'Tap the house that is 1 border away from tile A1 by road.', target: { house: 18 }, why: 'House 18 is on A2: the road from A1 crosses one tile border.' },
      { kind: 'choice', q: 'How many tile borders from the beer at B1 to the soda at C1?', options: ['0', '1', '2'], answer: 1, why: 'B1 and C1 are neighbours: one border between them.' },
      { kind: 'choice', q: 'What makes a house eat?', options: ['Its number', 'Demand tokens', 'Being near a road'], answer: 1, why: 'Only demand makes a house buy; marketing places it.' },
    ],
  },
});
