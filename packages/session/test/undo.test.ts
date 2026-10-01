import { describe, expect, it } from 'vitest';
import type { Action, EngineApi, GameState } from '@fcm/engine';
import { replayLog, UndoTracker, type LoggedAction } from '../src/index.js';

/** Minimal counter engine: `work.produce` is undoable, `work.endTurn` is not. */
type S = GameState & { n: Record<string, number> };
const engine = {
  applyAction(state: GameState, a: Action) {
    const s = structuredClone(state) as S;
    if (a.type === 'work.skip') return { ok: false, code: 'ILLEGAL', message: 'no' } as const;
    s.n[a.playerId] = (s.n[a.playerId] ?? 0) + 1;
    return { ok: true, state: s, events: [], undoable: a.type === 'work.produce' } as const;
  },
} as unknown as EngineApi;
const init = { n: {} } as unknown as GameState;
const produce = (p: string): Action => ({ type: 'work.produce', playerId: p, cardUid: 'c' }) as Action;
const end = (p: string): Action => ({ type: 'work.endTurn', playerId: p });

describe('UndoTracker', () => {
  it('checkpoints at non-undoable actions and undoes own last action by replay', () => {
    const { log, undo, state } = replayLog(engine, init, [produce('p1'), end('p1'), produce('p2'), produce('p1'), produce('p2')]);
    expect((state as S).n).toEqual({ p1: 3, p2: 2 });
    expect(undo.checkpoint.index).toBe(2);
    expect(undo.canUndo(log, 'p1')).toBe(true);
    const r = undo.undo(engine, log, 'p1');
    if (!r.ok) throw new Error(r.message);
    expect(r.log.map((e: LoggedAction) => e.action.playerId)).toEqual(['p1', 'p1', 'p2', 'p2']);
    expect((r.state as S).n).toEqual({ p1: 2, p2: 2 });
    // p1 has nothing left in the window.
    expect(undo.canUndo(r.log, 'p1')).toBe(false);
  });

  it('refuses to undo across a checkpoint', () => {
    const { log, undo } = replayLog(engine, init, [produce('p1'), end('p1')]);
    expect(undo.undo(engine, log, 'p1')).toMatchObject({ ok: false, code: 'UNDO_UNAVAILABLE' });
  });

  it('reports conflicts when later actions no longer replay', () => {
    const tracker = new UndoTracker(init);
    const log: LoggedAction[] = [
      { action: produce('p1'), undoable: true },
      { action: { type: 'work.skip', playerId: 'p2', cardUid: 'c' } as Action, undoable: true },
    ];
    expect(tracker.undo(engine, log, 'p1')).toMatchObject({ ok: false, code: 'UNDO_CONFLICT' });
  });

  it('replayLog throws on a rejected action', () => {
    expect(() => replayLog(engine, init, [{ type: 'work.skip', playerId: 'p1', cardUid: 'c' } as Action])).toThrow(/rejected/);
  });
});
