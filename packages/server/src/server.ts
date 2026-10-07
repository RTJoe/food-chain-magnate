/**
 * HTTP + WebSocket server assembly. `startServer` is used by the CLI entry (index.ts) and by the
 * integration tests (in-process, random port). The engine is injected.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { EngineApi } from '@fcm/engine';
import { inlineBotRunner, type BotDelay, type BotRunner } from '@fcm/session';
import { WorkerBotRunner } from './botRunner.js';
import type { Limits } from './limits.js';
import { FilePersistence, NullPersistence, type Persistence } from './persistence.js';
import { ROOM_IDLE_TTL_MS, RoomStore } from './roomStore.js';
import { SessionRegistry } from './sessions.js';
import { staticHandler } from './static.js';
import { Hub } from './ws.js';

export const MAX_FRAME_BYTES = 256 * 1024;

export interface ServerOptions {
  engine: EngineApi;
  /** 0 = random free port. Default 3000. */
  port?: number;
  host?: string;
  /** Built client directory to serve. */
  clientDist: string;
  /** Data directory for room snapshots; null disables persistence. */
  dataDir?: string | null;
  persistence?: Persistence;
  persistDebounceMs?: number;
  heartbeatMs?: number;
  /** Host-transfer / GC sweep interval. */
  tickMs?: number;
  idleTtlMs?: number;
  /** Delete room files after this long without activity (default 30 days). */
  retentionMs?: number;
  /** Same, for lobbies whose game never started (default 2 days). */
  lobbyRetentionMs?: number;
  gzip?: boolean;
  /** Where bot moves are computed: a worker-thread pool (default), inline, or a custom runner. */
  botRunner?: 'worker' | 'inline' | BotRunner;
  /** Worker pool size for `botRunner: 'worker'`. */
  botWorkers?: number;
  /** Delay before a bot moves (default 400–900 ms; 0 in tests). */
  botDelay?: BotDelay;
  /** Abuse limits (default `DEFAULT_LIMITS`; the CLI reads them from env, see limits.ts). */
  limits?: Partial<Limits>;
  now?: () => number;
  log?: (msg: string) => void;
}

export interface RunningServer {
  port: number;
  host: string;
  hub: Hub;
  /** Flush persistence, close sockets, stop listening. */
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.log(m));
  const persistence =
    opts.persistence ?? (opts.dataDir ? new FilePersistence(opts.dataDir, opts.persistDebounceMs, log) : new NullPersistence());
  const workers = (opts.botRunner ?? 'worker') === 'worker' ? new WorkerBotRunner({ log, ...(opts.botWorkers ? { size: opts.botWorkers } : {}) }) : null;
  const botRunner: BotRunner = workers ? workers.run : opts.botRunner === 'inline' || opts.botRunner === undefined ? inlineBotRunner : (opts.botRunner as BotRunner);
  const hub = new Hub({
    botRunner,
    ...(opts.botDelay !== undefined ? { botDelay: opts.botDelay } : {}),
    engine: opts.engine,
    store: new RoomStore(now),
    sessions: new SessionRegistry(now),
    persistence,
    now,
    log,
    idleTtlMs: opts.idleTtlMs ?? ROOM_IDLE_TTL_MS,
    ...(opts.retentionMs !== undefined ? { retentionMs: opts.retentionMs } : {}),
    ...(opts.lobbyRetentionMs !== undefined ? { lobbyRetentionMs: opts.lobbyRetentionMs } : {}),
    ...(opts.limits ? { limits: opts.limits } : {}),
  });
  const restored = hub.restore(persistence.loadAll());
  if (restored) log(`restored ${restored} room(s)`);

  const http = createServer(staticHandler(opts.clientDist, { gzip: opts.gzip ?? true }));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  http.on('upgrade', (req, socket, head) => {
    // Untrusted input: a malformed target (e.g. `GET //`) makes `new URL` throw. Drop that socket only.
    let path: string;
    try {
      path = new URL(req.url ?? '/', 'http://x').pathname;
    } catch {
      path = '';
    }
    if (path !== '/ws') {
      socket.destroy();
      return;
    }
    try {
      wss.handleUpgrade(req, socket, head, (ws) => hub.guard('attach', () => hub.attach(ws)));
    } catch (e) {
      log(`upgrade failed: ${(e as Error).message}`);
      socket.destroy();
    }
  });

  const heartbeat = setInterval(() => hub.guard('heartbeat', () => hub.heartbeat()), opts.heartbeatMs ?? 15_000);
  const tick = setInterval(() => hub.guard('tick', () => hub.tick()), opts.tickMs ?? 5_000);
  heartbeat.unref();
  tick.unref();

  const host = opts.host ?? '0.0.0.0';
  await new Promise<void>((res, rej) => {
    http.once('error', rej);
    http.listen(opts.port ?? 3000, host, () => {
      http.off('error', rej);
      res();
    });
  });
  const port = (http.address() as AddressInfo).port;

  let closed: Promise<void> | null = null;
  const close = () =>
    (closed ??= new Promise<void>((res) => {
      clearInterval(heartbeat);
      clearInterval(tick);
      // Write first: the process may be killed before the sockets finish closing.
      persistence.flush();
      hub.closeAll();
      for (const c of wss.clients) c.terminate();
      wss.close();
      http.closeAllConnections?.();
      http.close(() => {
        persistence.flush();
        void (workers?.close() ?? Promise.resolve()).finally(res);
      });
    }));

  return { port, host, hub, close };
}

/** The bits of `process` that `installCrashGuards` uses (injectable for tests). */
export interface CrashTarget {
  on(event: 'uncaughtException' | 'unhandledRejection', listener: (e: unknown) => void): unknown;
}

/**
 * Last resort: log an escaped exception or rejection instead of exiting. One bad room must not take
 * every other game down (and crash-loop under `restart: unless-stopped`). Every known callback is
 * already guarded; this only catches what slips through.
 */
export function installCrashGuards(proc: CrashTarget = process, log: (msg: string) => void = console.error): void {
  const report = (kind: string) => (e: unknown) => log(`${kind} (kept running): ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  proc.on('uncaughtException', report('uncaught exception'));
  proc.on('unhandledRejection', report('unhandled rejection'));
}

/** The bits of `process` that `installShutdown` uses (injectable for tests). */
export interface SignalTarget {
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  exit(code?: number): never | void;
}

/**
 * SIGTERM (docker stop) / SIGINT (Ctrl-C): flush persistence and close, then exit. Persistence is
 * flushed synchronously before anything else, so even the forced exit after `graceMs` loses
 * nothing. Node installs real handlers, so this also works as PID 1 in a container.
 */
export function installShutdown(server: RunningServer, proc: SignalTarget = process, log: (msg: string) => void = console.log, graceMs = 1500): void {
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received: saving rooms and shutting down`);
    const force = setTimeout(() => proc.exit(0), graceMs);
    force.unref?.();
    server.close().then(
      () => proc.exit(0),
      (e: unknown) => {
        log(`shutdown error: ${(e as Error).message}`);
        proc.exit(1);
      },
    );
  };
  proc.on('SIGINT', () => shutdown('SIGINT'));
  proc.on('SIGTERM', () => shutdown('SIGTERM'));
}
