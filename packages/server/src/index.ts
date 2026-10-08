/**
 * @fcm/server CLI entry: serves packages/client/dist over HTTP and accepts WebSocket upgrades on
 * /ws (architecture §4). Env: PORT (3000), HOST (0.0.0.0), FCM_DATA_DIR (./data),
 * FCM_PERSIST=0, FCM_ROOM_RETENTION_DAYS (30), FCM_LOBBY_RETENTION_DAYS (2), FCM_CLIENT_DIST,
 * FCM_BOT_DELAY_MS ("400-900" or a single number), FCM_BOT_WORKERS (bot worker threads; default
 * half the cores, 1–4), FCM_ALLOWED_ORIGINS ("self" or a comma list; unset = any), FCM_BUILD_ID
 * (git SHA, set by the Docker build), FCM_PUBLIC_URL (printed in the startup banner), and the
 * abuse limits in limits.ts (FCM_MSG_RATE, FCM_MAX_ROOMS, ...; README "Configuration").
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { engine } from '@fcm/engine';
import { joinUrls } from './lanAddress.js';
import { FilePersistence, persistenceFromEnv, retentionFromEnv } from './persistence.js';
import { botDelayFromEnv } from './botRunner.js';
import { limitsFromEnv } from './limits.js';
import { allowedOriginsFromEnv, installCrashGuards, installShutdown, startServer } from './server.js';
import { SERVER_VERSION } from './ws.js';

export { installCrashGuards, installShutdown, startServer, type RunningServer, type ServerOptions } from './server.js';
export { SERVER_VERSION } from './ws.js';

async function main(): Promise<void> {
  installCrashGuards();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const buildId = process.env.FCM_BUILD_ID?.trim() || undefined;
  const retention = retentionFromEnv();
  const persistence = persistenceFromEnv();
  if (persistence instanceof FilePersistence) {
    // Fail loudly: a data dir the server cannot write would otherwise lose every game silently.
    try {
      persistence.assertWritable();
    } catch (e) {
      console.error(`FATAL: cannot write ${persistence.dir}: ${(e as Error).message}. Fix the volume ownership (README "Self-hosting with Docker") or set FCM_PERSIST=0.`);
      process.exit(1);
    }
  }
  const server = await startServer({
    engine,
    port,
    host,
    clientDist: process.env.FCM_CLIENT_DIST ?? fileURLToPath(new URL('../../client/dist/', import.meta.url)),
    persistence,
    retentionMs: retention.roomMs,
    lobbyRetentionMs: retention.lobbyMs,
    limits: limitsFromEnv(),
    botRunner: 'worker',
    ...(Number(process.env.FCM_BOT_WORKERS) > 0 ? { botWorkers: Number(process.env.FCM_BOT_WORKERS) } : {}),
    ...botDelayFromEnv(),
    allowedOrigins: allowedOriginsFromEnv(),
    ...(buildId ? { buildId } : {}),
  });
  console.log(`Food Chain Magnate server ${SERVER_VERSION}${buildId ? ` (build ${buildId})` : ''} listening on ${host}:${server.port}`);
  const publicUrl = process.env.FCM_PUBLIC_URL?.trim();
  if (publicUrl) console.log(`  public:  ${publicUrl}`);
  else for (const line of joinUrls(server.port, host)) console.log(line);
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
