/** Map generation, connectivity, distances and campaign reach (map.md; base.md §2.2, §9, §14). */
import { describe, expect, it } from 'vitest';
import type { Board, Restaurant } from '../../src/index.js';
import { createRng } from '../../src/index.js';
import { BASE_TILES } from '../../src/map/tiles.js';
import { buildBoard, rotateTileCell, type LayoutEntry } from '../../src/map/grid.js';
import { drawLayout, mapSize } from '../../src/map/generate.js';
import { distanceField, fieldAt, restaurantHouseDistance, restaurantStarts } from '../../src/map/pathfinding.js';
import { airplaneReach, billboardReach, mailboxReach, radioReach } from '../../src/map/reach.js';
import { MAP3 } from '../helpers/game.js';

const TILES = Object.fromEntries(BASE_TILES.map((t) => [t.id, t]));
const layoutOf = (rows: string[][]): LayoutEntry[][] => rows.map((r) => r.map((t) => ({ templateId: t[0] as never, rotation: Number(t[1] ?? 0) as 0 | 1 | 2 | 3 })));
const board = (rows: string[][]): Board => buildBoard(layoutOf(rows), TILES, { nextId: 1 });
const houseNo = (b: Board, n: number) => Object.values(b.houses).find((h) => h.order === n) as NonNullable<Board['houses'][string]>;
const resto = (x: number, y: number, entrance: Restaurant['entrance'], driveIn = false): Restaurant => ({ id: 'r', owner: 'p1', x, y, entrance, status: 'open', placedRound: 1, ...(driveIn ? { driveIn } : {}) });

describe('generation (base.md §2.1–2.2; map.md §1, §3)', () => {
  it('§2.1: map sizes by player count', () => {
    expect([2, 3, 4, 5].map(mapSize)).toEqual([[3, 3], [3, 4], [4, 4], [5, 4]]);
  });

  it('§2.2: draw without replacement, random rotations, deterministic per RNG state', () => {
    const ids = BASE_TILES.map((t) => t.id);
    const a = drawLayout(createRng(9), ids, TILES, 4, 4);
    const b = drawLayout(createRng(9), ids, TILES, 4, 4);
    expect(a).toEqual(b);
    const drawn = a.layout.flat().map((e) => e.templateId);
    expect(new Set(drawn).size).toBe(16);
    expect(a.leftover).toHaveLength(4);
  });

  it('map.md §3: one clockwise turn maps (r, c) to (c, 4 − r)', () => {
    expect(rotateTileCell(0, 0, 1)).toEqual([0, 4]);
    expect(rotateTileCell(3, 0, 1)).toEqual([0, 1]);
    expect(rotateTileCell(3, 0, 2)).toEqual([1, 4]);
    // Tile A house 2 sits bottom-left; rotated once it sits top-left.
    const b = board([['A1']]);
    expect(houseNo(b, 2).cells).toHaveLength(4);
    expect(houseNo(b, 2).cells.every((c) => c.y <= 1 && c.x <= 1)).toBe(true);
  });

  it('the standard test map matches the documented ASCII layout', () => {
    const b = board(MAP3);
    const g: Record<string, string> = { road: '#', empty: '.', house: 'H', drink: 'D' };
    const ascii = b.cells.map((row) => row.map((c) => g[c.kind] ?? '?').join(''));
    expect(ascii.slice(0, 4)).toEqual(['..#....#....#..', '..#....#...D#..', '###############', 'HH#.....D......']);
    expect(Object.values(b.drinkSources)).toHaveLength(7);
  });
});

describe('road connectivity and distance (base.md §14; map.md §2)', () => {
  it('§14: distance counts tile borders crossed, not squares', () => {
    const b = board(MAP3);
    const h2 = houseNo(b, 2);
    expect(restaurantHouseDistance(b, resto(3, 3, 'NW'), h2)).toBe(0);
    expect(restaurantHouseDistance(b, resto(5, 3, 'NW'), h2)).toBe(1);
    expect(restaurantHouseDistance(b, resto(8, 8, 'NW'), h2)).toBe(2);
  });

  it('Q-M1: parallel roads along a shared tile edge connect along their length (DLX p8 item E)', () => {
    // Two ring-road tiles C side by side: column 4 and column 5 are both road.
    const b = board([['C', 'C']]);
    expect(b.cells[1]?.[4]?.road?.links).toContain('E');
    expect(b.cells[1]?.[5]?.road?.links).toContain('W');
    const field = distanceField(b, [{ cell: { x: 4, y: 2 }, cost: 0 }]);
    expect(fieldAt(field, { x: 5, y: 2 })).toBe(1);
  });

  it('§14: a bridge is straight-through only (tile G)', () => {
    const b = board([['G']]);
    expect(b.cells[2]?.[2]?.road?.bridge).toBe(true);
    // From the west arm, the north arm is unreachable without turning on the bridge.
    const field = distanceField(b, [{ cell: { x: 0, y: 2 }, cost: 0 }]);
    expect(fieldAt(field, { x: 4, y: 2 })).toBe(0);
    expect(fieldAt(field, { x: 2, y: 0 })).toBe(Infinity);
  });

  it('§6.3a: with a drive-in every corner is an entrance', () => {
    const b = board(MAP3);
    expect(restaurantStarts(b, resto(3, 3, 'NW')).length).toBe(2);
    expect(restaurantStarts(b, resto(3, 3, 'NW', true)).length).toBeGreaterThan(2);
  });
});

describe('campaign reach (base.md §9)', () => {
  const b = board(MAP3);
  const h2 = houseNo(b, 2).id;
  const h10 = houseNo(b, 10).id;

  it('§9 billboard: houses orthogonally adjacent to any of its squares', () => {
    expect(billboardReach(b, [{ x: 2, y: 3 }])).toEqual([h2]);
    expect(billboardReach(b, [{ x: 3, y: 4 }])).toEqual([]);
  });

  it('§9 mailbox: flood fill over non-road squares; roads block', () => {
    // (3,3)-(4,4) block is fenced by roads on x=2 → house 2 (x 0..1) is not reached.
    expect(mailboxReach(b, [{ x: 3, y: 3 }])).toEqual([]);
    expect(mailboxReach(b, [{ x: 0, y: 3 }]).sort()).toEqual([h10, h2].sort());
  });

  it('§9 airplane: houses in the covered rows/columns', () => {
    expect(airplaneReach(b, { kind: 'airplane', side: 'W', offset: 3, width: 1 })).toEqual([h2]);
    expect(airplaneReach(b, { kind: 'airplane', side: 'N', offset: 0, width: 1 }).sort()).toEqual([h10, h2].sort());
    expect(airplaneReach(b, { kind: 'airplane', side: 'N', offset: 5, width: 5 })).toEqual([]);
  });

  it('§9 radio: houses on its tile or the 8 around it', () => {
    expect(radioReach(b, { x: 14, y: 14 })).toEqual([]);
    expect(radioReach(b, { x: 7, y: 7 }).sort()).toEqual([h10, h2].sort());
  });
});
