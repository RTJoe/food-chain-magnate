/** Bot seats: lobby rules, the bot driver (delay, staleness, fallback), persistence/restore and undo. */
import { describe, expect, it } from 'vitest';
import type { Action, GameConfig, PlayerId } from '@fcm/engine';
import { engine } from '@fcm/engine';
import { decisionSeed, runBot, type BotLevel } from '@fcm/ai';
import { BotDriver, GameSession, Room, type BotRunner, type Outbound, type Timers } from '../src/index.js';

function lobby() {
  const room = new Room({ id: 'ABCDE', hostClientId: 'h' });
  room.join('h', 'Hana');
  room.join('g', 'Gus');
  return room;
}

function config(n = 3): GameConfig {
  return {
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, chain: 'gluttony_inc' as const, color: '#000' })),
    modules: [],
    options: {},
    intro: false,
    introMilestones: false,
    map: { kind: 'random' },
  };
}

const AUDIENCE = [{ clientId: 'h', viewer: 'p1' }];

/** Humans (seats without a bot; driven by this test with the Easy bot's brain) and bot seats (default p2, p3). */
function setup(opts: { seed?: number; actions?: Action[]; runner?: BotRunner; delay?: number; timers?: Timers; bots?: Record<PlayerId, BotLevel> } = {}) {
  const bots: Record<PlayerId, BotLevel> = opts.bots ?? { p2: 'easy', p3: 'hard' };
  const game = new GameSession({ engine, config: config(), seed: opts.seed ?? 7, bots, ...(opts.actions ? { actions: opts.actions } : {}) });
  const delivered: Outbound[][] = [];
  const logs: string[] = [];
  const driver = new BotDriver(game, {
    ...(opts.runner ? { runner: opts.runner } : {}),
    delay: opts.delay ?? 0,
    deliver: (out) => delivered.push(out),
    audience: () => AUDIENCE,
    log: (m) => logs.push(m),
    ...(opts.timers ? { timers: opts.timers } : {}),
  });
  let n = 0;
  const human = async () => {
    driver.poke();
    await driver.whenIdle();
    const who = game.rawState.awaiting.players.find((p) => !bots[p]);
    if (game.isOver || !who) return false;
    const action = runBot({ level: 'easy', view: game.view(who), playerId: who, seed: decisionSeed(1, game.seq, who), budgetMs: 100 });
    const out = game.submitAction(who, 'h', { id: `a${n++}`, expectedSeq: game.seq, action }, AUDIENCE);
    expect(out.some((o) => o.msg.t === 'game.applied'), JSON.stringify(out[0]?.msg)).toBe(true);
    return true;
  };
  return { game, driver, delivered, logs, human };
}

