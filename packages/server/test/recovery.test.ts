/**
 * Room recovery: load on demand after idle GC, boot restore of old games, file retention, seat
 * token persistence, orphan-seat reclaim and flush on SIGTERM.
 */
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReserveCard } from '@fcm/engine';
import type { ServerMessageOf } from '@fcm/protocol';
import { FilePersistence, retentionFromEnv, type PersistedRoom } from '../src/persistence.js';
import { installShutdown, type RunningServer } from '../src/server.js';
import { boot, tempDir, TestClient } from './helpers.js';

const CARD: ReserveCard = { kind: 'standard', amount: 200, ceoSlots: 3 };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const servers: RunningServer[] = [];
const clients: TestClient[] = [];

/** A controllable clock shared by a test's servers. */
function clock(start = 1_700_000_000_000) {
  const c = { t: start, now: () => c.t };
  return c;
}

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
async function stop(s: RunningServer) {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await s.close();
  servers.splice(servers.indexOf(s), 1);
}
const roomFile = (dataDir: string, id: string) => join(dataDir, 'rooms', `${id}.json`);
const readRoom = (dataDir: string, id: string) => JSON.parse(readFileSync(roomFile(dataDir, id), 'utf8')) as PersistedRoom;

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** Host + guest seated and ready, game started, host has chosen a reserve card (seq 1). */
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
  await guest.next('game.snapshot');
  host.send({ t: 'game.action', id: 'a1', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD } });
  await guest.next('game.applied');
  return { host, guest, roomId: room.id, tokens: { host: host.token, guest: guest.token }, ids: { host: host.clientId, guest: guest.clientId } };
}

async function lobbyRoom(s: RunningServer) {
  const c = await connect(s, { name: 'Lou' });
  c.send({ t: 'room.create', name: 'Lou' });
  return (await c.next('room.update')).room.id;
}

