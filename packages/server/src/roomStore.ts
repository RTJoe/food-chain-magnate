/** In-memory rooms (architecture §4.2): unique 5-char codes, activity tracking, idle GC. */
import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, type RoomConfig } from '@fcm/protocol';
import { Room, type GameSession } from '@fcm/session';

export const ROOM_CODE_LENGTH = 5;
/** Idle rooms are dropped from memory after 6 h; their file is kept and loaded again on demand. */
export const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000;

export interface RoomEntry {
  room: Room;
  game: GameSession | null;
  /** Last activity seen by this process (memory GC). */
  lastActivity: number;
  /** Last real room activity (persisted as `updatedAt`; drives file retention). */
  updatedAt: number;
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  create(hostClientId: string, config?: Partial<RoomConfig>): RoomEntry {
    let id = generateRoomCode();
    while (this.rooms.has(id)) id = generateRoomCode();
    return this.add(new Room({ id, hostClientId, config, now: this.now }), null);
  }

  add(room: Room, game: GameSession | null, updatedAt = this.now()): RoomEntry {
    const entry: RoomEntry = { room, game, lastActivity: this.now(), updatedAt };
    this.rooms.set(room.id, entry);
    return entry;
  }

  get(id: string): RoomEntry | undefined {
    return this.rooms.get(id);
  }

  touch(entry: RoomEntry): void {
    entry.lastActivity = entry.updatedAt = this.now();
  }

  remove(id: string): boolean {
    return this.rooms.delete(id);
  }

  all(): IterableIterator<RoomEntry> {
    return this.rooms.values();
  }

  get size(): number {
    return this.rooms.size;
  }

  /**
   * Unload rooms with nobody connected and no activity for `ttlMs`. `beforeRemove` runs first
   * (the hub flushes the room to disk there). Returns removed ids.
   */
  gc(ttlMs = ROOM_IDLE_TTL_MS, beforeRemove: (e: RoomEntry) => void = () => {}): string[] {
    const removed: string[] = [];
    for (const [id, e] of this.rooms) {
      if (e.room.connectedCount() === 0 && this.now() - e.lastActivity > ttlMs) {
        beforeRemove(e);
        this.rooms.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}
