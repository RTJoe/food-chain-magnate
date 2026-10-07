/**
 * In-process transport for hot-seat play and dev fixtures (architecture §5.5). Runs an engine
 * locally and answers with the same server messages as the real server, so the store and UI do not
 * know the difference.
 *
 * Hot-seat: one device, many players. The view is redacted for the current viewer only. When the
 * engine starts waiting on someone else, the transport switches to a spectator view and fires the
 * `handoff` pseudo-event; the UI shows a pass-the-device screen and calls `acceptHandoff()` once the
 * next player has the device, which sends that player's snapshot.
 *
 * Bot seats (docs/ai.md): when the engine awaits a bot, the transport waits a short delay, asks the
 * bot runner (a Web Worker in the browser) for a move on the bot's redacted view and applies it.
 * Bots never get the device: handoffs only go to human seats, and while bots think the current
 * human keeps their view. Undo rewinds past bot moves made after the human's own move.
 */
import type { Action, EngineApi, GameConfig, GameEvent, GameState, GameView, ModuleManifest, PlayerId, Viewer } from '@fcm/engine';
import { botBudgetMs, decisionSeed, fallbackAction, type BotLevel, type BotRequest } from '@fcm/ai';
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
  /** Seats played by bots (hot-seat). */
  bots?: Record<PlayerId, BotLevel>;
  /** Where bot moves are computed (default: a Web Worker; see botRunner.ts). Required when `bots` is set. */
  botRunner?: LocalBotRunner;
  /** Delay before a bot moves, ms (default 400–900). */
  botDelay?: number | { min: number; max: number };
  /**
   * Tutorial (docs/tutorial-plan.md §4.2): seats moved by a lesson script through `actFor`. They are
   * never handed the device and the device holder cannot act for them.
   */
  scripted?: PlayerId[];
  /** Actions applied silently on connect, before the first snapshot (tutorial resume by replay). */
  prelude?: Action[];
  /** Allow `game.undo` (default true; lessons turn it off so the recorded action list stays linear). */
  undo?: boolean;
  /** Called after every applied or undone move (hot-seat saves the game with `saveData()`). */
  onChange?: () => void;
}

/** What it takes to rebuild this game: `createGame(config, seed)` plus `actions`. Null for fixture states. */
export interface LocalSaveData {
  config: GameConfig;
  seed: number;
  actions: Action[];
  round: number;
  phase: string;
  over: boolean;
}

/** One replayed prelude move, redacted for spectators (what every hot-seat player may see). */
export interface ReplayedMove {
  seq: number;
  events: GameEvent[];
  view: GameView;
}

export type ActResult = { ok: true; events: GameEvent[] } | { ok: false; code: string; message: string };

export interface LocalBotRunner {
  run(req: BotRequest): Promise<Action>;
  dispose?(): void;
}

