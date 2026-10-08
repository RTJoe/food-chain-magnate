/**
 * WebSocket hub: maps sockets to sessions, routes client messages to rooms and game sessions,
 * fans out per-viewer messages, persists room changes, and runs heartbeat / host-transfer / GC.
 * Protocol reference: docs/protocol.md.
 */
import { randomBytes } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import { ENGINE_VERSION, type EngineApi } from '@fcm/engine';
import { PROTOCOL_VERSION, parseClientMessage, type ClientMessage, type ClientMessageOf, type ErrorCode, type RoomStatus, type ServerMessage } from '@fcm/protocol';
import { BotDriver, GameSession, inlineBotRunner, isOccupied, Room, type BotDelay, type BotRunner, type Outbound } from '@fcm/session';
import { DEFAULT_LIMITS, TokenBucket, type Limits } from './limits.js';
import { LOBBY_RETENTION_MS, ROOM_RETENTION_MS, type Persistence, type PersistedRoom } from './persistence.js';
import { ROOM_IDLE_TTL_MS, type RoomEntry, type RoomStore } from './roomStore.js';
import type { ClientSession, SessionRegistry } from './sessions.js';

export const SERVER_VERSION = '0.1.0';

/** Chat flood control: at most this many messages per window. */
const CHAT_BURST = 8;
const CHAT_WINDOW_MS = 5_000;
/** How often the retention sweep runs (from `tick`). */
const RETENTION_SWEEP_MS = 60 * 60 * 1000;
/** When the session cap is reached, roomless sessions unseen this long are dropped first. */
const SESSION_PRESSURE_TTL_MS = 10 * 60 * 1000;
/** Messages dropped in a row by the rate limit before the socket is closed. */
const MAX_STRIKES = 100;

/** What the hub knows about every room file, loaded or not. */
interface RoomIndexEntry {
  updatedAt: number;
  status: RoomStatus;
  /** Seat holders and the hash of their session token (null if it was lost). */
  seats: { clientId: string; tokenHash: string | null }[];
}

interface Conn {
  ws: WebSocket;
  clientId: string | null;
  alive: boolean;
  chat: number[];
  /** All client messages. */
  msgs: TokenBucket;
  /** New sessions and new rooms. */
  creates: TokenBucket;
  resyncs: TokenBucket;
  /** `room.join` with an unknown code (enumeration guard). */
  joinMisses: TokenBucket;
  /** Messages dropped in a row by `msgs`. */
  strikes: number;
}

export interface HubOptions {
  engine: EngineApi;
  store: RoomStore;
  sessions: SessionRegistry;
  persistence: Persistence;
  now?: () => number;
  log?: (msg: string) => void;
  /** Game seed source (default: crypto random uint32). */
  seed?: () => number;
  idleTtlMs?: number;
  /** Delete room files after this long without activity (default 30 days). */
  retentionMs?: number;
  /** Same, for lobbies whose game never started (default 2 days). */
  lobbyRetentionMs?: number;
  /** Where bot moves are computed (server: a worker-thread pool; default: inline). */
  botRunner?: BotRunner;
  /** Delay before a bot moves (default 400–900 ms; 0 in tests). */
  botDelay?: BotDelay;
  /** Abuse limits (default `DEFAULT_LIMITS`). */
  limits?: Partial<Limits>;
  /** Build id (git SHA): appended to `serverVersion` in welcome and saved in room records. */
  buildId?: string;
}

export class Hub {
  readonly engine: EngineApi;
  readonly store: RoomStore;
  readonly sessions: SessionRegistry;
  private readonly persistence: Persistence;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private readonly seed: () => number;
  private readonly idleTtlMs: number;
  private readonly retentionMs: number;
  private readonly lobbyRetentionMs: number;
  private readonly botRunner: BotRunner;
  private readonly botDelay: BotDelay | undefined;
  readonly limits: Limits;
  /** `SERVER_VERSION`, plus `+<build id>` when known. */
  readonly serverVersion: string;
  private readonly buildId: string | undefined;
  private readonly conns = new Set<Conn>();
  private readonly byClient = new Map<string, Conn>();
  /** Every persisted room (in memory or only on disk), by id. */
  private readonly index = new Map<string, RoomIndexEntry>();
  private lastSweep: number;

