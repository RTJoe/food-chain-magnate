/**
 * Hostile or broken input must not take the server down: malformed upgrade targets, oversized or
 * deeply nested payloads, floods, slow readers, escaped exceptions. Saved games that no longer
 * replay are rolled back to their last valid action, never dropped.
 */
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect as tcpConnect } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import { toyEngine } from '@fcm/engine/testing';
import type { ReserveCard } from '@fcm/engine';
import { checkSaves } from '../src/checkSaves.js';
import { DEFAULT_LIMITS, limitsFromEnv } from '../src/limits.js';
import { NullPersistence, type PersistedRoom } from '../src/persistence.js';
import { RoomStore } from '../src/roomStore.js';
import { installCrashGuards, type RunningServer } from '../src/server.js';
import { SessionRegistry } from '../src/sessions.js';
import { Hub } from '../src/ws.js';
import { boot, tempDir, TestClient } from './helpers.js';

const CARD: ReserveCard = { kind: 'standard', amount: 200, ceoSlots: 3 };
const servers: RunningServer[] = [];
const clients: TestClient[] = [];

async function start(opts: Parameters<typeof boot>[0] = {}) {
  const s = await boot({ persistDebounceMs: 5, tickMs: 3_600_000, ...opts });
  servers.push(s);
  return s;
}
async function connect(s: RunningServer, hello: Parameters<typeof TestClient.connect>[1] = {}) {
  const c = await TestClient.connect(s, hello);
  clients.push(c);
  return c;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** Host + guest seated, game started, host has chosen a reserve card (seq 1). */
async function startedGame(s: RunningServer) {
  const host = await connect(s, { name: 'Ann' });
  host.send({ t: 'room.create', name: 'Ann', config: { seatCount: 2 } });
  const { room } = await host.next('room.update');
  const guest = await connect(s, { name: 'Bob' });
  guest.send({ t: 'room.join', roomId: room.id, name: 'Bob' });
  await guest.next('room.update');
  host.send({ t: 'room.sit', seat: 0 });
  guest.send({ t: 'room.sit', seat: 1 });
  await host.next('room.update', (m) => m.room.seats.every((x) => x.clientId));
  host.send({ t: 'room.ready', ready: true });
  guest.send({ t: 'room.ready', ready: true });
  await host.next('room.update', (m) => m.room.seats.every((x) => x.ready));
  host.send({ t: 'room.start' });
  await host.next('game.snapshot');
  host.send({ t: 'game.action', id: 'a1', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD } });
  await guest.next('game.applied');
  return { host, guest, roomId: room.id };
}

/** The server still serves a fresh client end to end. */
async function alive(s: RunningServer) {
  const c = await connect(s);
  await c.sync();
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** A deeply nested object, `{ a: { a: ... } }`. */
function deep(n: number): Record<string, unknown> {
  let v: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) v = { a: v };
  return v;
}

