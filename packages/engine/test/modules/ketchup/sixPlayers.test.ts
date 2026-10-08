/**
 * Six Players (ketchup.md §17; DLX p30). Requires New Districts.
 */
import { describe, expect, it } from 'vitest';
import type { GameConfig, GameState } from '../../../src/index.js';
import { createGame, configProblem } from '../../../src/core/createGame.js';
import { cfg } from '../../helpers/game.js';

const SIX = ['ketchup:sixPlayers', 'ketchup:newDistricts'] as const;
const CHAINS = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc', 'siap_faji'] as const;

/** Random-map config for n players (chains in order, the sixth being Siap Faji). */
function config(n: number, modules: GameConfig['modules']): GameConfig {
  const base = cfg(n);
  return {
    ...base,
    modules,
    map: { kind: 'random' },
    players: base.players.map((p, i) => ({ ...p, chain: CHAINS[i] ?? 'siap_faji' })),
  };
}
const six = (seed = 3): GameState => createGame(config(6, [...SIX]), seed);

describe('Six Players - configuration (ketchup.md §17)', () => {
  it('§17: requires New Districts', () => {
    expect(configProblem(config(6, ['ketchup:sixPlayers']))).toMatch(/requires ketchup:newDistricts/);
    expect(() => createGame(config(6, ['ketchup:sixPlayers']), 1)).toThrow(/requires ketchup:newDistricts/);
    expect(configProblem(config(6, [...SIX]))).toBeNull();
  });

  it('§17: seats up to 6 players with the module', () => {
    expect(configProblem(config(6, [...SIX]))).toBeNull();
    expect(configProblem(config(5, [...SIX]))).toBeNull();
  });

  it('§17: 7 players are rejected, with or without the module', () => {
    expect(configProblem(config(7, [...SIX]))).toMatch(/2–6 players/);
    expect(() => createGame(config(7, [...SIX]), 1)).toThrow(/2–6 players/);
    expect(configProblem(config(7, []))).toMatch(/2–5 players/);
  });

  it('§17: 6 players need the module (base game allows 5)', () => {
    expect(configProblem(config(6, []))).toMatch(/2–5 players/);
    expect(configProblem(config(5, []))).toBeNull();
  });

  it('§17: a 1-player game is still rejected', () => {
    expect(configProblem(config(1, [...SIX]))).toMatch(/2–6 players/);
  });
});

describe('Six Players - a 6-player game (ketchup.md §17)', () => {
  it('§17: Siap Faji is the sixth chain, and all six players are seated', () => {
    const s = six();
    expect(Object.keys(s.players)).toHaveLength(6);
    expect(s.players.p6?.chain).toBe('siap_faji');
    expect(s.turnOrder).toHaveLength(6);
    expect(s.phase).toMatchObject({ kind: 'setup.reserve' });
    expect(s.awaiting.players).toHaveLength(6);
  });

  it('§17: the map is a 4x6 grid of tiles (24 tiles, New Districts tiles available)', () => {
    for (const seed of [1, 2, 3]) {
      const s = createGame(config(6, [...SIX]), seed);
      expect(s.board.rows).toBe(4);
      expect(s.board.cols).toBe(6);
      expect(s.board.tiles).toHaveLength(24);
      expect(new Set(s.board.tiles.map((t) => t.templateId)).size).toBe(24);
    }
  });

  it('§17: the map size grows past the 5-player 5x4 map: 6 players use 4 rows x 6 cols', () => {
    const five = createGame(config(5, [...SIX]), 1);
    expect([five.board.rows, five.board.cols]).toEqual([5, 4]);
  });

  it('§17: the bank starts at $50 x 6 = $300', () => {
    expect(six().bank).toMatchObject({ cash: 300, breaks: 0 });
  });

  it('§17: 1x cards have 3 copies each (as with 5 players)', () => {
    const s = six();
    for (const id of ['executive_vp', 'luxuries_manager', 'regional_manager', 'cfo', 'hr_director', 'guru', 'zeppelin_pilot', 'brand_director', 'burger_chef', 'pizza_chef'] as const) {
      expect(s.supply[id]).toBe(3);
    }
    expect(s.supply.waitress).toBe(12);
  });

  it('§17: no billboards are removed (all marketing tiles 1-16 in play)', () => {
    const s = six();
    for (let n = 1; n <= 16; n++) expect(s.marketingTiles).toContain(n);
  });

  it('§17: no other rule changes: every player starts with $0, a CEO and 3 restaurants', () => {
    const s = six();
    for (const p of Object.values(s.players)) {
      expect(p).toMatchObject({ cash: 0, restaurantsRemaining: 3 });
      expect(Object.keys(p.employees)).toHaveLength(1);
    }
  });
});