  constructor(opts: HubOptions) {
    this.engine = opts.engine;
    this.store = opts.store;
    this.sessions = opts.sessions;
    this.persistence = opts.persistence;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(m));
    this.seed = opts.seed ?? (() => randomBytes(4).readUInt32LE(0));
    this.idleTtlMs = opts.idleTtlMs ?? ROOM_IDLE_TTL_MS;
    this.retentionMs = opts.retentionMs ?? ROOM_RETENTION_MS;
    this.lobbyRetentionMs = opts.lobbyRetentionMs ?? LOBBY_RETENTION_MS;
    this.botRunner = opts.botRunner ?? inlineBotRunner;
    this.botDelay = opts.botDelay;
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this.buildId = opts.buildId;
    this.serverVersion = opts.buildId ? `${SERVER_VERSION}+${opts.buildId}` : SERVER_VERSION;
    this.lastSweep = this.now();
  }

  // --- sockets ----------------------------------------------------------------

  attach(ws: WebSocket): void {
    const L = this.limits;
    const conn: Conn = {
      ws,
      clientId: null,
      alive: true,
      chat: [],
      msgs: new TokenBucket(L.msgBurst, L.msgRate / 1000, this.now),
      creates: new TokenBucket(L.createBurst, 1 / L.createRefillMs, this.now),
      resyncs: new TokenBucket(L.resyncBurst, 1 / L.resyncRefillMs, this.now),
      joinMisses: new TokenBucket(L.joinMissBurst, 1 / L.joinMissRefillMs, this.now),
      strikes: 0,
    };
    this.conns.add(conn);
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: RawData) => {
      conn.alive = true;
      if (!conn.msgs.take()) return this.guard('rate limit', () => this.overLimit(conn));
      conn.strikes = 0;
      const msg = parseClientMessage(String(data));
      if (!msg) return this.sendTo(conn, { t: 'error', code: 'BAD_MESSAGE', message: 'Invalid message' });
      try {
        this.handle(conn, msg);
      } catch (e) {
        this.log(`hub: error handling ${msg.t}: ${(e as Error).stack ?? e}`);
        // An action gets a rejection carrying its id, so the client stops waiting for it.
        if (msg.t === 'game.action') this.sendTo(conn, { t: 'game.rejected', id: msg.id, code: 'INTERNAL', message: 'Internal server error' });
        else this.sendTo(conn, { t: 'error', code: 'INTERNAL', message: 'Internal server error', ref: msg.t });
      }
    });
    // Socket and timer callbacks must never throw: nothing above them would catch it.
    ws.on('close', () => this.guard('close', () => this.detach(conn)));
    ws.on('error', () => this.guard('socket error', () => ws.terminate()));
  }

  /** Run `fn`, logging instead of throwing (event and timer callbacks). */
  guard(what: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.log(`hub: error in ${what}: ${(e as Error).stack ?? e}`);
    }
  }

  /** A message over the rate limit: dropped. The first in a run gets RATE_LIMITED; a long run closes the socket. */
  private overLimit(conn: Conn): void {
    conn.strikes++;
    if (conn.strikes === 1) this.sendTo(conn, { t: 'error', code: 'RATE_LIMITED', message: 'Too many messages; slow down' });
    if (conn.strikes >= MAX_STRIKES) {
      this.log('hub: closing a socket that ignores the rate limit');
      conn.ws.close(1008, 'rate limit');
    }
  }

  /** Heartbeat sweep: terminate sockets that missed the previous ping, ping the rest. */
  heartbeat(): void {
    for (const c of this.conns) {
      if (!c.alive) {
        this.guard('heartbeat', () => {
          c.ws.terminate();
          this.detach(c);
        });
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        /* closed */
      }
    }
  }

  /**
   * Periodic housekeeping: host transfer, unloading idle rooms from memory (after writing them to
   * disk; they load again on demand), session GC and the hourly file-retention sweep.
   */
  tick(): void {
    for (const e of this.store.all()) this.guard(`tick ${e.room.id}`, () => e.room.tick() && this.roomChanged(e));
    const unloaded = this.store.gc(this.idleTtlMs, (e) =>
      this.guard(`unload ${e.room.id}`, () => {
        this.persist(e);
        this.persistence.flush(e.room.id);
      }),
    );
    for (const id of unloaded) this.log(`hub: room ${id} idle, unloaded (kept on disk)`);
    // Seat holders keep their session as long as the room file exists, so their token still works.
    this.gcSessions(this.idleTtlMs);
    if (this.now() - this.lastSweep >= RETENTION_SWEEP_MS) this.sweepRetention();
  }

  /** Drop roomless sessions unseen for `ttlMs`. Seat holders keep theirs while the room file exists. */
  private gcSessions(ttlMs: number): number {
    const seated = new Set<string>();
    for (const r of this.index.values()) for (const s of r.seats) seated.add(s.clientId);
    for (const e of this.store.all()) for (const s of e.room.seats) if (s.clientId) seated.add(s.clientId);
    return this.sessions.gc(ttlMs, (s) => this.byClient.has(s.clientId) || seated.has(s.clientId));
  }

  /** Rooms known to the server: on disk (index) or only in memory so far. */
  private roomCount(): number {
    let n = this.index.size;
    for (const e of this.store.all()) if (!this.index.has(e.room.id)) n++;
    return n;
  }

  /** Delete room files whose retention period has passed. Returns deleted ids. */
  sweepRetention(): string[] {
    this.lastSweep = this.now();
    const deleted: string[] = [];
    for (const [id, rec] of [...this.index]) {
      const entry = this.store.get(id);
      if (entry && entry.room.connectedCount() > 0) continue;
      const updatedAt = entry?.updatedAt ?? rec.updatedAt;
      const status = entry?.room.status ?? rec.status;
      if (!this.expired(updatedAt, status)) continue;
      this.deleteRoom(id);
      deleted.push(id);
    }
    if (deleted.length) this.log(`hub: deleted ${deleted.length} expired room(s): ${deleted.join(', ')}`);
    return deleted;
  }

  private expired(updatedAt: number, status: RoomStatus): boolean {
    return this.now() - updatedAt > (status === 'lobby' ? this.lobbyRetentionMs : this.retentionMs);
  }

  private deleteRoom(id: string): void {
    this.store.remove(id);
    this.index.delete(id);
    this.persistence.delete(id);
    for (const s of this.sessions.all()) if (s.roomId === id) s.roomId = null;
  }

  closeAll(code = 1001, reason = 'server shutting down'): void {
    for (const e of this.store.all()) e.bots?.dispose();
    for (const c of this.conns) c.ws.close(code, reason);
  }

  /** Start playing the game's bot seats (after start or restore). */
  private attachBots(entry: RoomEntry): void {
    entry.bots?.dispose();
    entry.bots = null;
    const game = entry.game;
    if (!game || !Object.keys(game.bots).length) return;
    entry.bots = new BotDriver(game, {
      runner: this.botRunner,
      ...(this.botDelay !== undefined ? { delay: this.botDelay } : {}),
      audience: () => entry.room.audience(),
      deliver: (out) => this.afterGame(entry, out, true),
      // Bots wait while nobody is connected (a reconnecting hello pokes them again).
      active: () => entry.room.connectedCount() > 0,
      log: this.log,
    });
    entry.bots.poke();
  }

  get connectionCount(): number {
    return this.conns.size;
  }

  private detach(conn: Conn): void {
    if (this.conns.delete(conn)) this.unbind(conn);
  }

  /** Forget the conn's session binding and mark the member disconnected. */
  private unbind(conn: Conn): void {
    const id = conn.clientId;
    conn.clientId = null;
    if (!id || this.byClient.get(id) !== conn) return;
    this.byClient.delete(id);
    const entry = this.entryOf(id);
    if (entry) {
      entry.room.setConnected(id, false);
      this.roomChanged(entry, false);
    }
  }

  // --- restore ----------------------------------------------------------------

  /**
   * Boot: index every persisted room, delete expired ones, re-create the sessions of all seat
   * holders (so their tokens keep working), and load games in progress plus recently active
   * rooms into memory. Everything else is loaded on demand. Returns the number loaded.
   */
  restore(records: PersistedRoom[]): number {
    let n = 0;
    // Most recent first, so a client seated in several rooms resumes the latest one.
    for (const rec of [...records].sort((a, b) => b.updatedAt - a.updatedAt)) {
      if (this.expired(rec.updatedAt, rec.status)) {
        this.persistence.delete(rec.id);
        this.log(`hub: deleted expired room ${rec.id}`);
        continue;
      }
      this.indexRecord(rec);
      this.adoptSeats(rec);
      if (rec.status === 'playing' || this.now() - rec.updatedAt <= this.idleTtlMs) {
        if (this.load(rec)) n++;
      }
    }
    return n;
  }

  private indexRecord(rec: PersistedRoom): void {
    this.index.set(rec.id, {
      updatedAt: rec.updatedAt,
      status: rec.status,
      seats: rec.seats.flatMap((s) => (s.clientId ? [{ clientId: s.clientId, tokenHash: s.tokenHash }] : [])),
    });
  }

  private adoptSeats(rec: PersistedRoom): void {
    for (const s of rec.seats) {
      if (s.clientId && s.tokenHash) this.sessions.adopt({ clientId: s.clientId, tokenHash: s.tokenHash, name: s.name ?? 'Player', roomId: rec.id });
    }
  }

  /** Rebuild a room and its game from a record and add it to the store. */
  private load(rec: PersistedRoom): RoomEntry | undefined {
    try {
      const room = Room.restore({ id: rec.id, createdAt: rec.createdAt, status: rec.status, hostClientId: rec.hostClientId, config: rec.config, seats: rec.seats.map(({ tokenHash: _t, ...s }) => s) }, this.now);
      const game =
        rec.gameConfig && rec.seed !== null
          ? new GameSession({ engine: this.engine, config: rec.gameConfig, seed: rec.seed, actions: rec.actions, bots: room.bots(), onReplayFailure: 'truncate' })
          : null;
      if (room.status === 'playing' && !game) throw new Error('playing room without a game');
      if (game?.replayFailure && room.status === 'finished' && !game.isOver) room.status = 'playing';
      this.indexRecord(rec);
      this.adoptSeats(rec);
      const entry = this.store.add(room, game, rec.updatedAt);
      if (game?.replayFailure) this.rolledBack(entry, rec);
      this.attachBots(entry);
      return entry;
    } catch (e) {
      this.log(`hub: could not restore room ${rec.id}: ${(e as Error).message}`);
      return undefined;
    }
  }

  /**
   * The saved log no longer replays with this engine (a rules change made a logged move illegal).
   * The game continues from the longest valid prefix (architecture §4.5): the original file is
   * backed up first, the truncated log is written back, and players are told on (re)connect.
   */
  private rolledBack(entry: RoomEntry, rec: PersistedRoom): void {
    const f = entry.game?.replayFailure;
    if (!f) return;
    const backup = this.persistence.backup(rec.id);
    this.log(
      `hub: ROLLBACK room ${rec.id}: saved game (engine ${rec.engineVersion ?? 'unknown'}) no longer replays with engine ${ENGINE_VERSION}: ${f.message}. ` +
        `Kept ${f.index} of ${f.total} actions; original saved as ${backup ?? '(no backup: persistence disabled)'}.`,
    );
    entry.notice = {
      text: `The server was updated and this game no longer replays past move ${f.index} of ${f.total}. It was rolled back to move ${f.index}.`,
      seen: new Set(),
    };
    this.persist(entry);
  }

  /** Tell a member about a rollback once (system chat line). */
  private sendNotice(entry: RoomEntry, clientId: string): void {
    const n = entry.notice;
    if (!n || n.seen.has(clientId)) return;
    n.seen.add(clientId);
    this.send(clientId, { t: 'chat', from: { clientId: 'server', name: 'Server', seat: null }, text: n.text, ts: this.now() });
  }

  /** The room in memory, or loaded from disk (load on demand). */
  private room(id: string): RoomEntry | undefined {
    const entry = this.store.get(id);
    if (entry) return entry;
    const rec = this.persistence.load(id);
    if (!rec) return undefined;
    if (this.expired(rec.updatedAt, rec.status)) {
      this.deleteRoom(id);
      return undefined;
    }
    const loaded = this.load(rec);
    if (loaded) this.log(`hub: room ${id} loaded from disk`);
    return loaded;
  }

  // --- routing ----------------------------------------------------------------

  private handle(conn: Conn, msg: ClientMessage): void {
    if (msg.t === 'ping') return this.sendTo(conn, { t: 'pong', ts: msg.ts, serverTs: this.now() });
    if (msg.t === 'hello') return this.hello(conn, msg);
    const session = conn.clientId ? this.sessions.get(conn.clientId) : undefined;
    if (!session) return this.sendTo(conn, { t: 'error', code: 'BAD_MESSAGE', message: 'Send hello first' });
    session.lastSeen = this.now();
    const err = (code: ErrorCode, message: string) => this.sendTo(conn, { t: 'error', code, message, ref: msg.t });

    if (msg.t === 'room.create') return this.createRoom(conn, session, msg);
    if (msg.t === 'room.join') return this.joinRoom(conn, session, msg);

    const entry = session.roomId ? this.room(session.roomId) : undefined;
    if (!entry || !entry.room.members.has(session.clientId)) return err('NOT_IN_ROOM', 'Not in a room');
    const { room } = entry;
    const id = session.clientId;
    const apply = (r: { ok: true } | { ok: false; code: ErrorCode; message: string }) => {
      if (!r.ok) return err(r.code, r.message);
      this.roomChanged(entry);
    };

    switch (msg.t) {
      case 'room.leave': {
        const r = room.leave(id);
        session.roomId = null;
        return apply(r);
      }
      case 'room.sit': {
        const r = room.sit(id, msg.seat);
        apply(r);
        if (r.ok && entry.game) this.send(id, entry.game.snapshot(room.viewerOf(id)));
        return;
      }
      case 'room.stand':
        return apply(room.stand(id));
      case 'room.ready':
        return apply(room.setReady(id, msg.ready));
      case 'room.config':
        return apply(room.patchConfig(id, msg.config));
      case 'room.kick': {
        const kicked = room.seats[msg.seat]?.clientId ?? null;
        const r = room.kick(id, msg.seat);
        apply(r);
        if (r.ok && kicked && entry.game && room.members.get(kicked)?.connected) this.send(kicked, entry.game.snapshot('spectator'));
        return;
      }
      case 'room.addBot':
        return apply(room.addBot(id, msg.seat, msg.level));
      case 'room.removeBot':
        return apply(room.removeBot(id, msg.seat));
      case 'room.start': {
        // start() compacts the occupied seats to p1..pN in order; bot levels follow their seats.
        const bots = Object.fromEntries(room.seats.filter(isOccupied).flatMap((x, i) => (x.bot ? [[`p${i + 1}`, x.bot]] : [])));
        const r = room.start(id, (config) => new GameSession({ engine: this.engine, config, seed: this.seed(), bots }));
        if (!r.ok) return err(r.code, r.message);
        entry.game = r.value;
        this.roomChanged(entry);
        for (const a of room.audience()) this.send(a.clientId, r.value.snapshot(a.viewer));
        this.attachBots(entry);
        return;
      }
      case 'game.action': {
        if (!entry.game) return err('GAME_NOT_STARTED', 'The game has not started');
        const seat = room.seatOf(id);
        if (!seat) return err('NOT_SEATED', 'Spectators cannot act');
        const tooBig = (JSON.stringify(msg.action)?.length ?? 0) > this.limits.maxActionBytes;
        const tooLong = entry.game.seq >= this.limits.maxGameActions;
        if (tooBig || tooLong) {
          const message = tooBig ? `Action larger than ${this.limits.maxActionBytes} bytes` : `Game log is full (${this.limits.maxGameActions} actions)`;
          return this.send(id, { t: 'game.rejected', id: msg.id, code: 'INVALID_PAYLOAD', message });
        }
        const out = entry.game.submitAction(seat.playerId, id, msg, room.audience());
        return this.afterGame(entry, out);
      }
      case 'game.undo': {
        if (!entry.game) return err('GAME_NOT_STARTED', 'The game has not started');
        const seat = room.seatOf(id);
        if (!seat) return err('NOT_SEATED', 'Spectators cannot undo');
        return this.afterGame(entry, entry.game.requestUndo(seat.playerId, id, msg.expectedSeq, room.audience()));
      }
      case 'game.resync':
        if (!entry.game) return err('GAME_NOT_STARTED', 'The game has not started');
        if (!conn.resyncs.take()) return err('RATE_LIMITED', 'Too many resyncs; slow down');
        return this.send(id, entry.game.snapshot(room.viewerOf(id)));
      case 'chat':
        return this.chat(conn, session, entry, msg.text);
    }
  }

  private hello(conn: Conn, msg: ClientMessageOf<'hello'>): void {
    if (msg.protocol !== PROTOCOL_VERSION) {
      return this.sendTo(conn, { t: 'error', code: 'PROTOCOL_MISMATCH', message: `Server speaks protocol ${PROTOCOL_VERSION}` });
    }
    let token = msg.sessionToken;
    let session = token ? this.sessions.resume(token) : undefined;
    if (!session || !token) {
      if (!conn.creates.take()) return this.sendTo(conn, { t: 'error', code: 'RATE_LIMITED', message: 'Too many new sessions; slow down', ref: 'hello' });
      if (this.sessions.size >= this.limits.maxSessions) this.gcSessions(SESSION_PRESSURE_TTL_MS);
      if (this.sessions.size >= this.limits.maxSessions) {
        this.log(`hub: session cap reached (${this.limits.maxSessions}); refusing a new session`);
        return this.sendTo(conn, { t: 'error', code: 'RATE_LIMITED', message: 'The server is full; try again later', ref: 'hello' });
      }
      ({ token, session } = this.sessions.create(msg.name));
    }
    if (msg.name) session.name = msg.name;

    // One live socket per session: a newer tab replaces the older one.
    const prev = this.byClient.get(session.clientId);
    if (prev && prev !== conn) {
      prev.clientId = null;
      this.conns.delete(prev);
      prev.ws.close(4000, 'session opened elsewhere');
    }
    if (conn.clientId && conn.clientId !== session.clientId) this.unbind(conn);
    conn.clientId = session.clientId;
    this.byClient.set(session.clientId, conn);

    let entry = session.roomId ? this.room(session.roomId) : undefined;
    if (entry && !entry.room.members.has(session.clientId)) entry = undefined;
    if (!entry) session.roomId = null;
    if (entry) entry.room.setConnected(session.clientId, true);

    this.sendTo(conn, { t: 'welcome', clientId: session.clientId, sessionToken: token, serverVersion: this.serverVersion, protocol: PROTOCOL_VERSION, room: entry ? entry.room.info() : null });
    if (entry) {
      this.roomChanged(entry, false);
      if (entry.game) this.send(session.clientId, entry.game.snapshot(entry.room.viewerOf(session.clientId)));
      this.sendNotice(entry, session.clientId);
      entry.bots?.poke();
    }
  }

  private createRoom(conn: Conn, session: ClientSession, msg: ClientMessageOf<'room.create'>): void {
    const err = (message: string) => this.sendTo(conn, { t: 'error', code: 'RATE_LIMITED', message, ref: msg.t });
    if (!conn.creates.take()) return err('Too many new rooms; slow down');
    if (this.roomCount() >= this.limits.maxRooms) {
      this.log(`hub: room cap reached (${this.limits.maxRooms}); refusing a new room`);
      return err('The server is full; try again later');
    }
    this.leaveCurrent(session);
    const entry = this.store.create(session.clientId, msg.config);
    session.name = msg.name;
    entry.room.join(session.clientId, msg.name);
    session.roomId = entry.room.id;
    this.roomChanged(entry);
  }

  private joinRoom(conn: Conn, session: ClientSession, msg: ClientMessageOf<'room.join'>): void {
    // Room codes are short; too many misses in a row look like enumeration and are refused unanswered.
    if (!conn.joinMisses.has()) return this.sendTo(conn, { t: 'error', code: 'RATE_LIMITED', message: 'Too many unknown room codes; slow down', ref: msg.t });
    const entry = this.room(msg.roomId);
    if (!entry) {
      conn.joinMisses.take();
      return this.sendTo(conn, { t: 'error', code: 'ROOM_NOT_FOUND', message: `No room ${msg.roomId}`, ref: msg.t });
    }
    if (session.roomId !== entry.room.id) this.leaveCurrent(session);
    session.name = msg.name;
    entry.room.join(session.clientId, msg.name, msg.spectate ?? false);
    session.roomId = entry.room.id;
    if (!msg.spectate) this.reclaimOrphanSeat(entry, session);
    this.roomChanged(entry);
    if (entry.game) this.send(session.clientId, entry.game.snapshot(entry.room.viewerOf(session.clientId)));
    this.sendNotice(entry, session.clientId);
    entry.bots?.poke();
  }

  /**
   * Fallback for seats nobody can ever reconnect to: the holder's session token is lost (no
   * session, no stored hash). A player joining a game in progress under that seat's name gets it.
   */
  private reclaimOrphanSeat(entry: RoomEntry, session: ClientSession): void {
    const { room } = entry;
    if (room.status !== 'playing' || room.seatOf(session.clientId)) return;
    const name = session.name.trim().toLowerCase();
    const known = new Map((this.index.get(room.id)?.seats ?? []).map((s) => [s.clientId, s.tokenHash]));
    const seat = room.seats.find(
      (s) => s.clientId && s.name?.trim().toLowerCase() === name && !room.members.get(s.clientId)?.connected && !this.sessions.get(s.clientId) && !known.get(s.clientId),
    );
    if (seat && room.reassign(seat.index, session.clientId).ok) this.log(`hub: room ${room.id} seat ${seat.index} reclaimed by name`);
  }

  private leaveCurrent(session: ClientSession): void {
    const prev = session.roomId ? this.room(session.roomId) : undefined;
    session.roomId = null;
    if (prev && prev.room.leave(session.clientId).ok) this.roomChanged(prev);
  }

  private chat(conn: Conn, session: ClientSession, entry: RoomEntry, text: string): void {
    const t = this.now();
    conn.chat = conn.chat.filter((ts) => t - ts < CHAT_WINDOW_MS);
    if (conn.chat.length >= CHAT_BURST) return this.sendTo(conn, { t: 'error', code: 'RATE_LIMITED', message: 'Slow down', ref: 'chat' });
    conn.chat.push(t);
    const seat = entry.room.seatOf(session.clientId);
    const msg: ServerMessage = { t: 'chat', from: { clientId: session.clientId, name: session.name, seat: seat ? seat.index : null }, text, ts: t };
    for (const m of entry.room.members.values()) if (m.connected) this.send(m.clientId, msg);
  }

  /** Send a game pipeline's messages; persist and wake the bots if the game changed (`applied`: it did). */
  private afterGame(entry: RoomEntry, out: Outbound[], applied = false): void {
    for (const o of out) this.send(o.to, o.msg);
    const changed = applied || out.some((o) => o.msg.t === 'game.applied' || o.msg.t === 'game.undone');
    if (!changed) return;
    if (entry.game?.isOver && entry.room.status === 'playing') {
      entry.room.finish();
      this.broadcastRoom(entry);
    }
    this.store.touch(entry);
    this.persist(entry);
    entry.bots?.poke();
  }

  // --- fan-out & persistence ----------------------------------------------------

  private roomChanged(entry: RoomEntry, touch = true): void {
    if (touch) this.store.touch(entry);
    this.broadcastRoom(entry);
    this.persist(entry);
  }

  private broadcastRoom(entry: RoomEntry): void {
    const msg: ServerMessage = { t: 'room.update', room: entry.room.info() };
    for (const m of entry.room.members.values()) if (m.connected) this.send(m.clientId, msg);
  }

  private persist(entry: RoomEntry): void {
    this.persistence.schedule(entry.room.id, () => this.record(entry));
  }

  record(entry: RoomEntry): PersistedRoom {
    const snap = entry.room.snapshot();
    // A seat's token hash comes from its live session, else from the last write: it must never be
    // lost just because the session is not in memory (it would lock the player out for good).
    const known = new Map((this.index.get(snap.id)?.seats ?? []).map((s) => [s.clientId, s.tokenHash]));
    const tokenHash = (clientId: string | null) => (clientId ? (this.sessions.get(clientId)?.tokenHash ?? known.get(clientId) ?? null) : null);
    const rec: PersistedRoom = {
      version: 1,
      engineVersion: ENGINE_VERSION,
      ...(this.buildId ? { build: this.buildId } : {}),
      id: snap.id,
      createdAt: snap.createdAt,
      updatedAt: entry.updatedAt,
      hostClientId: snap.hostClientId,
      config: snap.config,
      status: snap.status,
      seats: snap.seats.map((s) => ({ ...s, connected: false, tokenHash: tokenHash(s.clientId) })),
      seed: entry.game?.seed ?? null,
      gameConfig: entry.game?.config ?? null,
      actions: entry.game?.actions ?? [],
    };
    this.indexRecord(rec);
    return rec;
  }

  private entryOf(clientId: string): RoomEntry | undefined {
    const roomId = this.sessions.get(clientId)?.roomId;
    return roomId ? this.store.get(roomId) : undefined;
  }

  private send(clientId: string, msg: ServerMessage): void {
    const c = this.byClient.get(clientId);
    if (c) this.sendTo(c, msg);
  }

  /** Send unless the socket is closed. A socket that cannot keep up (`maxBufferedBytes` unsent) is dropped; it reconnects and resyncs. */
  private sendTo(conn: Conn, msg: ServerMessage): void {
    const ws = conn.ws;
    if (ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > this.limits.maxBufferedBytes) {
      this.log(`hub: dropping a slow socket (${ws.bufferedAmount} bytes unsent)`);
      ws.terminate();
      return;
    }
    ws.send(JSON.stringify(msg));
  }
}