describe('untrusted input', () => {
  it('a malformed WebSocket upgrade target drops that socket only', async () => {
    const s = await start();
    for (const target of ['//', '//[', '//:99999', '//@']) {
      await new Promise<void>((res, rej) => {
        const sock = tcpConnect(s.port, '127.0.0.1', () => {
          sock.write(
            `GET ${target} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
          );
        });
        sock.on('close', () => res());
        sock.on('error', () => res());
        setTimeout(() => rej(new Error('socket not closed')), 2000);
      });
    }
    await alive(s);
  });

  it('rejects deeply nested or oversized room options; closing afterwards is safe', async () => {
    const s = await start();
    const c = await connect(s, { name: 'Eve' });
    // ~16 KB frame, well under the frame cap (built by hand: JSON.stringify would overflow here).
    c.ws.send(`{"t":"room.create","name":"Eve","config":{"options":${'{"a":'.repeat(8000)}{}${'}'.repeat(8000)}}}`);
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    c.send({ t: 'room.create', name: 'Eve', config: { options: { base: { junk: 'x'.repeat(1000) } } } });
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    c.send({ t: 'room.create', name: 'Eve', config: { options: { 'ketchup:lobbyists': { includeTileZ: true, parallelRoadsConnect: 'lobbyistOnly' } } } });
    const { room } = await c.next('room.update');
    c.send({ t: 'room.config', config: { ...room.config, options: deep(50) } });
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    await c.close();
    await settle();
    expect(s.hub.store.size).toBe(1);
    await alive(s);
  });

  it('rejects oversized and deeply nested actions without applying or storing them', async () => {
    const s = await start({ limits: { maxActionBytes: 4096 } });
    const { host, roomId } = await startedGame(s);
    host.send({ t: 'game.action', id: 'big', expectedSeq: 1, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD, junk: 'x'.repeat(200_000) } });
    expect(await host.next('game.rejected')).toMatchObject({ id: 'big', code: 'INVALID_PAYLOAD' });
    host.send({ t: 'game.action', id: 'deep', expectedSeq: 1, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD, nested: deep(100) } });
    expect(await host.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    expect(s.hub.store.get(roomId)?.game?.seq).toBe(1);
  });

  it('caps the action log length', async () => {
    const s = await start({ limits: { maxGameActions: 1 } });
    const { guest } = await startedGame(s);
    guest.send({ t: 'game.action', id: 'g1', expectedSeq: 1, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    expect(await guest.next('game.rejected')).toMatchObject({ id: 'g1', code: 'INVALID_PAYLOAD' });
  });
});

describe('rate limits and caps', () => {
  it('rate-limits every message per connection and closes a socket that keeps flooding', async () => {
    const s = await start({ limits: { msgBurst: 10, msgRate: 0.001 } });
    const c = await connect(s);
    for (let i = 0; i < 30; i++) c.send({ t: 'ping', ts: i });
    expect(await c.next('error')).toMatchObject({ code: 'RATE_LIMITED' });
    await settle(50);
    expect(c.inbox.filter((m) => m.t === 'pong').length).toBeLessThanOrEqual(10);
    expect(c.inbox.filter((m) => m.t === 'error').length).toBe(1);
    const closed = new Promise<number>((res) => c.ws.once('close', (code) => res(code)));
    for (let i = 0; i < 120; i++) c.send({ t: 'ping', ts: i });
    expect(await closed).toBe(1008);
  });

  it('limits new sessions per connection and in total', async () => {
    const s = await start({ limits: { createBurst: 3, maxSessions: 5 } });
    const c = await connect(s); // 1 session
    for (let i = 0; i < 3; i++) c.send({ t: 'hello', clientVersion: 't', protocol: 1 });
    await c.next('error', (m) => m.code === 'RATE_LIMITED');
    expect(s.hub.sessions.size).toBe(3);
    await connect(s);
    await connect(s);
    await expect(connect(s)).rejects.toThrow(/timeout waiting for welcome/);
    expect(s.hub.sessions.size).toBe(5);
  });

  it('limits room creation per connection and in total', async () => {
    const s = await start({ limits: { createBurst: 3, maxRooms: 3 } });
    // The token-less hello spent one create token; two rooms spend the rest.
    const a = await connect(s, { name: 'Ann' });
    a.send({ t: 'room.create', name: 'Ann' });
    await a.next('room.update');
    a.send({ t: 'room.create', name: 'Ann' });
    await a.next('room.update');
    a.send({ t: 'room.create', name: 'Ann' });
    expect(await a.next('error')).toMatchObject({ code: 'RATE_LIMITED', ref: 'room.create', message: expect.stringMatching(/slow down/) });
    const b = await connect(s, { name: 'Bo' });
    b.send({ t: 'room.create', name: 'Bo' });
    await b.next('room.update');
    b.send({ t: 'room.create', name: 'Bo' });
    expect(await b.next('error')).toMatchObject({ code: 'RATE_LIMITED', message: expect.stringMatching(/full/) });
  });

  it('rate-limits resyncs', async () => {
    const s = await start({ limits: { resyncBurst: 2, resyncRefillMs: 60_000 } });
    const { host } = await startedGame(s);
    host.drain();
    for (let i = 0; i < 4; i++) host.send({ t: 'game.resync' });
    expect(await host.next('error')).toMatchObject({ code: 'RATE_LIMITED', ref: 'game.resync' });
    await host.sync();
    expect(host.inbox.filter((m) => m.t === 'game.snapshot').length).toBeLessThanOrEqual(1 + 2);
  });

  it('reads limits from env; bad values keep the defaults', () => {
    const l = limitsFromEnv({ FCM_MSG_RATE: '5', FCM_MAX_ROOMS: 'x', FCM_MAX_BUFFERED_KB: '64', FCM_MAX_SESSIONS: '-1' });
    expect(l).toMatchObject({ msgRate: 5, maxRooms: DEFAULT_LIMITS.maxRooms, maxBufferedBytes: 64 * 1024, maxSessions: DEFAULT_LIMITS.maxSessions });
  });
});

/** A minimal stand-in for a `ws` socket. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  terminated = false;
  send(data: string) {
    this.sent.push(data);
  }
  ping() {}
  close() {
    this.terminate();
  }
  terminate() {
    if (this.terminated) return;
    this.terminated = true;
    this.readyState = 3;
    this.emit('close');
  }
}

function hub(logs: string[] = []) {
  return new Hub({ engine: toyEngine, store: new RoomStore(), sessions: new SessionRegistry(), persistence: new NullPersistence(), log: (m) => logs.push(m), limits: { maxBufferedBytes: 1000 } });
}

describe('send backpressure and crash guards', () => {
  it('drops a socket whose unsent output exceeds the limit instead of buffering more', () => {
    const logs: string[] = [];
    const h = hub(logs);
    const ws = new FakeSocket();
    h.attach(ws as unknown as WebSocket);
    ws.emit('message', JSON.stringify({ t: 'ping', ts: 1 }));
    expect(ws.sent).toHaveLength(1);
    ws.bufferedAmount = 5000;
    ws.emit('message', JSON.stringify({ t: 'ping', ts: 2 }));
    expect(ws.sent).toHaveLength(1);
    expect(ws.terminated).toBe(true);
    expect(h.connectionCount).toBe(0);
    expect(logs.join()).toMatch(/slow socket/);
  });

  it('an exception in a socket close handler is logged, not thrown', () => {
    const logs: string[] = [];
    const h = hub(logs);
    const ws = new FakeSocket();
    h.attach(ws as unknown as WebSocket);
    ws.emit('message', JSON.stringify({ t: 'hello', clientVersion: 't', protocol: 1, name: 'Ann' }));
    ws.emit('message', JSON.stringify({ t: 'room.create', name: 'Ann' }));
    const entry = [...h.store.all()][0];
    if (!entry) throw new Error('no room');
    entry.room.info = () => {
      throw new RangeError('Maximum call stack size exceeded');
    };
    expect(() => ws.terminate()).not.toThrow();
    expect(logs.join()).toMatch(/error in close/);
    expect(() => h.tick()).not.toThrow();
  });

  it('installCrashGuards logs escaped exceptions and rejections', () => {
    const proc = new EventEmitter();
    const logs: string[] = [];
    installCrashGuards(proc as never, (m) => logs.push(m));
    proc.emit('uncaughtException', new Error('boom'));
    proc.emit('unhandledRejection', 'nope');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(/boom/);
  });
});

describe('saved games that no longer replay', () => {
  it('restores the longest valid prefix, keeps a backup, tells the players, and checkSaves reports it', async () => {
    const dataDir = tempDir();
    const logs: string[] = [];
    const s1 = await start({ dataDir });
    const { roomId, host } = await startedGame(s1);
    const token = host.token;
    await settle();
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await s1.close();
    servers.splice(0);

    // A rules change makes a logged move illegal: p1 choosing a reserve card twice.
    const file = join(dataDir, 'rooms', `${roomId}.json`);
    const rec = JSON.parse(readFileSync(file, 'utf8')) as PersistedRoom;
    expect(rec.engineVersion).toBeTruthy();
    const a1 = rec.actions[0];
    writeFileSync(file, JSON.stringify({ ...rec, actions: [a1, a1, a1] }));
    expect(checkSaves(toyEngine, dataDir)).toEqual([expect.objectContaining({ id: roomId, failure: expect.objectContaining({ index: 1, total: 3 }) })]);

    const s2 = await start({ dataDir, log: (m) => logs.push(m) });
    expect(s2.hub.store.get(roomId)?.game?.seq).toBe(1);
    expect(logs.join('\n')).toMatch(new RegExp(`ROLLBACK room ${roomId}.*Kept 1 of 3 actions`));
    expect(readdirSync(join(dataDir, 'rooms')).filter((f) => f.endsWith('.bak'))).toHaveLength(1);

    const h = await connect(s2, { sessionToken: token });
    expect((h.inbox[0] as { room: { id: string } | null }).room?.id).toBe(roomId);
    expect(await h.next('game.snapshot')).toMatchObject({ seq: 1, me: 'p1' });
    expect(await h.next('chat')).toMatchObject({ from: { clientId: 'server' }, text: expect.stringMatching(/rolled back to move 1/) });

    await settle();
    s2.hub.store.get(roomId) && (await s2.close());
    expect((JSON.parse(readFileSync(file, 'utf8')) as PersistedRoom).actions).toHaveLength(1);
    expect(checkSaves(toyEngine, dataDir)[0]?.failure).toBeNull();
    expect(existsSync(file)).toBe(true);
  });
});
