/**
 * @fcm/server CLI entry: serves packages/client/dist over HTTP and accepts WebSocket upgrades on
 * /ws (architecture §4). Env: PORT (3000), HOST (0.0.0.0), FCM_DATA_DIR (./data),
 * FCM_PERSIST=0, FCM_CLIENT_DIST, FCM_ENGINE=real|toy (default: real, falling back to the toy
 * engine while the real one is not implemented).
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { engine as realEngine, NotImplementedError, type EngineApi } from '@fcm/engine';
import { joinUrls } from './lanAddress.js';
import { persistenceFromEnv } from './persistence.js';
import { startServer } from './server.js';
import { SERVER_VERSION } from './ws.js';

export { startServer, type RunningServer, type ServerOptions } from './server.js';
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
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = await startServer({
    engine: await selectEngine(),
    port,
    host,
    clientDist: process.env.FCM_CLIENT_DIST ?? fileURLToPath(new URL('../../client/dist/', import.meta.url)),
    persistence: persistenceFromEnv(),
  });
  console.log(`Food Chain Magnate server ${SERVER_VERSION} listening on ${host}:${server.port}`);
  for (const line of joinUrls(server.port, host)) console.log(line);

  const shutdown = () => {
    void server.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
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
