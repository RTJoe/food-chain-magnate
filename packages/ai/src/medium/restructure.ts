/**
 * Restructuring (ai-strategy.md §3.3): which cards go to work. For every useful choice of managers
 * to seat, cards are added greedily by marginal value, where the value of a set of cards is a
 * one-round forecast: the shadow Dinnertime with the prices, waitresses and production the set
 * gives, plus the development value of everything else (hires, training steps, campaigns,
 * milestones). Pricing variants fall out of the same marginal search.
 */
import type { EmployeeDef, FoodCounts, PlayerId, StructureSubmission, Uid } from '@fcm/engine';
import { cardsInHand, ceoSlotsFor, defOf, isOverfilled, managerSlots, submissionProblem } from '@fcm/engine';
import { memo, type Ctx } from '../shared/ctx.js';
import { addCounts, capacityOf, msOpen, roundsLeftEstimate, stockNow } from '../shared/facts.js';
import { basePriceModel, finishIncome, houseViews, modelWith, rivalStock, sellerOf, shadowDinner, winProb, potentialModel, unitRevenue } from '../shared/market.js';
import { cardValue, milestoneValue } from '../shared/values.js';
import { orgPlan, tilesLeft, type OrgPlan } from './orgPlanner.js';

export interface StructureCandidate {
  sub: StructureSubmission;
  atWork: Uid[];
  score: number;
  label: string;
}

interface Eval {
  c: Ctx;
  me: PlayerId;
  plan: OrgPlan;
  defs: Map<Uid, EmployeeDef>;
  stockRivals: Record<PlayerId, FoodCounts>;
  roundsLeft: number;
  /** Marketing value per marketeer, best first (houses I can win with room). */
  campaignSlots: number[];
  /** Open milestones earned by having / using one of these cards at work (Ketchup "used" ones). */
  cardMilestones: { ids: string[]; value: number }[];
  /** Extra income one kimchi in stock would bring (Ketchup kimchi wins every house I can serve). */
  kimchiGain: number;
}

function makeEval(c: Ctx, me: PlayerId): Eval {
  const p = c.s.players[me];
  const defs = new Map<Uid, EmployeeDef>();
  if (p) for (const u of Object.keys(p.employees)) {
    const d = defOf(c.content, p, u);
    if (d) defs.set(u, d);
  }
  const stockRivals: Record<PlayerId, FoodCounts> = {};
  for (const pid of c.s.turnOrder) if (pid !== me) stockRivals[pid] = rivalStock(c, pid);
  const roundsLeft = roundsLeftEstimate(c);
  const plan = orgPlan(c, me);
  return { c, me, plan, defs, stockRivals, roundsLeft, campaignSlots: campaignSlotValues(c, me), cardMilestones: cardMilestones(c, me, roundsLeft), kimchiGain: kimchiGain(c, me, plan, stockRivals) };
}

/** Income one kimchi adds when every card I own (not busy) works: houses won on kimchi priority plus the kimchi sold. */
function kimchiGain(c: Ctx, me: PlayerId, plan: OrgPlan, rivals: Record<PlayerId, FoodCounts>): number {
  const p = c.s.players[me];
  if (!p || !c.content.foods.kimchi) return 0;
  const cards = Object.keys(p.employees).filter((u) => !p.busy[u]);
  const base = addCounts(stockNow(c.s, me), capacityOf(c, me, cards, plan.arch.food));
  const m = basePriceModel(c);
  const without = shadowDinner(c, m, { ...rivals, [me]: { ...base, kimchi: 0 } }, houseViews(c), me).income[me] ?? 0;
  const withK = shadowDinner(c, m, { ...rivals, [me]: { ...base, kimchi: 1 } }, houseViews(c), me).income[me] ?? 0;
  return Math.max(0, withK - without);
}

/**
 * Module milestones triggered by a card being at work or used (New Milestones "first X used",
 * base atWork ones are valued explicitly in scoreSet). Those removed after an early round are urgent.
 */
function cardMilestones(c: Ctx, me: PlayerId, roundsLeft: number): { ids: string[]; value: number }[] {
  const out: { ids: string[]; value: number }[] = [];
  for (const [id, def] of Object.entries(c.content.milestones)) {
    if (!def || def.module === 'base' || !msOpen(c.s, me, def.id)) continue;
    const t = def.trigger;
    if (t.kind !== 'used' && t.kind !== 'atWork') continue;
    const removeAfter = c.s.milestones[def.id]?.removeAfterRound ?? null;
    const urgency = removeAfter !== null && removeAfter >= c.s.round ? 2 : 1;
    out.push({ ids: [...t.employees], value: milestoneValue(c.s, me, def.id, roundsLeft) * 0.5 * urgency });
    void id;
  }
  return out;
}

