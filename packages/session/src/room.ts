/**
 * Room lobby state (architecture §4.2): members, seats, ready flags, host, config, start.
 * Transport-agnostic: the server maps sockets to `clientId`s and calls these methods.
 */
import { clone, type ChainId, type GameConfig, type PlayerId, type PlayerSeatConfig } from '@fcm/engine';
import { RoomConfig, type BotLevel, type ErrorCode, type RoomInfo, type RoomStatus, type Seat } from '@fcm/protocol';

export type Result = { ok: true } | Failure;
export type ValueResult<T> = { ok: true; value: T } | Failure;
export interface Failure {
  ok: false;
  code: ErrorCode;
  message: string;
}

const fail = (code: ErrorCode, message: string): Failure => ({ ok: false, code, message });
const OK = { ok: true } as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
/** Host passes on after this long disconnected (architecture §4.2). */
export const HOST_TRANSFER_MS = 60_000;

/** Keep in sync with packages/client/src/theme.ts PLAYER_COLORS. */
export const SEAT_COLORS = ['#a6449c', '#f8e03c', '#e4845a', '#6c9fe0', '#c8d79c', '#9cd9cf'] as const;
export const SEAT_CHAINS: readonly ChainId[] = [
  'fried_geese_donkey',
  'golden_duck_diner',
  'santa_maria_pizza',
  'xango_blues_bar',
  'gluttony_inc',
  'siap_faji',
];

export const DEFAULT_ROOM_CONFIG: RoomConfig = { seatCount: 4, modules: [], options: {}, intro: false, introMilestones: false };

export interface Member {
  clientId: string;
  name: string;
  connected: boolean;
  /** When the member last disconnected (for host transfer). */
  disconnectedAt: number | null;
  /** Joined with `spectate: true`: may not take a seat. */
  spectate: boolean;
}

export interface RoomOptions {
  id: string;
  hostClientId: string;
  config?: Partial<RoomConfig>;
  createdAt?: number;
  now?: () => number;
}

/** Serializable room state (persistence). */
export interface RoomSnapshot {
  id: string;
  createdAt: number;
  status: RoomStatus;
  hostClientId: string;
  config: RoomConfig;
  seats: Seat[];
}

const playerIdFor = (index: number): PlayerId => `p${index + 1}`;

/** Names for bot seats (the first one not already used in the room). */
export const BOT_NAMES = ['Robo Ada', 'Robo Alan', 'Robo Grace', 'Robo Kit', 'Robo Max', 'Robo Zoe'] as const;

function makeSeat(index: number): Seat {
  return { index, playerId: playerIdFor(index), clientId: null, name: null, color: SEAT_COLORS[index] ?? '#888888', ready: false, connected: false, bot: null };
}

/** A seat that takes part in the game: a member or a bot. */
export const isOccupied = (s: Seat): boolean => s.clientId !== null || s.bot !== null;

export class Room {
  readonly id: string;
  readonly createdAt: number;
  status: RoomStatus = 'lobby';
  hostClientId: string;
  config: RoomConfig;
  seats: Seat[];
  readonly members = new Map<string, Member>();
  private readonly now: () => number;

  constructor(opts: RoomOptions) {
    this.now = opts.now ?? Date.now;
    this.id = opts.id;
    this.createdAt = opts.createdAt ?? this.now();
    this.hostClientId = opts.hostClientId;
    const parsed = RoomConfig.safeParse({ ...DEFAULT_ROOM_CONFIG, ...opts.config });
    this.config = parsed.success ? parsed.data : { ...DEFAULT_ROOM_CONFIG };
    this.seats = Array.from({ length: this.config.seatCount }, (_, i) => makeSeat(i));
  }

  /** Rebuild from persistence. Seat holders become disconnected members. */
  static restore(snap: RoomSnapshot, now: () => number = Date.now): Room {
    const room = new Room({ id: snap.id, hostClientId: snap.hostClientId, config: snap.config, createdAt: snap.createdAt, now });
    room.status = snap.status;
    room.seats = snap.seats.map((s) => ({ ...s, bot: s.bot ?? null, connected: Boolean(s.bot) }));
    const t = now();
    for (const s of room.seats) {
      if (s.clientId) room.members.set(s.clientId, { clientId: s.clientId, name: s.name ?? 'Player', connected: false, disconnectedAt: t, spectate: false });
    }
    if (!room.members.has(room.hostClientId)) {
      const first = room.seats.find((s) => s.clientId);
      if (first?.clientId) room.hostClientId = first.clientId;
    }
    return room;
  }

