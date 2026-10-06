/**
 * The tutorial town (docs/tutorial-plan.md §2.0): one fixed 2-player map every base lesson uses,
 * so the learner builds a mental model of one place. Ada (p1, red) on tile A1, Bo (p2, yellow)
 * on tile C2.
 *
 *     012345678901234          Houses (order: squares)       Drink sources
 *   0 ..#...D#....#D.          2:  (0–1, 3–4)  tile A1       beer B1 (6,0)
 *   1 ..#....#....#..          18: (2–3, 6–7)  tile A2       soda C1 (13,0)
 *   2 ###############          5:  (7–8, 6–7)  tile B2       beer C1 (10,3)
 *   3 HH#rr..#..D.#..          7:  (6–7, 11–12) tile B3      beer C2 (11,6)
 *   4 HH#rr..#....#..          4:  (13–14, 10–11) tile C3    lemonade A3 (1,11)
 *   5 ##########..#..
 *   6 #.HH##.HH#.D#..          Road distance (tile borders) from each restaurant:
 *   7 #.HH##.HH######            house 2: Ada 0, Bo 3     house 18: Ada 1, Bo 2
 *   8 .....#...#.rr..            house 5: Bo 1, Ada 2     house 7:  Bo 2, Ada 3
 *   9 .....#####.rr..            house 4: Bo 3, Ada 4
 *  10 ..#..#####..#HH
 *  11 .D#..#HH.#..#HH          Tile labels on the board rim: columns A–C, rows 1–3.
 *  12 ######HH.######          (The fixture test in WP-T2 pins these numbers.)
 *  13 ..#.........#..
 *  14 ..#.........#..
 */
import type { PlayerId } from '../../types/state.js';
import { stateBuilder, type StateBuilder } from '../stateBuilder.js';

export const TUTORIAL_MAP = [
  ['A', 'O', 'S'], // row 1: house 2 + cross | beer + cross | soda + beer + cross
  ['K', 'C', 'N'], // row 2: house 18 (U) | house 5 (ring) | beer (T)
  ['T', 'D', 'B'], // row 3: lemonade cross | house 7 (U) | house 4 cross
];

/** Restaurant spots of the two chains: Ada on tile A1, Bo on tile C2. */
export const TOWN_RESTAURANTS: Record<'p1' | 'p2', { x: number; y: number; entrance: 'NW' }> = {
  p1: { x: 3, y: 3, entrance: 'NW' },
  p2: { x: 11, y: 8, entrance: 'NW' },
};

/** Drink sources by tile and kind (squares). */
export const TOWN_SOURCES = {
  beerB1: [6, 0],
  sodaC1: [13, 0],
  beerC1: [10, 3],
  beerC2: [11, 6],
  lemonadeA3: [1, 11],
} as const satisfies Record<string, readonly [number, number]>;

export interface TownOptions {
  round: number;
  seed?: number;
  /** Place both restaurants (default true). */
  restaurants?: boolean | PlayerId[];
}

/**
 * The tutorial town as a builder, ready for lesson-specific cards, cash, demand and phase.
 * Seed defaults to 1000 + round so every lesson state is reproducible.
 */
export function town(opts: TownOptions): StateBuilder {
  const b = stateBuilder({ players: ['Ada', 'Bo'], seed: opts.seed ?? 1000 + opts.round })
    .tiles(TUTORIAL_MAP)
    .round(opts.round);
  const which = opts.restaurants === false ? [] : opts.restaurants === undefined || opts.restaurants === true ? (['p1', 'p2'] as const) : opts.restaurants;
  for (const p of which) {
    const r = TOWN_RESTAURANTS[p as 'p1' | 'p2'];
    if (r) b.restaurant(p, r.x, r.y, r.entrance);
  }
  return b;
}