/** Hot-seat thinking budget for a level (shorter Hard search: every bot move holds up the table). */
export const botBudgetFor = (level: BotLevel): number => botBudgetMs(level, 'hotSeat');

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
  /** Bot seat deciding now, and a generation counter that invalidates stale bot answers. */
  private botThinking: PlayerId | null = null;
  private botGen = 0;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  /** Every action applied since the start state (prelude included), in order. */
  private applied: Action[] = [];
  /**
   * The prelude's moves since the previous round began (a resumed game): the store rebuilds the
   * results strips and log lines for them, which a snapshot alone does not carry.
   */
  replayed: ReplayedMove[] = [];

  constructor(private readonly opts: LocalTransportOptions) {}

  private isBot(p: PlayerId): boolean {
    return Boolean(this.opts.bots?.[p]);
  }

  private isScripted(p: PlayerId): boolean {
    return Boolean(this.opts.scripted?.includes(p));
  }

  /** Every action applied since the start state, in order (the tutorial's resume log). */
  get actions(): readonly Action[] {
    return this.applied;
  }

  /**
   * Tutorial: apply `action` for a scripted seat (bypasses the viewer overwrite of `act`). Events
   * reach listeners redacted for the viewer, as a real opponent's would.
   */
  actFor(playerId: PlayerId, action: Action): ActResult {
    const s = this.state;
    if (!s) return { ok: false, code: 'NOT_STARTED', message: 'No game' };
    if (!this.isScripted(playerId)) return { ok: false, code: 'NOT_SEATED', message: `${playerId} is not a scripted seat` };
    const a = { ...action, playerId } as Action;
    let result;
    try {
      result = this.opts.engine.applyAction(s, a);
    } catch (e) {
      return { ok: false, code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) };
    }
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    this.commit(s, a, result, null);
    return { ok: true, events: result.events };
  }

  /** The game as config + seed + every action (prelude included), or null for a game started from a state. */
  saveData(): LocalSaveData | null {
    const s = this.state;
    if (!s || this.opts.state || !this.opts.config) return null;
    return { config: this.opts.config, seed: s.seed, actions: [...this.applied], round: s.round, phase: s.phase.kind, over: s.phase.kind === 'gameOver' };
  }

  /** The bot seat deciding right now (null when none). */
  get thinking(): PlayerId | null {
    return this.botThinking;
  }

  connect(): void {
    if (this.status === 'open') return;
    try {
      this.manifest = this.opts.engine.listModules();
    } catch {
      this.manifest = [];
    }
    this.state = this.opts.state ?? this.opts.engine.createGame(this.requireConfig(), this.opts.seed ?? randomSeed());
    // Keep the last two rounds' moves (states, not views: redacting every move would be wasted work).
    let kept: { state: GameState; events: GameEvent[] }[] = [];
    let roundAt = -1;
    for (const [i, a] of (this.opts.prelude ?? []).entries()) {
      const r = this.opts.engine.applyAction(this.state, a);
      if (!r.ok) throw new Error(`prelude action ${i} (${a.type}) rejected: ${r.message}`);
      this.state = r.state;
      this.applied.push(a);
      if (r.events.some((e) => e.type === 'roundStarted')) {
        if (roundAt >= 0) {
          kept = kept.slice(roundAt);
        }
        roundAt = kept.length;
      }
      kept.push({ state: r.state, events: r.events });
    }
    try {
      this.replayed = kept.map((k) => ({ seq: k.state.history.seq, events: this.redactEvents(k.events, 'spectator'), view: this.opts.engine.redactFor(k.state, 'spectator') }));
    } catch {
      this.replayed = [];
    }
    this.setStatus('open');
    this.emit({ t: 'welcome', clientId: 'local', sessionToken: '', serverVersion: 'local', protocol: PROTOCOL_VERSION, room: null });
    if (this.opts.viewer) {
      this.viewer = this.opts.viewer;
      this.snapshot();
    } else this.followAwaiting(true);
    this.scheduleBots();
  }

  close(): void {
    this.botGen++;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    this.botThinking = null;
    this.opts.botRunner?.dispose?.();
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
    if (this.isBot(playerId) || this.isScripted(playerId)) {
      this.emit({ t: 'game.rejected', id, code: 'NOT_SEATED', message: this.isBot(playerId) ? 'A bot plays this seat' : 'The lesson plays this seat' });
      return;
    }
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
    this.commit(s, a, result, id);
  }

  private commit(prev: GameState, a: Action, result: { state: GameState; events: GameEvent[]; undoable: boolean }, id: string | null): void {
    if (result.undoable) this.undo.push({ state: prev, by: a.playerId, seq: this.seq });
    else this.undo = [];
    this.state = result.state;
    this.applied.push(a);
    // Events are redacted for spectators: in hot-seat several people read the same log.
    const events = this.redactEvents(result.events, this.opts.handoff ? 'spectator' : this.viewer);
    this.emit({ t: 'game.applied', seq: this.seq, actionId: id, action: a, events, view: this.opts.engine.redactFor(this.state, this.viewer) });
    if (!this.opts.viewer) this.followAwaiting(false);
    this.scheduleBots();
    this.opts.onChange?.();
  }

  // --- bots -------------------------------------------------------------------

  private botDelayMs(): number {
    const d = this.opts.botDelay ?? { min: 400, max: 900 };
    return typeof d === 'number' ? Math.max(0, d) : Math.round(d.min + Math.random() * Math.max(0, d.max - d.min));
  }

  /** Start a bot move if the engine awaits a bot seat and none is thinking. */
  private scheduleBots(): void {
    const s = this.state;
    const runner = this.opts.botRunner;
    if (!s || !runner || this.botThinking || this.status === 'closed' || s.phase.kind === 'gameOver') return;
    const player = s.awaiting.players.find((p) => this.isBot(p));
    if (!player) return;
    const gen = ++this.botGen;
    const seq = this.seq;
    this.botThinking = player;
    // Thinking starts at once and overlaps the human-feeling delay: the move lands after
    // whichever takes longer.
    const delay = this.botDelayMs();
    let waited = delay <= 0;
    let result: { action: Action | null } | null = null;
    const land = () => {
      if (gen !== this.botGen || !waited || !result) return;
      this.botMove(gen, seq, player, result.action);
    };
    if (!waited)
      this.botTimer = setTimeout(() => {
        this.botTimer = null;
        waited = true;
        land();
      }, delay);
    const level = this.opts.bots?.[player] ?? 'easy';
    const req: BotRequest = {
      level,
      view: this.opts.engine.redactFor(s, player),
      playerId: player,
      seed: decisionSeed(s.seed, seq, player),
      budgetMs: botBudgetFor(level),
    };
    let pending: Promise<Action>;
    try {
      pending = runner.run(req);
    } catch (e) {
      pending = Promise.reject(e);
    }
    pending.then(
      (a) => {
        result = { action: a };
        land();
      },
      () => {
        result = { action: null };
        land();
      },
    );
  }

  private botMove(gen: number, seq: number, player: PlayerId, action: Action | null): void {
    if (gen !== this.botGen) return; // cancelled (undo, close)
    this.botThinking = null;
    const s = this.state;
    if (!s) return;
    if (seq !== this.seq || !s.awaiting.players.includes(player)) return this.scheduleBots();
    const apply = (a: Action) => {
      try {
        return this.opts.engine.applyAction(s, { ...a, playerId: player } as Action);
      } catch {
        return null;
      }
    };
    let a = action ? ({ ...action, playerId: player } as Action) : null;
    let r = a ? apply(a) : null;
    if (!r || !r.ok) {
      try {
        a = fallbackAction(s, player, this.opts.engine);
        r = apply(a);
      } catch {
        r = null;
      }
    }
    if (!a || !r || !r.ok) {
      this.emit({ t: 'error', code: 'INTERNAL', message: `Bot ${player} could not move` });
      return;
    }
    this.commit(s, a, r, null);
  }

  private redactEvents(events: GameEvent[], viewer: Viewer): GameEvent[] {
    try {
      return this.opts.engine.redactEvents(events, viewer);
    } catch {
      return events;
    }
  }

  private undoLast(expectedSeq: number): void {
    // Bot moves made after the viewer's last move are rewound with it; the bots decide again.
    let i = this.undo.length - 1;
    while (i >= 0 && this.isBot((this.undo[i] as UndoEntry).by) && (this.undo[i] as UndoEntry).by !== this.viewer) i--;
    const top = this.undo[i];
    if (this.opts.undo === false) {
      this.emit({ t: 'error', code: 'BAD_MESSAGE', message: 'Undo is off in lessons' });
      return;
    }
    if (!top || expectedSeq !== this.seq || (this.viewer !== 'spectator' && top.by !== this.viewer)) {
      this.emit({ t: 'error', code: 'BAD_MESSAGE', message: 'Nothing to undo' });
      return;
    }
    this.undo = this.undo.slice(0, i);
    this.applied = this.applied.slice(0, top.seq - (this.seq - this.applied.length));
    this.state = top.state;
    this.botGen++;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    this.botThinking = null;
    this.emit({ t: 'game.undone', seq: this.seq, view: this.opts.engine.redactFor(this.state, this.viewer), by: top.by });
    if (!this.opts.viewer) this.followAwaiting(false);
    this.scheduleBots();
    this.opts.onChange?.();
  }

  /**
   * Hot-seat: keep the viewer while they are still awaited; otherwise hand off to the next awaited
   * human. While only bots are awaited the current human keeps their view.
   */
  private followAwaiting(initial: boolean): void {
    const s = this.state;
    if (!s) return;
    const awaited = s.awaiting.players.filter((p) => !this.isBot(p));
    if (this.viewer !== 'spectator' && awaited.includes(this.viewer) && !initial) return;
    const next = awaited[0];
    if (!next || s.phase.kind === 'gameOver') {
      if (initial) {
        this.viewer = s.turnOrder.find((p) => !this.isBot(p)) ?? 'spectator';
        this.snapshot();
      }
      return;
    }
    if (next === this.viewer) return;
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