  snapshot(): RoomSnapshot {
    return { id: this.id, createdAt: this.createdAt, status: this.status, hostClientId: this.hostClientId, config: clone(this.config), seats: this.seats.map((s) => ({ ...s })) };
  }

  info(): RoomInfo {
    const seatedIds = new Set(this.seats.map((s) => s.clientId).filter(Boolean));
    return {
      id: this.id,
      status: this.status,
      hostClientId: this.hostClientId,
      config: clone(this.config),
      seats: this.seats.map((s) => ({ ...s, connected: s.bot ? true : s.clientId ? (this.members.get(s.clientId)?.connected ?? false) : false })),
      spectators: [...this.members.values()]
        .filter((m) => !seatedIds.has(m.clientId))
        .map((m) => ({ clientId: m.clientId, name: m.name, connected: m.connected })),
      createdAt: this.createdAt,
    };
  }

  // --- membership -----------------------------------------------------------

  isHost(clientId: string): boolean {
    return this.hostClientId === clientId;
  }

  seatOf(clientId: string): Seat | undefined {
    return this.seats.find((s) => s.clientId === clientId);
  }

  /** Engine viewer for a member: their player id if seated, else spectator. */
  viewerOf(clientId: string): PlayerId | 'spectator' {
    if (this.status === 'lobby') return 'spectator';
    return this.seatOf(clientId)?.playerId ?? 'spectator';
  }

  /** Connected members with their engine viewer, for per-viewer fan-out. */
  audience(): { clientId: string; viewer: PlayerId | 'spectator' }[] {
    return [...this.members.values()].filter((m) => m.connected).map((m) => ({ clientId: m.clientId, viewer: this.viewerOf(m.clientId) }));
  }

  connectedCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.connected) n++;
    return n;
  }

  /** Join (or re-join) as a member. A member who still holds a seat is re-attached to it. */
  join(clientId: string, name: string, spectate = false): Result {
    const existing = this.members.get(clientId);
    const m: Member = existing ?? { clientId, name, connected: true, disconnectedAt: null, spectate };
    m.name = name;
    m.connected = true;
    m.disconnectedAt = null;
    m.spectate = spectate && !this.seatOf(clientId);
    this.members.set(clientId, m);
    const seat = this.seatOf(clientId);
    if (seat && this.status === 'lobby') seat.name = name;
    if (!this.members.has(this.hostClientId)) this.hostClientId = clientId;
    return OK;
  }

  /** Leave the room. In the lobby the seat is freed; while playing it stays reserved. */
  leave(clientId: string): Result {
    if (!this.members.has(clientId)) return fail('NOT_IN_ROOM', 'Not in this room');
    this.members.delete(clientId);
    const seat = this.seatOf(clientId);
    if (seat && this.status === 'lobby') this.clearSeat(seat);
    if (this.isHost(clientId)) this.transferHost();
    return OK;
  }

  setConnected(clientId: string, connected: boolean): void {
    const m = this.members.get(clientId);
    if (!m) return;
    m.connected = connected;
    m.disconnectedAt = connected ? null : this.now();
  }

  /** Host transfer after `HOST_TRANSFER_MS` disconnected. Returns true if the host changed. */
  tick(): boolean {
    const host = this.members.get(this.hostClientId);
    if (host?.connected) return false;
    if (host && host.disconnectedAt !== null && this.now() - host.disconnectedAt < HOST_TRANSFER_MS) return false;
    return this.transferHost();
  }

  /** Pass host to a connected member, seated players first. Returns true if it changed. */
  private transferHost(): boolean {
    const candidates = [...this.members.values()].filter((m) => m.connected && m.clientId !== this.hostClientId);
    const next = candidates.find((m) => this.seatOf(m.clientId)) ?? candidates[0];
    if (!next) return false;
    this.hostClientId = next.clientId;
    return true;
  }

  // --- seats ------------------------------------------------------------------

  sit(clientId: string, index: number): Result {
    const m = this.members.get(clientId);
    if (!m) return fail('NOT_IN_ROOM', 'Not in this room');
    if (m.spectate) return fail('SEAT_TAKEN', 'Spectators cannot sit; re-join as a player');
    const seat = this.seats[index];
    if (!seat) return fail('BAD_MESSAGE', `No seat ${index}`);
    if (seat.clientId === clientId) return OK;
    if (seat.clientId !== null || seat.bot) return fail('SEAT_TAKEN', seat.bot ? 'A bot plays this seat' : 'Seat is taken');
    if (this.status === 'playing') {
      // Takeover of a vacated (kicked) seat. The seat keeps its in-game name.
      if (this.seatOf(clientId)) return fail('SEAT_TAKEN', 'Already seated');
      seat.clientId = clientId;
      return OK;
    }
    if (this.status !== 'lobby') return fail('CANNOT_START', 'The game is over');
    const current = this.seatOf(clientId);
    if (current) this.clearSeat(current);
    seat.clientId = clientId;
    seat.name = m.name;
    seat.ready = false;
    return OK;
  }

  stand(clientId: string): Result {
    if (this.status !== 'lobby') return fail('CANNOT_START', 'Seats are locked once the game starts');
    const seat = this.seatOf(clientId);
    if (!seat) return fail('NOT_SEATED', 'Not seated');
    this.clearSeat(seat);
    return OK;
  }

  setReady(clientId: string, ready: boolean): Result {
    if (this.status !== 'lobby') return fail('CANNOT_START', 'The game has started');
    const seat = this.seatOf(clientId);
    if (!seat) return fail('NOT_SEATED', 'Not seated');
    seat.ready = ready;
    return OK;
  }

  /** Host only, lobby only. Merges `patch` into the config; resets ready flags. */
  patchConfig(clientId: string, patch: Partial<RoomConfig>): Result {
    if (!this.isHost(clientId)) return fail('NOT_HOST', 'Only the host can change settings');
    if (this.status !== 'lobby') return fail('CANNOT_START', 'The game has started');
    const parsed = RoomConfig.safeParse({ ...this.config, ...patch });
    if (!parsed.success) return fail('BAD_MESSAGE', 'Invalid room config');
    const next = parsed.data;
    if (next.seatCount < this.seats.length) {
      for (const s of this.seats.slice(next.seatCount)) this.clearSeat(s);
      this.seats = this.seats.slice(0, next.seatCount);
    } else {
      for (let i = this.seats.length; i < next.seatCount; i++) this.seats.push(makeSeat(i));
    }
    this.config = next;
    // Humans confirm the new settings; bots are always ready.
    for (const s of this.seats) s.ready = s.bot !== null;
    return OK;
  }

  /**
   * Give a seat of a game in progress to `clientId`, a member who holds no seat. The previous
   * holder stops being a member (and host). The server uses this to recover seats whose holder
   * can never reconnect (their session is lost).
   */
  reassign(index: number, clientId: string): Result {
    if (this.status !== 'playing') return fail('CANNOT_START', 'Only seats of a game in progress can be reassigned');
    const seat = this.seats[index];
    if (!seat) return fail('BAD_MESSAGE', `No seat ${index}`);
    if (seat.bot) return fail('SEAT_TAKEN', 'A bot plays this seat');
    const m = this.members.get(clientId);
    if (!m) return fail('NOT_IN_ROOM', 'Not in this room');
    if (seat.clientId === clientId) return OK;
    if (this.seatOf(clientId)) return fail('SEAT_TAKEN', 'Already seated');
    const prev = seat.clientId;
    if (prev) this.members.delete(prev);
    seat.clientId = clientId;
    m.spectate = false;
    if (prev && this.hostClientId === prev) this.hostClientId = clientId;
    return OK;
  }

  /** Host only: frees a seat so another device can take it over. */
  kick(clientId: string, index: number): Result {
    if (!this.isHost(clientId)) return fail('NOT_HOST', 'Only the host can kick');
    const seat = this.seats[index];
    if (!seat) return fail('BAD_MESSAGE', `No seat ${index}`);
    if (seat.bot) return this.status === 'lobby' ? this.removeBot(clientId, index) : fail('CANNOT_START', 'Bots keep their seat during a game');
    if (seat.clientId === null) return OK;
    if (this.status === 'lobby') this.clearSeat(seat);
    else {
      seat.clientId = null;
      seat.ready = false;
    }
    return OK;
  }

  /** Why the game cannot start, or null. */
  startProblem(clientId: string): Failure | null {
    if (!this.isHost(clientId)) return fail('NOT_HOST', 'Only the host can start');
    if (this.status !== 'lobby') return fail('CANNOT_START', 'Already started');
    const seated = this.seats.filter(isOccupied);
    if (seated.length < MIN_PLAYERS || seated.length > MAX_PLAYERS) return fail('CANNOT_START', `Need ${MIN_PLAYERS}–${MAX_PLAYERS} seated players`);
    if (seated.some((s) => !s.ready)) return fail('CANNOT_START', 'Not everyone is ready');
    return null;
  }

  /**
   * Validate, compact the seated players into seats p1..pN, build the engine config and call
   * `create` with it. Room state is committed only if `create` succeeds.
   */
  start<T>(clientId: string, create: (config: GameConfig) => T): ValueResult<T> {
    const problem = this.startProblem(clientId);
    if (problem) return problem;
    const seats = this.seats
      .filter(isOccupied)
      .map((s, i) => ({ ...s, index: i, playerId: playerIdFor(i), color: SEAT_COLORS[i] ?? s.color, ready: true }));
    const players: PlayerSeatConfig[] = seats.map((s, i) => ({ id: s.playerId, name: s.name ?? `Player ${i + 1}`, chain: SEAT_CHAINS[i] as ChainId, color: s.color }));
    const config: GameConfig = {
      players,
      modules: [...this.config.modules],
      options: clone(this.config.options),
      intro: this.config.intro,
      introMilestones: this.config.introMilestones,
      map: { kind: 'random' },
    };
    let value: T;
    try {
      value = create(config);
    } catch (e) {
      return fail('CANNOT_START', `Engine could not create the game: ${(e as Error).message}`);
    }
    this.seats = seats;
    this.config = { ...this.config, seatCount: seats.length };
    this.status = 'playing';
    return { ok: true, value };
  }

  finish(): void {
    this.status = 'finished';
  }

  // --- bots -------------------------------------------------------------------

  /** Host only, lobby only: a bot of `level` takes an empty seat (or a bot seat changes level). */
  addBot(clientId: string, index: number, level: BotLevel): Result {
    if (!this.isHost(clientId)) return fail('NOT_HOST', 'Only the host can add bots');
    if (this.status !== 'lobby') return fail('CANNOT_START', 'Bots can only be added in the lobby');
    const seat = this.seats[index];
    if (!seat) return fail('BAD_MESSAGE', `No seat ${index}`);
    if (seat.clientId !== null) return fail('SEAT_TAKEN', 'Seat is taken');
    if (!seat.bot) {
      const used = new Set(this.seats.map((s) => s.name));
      seat.name = BOT_NAMES.find((n) => !used.has(n)) ?? `Robo ${index + 1}`;
    }
    seat.bot = level;
    seat.ready = true;
    return OK;
  }

  /** Host only, lobby only: empty a bot seat. */
  removeBot(clientId: string, index: number): Result {
    if (!this.isHost(clientId)) return fail('NOT_HOST', 'Only the host can remove bots');
    if (this.status !== 'lobby') return fail('CANNOT_START', 'Bots keep their seat during a game');
    const seat = this.seats[index];
    if (!seat) return fail('BAD_MESSAGE', `No seat ${index}`);
    if (!seat.bot) return fail('BAD_MESSAGE', 'No bot on that seat');
    this.clearSeat(seat);
    return OK;
  }

  /** Bot seats by engine player id (meaningful once the game has started). */
  bots(): Record<PlayerId, BotLevel> {
    const out: Record<PlayerId, BotLevel> = {};
    for (const s of this.seats) if (s.bot) out[s.playerId] = s.bot;
    return out;
  }

  private clearSeat(seat: Seat): void {
    seat.clientId = null;
    seat.name = null;
    seat.ready = false;
    seat.bot = null;
  }
}
