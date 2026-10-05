/**
 * MacroPlan (ai-strategy.md §3.5.0): one Working turn as a list of per-card steps, executed in
 * sub-step order. Medium rebuilds its plan from the view on every call (bots must be stateless:
 * pooled workers), so the executor only needs the plan to be valid from the current state.
 *
 * Hard reuses the same shape: `planAlternatives` gives ranked options per dimension and
 * `planNeighbours` the single-substitution variants of a base plan (ai-strategy.md §4.3).
 */
import type { Action, EmployeeId, Uid, WorkStage } from '@fcm/engine';
import { stageIndex, stagesFor } from '@fcm/engine';
import { isValid, type Ctx } from './ctx.js';

export type PlanDimension = 'hire' | 'train' | 'campaign' | 'food' | 'house' | 'restaurant' | 'other';

export interface PlanStep {
  dim: PlanDimension;
  stage: WorkStage;
  /** Acting card. */
  cardUid: Uid;
  /** Concrete action; null = deliberately leave the card unused. */
  action: Action | null;
  /**
   * Training a card hired earlier in this same plan: resolved at execution time to
   * `turn.hired[hireIndex]` (its uid does not exist when the plan is made).
   */
  future?: { hireIndex: number; toEmployeeId: EmployeeId };
  value: number;
  summary: string;
}

export interface MacroPlan {
  steps: PlanStep[];
  /** Total of step values (for comparing plans). */
  value: number;
}

/** Ranked options for one decision of the plan (one card, one dimension), best first. */
export interface PlanAlternative {
  dim: PlanDimension;
  cardUid: Uid;
  options: PlanStep[];
}

export const planOf = (steps: PlanStep[]): MacroPlan => ({ steps, value: steps.reduce((a, x) => a + x.value, 0) });

/** Resolve a step into an action valid now (null if it cannot be played any more). */
export function resolveStep(c: Ctx, st: PlanStep): Action | null {
  let a = st.action;
  if (st.future && c.s.turn) {
    const uid = c.s.turn.hired[st.future.hireIndex];
    if (!uid) return null;
    a = { type: 'work.train', playerId: c.me, trainerUid: st.cardUid, targetUid: uid, toEmployeeId: st.future.toEmployeeId };
  }
  return a && isValid(c, a) ? a : null;
}

/**
 * Next action of a plan: the first step (in sub-step order, then plan order) that is still valid.
 * Steps of cards that already acted, or of passed sub-steps, are invalid and skipped. When nothing
 * is left the turn ends.
 */
export function executePlan(c: Ctx, plan: MacroPlan): Action {
  const stages = stagesFor(c.s, c.me);
  const order = plan.steps
    .map((st, i) => ({ st, i, k: stageIndex(stages, st.stage) }))
    .filter((x) => x.st.action || x.st.future)
    .sort((a, b) => a.k - b.k || a.i - b.i);
  for (const { st } of order) {
    const a = resolveStep(c, st);
    if (a) return a;
  }
  return { type: 'work.endTurn', playerId: c.me };
}

/**
 * Every plan that differs from `base` in exactly one decision: for each alternative list, swap the
 * base step of that card/dimension for each other option (or add it when the base had none).
 */
export function planNeighbours(base: MacroPlan, alts: PlanAlternative[], maxPerDim = 3): MacroPlan[] {
  const out: MacroPlan[] = [];
  for (const alt of alts) {
    const idx = base.steps.findIndex((st) => st.dim === alt.dim && st.cardUid === alt.cardUid);
    const cur = idx >= 0 ? base.steps[idx] : undefined;
    let n = 0;
    for (const opt of alt.options) {
      if (n >= maxPerDim) break;
      if (cur && cur.summary === opt.summary) continue;
      const steps = [...base.steps];
      if (idx >= 0) steps[idx] = opt;
      else steps.push(opt);
      out.push(planOf(steps));
      n++;
    }
  }
  return out;
}
