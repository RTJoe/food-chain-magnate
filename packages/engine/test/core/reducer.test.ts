/** Reducer purity, replay determinism and redaction (architecture §3.1, §3.5, §3.6, §3.8). */
import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '../../src/index.js';
import { applyAction, createGame, derivePrompt, engine, legalActions, listModules, redactEvents, redactFor, replay, validateAction } from '../../src/index.js';
import { config, play } from '../helpers/bot.js';
import { act, newGame, reserve } from '../helpers/game.js';

const reachRound = (n: number) => (s: GameState) => s.round >= n && s.phase.kind === 'restructuring';

describe('reducer (architecture §3.1)', () => {
  it('applyAction never mutates its input', () => {
    const s = newGame(2);
    const before = JSON.stringify(s);
    const r = applyAction(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as string, x: 3, y: 3, entrance: 'NW' });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('rejects malformed, unknown and out-of-turn actions without throwing', () => {
    const s = newGame(2);
    expect(validateAction(s, { type: 'nope', playerId: 'p1' } as unknown as Action)).toMatchObject({ ok: false, code: 'UNKNOWN_ACTION' });
    expect(validateAction(s, { type: 'setup.pass', playerId: 'zz' })).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(validateAction(s, { type: 'work.endTurn', playerId: 'p1' })).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(validateAction(s, { type: 'ketchup:coffee.placeShop', playerId: 'p1' } as unknown as Action)).toMatchObject({ ok: false, code: 'MODULE_DISABLED' });
    expect(validateAction(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as string } as unknown as Action).ok).toBe(false);
  });

  it('history.seq counts applied actions', () => {
    let s = newGame(2);
    s = act(s, { type: 'setup.pass', playerId: s.awaiting.players[0] as string });
    expect(s.history.seq).toBe(1);
  });

  it('listModules exposes the base manifest; the engine object implements the API', () => {
    expect(listModules().map((m) => m.id)).toContain('base');
    expect(typeof engine.createGame).toBe('function');
    expect(engine.createGame(config(2), 1).phase.kind).toBe('setup.restaurants');
  });
});

describe('determinism (architecture §3.8)', () => {
  it('createGame is a pure function of (config, seed)', () => {
    expect(createGame(config(3), 99)).toEqual(createGame(config(3), 99));
    expect(createGame(config(3), 99)).not.toEqual(createGame(config(3), 100));
  });

  it('replay(config, seed, actions) reproduces a played game exactly; state round-trips through JSON', () => {
    const c = config(3);
    const r = play(createGame(c, 12), 34, reachRound(4));
    expect(r.state.round).toBe(4);
    const rep = replay(c, 12, r.actions);
    expect(rep.state).toEqual(r.state);
    expect(rep.events).toEqual(r.events);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });

  it('replay throws on an illegal log', () => {
    expect(() => replay(config(2), 1, [{ type: 'work.endTurn', playerId: 'p1' }])).toThrow(/rejected/);
  });
});

describe('redaction (architecture §3.5)', () => {
  it('views never contain rng, seed or other players\' secrets', () => {
    const c = config(3);
    const r = play(createGame(c, 5), 6, reachRound(3), 20_000, (s) => {
      for (const viewer of ['p1', 'p2', 'p3', 'spectator'] as const) {
        const v = redactFor(s, viewer) as unknown as Record<string, unknown>;
        expect(v.rng).toBeUndefined();
        expect(v.seed).toBeUndefined();
        expect(v.secrets).toBeUndefined();
        if (s.bank.breaks === 0) {
          for (const other of ['p1', 'p2', 'p3']) {
            if (other === viewer) continue;
            expect((v.visibleReserves as Record<string, unknown>)[other]).toBeUndefined();
          }
        }
      }
    });
    expect(r.state.round).toBe(3);
  });

  it('reserve choice events are stripped for other viewers', () => {
    let s = newGame(2);
    s = act(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as string, x: 3, y: 3, entrance: 'NW' });
    s = act(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as string, x: 5, y: 3, entrance: 'NW' });
    const r = applyAction(s, { type: 'setup.chooseReserve', playerId: 'p1', card: reserve(200) });
    if (!r.ok) throw new Error(r.message);
    const ev = (viewer: string) => redactEvents(r.events, viewer).find((e) => e.type === 'reserveChosen') as unknown as Record<string, unknown>;
    expect(ev('p1').card).toEqual(reserve(200));
    expect(ev('p2').card).toBeUndefined();
    expect(ev('spectator').card).toBeUndefined();
  });

  it('derivePrompt follows the view (hot-seat == online)', () => {
    const s = newGame(2);
    const me = s.awaiting.players[0] as string;
    const other = s.turnOrder.find((p) => p !== me) as string;
    expect(derivePrompt(redactFor(s, me), me)).toMatchObject({ kind: 'placeFirstRestaurant', canPass: true });
    expect(derivePrompt(redactFor(s, other), other)).toMatchObject({ kind: 'waiting', waitingFor: [me] });
    expect(derivePrompt(redactFor(s, 'spectator'), null).kind).toBe('spectating');
    expect(legalActions(s, other)).toEqual([]);
  });
});
