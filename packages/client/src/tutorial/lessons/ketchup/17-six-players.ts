/**
 * K17 — Six Players (docs/tutorial-plan.md §3, ketchup.md §17). Informational: a sixth chain (Siap
 * Faji), a 4×6 map that needs New Districts, three copies of every 1x card, a $300 bank and no
 * billboards removed. No new decisions; the learner reads a six-chain board.
 *
 * Scenario: a 6-player town (base tiles plus U, X, Y) in round 2, Working, with Bo to act. Bo is
 * scripted with no moves, so the game waits and every tap inspects the board.
 */
import type { GameView } from '@fcm/engine';
import { stateBuilder } from '@fcm/engine/testing';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, ME, withModuleSetup } from './shared.js';

const MAP = [
  ['A', 'B', 'C', 'D', 'E', 'F'],
  ['G', 'H', 'X', 'I', 'J', 'K'],
  ['L', 'M', 'N', 'O', 'Y', 'P'],
  ['Q', 'R', 'S', 'T', 'U', 'V'],
];
const SPOTS = [
  ['p1', 3, 3, 'NW'],
  ['p2', 23, 8, 'NE'],
  ['p3', 2, 18, 'NW'],
  ['p4', 12, 13, 'NW'],
  ['p5', 17, 3, 'SW'],
  ['p6', 28, 18, 'NW'],
] as const;

const build = () => {
  const b = stateBuilder({ players: ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'], seed: 2017, modules: ['ketchup:newDistricts', 'ketchup:sixPlayers'] }).tiles(MAP).round(2);
  for (const [p, x, y, door] of SPOTS) b.restaurant(p, x, y, door);
  return withModuleSetup(b).phase({ kind: 'working', player: 'p2', idx: 1 }).build();
};
/** Apartment π's house id in this scenario (for the Inspect card). */
const PI_ID = Object.values(build().board.houses).find((h) => h.kind === 'apartment' && h.order === 3.14)?.id ?? '';

const isSiapFaji = (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'restaurant' && view.board.restaurants[sel.id ?? '']?.owner === 'p6';
};

export const sixPlayersLesson = defineLesson({
  id: 'ketchup.sixPlayers',
  course: 'ketchup',
  title: 'Six Players',
  minutes: 4,
  goal: 'Read a six-chain game: Siap Faji, the 4×6 map, the bigger bank and three copies of 1x cards.',
  concepts: ['module_six_players', 'module_new_districts', 'one_x', 'bank'],
  requires: BASE_COURSE,
  scenario: {
    build,
    learner: ME,
    opponents: { p2: 'scripted', p3: 'scripted', p4: 'scripted', p5: 'scripted', p6: 'scripted' },
    pauseAfter: [],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: '6 Players adds a sixth chain and a 4×6 map. Everything else follows the rules you know.',
      show: [{ ui: 'rail-p6' }],
      camera: { kind: 'top' },
      until: { next: true },
      checkpoint: true,
      glossary: 'module_six_players',
    },
    {
      id: 'siap-faji',
      say: 'The new chain is Siap Faji. Tap its restaurant, bottom right.',
      show: [{ restaurant: 'p6' }],
      allow: { ui: ['board'] },
      until: { signal: 'selection', match: isSiapFaji },
      solution: [{ tap: { restaurant: 'p6' } }],
      hint: { say: 'Siap Faji is the sixth seat on the rail; its restaurant sits in the bottom-right corner.', show: [{ restaurant: 'p6' }] },
    },
    {
      id: 'order',
      say: 'Six seats on the turn order track: turns are longer, so Order of Business matters even more.',
      show: [{ ui: 'rail-p1' }, { ui: 'rail-p6' }],
      onEnter: [{ select: null }],
      until: { next: true },
      glossary: 'turn_order',
    },
    {
      id: 'bank',
      say: (ctx) => `The bank starts at $50 per player: $${ctx.view.bank.cash} here. All 16 marketing tiles are in play.`,
      show: [{ ui: 'bank' }],
      until: { next: true },
      glossary: 'bank',
    },
    {
      id: 'supply',
      say: 'Open the Staff tab: every 1x card has 3 copies, as in a 5-player game.',
      show: [{ ui: 'tab-market' }],
      allow: { ui: ['tab-market'] },
      until: { signal: 'dockTab', equals: 'market' },
      solution: [{ tap: { ui: 'tab-market' } }],
      glossary: 'one_x',
    },
    {
      id: 'districts',
      say: 'A 4×6 map needs the New Districts tiles, so that module must be on. Its card shows apartment π.',
      show: [{ house: 3.14 }, { ui: 'inspect' }],
      onEnter: [{ select: { kind: 'house', id: PI_ID } }],
      until: { next: true },
      glossary: 'module_new_districts',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Which module must be on for a 6-player game?', options: ['New Districts', 'Lobbyists', 'Coffee'], answer: 0, why: 'A 4×6 map needs the extra tiles.' },
      { kind: 'number', q: 'How many copies of each 1x card are in a 6-player game?', answer: 3, why: 'Same as 5 players: 3 copies.' },
      { kind: 'tap', q: 'Tap the Siap Faji restaurant.', target: { restaurant: 'p6' }, why: 'Siap Faji is the sixth chain.' },
    ],
  },
});
