import { describe, expect, it } from 'vitest';
import type { Action, GameConfig, PlayerId, ReserveCard } from '@fcm/engine';
import type { ServerMessage } from '@fcm/protocol';
import { toyEngine } from '@fcm/engine/testing';
import { GameSession, RECENT_ID_LIMIT, type AudienceMember, type Outbound } from '../src/index.js';

const CARD: ReserveCard = { kind: 'standard', amount: 100, ceoSlots: 2 };
const config = (intro = false): GameConfig => ({
  players: [
    { id: 'p1', name: 'Ann', chain: 'fried_geese_donkey', color: '#d94f3d' },
    { id: 'p2', name: 'Bob', chain: 'golden_duck_diner', color: '#e8b730' },
  ],
  modules: [],
  options: {},
  intro,
  introMilestones: false,
  map: { kind: 'random' },
});
const AUDIENCE: AudienceMember[] = [
  { clientId: 'a', viewer: 'p1' },
  { clientId: 'b', viewer: 'p2' },
  { clientId: 's', viewer: 'spectator' },
];
const sender: Record<PlayerId, string> = { p1: 'a', p2: 'b' };
const to = (out: Outbound[], id: string): ServerMessage[] => out.filter((o) => o.to === id).map((o) => o.msg);
let n = 0;
function act(g: GameSession, by: PlayerId, action: Partial<Action> & { type: Action['type'] }, opts: { id?: string; seq?: number } = {}) {
  return g.submitAction(by, sender[by] as string, { id: opts.id ?? `id${n++}`, expectedSeq: opts.seq ?? g.seq, action: { playerId: by, ...action } }, AUDIENCE);
}
const ceo = (g: GameSession, p: PlayerId) => g.rawState.players[p]?.structure.ceo as string;

