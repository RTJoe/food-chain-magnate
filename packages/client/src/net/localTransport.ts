/**
 * In-process transport for hot-seat play and dev fixtures (architecture §5.5). Runs an engine
 * locally and answers with the same server messages as the real server, so the store and UI do not
 * know the difference.
 *
 * Hot-seat: one device, many players. The view is redacted for the current viewer only. When the
 * engine starts waiting on someone else, the transport switches to a spectator view and fires the
 * `handoff` pseudo-event; the UI shows a pass-the-device screen and calls `acceptHandoff()` once the
 * next player has the device, which sends that player's snapshot.
 */
import type { Action, EngineApi, GameConfig, GameEvent, GameState, ModuleManifest, PlayerId, Viewer } from '@fcm/engine';
import type { ClientMessage, ServerMessage } from '@fcm/protocol';
import { PROTOCOL_VERSION } from '@fcm/protocol';
import type { ConnectionStatus, Transport, Unsubscribe } from './transport.js';

export interface LocalTransportOptions {
  engine: EngineApi;
  /** New game… */
  config?: GameConfig;
  seed?: number;
  /** …or an existing state (dev fixtures). */
  state?: GameState;
  /** Fixed viewer (dev fixtures). Hot-seat follows `awaiting` when omitted. */
  viewer?: Viewer;
  /** Pass-the-device screens between players (hot-seat). */
  handoff?: boolean;
}

interface UndoEntry {
  state: GameState;
  by: PlayerId;
  seq: number;
}

const isNotImplemented = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'NOT_IMPLEMENTED';

