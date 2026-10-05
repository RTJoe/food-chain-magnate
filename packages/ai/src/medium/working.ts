/**
 * Working 9–5 (ai-strategy.md §3.5): builds the turn's MacroPlan from the current view (hires,
 * training, campaigns, food, houses, restaurants) and executes its next step. Rebuilt on every
 * call, so a reconnect, an undo or a different worker never loses the plan.
 */
import type { Action, EmployeeId, LegalAction, Uid, WorkStage } from '@fcm/engine';
import { abilityStage, stageIndex, stagesFor } from '@fcm/engine';
import { easyChoose } from '../easy.js';
import { cardOfLegal, defFor, placementsOf, readyOf, type Ctx } from '../shared/ctx.js';
import { msOpen } from '../shared/facts.js';
import { executePlan, planOf, type MacroPlan, type PlanAlternative, type PlanStep } from '../shared/plan.js';
import { cardValue } from '../shared/values.js';
import { campaignOptions, campaignThreshold } from './campaign.js';
import { HOUSE_THRESHOLD, RESTAURANT_THRESHOLD, houseOptions, restaurantOptions } from './develop.js';
import { foodSteps } from './food.js';
import { orgPlan, type OrgPlan } from './orgPlanner.js';

export interface WorkPlanResult {
  plan: MacroPlan;
  alts: PlanAlternative[];
}

/** Legal entries grouped by acting card. */
function byCard(legal: LegalAction[]): Map<Uid, LegalAction[]> {
  const out = new Map<Uid, LegalAction[]>();
  for (const l of legal) {
    const uid = cardOfLegal(l);
    if (!uid) continue;
    out.set(uid, [...(out.get(uid) ?? []), l]);
  }
  return out;
}

const noSkip = (ls: LegalAction[]) => ls.filter((l) => !(l.kind === 'ready' && l.action.type === 'work.skip'));

/**
 * Build the plan for my remaining cards. `full` computes every dimension (Hard, alternatives);
 * otherwise dimensions are computed in sub-step order and the build stops at the first stage that
 * has something to do (that is all the executor needs now).
 */
export function workPlan(c: Ctx, full = false): WorkPlanResult {
  const s = c.s;
  const me = c.me;
  const stages = stagesFor(s, me);
  const cards = byCard(c.legal);
  const stageOf = (uid: Uid): WorkStage | null => abilityStage(defFor(c, me, uid));
  const groups = new Map<WorkStage | 'other', Map<Uid, LegalAction[]>>();
  for (const [uid, ls] of cards) {
    const acts = noSkip(ls);
    if (!acts.length) continue;
    const st = stageOf(uid) ?? 'other';
    if (!groups.has(st)) groups.set(st, new Map());
    groups.get(st)?.set(uid, acts);
  }
  const steps: PlanStep[] = [];
  const alts: PlanAlternative[] = [];
  const order: (WorkStage | 'other')[] = [...stages, 'other'];
  order.sort((a, b) => (a === 'other' ? 99 : stageIndex(stages, a)) - (b === 'other' ? 99 : stageIndex(stages, b)));
  const plan = orgPlan(c);
  for (const st of order) {
    const g = groups.get(st);
    if (!g || !g.size) continue;
    const before = steps.length;
    switch (st) {
      case 'recruit':
        hireSteps(c, plan, g, steps, alts);
        break;
      case 'train':
        trainSteps(c, plan, g, steps, alts);
        break;
      case 'marketing':
        for (const [uid, ls] of g) campaignStep(c, uid, ls, steps, alts);
        break;
      case 'food': {
        const r = foodSteps(c, g);
        steps.push(...r.steps);
        alts.push(...r.alts.map((a) => ({ dim: 'food' as const, ...a })));
        break;
      }
      case 'houses':
        for (const [uid, ls] of g) devStep(c, uid, ls, 'house', steps, alts);
        break;
      case 'restaurants':
        for (const [uid, ls] of g) devStep(c, uid, ls, 'restaurant', steps, alts);
        break;
      default:
        for (const [uid, ls] of g) otherStep(c, uid, ls, st === 'other' ? 'restaurants' : st, steps);
    }
    if (!full && steps.length > before && steps.slice(before).some((x) => x.action || x.future)) break;
  }
  return { plan: planOf(steps), alts };
}

// ---------------------------------------------------------------------------
// Recruit
// ---------------------------------------------------------------------------

const FILLERS: EmployeeId[] = ['waitress', 'pricing_manager', 'management_trainee'];

