/**
 * The tutorial town (docs/tutorial-plan.md §2.0) is the one map every base lesson teaches on: the
 * narration quotes its numbers ("house 18: Ada 1, Bo 2"). This pins them, so a map or pathfinding
 * change that would make a lesson say something false fails here first.
 */
import { describe, expect, it } from 'vitest';
import { houseOutlook } from '../../src/index.js';
import { renderAscii, stateProblems, town, TOWN_RESTAURANTS, TOWN_SOURCES, TUTORIAL_MAP } from '../../src/testing/index.js';

const state = () => town({ round: 3 }).build();

/** Road distance (tile borders) from each chain's restaurant to house `n`, as Dinnertime measures it. */
function distances(n: number): Record<string, number> {
  const s = state();
  const house = Object.values(s.board.houses).find((h) => h.order === n);
  if (!house) throw new Error(`no house ${n}`);
  const o = houseOutlook(s, house.id);
  return Object.fromEntries((o?.sellers ?? []).map((x) => [x.player, x.distance]));
}

describe('tutorial town', () => {
  it('is a valid 3×3 two-player state with Ada on A1 and Bo on C2', () => {
    const s = state();
    expect(stateProblems(s)).toEqual([]);
    expect(TUTORIAL_MAP).toEqual([
      ['A', 'O', 'S'],
      ['K', 'C', 'N'],
      ['T', 'D', 'B'],
    ]);
    expect(s.board.w).toBe(15);
    expect(s.board.h).toBe(15);
    const rs = Object.values(s.board.restaurants).map((r) => ({ owner: r.owner, x: r.x, y: r.y, entrance: r.entrance }));
    expect(rs).toEqual([
      { owner: 'p1', ...TOWN_RESTAURANTS.p1 },
      { owner: 'p2', ...TOWN_RESTAURANTS.p2 },
    ]);
  });

  it('matches the map drawn in tutorialTown.ts', () => {
    expect(renderAscii(state().board)).toMatchInlineSnapshot(`
      "..#...D#....#D.
      ..#....#....#..
      ###############
      HH#rr..#..D.#..
      HH#rr..#....#..
      ##########..#..
      #.HH##.HH#.D#..
      #.HH##.HH######
      .....#...#.rr..
      .....#####.rr..
      ..#..#####..#HH
      .D#..#HH.#..#HH
      ######HH.######
      ..#.........#..
      ..#.........#.."
    `);
  });

  it('has the houses on the squares the lessons name', () => {
    const cells = Object.fromEntries(
      Object.values(state().board.houses).map((h) => [h.order, h.cells.map((c) => `${c.x},${c.y}`).sort()]),
    );
    expect(cells).toEqual({
      2: ['0,3', '0,4', '1,3', '1,4'],
      4: ['13,10', '13,11', '14,10', '14,11'],
      5: ['7,6', '7,7', '8,6', '8,7'],
      7: ['6,11', '6,12', '7,11', '7,12'],
      18: ['2,6', '2,7', '3,6', '3,7'],
    });
  });

  it('pins the road distance table (tile borders from each restaurant)', () => {
    expect(distances(2)).toEqual({ p1: 0, p2: 3 });
    expect(distances(18)).toEqual({ p1: 1, p2: 2 });
    expect(distances(5)).toEqual({ p1: 2, p2: 1 });
    expect(distances(7)).toEqual({ p1: 3, p2: 2 });
    expect(distances(4)).toEqual({ p1: 4, p2: 3 });
  });

  it('has the drink sources where the lessons say', () => {
    const sources = Object.values(state().board.drinkSources)
      .map((s) => `${s.drink}@${s.x},${s.y}`)
      .sort();
    const named = [
      `beer@${TOWN_SOURCES.beerB1.join(',')}`,
      `beer@${TOWN_SOURCES.beerC1.join(',')}`,
      `beer@${TOWN_SOURCES.beerC2.join(',')}`,
      `lemonade@${TOWN_SOURCES.lemonadeA3.join(',')}`,
      `soft_drink@${TOWN_SOURCES.sodaC1.join(',')}`,
    ].sort();
    expect(sources).toEqual(named);
    expect(TOWN_SOURCES).toEqual({ beerB1: [6, 0], sodaC1: [13, 0], beerC1: [10, 3], beerC2: [11, 6], lemonadeA3: [1, 11] });
  });
});
