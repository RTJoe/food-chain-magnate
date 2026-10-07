/**
 * Failure containment: a bot or human move whose fan-out throws must not crash the process or
 * leave the state ahead of the log; a log that no longer replays keeps its valid prefix; bots stay
 * ready across lobby config changes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engine, type Action, type EngineApi, type GameConfig } from '@fcm/engine';
import { runBot } from '@fcm/ai';
import { BotDriver, GameSession, Room, replayLog } from '../src/index.js';

function config(n = 2): GameConfig {
  return {
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, chain: 'gluttony_inc' as const, color: '#000' })),
    modules: [],
    options: {},
    intro: false,
    introMilestones: false,
    map: { kind: 'random' },
  };
}

/** The real engine, except that redacting events throws (a redaction bug). */
const brokenRedaction: EngineApi = Object.assign(Object.create(engine) as EngineApi, {
  redactEvents: () => {
    throw new Error('redaction bug');
  },
});

const AUDIENCE = [{ clientId: 'h', viewer: 'p1' as const }];
/** A legal move for `p` (the Easy bot's choice). */
const legal = (g: GameSession, p = 'p1'): Action => runBot({ level: 'easy', view: g.view(p), playerId: p, seed: 1, budgetMs: 50 });

let unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);
beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
});

describe('bot move failures are contained', () => {
  it('a throwing fan-out during a bot move is logged, not thrown; the state does not advance', async () => {
    const game = new GameSession({ engine: brokenRedaction, config: config(), seed: 3, bots: { p1: 'easy', p2: 'easy' } });
    const logs: string[] = [];
    const driver = new BotDriver(game, { delay: 0, deliver: () => {}, audience: () => AUDIENCE, log: (m) => logs.push(m) });
    driver.poke();
    await driver.whenIdle();
    await new Promise((r) => setTimeout(r, 10));
    expect(unhandled).toEqual([]);
    expect(game.seq).toBe(0);
    expect(driver.thinking).toBeNull();
    expect(logs.join('\n')).toMatch(/redaction bug/);
    // A later poke retries (bounded), still without throwing.
    driver.poke();
    await driver.whenIdle();
    expect(game.seq).toBe(0);
  });

  it('a throwing fan-out on a human move leaves the state and log unchanged', () => {
    const game = new GameSession({ engine: brokenRedaction, config: config(), seed: 3 });
    const p = game.rawState.awaiting.players[0] ?? 'p1';
    const before = game.rawState;
    const req = { id: 'a1', expectedSeq: 0, action: legal(game, p) };
    expect(() => game.submitAction(p, 'h', req, AUDIENCE)).toThrow(/redaction bug/);
    expect(game.seq).toBe(0);
    expect(game.rawState).toBe(before);
  });
});

describe('replay of a log that no longer replays', () => {
  it('replayLog in truncate mode keeps the longest valid prefix and reports the failure', () => {
    const good = new GameSession({ engine, config: config(), seed: 5 });
    const first = legal(good);
    good.submitAction('p1', 'h', { id: 'a', expectedSeq: 0, action: first }, AUDIENCE);
    expect(good.seq).toBe(1);
    // p1 repeating its move is illegal now (a rules change would look the same).
    const actions = [first, first, first];
    expect(() => replayLog(engine, engine.createGame(config(), 5), actions)).toThrow(/replay: action #1/);
    const r = replayLog(engine, engine.createGame(config(), 5), actions, { onFailure: 'truncate' });
    expect(r.log).toHaveLength(1);
    expect(r.failure).toMatchObject({ index: 1, total: 3 });

    const restored = new GameSession({ engine, config: config(), seed: 5, actions, onReplayFailure: 'truncate' });
    expect(restored.seq).toBe(1);
    expect(restored.replayFailure).toMatchObject({ index: 1, total: 3 });
    expect(restored.rawState).toEqual(good.rawState);
    expect(() => new GameSession({ engine, config: config(), seed: 5, actions })).toThrow(/replay/);
  });
});

describe('lobby: bots stay ready', () => {
  it('changing settings after adding a bot un-readies humans only, so the game can start', () => {
    const room = new Room({ id: 'ABCDE', hostClientId: 'h' });
    room.join('h', 'Hana');
    room.sit('h', 0);
    expect(room.addBot('h', 1, 'easy').ok).toBe(true);
    room.setReady('h', true);
    expect(room.startProblem('h')).toBeNull();
    expect(room.patchConfig('h', { intro: true }).ok).toBe(true);
    expect(room.seats[0]?.ready).toBe(false);
    expect(room.seats[1]?.ready).toBe(true);
    room.setReady('h', true);
    expect(room.startProblem('h')).toBeNull();
    // Growing the seat count keeps the bot ready too.
    expect(room.patchConfig('h', { seatCount: 5 }).ok).toBe(true);
    expect(room.seats[1]?.ready).toBe(true);
  });
});