function hireSteps(c: Ctx, plan: OrgPlan, g: Map<Uid, LegalAction[]>, steps: PlanStep[], alts: PlanAlternative[]): void {
  const me = c.me;
  const s = c.s;
  // Hire actions available: CEO and recruiting girls first, discount cards (unused = $5) last.
  const uses: { uid: Uid; discount: boolean; offers: Map<EmployeeId, Action> }[] = [];
  for (const [uid, ls] of g) {
    const a = defFor(c, me, uid)?.ability;
    const left = s.turn?.uses[uid] ?? 0;
    const offers = new Map<EmployeeId, Action>();
    for (const act of readyOf(ls, 'work.recruit')) if (act.type === 'work.recruit' && (s.supply[act.employeeId] ?? 0) > 0) offers.set(act.employeeId, act);
    for (let i = 0; i < left; i++) uses.push({ uid, discount: a?.kind === 'recruit' && a.salaryDiscountPerUnused > 0, offers });
  }
  uses.sort((a, b) => Number(a.discount) - Number(b.discount));
  const total = uses.length + (s.turn?.hired.length ?? 0);
  const hire3 = total >= 3 && msOpen(s, me, 'first_hire_3');
  const wanted = [...plan.hires];
  // Free entry cards are always fine to hold; fill otherwise idle CEO / girl hires with them.
  const owned = (id: EmployeeId) => Object.values(s.players[me]?.employees ?? {}).filter((x) => x.employeeId === id).length;
  // Waitresses are free income ($3+ a round); management trainees only while slots are short.
  const fillers = FILLERS.filter((id) => (s.supply[id] ?? 0) > 0 && !(id === 'waitress' && owned(id) >= 4) && !(id === 'management_trainee' && !plan.mtHelps) && !(id === 'pricing_manager' && owned(id) >= 3));
  const slotsTight = plan.mtHelps;
  uses.forEach((u, i) => {
    const pick = (ids: EmployeeId[]): EmployeeId | undefined => ids.find((id) => u.offers.has(id));
    let id = pick(wanted);
    let value = id ? 20 - i : 0;
    if (!id && (!u.discount || hire3)) {
      const fill = slotsTight ? pick(['management_trainee', ...fillers]) : pick(fillers);
      if (fill && (s.round <= 6 || hire3 || !u.discount)) {
        id = fill;
        value = hire3 ? 12 : 3;
      }
    }
    const options: PlanStep[] = [];
    for (const [eid, act] of u.offers) {
      const rank = wanted.indexOf(eid);
      options.push({ dim: 'hire', stage: 'recruit', cardUid: u.uid, action: act, value: rank >= 0 ? 20 - rank : cardValue(c.content.employees[eid]) * 0.3, summary: `hire ${eid}` });
    }
    options.sort((a, b) => b.value - a.value);
    alts.push({ dim: 'hire', cardUid: u.uid, options: options.slice(0, 3) });
    if (!id) return;
    const act = u.offers.get(id);
    if (!act) return;
    const wi = wanted.indexOf(id);
    if (wi >= 0) wanted.splice(wi, 1);
    steps.push({ dim: 'hire', stage: 'recruit', cardUid: u.uid, action: act, value, summary: `hire ${id}` });
  });
}

// ---------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------

function trainSteps(c: Ctx, plan: OrgPlan, g: Map<Uid, LegalAction[]>, steps: PlanStep[], alts: PlanAlternative[]): void {
  const me = c.me;
  const p = c.s.players[me];
  if (!p) return;
  const room = plan.salaryRoom;
  const scored: { act: Extract<Action, { type: 'work.train' }>; v: number }[] = [];
  for (const [, ls] of g) {
    for (const act of readyOf(ls, 'work.train')) {
      if (act.type !== 'work.train') continue;
      const card = p.employees[act.targetUid];
      if (!card) continue;
      const from = c.content.employees[card.employeeId];
      const to = c.content.employees[act.toEmployeeId];
      if (!from || !to) continue;
      const salaryAdded = to.salary && !from.salary && !card.salaryFree;
      const planned = plan.trains.find((t) => t.uid === act.targetUid);
      let v: number;
      if (planned) {
        const k = planned.path.indexOf(act.toEmployeeId);
        v = k >= 0 ? planned.priority + 10 * (k + 1) : -1;
      } else {
        // Not in the plan: only clear upgrades of cards the plan does not use.
        v = plan.extras.includes(act.targetUid) ? cardValue(to) - cardValue(from) - (salaryAdded ? 6 : 0) : -1;
      }
      if (salaryAdded && room <= 0 && !msOpen(c.s, me, 'first_train')) v -= 50;
      if (c.s.turn?.mustTrain.includes(act.targetUid)) v += 100;
      scored.push({ act, v });
    }
  }
  scored.sort((a, b) => b.v - a.v);
  const used = new Map<Uid, number>();
  const trained = new Set<Uid>();
  for (const { act, v } of scored) {
    if (v <= 0) break;
    const left = (c.s.turn?.uses[act.trainerUid] ?? 0) - (used.get(act.trainerUid) ?? 0);
    if (left <= 0 || trained.has(act.targetUid)) continue;
    used.set(act.trainerUid, (used.get(act.trainerUid) ?? 0) + 1);
    trained.add(act.targetUid);
    steps.push({ dim: 'train', stage: 'train', cardUid: act.trainerUid, action: act, value: v, summary: `train ${act.targetUid} -> ${act.toEmployeeId}` });
  }
  for (const uid of g.keys()) {
    alts.push({
      dim: 'train',
      cardUid: uid,
      options: scored
        .filter((x) => x.act.trainerUid === uid && x.v > 0)
        .slice(0, 2)
        .map((x) => ({ dim: 'train' as const, stage: 'train' as const, cardUid: uid, action: x.act, value: x.v, summary: `train ${x.act.targetUid} -> ${x.act.toEmployeeId}` })),
    });
  }
}

