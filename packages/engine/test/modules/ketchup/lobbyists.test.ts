/**
 * Lobbyists (ketchup.md §2; DLX p15–17).
 *
 * Working-phase specs use a real game on MAP3 (p1 restaurant (3,3) NW on tile A, p2 (5,3) NW on
 * tile L). Range origin `from` = p1's NW entrance corner (3,3); its road starts are (2,3) and
 * (3,2), both at distance 0. (2,5) and (3,7) are road squares at distance 1 on tile F.
 */
import { describe, expect, it } from 'vitest';
import type { Cell, GameState, Uid } from '../../../src/index.js';
import { legalPlacements } from '../../../src/index.js';
import type { RouteStart } from '../../../src/types/actions.js';
import { setPhase } from '../../../src/core/phase.js';
import { contentFor } from '../../../src/modules/registry.js';
import { distanceField, fieldAt, restaurantStarts, roadAt } from '../../../src/map/pathfinding.js';
import { stagesFor } from '../../../src/rules/working/stages.js';
import { stateProblems } from '../../../src/testing/validate.js';
import { houseMultiplier } from '../../../src/modules/ketchup/shared.js';
import { mapTileProblem, roadArrows, roadProblem } from '../../../src/modules/ketchup/lobbyists.js';
import { act, actE, rejected, workingTurn } from '../../helpers/game.js';
import { dine, kb, kctx, kgame } from './helpers.js';

const M = ['ketchup:lobbyists'] as const;
const KMAP = [
  ['X', 'Y', 'U'],
  ['V', 'W', 'Z'],
];

const c = (x: number, y: number): Cell => ({ x, y });
const p1Restaurant = (s: GameState) => Object.values(s.board.restaurants).find((r) => r.owner === 'p1') as NonNullable<GameState['board']['restaurants'][string]>;
const ents = (s: GameState, kind: string) => Object.values(s.board.entities).filter((e) => e.kind === kind);

/** p1's Working turn with two lobbyists at work. */
function lobbyTurn(setup?: (g: GameState) => void) {
  const g = kgame(2, [...M]);
  setup?.(g);
  const { s, work } = workingTurn(g, 'p1', { work: ['ketchup:lobbyist', 'ketchup:lobbyist'] });
  const r = p1Restaurant(s);
  const from: RouteStart = { kind: 'restaurant', restaurantId: r.id, corner: r.entrance };
  const road = (cells: Cell[], i = 0, f: RouteStart = from, arrows = roadArrows(cells) ?? []) => ({
    type: 'ketchup:lobbyists.placeRoad' as const,
    playerId: 'p1',
    cardUid: work[i] as Uid,
    cells,
    arrows,
    from: f,
  });
  const park = (x: number, y: number, w: number, h: number, i = 0, f: RouteStart = from) => ({
    type: 'ketchup:lobbyists.placePark' as const,
    playerId: 'p1',
    cardUid: work[i] as Uid,
    x,
    y,
    w,
    h,
    from: f,
  });
  return { s, work, from, road, park, r };
}

const distFromP1 = (s: GameState, cell: Cell) => fieldAt(distanceField(s.board, restaurantStarts(s.board, p1Restaurant(s))), cell);

