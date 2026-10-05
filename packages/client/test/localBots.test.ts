/** Hot-seat bots in LocalTransport: bots move by themselves, handoffs only go to humans, undo rewinds bot replies. */
import { describe, expect, it } from 'vitest';
import type { GameConfig, GameView } from '@fcm/engine';
import { engine } from '@fcm/engine';
import { runBot } from '@fcm/ai';
import type { ServerMessage } from '@fcm/protocol';
import { LocalTransport } from '../src/net/localTransport.js';
import { inlineBotRunner } from '../src/net/botRunner.js';

function config(n: number): GameConfig {
  return {
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, chain: 'gluttony_inc' as const, color: '#000' })),
    modules: [],
    options: {},
    intro: false,
    introMilestones: false,
    map: { kind: 'random' },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(bots: Record<string, 'easy' | 'medium' | 'hard'>, players = 3, seed = 5) {
  const t = new LocalTransport({ engine, config: config(players), seed, handoff: true, bots, botRunner: inlineBotRunner(), botDelay: 0 });
  const msgs: ServerMessage[] = [];
  const handoffs: string[] = [];
  let view: GameView | null = null;
  let seq = 0;
  t.onMessage((m) => {
    msgs.push(m);
    if (m.t === 'game.snapshot' || m.t === 'game.applied' || m.t === 'game.undone') {
      view = m.view;
      seq = m.seq;
    }
  });
  t.onHandoff((to) => {
    handoffs.push(to);
    t.acceptHandoff(to);
  });
  t.connect();
  let n = 0;
  /** One human step (as the current viewer) once the bots have settled. Returns false when nothing to do. */
  const step = async () => {
    for (let i = 0; i < 50 && t.thinking; i++) await flush();
    await flush();
    const v = view as GameView | null;
    if (!v || v.phase.kind === 'gameOver' || t.viewer === 'spectator' || !v.awaiting.players.includes(t.viewer)) return false;
    const action = runBot({ level: 'easy', view: v, playerId: t.viewer, seed: n, budgetMs: 10 });
    t.send({ t: 'game.action', id: `a${n++}`, expectedSeq: seq, action });
    await flush();
    return true;
  };
  return { t, msgs, handoffs, step, view: () => view as GameView | null, seq: () => seq };
}

describe('LocalTransport bots', () => {
  it('one human and two bots: bots move by themselves; no handoff screens to bots', async () => {
    const h = harness({ p2: 'easy', p3: 'medium' });
    for (let i = 0; i < 300 && (h.view()?.round ?? 0) < 3; i++) if (!(await h.step())) await flush();
    expect(h.view()?.round).toBeGreaterThanOrEqual(3);
    expect(h.t.viewer).toBe('p1');
    expect(h.handoffs.every((p) => p === 'p1')).toBe(true);
    const botMoves = h.msgs.filter((m) => m.t === 'game.applied' && m.action.playerId !== 'p1');
    expect(botMoves.length).toBeGreaterThan(10);
    expect(h.msgs.some((m) => m.t === 'game.rejected' || m.t === 'error')).toBe(false);
  });

  it('the device holder cannot act for a bot seat', async () => {
    const h = harness({ p2: 'easy' }, 2);
    await flush();
    h.t.setViewer('p2');
    h.t.send({ t: 'game.action', id: 'x', expectedSeq: h.seq(), action: { type: 'setup.pass', playerId: 'p2' } });
    await flush();
    expect(h.msgs.some((m) => m.t === 'game.rejected' && m.code === 'NOT_SEATED')).toBe(true);
  });

  it('undo rewinds bot replies made after the human move; the bots decide again', async () => {
    // Bots answer restructuring requests only when the test releases them.
    const held: (() => void)[] = [];
    const runner = {
      run: (req: Parameters<typeof runBot>[0]) => {
        const a = runBot(req);
        if (req.view.phase.kind !== 'restructuring') return Promise.resolve(a);
        return new Promise<typeof a>((res) => held.push(() => res(a)));
      },
    };
    const t = new LocalTransport({ engine, config: config(3), seed: 5, handoff: true, bots: { p2: 'easy', p3: 'easy' }, botRunner: runner, botDelay: 0 });
    let view: GameView | null = null;
    let seq = 0;
    const msgs: ServerMessage[] = [];
    t.onMessage((m) => {
      msgs.push(m);
      if (m.t === 'game.snapshot' || m.t === 'game.applied' || m.t === 'game.undone') {
        view = m.view;
        seq = m.seq;
      }
    });
    t.onHandoff((to) => t.acceptHandoff(to));
    t.connect();
    const v = () => view as GameView | null;
    for (let i = 0; i < 300 && !(v()?.phase.kind === 'restructuring' && held.length); i++) {
      await flush();
      const cur = v();
      if (!cur || !cur.awaiting.players.includes('p1') || t.viewer !== 'p1') continue;
      t.send({ t: 'game.action', id: `s${i}`, expectedSeq: seq, action: runBot({ level: 'easy', view: cur, playerId: 'p1', seed: i, budgetMs: 10 }) });
    }
    expect(v()?.phase.kind).toBe('restructuring');
    // p1 submits while p2 is thinking; p2's answer is stale and it thinks again; then it submits.
    const start = seq;
    const first = t.thinking;
    expect(first).not.toBeNull();
    t.send({ t: 'game.action', id: 'mine', expectedSeq: seq, action: runBot({ level: 'easy', view: v() as GameView, playerId: 'p1', seed: 1, budgetMs: 10 }) });
    await flush();
    expect(seq).toBe(start + 1);
    held.shift()?.();
    await flush();
    expect(seq).toBe(start + 1);
    held.shift()?.();
    await flush();
    expect(seq).toBe(start + 2); // the first bot answered; the other one is thinking
    expect(t.thinking).not.toBe(first);
    expect(t.thinking).not.toBeNull();
    t.send({ t: 'game.undo', expectedSeq: seq });
    await flush();
    expect(msgs.filter((m) => m.t === 'game.undone')).toHaveLength(1);
    expect(seq).toBe(start);
    expect(t.viewer).toBe('p1');
    // The bots start over: the old request is cancelled and the first bot is asked again.
    expect(t.thinking).toBe(first);
    held.splice(0).forEach((r) => r());
    await flush();
    expect(seq).toBe(start + 1);
    const last = msgs.filter((m) => m.t === 'game.applied').pop();
    expect(last?.t === 'game.applied' && last.action.playerId).toBe(first);
  });
});
