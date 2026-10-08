/** Hot-seat save and resume (P6): config + seed + actions rebuild the same game, and the store gets the replayed round's results back. */
import { describe, expect, it, vi } from 'vitest';
import type { GameConfig, GameView } from '@fcm/engine';
import { engine, RULES_VERSION } from '@fcm/engine';
import { runBot } from '@fcm/ai';
import { LocalTransport } from '../src/net/localTransport.js';
import { inlineBotRunner } from '../src/net/botRunner.js';
import { log, restoreHistory, summaries } from '../src/state/store.js';

const config: GameConfig = {
  players: [1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, chain: 'gluttony_inc' as const, color: '#000' })),
  modules: [],
  options: {},
  intro: false,
  introMilestones: false,
  map: { kind: 'random' },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('hot-seat resume', () => {
  it('replays the saved actions into the same state and hands back the replayed results', async () => {
    let changes = 0;
    const t = new LocalTransport({ engine, config, seed: 11, handoff: true, bots: { p2: 'easy', p3: 'easy' }, botRunner: inlineBotRunner(), botDelay: 0, onChange: () => changes++ });
    let view: GameView | null = null;
    let seq = 0;
    t.onMessage((m) => {
      if (m.t === 'game.snapshot' || m.t === 'game.applied') {
        view = m.view;
        seq = m.seq;
      }
    });
    t.onHandoff((to) => t.acceptHandoff(to));
    t.connect();
    for (let n = 0; n < 400 && ((view as GameView | null)?.round ?? 0) < 3; n++) {
      for (let i = 0; i < 50 && t.thinking; i++) await flush();
      await flush();
      const v = view as GameView | null;
      if (!v || t.viewer === 'spectator' || !v.awaiting.players.includes(t.viewer)) continue;
      t.send({ t: 'game.action', id: `a${n}`, expectedSeq: seq, action: runBot({ level: 'easy', view: v, playerId: t.viewer, seed: n, budgetMs: 10 }) });
    }
    expect((view as GameView | null)?.round).toBeGreaterThanOrEqual(3);
    const saved = t.saveData();
    expect(saved).not.toBeNull();
    expect(changes).toBe(saved!.actions.length);
    t.close();

    const r = new LocalTransport({ engine, config: saved!.config, seed: saved!.seed, prelude: saved!.actions, handoff: true });
    r.connect();
    expect(r.seq).toBe(t.seq);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(t.state));
    // Kept: the previous round and this one, redacted for spectators.
    const types = r.replayed.flatMap((m) => m.events.map((e) => e.type));
    expect(types).toContain('roundStarted');
    expect(types).toContain('phaseChanged');
    restoreHistory(r.replayed);
    // The phases played in those rounds (Payday, Marketing; Dinnertime once there were sales).
    expect(summaries.value.map((s) => s.phase)).toEqual(expect.arrayContaining(['payday', 'marketing']));
    expect(log.value.length).toBeGreaterThan(0);
    r.close();
  });

  it('saves the rules version; a save from before versions resumes under the old rules (restaurants first)', async () => {
    const t = new LocalTransport({ engine, config, seed: 3 });
    t.connect();
    expect(t.saveData()?.config.rulesVersion).toBe(RULES_VERSION);
    expect(t.state?.phase.kind).toBe('setup.reserve');
    t.close();
    const old = { v: 1, config, seed: 3, bots: {}, actions: [], round: 0, phase: 'setup.restaurants', over: false, savedAt: 1 };
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'fcm.hotseat' ? JSON.stringify(old) : null), setItem() {}, removeItem() {} });
    vi.resetModules();
    try {
      const { savedHotseat } = await import('../src/state/recentGames.js');
      const saved = savedHotseat.value;
      expect(saved?.config.rulesVersion).toBe(1);
      const r = new LocalTransport({ engine, config: saved!.config, seed: saved!.seed, prelude: saved!.actions });
      r.connect();
      expect(r.state?.phase.kind).toBe('setup.restaurants');
      r.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a game started from a state (fixtures, lessons) has nothing to save', () => {
    const t = new LocalTransport({ engine, config, seed: 3 });
    t.connect();
    const state = t.state!;
    const f = new LocalTransport({ engine, state, viewer: 'p1' });
    f.connect();
    expect(t.saveData()).not.toBeNull();
    expect(f.saveData()).toBeNull();
  });
});
