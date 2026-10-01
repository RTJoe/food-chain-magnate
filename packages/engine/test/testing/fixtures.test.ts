import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURES, renderAscii, stateBuilder, stateProblems } from '../../src/testing/index.js';
import type { GameState } from '../../src/types/state.js';

const fixtureJson = (name: string): GameState =>
  JSON.parse(readFileSync(new URL(`../../src/testing/fixtures/${name}.json`, import.meta.url), 'utf8')) as GameState;

describe('fixtures', () => {
  for (const [name, make] of Object.entries(FIXTURES)) {
    it(`${name}: builder output is valid and matches the committed JSON`, () => {
      const state = make();
      expect(stateProblems(state)).toEqual([]);
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      expect(fixtureJson(name)).toEqual(state);
    });
  }

  it('dinnertime fixture has every base campaign kind, demand, a garden and drink sources', () => {
    const s = FIXTURES.dinnertime();
    const kinds = new Set(Object.values(s.board.campaigns).map((c) => c.kind));
    expect([...kinds].sort()).toEqual(['airplane', 'billboard', 'mailbox', 'radio']);
    const houses = Object.values(s.board.houses);
    expect(houses.filter((h) => h.demand.length > 0).length).toBeGreaterThanOrEqual(4);
    expect(houses.some((h) => h.garden?.source === 'gardenTile')).toBe(true);
    expect(houses.some((h) => h.kind === 'placed')).toBe(true);
    expect(Object.keys(s.board.drinkSources).length).toBeGreaterThan(0);
    expect(Object.values(s.board.restaurants).some((r) => r.status === 'comingSoon')).toBe(true);
    expect(s.phase.kind).toBe('dinnertime');
  });

  it('ketchup fixture has every module entity kind', () => {
    const s = FIXTURES.ketchup();
    const kinds = new Set(Object.values(s.board.entities).map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['coffeeShop', 'freeway', 'lobbyistRoad', 'park', 'roadworks']);
    const houseKinds = new Set(Object.values(s.board.houses).map((h) => h.kind));
    expect(houseKinds).toEqual(new Set(['printed', 'apartment', 'rural']));
  });
});

describe('stateBuilder', () => {
  it('builds a default valid state for every player count', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const s = stateBuilder({ players: n }).build();
      expect(stateProblems(s)).toEqual([]);
      expect(s.turnOrder).toHaveLength(n);
      expect(s.bank.cash).toBe(50 * n);
    }
  });

  it('applies rotation (map.md §3) and edge-midpoint connectivity (map.md §2)', () => {
    const s = stateBuilder().tiles([['O1', 'A'], ['L', 'D']]).build();
    // Tile O rotated once: the beer at canonical (0,1) moves to (1,4).
    expect(Object.values(s.board.drinkSources).map(({ x, y, drink }) => ({ x, y, drink }))).toContainEqual({ x: 4, y: 1, drink: 'beer' });
    // The W–E road through row 2 crosses from tile O1 into tile A at the edge midpoint.
    expect(s.board.cells[2]?.[4]?.road?.links).toContain('E');
    expect(renderAscii(s.board).split('\n')).toHaveLength(10);
  });

  it('rejects overlapping pieces and road-less entrances', () => {
    const b = stateBuilder().tiles([['A', 'A'], ['A', 'A']]);
    expect(() => b.restaurant('p1', 0, 3, 'NE')).toThrow(/not empty/);
    expect(() => stateBuilder().tiles([['A', 'A'], ['A', 'A']]).restaurant('p1', 3, 3, 'SE')).toThrow(/does not touch a road/);
  });

  it('tracks supply when cards are added', () => {
    const before = stateBuilder({ players: 2 }).build().supply.cfo;
    const after = stateBuilder({ players: 2 }).card('p1', 'cfo').build().supply.cfo;
    expect(before).toBe(1);
    expect(after).toBe(0);
  });
});