describe('GameSession', () => {
  it('applies actions and fans out per-viewer redacted messages', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 7 });
    expect(g.seq).toBe(0);
    const out = act(g, 'p1', { type: 'setup.chooseReserve', card: CARD } as Action, { id: 'x1' });
    expect(out).toHaveLength(3);
    const [a] = to(out, 'a');
    const [b] = to(out, 'b');
    const [s] = to(out, 's');
    if (a?.t !== 'game.applied' || b?.t !== 'game.applied' || s?.t !== 'game.applied') throw new Error('expected applied');
    expect(a.seq).toBe(1);
    expect(a.actionId).toBe('x1');
    expect(b.actionId).toBeNull();
    expect(a.action).toMatchObject({ card: CARD });
    expect(b.action).toEqual({ type: 'setup.chooseReserve', playerId: 'p1' });
    expect(s.action).toEqual({ type: 'setup.chooseReserve', playerId: 'p1' });
    expect(a.events[0]).toMatchObject({ type: 'reserveChosen', card: CARD });
    expect(b.events[0]).toEqual({ type: 'reserveChosen', player: 'p1' });
    expect(a.view.mine?.reserve).toEqual(CARD);
    expect(b.view.mine?.reserve ?? null).toBeNull();
    expect(s.view.mine).toBeNull();
    expect(JSON.stringify(b.view)).not.toContain('"amount":100,"ceoSlots":2}');
  });

  it('overwrites playerId from the seat (no impersonation)', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 7 });
    g.submitAction('p1', 'a', { id: 'imp', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } }, AUDIENCE);
    expect(g.rawState.secrets.p1?.reserve).toEqual(CARD);
    expect(g.rawState.secrets.p2?.reserve ?? null).toBeNull();
    expect(g.actions[0]?.playerId).toBe('p1');
  });

  it('rejects stale seq with a snapshot to the sender only', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 7 });
    const out = act(g, 'p1', { type: 'setup.chooseReserve', card: CARD } as Action, { seq: 5, id: 'st' });
    expect(out.map((o) => [o.to, o.msg.t])).toEqual([
      ['a', 'game.rejected'],
      ['a', 'game.snapshot'],
    ]);
    expect(out[0]?.msg).toMatchObject({ id: 'st', code: 'STALE' });
    expect(g.seq).toBe(0);
    // The same id may be retried once in sync.
    expect(act(g, 'p1', { type: 'setup.chooseReserve', card: CARD } as Action, { id: 'st' })).toHaveLength(3);
  });

  it('is idempotent on action ids and replays rejections', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 7 });
    act(g, 'p1', { type: 'setup.chooseReserve', card: CARD } as Action, { id: 'dup' });
    const again = act(g, 'p1', { type: 'setup.chooseReserve', card: CARD } as Action, { id: 'dup', seq: 0 });
    expect(again.map((o) => o.msg.t)).toEqual(['game.snapshot']);
    expect(g.seq).toBe(1);
    const bad = act(g, 'p2', { type: 'work.endTurn' }, { id: 'bad' });
    expect(bad).toEqual([{ to: 'b', msg: { t: 'game.rejected', id: 'bad', code: 'WRONG_PHASE', message: expect.any(String) } }]);
    expect(act(g, 'p2', { type: 'work.endTurn' }, { id: 'bad' })[0]?.msg).toMatchObject({ code: 'WRONG_PHASE' });
  });

  it('remembers only the last 50 ids', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 7 });
    for (let i = 0; i < RECENT_ID_LIMIT + 1; i++) act(g, 'p2', { type: 'work.endTurn' }, { id: `r${i}` });
    // r0 was evicted: it is evaluated again (still rejected, but freshly).
    expect((g as unknown as { recent: Map<string, unknown> }).recent.size).toBe(RECENT_ID_LIMIT);
    expect((g as unknown as { recent: Map<string, unknown> }).recent.has('p2:r0')).toBe(false);
  });

  it('rejects spectators and engine errors', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 7 });
    expect(g.submitAction(null, 's', { id: 'q', expectedSeq: 0, action: { type: 'work.endTurn', playerId: 'p1' } }, AUDIENCE)[0]?.msg).toMatchObject({ code: 'NOT_SEATED' });
    const throwing = { ...toyEngine, applyAction: () => { throw new Error('kaput'); } };
    const g2 = new GameSession({ engine: throwing, config: config(), seed: 7 });
    expect(g2.submitAction('p1', 'a', { id: 'q', expectedSeq: 0, action: { type: 'work.endTurn', playerId: 'p1' } }, AUDIENCE)[0]?.msg).toMatchObject({ code: 'ENGINE_ERROR' });
  });

  it('undoes only the actor’s own last undoable action, within the decision window', () => {
    const g = new GameSession({ engine: toyEngine, config: config(true), seed: 7 });
    expect(g.rawState.phase).toMatchObject({ kind: 'working', player: 'p1' });
    act(g, 'p1', { type: 'work.produce', cardUid: ceo(g, 'p1'), food: 'burger' } as Action);
    act(g, 'p1', { type: 'work.produce', cardUid: ceo(g, 'p1'), food: 'pizza' } as Action);
    expect(g.seq).toBe(2);
    expect(g.canUndo('p2')).toBe(false);
    expect(g.requestUndo('p2', 'b', 2, AUDIENCE)[0]?.msg).toMatchObject({ t: 'game.rejected', code: 'UNDO_UNAVAILABLE' });
    expect(g.requestUndo('p1', 'a', 1, AUDIENCE)[0]?.msg).toMatchObject({ code: 'STALE' });
    const out = g.requestUndo('p1', 'a', 2, AUDIENCE);
    expect(out.map((o) => [o.to, o.msg.t])).toEqual([
      ['a', 'game.undone'],
      ['b', 'game.undone'],
      ['s', 'game.undone'],
    ]);
    expect(out[0]?.msg).toMatchObject({ seq: 1, by: 'p1' });
    expect(g.rawState.players.p1?.inventory).toEqual({ burger: 1 });
    // End turn is not undoable and closes the window.
    act(g, 'p1', { type: 'work.endTurn' });
    expect(g.canUndo('p1')).toBe(false);
    act(g, 'p2', { type: 'work.produce', cardUid: ceo(g, 'p2') } as Action);
    expect(g.canUndo('p1')).toBe(false);
    expect(g.canUndo('p2')).toBe(true);
  });

  it('restores identical state by replaying the log', () => {
    const g = new GameSession({ engine: toyEngine, config: config(), seed: 9 });
    act(g, 'p1', { type: 'setup.chooseReserve', card: CARD } as Action);
    act(g, 'p2', { type: 'setup.chooseReserve', card: { ...CARD, amount: 200, ceoSlots: 3 } } as Action);
    act(g, 'p1', { type: 'work.produce', cardUid: ceo(g, 'p1') } as Action);
    const copy = new GameSession({ engine: toyEngine, config: config(), seed: 9, actions: g.actions });
    expect(copy.seq).toBe(3);
    expect(copy.rawState).toEqual(g.rawState);
    // Undo flags and checkpoint survive the restore.
    expect(copy.canUndo('p1')).toBe(true);
  });
});
