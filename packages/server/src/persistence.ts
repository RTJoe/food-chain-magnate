/**
 * Room persistence (architecture §4.5): `<dataDir>/rooms/<id>.json` holding the room config,
 * seats (with hashed session tokens), status, seed and the action log. Writes are debounced per
 * room and atomic (tmp + rename). On boot the server indexes every file, restores games in
 * progress and loads the rest on demand. Files are deleted after a retention period of inactivity.
 * A game whose log no longer replays (engine rules change) is restored up to its last valid action;
 * the original file is first copied to `<id>.<timestamp>.bak` (see `backup`, architecture §4.5).
 * Env: `FCM_DATA_DIR` (default `./data`), `FCM_PERSIST=0` disables,
 * `FCM_ROOM_RETENTION_DAYS` (30), `FCM_LOBBY_RETENTION_DAYS` (2, rooms whose game never started).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Action, GameConfig } from '@fcm/engine';
import type { RoomConfig, RoomStatus, Seat } from '@fcm/protocol';

export const PERSIST_DEBOUNCE_MS = 250;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rooms (started or finished games) are deleted after this long without activity. */
export const ROOM_RETENTION_MS = 30 * DAY_MS;
/** Lobbies whose game never started are deleted sooner. */
export const LOBBY_RETENTION_MS = 2 * DAY_MS;
/** Room ids are 5-char codes; anything else never touches the filesystem. */
const SAFE_ID = /^[A-Za-z0-9]{1,16}$/;

export interface PersistedSeat extends Seat {
  /** SHA-256 of the seat holder's session token. */
  tokenHash: string | null;
}

export interface PersistedRoom {
  version: 1;
  /** `ENGINE_VERSION` that wrote the file (diagnostics; absent in older files). */
  engineVersion?: string;
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
  /** Write pending changes now: one room, or everything. */
  flush(id?: string): void;
  loadAll(): PersistedRoom[];
  /** Read one room (pending changes are flushed first). Null if missing or unreadable. */
  load(id: string): PersistedRoom | null;
  /** Delete a room's file and drop any pending write. */
  delete(id: string): void;
  /** Copy a room's file aside (kept, never loaded). Returns the backup path, or null. */
  backup(id: string): string | null;
}

export class NullPersistence implements Persistence {
  schedule(): void {}
  flush(): void {}
  loadAll(): PersistedRoom[] {
    return [];
  }
  load(): PersistedRoom | null {
    return null;
  }
  delete(): void {}
  backup(): string | null {
    return null;
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

  flush(id?: string): void {
    if (id !== undefined) return this.write(id);
    for (const key of [...this.pending.keys()]) this.write(key);
  }

  loadAll(): PersistedRoom[] {
    if (!existsSync(this.dir)) return [];
    const out: PersistedRoom[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const rec = this.read(f);
      if (rec) out.push(rec);
    }
    return out;
  }

  load(id: string): PersistedRoom | null {
    if (!SAFE_ID.test(id)) return null;
    this.write(id);
    const f = `${id}.json`;
    if (!existsSync(join(this.dir, f))) return null;
    const rec = this.read(f);
    return rec?.id === id ? rec : null;
  }

  delete(id: string): void {
    const p = this.pending.get(id);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(id);
    }
    if (!SAFE_ID.test(id)) return;
    rmSync(join(this.dir, `${id}.json`), { force: true });
  }

  backup(id: string): string | null {
    if (!SAFE_ID.test(id)) return null;
    const file = join(this.dir, `${id}.json`);
    if (!existsSync(file)) return null;
    const dest = join(this.dir, `${id}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
    try {
      copyFileSync(file, dest);
      return dest;
    } catch (e) {
      this.log(`persistence: could not back up room ${id}: ${(e as Error).message}`);
      return null;
    }
  }

  private read(f: string): PersistedRoom | null {
    try {
      const rec = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as PersistedRoom;
      if (rec.version === 1 && typeof rec.id === 'string') return rec;
    } catch (e) {
      this.log(`persistence: skipping ${f}: ${(e as Error).message}`);
    }
    return null;
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

export interface Retention {
  /** Started or finished games. */
  roomMs: number;
  /** Lobbies whose game never started. */
  lobbyMs: number;
}

export function retentionFromEnv(env: NodeJS.ProcessEnv = process.env): Retention {
  const days = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n * DAY_MS : fallback;
  };
  return { roomMs: days(env.FCM_ROOM_RETENTION_DAYS, ROOM_RETENTION_MS), lobbyMs: days(env.FCM_LOBBY_RETENTION_DAYS, LOBBY_RETENTION_MS) };
}

export function persistenceFromEnv(env: NodeJS.ProcessEnv = process.env): Persistence {
  if (env.FCM_PERSIST === '0') return new NullPersistence();
  return new FilePersistence(env.FCM_DATA_DIR ?? join(process.cwd(), 'data'));
}
