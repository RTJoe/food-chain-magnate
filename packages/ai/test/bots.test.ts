/** Bot interface, registry, view rebuilding and determinization (docs/ai.md). */
import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '@fcm/engine';
import { applyAction, createGame, engine, legalActions, redactFor } from '@fcm/engine';
import { botInput, createBot, createHardBot, createMediumBot, decisionSeed, hasBot, registerBot, runBot, runBotDetailed, sampleState, viewState, type Bot } from '../src/index.js';
import { easyChoose } from '../src/easy.js';
import { internalFallbackCount } from '../src/shared/fallback.js';
import { ALL_KETCHUP, gameConfig } from './helpers.js';

/** Walk a bot game and call `visit` before each action. */
function walk(state0: GameState, steps: number, visit: (s: GameState, who: string) => void): GameState {
  let s = state0;
  for (let i = 0; i < steps && s.phase.kind !== 'gameOver'; i++) {
    const who = s.awaiting.players[0] as string;
    visit(s, who);
    const a = runBot({ level: 'easy', view: redactFor(s, who), playerId: who, seed: decisionSeed(1, i, who), budgetMs: 100 });
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(r.message);
    s = r.state;
  }
  return s;
}

describe('registry', () => {
  it('Easy, Medium and Hard are registered and report their level', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      expect(hasBot(level)).toBe(true);
      expect(createBot(level).level).toBe(level);
    }
  });

  it('registerBot replaces the fallback wherever runBot is used', () => {
    const calls: string[] = [];
    const spy: Bot = { level: 'hard', choose: (input) => (calls.push(input.playerId), createBot('easy').choose(input)) };
    registerBot('hard', () => spy);
    try {
      const s = createGame(gameConfig(2), 3);
      const who = s.awaiting.players[0] as string;
      runBot({ level: 'hard', view: redactFor(s, who), playerId: who, seed: 1, budgetMs: 10 });
      expect(calls).toEqual([who]);
    } finally {
      registerBot('hard', () => createHardBot());
    }
  });

  it('a bot that throws or answers nonsense is replaced by a legal fallback', () => {
    registerBot('medium', () => ({ level: 'medium', choose: () => ({ type: 'work.endTurn', playerId: 'p1' }) as Action }));
    const s = createGame(gameConfig(2), 4);
    const who = s.awaiting.players[0] as string;
    const r = runBotDetailed({ level: 'medium', view: redactFor(s, who), playerId: who, seed: 1, budgetMs: 10 });
    expect(r.fellBack).toBe(true);
    expect(applyAction(s, r.action).ok).toBe(true);
    registerBot('medium', createMediumBot);
  });

  it('a bot that plays the safe fallback itself is reported (internalFallback), and normal moves are not', () => {
    const s = createGame(gameConfig(2), 4);
    const who = s.awaiting.players[0] as string;
    const req = { view: redactFor(s, who), playerId: who, seed: 1, budgetMs: 50 };
    for (const level of ['easy', 'medium', 'hard'] as const) expect(runBotDetailed({ level, ...req }).internalFallback).toBe(false);
    // An engine that refuses everything leaves the bots nothing valid of their own.
    const refusing = { ...engine, validateAction: () => ({ ok: false as const, code: 'ILLEGAL' as never, message: 'no' }) };
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const before = internalFallbackCount();
      createBot(level).choose(botInput({ level, ...req }, refusing));
      expect(internalFallbackCount(), level).toBe(before + 1);
    }
    // Nested use (Medium asking Easy, Hard's rollouts) does not count.
    const before = internalFallbackCount();
    easyChoose(botInput({ level: 'easy', ...req }, refusing));
    expect(internalFallbackCount()).toBe(before);
  });
});

describe('viewState / sampleState', () => {
  it('legal actions on the view state equal those on the real state (hidden info never changes legality)', () => {
    let checked = 0;
    walk(createGame(gameConfig(3, { modules: ALL_KETCHUP }), 8), 400, (s, who) => {
      expect(legalActions(viewState(redactFor(s, who)), who)).toEqual(legalActions(s, who));
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
  });

  it('sampleState is a full, playable state consistent with the view and hides nothing it should not know', () => {
    let restructuring = 0;
    walk(createGame(gameConfig(3), 12), 300, (s, who) => {
      const view = redactFor(s, who);
      const sample = sampleState(view, [1, 2, 3, 4]);
      expect(sample.players).toEqual(s.players);
      expect(sample.secrets[who]).toEqual(s.secrets[who]);
      expect(JSON.parse(JSON.stringify(sample))).toEqual(sample);
      // Any action legal for the awaited player applies on the sample too.
      const a = runBot({ level: 'easy', view, playerId: who, seed: 5, budgetMs: 10 });
      expect(engine.applyAction(sample, a).ok).toBe(true);
      if (s.phase.kind === 'restructuring') {
        restructuring++;
        for (const id of s.turnOrder) if (id !== who && view.submitted[id]) expect(sample.secrets[id]?.structureDraft).not.toBeNull();
      }
    });
    expect(restructuring).toBeGreaterThan(0);
  });
});