// ---------------------------------------------------------------------------
// Marketing, houses, restaurants, module cards
// ---------------------------------------------------------------------------

function campaignStep(c: Ctx, uid: Uid, ls: LegalAction[], steps: PlanStep[], alts: PlanAlternative[]): void {
  const def = defFor(c, c.me, uid);
  const a = def?.ability;
  const entries = placementsOf(ls).filter((l) => l.spec.kind === 'campaign');
  if (!entries.length || a?.kind !== 'marketing') {
    otherStep(c, uid, ls, 'marketing', steps);
    return;
  }
  const opts = campaignOptions(c, entries, a.maxDuration);
  const options: PlanStep[] = opts.map((o) => ({
    dim: 'campaign',
    stage: 'marketing',
    cardUid: uid,
    action: {
      type: 'work.placeCampaign',
      playerId: c.me,
      cardUid: uid,
      campaignKind: o.kind,
      tileNumber: o.tileNumber,
      goods: [o.good],
      placement: o.placement,
      duration: a.maxDuration,
      ...(o.from ? { from: o.from as never } : {}),
    },
    value: o.value,
    summary: o.summary,
  }));
  alts.push({ dim: 'campaign', cardUid: uid, options: options.slice(0, 3) });
  const best = options[0];
  const salaried = Boolean(def?.salary) && !c.s.players[c.me]?.milestones.first_billboard;
  if (best && best.value >= campaignThreshold(c, c.me, salaried)) steps.push(best);
  else steps.push({ dim: 'campaign', stage: 'marketing', cardUid: uid, action: null, value: 0, summary: 'keep marketeer' });
}

function devStep(c: Ctx, uid: Uid, ls: LegalAction[], dim: 'house' | 'restaurant', steps: PlanStep[], alts: PlanAlternative[]): void {
  const entries = placementsOf(ls);
  let opts;
  if (dim === 'house') opts = houseOptions(c, entries.filter((l) => l.spec.kind === 'house' || l.spec.kind === 'garden'));
  else {
    const p = c.s.players[c.me];
    opts = p && p.restaurantsRemaining > 0 ? restaurantOptions(c, entries.filter((l) => l.spec.kind === 'restaurant')) : [];
  }
  const stage: WorkStage = dim === 'house' ? 'houses' : 'restaurants';
  const options: PlanStep[] = opts.map((o) => ({ dim, stage, cardUid: uid, action: o.action, value: o.value, summary: o.summary }));
  alts.push({ dim, cardUid: uid, options: [...options.slice(0, 3), { dim, stage, cardUid: uid, action: null, value: 0, summary: 'nothing' }] });
  const best = options[0];
  const threshold = dim === 'house' ? HOUSE_THRESHOLD : RESTAURANT_THRESHOLD;
  if (best && best.value >= threshold) steps.push(best);
}

/** Cards Medium has no scorer for (Ketchup lobbyists and friends): the Easy bot's choice. */
function otherStep(c: Ctx, uid: Uid, ls: LegalAction[], stage: WorkStage, steps: PlanStep[]): void {
  const legal = [...ls, { kind: 'ready' as const, label: 'skip', action: { type: 'work.skip' as const, playerId: c.me, cardUid: uid } }, { kind: 'ready' as const, label: 'end', action: { type: 'work.endTurn' as const, playerId: c.me } }];
  let a: Action | null = null;
  try {
    a = easyChoose({ view: c.view, playerId: c.me, legal, engine: c.engine, rng: c.rng, budgetMs: 50 });
  } catch {
    a = null;
  }
  if (!a || a.type === 'work.endTurn' || a.type === 'work.skip') return;
  steps.push({ dim: 'other', stage, cardUid: uid, action: a, value: 1, summary: a.type });
}

/** Medium's Working decision. */
export function chooseWork(c: Ctx): Action {
  const { plan } = workPlan(c);
  const a = executePlan(c, plan);
  // Ending the turn is refused while a card hired from an empty pile still awaits training.
  if (a.type === 'work.endTurn' && c.s.turn?.mustTrain.length) {
    const t = readyOf(c.legal, 'work.train').find((x) => x.type === 'work.train' && c.s.turn?.mustTrain.includes(x.targetUid));
    if (t) return t;
  }
  return a;
}
