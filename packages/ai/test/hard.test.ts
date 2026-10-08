/**
 * Hard bot smoke tests (ai-strategy.md §10 WP-B): rollouts never fail, the evaluation orders
 * obvious cases, the anytime loop honours its budget, the turn cache may be missing. Strength is
 * measured with the bench (`npm run ai:bench -- --a hard --b medium`), not here.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, PlayerId } from '@fcm/engine';
import { applyAction, createGame, engine, legalActions, redactFor } from '@fcm/engine';
import { createHardBot, decisionSeed, hard, medium, runBot, type BotInput } from '../src/index.js';
import { botInput } from '../src/run.js';
import { makeSample } from '../src/hard/determinize.js';
import { ALL_KETCHUP, gameConfig } from './helpers.js';

/** States along a Medium-vs-Medium game (every `every`-th decision), with the awaited seat. */
function statesOf(players: number, seed: number, every: number, maxRounds: number, modules = false): { s: GameState; who: PlayerId }[] {
  let s = createGame(gameConfig(players, modules ? { modules: ALL_KETCHUP } : {}), seed);
  const out: { s: GameState; who: PlayerId }[] = [];
  for (let i = 0; s.phase.kind !== 'gameOver' && s.round <= maxRounds && i < 3000; i++) {
    const who = s.awaiting.players[0] as PlayerId;
    if (i % every === 0 && s.round >= 2) out.push({ s, who });
    const a = runBot({ level: 'medium', view: redactFor(s, who), playerId: who, seed: decisionSeed(seed, i, who), budgetMs: 100 });
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(r.message);
    s = r.state;
  }
  return out;
}

const inputFor = (s: GameState, who: PlayerId, budgetMs: number, seed = 1): BotInput => botInput({ level: 'hard', view: redactFor(s, who), playerId: who, seed, budgetMs }, engine);

const base = statesOf(3, 4, 7, 8);
const modules = statesOf(3, 12, 11, 8, true);

describe('hard: rollouts', () => {
  it('play a full round from sampled states of every phase without a rejected action', () => {
    let n = 0;
    for (const { s, who } of [...base, ...modules]) {
      const input = inputFor(s, who, 1000);
      const c = medium.makeCtx(input);
      const sample = makeSample(c, input.rng, 1);
      const r = hard.rollout(sample, who, engine, 7, () => null, { horizon: 1 });
      expect(r, `${s.phase.kind} r${s.round} ${who}`).not.toBeNull();
      if (r && r !== 'timeout') expect(r.state.phase.kind === 'restructuring' || r.state.phase.kind === 'gameOver').toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(30);
  }, 60_000);

  it('Working with no substitutions is exactly Medium', () => {
    for (const { s, who } of base.filter((x) => x.s.phase.kind === 'working' && !x.s.pending.length)) {
      const input = inputFor(s, who, 1000);
      const c = medium.makeCtx(input);
      expect(hard.overrideWork(c, [], new Set())).toEqual(medium.chooseWork(c));
    }
  });
});

describe('hard: evaluation', () => {
  const { s, who } = base.find((x) => x.s.phase.kind === 'working') as { s: GameState; who: PlayerId };
  const c = medium.makeCtx(inputFor(s, who, 1000));
  const other = s.turnOrder.find((p) => p !== who) as PlayerId;
  const withCash = (d: number): GameState => {
    const t = structuredClone(s);
    (t.players[who] as { cash: number }).cash += d;
    return t;
  };

  it('more cash is better, all else equal', () => {
    expect(hard.evaluate(c, withCash(20), who).value).toBeGreaterThan(hard.evaluate(c, s, who).value);
  });

  it('winning the game dominates; losing is worst', () => {
    const over = (ranking: PlayerId[]): GameState => ({ ...structuredClone(s), phase: { kind: 'gameOver', ranking } }) as GameState;
    const rest = s.turnOrder.filter((p) => p !== who && p !== other);
    const win = hard.evaluate(c, over([who, other, ...rest]), who).value;
    const lose = hard.evaluate(c, over([other, ...rest, who]), who).value;
    const mid = hard.evaluate(c, withCash(500), who).value;
    expect(win).toBeGreaterThan(mid);
    expect(lose).toBeLessThan(hard.evaluate(c, s, who).value);
  });
});

describe('hard: anytime search', () => {
  const searchStates = base.filter((x) => ['restructuring', 'working', 'payday', 'orderOfBusiness'].includes(x.s.phase.kind) && !x.s.pending.length).slice(0, 6);

  it('at budget 150 answers Medium\'s choice', () => {
    const bot = createHardBot();
    for (const { s, who } of searchStates) expect(bot.choose(inputFor(s, who, 150))).toEqual(medium.mediumChoose(inputFor(s, who, 150)));
  });

  // Wall clock: an overrun is timed once more before it fails (a busy machine or a GC pause does
  // not repeat; a search that ignores its deadline overruns every time).
  it('answers a legal action within budget + 100 ms', () => {
    const bot = createHardBot();
    for (const budget of [300, 600]) {
      for (const { s, who } of searchStates) {
        let elapsed = Infinity;
        for (let attempt = 0; attempt < 2 && elapsed > budget + 100; attempt++) {
          hard.clearHardCache();
          const t0 = Date.now();
          const a = bot.choose(inputFor(s, who, budget));
          elapsed = Date.now() - t0;
          expect(engine.validateAction(s, a).ok).toBe(true);
        }
        expect(elapsed).toBeLessThanOrEqual(budget + 100);
      }
    }
  }, 60_000);

  it('explains a search decision with scored candidates', () => {
    const bot = createHardBot({ maxRollouts: 12 });
    const restructuring = base.find((x) => x.s.phase.kind === 'restructuring' && x.s.round >= 3) ?? searchStates[0]!;
    const e = bot.explain!(inputFor(restructuring.s, restructuring.who, 5000));
    expect(engine.validateAction(restructuring.s, e.action).ok).toBe(true);
    if (e.candidates) {
      expect(e.rollouts).toBeGreaterThan(0);
      expect(e.top?.length).toBeGreaterThan(0);
      expect(e.evalTerms).toBeDefined();
    }
  });

  it('a whole Working turn stays legal whether the turn cache is present or missing', () => {
    const start = base.find((x) => x.s.phase.kind === 'working' && !x.s.pending.length);
    expect(start).toBeDefined();
    for (const dropCache of [false, true]) {
      hard.clearHardCache();
      const bot = createHardBot({ maxRollouts: 10 });
      let s = start!.s;
      const who = start!.who;
      for (let i = 0; i < 20 && s.phase.kind === 'working' && s.awaiting.players[0] === who; i++) {
        if (dropCache) hard.clearHardCache();
        const a = bot.choose(inputFor(s, who, 5000, i + 1));
        expect(legalActions(s, who).length).toBeGreaterThan(0);
        const r = applyAction(s, a);
        expect(r.ok, JSON.stringify(a)).toBe(true);
        if (!r.ok) break;
        s = r.state;
      }
      expect(s.phase.kind !== 'working' || s.awaiting.players[0] !== who).toBe(true);
    }
  }, 30_000);
});
