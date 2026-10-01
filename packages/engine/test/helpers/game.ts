/**
 * Test helpers built on the public API plus a few internals for scenario setup.
 *
 * Standard 2-player map MAP3 (tiles A L N / F O T / L R Q, rotation 0). Tile borders at x/y = 5, 10.
 *
 *     012345678901234
 *   0 ..#....#....#..
 *   1 ..#....#...D#..      D = drink source
 *   2 ###############
 *   3 HH#.....D......      house 2 = (0..1, 3..4), house 10 = (0..1, 5..6)
 *   4 HH#............
 *   5 HH#...D#....#..
 *   6 HH#....#...D#..
 *   7 ###############
 *   8 .......#....#..
 *   9 .......#....#..
 *  10 ..#....#....#..
 *  11 ..#...D#....#..
 *  12 ###############
 *  13 ...D...#...D...
 *  14 .......#.......
 */
import { expect } from 'vitest';
import type { Action, Corner, EmployeeId, GameConfig, GameState, MilestoneId, PlayerId, Rejected, ReserveCard, Uid } from '../../src/index.js';
import { applyAction, clone } from '../../src/index.js';
import { createGame } from '../../src/core/createGame.js';
import { makeCtx } from '../../src/core/context.js';
import { runUntilInput } from '../../src/core/phase.js';
import { allocId } from '../../src/core/ids.js';

export const MAP3 = [
  ['A', 'L', 'N'],
  ['F', 'O', 'T'],
  ['L', 'R', 'Q'],
];

export function cfg(players = 2, layout: string[][] = MAP3, extra: Partial<GameConfig> = {}): GameConfig {
  const chains = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc'] as const;
  return {
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, chain: chains[i] ?? 'gluttony_inc', color: '#123456' })),
    modules: [],
    options: {},
    intro: false,
    introMilestones: false,
    map: { kind: 'fixed', layout: layout.map((r) => r.map((t) => ({ templateId: t[0] as never, rotation: Number(t[1] ?? 0) as 0 | 1 | 2 | 3 }))) },
    ...extra,
  };
}

export function newGame(players = 2, seed = 1, layout: string[][] = MAP3, extra: Partial<GameConfig> = {}): GameState {
  return createGame(cfg(players, layout, extra), seed);
}

export function act(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`${a.type} rejected: ${r.code} ${r.message}`);
  return r.state;
}

export function actE(s: GameState, a: Action) {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`${a.type} rejected: ${r.code} ${r.message}`);
  return r;
}

export function rejected(s: GameState, a: Action): Rejected {
  const r = applyAction(s, a);
  expect(r.ok, `expected ${a.type} to be rejected`).toBe(false);
  return r as Rejected;
}

/** Default first-restaurant spots on MAP3 (each on its own tile, entrance touching a road). */
export const SPOTS: [number, number, Corner][] = [
  [3, 3, 'NW'],
  [5, 3, 'NW'],
  [8, 8, 'NW'],
  [3, 8, 'NE'],
];

const RESERVE: Record<number, ReserveCard> = {
  100: { kind: 'standard', amount: 100, ceoSlots: 2 },
  200: { kind: 'standard', amount: 200, ceoSlots: 3 },
  300: { kind: 'standard', amount: 300, ceoSlots: 4 },
};
export const reserve = (n: 100 | 200 | 300): ReserveCard => ({ ...(RESERVE[n] as ReserveCard) });

/** Place first restaurants (spot i for the i-th placer) and choose reserves → round 1 Restructuring. */
export function throughSetup(s0: GameState, amounts: Partial<Record<PlayerId, 100 | 200 | 300>> = {}): GameState {
  let s = s0;
  let i = 0;
  while (s.phase.kind === 'setup.restaurants') {
    const who = s.awaiting.players[0] as PlayerId;
    const [x, y, entrance] = SPOTS[i++] as [number, number, Corner];
    s = act(s, { type: 'setup.placeRestaurant', playerId: who, x, y, entrance });
  }
  for (const id of s.turnOrder) {
    if (s.phase.kind !== 'setup.reserve') break;
    s = act(s, { type: 'setup.chooseReserve', playerId: id, card: reserve(amounts[id] ?? 100) });
  }
  return s;
}

export interface WorkSetup {
  work?: EmployeeId[];
  beach?: EmployeeId[];
  milestones?: MilestoneId[];
  cash?: number;
  round?: number;
}

/**
 * Start `player`'s Working turn with the given cards at work (directly under the CEO; CEO slots
 * raised so any number fit) and on the beach. Returns the state and the new card uids in order.
 */
export function workingTurn(s0: GameState, player: PlayerId, setup: WorkSetup = {}): { s: GameState; work: Uid[]; beach: Uid[]; ceo: Uid } {
  const s = clone(s0);
  const p = s.players[player];
  if (!p) throw new Error(`unknown ${player}`);
  s.round = setup.round ?? Math.max(2, s.round);
  s.ceoSlots = 20;
  const add = (id: EmployeeId): Uid => {
    const uid = allocId(s, 'card');
    p.employees[uid] = { uid, employeeId: id, acquiredRound: 0 };
    s.supply[id] = (s.supply[id] ?? 0) - 1;
    return uid;
  };
  const work = (setup.work ?? []).map(add);
  const beach = (setup.beach ?? []).map(add);
  p.structure = { ceo: p.structure.ceo, ceoSubs: work, managerSubs: {} };
  p.beach = beach;
  if (setup.cash !== undefined) p.cash = setup.cash;
  for (const m of setup.milestones ?? []) {
    p.milestones[m] = { round: s.round - 1, phase: 'dinnertime' };
    s.milestones[m]?.claimedBy.push(player);
  }
  for (const sec of Object.values(s.secrets)) sec.structureDraft = null;
  s.pending = [];
  s.turn = null;
  s.phase = { kind: 'working', player, idx: s.turnOrder.indexOf(player) };
  const ctx = makeCtx(s);
  runUntilInput(ctx);
  return { s, work, beach, ceo: p.structure.ceo };
}
