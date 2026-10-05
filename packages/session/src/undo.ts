/**
 * Undo (architecture §3.6). A checkpoint is taken at every decision-window start: game creation
 * and after every action the engine marks `undoable: false`. Every action after the latest
 * checkpoint is therefore undoable. A player may undo their own most recent action in the
 * current window; the state is rebuilt by replaying the window from the checkpoint without it.
 */
import type { Action, EngineApi, GameEvent, GameState, PlayerId } from '@fcm/engine';

export interface LoggedAction {
  action: Action;
  undoable: boolean;
}

export interface Checkpoint {
  /** Log length at the window start (actions before this index are final). */
  index: number;
  state: GameState;
}

export type UndoResult =
  | { ok: true; state: GameState; log: LoggedAction[]; removed: LoggedAction }
  | { ok: false; code: 'UNDO_UNAVAILABLE' | 'UNDO_CONFLICT'; message: string };

export class UndoTracker {
  private cp: Checkpoint;

  constructor(initial: GameState, index = 0) {
    this.cp = { index, state: initial };
  }

  get checkpoint(): Checkpoint {
    return this.cp;
  }

  /** Call after appending `entry` to the log (log length is now `index`). */
  record(entry: LoggedAction, index: number, stateAfter: GameState): void {
    if (!entry.undoable) this.cp = { index, state: stateAfter };
  }

  /** Index into `log` of the action `by` may undo, or -1. */
  undoableIndex(log: LoggedAction[], by: PlayerId): number {
    for (let i = log.length - 1; i >= this.cp.index; i--) {
      const e = log[i] as LoggedAction;
      if (e.action.playerId === by) return e.undoable ? i : -1;
    }
    return -1;
  }

  canUndo(log: LoggedAction[], by: PlayerId): boolean {
    return this.undoableIndex(log, by) >= 0;
  }

  /**
   * Remove `by`'s last undoable action and rebuild the state by replay from the checkpoint.
   * Actions of bot seats (`isBot`) taken after it are dropped too: bots decide again from the
   * rolled-back state, so a quick bot reply never blocks a human's undo.
   */
  undo(engine: EngineApi, log: LoggedAction[], by: PlayerId, isBot: (p: PlayerId) => boolean = () => false): UndoResult {
    const idx = this.undoableIndex(log, by);
    if (idx < 0) return { ok: false, code: 'UNDO_UNAVAILABLE', message: 'Nothing of yours to undo' };
    const kept = log.slice(this.cp.index).filter((e, i) => i + this.cp.index !== idx && !(i + this.cp.index > idx && isBot(e.action.playerId)));
    let state = this.cp.state;
    const rebuilt: LoggedAction[] = [];
    for (const e of kept) {
      const r = engine.applyAction(state, e.action);
      if (!r.ok) return { ok: false, code: 'UNDO_CONFLICT', message: `Later actions depend on it (${r.message})` };
      if (!r.undoable) return { ok: false, code: 'UNDO_CONFLICT', message: 'A later action can no longer be replayed as undoable' };
      state = r.state;
      rebuilt.push({ action: e.action, undoable: true });
    }
    return { ok: true, state, log: [...log.slice(0, this.cp.index), ...rebuilt], removed: log[idx] as LoggedAction };
  }
}

/** Replay a full log step by step, recovering undo flags and the latest checkpoint. */
export function replayLog(
  engine: EngineApi,
  initial: GameState,
  actions: Action[],
): { state: GameState; log: LoggedAction[]; undo: UndoTracker; events: GameEvent[][] } {
  let state = initial;
  const undo = new UndoTracker(initial);
  const log: LoggedAction[] = [];
  const events: GameEvent[][] = [];
  for (const action of actions) {
    const r = engine.applyAction(state, action);
    if (!r.ok) throw new Error(`replay: action #${log.length} (${action.type}) rejected: ${r.code} ${r.message}`);
    state = r.state;
    const entry = { action, undoable: r.undoable };
    log.push(entry);
    undo.record(entry, log.length, state);
    events.push(r.events);
  }
  return { state, log, undo, events };
}
