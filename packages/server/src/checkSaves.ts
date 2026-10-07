/**
 * Pre-deploy check (architecture §4.5): replay every saved room in `<dataDir>/rooms` with the bundled
 * engine and list the games whose log no longer replays. Those would be rolled back to their last
 * valid action on the next boot. Exit code 1 if any would be.
 *
 *   docker compose build && docker compose run --rm --no-deps fcm node packages/server/dist/checkSaves.js
 *
 * Env: FCM_DATA_DIR (default ./data).
 */
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { engine as realEngine, type EngineApi } from '@fcm/engine';
import { GameSession, type ReplayFailure } from '@fcm/session';
import { FilePersistence } from './persistence.js';

export interface SaveCheck {
  id: string;
  status: string;
  actions: number;
  engineVersion: string | null;
  /** Null when the whole log replays. */
  failure: ReplayFailure | null;
  /** The game could not be rebuilt at all (bad config). */
  error?: string;
}

export function checkSaves(engine: EngineApi, dataDir: string, log: (m: string) => void = () => {}): SaveCheck[] {
  const out: SaveCheck[] = [];
  for (const rec of new FilePersistence(dataDir, 0, log).loadAll()) {
    const base = { id: rec.id, status: rec.status, actions: rec.actions.length, engineVersion: rec.engineVersion ?? null };
    if (!rec.gameConfig || rec.seed === null) {
      out.push({ ...base, failure: null });
      continue;
    }
    try {
      const game = new GameSession({ engine, config: rec.gameConfig, seed: rec.seed, actions: rec.actions, onReplayFailure: 'truncate' });
      out.push({ ...base, failure: game.replayFailure });
    } catch (e) {
      out.push({ ...base, failure: null, error: (e as Error).message });
    }
  }
  return out;
}

function main(): void {
  const dataDir = process.env.FCM_DATA_DIR ?? join(process.cwd(), 'data');
  const results = checkSaves(realEngine, dataDir, console.warn);
  const bad = results.filter((r) => r.failure || r.error);
  for (const r of bad) {
    const why = r.error ? `cannot rebuild: ${r.error}` : `would roll back to ${r.failure?.index}/${r.failure?.total}: ${r.failure?.message}`;
    console.log(`FAIL ${r.id} (${r.status}, saved by engine ${r.engineVersion ?? 'unknown'}): ${why}`);
  }
  console.log(`${results.length} save(s) checked in ${dataDir}; ${bad.length} would not restore in full.`);
  process.exitCode = bad.length ? 1 : 0;
}

const isEntry = (): boolean => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1] as string) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (isEntry()) main();
