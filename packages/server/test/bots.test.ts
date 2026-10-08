/** Bot seats over the wire (real engine): lobby, play with delay, worker threads, persistence and restore. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { engine, type GameView } from '@fcm/engine';
import { runBot } from '@fcm/ai';
import type { RunningServer } from '../src/server.js';
import { boot, tempDir, TestClient } from './helpers.js';

const servers: RunningServer[] = [];
const clients: TestClient[] = [];

async function start(opts: Parameters<typeof boot>[0] = {}) {
  const s = await boot({ engine, botRunner: 'inline', botDelay: 0, ...opts });
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Latest game state a client has received. */
function latest(c: TestClient): { seq: number; view: GameView } | null {
  for (let i = c.inbox.length - 1; i >= 0; i--) {
    const m = c.inbox[i];
    if (m && (m.t === 'game.snapshot' || m.t === 'game.applied' || m.t === 'game.undone')) return { seq: m.seq, view: m.view };
  }
  return null;
}

/** Play `me` (with the Easy bot's brain) whenever awaited, until `until(view)`. */
async function playHuman(c: TestClient, me: string, until: (v: GameView) => boolean, timeoutMs = 30_000): Promise<GameView> {
  const t0 = Date.now();
  let sentFor = -1;
  while (Date.now() - t0 < timeoutMs) {
    const l = latest(c);
    if (l && until(l.view)) return l.view;
    if (l && sentFor !== l.seq && l.view.phase.kind !== 'gameOver' && l.view.awaiting.players.includes(me)) {
      const action = runBot({ level: 'easy', view: l.view, playerId: me, seed: l.seq + 7, budgetMs: 50 });
      c.send({ t: 'game.action', id: `h${l.seq}`, expectedSeq: l.seq, action });
      sentFor = l.seq;
    }
    await sleep(3);
  }
  const l = latest(c);
  throw new Error(`timeout: seq ${l?.seq} ${l?.view.phase.kind} awaiting ${l?.view.awaiting.players.join(',')}`);
}

/** Host in seat 0 (ready) + bots in seats 1 and 2; game started. */
async function hostWithBots(s: RunningServer) {
  const host = await connect(s, { name: 'Ann' });
  host.send({ t: 'room.create', name: 'Ann', config: { seatCount: 3 } });
  const { room } = await host.next('room.update');
  host.send({ t: 'room.sit', seat: 0 });
  host.send({ t: 'room.ready', ready: true });
  host.send({ t: 'room.addBot', seat: 1, level: 'easy' });
  host.send({ t: 'room.addBot', seat: 2, level: 'hard' });
  const ready = await host.next('room.update', (m) => m.room.seats.every((x) => x.ready));
  host.send({ t: 'room.start' });
  await host.next('game.snapshot');
  return { host, roomId: room.id, seats: ready.room.seats };
}

describe('bots over the wire', () => {
  it('host adds and removes bots in the lobby; bot seats are ready and connected; guests cannot', async () => {
    const s = await start();
    const host = await connect(s, { name: 'Ann' });
    host.send({ t: 'room.create', name: 'Ann', config: { seatCount: 3 } });
    const { room } = await host.next('room.update');
    const guest = await connect(s, { name: 'Bob' });
    guest.send({ t: 'room.join', roomId: room.id, name: 'Bob' });
    await guest.next('room.update');
    guest.send({ t: 'room.addBot', seat: 1, level: 'easy' });
    expect(await guest.next('error')).toMatchObject({ code: 'NOT_HOST', ref: 'room.addBot' });
    host.send({ t: 'room.addBot', seat: 1, level: 'medium' });
    const up = await guest.next('room.update', (m) => m.room.seats[1]?.bot === 'medium');
    expect(up.room.seats[1]).toMatchObject({ bot: 'medium', ready: true, connected: true, clientId: null });
    guest.send({ t: 'room.sit', seat: 1 });
    expect(await guest.next('error')).toMatchObject({ code: 'SEAT_TAKEN' });
    host.send({ t: 'room.removeBot', seat: 1 });
    await guest.next('room.update', (m) => m.room.seats[1]?.bot === null);
    host.send({ t: 'room.addBot', seat: 7, level: 'easy' });
    expect(await host.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    host.send({ t: 'room.addBot', seat: 1, level: 'expert' });
    expect(await host.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
  });

  it('a human plays two rounds against two bots; bot moves wait for the delay and reach everyone', async () => {
    const s = await start({ botDelay: { min: 40, max: 60 } });
    const { host, seats } = await hostWithBots(s);
    expect(seats.map((x) => x.bot)).toEqual([null, 'easy', 'hard']);
    const t0 = Date.now();
    await playHuman(host, 'p1', (v) => v.round >= 3, 60_000);
    const applied = host.inbox.filter((m) => m.t === 'game.applied');
    const byBots = applied.filter((m) => m.t === 'game.applied' && m.action.playerId !== 'p1');
    expect(byBots.length).toBeGreaterThan(10);
    expect(byBots.every((m) => m.t === 'game.applied' && m.actionId === null)).toBe(true);
    // Every bot move costs at least the minimum delay.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(byBots.length * 35);
    expect(host.inbox.some((m) => m.t === 'game.rejected')).toBe(false);
  }, 90_000);

  it('bot seats are persisted; a restored game keeps its bots and they carry on', async () => {
    const dataDir = tempDir();
    const s1 = await start({ dataDir, persistDebounceMs: 5 });
    const { host, roomId } = await hostWithBots(s1);
    await playHuman(host, 'p1', (v) => v.round >= 1);
    const token = host.token;
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await s1.close();
    servers.length = 0;

    const rec = JSON.parse(readFileSync(join(dataDir, 'rooms', `${roomId}.json`), 'utf8'));
    expect(rec.seats.map((x: { bot: string | null }) => x.bot)).toEqual([null, 'easy', 'hard']);

    const s2 = await start({ dataDir, persistDebounceMs: 5 });
    const h2 = await connect(s2, { sessionToken: token });
    const welcome = h2.inbox.find((m) => m.t === 'welcome');
    expect(welcome?.t === 'welcome' && welcome.room?.seats.map((x) => [x.bot, x.connected])).toEqual([
      [null, true],
      ['easy', true],
      ['hard', true],
    ]);
    await playHuman(h2, 'p1', (v) => v.round >= 2);
  }, 60_000);

  it('bots wait while nobody is connected and resume when the host returns', async () => {
    const s = await start({ botDelay: 20 });
    const { host, roomId } = await hostWithBots(s);
    // Leave during a bot's working turn, so the bots have moves to make.
    await playHuman(host, 'p1', (v) => v.phase.kind === 'working' && !v.awaiting.players.includes('p1'));
    const token = host.token;
    await host.close();
    const entry = s.hub.store.get(roomId);
    if (!entry?.game || !entry.bots) throw new Error('no game');
    // A move already in flight may still land; after that nothing moves.
    await entry.bots.whenIdle();
    const seq = entry.game.seq;
    await sleep(150);
    expect(entry.game.seq).toBe(seq);
    expect(entry.game.awaitedBot()).not.toBeNull();
    const h2 = await connect(s, { sessionToken: token });
    await playHuman(h2, 'p1', (v) => v.round >= 2);
  }, 60_000);

  it('computes bot moves in worker threads by default', async () => {
    const s = await start({ botRunner: 'worker', botWorkers: 1 });
    const { host } = await hostWithBots(s);
    await playHuman(host, 'p1', (v) => v.round >= 1, 60_000);
    expect(host.inbox.some((m) => m.t === 'game.applied' && m.action.playerId === 'p2')).toBe(true);
  }, 90_000);
});
