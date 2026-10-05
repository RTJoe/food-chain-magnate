/**
 * Candidate generation (ai-strategy.md §4.3): macro-plans, never raw action trees. Every list
 * starts with Medium's own choice (the search keeps it unless something beats it).
 * - Restructuring: Medium's ranked structures (its manager subsets and price variants).
 * - Order of business: the free positions.
 * - Working: substitutions into Medium's turn plan: one decision (card × dimension) swapped for
 *   one of Medium's ranked alternatives, a shorter campaign or an idle card; pairwise combinations
 *   of the best ones are added by the search after its first pass.
 * - Payday: Medium's firing sets plus "fire nothing".
 */
import type { Action, Uid } from '@fcm/engine';
import { isValid, type Ctx } from '../shared/ctx.js';
import type { PlanStep } from '../shared/plan.js';
import { chooseOrder, fireCandidates } from '../medium/phases.js';
import { structureCandidates } from '../medium/restructure.js';
import { workPlan } from '../medium/working.js';
import { stepKey } from './rollout.js';

export interface Labeled<T> {
  label: string;
  data: T;
}

export function structureCands(c: Ctx, n = 8): Labeled<Action>[] {
  return structureCandidates(c, n).map((x) => {
    const ids = x.atWork.map((u) => c.s.players[c.me]?.employees[u]?.employeeId ?? u);
    return { label: `${x.label} [${ids.join(',')}] f=${Math.round(x.score)}`, data: { type: 'restructure.submit', playerId: c.me, structure: x.sub } as Action };
  });
}

export function orderCands(c: Ctx): Labeled<Action>[] {
  return chooseOrder(c).map((a) => ({ label: `position ${a.type === 'order.choosePosition' ? a.position + 1 : '?'}`, data: a }));
}

export function fireCands(c: Ctx): Labeled<Uid[]>[] {
  const sets = fireCandidates(c, 4);
  if (!sets.some((x) => !x.length)) sets.push([]);
  const name = (u: Uid) => c.s.players[c.me]?.employees[u]?.employeeId ?? u;
  const seen = new Set<string>();
  const out: Labeled<Uid[]>[] = [];
  for (const set of sets) {
    const key = [...set].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: set.length ? `fire ${set.map(name).join(',')}` : 'fire nothing', data: set });
  }
  return out;
}

const MAX_PER_DECISION = 3;
const MAX_SINGLES = 24;

/** Single-substitution candidates around Medium's full turn plan (base = no substitution). */
export function workCands(c: Ctx): Labeled<PlanStep[]>[] {
  const { plan, alts } = workPlan(c, true);
  const out: Labeled<PlanStep[]>[] = [{ label: 'medium plan', data: [] }];
  const seen = new Set<string>();
  for (const alt of alts) {
    const key = `${alt.dim}:${alt.cardUid}`;
    if (seen.has(key)) continue; // multi-use cards: first use only
    seen.add(key);
    const cur = plan.steps.find((st) => stepKey(st) === key);
    const curActs = Boolean(cur && (cur.action || cur.future));
    const options: PlanStep[] = [];
    for (const opt of alt.options) {
      if (options.length >= MAX_PER_DECISION) break;
      const optActs = Boolean(opt.action || opt.future);
      if (cur && opt.summary === cur.summary) continue;
      if (!curActs && !optActs) continue;
      options.push(opt);
    }
    if (alt.dim === 'campaign' && cur?.action?.type === 'work.placeCampaign') {
      const act = cur.action;
      // A shorter campaign (the marketeer comes back sooner), or no campaign at all.
      const d = Math.max(1, Math.ceil(act.duration / 2));
      const shorter = { ...act, duration: d };
      if (d < act.duration && isValid(c, shorter)) options.push({ ...cur, action: shorter, summary: `${cur.summary} d${d}` });
      options.push({ ...cur, action: null, value: 0, summary: 'keep marketeer' });
    }
    for (const opt of options) out.push({ label: `${alt.dim}: ${opt.summary}`, data: [opt] });
    if (out.length > MAX_SINGLES) break;
  }
  return out;
}

/** Pairwise (and one triple) combinations of the best single substitutions on distinct decisions. */
export function combine(best: PlanStep[][], labels: string[]): Labeled<PlanStep[]>[] {
  const out: Labeled<PlanStep[]>[] = [];
  const top = best.slice(0, 3);
  const keyOf = (ovs: PlanStep[]) => ovs.map(stepKey);
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i] as PlanStep[];
      const b = top[j] as PlanStep[];
      if (keyOf(a).some((k) => keyOf(b).includes(k))) continue;
      out.push({ label: `${labels[i]} + ${labels[j]}`, data: [...a, ...b] });
    }
  if (top.length === 3 && out.length === 3) out.push({ label: labels.slice(0, 3).join(' + '), data: top.flat() });
  return out;
}
