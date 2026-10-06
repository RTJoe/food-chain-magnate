/**
 * L2 — Your restaurant (docs/tutorial-plan.md §2, L2). Place the first restaurant legally: the
 * 2×2 footprint, the door on a road, one door per tile in setup; then the secret reserve card.
 *
 * Scenario: the tutorial town before setup, Bo (scripted) places first (reverse turn order), then
 * the learner. Also exports small helpers the later base lessons share (house taps, seller lines).
 */
import type { GameView, HouseId, PlayerId } from '@fcm/engine';
import { town, TOWN_RESTAURANTS } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';
import { outlookFor } from '../../../state/guidance.js';

const ADA = TOWN_RESTAURANTS.p1;
const BO = TOWN_RESTAURANTS.p2;

// --- Helpers shared by L2–L7 -------------------------------------------------------------------

/** Selection predicate: house number `n` is selected (for `{ signal: 'selection', match }`). */
export const isHouse = (n: number) => (value: unknown, view: GameView) => {
  const sel = value as { kind?: string; id?: string } | null;
  return sel?.kind === 'house' && sel.id === houseByNumber(view, n);
};

const nameOf = (v: GameView, p: PlayerId, me: PlayerId) => (p === me ? 'you' : (v.players[p]?.name ?? p));

/** One seller of a house as the Inspect card shows it: "Bo $10 + 2 = $12". */
export function sellerLine(v: GameView, me: PlayerId, houseNo: number, who: PlayerId): string {
  const id = houseByNumber(v, houseNo) as HouseId | null;
  const s = id ? outlookFor(v, me, id)?.sellers.find((x) => x.player === who) : undefined;
  if (!s) return '';
  const name = nameOf(v, who, me);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} $${s.unitPrice} + ${s.distance} = $${s.score}`;
}

/** Cash of a player in the view. */
export const cashOf = (v: GameView, p: PlayerId): number => v.players[p]?.cash ?? 0;

/** The learner's ready legal action of a type, for solutions that need live ids. */
export const legalOf = (ctx: StepCtx, type: string) => ctx.legal.find((l) => l.kind === 'ready' && l.action.type === type);

// --- Lesson ------------------------------------------------------------------------------------

export const lesson02 = defineLesson({
  id: 'base.2',
  course: 'base',
  title: 'Your restaurant',
  minutes: 6,
  goal: 'Place your first restaurant: the door on a road, one door per tile in setup.',
  concepts: ['restaurant', 'entrance', 'first_restaurant', 'reserve_card'],
  requires: ['base.1'],
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
      id: 'bo-first',
      say: 'In setup the last player in turn order places first, so Bo goes before you. Watch tile C2.',
      show: [{ tile: 'C2' }],
      script: [{ player: 'p2', action: { type: 'setup.placeRestaurant', playerId: 'p2', x: BO.x, y: BO.y, entrance: BO.entrance } }],
      until: { all: [{ event: 'restaurantPlaced', where: (e) => e.type === 'restaurantPlaced' && e.player === 'p2' }, { next: true }] },
      checkpoint: true,
      glossary: 'restaurant',
    },
    {
      id: 'door',
      say: "A restaurant covers 2×2 squares. One corner is its door, and the door must touch a road.",
      show: [{ restaurant: 'p2' }],
      camera: { kind: 'rect', rect: { x0: 9, z0: 5, x1: 15, z1: 11 } },
      until: { next: true },
      glossary: 'entrance',
    },
    {
      id: 'one-door',
      say: "In setup, each tile may hold only one door. Bo's door is on tile C2, so the board offers you no spot there.",
      show: [{ tile: 'C2' }],
      camera: { kind: 'board' },
      until: { next: true },
      glossary: 'first_restaurant',
    },
    {
      id: 'place',
      say: 'Tap the ringed square on tile A1 (on a phone, then press Place). Your door goes on that corner, beside the road.',
      show: [{ tile: 'A1' }, { cell: [ADA.x, ADA.y] }, { ui: 'pick-strip' }],
      allow: { actions: [{ type: 'setup.placeRestaurant', where: (a) => a.type === 'setup.placeRestaurant' && a.x === ADA.x && a.y === ADA.y && a.entrance === ADA.entrance }] },
      until: { event: 'restaurantPlaced', where: (e) => e.type === 'restaurantPlaced' && e.player === 'p1' },
      solution: [{ type: 'setup.placeRestaurant', playerId: 'p1', x: ADA.x, y: ADA.y, entrance: ADA.entrance }],
      then: 'Open for business on tile A1.',
      hint: { say: 'Tap the ringed square, top-left of the 2×2 spot. If the door lands on another corner, Rotate (or R) turns it.', show: [{ cell: [ADA.x, ADA.y] }] },
      checkpoint: true,
    },
    {
      id: 'neighbours',
      say: 'House 2 is on your tile: distance 0. House 18 is one tile border away by road.',
      show: [{ house: 2 }, { house: 18 }, { restaurant: 'p1' }],
      until: { next: true },
      glossary: 'distance',
    },
    {
      id: 'reserve',
      say: 'Each player also picks a reserve card in secret. Take +$200 for now; Lesson 14 explains it.',
      show: [{ ui: 'reserve-200' }],
      allow: { actions: [{ type: 'setup.chooseReserve', where: (a) => a.type === 'setup.chooseReserve' && a.card.amount === 200 }] },
      script: [{ player: 'p2', action: { type: 'setup.chooseReserve', playerId: 'p2', card: { kind: 'standard', amount: 100, ceoSlots: 2 } } }],
      until: { view: (v) => v.phase.kind !== 'setup.restaurants' && v.phase.kind !== 'setup.reserve' },
      solution: [{ type: 'setup.chooseReserve', playerId: 'p1', card: { kind: 'standard', amount: 200, ceoSlots: 3 } }],
      then: 'Bo picked one too. Nobody sees the reserve cards until the bank first runs dry.',
      hint: { say: 'In the Turn panel, tap the +$200 card.', show: [{ ui: 'reserve-200' }] },
      glossary: 'reserve_card',
    },
    {
      id: 'ready',
      say: 'Both restaurants are open and setup is done. Next lesson, your CEO hires a first employee.',
      show: [{ restaurant: 'p1' }, { restaurant: 'p2' }],
      until: { next: true },
      nextLabel: 'Finish',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'tap', q: 'Tap the restaurant whose door is on tile A1.', target: { restaurant: 'p1' }, why: 'Yours: you placed it on A1 with its door at the top-left, on the road.' },
      { kind: 'choice', q: 'In setup, may your door share a tile with Bo’s door?', options: ['Yes', 'No'], answer: 1, why: 'In setup each tile may hold only one door.' },
      { kind: 'choice', q: 'What must a restaurant’s door touch?', options: ['A house', 'A road', 'A drink source'], answer: 1, why: 'Deliveries leave by the door, so it must touch a road square.' },
    ],
  },
});
