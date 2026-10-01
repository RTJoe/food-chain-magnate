/**
 * Server-authoritative game pipeline (architecture §4.4): validate envelope → overwrite
 * `playerId` from the seat → check `expectedSeq` → `applyAction` → append to log → per-viewer
 * redacted fan-out. Transport-agnostic: methods return the messages to send, addressed by
 * `clientId`. The engine is injected (`EngineApi`), so the toy and real engines are swappable.
 */
import type { Action, EngineApi, GameConfig, GameEvent, GameState, GameView, ModuleManifest, PlayerId, Viewer } from '@fcm/engine';
import { ActionSchema, type ServerMessage, type ServerMessageOf } from '@fcm/protocol';
import { replayLog, UndoTracker, type LoggedAction } from './undo.js';

export interface AudienceMember {
  clientId: string;
  viewer: Viewer;
}
export interface Outbound {
  to: string;
  msg: ServerMessage;
}

/** Session-level rejection codes, in addition to the engine's `RejectCode`s. */
export type SessionRejectCode = 'STALE' | 'NOT_SEATED' | 'UNDO_UNAVAILABLE' | 'UNDO_CONFLICT' | 'ENGINE_ERROR' | 'INVALID_PAYLOAD';

/** Action types whose payload is hidden from other viewers until the engine reveals it. */
const SECRET_ACTIONS: ReadonlySet<string> = new Set(['setup.chooseReserve', 'restructure.submit', 'cleanup.freezer']);

/** Strip a secret action's payload for anyone but its author. */
export function redactAction(action: Action, viewer: Viewer): Action {
  if (viewer === action.playerId || !SECRET_ACTIONS.has(action.type)) return action;
  return { type: action.type, playerId: action.playerId } as Action;
}

export const RECENT_ID_LIMIT = 50;

type IdOutcome = { kind: 'applied'; seq: number } | { kind: 'rejected'; code: string; message: string };

export interface GameSessionOptions {
  engine: EngineApi;
  config: GameConfig;
  seed: number;
  /** Persisted log to replay (restore after restart). */
  actions?: Action[];
}

export interface ActionRequest {
  id: string;
  expectedSeq: number;
  action: unknown;
}

export class GameSession {
  readonly engine: EngineApi;
  readonly config: GameConfig;
  readonly seed: number;
  private state: GameState;
  private log: LoggedAction[];
  private undo: UndoTracker;
  private readonly recent = new Map<string, IdOutcome>();
  readonly manifest: ModuleManifest[];

  constructor(opts: GameSessionOptions) {
    this.engine = opts.engine;
    this.config = opts.config;
    this.seed = opts.seed;
    const initial = this.engine.createGame(opts.config, opts.seed);
    const r = replayLog(this.engine, initial, opts.actions ?? []);
    this.state = r.state;
    this.log = r.log;
    this.undo = r.undo;
    const enabled = new Set<string>(['base', ...opts.config.modules]);
    this.manifest = this.engine.listModules().filter((m) => enabled.has(m.id));
  }

  /** Number of actions applied; the protocol `seq`. */
  get seq(): number {
    return this.log.length;
  }
  get actions(): Action[] {
    return this.log.map((e) => e.action);
  }
  get isOver(): boolean {
    return this.state.phase.kind === 'gameOver';
  }
  /** Raw state (server-side only; never send it). */
  get rawState(): GameState {
    return this.state;
  }

  view(viewer: Viewer): GameView {
    return this.engine.redactFor(this.state, viewer);
  }

  snapshot(viewer: Viewer): ServerMessageOf<'game.snapshot'> {
    return { t: 'game.snapshot', seq: this.seq, view: this.view(viewer), manifest: this.manifest, me: viewer === 'spectator' ? null : viewer };
  }

  canUndo(by: PlayerId): boolean {
    return this.undo.canUndo(this.log, by);
  }

