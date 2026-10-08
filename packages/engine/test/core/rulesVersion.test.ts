/** Rules versions (core/rulesVersion.ts): saved games replay under the rules they were played with. */
import { describe, expect, it } from 'vitest';
import type { Action, Corner, GameConfig, PlayerId } from '../../src/index.js';
import { createGame, legacyRules, replay, restoredConfig, RULES_VERSION } from '../../src/index.js';
import { act, cfg, reserve, SPOTS } from '../helpers/game.js';

/** An old-order setup log (version 1): first restaurants, then reserve cards. */
function oldOrderLog(config: GameConfig, seed: number): Action[] {
  let s = createGame(config, seed);
  const log: Action[] = [];
  const play = (a: Action) => {
    log.push(a);
    s = act(s, a);
  };
  let i = 0;
  while (s.phase.kind === 'setup.restaurants') {
    const [x, y, entrance] = SPOTS[i++] as [number, number, Corner];
    play({ type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as PlayerId, x, y, entrance });
  }
  for (const id of s.turnOrder) play({ type: 'setup.chooseReserve', playerId: id, card: reserve(200) });
  return log;
}

describe('rules versions', () => {
  it('a new game is stamped with the current version and asks for reserve cards first (DLX p4)', () => {
    const s = createGame(cfg(3), 5);
    expect(s.config.rulesVersion).toBe(RULES_VERSION);
    expect(legacyRules(s)).toBe(false);
    expect(s.phase.kind).toBe('setup.reserve');
    expect(s.awaiting).toMatchObject({ kind: 'setup.reserve' });
  });

  it('a saved config without a version is restored as version 1; an explicit one is kept', () => {
    const old = cfg(2);
    expect(restoredConfig(old).rulesVersion).toBe(1);
    expect(old.rulesVersion).toBeUndefined();
    const current = { ...old, rulesVersion: RULES_VERSION };
    expect(restoredConfig(current)).toBe(current);
    expect(() => createGame({ ...old, rulesVersion: RULES_VERSION + 1 }, 1)).toThrow(/rules version/);
  });

  it('an old-order log (restaurants, then reserves) replays in full under version 1', () => {
    const config = restoredConfig(cfg(3));
    const s0 = createGame(config, 9);
    expect(s0.phase.kind).toBe('setup.restaurants');
    const log = oldOrderLog(config, 9);
    expect(log.map((a) => a.type)).toEqual(['setup.placeRestaurant', 'setup.placeRestaurant', 'setup.placeRestaurant', 'setup.chooseReserve', 'setup.chooseReserve', 'setup.chooseReserve']);
    const { state } = replay(config, 9, log);
    expect(state.round).toBe(1);
    expect(state.phase.kind).toBe('orderOfBusiness');
    expect(Object.keys(state.board.restaurants)).toHaveLength(3);
    expect(Object.values(state.secrets).every((x) => x.reserve?.amount === 200)).toBe(true);
    // The same log is not legal under the current rules (reserve cards come first).
    expect(() => replay({ ...config, rulesVersion: RULES_VERSION }, 9, log)).toThrow(/WRONG_PHASE|Not placing/);
  });
});