/**
 * Rough value of each extra marketeer this round: houses connected to me with room, ranked by
 * win chance × revenue; a billboard reaches about two houses, for two rounds.
 */
export function campaignSlotValues(c: Ctx, me: PlayerId): number[] {
  return memo(c, `campSlots:${me}`, () => {
    const m = potentialModel(c, me);
    const vals: number[] = [];
    for (const h of houseViews(c)) {
      const mine = sellerOf(h, me);
      if (!mine || mine.distance > 4) continue;
      if (h.capacity !== null && h.nDemand >= h.capacity) continue;
      vals.push(winProb(c, h, m, me, 'burger', true) * unitRevenue(c, h, m, me, 'burger') * (1 - mine.distance * 0.08));
    }
    vals.sort((a, b) => b - a);
    const slots: number[] = [];
    for (let i = 0; i + 1 < vals.length && slots.length < 4; i += 2) slots.push(((vals[i] ?? 0) + (vals[i + 1] ?? 0)) * 1.6);
    if (vals.length % 2 === 1 && slots.length < 4) slots.push((vals[vals.length - 1] ?? 0) * 1.6);
    return slots;
  });
}

const kindOf = (d: EmployeeDef | undefined) => d?.ability.kind;

/** Score of a set of cards at work (my seat): forecast income + development value. */
function scoreSet(e: Eval, atWork: Uid[]): number {
  const { c, me, plan, defs } = e;
  const s = c.s;
  const work = [s.players[me]?.structure.ceo ?? '', ...atWork];
  const m = modelWith(c, me, work);
  const food = plan.arch.food;
  const myStock = addCounts(stockNow(s, me), capacityOf(c, me, atWork, food));
  const dinner = shadowDinner(c, m, { ...e.stockRivals, [me]: myStock }, houseViews(c), me);
  const cfo = atWork.some((u) => kindOf(defs.get(u)) === 'cfo');
  let v = finishIncome(c, me, dinner.income[me] ?? 0, m.waitresses[me] ?? 0, cfo);

  const h = e.roundsLeft;
  let hireActions = 1; // CEO
  let trainUses = 0;
  let marketeers = 0;
  let unusedDiscount = 0;
  for (const u of atWork) {
    const d = defs.get(u);
    const a = d?.ability;
    if (!d || !a) continue;
    switch (a.kind) {
      case 'recruit':
        hireActions += a.actions;
        unusedDiscount += a.salaryDiscountPerUnused * a.actions;
        break;
      case 'train':
        trainUses += a.actions;
        break;
      case 'marketing':
        if (tilesLeft(c, a.campaigns)) marketeers++;
        break;
      case 'waitress':
        if (msOpen(s, me, 'first_waitress')) v += milestoneValue(s, me, 'first_waitress', h) * 0.5;
        break;
      case 'price':
        if (a.delta < 0 && msOpen(s, me, 'first_lower_prices')) v += milestoneValue(s, me, 'first_lower_prices', h) / Math.max(1, countKind(e, atWork, 'price'));
        break;
      case 'produce':
        // Kimchi master: 1 kimchi at Clean up, so next round I win every house I can serve.
        if (a.timing === 'cleanup') {
          v += Math.max(6, 0.8 * e.kimchiGain);
          break;
        }
        // Coffee sells only along routes past my coffee shops (and other restaurants of mine).
        if (a.foods.includes('coffee')) {
          const shops = Object.values(s.board.entities).filter((x) => x.kind === 'coffeeShop' && x.owner === me).length;
          v += shops ? Math.min(a.amount, 2 + shops) * 4 : 0.2;
          break;
        }
        if (a.foods.includes('burger') && msOpen(s, me, 'first_burger_produced') && food === 'burger') v += milestoneValue(s, me, 'first_burger_produced', h) / Math.max(1, countKind(e, atWork, 'produce'));
        else if (a.foods.includes('pizza') && msOpen(s, me, 'first_pizza_produced') && food === 'pizza') v += milestoneValue(s, me, 'first_pizza_produced', h) / Math.max(1, countKind(e, atWork, 'produce'));
        else v += 0.5; // surplus food can still feed next round's demand (freezer) or be thrown away
        break;
      case 'buyDrinks':
        if (d.id === 'errand_boy' && msOpen(s, me, 'first_errand_boy')) v += milestoneValue(s, me, 'first_errand_boy', h) * 0.5;
        if (d.id === 'cart_operator' && msOpen(s, me, 'first_cart_operator')) v += milestoneValue(s, me, 'first_cart_operator', h) * 0.5;
        v += 0.5;
        break;
      case 'newBusiness':
        v += s.gardenTiles > 0 || s.houseTiles.length ? 7 : 0;
        break;
      case 'restaurant':
        v += (s.players[me]?.restaurantsRemaining ?? 0) > 0 ? (a.mode === 'regional' ? 12 : 9) : 2;
        break;
      case 'manager':
      case 'cfo':
      case 'ceo':
        break;
      case 'nightShift': {
        // Salary-free cards at work act twice.
        const free = atWork.filter((x) => !defs.get(x)?.salary && kindOf(defs.get(x)) !== 'nightShift');
        v += free.reduce((acc, x) => acc + cardValue(defs.get(x)) * 0.5, 0);
        break;
      }
      default:
        v += cardValue(d) * 0.6;
    }
  }
  for (const ms of e.cardMilestones) if (atWork.some((u) => ms.ids.includes(defs.get(u)?.id ?? ''))) v += ms.value;
  // Campaigns: the k-th marketeer gets the k-th best slot.
  for (let i = 0; i < marketeers; i++) v += e.campaignSlots[i] ?? 0;
  if (marketeers > 0 && msOpen(s, me, 'first_billboard') && s.marketingTiles.length) v += milestoneValue(s, me, 'first_billboard', h);

  // Hiring and training for the plan.
  const hiresWanted = plan.hires.length;
  const extraHires = hireActions - 1;
  const usefulHires = Math.min(hireActions, hiresWanted + (s.round <= 3 ? 1 : 0));
  v += 8 * usefulHires;
  if (hireActions >= 3 && msOpen(s, me, 'first_hire_3')) v += milestoneValue(s, me, 'first_hire_3', h);
  // Unused recruiting-manager actions are a salary discount anyway.
  v += Math.max(0, Math.min(unusedDiscount, 5 * (extraHires - Math.max(0, hiresWanted - 1))));
  if (trainUses > 0) {
    const inWork = new Set(atWork);
    const trainees = plan.trains.filter((t) => !inWork.has(t.uid)).length;
    const hireTrainees = plan.hires.slice(0, hireActions).filter((id) => plan.missing.some((mm) => !mm.inProgress && mm.root?.id === id && mm.root.path.length > 0)).length;
    const steps = Math.min(trainUses, trainees + hireTrainees);
    v += 10 * steps;
    if (steps > 0 && msOpen(s, me, 'first_train')) v += milestoneValue(s, me, 'first_train', h);
  }
  // Cards being trained must stay on the beach: playing them forfeits the step.
  return v;
}

