/**
 * Rules versions across save and restore: a room file written before versions existed replays its
 * old-order setup log (restaurants, then reserves) under the version-1 rules, and a new game
 * records the current version so it restores under the rules it was started with.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engine, RULES_VERSION, type Action, type GameConfig, type GameState, type PlayerId } from '@fcm/engine';
import { GameSession } from '@fcm/session';
import { checkSaves } from '../src/checkSaves.js';
import { FilePersistence, type PersistedRoom } from '../src/persistence.js';
import { tempDir } from './helpers.js';

const CONFIG: GameConfig = {
  players: [
    { id: 'p1', name: 'Ann', chain: 'fried_geese_donkey', color: '#c33' },
    { id: 'p2', name: 'Bob', chain: 'golden_duck_diner', color: '#33c' },
  ],
  modules: [],
  options: {},
  intro: false,
  introMilestones: false,
  map: { kind: 'random' },
};
const SEED = 4242;

/** Setup as the old engine logged it: first restaurants, then reserve cards. */
function oldOrderLog(): Action[] {
  let s: GameState = engine.createGame({ ...CONFIG, rulesVersion: 1 }, SEED);
  const log: Action[] = [];
  const play = (a: Action) => {
    const r = engine.applyAction(s, a);
    if (!r.ok) throw new Error(r.message);
    s = r.state;
    log.push(a);
  };
  while (s.phase.kind === 'setup.restaurants') {
    const who = s.awaiting.players[0] as PlayerId;
    const spot = engine.legalPlacements(s, who, { kind: 'restaurant' })[0];
    if (spot?.kind !== 'restaurant') throw new Error('no restaurant spot');
    play({ type: 'setup.placeRestaurant', playerId: who, x: spot.x, y: spot.y, entrance: spot.entrance });
  }
  for (const id of s.turnOrder) play({ type: 'setup.chooseReserve', playerId: id, card: { kind: 'standard', amount: 300, ceoSlots: 4 } });
  return log;
}

function writeRoom(dataDir: string, id: string, actions: Action[]): void {
  const rec: PersistedRoom = {
    version: 1,
    engineVersion: '0.2.0',
    id,
    createdAt: 1,
    updatedAt: 1,
    hostClientId: 'c1',
    config: { seatCount: 2 } as PersistedRoom['config'],
    status: 'playing',
    seats: [],
    seed: SEED,
    gameConfig: CONFIG, // no rulesVersion: saved before versions existed
    actions,
  };
  mkdirSync(join(dataDir, 'rooms'), { recursive: true });
  writeFileSync(join(dataDir, 'rooms', `${id}.json`), JSON.stringify(rec));
}

describe('rules versions in saved rooms', () => {
  it('a pre-version save with restaurants placed before reserves restores in full', () => {
    const dataDir = tempDir();
    const log = oldOrderLog();
    expect(log[0]?.type).toBe('setup.placeRestaurant');
    writeRoom(dataDir, 'OLD01', log);
    expect(checkSaves(engine, dataDir)).toEqual([expect.objectContaining({ id: 'OLD01', actions: log.length, failure: null })]);
    const rec = new FilePersistence(dataDir, 0).load('OLD01');
    expect(rec?.gameConfig?.rulesVersion).toBe(1);
    const game = new GameSession({ engine, config: rec?.gameConfig as GameConfig, seed: SEED, actions: rec?.actions ?? [], onReplayFailure: 'truncate' });
    expect(game.replayFailure).toBeNull();
    expect(game.rawState.phase.kind).toBe('orderOfBusiness');
  });

  it('a pre-version game still in setup asks for first restaurants before reserve cards', () => {
    const dataDir = tempDir();
    writeRoom(dataDir, 'OLD02', []);
    const rec = new FilePersistence(dataDir, 0).load('OLD02');
    const game = new GameSession({ engine, config: rec?.gameConfig as GameConfig, seed: SEED, actions: [] });
    const first = game.rawState.awaiting.players[0] as PlayerId;
    expect(game.rawState.phase.kind).toBe('setup.restaurants');
    expect(engine.derivePrompt(game.view(first), first).kind).toBe('placeFirstRestaurant');
  });

  it('a new game records the current version (reserve cards first), so a restore keeps those rules', () => {
    const game = new GameSession({ engine, config: CONFIG, seed: SEED });
    expect(game.config.rulesVersion).toBe(RULES_VERSION);
    expect(game.rawState.phase.kind).toBe('setup.reserve');
    const restored = new GameSession({ engine, config: game.config, seed: SEED });
    expect(restored.rawState.phase.kind).toBe('setup.reserve');
  });
});