describe('Room: bot seats', () => {
  it('host adds bots to empty lobby seats; they are ready and connected; others cannot', () => {
    const room = lobby();
    expect(room.addBot('g', 1, 'easy')).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(room.sit('g', 0).ok).toBe(true);
    expect(room.addBot('h', 0, 'easy')).toMatchObject({ ok: false, code: 'SEAT_TAKEN' });
    expect(room.addBot('h', 1, 'easy').ok).toBe(true);
    expect(room.addBot('h', 2, 'hard').ok).toBe(true);
    const seats = room.info().seats;
    expect(seats[1]).toMatchObject({ bot: 'easy', ready: true, connected: true, clientId: null });
    expect(seats[1]?.name).toMatch(/^Robo /);
    expect(seats[2]?.name).not.toBe(seats[1]?.name);
    // Changing a bot's level keeps its name.
    const name = seats[1]?.name;
    expect(room.addBot('h', 1, 'medium').ok).toBe(true);
    expect(room.info().seats[1]).toMatchObject({ bot: 'medium', name });
    expect(room.sit('h', 1)).toMatchObject({ ok: false, code: 'SEAT_TAKEN' });
  });

  it('remove / kick empties a bot seat in the lobby; seat-count shrink drops bots', () => {
    const room = lobby();
    room.addBot('h', 1, 'easy');
    room.addBot('h', 3, 'easy');
    expect(room.removeBot('g', 1)).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(room.removeBot('h', 1).ok).toBe(true);
    expect(room.info().seats[1]).toMatchObject({ bot: null, name: null, ready: false });
    expect(room.removeBot('h', 1)).toMatchObject({ ok: false });
    room.addBot('h', 1, 'easy');
    expect(room.kick('h', 1).ok).toBe(true);
    expect(room.info().seats[1]?.bot).toBeNull();
    expect(room.patchConfig('h', { seatCount: 3 }).ok).toBe(true);
    expect(room.seats.some((s) => s.bot)).toBe(false);
  });

  it('bots count towards the start; seats compact to p1..pN with their levels; locked once playing', () => {
    const room = lobby();
    room.addBot('h', 0, 'hard');
    room.sit('h', 2);
    expect(room.startProblem('h')?.message).toMatch(/ready/);
    room.setReady('h', true);
    room.addBot('h', 3, 'easy');
    const r = room.start('h', (cfg) => cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(room.bots()).toEqual({ p1: 'hard', p3: 'easy' });
    expect(room.addBot('h', 1, 'easy')).toMatchObject({ ok: false, code: 'CANNOT_START' });
    expect(room.kick('h', 0)).toMatchObject({ ok: false });
    expect(room.sit('g', 0)).toMatchObject({ ok: false, code: 'SEAT_TAKEN' });
    // Persistence keeps bot seats.
    const restored = Room.restore(JSON.parse(JSON.stringify(room.snapshot())));
    expect(restored.bots()).toEqual({ p1: 'hard', p3: 'easy' });
    expect(restored.info().seats[0]).toMatchObject({ connected: true, bot: 'hard' });
  });

  it('restores old snapshots without the bot field', () => {
    const room = lobby();
    const snap = room.snapshot();
    for (const s of snap.seats) delete (s as { bot?: unknown }).bot;
    expect(Room.restore(snap).seats.every((s) => s.bot === null)).toBe(true);
  });
});

describe('BotDriver', () => {
  it('bots play their seats; a human and two bots get through several rounds with no fallbacks', async () => {
    const { game, delivered, logs, human } = setup();
    for (let i = 0; i < 400 && game.rawState.round < 4; i++) if (!(await human())) break;
    expect(game.rawState.round).toBeGreaterThanOrEqual(4);
    const byBots = game.actions.filter((a) => a.playerId !== 'p1');
    expect(byBots.length).toBeGreaterThan(20);
    expect(delivered.length).toBe(byBots.length);
    expect(delivered.flat().every((o) => o.msg.t === 'game.applied' && o.msg.actionId === null)).toBe(true);
    expect(logs).toEqual([]);
  });

  it('a simultaneous decision racing a bot reply is applied, not bounced as STALE', async () => {
    const { game, driver } = setup();
    for (let i = 0; i < 20; i++) {
      driver.poke();
      await driver.whenIdle(); // in setup.reserve: the bots chose their cards
      if (game.rawState.phase.kind === 'setup.reserve') break;
      const action = runBot({ level: 'easy', view: game.view('p1'), playerId: 'p1', seed: i, budgetMs: 10 });
      game.submitAction('p1', 'h', { id: `p${i}`, expectedSeq: game.seq, action }, AUDIENCE);
    }
    expect(game.rawState.awaiting.players).toEqual(['p1']);
    const seen = game.seq - 2; // the human's view from before the bots answered
    const action = runBot({ level: 'easy', view: game.view('p1'), playerId: 'p1', seed: 1, budgetMs: 10 });
    const out = game.submitAction('p1', 'h', { id: 'race', expectedSeq: seen, action }, AUDIENCE);
    expect(out[0]?.msg.t).toBe('game.applied');
    // Not for moves in turn order: those still need the latest seq.
    const stale = game.submitAction('p1', 'h', { id: 'old', expectedSeq: seen, action: { type: 'work.endTurn', playerId: 'p1' } }, AUDIENCE);
    expect(stale[0]?.msg).toMatchObject({ code: 'STALE' });
  });

  it('humans cannot act for a bot seat', () => {
    const { game } = setup();
    const out = game.submitAction('p2', 'x', { id: '1', expectedSeq: game.seq, action: { type: 'setup.pass', playerId: 'p2' } }, AUDIENCE);
    expect(out[0]?.msg).toMatchObject({ t: 'game.rejected', code: 'NOT_SEATED' });
  });

  it('waits the configured delay before moving', async () => {
    const pending: { fn: () => void; ms: number }[] = [];
    const timers: Timers = { set: (fn, ms) => pending.push({ fn, ms }), clear: () => {} };
    // Seed 7: setup goes in reverse turn order; find a seed where a bot places first.
    let seed = 1;
    while (new GameSession({ engine, config: config(), seed }).rawState.awaiting.players[0] === 'p1') seed++;
    const { game, driver } = setup({ seed, delay: 650, timers });
    driver.poke();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.ms).toBe(650);
    expect(driver.thinking).not.toBeNull();
    expect(game.seq).toBe(0);
    pending.shift()?.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(game.seq).toBe(1);
    // The next bot move waits for its own delay again.
    expect(pending.every((p) => p.ms === 650)).toBe(true);
    driver.dispose();
  });

  it('only a turn\'s first move gets the full delay; follow-ups are short and forced moves instant', async () => {
    // Reach a later Working turn of the Easy bot (several moves) with no delay, then replay it with a 650 ms delay.
    const fast = setup({ seed: 3 });
    while (!(fast.game.rawState.phase.kind === 'working' && fast.game.rawState.round >= 3 && fast.game.awaitedBot() === 'p2')) {
      if (!(await fast.human())) throw new Error('game ended before a bot worked');
    }
    fast.driver.dispose();
    const pending: { fn: () => void; ms: number }[] = [];
    const timers: Timers = { set: (fn, ms) => pending.push({ fn, ms }), clear: () => {} };
    const { game, driver } = setup({ seed: 3, actions: fast.game.actions, delay: 650, timers });
    const bot = game.awaitedBot() as PlayerId;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    driver.poke();
    expect(pending.map((p) => p.ms)).toEqual([650]);
    let followUps = 0;
    for (let i = 0; i < 40 && game.awaitedBot() === bot && game.rawState.phase.kind === 'working'; i++) {
      const seq = game.seq;
      pending.shift()?.fn();
      await tick();
      if (game.seq === seq) await tick();
      if (game.awaitedBot() !== bot || game.rawState.phase.kind !== 'working') break;
      if (game.forcedMove(bot)) {
        expect(pending).toEqual([]); // no wait: it lands as soon as the answer does
        await tick();
      } else {
        expect(pending.map((p) => p.ms)).toEqual([150]);
        followUps++;
      }
    }
    expect(followUps).toBeGreaterThan(0);
    driver.dispose();
  });

  it('thinks during the delay: the move lands after whichever of the two takes longer', async () => {
    const pending: { fn: () => void; ms: number }[] = [];
    const timers: Timers = { set: (fn, ms) => pending.push({ fn, ms }), clear: () => {} };
    let seed = 1;
    while (new GameSession({ engine, config: config(), seed }).rawState.awaiting.players[0] === 'p1') seed++;
    const requests: { budgetMs: number; level: BotLevel }[] = [];
    let release: (() => void) | null = null;
    const runner: BotRunner = (req) => {
      requests.push({ budgetMs: req.budgetMs, level: req.level });
      const a = runBot(req);
      return requests.length === 1 ? new Promise((res) => (release = () => res(a))) : Promise.resolve(a);
    };
    const { game, driver } = setup({ seed, delay: 650, timers, runner, bots: { p2: 'hard', p3: 'hard' } });
    driver.poke();
    // Asked at once, with the per-level budget, while the delay runs.
    expect(requests).toEqual([{ budgetMs: 2000, level: 'hard' }]);
    pending.shift()?.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(game.seq).toBe(0); // delay over, still thinking
    (release as (() => void) | null)?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(game.seq).toBe(1); // lands as soon as the answer arrives, no second wait
    // Next move: the answer is instant, so it waits for the delay.
    expect(requests.length).toBe(2);
    expect(game.seq).toBe(1);
    pending.shift()?.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(game.seq).toBe(2);
    driver.dispose();
  });

  it('a failing or illegal bot is replaced by the safe fallback; the game never stalls', async () => {
    let calls = 0;
    const runner: BotRunner = async (req) => {
      calls++;
      if (calls % 2) throw new Error('boom');
      return { type: 'work.endTurn', playerId: req.playerId } as Action; // usually illegal
    };
    const { game, logs, human } = setup({ runner });
    for (let i = 0; i < 300 && game.rawState.round < 3; i++) if (!(await human())) break;
    expect(game.rawState.round).toBeGreaterThanOrEqual(3);
    expect(logs.some((l) => /failed to decide: boom/.test(l))).toBe(true);
    expect(logs.some((l) => /fell back/.test(l))).toBe(true);
  });

  it('discards a move computed for an older seq and thinks again', async () => {
    let held: (() => void) | null = null;
    let reserveCalls = 0;
    const runner: BotRunner = (req) => {
      const a = runBot(req);
      if (req.view.phase.kind !== 'setup.reserve') return Promise.resolve(a);
      reserveCalls++;
      if (reserveCalls > 1) return Promise.resolve(a);
      return new Promise((res) => (held = () => res(a)));
    };
    const { game, driver } = setup({ runner });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    // Setup with the human placing when asked, until a bot is thinking about its reserve card.
    for (let i = 0; i < 50 && !held; i++) {
      driver.poke();
      await flush();
      if (held || !game.rawState.awaiting.players.includes('p1')) continue;
      const action = runBot({ level: 'easy', view: game.view('p1'), playerId: 'p1', seed: i, budgetMs: 10 });
      game.submitAction('p1', 'h', { id: `s${i}`, expectedSeq: game.seq, action }, AUDIENCE);
    }
    expect(held).not.toBeNull();
    expect(game.rawState.phase.kind).toBe('setup.reserve');
    // The human chooses while the bot is still thinking: the bot's answer is now stale.
    const seq = game.seq;
    const mine = runBot({ level: 'easy', view: game.view('p1'), playerId: 'p1', seed: 9, budgetMs: 10 });
    game.submitAction('p1', 'h', { id: 'race', expectedSeq: seq, action: mine }, AUDIENCE);
    expect(game.seq).toBe(seq + 1);
    (held as unknown as () => void)();
    await driver.whenIdle();
    expect(reserveCalls).toBeGreaterThanOrEqual(3); // the stale answer was re-thought; then the other bot
    expect(game.rawState.phase.kind).not.toBe('setup.reserve');
  });

  it('restores from a persisted log with the same bots and carries on', async () => {
    const a = setup();
    for (let i = 0; i < 200 && a.game.rawState.round < 2; i++) if (!(await a.human())) break;
    const b = setup({ actions: a.game.actions });
    expect(b.game.rawState).toEqual(a.game.rawState);
    expect(b.game.bots).toEqual({ p2: 'easy', p3: 'hard' });
    for (let i = 0; i < 200 && b.game.rawState.round < 3; i++) if (!(await b.human())) break;
    expect(b.game.rawState.round).toBeGreaterThanOrEqual(3);
  });

  it('undo is never blocked by bot replies: bot moves after the undone action are dropped and replayed', async () => {
    // p1 and p3 are human, p2 a bot. In a simultaneous phase p1 submits, the bot answers at once,
    // p3 is still thinking: p1 can still undo, and the bot decides again.
    const { game, driver, human } = setup({ seed: 3, bots: { p2: 'easy' } });
    let undone = 0;
    for (let i = 0; i < 800 && undone < 2 && !game.isOver; i++) {
      const st = game.rawState;
      const simultaneous = ['restructuring', 'setup.reserve', 'payday'].includes(st.phase.kind);
      if (simultaneous && ['p1', 'p2', 'p3'].every((p) => st.awaiting.players.includes(p))) {
        const action = runBot({ level: 'easy', view: game.view('p1'), playerId: 'p1', seed: i, budgetMs: 10 });
        game.submitAction('p1', 'h', { id: `u${i}`, expectedSeq: game.seq, action }, AUDIENCE);
        driver.poke();
        await driver.whenIdle();
        const last = game.actions[game.actions.length - 1];
        if (last?.playerId === 'p2' && game.canUndo('p1')) {
          const before = game.seq;
          const out = game.requestUndo('p1', 'h', game.seq, AUDIENCE);
          expect(out[0]?.msg.t, JSON.stringify(out[0]?.msg)).toBe('game.undone');
          expect(game.seq).toBe(before - 2); // p1's move and the bot's reply
          expect(game.rawState.awaiting.players).toContain('p2');
          driver.poke();
          await driver.whenIdle();
          expect(game.seq).toBe(before - 1); // the bot answered again
          undone++;
        }
        continue;
      }
      if (!(await human())) break;
    }
    expect(undone).toBeGreaterThan(0);
  });
});
