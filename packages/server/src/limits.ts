/**
 * Abuse limits (architecture §4.6). Defaults are far above what normal play needs; every one can be
 * changed by an env var (README "Configuration"). A limit of 0 (or less) is ignored by the parser.
 */

export interface Limits {
  /** Per connection: sustained client messages per second (token bucket refill). */
  msgRate: number;
  /** Per connection: message burst (bucket size). */
  msgBurst: number;
  /** Per connection: new sessions (token-less hello) and new rooms, as a burst; refills one per `createRefillMs`. */
  createBurst: number;
  createRefillMs: number;
  /** Per connection: `game.resync` burst; refills one per `resyncRefillMs`. */
  resyncBurst: number;
  resyncRefillMs: number;
  /** Per connection: `room.join` misses (unknown code) as a burst; refills one per `joinMissRefillMs`. Stops code enumeration. */
  joinMissBurst: number;
  joinMissRefillMs: number;
  /** Whole server: sessions held in memory. */
  maxSessions: number;
  /** Whole server: rooms (in memory or on disk). */
  maxRooms: number;
  /** Largest accepted action, serialized (bytes). */
  maxActionBytes: number;
  /** Longest action log per game; later actions are rejected. */
  maxGameActions: number;
  /** A socket whose unsent output exceeds this (bytes) is too slow to keep up and is dropped. */
  maxBufferedBytes: number;
}

export const DEFAULT_LIMITS: Limits = {
  msgRate: 20,
  msgBurst: 60,
  createBurst: 10,
  createRefillMs: 30_000,
  resyncBurst: 5,
  resyncRefillMs: 2_000,
  joinMissBurst: 10,
  joinMissRefillMs: 3_000,
  maxSessions: 20_000,
  maxRooms: 5_000,
  maxActionBytes: 8 * 1024,
  maxGameActions: 20_000,
  maxBufferedBytes: 4 * 1024 * 1024,
};

/** Env var for each limit (KB variants are multiplied by 1024). */
const ENV: Record<keyof Limits, [name: string, scale: number]> = {
  msgRate: ['FCM_MSG_RATE', 1],
  msgBurst: ['FCM_MSG_BURST', 1],
  createBurst: ['FCM_CREATE_BURST', 1],
  createRefillMs: ['FCM_CREATE_REFILL_MS', 1],
  resyncBurst: ['FCM_RESYNC_BURST', 1],
  resyncRefillMs: ['FCM_RESYNC_REFILL_MS', 1],
  joinMissBurst: ['FCM_JOIN_MISS_BURST', 1],
  joinMissRefillMs: ['FCM_JOIN_MISS_REFILL_MS', 1],
  maxSessions: ['FCM_MAX_SESSIONS', 1],
  maxRooms: ['FCM_MAX_ROOMS', 1],
  maxActionBytes: ['FCM_MAX_ACTION_BYTES', 1],
  maxGameActions: ['FCM_MAX_GAME_ACTIONS', 1],
  maxBufferedBytes: ['FCM_MAX_BUFFERED_KB', 1024],
};

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): Limits {
  const out = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(ENV) as (keyof Limits)[]) {
    const [name, scale] = ENV[key];
    const raw = env[name];
    const n = Number(raw);
    if (raw !== undefined && raw !== '' && Number.isFinite(n) && n > 0) out[key] = n * scale;
  }
  return out;
}

/** Token bucket: `take()` spends one token if available; tokens refill continuously. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly size: number,
    /** Tokens per millisecond. */
    private readonly perMs: number,
    private readonly now: () => number,
  ) {
    this.tokens = size;
    this.last = now();
  }

  /** True if a token is available (without spending it). */
  has(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.size, this.tokens + (t - this.last) * this.perMs);
    this.last = t;
    return this.tokens >= 1;
  }

  take(): boolean {
    if (!this.has()) return false;
    this.tokens -= 1;
    return true;
  }
}
