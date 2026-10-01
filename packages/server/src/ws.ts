/**
 * WebSocket hub: maps sockets to sessions, routes client messages to rooms and game sessions,
 * fans out per-viewer messages, persists room changes, and runs heartbeat / host-transfer / GC.
 * Protocol reference: docs/protocol.md.
 */
import { randomBytes } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import type { EngineApi } from '@fcm/engine';
import { PROTOCOL_VERSION, parseClientMessage, type ClientMessage, type ClientMessageOf, type ErrorCode, type ServerMessage } from '@fcm/protocol';
import { GameSession, Room, type Outbound } from '@fcm/session';
import type { Persistence, PersistedRoom } from './persistence.js';
import { ROOM_IDLE_TTL_MS, type RoomEntry, type RoomStore } from './roomStore.js';
import type { ClientSession, SessionRegistry } from './sessions.js';

export const SERVER_VERSION = '0.1.0';

/** Chat flood control: at most this many messages per window. */
const CHAT_BURST = 8;
const CHAT_WINDOW_MS = 5_000;

interface Conn {
  ws: WebSocket;
  clientId: string | null;
  alive: boolean;
  chat: number[];
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
  private readonly conns = new Set<Conn>();
  private readonly byClient = new Map<string, Conn>();

  constructor(opts: HubOptions) {
    this.engine = opts.engine;
    this.store = opts.store;
    this.sessions = opts.sessions;
    this.persistence = opts.persistence;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(m));
    this.seed = opts.seed ?? (() => randomBytes(4).readUInt32LE(0));
    this.idleTtlMs = opts.idleTtlMs ?? ROOM_IDLE_TTL_MS;
  }

  // --- sockets ----------------------------------------------------------------

  attach(ws: WebSocket): void {
    const conn: Conn = { ws, clientId: null, alive: true, chat: [] };
    this.conns.add(conn);
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: RawData) => {
      conn.alive = true;
      const msg = parseClientMessage(String(data));
      if (!msg) return this.sendTo(conn, { t: 'error', code: 'BAD_MESSAGE', message: 'Invalid message' });
      try {
        this.handle(conn, msg);
      } catch (e) {
        this.log(`hub: error handling ${msg.t}: ${(e as Error).stack ?? e}`);
        this.sendTo(conn, { t: 'error', code: 'INTERNAL', message: 'Internal server error', ref: msg.t });
      }
    });
    ws.on('close', () => this.detach(conn));
    ws.on('error', () => ws.terminate());
  }

  /** Heartbeat sweep: terminate sockets that missed the previous ping, ping the rest. */
  heartbeat(): void {
    for (const c of this.conns) {
      if (!c.alive) {
        c.ws.terminate();
        this.detach(c);
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

  /** Periodic housekeeping: host transfer and idle-room GC. */
  tick(): void {
    for (const e of this.store.all()) if (e.room.tick()) this.roomChanged(e);
    for (const id of this.store.gc(this.idleTtlMs)) this.log(`hub: room ${id} idle, unloaded`);
    this.sessions.gc(this.idleTtlMs, (s) => this.byClient.has(s.clientId));
  }

  closeAll(code = 1001, reason = 'server shutting down'): void {
    for (const c of this.conns) c.ws.close(code, reason);
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

  /** Load persisted rooms. Rooms idle longer than the GC TTL are left on disk. */
  restore(records: PersistedRoom[]): number {
    let n = 0;
    for (const rec of records) {
      if (this.now() - rec.updatedAt > this.idleTtlMs) continue;
      try {
        const room = Room.restore({ id: rec.id, createdAt: rec.createdAt, status: rec.status, hostClientId: rec.hostClientId, config: rec.config, seats: rec.seats.map(({ tokenHash: _t, ...s }) => s) }, this.now);
        const game = rec.gameConfig && rec.seed !== null ? new GameSession({ engine: this.engine, config: rec.gameConfig, seed: rec.seed, actions: rec.actions }) : null;
        if (room.status === 'playing' && !game) throw new Error('playing room without a game');
        this.store.add(room, game, rec.updatedAt);
        for (const s of rec.seats) {
          if (s.clientId && s.tokenHash) this.sessions.adopt({ clientId: s.clientId, tokenHash: s.tokenHash, name: s.name ?? 'Player', roomId: rec.id });
        }
        n++;
      } catch (e) {
        this.log(`hub: could not restore room ${rec.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  // --- routing ----------------------------------------------------------------

  private handle(conn: Conn, msg: ClientMessage): void {
    if (msg.t === 'ping') return this.sendTo(conn, { t: 'pong', ts: msg.ts, serverTs: this.now() });
    if (msg.t === 'hello') return this.hello(conn, msg);
    const session = conn.clientId ? this.sessions.get(conn.clientId) : undefined;
    if (!session) return this.sendTo(conn, { t: 'error', code: 'BAD_MESSAGE', message: 'Send hello first' });
    session.lastSeen = this.now();
    const err = (code: ErrorCode, message: string) => this.sendTo(conn, { t: 'error', code, message, ref: msg.t });

    if (msg.t === 'room.create') return this.createRoom(session, msg);
    if (msg.t === 'room.join') return this.joinRoom(conn, session, msg);

    const entry = session.roomId ? this.store.get(session.roomId) : undefined;
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
      case 'room.start': {
        const r = room.start(id, (config) => new GameSession({ engine: this.engine, config, seed: this.seed() }));
        if (!r.ok) return err(r.code, r.message);
        entry.game = r.value;
        this.roomChanged(entry);
        for (const a of room.audience()) this.send(a.clientId, r.value.snapshot(a.viewer));
        return;
      }
      case 'game.action': {
        if (!entry.game) return err('GAME_NOT_STARTED', 'The game has not started');
        const seat = room.seatOf(id);
        if (!seat) return err('NOT_SEATED', 'Spectators cannot act');
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
    if (!session || !token) ({ token, session } = this.sessions.create(msg.name));
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

    let entry = session.roomId ? this.store.get(session.roomId) : undefined;
    if (entry && !entry.room.members.has(session.clientId)) entry = undefined;
    if (!entry) session.roomId = null;
    if (entry) entry.room.setConnected(session.clientId, true);

    this.sendTo(conn, { t: 'welcome', clientId: session.clientId, sessionToken: token, serverVersion: SERVER_VERSION, protocol: PROTOCOL_VERSION, room: entry ? entry.room.info() : null });
    if (entry) {
      this.roomChanged(entry, false);
      if (entry.game) this.send(session.clientId, entry.game.snapshot(entry.room.viewerOf(session.clientId)));
    }
  }

  private createRoom(session: ClientSession, msg: ClientMessageOf<'room.create'>): void {
    this.leaveCurrent(session);
    const entry = this.store.create(session.clientId, msg.config);
    session.name = msg.name;
    entry.room.join(session.clientId, msg.name);
    session.roomId = entry.room.id;
    this.roomChanged(entry);
  }

  private joinRoom(conn: Conn, session: ClientSession, msg: ClientMessageOf<'room.join'>): void {
    const entry = this.store.get(msg.roomId);
    if (!entry) return this.sendTo(conn, { t: 'error', code: 'ROOM_NOT_FOUND', message: `No room ${msg.roomId}`, ref: msg.t });
    if (session.roomId !== entry.room.id) this.leaveCurrent(session);
    session.name = msg.name;
    entry.room.join(session.clientId, msg.name, msg.spectate ?? false);
    session.roomId = entry.room.id;
    this.roomChanged(entry);
    if (entry.game) this.send(session.clientId, entry.game.snapshot(entry.room.viewerOf(session.clientId)));
  }

  private leaveCurrent(session: ClientSession): void {
    const prev = session.roomId ? this.store.get(session.roomId) : undefined;
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

  private afterGame(entry: RoomEntry, out: Outbound[]): void {
    for (const o of out) this.send(o.to, o.msg);
    const changed = out.some((o) => o.msg.t === 'game.applied' || o.msg.t === 'game.undone');
    if (!changed) return;
    if (entry.game?.isOver && entry.room.status === 'playing') {
      entry.room.finish();
      this.broadcastRoom(entry);
    }
    this.store.touch(entry);
    this.persist(entry);
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
    return {
      version: 1,
      id: snap.id,
      createdAt: snap.createdAt,
      updatedAt: entry.lastActivity,
      hostClientId: snap.hostClientId,
      config: snap.config,
      status: snap.status,
      seats: snap.seats.map((s) => ({ ...s, connected: false, tokenHash: s.clientId ? (this.sessions.get(s.clientId)?.tokenHash ?? null) : null })),
      seed: entry.game?.seed ?? null,
      gameConfig: entry.game?.config ?? null,
      actions: entry.game?.actions ?? [],
    };
  }

  private entryOf(clientId: string): RoomEntry | undefined {
    const roomId = this.sessions.get(clientId)?.roomId;
    return roomId ? this.store.get(roomId) : undefined;
  }

  private send(clientId: string, msg: ServerMessage): void {
    const c = this.byClient.get(clientId);
    if (c) this.sendTo(c, msg);
  }

  private sendTo(conn: Conn, msg: ServerMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }
}
