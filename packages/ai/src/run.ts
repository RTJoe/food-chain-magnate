/**
 * `runBot`: the one entry point hosts call (inline, worker thread, Web Worker). Builds the
 * `BotInput` from a serializable `BotRequest`, asks the bot, and guarantees an action: if the bot
 * throws or answers something the engine rejects on the view's state, the safe fallback is used.
 */
import type { Action, EngineApi } from '@fcm/engine';
import { createRng, engine as realEngine } from '@fcm/engine';
import type { BotInput, BotRequest } from './types.js';
import { createBot } from './registry.js';
import { fallbackAction } from './heuristics.js';
import { viewState } from './viewState.js';

export interface BotResult {
  action: Action;
  /** True when the bot's own answer was unusable and the fallback was sent instead. */
  fellBack: boolean;
  /** Error text when the bot threw. */
  error?: string;
  ms: number;
}

/** Turn a request into a `BotInput` (exposed for tests and custom hosts). */
export function botInput(req: BotRequest, engine: EngineApi = realEngine): BotInput {
  const state = viewState(req.view);
  return { view: req.view, playerId: req.playerId, legal: engine.legalActions(state, req.playerId), engine, rng: createRng(req.seed >>> 0 || 1), budgetMs: req.budgetMs };
}

export function runBotDetailed(req: BotRequest, engine: EngineApi = realEngine, now: () => number = () => Date.now()): BotResult {
  const t0 = now();
  const input = botInput(req, engine);
  const state = viewState(req.view);
  let error: string | undefined;
  try {
    const action = { ...createBot(req.level).choose(input), playerId: req.playerId } as Action;
    if (engine.validateAction(state, action).ok) return { action, fellBack: false, ms: now() - t0 };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const action = fallbackAction(state, req.playerId, engine, input.legal, input.rng);
  return { action, fellBack: true, ...(error ? { error } : {}), ms: now() - t0 };
}

/** One action for the request's seat. Never throws for a seat the engine is awaiting. */
export function runBot(req: BotRequest, engine: EngineApi = realEngine): Action {
  return runBotDetailed(req, engine).action;
}

/** Seed for one decision: stable for (game seed, seq, seat), so replays and tests reproduce. */
export function decisionSeed(gameSeed: number, seq: number, playerId: string): number {
  let h = (gameSeed ^ 0x9e3779b9) >>> 0;
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  };
  mix(seq);
  for (let i = 0; i < playerId.length; i++) mix(playerId.charCodeAt(i));
  return h || 1;
}
