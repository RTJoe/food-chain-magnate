/**
 * Medium bot (docs/ai-strategy.md §3): strategy-driven heuristics, no search.
 * - setup: first restaurant by exact position value (houses it would win); reserve by archetype.
 * - restructuring: forecast-scored structures (shadow Dinnertime + development value).
 * - order of business: earliest position.
 * - working: a MacroPlan rebuilt from the view each call: org-plan hires and training, campaigns
 *   by reach × win chance, production by the shadow Dinnertime, houses, restaurants.
 * - payday: fire salaried cards the plan does not need or cash cannot carry; freezer by demand.
 * - Ketchup: module-aware scorers for placement choices, Easy's logic for the rest.
 *
 * Stateless: everything is derived from the view on every call (pooled workers, undo).
 * Hard reuses `structureCandidates`, `workPlan` / `planAlternatives`, `planNeighbours`,
 * `fireCandidates` and `orderValue`.
 */
import type { Action } from '@fcm/engine';
import type { Bot, BotExplanation, BotInput } from '../types.js';
import { fallbackAction } from '../heuristics.js';
import { isValid, makeCtx, type Ctx } from '../shared/ctx.js';
import { planNeighbours, type MacroPlan, type PlanAlternative } from '../shared/plan.js';
import { chooseArchetype } from './archetype.js';
import { chooseChoice } from './ketchup.js';
import { chooseFreezer, chooseOrder, choosePayday, chooseReserve, chooseSetupRestaurant } from './phases.js';
import { chooseStructure, structureCandidates } from './restructure.js';
import { chooseWork, workPlan } from './working.js';

export { structureCandidates, structureScore } from './restructure.js';
export { fireCandidates, orderValue, forcedFire } from './phases.js';
export { workPlan, chooseWork } from './working.js';
export { orgPlan } from './orgPlanner.js';
export { chooseArchetype, ARCHETYPES, type Archetype } from './archetype.js';
export { campaignOptions } from './campaign.js';
export { executePlan, planNeighbours, type MacroPlan, type PlanAlternative, type PlanStep } from '../shared/plan.js';
export { makeCtx, type Ctx } from '../shared/ctx.js';

function candidates(c: Ctx): Action[] {
  const head = c.s.pending[0];
  if (head && head.player === c.me) return chooseChoice(c);
  switch (c.s.phase.kind) {
    case 'setup.restaurants':
      return chooseSetupRestaurant(c);
    case 'setup.reserve':
      return chooseReserve(c);
    case 'restructuring':
      return [{ type: 'restructure.submit', playerId: c.me, structure: chooseStructure(c) }];
    case 'orderOfBusiness':
      return chooseOrder(c);
    case 'working':
      return [chooseWork(c)];
    case 'payday':
      return choosePayday(c);
    case 'cleanup':
      return chooseFreezer(c);
    default:
      return [];
  }
}

export function mediumChoose(input: BotInput): Action {
  const c = makeCtx(input);
  let list: Action[] = [];
  try {
    list = candidates(c);
  } catch {
    list = [];
  }
  for (const a of list) if (isValid(c, a)) return a;
  return fallbackAction(c.s, c.me, c.engine, c.legal, c.rng);
}

function explain(input: BotInput): BotExplanation {
  const action = mediumChoose({ ...input, rng: [...input.rng] as typeof input.rng });
  try {
    const c = makeCtx(input);
    const arch = chooseArchetype(c);
    const out: BotExplanation = { action, archetype: arch.id };
    if (c.s.phase.kind === 'restructuring') {
      const cands = structureCandidates(c, 6);
      out.candidates = cands.length;
      out.top = cands.map((x) => ({ summary: `${x.label} [${x.atWork.map((u) => c.s.players[c.me]?.employees[u]?.employeeId).join(',')}]`, score: Math.round(x.score * 10) / 10 }));
    } else if (c.s.phase.kind === 'working' && !c.s.pending.length) {
      const { plan } = workPlan(c);
      out.top = plan.steps.map((st) => ({ summary: `${st.dim}: ${st.summary}`, score: Math.round(st.value * 10) / 10 }));
    }
    return out;
  } catch {
    return { action };
  }
}

export function createMediumBot(): Bot {
  return { level: 'medium', choose: mediumChoose, explain };
}

/** Hard's view of Medium's Working plan: base plan, ranked alternatives, single-substitution neighbours. */
export function planAlternatives(c: Ctx): { base: MacroPlan; alts: PlanAlternative[]; neighbours: MacroPlan[] } {
  const { plan, alts } = workPlan(c, true);
  return { base: plan, alts, neighbours: planNeighbours(plan, alts) };
}