describe('Lobbyists (ketchup.md §2)', () => {
  describe('§2 card and sub-step', () => {
    it('§2: Lobbyist is an entry-level purple card with a salary and road range 2 (x6)', () => {
      expect(contentFor([...M]).employees['ketchup:lobbyist']).toMatchObject({
        entry: true,
        salary: true,
        unique: false,
        colour: 'purple',
        count: 6,
        ability: { kind: 'lobbyist', range: 2 },
      });
    });

    it('§2: sub-step "3f½" (lobbyists) sits between houses and restaurants, only with the module', () => {
      const withModule = stagesFor(kgame(2, [...M]), 'p1');
      expect(withModule.slice(withModule.indexOf('houses'), withModule.indexOf('restaurants') + 1)).toEqual(['houses', 'lobbyists', 'restaurants']);
      expect(stagesFor(kgame(2, []), 'p1')).not.toContain('lobbyists');
    });
  });

  describe('§2 roads', () => {
    it('§2: arrows sit at both ends of a straight road, pointing outward', () => {
      expect(roadArrows([c(3, 5), c(4, 5), c(5, 5)])).toEqual([
        { from: c(3, 5), dir: 'W' },
        { from: c(5, 5), dir: 'E' },
      ]);
      expect(roadArrows([c(3, 5), c(4, 5), c(4, 6)])).toBeNull();
      expect(roadArrows([c(3, 5)])).toBeNull();
    });

    it('§2 rule B: an arrow at a road within road range 2; road under construction, roadworks on the target', () => {
      const { s, road, work } = lobbyTurn();
      expect(distFromP1(s, c(2, 6))).toBe(1);
      const r = actE(s, road([c(3, 5), c(4, 5)]));
      const t = r.state;
      expect(t.turn?.stage).toBe('lobbyists');
      expect(t.turn?.uses[work[0] as Uid] ?? 0).toBe(0);
      const [entity] = ents(t, 'lobbyistRoad');
      expect(entity).toMatchObject({ owner: 'p1', underConstruction: true, cells: [c(3, 5), c(4, 5)] });
      expect(t.board.cells[5]?.[3]?.road).toMatchObject({ underConstruction: true });
      // Under construction: unusable by every route.
      expect(roadAt(t.board, c(3, 5))).toBeNull();
      expect(distFromP1(t, c(3, 5))).toBe(Infinity);
      // Roadworks on the road square the W arrow points at; the E arrow points at an empty square.
      expect(ents(t, 'roadworks')).toEqual([expect.objectContaining({ x: 2, y: 5 })]);
      expect(t.board.cells[5]?.[2]?.road?.roadworks).toBe(1);
      // Passing the roadworks costs +1 (questions.md Q-K2).
      expect(distFromP1(t, c(2, 6))).toBe(2);
      expect((t.moduleState['ketchup:lobbyists'] as { roads: Record<string, number> }).roads).toEqual({ '2': 3, '3': 4 });
      expect(r.events.some((e) => e.type === 'entityPlaced')).toBe(true);
    });

    it('§2 rule A: an arrow may point at your entrance corner itself', () => {
      const { s } = lobbyTurn();
      const r = p1Restaurant(s);
      const sw = JSON.parse(JSON.stringify(s)) as GameState;
      (sw.board.restaurants[r.id] as { entrance: string }).entrance = 'SW'; // corner (3,4); (3,5) below it is empty
      const from: RouteStart = { kind: 'restaurant', restaurantId: r.id, corner: 'SW' };
      const atEntrance = [c(3, 5), c(3, 6)]; // N arrow → (3,4)
      const notAtEntrance = [c(3, 5), c(4, 5)]; // W arrow → (2,5), 1 away
      // Range 0 isolates rule A: no road is within distance 0 here except the corner's own starts.
      expect(roadProblem(sw, 'p1', atEntrance, roadArrows(atEntrance) ?? [], from, 0)).toBeNull();
      expect(roadProblem(sw, 'p1', notAtEntrance, roadArrows(notAtEntrance) ?? [], from, 0)).toMatch(/One arrow/);
      // Real action: the entrance gets no roadworks (not a road); the S arrow's road (3,7) does.
      const t = workingTurn(sw, 'p1', { work: ['ketchup:lobbyist'] });
      const done = act(t.s, { type: 'ketchup:lobbyists.placeRoad', playerId: 'p1', cardUid: t.work[0] as Uid, cells: atEntrance, arrows: roadArrows(atEntrance) ?? [], from });
      expect(ents(done, 'roadworks')).toEqual([expect.objectContaining({ x: 3, y: 7 })]);
    });

    it('§2: anchoring is measured from `from`, which must be one of your entrances or coffee shops', () => {
      const { s, road, r } = lobbyTurn();
      const p2 = Object.values(s.board.restaurants).find((x) => x.owner === 'p2');
      expect(rejected(s, road([c(3, 5), c(4, 5)], 0, { kind: 'restaurant', restaurantId: p2?.id as string, corner: 'NW' })).message).toMatch(/Range must start/);
      expect(rejected(s, road([c(3, 5), c(4, 5)], 0, { kind: 'restaurant', restaurantId: r.id, corner: 'SE' })).message).toMatch(/Range must start/);
    });

    it('§2: rejected when no arrow reaches the entrance or a road within range 2', () => {
      const { s, road } = lobbyTurn();
      // Tile Q: N arrow → (13,12), far beyond range 2; S arrow off the map.
      expect(rejected(s, road([c(13, 13), c(13, 14)])).message).toMatch(/One arrow/);
    });

    it('§2: straight 2 or 3 squares, on empty map squares, arrows at the ends', () => {
      const { s, road } = lobbyTurn();
      expect(rejected(s, road([c(3, 5), c(4, 5), c(5, 5), c(6, 5)])).message).toMatch(/2 or 3 squares/);
      expect(rejected(s, road([c(3, 5), c(4, 5), c(4, 6)], 0, undefined, [])).message).toMatch(/straight/);
      expect(rejected(s, road([c(0, -1), c(0, 0)])).message).toMatch(/off the map/);
      expect(rejected(s, road([c(2, 8), c(2, 9), c(2, 10)])).message).toMatch(/empty/); // (2,10) is road
      expect(rejected(s, road([c(3, 5), c(4, 5)], 0, undefined, [{ from: c(3, 5), dir: 'N' }, { from: c(4, 5), dir: 'E' }])).message).toMatch(/arrows/);
      // A 3-square road is fine.
      expect(act(s, road([c(3, 5), c(4, 5), c(5, 5)])).board.cells[5]?.[5]?.kind).toBe('road');
    });

    it('§2: an arrow may point at roadworks placed earlier this turn: no second marker', () => {
      const { s, road } = lobbyTurn();
      const t1 = act(s, road([c(3, 5), c(3, 6)])); // S arrow → (3,7)
      expect(ents(t1, 'roadworks')).toEqual([expect.objectContaining({ x: 3, y: 7 })]);
      // (3,7) now costs 2 from the entrance — still within range 2.
      const t2 = act(t1, road([c(3, 8), c(3, 9)], 1)); // N arrow → (3,7) again
      expect(ents(t2, 'roadworks')).toHaveLength(1);
      expect(t2.board.cells[7]?.[3]?.road?.roadworks).toBe(1);
      expect(ents(t2, 'lobbyistRoad')).toHaveLength(2);
    });

    it('§2: pieces are limited (placeholder stock, questions.md Q-K1)', () => {
      const { s, road } = lobbyTurn((g) => {
        g.moduleState['ketchup:lobbyists'] = { roads: { '2': 0, '3': 4 }, parks: { '1x3': 2, '2x3': 2 } };
      });
      expect(rejected(s, road([c(3, 5), c(4, 5)])).message).toMatch(/No road tiles of length 2/);
      expect(act(s, road([c(3, 5), c(4, 5), c(5, 5)])).moduleState['ketchup:lobbyists']).toMatchObject({ roads: { '2': 0, '3': 3 } });
    });

    it('§2: needs a lobbyist at work with a use left', () => {
      const { s, road } = lobbyTurn();
      const t = act(s, road([c(3, 5), c(4, 5)]));
      expect(rejected(t, road([c(3, 8), c(3, 9)])).ok).toBe(false);
    });

    it('§2: legalPlacements lists roads and parks the action accepts', () => {
      const { s, work } = lobbyTurn();
      const roads = legalPlacements(s, 'p1', { kind: 'lobbyistRoad', cardUid: work[0] as Uid });
      expect(roads.length).toBeGreaterThan(0);
      const first = roads[0] as Extract<(typeof roads)[number], { kind: 'lobbyistRoad' }>;
      act(s, { type: 'ketchup:lobbyists.placeRoad', playerId: 'p1', cardUid: work[0] as Uid, cells: first.cells, arrows: first.arrows, from: first.from });
      const parks = legalPlacements(s, 'p1', { kind: 'park', cardUid: work[0] as Uid });
      expect(parks).toContainEqual(expect.objectContaining({ kind: 'park', x: 3, y: 5, w: 3, h: 1 }));
    });

    it('§2: Clean up removes the roadworks and opens the roads', () => {
      const { s, road } = lobbyTurn();
      const t = act(s, road([c(3, 5), c(4, 5)]));
      t.turn = null;
      const ctx = kctx(t);
      setPhase(ctx, { kind: 'cleanup' });
      const u = ctx.state;
      expect(ents(u, 'roadworks')).toEqual([]);
      expect(u.board.cells[5]?.[2]?.road?.roadworks).toBe(0);
      expect(ents(u, 'lobbyistRoad')).toEqual([expect.objectContaining({ underConstruction: false })]);
      expect(roadAt(u.board, c(3, 5))).not.toBeNull();
      // The finished road connects to the road it touches.
      expect(distFromP1(u, c(4, 5))).toBe(1);
      expect(distFromP1(u, c(2, 6))).toBe(1);
    });
  });

  describe('§2 parks', () => {
    it('§2: 1x3 and 2x3 parks next to a road within road range 2', () => {
      const { s, park } = lobbyTurn();
      const t = act(s, park(3, 5, 3, 1));
      expect(ents(t, 'park')).toEqual([expect.objectContaining({ x: 3, y: 5, w: 3, h: 1, printed: false })]);
      expect(t.board.cells[5]?.[4]?.kind).toBe('park');
      expect(act(t, park(3, 8, 2, 3, 1)).moduleState['ketchup:lobbyists']).toMatchObject({ parks: { '1x3': 1, '2x3': 1 } });
    });

    it('§2: other shapes, occupied squares, off-map, far away and an empty stock are rejected', () => {
      const { s, park } = lobbyTurn();
      expect(rejected(s, park(3, 5, 2, 2)).message).toMatch(/Park tiles are/);
      expect(rejected(s, park(2, 5, 3, 1)).message).toMatch(/empty/);
      expect(rejected(s, park(13, 13, 3, 1)).message).toMatch(/on the map/);
      expect(rejected(s, park(8, 13, 3, 1)).message).toMatch(/range 2/); // tile R, next to (7,13)… far away
      const none = lobbyTurn((g) => {
        g.moduleState['ketchup:lobbyists'] = { roads: { '2': 4, '3': 4 }, parks: { '1x3': 0, '2x3': 2 } };
      });
      expect(rejected(none.s, none.park(3, 5, 3, 1)).message).toMatch(/No 1x3 park/);
    });

    it('§2: a house next to a park pays ×2; with a garden ×3; several parks count once', () => {
      // KMAP: house 22 (2..3,5..6) has no garden; house 25 (5..6,6..7) has a printed garden.
      const b = kb(2, ['ketchup:newDistricts', ...M], KMAP);
      const plain = b.build();
      const h = (s: GameState, label: string) => Object.values(s.board.houses).find((x) => x.label === label) as NonNullable<GameState['board']['houses'][string]>;
      expect(houseMultiplier(plain, h(plain, '22'))).toBe(1);
      expect(houseMultiplier(plain, h(plain, '25'))).toBe(2);
      const parked = kb(2, ['ketchup:newDistricts', ...M], KMAP).entity({ kind: 'park', id: 'entity-p1', x: 4, y: 5, w: 3, h: 1, printed: false });
      const s = parked.build();
      expect(houseMultiplier(s, h(s, '22'))).toBe(2);
      expect(houseMultiplier(s, h(s, '25'))).toBe(3);
      const two = kb(2, ['ketchup:newDistricts', ...M], KMAP)
        .entity({ kind: 'park', id: 'entity-p1', x: 4, y: 5, w: 3, h: 1, printed: false })
        .entity({ kind: 'park', id: 'entity-p2', x: 0, y: 5, w: 1, h: 2, printed: false })
        .build();
      expect(houseMultiplier(two, h(two, '22'))).toBe(2);
    });

    it('§2: the park multiplier applies to Dinnertime sales (×3 = $30 for a burger)', () => {
      const scene = (withPark: boolean) => {
        const b = kb(2, ['ketchup:newDistricts', ...M], KMAP);
        if (withPark) b.entity({ kind: 'park', id: 'entity-p1', x: 4, y: 5, w: 3, h: 1, printed: false });
        return b.restaurant('p1', 8, 8, 'NW').inventory('p1', { burger: 1 }).demand(25, ['burger']);
      };
      // House 25 (printed garden): ×2 without the park, ×3 with it.
      expect(dine(scene(false)).of('sale')).toEqual([expect.objectContaining({ player: 'p1', total: 20 })]);
      expect(dine(scene(true)).of('sale')).toEqual([expect.objectContaining({ player: 'p1', total: 30, lines: [{ good: 'burger', count: 1, each: 30 }] })]);
    });
  });

  describe('§2 First Lobbyist Used', () => {
    it('§2: the first road or park claims the milestone; no leftover tiles → nothing', () => {
      const { s, park } = lobbyTurn();
      const t = act(s, park(3, 5, 3, 1));
      expect(t.players.p1?.milestones['ketchup:first_lobbyist_used']).toBeDefined();
      expect(t.tilePool).toEqual([]);
      expect(t.pending).toEqual([]);
    });

    it('§2: with leftover tiles an extraMapTile choice is queued', () => {
      const { s, park } = lobbyTurn((g) => {
        g.tilePool = ['B', 'C'];
      });
      const t = act(s, park(3, 5, 3, 1));
      expect(t.pending).toEqual([expect.objectContaining({ kind: 'extraMapTile', player: 'p1' })]);
    });

    function withChoice() {
      const { s, park } = lobbyTurn((g) => {
        g.tilePool = ['B', 'C'];
      });
      const t = act(s, park(3, 5, 3, 1));
      const choiceId = t.pending[0]?.id as string;
      const tile = (row: number, col: number, rotation: 0 | 1 | 2 | 3 = 0, templateId?: 'B' | 'C' | 'D') => ({
        type: 'ketchup:lobbyists.placeMapTile' as const,
        playerId: 'p1',
        choiceId,
        row,
        col,
        rotation,
        ...(templateId ? { templateId } : {}),
      });
      return { t, tile };
    }

    it('§2: placeMapTile adds the tile east of the map (no shift)', () => {
      const { t, tile } = withChoice();
      const r = actE(t, tile(1, 3, 1, 'C'));
      const u = r.state;
      expect(u.pending).toEqual([]);
      expect(u.tilePool).toEqual(['B']);
      expect([u.board.rows, u.board.cols, u.board.w, u.board.h]).toEqual([3, 4, 20, 15]);
      expect(u.board.tiles).toContainEqual(expect.objectContaining({ templateId: 'C', row: 1, col: 3, rotation: 1 }));
      expect(r.events).toContainEqual(expect.objectContaining({ type: 'mapTileAdded', templateId: 'C', row: 1, col: 3 }));
      expect(p1Restaurant(u)).toMatchObject({ x: 3, y: 3 });
      expect(stateProblems(u)).toEqual([]);
    });

    it('§2: placing at row −1 grows the board north and shifts every coordinate', () => {
      const { t, tile } = withChoice();
      const before = JSON.parse(JSON.stringify(t)) as GameState;
      const u = act(t, tile(-1, 0)); // default: first leftover (B)
      expect(u.tilePool).toEqual(['C']);
      expect([u.board.rows, u.board.cols]).toEqual([4, 3]);
      expect(u.board.tiles).toContainEqual(expect.objectContaining({ templateId: 'B', row: 0, col: 0 }));
      expect(p1Restaurant(u)).toMatchObject({ x: 3, y: 8 });
      const oldPark = ents(before, 'park')[0];
      expect(ents(u, 'park')[0]).toMatchObject({ x: (oldPark as { x: number }).x, y: (oldPark as { y: number }).y + 5 });
      for (const h of Object.values(before.board.houses)) expect(u.board.houses[h.id]?.cells[0]).toEqual({ x: h.cells[0]?.x, y: (h.cells[0]?.y ?? 0) + 5 });
      // Tile B brings its printed house 4.
      expect(Object.values(u.board.houses).map((h) => h.order)).toContain(4);
      expect(stateProblems(u)).toEqual([]);
      // Tile B's x=2 road joins tile A's x=2 road: the new tile is reachable.
      expect(distFromP1(u, c(2, 0))).toBe(1);
    });

    it('§2: placing at column −1 shifts x', () => {
      const { t, tile } = withChoice();
      const u = act(t, tile(0, -1));
      expect([u.board.rows, u.board.cols]).toEqual([3, 4]);
      expect(p1Restaurant(u)).toMatchObject({ x: 8, y: 3 });
      expect(stateProblems(u)).toEqual([]);
    });

    it('§2: the tile must be next to the map, on a free spot, from the leftovers', () => {
      const { t, tile } = withChoice();
      expect(rejected(t, tile(0, 0)).message).toMatch(/already a tile/);
      expect(rejected(t, tile(-1, -1)).message).toMatch(/orthogonally adjacent/);
      expect(rejected(t, tile(5, 0)).message).toMatch(/next to the map/);
      expect(rejected(t, tile(-1, 0, 0, 'D')).message).toMatch(/leftover/);
    });

    it('§2: not beside an airplane aligned with the new tile edge', () => {
      const s = kb(2, [...M])
        .campaign({ owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: { kind: 'airplane', side: 'N', offset: 2, width: 1 }, remaining: 2 })
        .mutate((g) => {
          g.tilePool = ['B'];
        })
        .build();
      expect(mapTileProblem(s, -1, 0, 0, 'B')).toMatch(/airplane/);
      expect(mapTileProblem(s, -1, 1, 0, 'B')).toBeNull();
      expect(mapTileProblem(s, 0, -1, 0, 'B')).toBeNull();
    });
  });
});
