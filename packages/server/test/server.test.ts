import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReserveCard } from '@fcm/engine';
import type { ServerMessageOf } from '@fcm/protocol';
import type { RunningServer } from '../src/server.js';
import { boot, tempDir, TestClient } from './helpers.js';

const CARD: ReserveCard = { kind: 'standard', amount: 200, ceoSlots: 3 };
const servers: RunningServer[] = [];
const clients: TestClient[] = [];

async function start(opts: Parameters<typeof boot>[0] = {}) {
  const s = await boot(opts);
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

/** Host + one guest seated and ready; game started (toy engine, non-intro → reserve phase). */
async function startedGame(s: RunningServer, config: Record<string, unknown> = {}) {
  const host = await connect(s, { name: 'Ann' });
  host.send({ t: 'room.create', name: 'Ann', config: { seatCount: 2, ...config } });
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
  const hs = await host.next('game.snapshot');
  const gs = await guest.next('game.snapshot');
  return { host, guest, roomId: room.id, hs, gs };
}

describe('server (integration, toy engine)', () => {
  it('answers hello/ping and rejects bad messages', async () => {
    const s = await start();
    const c = await connect(s);
    expect(c.token).toMatch(/^[0-9a-f]{32}$/);
    c.send({ t: 'nope' });
    expect((await c.next('error')).code).toBe('BAD_MESSAGE');
    c.send({ t: 'room.leave' });
    expect((await c.next('error')).code).toBe('NOT_IN_ROOM');
    c.send({ t: 'room.join', roomId: 'ZZZZZ', name: 'X' });
    expect((await c.next('error')).code).toBe('ROOM_NOT_FOUND');
  });

  it('create / join / sit / ready / start', async () => {
    const s = await start();
    const { host, guest, roomId, hs, gs } = await startedGame(s);
    expect(roomId).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(hs).toMatchObject({ seq: 0, me: 'p1' });
    expect(gs).toMatchObject({ seq: 0, me: 'p2' });
    expect(hs.manifest[0]?.id).toBe('base');
    const upd = host.inbox.find((m): m is ServerMessageOf<'room.update'> => m.t === 'room.update' && m.room.status === 'playing');
    expect(upd?.room.seats.map((x) => x.name)).toEqual(['Ann', 'Bob']);
    expect(upd?.room.hostClientId).toBe(host.clientId);
    expect(guest.clientId).not.toBe(host.clientId);
  });

  it('guards host-only and start validation', async () => {
    const s = await start();
    const host = await connect(s);
    host.send({ t: 'room.create', name: 'Ann' });
    const { room } = await host.next('room.update');
    const guest = await connect(s);
    guest.send({ t: 'room.join', roomId: room.id, name: 'Bob' });
    await guest.next('room.update');
    guest.send({ t: 'room.start' });
    expect((await guest.next('error')).code).toBe('NOT_HOST');
    host.send({ t: 'room.sit', seat: 0 });
    host.send({ t: 'room.ready', ready: true });
    host.send({ t: 'room.start' });
    expect((await host.next('error')).code).toBe('CANNOT_START');
    guest.send({ t: 'room.sit', seat: 0 });
    expect((await guest.next('error')).code).toBe('SEAT_TAKEN');
    host.send({ t: 'room.config', config: { seatCount: 3, modules: [], options: {}, intro: true, introMilestones: false } });
    const u = await guest.next('room.update', (m) => m.room.config.seatCount === 3);
    expect(u.room.seats).toHaveLength(3);
  });

  it('applies actions and broadcasts redacted views; spectators get spectator views', async () => {
    const s = await start();
    const { host, guest, roomId } = await startedGame(s);
    const spec = await connect(s, { name: 'Eve' });
    spec.send({ t: 'room.join', roomId, name: 'Eve', spectate: true });
    const ss = await spec.next('game.snapshot');
    expect(ss.me).toBeNull();
    expect(ss.view.viewer).toBe('spectator');

    host.send({ t: 'game.action', id: 'a1', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD } });
    const mine = await host.next('game.applied');
    const theirs = await guest.next('game.applied');
    const watched = await spec.next('game.applied');
    expect(mine).toMatchObject({ seq: 1, actionId: 'a1', action: { card: CARD } });
    expect(mine.view.mine?.reserve).toEqual(CARD);
    expect(theirs.actionId).toBeNull();
    expect(theirs.action).toEqual({ type: 'setup.chooseReserve', playerId: 'p1' });
    expect(theirs.events).toEqual([{ type: 'reserveChosen', player: 'p1' }]);
    expect(watched.action).toEqual({ type: 'setup.chooseReserve', playerId: 'p1' });
    expect(watched.view.mine).toBeNull();
    for (const m of [theirs, watched]) expect(JSON.stringify(m)).not.toContain('"amount":200');
    expect(watched.view.submitted).toMatchObject({ p1: true, p2: false });

    // Spectators cannot act.
    spec.send({ t: 'game.action', id: 's1', expectedSeq: 1, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    expect((await spec.next('error')).code).toBe('NOT_SEATED');
  });

  it('rejects stale seq with game.rejected + snapshot (simultaneous decisions may race)', async () => {
    const s = await start();
    const { host, guest } = await startedGame(s);
    host.send({ t: 'game.action', id: 'a1', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD } });
    await guest.next('game.applied');
    // A simultaneous decision sent against seq 0 still applies: only another player acted since.
    guest.send({ t: 'game.action', id: 'b1', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    expect(await guest.next('game.applied', (m) => m.actionId === 'b1')).toMatchObject({ seq: 2 });
    // Anything else against an old seq is STALE.
    guest.send({ t: 'game.action', id: 'b2', expectedSeq: 1, action: { type: 'work.endTurn', playerId: 'p2' } });
    const rej = await guest.next('game.rejected');
    expect(rej).toMatchObject({ id: 'b2', code: 'STALE' });
    expect((await guest.next('game.snapshot')).seq).toBe(2);
    // Engine rejections go only to the sender.
    guest.send({ t: 'game.action', id: 'b3', expectedSeq: 2, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    const engineRej = await guest.next('game.rejected');
    expect(engineRej.id).toBe('b3');
    expect(engineRej.code).not.toBe('STALE');
    await host.sync();
    expect(host.inbox.some((m) => m.t === 'game.rejected')).toBe(false);
  });

  it('blocks impersonation: playerId is taken from the seat', async () => {
    const s = await start();
    const { host, guest } = await startedGame(s);
    host.send({ t: 'game.action', id: 'evil', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    const applied = await guest.next('game.applied');
    expect(applied.action.playerId).toBe('p1');
    expect(applied.view.submitted).toMatchObject({ p1: true, p2: false });
    expect(applied.view.mine?.reserve ?? null).toBeNull();
    // p2 can still choose their own reserve.
    guest.send({ t: 'game.action', id: 'g1', expectedSeq: 1, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    expect((await guest.next('game.applied', (m) => m.actionId === 'g1')).seq).toBe(2);
  });

  it('is idempotent on repeated action ids', async () => {
    const s = await start();
    const { host, guest } = await startedGame(s);
    const msg = { t: 'game.action', id: 'once', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD } } as const;
    host.send(msg);
    await host.next('game.applied');
    host.send(msg);
    expect((await host.next('game.snapshot')).seq).toBe(1);
    await guest.sync();
    expect(guest.inbox.filter((m) => m.t === 'game.applied')).toHaveLength(1);
  });

  it('undo broadcasts game.undone', async () => {
    const s = await start();
    const { host, guest, hs } = await startedGame(s, { intro: true });
    const ceo = hs.view.players.p1?.structure.ceo as string;
    host.send({ t: 'game.action', id: 'p', expectedSeq: 0, action: { type: 'work.produce', playerId: 'p1', cardUid: ceo, food: 'pizza' } });
    await guest.next('game.applied');
    guest.send({ t: 'game.undo', expectedSeq: 1 });
    expect(await guest.next('game.rejected')).toMatchObject({ code: 'UNDO_UNAVAILABLE' });
    host.send({ t: 'game.undo', expectedSeq: 1 });
    const u = await guest.next('game.undone');
    expect(u).toMatchObject({ seq: 0, by: 'p1' });
    expect(u.view.players.p1?.inventory).toEqual({});
  });

  it('reconnect with token restores the seat and sends room.update + snapshot', async () => {
    const s = await start();
    const { host, guest, roomId } = await startedGame(s);
    const { token, clientId } = guest;
    await guest.close();
    const dc = await host.next('room.update', (m) => m.room.seats[1]?.connected === false);
    expect(dc.room.seats[1]?.clientId).toBe(clientId);

    const back = await connect(s, { sessionToken: token });
    const welcome = back.inbox[0] as ServerMessageOf<'welcome'>;
    expect(welcome).toMatchObject({ t: 'welcome', clientId, sessionToken: token });
    expect(welcome.room?.id).toBe(roomId);
    expect((await back.next('room.update')).room.seats[1]?.connected).toBe(true);
    const snap = await back.next('game.snapshot');
    expect(snap.me).toBe('p2');
    await host.next('room.update', (m) => m.room.seats[1]?.connected === true);

    // A bogus token gets a fresh session with no room.
    const stranger = await connect(s, { sessionToken: 'f'.repeat(32) });
    expect(stranger.token).not.toBe('f'.repeat(32));
    expect((stranger.inbox[0] as ServerMessageOf<'welcome'>).room).toBeNull();
  });

  it('host kick lets another device take over a seat mid-game', async () => {
    const s = await start();
    const { host, guest, roomId } = await startedGame(s);
    const other = await connect(s, { name: 'Cy' });
    other.send({ t: 'room.join', roomId, name: 'Cy' });
    expect((await other.next('game.snapshot')).me).toBeNull();
    host.send({ t: 'room.kick', seat: 1 });
    expect((await guest.next('game.snapshot')).me).toBeNull();
    other.send({ t: 'room.sit', seat: 1 });
    expect((await other.next('game.snapshot')).me).toBe('p2');
  });

  it('drops sockets that stop answering heartbeat pings', async () => {
    const s = await start({ heartbeatMs: 40 });
    const { default: WebSocket } = await import('ws');
    const mute = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { autoPong: false });
    const closed = new Promise<void>((res) => mute.once('close', () => res()));
    await new Promise((res) => mute.once('open', res));
    expect(s.hub.connectionCount).toBe(1);
    await closed;
    expect(s.hub.connectionCount).toBe(0);
  });

  it('relays chat to the room', async () => {
    const s = await start();
    const { host, guest } = await startedGame(s);
    guest.send({ t: 'chat', text: 'hello there' });
    const m = await host.next('chat');
    expect(m).toMatchObject({ text: 'hello there', from: { clientId: guest.clientId, name: 'Bob', seat: 1 } });
  });

  it('persists rooms and restores them after a restart', async () => {
    const dataDir = tempDir();
    const s1 = await start({ dataDir, persistDebounceMs: 10 });
    const { host, guest, roomId } = await startedGame(s1);
    host.send({ t: 'game.action', id: 'a1', expectedSeq: 0, action: { type: 'setup.chooseReserve', playerId: 'p1', card: CARD } });
    await guest.next('game.applied');
    const tokens = { host: host.token, guest: guest.token };
    await host.close();
    await guest.close();
    clients.length = 0;
    await s1.close();
    servers.length = 0;

    const file = join(dataDir, 'rooms', `${roomId}.json`);
    expect(existsSync(file)).toBe(true);
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    expect(rec).toMatchObject({ id: roomId, status: 'playing', actions: [{ type: 'setup.chooseReserve', playerId: 'p1' }] });
    expect(typeof rec.seed).toBe('number');
    expect(rec.seats[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(file, 'utf8')).not.toContain(tokens.host);

    const s2 = await start({ dataDir, persistDebounceMs: 10 });
    const g2 = await connect(s2, { sessionToken: tokens.guest });
    expect(g2.token).toBe(tokens.guest);
    const snap = await g2.next('game.snapshot');
    expect(snap).toMatchObject({ seq: 1, me: 'p2' });
    expect(snap.view.submitted).toMatchObject({ p1: true, p2: false });
    g2.send({ t: 'game.action', id: 'g1', expectedSeq: 1, action: { type: 'setup.chooseReserve', playerId: 'p2', card: CARD } });
    expect((await g2.next('game.applied')).seq).toBe(2);
    const h2 = await connect(s2, { sessionToken: tokens.host });
    const hsnap = await h2.next('game.snapshot');
    expect(hsnap.me).toBe('p1');
    expect(hsnap.view.mine?.reserve).toEqual(CARD);
  });

  it('serves the client with mime types, gzip and SPA fallback', async () => {
    const s = await start();
    const base = `http://127.0.0.1:${s.port}`;
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get('content-type')).toContain('text/html');
    const spa = await fetch(`${base}/room/ABCDE`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('<title>FCM</title>');
    const js = await fetch(`${base}/assets/app.js`, { headers: { 'accept-encoding': 'gzip' } });
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.headers.get('content-encoding')).toBe('gzip');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(await js.text()).toContain('console.log');
    expect((await fetch(`${base}/assets/logo.png`)).headers.get('content-type')).toBe('image/png');
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fetc/passwd`)).status).not.toBe(200);
  });
});