/** Wait for the debounced write to land. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe('room recovery', () => {
  it('loads an idle-unloaded room on demand; seat tokens survive session GC', async () => {
    const dataDir = tempDir();
    const c = clock();
    const s = await start({ dataDir, now: c.now });
    const { roomId, tokens, ids } = await startedGame(s);
    await Promise.all(clients.splice(0).map((x) => x.close()));
    await settle();

    c.t += 7 * HOUR;
    s.hub.tick();
    expect(s.hub.store.get(roomId)).toBeUndefined();
    expect(readRoom(dataDir, roomId)).toMatchObject({ status: 'playing', actions: [{ type: 'setup.chooseReserve' }] });

    // Another idle period: sessions with no room in memory would have been GC'd before the fix.
    c.t += 7 * HOUR;
    s.hub.tick();

    const g = await connect(s, { sessionToken: tokens.guest });
    expect(g.clientId).toBe(ids.guest);
    expect((g.inbox[0] as ServerMessageOf<'welcome'>).room?.id).toBe(roomId);
    expect(await g.next('game.snapshot')).toMatchObject({ seq: 1, me: 'p2' });

    // room.join by code loads it too.
    c.t += 7 * HOUR;
    await g.close();
    await settle();
    s.hub.tick();
    expect(s.hub.store.get(roomId)).toBeUndefined();
    const h = await connect(s, { sessionToken: tokens.host });
    h.send({ t: 'room.join', roomId, name: 'Ann' });
    expect(await h.next('game.snapshot')).toMatchObject({ seq: 1, me: 'p1' });
  });

  it('restores a playing room on boot regardless of age; old lobbies load on demand', async () => {
    const dataDir = tempDir();
    const c = clock();
    const s1 = await start({ dataDir, now: c.now });
    const { roomId, tokens } = await startedGame(s1);
    const lobbyId = await lobbyRoom(s1);
    await settle();
    await stop(s1);

    c.t += 1 * DAY;
    const s2 = await start({ dataDir, now: c.now });
    expect(s2.hub.store.get(roomId)).toBeDefined();
    expect(s2.hub.store.get(lobbyId)).toBeUndefined();
    const g = await connect(s2, { sessionToken: tokens.guest });
    expect(await g.next('game.snapshot')).toMatchObject({ seq: 1, me: 'p2' });

    const v = await connect(s2, { name: 'Vi' });
    v.send({ t: 'room.join', roomId: lobbyId, name: 'Vi' });
    expect((await v.next('room.update')).room.id).toBe(lobbyId);
  });

  it('deletes room files after retention: lobbies after 2 days, games after 30 (configurable)', async () => {
    const dataDir = tempDir();
    const c = clock();
    const s1 = await start({ dataDir, now: c.now });
    const { roomId } = await startedGame(s1);
    const lobbyId = await lobbyRoom(s1);
    await settle();
    await stop(s1);

    c.t += 3 * DAY;
    const s2 = await start({ dataDir, now: c.now });
    expect(existsSync(roomFile(dataDir, lobbyId))).toBe(false);
    expect(existsSync(roomFile(dataDir, roomId))).toBe(true);

    // Runtime sweep (hourly from tick).
    c.t += 28 * DAY;
    s2.hub.tick();
    expect(existsSync(roomFile(dataDir, roomId))).toBe(false);
    expect(s2.hub.store.get(roomId)).toBeUndefined();
    const x = await connect(s2, { name: 'X' });
    x.send({ t: 'room.join', roomId, name: 'X' });
    expect((await x.next('error')).code).toBe('ROOM_NOT_FOUND');

    expect(retentionFromEnv({ FCM_ROOM_RETENTION_DAYS: '7', FCM_LOBBY_RETENTION_DAYS: '0.5' })).toEqual({ roomMs: 7 * DAY, lobbyMs: 12 * HOUR });
    expect(retentionFromEnv({ FCM_ROOM_RETENTION_DAYS: 'nope' })).toEqual({ roomMs: 30 * DAY, lobbyMs: 2 * DAY });
  });

  it('keeps the token hash of a seated player who left the game, so they can return', async () => {
    const dataDir = tempDir();
    const c = clock();
    const s = await start({ dataDir, now: c.now });
    const { host, guest, roomId, tokens, ids } = await startedGame(s);
    guest.send({ t: 'room.leave' });
    await host.next('room.update', (m) => m.room.spectators.length === 0);
    await guest.close();
    await settle();

    // The guest's session has no room; before the fix it was GC'd and the next write lost its hash.
    c.t += 7 * HOUR;
    s.hub.tick();
    // Host reconnects: the room is written again.
    await host.close();
    await settle();
    await connect(s, { sessionToken: tokens.host });
    await settle();
    const rec = readRoom(dataDir, roomId);
    expect(rec.seats[1]).toMatchObject({ clientId: ids.guest });
    expect(rec.seats[1]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const back = await connect(s, { sessionToken: tokens.guest });
    expect(back.clientId).toBe(ids.guest);
    back.send({ t: 'room.join', roomId, name: 'Bob' });
    expect(await back.next('game.snapshot')).toMatchObject({ me: 'p2' });
  });

  it('lets a player reclaim an orphaned seat (token hash lost) by joining under its name', async () => {
    const dataDir = tempDir();
    const s1 = await start({ dataDir });
    const { roomId } = await startedGame(s1);
    await settle();
    await stop(s1);
    const rec = readRoom(dataDir, roomId);
    rec.seats[1]!.tokenHash = null;
    writeFileSync(roomFile(dataDir, roomId), JSON.stringify(rec));

    const s2 = await start({ dataDir });
    const stranger = await connect(s2, { name: 'Zed' });
    stranger.send({ t: 'room.join', roomId, name: 'Zed' });
    expect((await stranger.next('game.snapshot')).me).toBeNull();
    const bob = await connect(s2, { name: 'Bob' });
    bob.send({ t: 'room.join', roomId, name: 'bob' });
    expect(await bob.next('game.snapshot')).toMatchObject({ seq: 1, me: 'p2' });
    // Seats with a known token are never reclaimable by name.
    const fake = await connect(s2, { name: 'Ann' });
    fake.send({ t: 'room.join', roomId, name: 'Ann' });
    expect((await fake.next('game.snapshot')).me).toBeNull();
  });

  it('flushes pending writes on SIGTERM', async () => {
    const dataDir = tempDir();
    const s = await start({ dataDir, persistDebounceMs: 60_000 });
    const id = await lobbyRoom(s);
    expect(existsSync(roomFile(dataDir, id))).toBe(false);

    const proc = Object.assign(new EventEmitter(), { exit: (_code?: number) => {} });
    const exited = new Promise<number | undefined>((res) => (proc.exit = (code?: number) => res(code)));
    installShutdown(s, proc, () => {});
    proc.emit('SIGTERM');
    expect(existsSync(roomFile(dataDir, id))).toBe(true);
    expect(await exited).toBe(0);
    expect(readRoom(dataDir, id)).toMatchObject({ id, status: 'lobby' });
  });
});

describe('FilePersistence', () => {
  it('loads one room (flushing first), deletes, and ignores unsafe ids', () => {
    const p = new FilePersistence(tempDir(), 60_000, () => {});
    const rec = { version: 1, id: 'ABCDE', createdAt: 1, updatedAt: 2, hostClientId: 'h', config: { seatCount: 2, modules: [], options: {}, intro: false, introMilestones: false }, status: 'lobby', seats: [], seed: null, gameConfig: null, actions: [] } as PersistedRoom;
    p.schedule('ABCDE', () => rec);
    expect(p.load('ABCDE')).toMatchObject({ id: 'ABCDE', updatedAt: 2 });
    expect(p.load('../ABCDE')).toBeNull();
    expect(p.load('ZZZZZ')).toBeNull();
    p.delete('ABCDE');
    expect(p.load('ABCDE')).toBeNull();
  });
});
