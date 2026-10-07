/**
 * @fcm/server CLI entry: serves packages/client/dist over HTTP and accepts WebSocket upgrades on
 * /ws (architecture §4). Env: PORT (3000), HOST (0.0.0.0), FCM_DATA_DIR (./data),
 * FCM_PERSIST=0, FCM_ROOM_RETENTION_DAYS (30), FCM_LOBBY_RETENTION_DAYS (2), FCM_CLIENT_DIST, FCM_ENGINE=real|toy (default: real, falling back to the toy
 * engine while the real one is not implemented), FCM_BOT_DELAY_MS ("400-900" or a single number),
 * FCM_BOT_WORKERS (bot worker threads; default half the cores, 1–4), and the abuse limits in
 * limits.ts (FCM_MSG_RATE, FCM_MAX_ROOMS, ...; README "Configuration").
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { engine as realEngine, NotImplementedError, type EngineApi } from '@fcm/engine';
import { joinUrls } from './lanAddress.js';
import { persistenceFromEnv, retentionFromEnv } from './persistence.js';
import { botDelayFromEnv } from './botRunner.js';
import { limitsFromEnv } from './limits.js';
import { installCrashGuards, installShutdown, startServer } from './server.js';
import { SERVER_VERSION } from './ws.js';

export { installCrashGuards, installShutdown, startServer, type RunningServer, type ServerOptions } from './server.js';
export { SERVER_VERSION } from './ws.js';

/** Engine selection. Swapping engines is this one function; everything else takes `EngineApi`. */
async function selectEngine(): Promise<EngineApi> {
  const want = process.env.FCM_ENGINE;
  if (want !== 'toy') {
    try {
      realEngine.listModules();
      return realEngine;
    } catch (e) {
      if (want === 'real' || !(e instanceof NotImplementedError)) throw e;
      console.warn('Real engine not implemented yet; using the toy engine (set FCM_ENGINE=real to force).');
    }
  }
  return (await import('@fcm/engine/testing')).toyEngine;
}

async function main(): Promise<void> {
  installCrashGuards();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const retention = retentionFromEnv();
  const server = await startServer({
    engine: await selectEngine(),
    port,
    host,
    clientDist: process.env.FCM_CLIENT_DIST ?? fileURLToPath(new URL('../../client/dist/', import.meta.url)),
    persistence: persistenceFromEnv(),
    retentionMs: retention.roomMs,
    lobbyRetentionMs: retention.lobbyMs,
    limits: limitsFromEnv(),
    botRunner: 'worker',
    ...(Number(process.env.FCM_BOT_WORKERS) > 0 ? { botWorkers: Number(process.env.FCM_BOT_WORKERS) } : {}),
    ...botDelayFromEnv(),
  });
  console.log(`Food Chain Magnate server ${SERVER_VERSION} listening on ${host}:${server.port}`);
  for (const line of joinUrls(server.port, host)) console.log(line);
  installShutdown(server);
}

const isEntry = (): boolean => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (isEntry()) void main();
