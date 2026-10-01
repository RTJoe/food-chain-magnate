/**
 * Room persistence (architecture §4.5): `<dataDir>/rooms/<id>.json` holding the room config,
 * seats (with hashed session tokens), status, seed and the action log. Writes are debounced per
 * room and atomic (tmp + rename). On boot the server replays every file.
 * Env: `FCM_DATA_DIR` (default `./data`), `FCM_PERSIST=0` disables.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Action, GameConfig } from '@fcm/engine';
import type { RoomConfig, RoomStatus, Seat } from '@fcm/protocol';

export const PERSIST_DEBOUNCE_MS = 250;

export interface PersistedSeat extends Seat {
  /** SHA-256 of the seat holder's session token. */
  tokenHash: string | null;
}

export interface PersistedRoom {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  hostClientId: string;
  config: RoomConfig;
  status: RoomStatus;
  seats: PersistedSeat[];
  /** Null until the game starts. */
  seed: number | null;
  gameConfig: GameConfig | null;
  actions: Action[];
}

export interface Persistence {
  /** Schedule a debounced write; `build` is called when the write happens. */
  schedule(id: string, build: () => PersistedRoom): void;
  /** Write everything pending now. */
  flush(): void;
  loadAll(): PersistedRoom[];
}

export class NullPersistence implements Persistence {
  schedule(): void {}
  flush(): void {}
  loadAll(): PersistedRoom[] {
    return [];
  }
}

export class FilePersistence implements Persistence {
  readonly dir: string;
  private readonly pending = new Map<string, { timer: ReturnType<typeof setTimeout>; build: () => PersistedRoom }>();

  constructor(
    dataDir: string,
    private readonly debounceMs = PERSIST_DEBOUNCE_MS,
    private readonly log: (msg: string) => void = console.warn,
  ) {
    this.dir = join(resolve(dataDir), 'rooms');
  }

  schedule(id: string, build: () => PersistedRoom): void {
    const prev = this.pending.get(id);
    if (prev) {
      prev.build = build;
      return;
    }
    const timer = setTimeout(() => this.write(id), this.debounceMs);
    timer.unref?.();
    this.pending.set(id, { timer, build });
  }

  flush(): void {
    for (const id of [...this.pending.keys()]) this.write(id);
  }

  loadAll(): PersistedRoom[] {
    if (!existsSync(this.dir)) return [];
    const out: PersistedRoom[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as PersistedRoom;
        if (rec.version === 1 && typeof rec.id === 'string') out.push(rec);
      } catch (e) {
        this.log(`persistence: skipping ${f}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  private write(id: string): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = join(this.dir, `${id}.json`);
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(p.build()));
      renameSync(tmp, file);
    } catch (e) {
      this.log(`persistence: failed to write room ${id}: ${(e as Error).message}`);
      rmSync(join(this.dir, `${id}.json.tmp`), { force: true });
    }
  }
}

export function persistenceFromEnv(env: NodeJS.ProcessEnv = process.env): Persistence {
  if (env.FCM_PERSIST === '0') return new NullPersistence();
  return new FilePersistence(env.FCM_DATA_DIR ?? join(process.cwd(), 'data'));
}
