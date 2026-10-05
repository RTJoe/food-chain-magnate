/**
 * Bot seats in a running game (docs/ai.md). The `BotDriver` watches one `GameSession`: whenever
 * the engine awaits a bot seat it waits a short, human-feeling delay, asks a `BotRunner` for the
 * move (off the main loop in the server: a worker thread), and applies it through
 * `GameSession.submitBotAction`, which falls back to a safe move if the bot fails. A move computed
 * for an older seq (someone acted or undid meanwhile) is discarded and the bot thinks again.
 *
 * Transport-agnostic like the rest of the session: timers are injected, outbound messages go to
 * `deliver`, so the server (and tests) decide how to send and persist them.
 */
import type { Action, PlayerId } from '@fcm/engine';
import { botBudgetMs, runBot, type BotRequest } from '@fcm/ai';
import type { AudienceMember, GameSession, Outbound } from './gameSession.js';

/** Computes a bot move somewhere (inline, worker thread, Web Worker). May reject; the driver then falls back. */
export type BotRunner = (req: BotRequest) => Promise<Action>;

/** Runs bots on the calling thread (tests, tools). The server uses a worker-thread runner. */
export const inlineBotRunner: BotRunner = (req) =>
  new Promise((resolve, reject) => {
    try {
      resolve(runBot(req));
    } catch (e) {
      reject(e);
    }
  });

/** Delay before a bot moves: a fixed number or a random range (ms). */
export type BotDelay = number | { min: number; max: number };
export const DEFAULT_BOT_DELAY: BotDelay = { min: 400, max: 900 };

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const globalTimers = (): Timers => {
  const g = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
  return { set: (fn, ms) => g.setTimeout(fn, ms), clear: (h) => g.clearTimeout(h) };
};

export interface BotDriverOptions {
  runner?: BotRunner;
  /** Send (and persist) the messages of an applied bot move. */
  deliver: (out: Outbound[]) => void;
  /** Who receives the fan-out (connected members and their viewers). */
  audience: () => AudienceMember[];
  delay?: BotDelay;
  /** Thinking budget for every bot (default: per level, `botBudgetMs`). */
  budgetMs?: number;
  /** Bots pause while this is false (e.g. nobody connected); call `poke()` when it changes. */
  active?: () => boolean;
  /** Called when the bot that is thinking changes (null = none). */
  onThinking?: (player: PlayerId | null) => void;
  log?: (msg: string) => void;
  random?: () => number;
  timers?: Timers;
}

export class BotDriver {
  private thinkingFor: PlayerId | null = null;
  private timer: unknown = null;
  private disposed = false;
  private idleWaiters: (() => void)[] = [];
  private readonly timers: Timers;

  constructor(
    readonly game: GameSession,
    private readonly opts: BotDriverOptions,
  ) {
    this.timers = opts.timers ?? globalTimers();
  }

  /** The bot seat currently deciding, if any. */
  get thinking(): PlayerId | null {
    return this.thinkingFor;
  }

  /** Re-check the game: start a bot move if the engine awaits a bot seat. Call after every change. */
  poke(): void {
    if (this.disposed || this.thinkingFor) return;
    const player = this.game.awaitedBot();
    if (!player || (this.opts.active && !this.opts.active())) return this.settle();
    const seq = this.game.seq;
    this.setThinking(player);
    // Thinking starts now and overlaps the human-feeling delay: the move lands after whichever
    // takes longer (a 2 s Hard search is not followed by another 0.4-0.9 s wait).
    const delay = this.delayMs();
    let waited = delay <= 0;
    let result: { action: Action | null } | null = null;
    const land = () => {
      if (this.disposed || !waited || !result) return;
      this.finish(player, seq, result.action);
    };
    if (!waited)
      this.timer = this.timers.set(() => {
        this.timer = null;
        waited = true;
        land();
      }, delay);
    let pending: Promise<Action>;
    try {
      const level = this.game.bots[player] ?? 'easy';
      pending = (this.opts.runner ?? inlineBotRunner)(this.game.botRequest(player, this.opts.budgetMs ?? botBudgetMs(level)));
    } catch (e) {
      pending = Promise.reject(e);
    }
    pending.then(
      (action) => {
        result = { action };
        land();
      },
      (e: unknown) => {
        this.opts.log?.(`bots: ${player} failed to decide: ${e instanceof Error ? e.message : String(e)}`);
        result = { action: null };
        land();
      },
    );
  }

  /** Resolves once no bot is thinking and the game is not waiting on a (running) bot. For tests. */
  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((res) => this.idleWaiters.push(res));
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
    this.setThinking(null);
    this.settle();
  }

  private finish(player: PlayerId, seq: number, action: Action | null): void {
    if (this.disposed) return;
    if (this.game.seq !== seq) return this.restart();
    const r = this.game.submitBotAction(player, action, this.opts.audience());
    if (r.fellBack) this.opts.log?.(`bots: ${player} (${this.game.bots[player]}) fell back: ${r.message ?? ''}`);
    this.setThinking(null);
    if (r.applied) this.opts.deliver(r.out);
    else this.opts.log?.(`bots: ${player} could not move: ${r.message ?? ''}`);
    if (r.applied) this.poke();
    else this.settle();
  }

  private restart(): void {
    this.setThinking(null);
    this.poke();
  }

  private setThinking(p: PlayerId | null): void {
    if (this.thinkingFor === p) return;
    this.thinkingFor = p;
    this.opts.onThinking?.(p);
  }

  private isIdle(): boolean {
    if (this.disposed) return true;
    if (this.thinkingFor) return false;
    return !this.game.awaitedBot() || Boolean(this.opts.active && !this.opts.active());
  }

  private settle(): void {
    if (!this.isIdle()) return;
    for (const w of this.idleWaiters.splice(0)) w();
  }

  private delayMs(): number {
    const d = this.opts.delay ?? DEFAULT_BOT_DELAY;
    if (typeof d === 'number') return Math.max(0, d);
    const r = (this.opts.random ?? Math.random)();
    return Math.max(0, Math.round(d.min + r * Math.max(0, d.max - d.min)));
  }
}