function countKind(e: Eval, atWork: Uid[], kind: EmployeeDef['ability']['kind']): number {
  return atWork.filter((u) => kindOf(e.defs.get(u)) === kind).length;
}

/** Lay the chosen cards into a legal pyramid: managers in CEO slots, the rest under them. */
function layout(c: Ctx, me: PlayerId, managers: Uid[], cards: Uid[], ceoSlots: number): StructureSubmission | null {
  const p = c.s.players[me];
  if (!p) return null;
  const def = (u: Uid) => defOf(c.content, p, u);
  const ceoOnly = cards.filter((u) => kindOf(def(u)) === 'nightShift');
  const rest = cards.filter((u) => kindOf(def(u)) !== 'nightShift');
  const ceoSubs: Uid[] = [...managers, ...ceoOnly];
  const managerSubs: Record<Uid, Uid[]> = {};
  const queue = [...rest];
  for (const mgr of managers) managerSubs[mgr] = queue.splice(0, managerSlots(def(mgr)));
  while (queue.length && ceoSubs.length < ceoSlots) ceoSubs.push(queue.shift() as Uid);
  if (queue.length) return null;
  for (const mgr of managers) if (!managerSubs[mgr]?.length) delete managerSubs[mgr];
  const sub = { ceoSubs, managerSubs };
  if (submissionProblem(c.s, me, sub) || isOverfilled(c.s, me, sub)) return null;
  return sub;
}

/** Candidate structures, best first (Hard reuses this list as its Restructuring candidates). */
export function structureCandidates(c: Ctx, n = 6, me: PlayerId = c.me): StructureCandidate[] {
  return memo(c, `structs:${me}:${n}`, () => buildCandidates(c, n, me));
}

