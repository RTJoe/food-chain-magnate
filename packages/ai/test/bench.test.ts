/** Tuning harness (packages/ai/src/bench): stats, schedule, inline games, traces. Kept fast; the CLI runs real tournaments. */
import { describe, expect, it } from 'vitest';
import type { Action } from '@fcm/engine';
import { createEasyBot, type Bot } from '../src/index.js';
import { playGame, type TraceLine } from '../src/bench/game.js';
import { formatReport } from '../src/bench/report.js';
import { multiplayerElo, percentile, wilson } from '../src/bench/stats.js';
import { buildGroups, runInline, schedule, summarize, type TournamentOptions } from '../src/bench/tournament.js';

const opts = (over: Partial<TournamentOptions> = {}): TournamentOptions => ({
  groups: buildGroups({ a: 'easy', b: 'easy', players: 2 }),
  players: 2,
  games: 2,
  seed: 7,
  modules: [],
  intro: false,
  budgetMs: 100,
  maxRounds: 3,
  maxSteps: 2000,
  rotate: true,
  trace: false,
  ...over,
});

describe('bench stats', () => {
  it('Wilson interval', () => {
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeCloseTo(0.49, 2);
    expect(hi).toBeCloseTo(0.943, 2);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it('percentile (nearest rank)', () => {
    const xs = Float64Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 0.5)).toBe(50);
    expect(percentile(xs, 0.95)).toBe(95);
  });

  it('multiplayer Elo favours the winner and conserves points', () => {
    const games = Array.from({ length: 30 }, () => ({ places: [{ entity: 'a', place: 0 }, { entity: 'b', place: 1 }, { entity: 'b', place: 2 }] }));
    const elo = multiplayerElo(games);
    expect(elo.a!.mean).toBeGreaterThan(1600);
    expect(elo.a!.mean + elo.b!.mean).toBeCloseTo(3000, 6);
  });
});

describe('bench schedule', () => {
  it('labels same-level sides apart and rotates every seat on one map seed', () => {
    expect(buildGroups({ a: 'medium', b: 'easy', players: 4 }).map((g) => [g.label, g.seats])).toEqual([['medium', 1], ['easy', 3]]);
    const specs = schedule(opts({ groups: buildGroups({ a: 'medium', b: 'easy', players: 3 }), players: 3, games: 6 }));
    expect(specs.map((s) => s.seed)).toEqual([7, 7, 7, 8, 8, 8]);
    expect(specs.slice(0, 3).map((s) => s.seats.findIndex((x) => x.label === 'medium'))).toEqual([0, 1, 2]);
  });
});

describe('bench games', () => {
  it('plays a short inline tournament and summarizes it', () => {
    const o = opts();
    const results = runInline(o);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.end).toBe('cap');
      expect(Object.values(r.stats).every((s) => s.fallbacks === 0 && s.rejected === 0 && s.decisions > 0)).toBe(true);
    }
    const s = summarize(o, results);
    expect(s.groups.map((g) => g.label)).toEqual(['A:easy', 'B:easy']);
    expect(s.games.capped).toBe(2);
    expect(s.groups[0]!.latency.n).toBeGreaterThan(0);
    expect(formatReport(s)).toContain('head to head: A:easy above B:easy');
  });

  it('traces decisions with explain() terms and counts invalid answers as fallbacks', () => {
    const easy = createEasyBot();
    const explaining: Bot = { level: 'medium', choose: (i) => easy.choose(i), explain: (i) => ({ action: easy.choose(i), archetype: 'test', evalTerms: { cash: 1 } }) };
    let calls = 0;
    const broken: Bot = { level: 'hard', choose: (i) => (++calls % 5 === 0 ? ({ type: 'order.choosePosition', playerId: i.playerId, position: 99 } as Action) : easy.choose(i)) };
    const [spec] = schedule(opts({ groups: buildGroups({ a: 'medium', b: 'hard', players: 2 }), games: 1, trace: true }));
    const lines: TraceLine[] = [];
    const r = playGame(spec!, { makeBot: (l) => (l === 'medium' ? explaining : broken), onTrace: (l) => lines.push(l) });
    expect(lines[0]!.kind).toBe('game');
    const decisions = lines.filter((l) => l.kind === 'decision');
    expect(decisions).toHaveLength(r.steps);
    const mine = decisions.find((d) => d.kind === 'decision' && d.level === 'medium');
    expect(mine && mine.kind === 'decision' && mine.explain).toEqual({ archetype: 'test', evalTerms: { cash: 1 } });
    const hardSeat = spec!.seats.find((s) => s.level === 'hard')!.playerId;
    expect(r.stats[hardSeat]!.invalid).toBeGreaterThan(0);
    expect(r.stats[hardSeat]!.fallbacks).toBe(r.stats[hardSeat]!.invalid);
    expect(r.stats[hardSeat]!.rejected).toBe(0);
  });
});
