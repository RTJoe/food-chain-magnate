/** Medium bot (docs/ai-strategy.md §3): legality across player counts and modules, scorers, smoke win rate vs Easy. */
import { describe, expect, it } from 'vitest';
import type { GameState, PlayerId } from '@fcm/engine';
import { applyAction, createGame, engine, isOverfilled, redactFor, submissionProblem } from '@fcm/engine';
import { botInput, createBot, decisionSeed, medium, runBot, type BotLevel } from '../src/index.js';
import { makeCtx } from '../src/shared/ctx.js';
import { basePriceModel, canEverSupply, houseViews, shadowDinner, winProb } from '../src/shared/market.js';
import { executePlan } from '../src/shared/plan.js';
import { ALL_KETCHUP, gameConfig, playBots } from './helpers.js';

const seats = (n: number, f: (i: number) => BotLevel): Record<PlayerId, BotLevel> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, f(i)]));

function clean(g: ReturnType<typeof playBots>): void {
  expect(g.rejected).toEqual([]);
  expect(g.fellBack).toEqual([]);
}

/** Walk a Medium-vs-Easy game, calling `visit` with Medium's input before each Medium decision. */
function walk(seed: number, players: number, visit: (s: GameState, who: string) => void, steps = 600): void {
  let s = createGame(gameConfig(players), seed);
  for (let i = 0; i < steps && s.phase.kind !== 'gameOver'; i++) {
    const who = s.awaiting.players[0] as string;
    const level: BotLevel = who === 'p1' ? 'medium' : 'easy';
    if (level === 'medium') visit(s, who);
    const a = runBot({ level, view: redactFor(s, who), playerId: who, seed: decisionSeed(seed, s.history.seq, who), budgetMs: 500 });
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(r.message);
    s = r.state;
  }
}

describe('Medium legality', { timeout: 60_000 }, () => {
  it.each([2, 4, 5])('base game, %i players, Medium vs Easy', (n) => {
    clean(playBots(gameConfig(n), 200 + n, seats(n, (i) => (i % 2 ? 'easy' : 'medium')), 30));
  });

  it.each([2, 5])('all Ketchup modules, %i players, all Medium', (n) => {
    clean(playBots(gameConfig(n, { modules: ALL_KETCHUP }), 300 + n, seats(n, () => 'medium'), 30));
  });

  it('Medium vs Medium finishes by bank break', () => {
    const g = playBots(gameConfig(2), 41, seats(2, () => 'medium'), 40);
    clean(g);
    expect(g.state.phase.kind).toBe('gameOver');
  });
});

describe('Medium scorers', { timeout: 60_000 }, () => {
  it('structures are legal and never overfilled; the plan executor only emits valid actions; explain matches choose', () => {
    let structures = 0;
    let work = 0;
    const bot = createBot('medium');
    walk(7, 2, (s, who) => {
      const input = botInput({ level: 'medium', view: redactFor(s, who), playerId: who, seed: 9, budgetMs: 500 });
      const c = makeCtx(input);
      if (s.phase.kind === 'restructuring' && s.awaiting.players.includes(who)) {
        for (const cand of medium.structureCandidates(c, 6)) {
          expect(submissionProblem(s, who, cand.sub)).toBeNull();
          expect(isOverfilled(s, who, cand.sub)).toBe(false);
          structures++;
        }
      }
      if (s.phase.kind === 'working' && !s.pending.length) {
        const { base, neighbours } = medium.planAlternatives(c);
        for (const plan of [base, ...neighbours.slice(0, 4)]) expect(engine.validateAction(s, executePlan(c, plan)).ok).toBe(true);
        work++;
      }
      const again = botInput({ level: 'medium', view: redactFor(s, who), playerId: who, seed: 9, budgetMs: 500 });
      expect(bot.explain?.(again).action).toEqual(bot.choose(botInput({ level: 'medium', view: redactFor(s, who), playerId: who, seed: 9, budgetMs: 500 })));
    });
    expect(structures).toBeGreaterThan(5);
    expect(work).toBeGreaterThan(20);
  });

  it('winProb and the shadow Dinnertime agree on houses with demand', () => {
    let checked = 0;
    walk(11, 2, (s, who) => {
      if (s.phase.kind !== 'working') return;
      const c = makeCtx(botInput({ level: 'medium', view: redactFor(s, who), playerId: who, seed: 1, budgetMs: 500 }));
      const m = basePriceModel(c);
      const rich: Record<string, Record<string, number>> = {};
      const goods = ['burger', 'pizza', 'beer', 'lemonade', 'soft_drink'] as const;
      for (const pid of s.turnOrder) rich[pid] = Object.fromEntries(goods.filter((g) => canEverSupply(c, pid, g)).map((g) => [g, 99]));
      const d = shadowDinner(c, m, rich);
      for (const h of houseViews(c)) {
        if (!h.nDemand || !h.sellers.length) continue;
        const p = winProb(c, h, m, who, null, false);
        expect(p === 0 || p === 1).toBe(true);
        // With unlimited stock everywhere the step win chance names the shadow winner.
        const mine = Object.keys(h.demand).every((g) => (rich[who]?.[g] ?? 0) > 0);
        if (p === 1 && mine) expect(d.winner[h.id]).toBe(who);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });
});

describe('Medium vs Easy (smoke; the 200-game tournament lives in npm run ai:bench)', { timeout: 60_000 }, () => {
  it('wins most 2-player games, seat-rotated', () => {
    let wins = 0;
    let games = 0;
    for (const seed of [1, 2, 3]) {
      for (const mediumSeat of [0, 1]) {
        const g = playBots(gameConfig(2), seed, seats(2, (i) => (i === mediumSeat ? 'medium' : 'easy')), 40);
        clean(g);
        games++;
        if (g.state.phase.kind === 'gameOver' && g.state.phase.ranking[0] === `p${mediumSeat + 1}`) wins++;
      }
    }
    expect(wins).toBeGreaterThanOrEqual(games - 1);
  });
});
