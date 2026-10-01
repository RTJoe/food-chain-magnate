/**
 * New Districts (ketchup.md §1; DLX p3–4).
 *
 * Map NDMAP (X Y U / V W L), rotation 0:
 *
 *     012345678901234
 *   0 ..#..#####.###.
 *   1 .AAA.#AAA###.##      π = (1..3,1..3), 9¾ = (6..8,1..3)
 *   2 #AAA##AAA##D.D#      tile U: lemonades at (11,2), (13,2), (12,3)
 *   3 .AAA.#AAA.##D##
 *   4 ..#..###...###.
 *   5 ..HH........#..      house 22 (2..3,5..6)
 *   6 ..HH.HH.....#..      house 25 (5..6,6..7), printed garden (5..6,8)
 *   7 #####HH########
 *   8 .HH..gg......D.      house 21 (1..2,8..9)
 *   9 .HH............
 */
import { describe, expect, it } from 'vitest';
import type { GameState, House } from '../../../src/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { sourcesAdjacentToPath } from '../../../src/map/pathfinding.js';
import { gardenPlacementProblem } from '../../../src/rules/working/development.js';
import { baseDemandCapacity } from '../../../src/rules/marketing.js';
import { dine, kb, market } from './helpers.js';

const M = ['ketchup:newDistricts'] as const;
const NDMAP = [
  ['X', 'Y', 'U'],
  ['V', 'W', 'L'],
];

const nd = () => kb(2, [...M], NDMAP);
const house = (s: GameState, label: string) => Object.values(s.board.houses).find((h) => h.label === label) as House;
const burgers = (n: number) => Array.from({ length: n }, () => 'burger' as const);

describe('New Districts (ketchup.md §1)', () => {
  describe('§1 tiles', () => {
    it('§1: adds tiles U, V, W, X, Y to the pool; tile Z belongs to Lobbyists', () => {
      const tiles = Object.keys(contentFor([...M]).tiles);
      expect(tiles).toEqual(expect.arrayContaining(['A', 'T', 'U', 'V', 'W', 'X', 'Y']));
      expect(tiles).not.toContain('Z');
      expect(Object.keys(contentFor([]).tiles)).not.toContain('U');
      expect(Object.keys(contentFor(['ketchup:lobbyists']).tiles)).toContain('Z');
    });

    it('§1: tile V has houses 21 and 22; tile W house 25 with a printed garden', () => {
      const s = nd().build();
      expect(house(s, '21')).toMatchObject({ kind: 'printed', order: 21, garden: null });
      expect(house(s, '22')).toMatchObject({ kind: 'printed', order: 22, garden: null });
      expect(house(s, '25').garden?.cells).toEqual([
        { x: 5, y: 8 },
        { x: 6, y: 8 },
      ]);
    });

    it('§1 tile U: three separate lemonade sources; a road route collects 1, 2 or 3', () => {
      const s = nd().build();
      const onU = Object.values(s.board.drinkSources).filter((d) => d.x >= 10 && d.y < 5);
      expect(onU.map((d) => [d.x, d.y, d.drink])).toEqual([
        [11, 2, 'lemonade'],
        [13, 2, 'lemonade'],
        [12, 3, 'lemonade'],
      ]);
      expect(new Set(onU.map((d) => d.id)).size).toBe(3);
      const path = (cells: [number, number][]) => sourcesAdjacentToPath(s.board, cells.map(([x, y]) => ({ x, y })));
      expect(path([[11, 0], [11, 1]])).toHaveLength(1);
      expect(path([[11, 4], [11, 3]])).toHaveLength(2);
      expect(path([[11, 1], [11, 0], [12, 0], [13, 0], [13, 1], [14, 1], [14, 2], [14, 3], [13, 3]])).toHaveLength(3);
    });

    it('§1 tile W: house 25 cannot get another garden and sells at ×2', () => {
      const s = nd().build();
      expect(gardenPlacementProblem(s, house(s, '25').id, 'N')).toMatch(/already has a garden/);
      const ctx = dine(nd().restaurant('p1', 8, 8, 'NW').inventory('p1', { burger: 2 }).demand(25, burgers(2)));
      expect(ctx.of('sale')).toEqual([expect.objectContaining({ player: 'p1', total: 40, lines: [{ good: 'burger', count: 2, each: 20 }] })]);
    });
  });

  describe('§1 apartments', () => {
    it('§1: π and 9¾ are apartments with Dinnertime order 3.14 and 9.75', () => {
      const s = nd().build();
      expect(house(s, 'π')).toMatchObject({ kind: 'apartment', order: 3.14, garden: null });
      expect(house(s, '9¾')).toMatchObject({ kind: 'apartment', order: 9.75, garden: null });
    });

    it('§1: Dinnertime visits π between houses 3 and 4, 9¾ between 9 and 10', () => {
      const b = nd().placedHouse(3, 10, 5, 'W').placedHouse(9, 10, 8, 'E').restaurant('p1', 8, 8, 'NW');
      for (const order of [3, 3.14, 9, 9.75, 21, 22, 25]) b.demand(order, ['burger']);
      const ctx = dine(b);
      const order = ctx.of('houseConsidered').map((e) => ctx.state.board.houses[e.houseId]?.label);
      expect(order).toEqual(['3', 'π', '9', '9¾', '21', '22', '25']);
    });

    it('§1: 2 demand counters instead of each 1, with no maximum', () => {
      expect(baseDemandCapacity({ kind: 'apartment' } as House)).toBeNull();
      const ctx = market(
        nd()
          .demand(3.14, burgers(5))
          .campaign({ owner: 'p1', kind: 'billboard', number: 14, goods: ['burger'], placement: { kind: 'board', x: 3, y: 0, w: 2, h: 1 }, remaining: 3 }),
      );
      const pi = house(ctx.state, 'π');
      expect(pi.demand).toHaveLength(7);
      expect(ctx.of('demandPlaced')).toEqual([expect.objectContaining({ houseId: pi.id, tokens: [expect.objectContaining({ good: 'burger' }), expect.objectContaining({ good: 'burger' })] })]);
    });

    it('§1 (Q-K10): with base First Radio Campaign a radio places 4 on an apartment', () => {
      const scene = (milestone: boolean) => {
        const b = nd().campaign({ owner: 'p1', kind: 'radio', number: 1, goods: ['pizza'], placement: { kind: 'board', x: 3, y: 4, w: 1, h: 1 }, remaining: 3 });
        if (milestone) b.milestone('p1', 'first_radio', 1);
        return market(b);
      };
      expect(house(scene(false).state, 'π').demand).toHaveLength(2);
      expect(house(scene(true).state, 'π').demand).toHaveLength(4);
    });

    it('§1: an ordinary house keeps its cap (control: 3 without a garden)', () => {
      const ctx = market(
        nd()
          .demand(22, burgers(2))
          .campaign({ owner: 'p1', kind: 'billboard', number: 14, goods: ['burger'], placement: { kind: 'board', x: 4, y: 5, w: 2, h: 1 }, remaining: 3 }),
      );
      expect(house(ctx.state, '22').demand).toHaveLength(3);
    });

    it('§1: apartments cannot get a garden', () => {
      const s = nd().build();
      expect(gardenPlacementProblem(s, house(s, 'π').id, 'W')).toMatch(/Only printed houses/);
      expect(gardenPlacementProblem(s, house(s, '9¾').id, 'S')).toMatch(/Only printed houses/);
    });
  });
});