  /**
   * Handle `game.action` from `sender`, seated as `by` (null = not seated). `playerId` in the
   * action is overwritten with `by`, so a client can never act for another seat.
   */
  submitAction(by: PlayerId | null, sender: string, req: ActionRequest, audience: AudienceMember[]): Outbound[] {
    const reject = (code: string, message: string): Outbound[] => [{ to: sender, msg: { t: 'game.rejected', id: req.id, code, message } }];
    if (by === null) return reject('NOT_SEATED', 'Spectators cannot act');

    const key = `${by}:${req.id}`;
    const seen = this.recent.get(key);
    if (seen) {
      // Idempotent retry: never apply twice. Re-sync the sender instead.
      if (seen.kind === 'rejected') return reject(seen.code, seen.message);
      return [{ to: sender, msg: this.snapshot(by) }];
    }

    const parsed = ActionSchema.safeParse(req.action);
    if (!parsed.success) return this.remember(key, { kind: 'rejected', code: 'INVALID_PAYLOAD', message: 'Malformed action' }, reject);
    const action = { ...parsed.data, playerId: by } as Action;

    if (req.expectedSeq !== this.seq) {
      // Not remembered: the client may legitimately retry the same id after resyncing.
      return [...reject('STALE', `Expected seq ${this.seq}, got ${req.expectedSeq}`), { to: sender, msg: this.snapshot(by) }];
    }

    let r: ReturnType<EngineApi['applyAction']>;
    try {
      r = this.engine.applyAction(this.state, action);
    } catch (e) {
      return reject('ENGINE_ERROR', (e as Error).message);
    }
    if (!r.ok) return this.remember(key, { kind: 'rejected', code: r.code, message: r.message }, reject);

    this.state = r.state;
    const entry: LoggedAction = { action, undoable: r.undoable };
    this.log.push(entry);
    this.undo.record(entry, this.log.length, this.state);
    this.remember(key, { kind: 'applied', seq: this.seq }, () => []);
    return this.fanOutApplied(action, r.events, sender, req.id, audience);
  }

  /** Handle `game.undo`: undo `by`'s last undoable action and broadcast `game.undone`. */
  requestUndo(by: PlayerId | null, sender: string, expectedSeq: number, audience: AudienceMember[]): Outbound[] {
    const reject = (code: string, message: string): Outbound[] => [{ to: sender, msg: { t: 'game.rejected', id: 'undo', code, message } }];
    if (by === null) return reject('NOT_SEATED', 'Spectators cannot undo');
    if (expectedSeq !== this.seq) return [...reject('STALE', `Expected seq ${this.seq}, got ${expectedSeq}`), { to: sender, msg: this.snapshot(by) }];
    let r: ReturnType<UndoTracker['undo']>;
    try {
      r = this.undo.undo(this.engine, this.log, by);
    } catch (e) {
      return reject('ENGINE_ERROR', (e as Error).message);
    }
    if (!r.ok) return reject(r.code, r.message);
    this.state = r.state;
    this.log = r.log;
    const views = this.viewCache();
    return audience.map((a) => ({ to: a.clientId, msg: { t: 'game.undone', seq: this.seq, view: views(a.viewer), by } }));
  }

  private fanOutApplied(action: Action, events: GameEvent[], sender: string, actionId: string, audience: AudienceMember[]): Outbound[] {
    const views = this.viewCache();
    return audience.map((a) => ({
      to: a.clientId,
      msg: {
        t: 'game.applied',
        seq: this.seq,
        actionId: a.clientId === sender ? actionId : null,
        action: redactAction(action, a.viewer),
        events: this.engine.redactEvents(events, a.viewer),
        view: views(a.viewer),
      },
    }));
  }

  /** One redaction per distinct viewer (many spectators share one view). */
  private viewCache(): (v: Viewer) => GameView {
    const cache = new Map<Viewer, GameView>();
    return (v) => {
      let view = cache.get(v);
      if (!view) cache.set(v, (view = this.view(v)));
      return view;
    };
  }

  private remember(key: string, outcome: IdOutcome, then: (code: string, message: string) => Outbound[]): Outbound[] {
    this.recent.set(key, outcome);
    while (this.recent.size > RECENT_ID_LIMIT) this.recent.delete(this.recent.keys().next().value as string);
    return outcome.kind === 'rejected' ? then(outcome.code, outcome.message) : [];
  }
}
