import { describe, expect, it } from 'vitest';
import { toyEngine as E } from '../../src/testing/toyGame.js';
import { stateProblems } from '../../src/testing/validate.js';
import type { Action } from '../../src/types/actions.js';
import type { GameConfig, GameState } from '../../src/types/state.js';

const config: GameConfig = {
  players: [
    { id: 'a', name: 'Ann', chain: 'golden_duck_diner', color: '#e8b730' },
    { id: 'b', name: 'Ben', chain: 'gluttony_inc', color: '#9b5fc0' },
  ],
  modules: [],
  options: {},
  intro: false,
  introMilestones: false,
  map: { kind: 'random' },
};

function apply(s: GameState, a: Action): GameState {
  const r = E.applyAction(s, a);
  if (!r.ok) throw new Error(r.message);
  return r.state;
}

/** Play greedily: always take the first legal action of the first awaited player. */
function playOut(seed: number) {
  let s = E.createGame(config, seed);
  const log: Action[] = [];
  for (let i = 0; i < 500 && s.phase.kind !== 'gameOver'; i++) {
    const who = s.awaiting.players[0] as string;
    const legal = E.legalActions(s, who);
    const first = legal[0];
    if (!first || first.kind !== 'ready') throw new Error('no ready action');
    log.push(first.action);
    s = apply(s, first.action);
    expect(stateProblems(s)).toEqual([]);
  }
  return { s, log };
}

describe('toy engine', () => {
  it('starts with a simultaneous secret reserve choice', () => {
    const s = E.createGame(config, 1);
    expect(s.phase.kind).toBe('setup.reserve');
    expect(s.awaiting.players).toEqual(['a', 'b']);
    expect(E.legalActions(s, 'a')).toHaveLength(3);
    expect(E.derivePrompt(E.redactFor(s, 'a'), 'a').kind).toBe('chooseReserve');
  });

  it('hides other players secrets and rng in views and events', () => {
    let s = E.createGame(config, 1);
    const r = E.applyAction(s, { type: 'setup.chooseReserve', playerId: 'a', card: { kind: 'standard', amount: 300, ceoSlots: 4 } });
    if (!r.ok) throw new Error(r.message);
    s = r.state;
    expect(r.undoable).toBe(false);
    const forB = E.redactFor(s, 'b');
    expect(forB).not.toHaveProperty('rng');
    expect(forB).not.toHaveProperty('secrets');
    expect(forB.mine?.reserve).toBeNull();
    expect(forB.submitted).toEqual({ a: true, b: false });
    expect(JSON.stringify(forB)).not.toContain('"amount":300');
    expect(E.redactFor(s, 'a').mine?.reserve?.amount).toBe(300);
    expect(E.redactFor(s, 'spectator').mine).toBeNull();
    expect(E.redactEvents(r.events, 'b')[0]).toEqual({ type: 'reserveChosen', player: 'a' });
    expect(E.redactEvents(r.events, 'a')[0]).toHaveProperty('card');
  });

  it('rejects out-of-turn, wrong-phase and unknown actions without mutating input', () => {
    const s = E.createGame(config, 1);
    const frozen = JSON.stringify(s);
    expect(E.applyAction(s, { type: 'work.endTurn', playerId: 'a' })).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(E.applyAction(s, { type: 'setup.pass', playerId: 'a' })).toMatchObject({ ok: false, code: 'UNKNOWN_ACTION' });
    let t = apply(s, { type: 'setup.chooseReserve', playerId: 'a', card: { kind: 'standard', amount: 100, ceoSlots: 2 } });
    t = apply(t, { type: 'setup.chooseReserve', playerId: 'b', card: { kind: 'standard', amount: 200, ceoSlots: 3 } });
    expect(t.phase).toMatchObject({ kind: 'working', player: 'a' });
    expect(E.applyAction(t, { type: 'work.endTurn', playerId: 'b' })).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('plays to game over and replays deterministically', () => {
    const { s, log } = playOut(7);
    expect(s.phase.kind).toBe('gameOver');
    expect(s.history.seq).toBe(log.length);
    const re = E.replay(config, 7, log);
    expect(re.state).toEqual(s);
    expect(re.events.flat().some((e) => e.type === 'sale')).toBe(true);
    expect(re.events.flat().at(-1)?.type).toBe('gameEnded');
    expect(E.applyAction(s, { type: 'work.endTurn', playerId: 'a' })).toMatchObject({ ok: false, code: 'GAME_OVER' });
    expect(E.derivePrompt(E.redactFor(s, 'a'), 'a').kind).toBe('gameOver');
  });

  it('marks production undoable and lists itself as a module', () => {
    let s = E.createGame({ ...config, intro: true }, 2);
    expect(s.phase.kind).toBe('working');
    const ceo = s.players.a?.structure.ceo as string;
    const r = E.applyAction(s, { type: 'work.produce', playerId: 'a', cardUid: ceo, food: 'pizza' });
    if (!r.ok) throw new Error(r.message);
    expect(r.undoable).toBe(true);
    s = r.state;
    expect(s.players.a?.inventory.pizza).toBe(1);
    expect(E.listModules()[0]?.id).toBe('base');
    expect(E.legalPlacements(s, 'a', { kind: 'restaurant' })).toEqual([]);
  });
});
