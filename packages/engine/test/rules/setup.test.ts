/** Setup (base.md §2; DLX p2–6) through createGame and the reducer. */
import { describe, expect, it } from 'vitest';
import { createGame, legalActions, legalPlacements, redactFor } from '../../src/index.js';
import { act, cfg, newGame, rejected, reserve, throughSetup } from '../helpers/game.js';

describe('createGame (base.md §2.1–2.5)', () => {
  it('§2.1/§2.3: 2p supply keeps 1 copy of each 1x card and all copies of the rest; billboards #12, #15, #16 removed', () => {
    const s = newGame(2);
    expect(s.supply.cfo).toBe(1);
    expect(s.supply.brand_director).toBe(1);
    expect(s.supply.waitress).toBe(12);
    expect(s.supply.management_trainee).toBe(18);
    expect(s.supply.ceo).toBeUndefined();
    expect(s.marketingTiles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]);
  });

  it('§2.1: 4p has 2 copies of 1x cards and only #16 removed; 5p has 3 copies and all tiles', () => {
    const s4 = createGame(cfg(4, [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H'], ['I', 'J', 'K', 'L'], ['M', 'N', 'O', 'P']]), 3);
    expect(s4.supply.guru).toBe(2);
    expect(s4.marketingTiles).not.toContain(16);
    expect(s4.marketingTiles).toContain(15);
    const s5 = createGame({ ...cfg(5), map: { kind: 'random' } }, 3);
    expect(s5.supply.guru).toBe(3);
    expect(s5.marketingTiles).toHaveLength(16);
    expect([s5.board.rows, s5.board.cols]).toEqual([5, 4]);
  });

  it('§2.2: random map is rows x cols distinct tiles with random rotations, deterministic per seed', () => {
    const c = { ...cfg(3), map: { kind: 'random' as const } };
    const a = createGame(c, 77);
    const b = createGame(c, 77);
    expect(a.board.tiles).toEqual(b.board.tiles);
    expect([a.board.rows, a.board.cols]).toEqual([3, 4]);
    expect(new Set(a.board.tiles.map((t) => t.templateId)).size).toBe(12);
    expect(a.tilePool).toHaveLength(8);
    const rotations = new Set(Array.from({ length: 8 }, (_, i) => createGame(c, i).board.tiles.map((t) => t.rotation)).flat());
    expect(rotations.size).toBe(4);
  });

  it('§2.4/§12: players start with $0, a CEO and 3 restaurants; bank $50 per player', () => {
    const s = newGame(3);
    for (const p of Object.values(s.players)) {
      expect(p.cash).toBe(0);
      expect(Object.values(p.employees).map((c) => c.employeeId)).toEqual(['ceo']);
      expect(p.restaurantsRemaining).toBe(3);
    }
    expect(s.bank.cash).toBe(150);
    expect(s.ceoSlots).toBe(3);
    expect(Object.keys(s.milestones)).toHaveLength(18);
  });

  it('§13: intro game: $75 per player, no milestones, reserve step skipped', () => {
    let s = newGame(2, 1, undefined, { intro: true });
    expect(s.bank.cash).toBe(150);
    expect(Object.keys(s.milestones)).toHaveLength(0);
    s = throughSetup(s);
    expect(s.phase.kind).toBe('orderOfBusiness');
    expect(s.round).toBe(1);
  });

  it('§13 / Q-B5: intro random map contains all three drink types', () => {
    for (let seed = 0; seed < 10; seed++) {
      const s = createGame({ ...cfg(2), intro: true, map: { kind: 'random' } }, seed);
      const drinks = new Set(Object.values(s.board.drinkSources).map((d) => d.drink));
      expect(drinks.size).toBe(3);
    }
  });

  it('§2.5: initial turn order is a seeded random permutation', () => {
    const orders = new Set(Array.from({ length: 12 }, (_, i) => newGame(3, i).turnOrder.join()));
    expect(orders.size).toBeGreaterThan(1);
    expect(newGame(3, 5).turnOrder).toEqual(newGame(3, 5).turnOrder);
  });

  it('rejects bad configs', () => {
    expect(() => createGame(cfg(1), 1)).toThrow(/2–5 players/);
    expect(() => createGame({ ...cfg(2), modules: ['ketchup:nope' as never] }, 1)).toThrow(/module/i);
    expect(() => createGame({ ...cfg(2), modules: ['ketchup:sixPlayers'] }, 1)).toThrow(/requires ketchup:newDistricts/);
  });
});

describe('first restaurants (base.md §2.6)', () => {
  it('§2.6.1: placement goes in reverse turn order', () => {
    const s = newGame(3);
    expect(s.phase.kind).toBe('setup.restaurants');
    expect(s.awaiting).toEqual({ kind: 'setup.restaurant', players: [s.turnOrder[2]] });
  });

  it('§2.6.3: squares must be empty and the entrance must touch a road from outside', () => {
    const s = newGame(2);
    const me = s.awaiting.players[0] as string;
    // (0,3) is house 2.
    expect(rejected(s, { type: 'setup.placeRestaurant', playerId: me, x: 0, y: 3, entrance: 'NW' }).code).toBe('ILLEGAL_PLACEMENT');
    // (3,3) SE corner (4,4): outside neighbours (4,5) and (5,4) are not road.
    expect(rejected(s, { type: 'setup.placeRestaurant', playerId: me, x: 3, y: 3, entrance: 'SE' }).message).toMatch(/road/);
    const ok = act(s, { type: 'setup.placeRestaurant', playerId: me, x: 3, y: 3, entrance: 'NW' });
    expect(Object.values(ok.board.restaurants)).toHaveLength(1);
    expect(ok.board.cells[3]?.[3]?.kind).toBe('restaurant');
  });

  it('§2.6.3: an entrance may not share a map tile with an existing entrance (setup only)', () => {
    let s = newGame(2);
    const [first, second] = [s.awaiting.players[0] as string, s.turnOrder[0] as string];
    s = act(s, { type: 'setup.placeRestaurant', playerId: first, x: 3, y: 3, entrance: 'NW' });
    // (0,0) NE: corner (1,0) touches road (2,0), but it is on tile (0,0) like the first entrance.
    expect(rejected(s, { type: 'setup.placeRestaurant', playerId: second, x: 0, y: 0, entrance: 'NE' }).message).toMatch(/tile/);
    const placements = legalPlacements(s, second, { kind: 'restaurant' });
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((p) => p.kind === 'restaurant' && !(Math.floor(p.x / 5) === 0 && Math.floor(p.y / 5) === 0 && p.x + 1 < 5 && p.y + 1 < 5))).toBe(true);
  });

  it('§2.6.2: passers place in a second round in normal turn order and may not pass again', () => {
    let s = newGame(3);
    const [a, b, c] = s.turnOrder as [string, string, string];
    s = act(s, { type: 'setup.pass', playerId: c });
    s = act(s, { type: 'setup.placeRestaurant', playerId: b, x: 3, y: 3, entrance: 'NW' });
    s = act(s, { type: 'setup.pass', playerId: a });
    expect(s.phase).toMatchObject({ kind: 'setup.restaurants', round: 2, order: [a, c] });
    expect(s.awaiting.players).toEqual([a]);
    expect(rejected(s, { type: 'setup.pass', playerId: a }).message).toMatch(/must place/);
    expect(legalActions(s, a).map((l) => l.kind)).toEqual(['placement']);
    s = act(s, { type: 'setup.placeRestaurant', playerId: a, x: 5, y: 3, entrance: 'NW' });
    s = act(s, { type: 'setup.placeRestaurant', playerId: c, x: 8, y: 8, entrance: 'NW' });
    expect(s.phase.kind).toBe('setup.reserve');
  });

  it('§2.6: only the current player may place', () => {
    const s = newGame(2);
    const other = s.turnOrder[0] as string;
    expect(rejected(s, { type: 'setup.pass', playerId: other }).code).toBe('NOT_YOUR_TURN');
  });
});

describe('reserve cards (base.md §2.7)', () => {
  it('§2.7: chosen secretly and simultaneously; hidden from others; round 1 starts when all have chosen', () => {
    let s = newGame(2);
    s = act(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as string, x: 3, y: 3, entrance: 'NW' });
    s = act(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as string, x: 5, y: 3, entrance: 'NW' });
    expect(s.awaiting).toMatchObject({ kind: 'setup.reserve' });
    expect([...s.awaiting.players].sort()).toEqual(['p1', 'p2']);
    s = act(s, { type: 'setup.chooseReserve', playerId: 'p1', card: reserve(300) });
    expect(rejected(s, { type: 'setup.chooseReserve', playerId: 'p1', card: reserve(100) }).code).toBe('ALREADY_SUBMITTED');
    expect(rejected(s, { type: 'setup.chooseReserve', playerId: 'p2', card: { kind: 'standard', amount: 300, ceoSlots: 3 } }).code).toBe('INVALID_PAYLOAD');
    const v2 = redactFor(s, 'p2');
    expect(v2.visibleReserves.p1).toBeUndefined();
    expect(v2.submitted.p1).toBe(true);
    expect(JSON.stringify(v2)).not.toContain('"amount":300');
    expect(redactFor(s, 'p1').visibleReserves.p1).toEqual(reserve(300));
    s = act(s, { type: 'setup.chooseReserve', playerId: 'p2', card: reserve(200) });
    expect(s.round).toBe(1);
    // Round 1: everyone holds only the CEO, so Restructuring resolves itself (base.md §4.3).
    expect(s.phase.kind).toBe('orderOfBusiness');
  });
});
