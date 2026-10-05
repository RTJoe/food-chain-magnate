/**
 * Rollouts (ai-strategy.md §4.4): play a determinized state forward with a fast Medium policy for
 * every seat, except where the candidate under test decides for my seat, until the next round's
 * Restructuring (or game over). Any action the engine rejects fails the rollout; nothing is ever
 * surfaced to the host.
 */
import type { Action, EngineApi, GameState, PlayerId, RngState } from '@fcm/engine';
import { createRng, nextUint32 } from '@fcm/engine';
import { makeCtx, readyOf, type Ctx } from '../shared/ctx.js';
import { executePlan, planOf, resolveStep, type PlanStep } from '../shared/plan.js';
import { mediumChoose } from '../medium/index.js';
import { chooseWork, workPlan } from '../medium/working.js';

/** Thinking budget handed to Medium inside rollouts (bounds its own placement loops). */
const FAST_BUDGET = 40;

/** My seat's decision inside a rollout: an action, or null to let Medium decide. */
export type MinePolicy = (s: GameState, rng: RngState) => Action | null;

/** A decision context for `pid` on a (sampled or simulated) full state, as that seat sees it. */
export function seatCtx(s: GameState, pid: PlayerId, engine: EngineApi, rng: RngState, budgetMs = FAST_BUDGET): Ctx {
  const view = engine.redactFor(s, pid);
  return makeCtx({ view, playerId: pid, legal: engine.legalActions(s, pid), engine, rng, budgetMs });
}

/** Medium's move for `pid` on a full state (the opponent model, and my own continuation). */
export function mediumMove(s: GameState, pid: PlayerId, engine: EngineApi, rng: RngState): Action {
  const view = engine.redactFor(s, pid);
  return mediumChoose({ view, playerId: pid, legal: engine.legalActions(s, pid), engine, rng, budgetMs: FAST_BUDGET });
}

export interface RolloutOptions {
  /** Rounds to play: 1 = stop at the next round's Restructuring. */
  horizon: number;
  maxSteps?: number;
  /** `Date.now()` after which the rollout gives up ('timeout': discarded, not a failure). */
  abortAt?: number;
}

export interface RolloutResult {
  state: GameState;
  steps: number;
}

/** Play `start` forward. Returns null when the engine rejected an action or the step cap hit. */
export function rollout(start: GameState, me: PlayerId, engine: EngineApi, rngSeed: number, mine: MinePolicy, opts: RolloutOptions): RolloutResult | 'timeout' | null {
  let s = JSON.parse(JSON.stringify(start)) as GameState;
  const rng = createRng(rngSeed >>> 0 || 1);
  const stopRound = s.round + opts.horizon;
  const maxSteps = opts.maxSteps ?? 150 + 60 * s.turnOrder.length * opts.horizon;
  let steps = 0;
  while (s.phase.kind !== 'gameOver' && !(s.phase.kind === 'restructuring' && s.round >= stopRound)) {
    if (steps++ > maxSteps) return null;
    if (opts.abortAt !== undefined && Date.now() > opts.abortAt) return 'timeout';
    const who = s.awaiting.players[0];
    if (!who) return null;
    let a: Action | null = null;
    try {
      if (who === me) a = mine(s, rng);
      if (!a) a = mediumMove(s, who, engine, rng);
    } catch {
      return null;
    }
    const r = engine.applyAction(s, { ...a, playerId: who } as Action);
    if (!r.ok) return null;
    s = r.state;
  }
  return { state: s, steps };
}

/** A fresh seed for one rollout, drawn from the decision rng (reproducible). */
export const rolloutSeed = (rng: RngState): number => nextUint32(rng) || 1;

// ---------------------------------------------------------------------------
// Working: Medium's plan with substitutions
// ---------------------------------------------------------------------------

/** Identity of a plan decision: one card, one dimension. */
export const stepKey = (st: PlanStep): string => `${st.dim}:${st.cardUid}`;
const acts = (st: PlanStep): boolean => Boolean(st.action || st.future);

/**
 * Next Working action for Medium's plan with `overrides` substituted (ai-strategy.md §4.3). An
 * override replaces Medium's step for the same card and dimension once (`consumed` remembers which
 * were played); an override without an action keeps that card idle. No overrides = exactly Medium.
 */
export function overrideWork(c: Ctx, overrides: readonly PlanStep[], consumed: Set<number>): Action {
  if (!overrides.length) return chooseWork(c);
  const { plan } = workPlan(c, true);
  const idle = new Set(overrides.filter((o) => !acts(o)).map(stepKey));
  const live = overrides.map((o, i) => ({ o, i })).filter((x) => acts(x.o) && !consumed.has(x.i));
  const used = new Set<number>();
  const steps: PlanStep[] = [];
  for (const st of plan.steps) {
    const k = stepKey(st);
    if (idle.has(k)) continue;
    const ov = live.find((x) => !used.has(x.i) && stepKey(x.o) === k);
    if (ov) {
      used.add(ov.i);
      steps.push(ov.o);
    } else steps.push(st);
  }
  for (const x of live) if (!used.has(x.i)) steps.push(x.o);
  let a = executePlan(c, planOf(steps));
  if (a.type === 'work.endTurn' && c.s.turn?.mustTrain.length) {
    const t = readyOf(c.legal, 'work.train').find((x) => x.type === 'work.train' && c.s.turn?.mustTrain.includes(x.targetUid));
    if (t) a = t;
  }
  const key = JSON.stringify(a);
  for (const x of live) {
    const r = resolveStep(c, x.o);
    if (r && JSON.stringify(r) === key) {
      consumed.add(x.i);
      break;
    }
  }
  return a;
}