function buildCandidates(c: Ctx, n: number, me: PlayerId): StructureCandidate[] {
  const p = c.s.players[me];
  if (!p) return [];
  const e = makeEval(c, me);
  const hand = cardsInHand(p);
  const def = (u: Uid) => e.defs.get(u);
  const managers = hand.filter((u) => kindOf(def(u)) === 'manager' && managerSlots(def(u)) > 0).sort((a, b) => managerSlots(def(b)) - managerSlots(def(a)));
  const others = hand.filter((u) => !(kindOf(def(u)) === 'manager' && managerSlots(def(u)) > 0));
  const ceoSlots = ceoSlotsFor(c.s, c.content, me);

  // Manager subsets: distinct slot multisets of up to ceoSlots managers (largest first).
  const subsets: Uid[][] = [[]];
  const seen = new Set<string>(['']);
  const rec = (start: number, cur: Uid[]) => {
    for (let i = start; i < managers.length && cur.length < ceoSlots; i++) {
      const next = [...cur, managers[i] as Uid];
      const key = next.map((u) => managerSlots(def(u))).join(',');
      if (!seen.has(key)) {
        seen.add(key);
        subsets.push(next);
      }
      if (subsets.length < 24) rec(i + 1, next);
    }
  };
  rec(0, []);

  const out: StructureCandidate[] = [];
  const keys = new Set<string>();
  const push = (mgrs: Uid[], cards: Uid[], label: string) => {
    const sub = layout(c, me, mgrs, cards, ceoSlots);
    if (!sub) return;
    const atWork = [...mgrs, ...cards];
    const key = [...atWork].sort().join(',');
    if (keys.has(key)) return;
    keys.add(key);
    // Seated managers are worth a little (flexibility, turn order slots).
    const score = scoreSet(e, atWork) + mgrs.length * 0.1 - 0.05 * mgrs.filter((m) => def(m)?.salary).length;
    out.push({ sub, atWork, score, label });
  };

  for (const mgrs of subsets) {
    const ceoFree = ceoSlots - mgrs.length;
    const cap = ceoFree + mgrs.reduce((a, u) => a + managerSlots(def(u)), 0);
    const chosen: Uid[] = [];
    let cur = scoreSet(e, [...mgrs]);
    const pool = [...others];
    while (chosen.length < cap && pool.length) {
      let best: Uid[] = [];
      let bestV = 0.01;
      const room = cap - chosen.length;
      // Single cards, plus bundles of same-ability cards (two price cuts can flip a house where
      // one alone only ties), judged per card added.
      const moves: Uid[][] = pool.map((u) => [u]);
      for (const kind of ['price', 'waitress', 'produce'] as const) {
        const same = pool.filter((u) => kindOf(def(u)) === kind);
        for (let k = 2; k <= Math.min(room, same.length, 4); k++) moves.push(same.slice(0, k));
      }
      for (const mv of moves) {
        if (mv.length > room) continue;
        if (mv.some((u) => kindOf(def(u)) === 'nightShift') && chosen.filter((x) => kindOf(def(x)) === 'nightShift').length + mv.length > ceoFree) continue;
        const gain = scoreSet(e, [...mgrs, ...chosen, ...mv]) - cur;
        const v = gain / Math.sqrt(mv.length);
        if (v > bestV) {
          bestV = v;
          best = mv;
        }
      }
      if (!best.length) break;
      for (const u of best) pool.splice(pool.indexOf(u), 1);
      cur = scoreSet(e, [...mgrs, ...chosen, ...best]);
      chosen.push(...best);
    }
    // Managers with nobody under them only cost a CEO slot: drop them.
    const needed = mgrs.length ? trimManagers(c, me, mgrs, chosen, ceoSlots) : mgrs;
    push(needed, chosen, `mgrs:${needed.length}`);
    // Variant: one price card fewer / more (Hard explores these).
    const price = chosen.find((u) => kindOf(def(u)) === 'price');
    if (price) push(needed, chosen.filter((u) => u !== price), 'price-1');
    const spare = pool.find((u) => kindOf(def(u)) === 'price');
    if (spare && chosen.length < cap) push(needed, [...chosen, spare], 'price+1');
  }
  out.sort((a, b) => b.score - a.score);
  if (!out.length) {
    const sub = { ceoSubs: [], managerSubs: {} };
    out.push({ sub, atWork: [], score: 0, label: 'empty' });
  }
  return out.slice(0, n);
}

/** Smallest set of the chosen managers that still seats every chosen card. */
function trimManagers(c: Ctx, me: PlayerId, mgrs: Uid[], cards: Uid[], ceoSlots: number): Uid[] {
  let cur = [...mgrs];
  for (let i = cur.length - 1; i >= 0; i--) {
    const without = cur.filter((_, j) => j !== i);
    if (layout(c, me, without, cards, ceoSlots)) cur = without;
  }
  return cur;
}

/** Medium's submission. Round 1 (CEO only) and empty hands submit an empty structure. */
export function chooseStructure(c: Ctx): StructureSubmission {
  const best = structureCandidates(c, 6)[0];
  return best?.sub ?? { ceoSubs: [], managerSubs: {} };
}

/** Exposed for tests and Hard: the forecast score of an arbitrary set of my cards at work. */
export function structureScore(c: Ctx, atWork: Uid[], me: PlayerId = c.me): number {
  return scoreSet(makeEval(c, me), atWork);
}