export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  status: ConnectionStatus = 'idle';
  state: GameState | null = null;
  viewer: Viewer = 'spectator';
  private undo: UndoEntry[] = [];
  private manifest: ModuleManifest[] = [];
  private msgListeners = new Set<(m: ServerMessage) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private handoffListeners = new Set<(to: PlayerId) => void>();
  private outbox: ServerMessage[] = [];
  private flushing = false;

  constructor(private readonly opts: LocalTransportOptions) {}

  connect(): void {
    if (this.status === 'open') return;
    try {
      this.manifest = this.opts.engine.listModules();
    } catch {
      this.manifest = [];
    }
    this.state = this.opts.state ?? this.opts.engine.createGame(this.requireConfig(), this.opts.seed ?? randomSeed());
    this.setStatus('open');
    this.emit({ t: 'welcome', clientId: 'local', sessionToken: '', serverVersion: 'local', protocol: PROTOCOL_VERSION, room: null });
    if (this.opts.viewer) {
      this.viewer = this.opts.viewer;
      this.snapshot();
    } else this.followAwaiting(true);
  }

  close(): void {
    this.setStatus('closed');
    this.msgListeners.clear();
    this.statusListeners.clear();
    this.handoffListeners.clear();
  }

  send(msg: ClientMessage): void {
    switch (msg.t) {
      case 'hello':
      case 'ping':
        if (msg.t === 'ping') this.emit({ t: 'pong', ts: msg.ts, serverTs: Date.now() });
        return;
      case 'game.action':
        return this.act(msg.id, msg.expectedSeq, msg.action);
      case 'game.undo':
        return this.undoLast(msg.expectedSeq);
      case 'game.resync':
        return this.snapshot();
      default:
        this.emit({ t: 'error', code: 'NOT_IMPLEMENTED', message: `${msg.t} is not available in a local game` });
    }
  }

  onMessage(listener: (msg: ServerMessage) => void): Unsubscribe {
    this.msgListeners.add(listener);
    return () => this.msgListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Hot-seat pseudo-event: the device must be passed to `to`. */
  onHandoff(listener: (to: PlayerId) => void): Unsubscribe {
    this.handoffListeners.add(listener);
    return () => this.handoffListeners.delete(listener);
  }

  /** The next player has the device: show their view. */
  acceptHandoff(to: PlayerId): void {
    this.viewer = to;
    this.snapshot();
  }

  /** Dev: switch viewer without a handoff screen. */
  setViewer(v: Viewer): void {
    this.viewer = v;
    this.snapshot();
  }

  get seq(): number {
    return this.state?.history.seq ?? 0;
  }

  private requireConfig(): GameConfig {
    if (!this.opts.config) throw new Error('LocalTransport needs a config or a state');
    return this.opts.config;
  }

  private act(id: string, expectedSeq: number, action: Action): void {
    const s = this.state;
    if (!s) return;
    if (expectedSeq !== this.seq) {
      this.emit({ t: 'game.rejected', id, code: 'STALE', message: 'The game moved on; try again' });
      this.snapshot();
      return;
    }
    // Hot-seat: the device holder acts for the current viewer (like the server's seat overwrite).
    const playerId = this.viewer === 'spectator' ? action.playerId : this.viewer;
    const a = { ...action, playerId } as Action;
    let result;
    try {
      result = this.opts.engine.applyAction(s, a);
    } catch (e) {
      const code = isNotImplemented(e) ? 'NOT_IMPLEMENTED' : 'INTERNAL';
      const message = isNotImplemented(e) ? 'The rules engine cannot do that yet' : e instanceof Error ? e.message : String(e);
      this.emit({ t: 'game.rejected', id, code, message });
      return;
    }
    if (!result.ok) {
      this.emit({ t: 'game.rejected', id, code: result.code, message: result.message });
      return;
    }
    if (result.undoable) this.undo.push({ state: s, by: playerId, seq: this.seq });
    else this.undo = [];
    this.state = result.state;
    // Events are redacted for spectators: in hot-seat several people read the same log.
    const events = this.redactEvents(result.events, this.opts.handoff ? 'spectator' : this.viewer);
    this.emit({ t: 'game.applied', seq: this.seq, actionId: id, action: a, events, view: this.opts.engine.redactFor(this.state, this.viewer) });
    if (!this.opts.viewer) this.followAwaiting(false);
  }

  private redactEvents(events: GameEvent[], viewer: Viewer): GameEvent[] {
    try {
      return this.opts.engine.redactEvents(events, viewer);
    } catch {
      return events;
    }
  }

  private undoLast(expectedSeq: number): void {
    const top = this.undo[this.undo.length - 1];
    if (!top || expectedSeq !== this.seq || (this.viewer !== 'spectator' && top.by !== this.viewer)) {
      this.emit({ t: 'error', code: 'BAD_MESSAGE', message: 'Nothing to undo' });
      return;
    }
    this.undo.pop();
    this.state = top.state;
    this.emit({ t: 'game.undone', seq: this.seq, view: this.opts.engine.redactFor(this.state, this.viewer), by: top.by });
  }

  /** Hot-seat: keep the viewer while they are still awaited; otherwise hand off to the next awaited player. */
  private followAwaiting(initial: boolean): void {
    const s = this.state;
    if (!s) return;
    const awaited = s.awaiting.players;
    if (this.viewer !== 'spectator' && awaited.includes(this.viewer) && !initial) return;
    const next = awaited[0];
    if (!next || s.phase.kind === 'gameOver') {
      if (initial) {
        this.viewer = s.turnOrder[0] ?? 'spectator';
        this.snapshot();
      }
      return;
    }
    if (!this.opts.handoff) {
      this.viewer = next;
      this.snapshot();
      return;
    }
    // Hide private info before the device changes hands.
    this.viewer = 'spectator';
    this.snapshot();
    for (const l of [...this.handoffListeners]) l(next);
  }

  private snapshot(): void {
    const s = this.state;
    if (!s) return;
    this.emit({
      t: 'game.snapshot',
      seq: this.seq,
      view: this.opts.engine.redactFor(s, this.viewer),
      manifest: this.manifest,
      me: this.viewer === 'spectator' ? null : this.viewer,
    });
  }

  /** Delivered asynchronously and in order, like a socket. */
  private emit(msg: ServerMessage): void {
    this.outbox.push(msg);
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => {
      while (this.outbox.length) {
        const m = this.outbox.shift() as ServerMessage;
        for (const l of [...this.msgListeners]) l(m);
      }
      this.flushing = false;
    });
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    for (const l of [...this.statusListeners]) l(s);
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
