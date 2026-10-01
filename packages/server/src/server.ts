/**
 * HTTP + WebSocket server assembly. `startServer` is used by the CLI entry (index.ts) and by the
 * integration tests (in-process, random port). The engine is injected.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { EngineApi } from '@fcm/engine';
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
  gzip?: boolean;
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
  const hub = new Hub({
    engine: opts.engine,
    store: new RoomStore(now),
    sessions: new SessionRegistry(now),
    persistence,
    now,
    log,
    idleTtlMs: opts.idleTtlMs ?? ROOM_IDLE_TTL_MS,
  });
  const restored = hub.restore(persistence.loadAll());
  if (restored) log(`restored ${restored} room(s)`);

  const http = createServer(staticHandler(opts.clientDist, { gzip: opts.gzip ?? true }));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  http.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => hub.attach(ws));
  });

  const heartbeat = setInterval(() => hub.heartbeat(), opts.heartbeatMs ?? 15_000);
  const tick = setInterval(() => hub.tick(), opts.tickMs ?? 5_000);
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
      persistence.flush();
      hub.closeAll();
      for (const c of wss.clients) c.terminate();
      wss.close();
      http.closeAllConnections?.();
      http.close(() => res());
    }));

  return { port, host, hub, close };
}
