import { describe, expect, it } from 'vitest';
import { HOST_TRANSFER_MS, Room } from '../src/index.js';

function lobby(n = 3, now = { t: 1000 }) {
  const room = new Room({ id: 'ABCDE', hostClientId: 'c0', config: { seatCount: 4 }, now: () => now.t });
  for (let i = 0; i < n; i++) room.join(`c${i}`, `P${i}`);
  return { room, now };
}

describe('Room', () => {
  it('seats, stands and readies members', () => {
    const { room } = lobby();
    expect(room.sit('c0', 0).ok).toBe(true);
    expect(room.sit('c1', 0)).toMatchObject({ ok: false, code: 'SEAT_TAKEN' });
    expect(room.sit('c1', 9)).toMatchObject({ ok: false });
    expect(room.sit('c1', 2).ok).toBe(true);
    expect(room.setReady('c2', true)).toMatchObject({ ok: false, code: 'NOT_SEATED' });
    expect(room.setReady('c1', true).ok).toBe(true);
    // Moving seats clears ready.
    expect(room.sit('c1', 1).ok).toBe(true);
    expect(room.seats[1]).toMatchObject({ clientId: 'c1', name: 'P1', ready: false });
    expect(room.seats[2]?.clientId).toBeNull();
    expect(room.stand('c1').ok).toBe(true);
    expect(room.seatOf('c1')).toBeUndefined();
    const info = room.info();
    expect(info.seats).toHaveLength(4);
    expect(info.spectators.map((s) => s.clientId).sort()).toEqual(['c1', 'c2']);
  });

  it('enforces host-only config, kick and start', () => {
    const { room } = lobby();
    expect(room.patchConfig('c1', { intro: true })).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(room.kick('c1', 0)).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(room.start('c1', () => 1)).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(room.patchConfig('c0', { intro: true }).ok).toBe(true);
    expect(room.config.intro).toBe(true);
    expect(room.patchConfig('c0', { seatCount: 9 })).toMatchObject({ ok: false, code: 'BAD_MESSAGE' });
  });

  it('config patch shrinking seats unseats players and resets ready', () => {
    const { room } = lobby();
    room.sit('c0', 0);
    room.sit('c1', 3);
    room.setReady('c0', true);
    expect(room.patchConfig('c0', { seatCount: 2 }).ok).toBe(true);
    expect(room.seats).toHaveLength(2);
    expect(room.seatOf('c1')).toBeUndefined();
    expect(room.seats[0]?.ready).toBe(false);
    room.patchConfig('c0', { seatCount: 5 });
    expect(room.seats.map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('validates start: 2–6 seated, all ready; compacts seats', () => {
    const { room } = lobby();
    room.sit('c0', 1);
    room.setReady('c0', true);
    expect(room.start('c0', () => 1)).toMatchObject({ ok: false, code: 'CANNOT_START' });
    room.sit('c1', 3);
    expect(room.start('c0', () => 1)).toMatchObject({ ok: false, code: 'CANNOT_START' });
    room.setReady('c1', true);
    let config: unknown;
    const r = room.start('c0', (c) => ((config = c), 'game'));
    expect(r).toEqual({ ok: true, value: 'game' });
    expect(room.status).toBe('playing');
    expect(room.seats.map((s) => [s.index, s.playerId, s.clientId])).toEqual([
      [0, 'p1', 'c0'],
      [1, 'p2', 'c1'],
    ]);
    expect(config).toMatchObject({ players: [{ id: 'p1', name: 'P0' }, { id: 'p2', name: 'P1' }], map: { kind: 'random' } });
    expect(room.viewerOf('c0')).toBe('p1');
    expect(room.viewerOf('c2')).toBe('spectator');
  });

  it('does not commit start when the engine throws', () => {
    const { room } = lobby(2);
    room.sit('c0', 0);
    room.sit('c1', 1);
    room.setReady('c0', true);
    room.setReady('c1', true);
    const r = room.start('c0', () => {
      throw new Error('boom');
    });
    expect(r).toMatchObject({ ok: false, code: 'CANNOT_START' });
    expect(room.status).toBe('lobby');
    expect(room.seats).toHaveLength(4);
  });

  it('transfers host after 60 s disconnected, preferring seated players', () => {
    const { room, now } = lobby(3);
    room.sit('c2', 0);
    room.setConnected('c0', false);
    now.t += HOST_TRANSFER_MS - 1;
    expect(room.tick()).toBe(false);
    expect(room.hostClientId).toBe('c0');
    now.t += 2;
    expect(room.tick()).toBe(true);
    expect(room.hostClientId).toBe('c2');
  });

  it('host reconnecting within 60 s stays host', () => {
    const { room, now } = lobby(2);
    room.setConnected('c0', false);
    now.t += 30_000;
    room.setConnected('c0', true);
    now.t += 60_000;
    expect(room.tick()).toBe(false);
    expect(room.hostClientId).toBe('c0');
  });

  it('host leaving passes host immediately', () => {
    const { room } = lobby(2);
    room.leave('c0');
    expect(room.hostClientId).toBe('c1');
  });

  it('leave frees a lobby seat but reserves it while playing; kick enables takeover', () => {
    const { room } = lobby(3);
    room.sit('c0', 0);
    room.sit('c1', 1);
    room.setReady('c0', true);
    room.setReady('c1', true);
    room.start('c0', () => null);
    room.leave('c1');
    expect(room.seats[1]?.clientId).toBe('c1');
    expect(room.info().seats[1]?.connected).toBe(false);
    // Re-joining re-attaches the reserved seat.
    room.join('c1', 'P1 again');
    expect(room.viewerOf('c1')).toBe('p2');
    // Kick, then another member takes over the seat mid-game.
    expect(room.sit('c2', 1)).toMatchObject({ ok: false, code: 'SEAT_TAKEN' });
    expect(room.kick('c0', 1).ok).toBe(true);
    expect(room.viewerOf('c1')).toBe('spectator');
    expect(room.sit('c2', 1).ok).toBe(true);
    expect(room.viewerOf('c2')).toBe('p2');
    expect(room.seats[1]?.name).toBe('P1');
  });

  it('spectators cannot sit; lobby audience is all spectators', () => {
    const { room } = lobby(1);
    room.join('s', 'Watcher', true);
    expect(room.sit('s', 0).ok).toBe(false);
    expect(room.audience()).toEqual([
      { clientId: 'c0', viewer: 'spectator' },
      { clientId: 's', viewer: 'spectator' },
    ]);
  });

  it('round-trips through snapshot/restore', () => {
    const { room } = lobby(2);
    room.sit('c0', 0);
    room.sit('c1', 1);
    const copy = Room.restore(room.snapshot());
    expect(copy.seats.map((s) => s.clientId)).toEqual(['c0', 'c1', null, null]);
    expect(copy.members.get('c1')?.connected).toBe(false);
    expect(copy.hostClientId).toBe('c0');
  });
});
