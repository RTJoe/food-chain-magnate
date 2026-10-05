/**
 * Produce food and buy drinks (ai-strategy.md §3.5.4). Production costs nothing, so every
 * producer works; the choices are which food a flexible cook makes, which drink an errand boy
 * fetches and which route a cart/truck/zeppelin drives. Each is chosen by the shadow Dinnertime:
 * the option that sells the most this round (surplus kept for the freezer counts a little).
 */
import type { Action, FoodCounts, FoodId, LegalAction, PlayerId, Uid } from '@fcm/engine';
import { freezerCapacity } from '@fcm/engine';
import { actionFromPlacement } from '../heuristics.js';
import { type Ctx, type PlacementLegal, defFor } from '../shared/ctx.js';
import { addCounts, msOpen, roundsLeftEstimate, stockNow, totalCount } from '../shared/facts.js';
import { basePriceModel, finishIncome, houseViews, rivalStock, shadowDinner } from '../shared/market.js';
import type { PlanStep } from '../shared/plan.js';
import { milestoneValue } from '../shared/values.js';
import { chooseFood } from './archetype.js';

interface FoodOption {
  action: Action;
  gain: FoodCounts;
  summary: string;
}

function optionsFor(c: Ctx, uid: Uid, entries: LegalAction[]): FoodOption[] {
  const out: FoodOption[] = [];
  const def = defFor(c, c.me, uid);
  for (const l of entries) {
    if (l.kind === 'ready') {
      const a = l.action;
      if (a.type === 'work.produce' && def?.ability.kind === 'produce') {
        const food = (a.food ?? def.ability.foods[0]) as FoodId;
        out.push({ action: a, gain: { [food]: def.ability.amount }, summary: `make ${def.ability.amount} ${food}` });
      } else if (a.type === 'work.buyDrinks' && a.route.mode === 'errand') {
        const n = 1 + (c.s.players[c.me]?.milestones.first_errand_boy ? 1 : 0);
        out.push({ action: a, gain: { [a.route.drink]: n }, summary: `fetch ${a.route.drink}` });
      } else if (a.type !== 'work.skip' && a.type !== 'work.endTurn') {
        out.push({ action: a, gain: {}, summary: a.type });
      }
    } else if (l.kind === 'placement' && l.spec.kind === 'buyerRoute') {
      let routes;
      try {
        routes = c.engine.legalPlacements(c.s, c.me, l.spec);
      } catch {
        continue;
      }
      const ranked = routes
        .filter((r): r is Extract<typeof r, { kind: 'buyerRoute' }> => r.kind === 'buyerRoute')
        .map((r) => {
          const gain: FoodCounts = {};
          for (const x of r.collects) {
            const d = c.s.board.drinkSources[x.sourceId]?.drink;
            if (d) gain[d] = (gain[d] ?? 0) + x.count;
          }
          return { r, gain };
        })
        .sort((a, b) => totalCount(b.gain) - totalCount(a.gain))
        .slice(0, 40);
      for (const { r, gain } of ranked) {
        const a = actionFromPlacement(c.s, c.me, l as PlacementLegal, r);
        if (a) out.push({ action: a, gain, summary: `route ${Object.entries(gain).map(([g, n]) => `${n}${g}`).join('+')}` });
      }
    }
  }
  return out;
}

/** Value of holding `stock` at Dinnertime: my sales + a little for leftovers (freezer). */
function stockValue(c: Ctx, me: PlayerId, stock: FoodCounts): number {
  const m = basePriceModel(c);
  const all: Record<PlayerId, FoodCounts> = {};
  for (const pid of c.s.turnOrder) all[pid] = pid === me ? stock : rivalStock(c, pid);
  const d = shadowDinner(c, m, all, houseViews(c), me);
  const sold = totalCount(d.sold[me] ?? {});
  const left = totalCount(stock) - sold;
  const keep = Math.min(left, freezerCapacity(c.s, me));
  return finishIncome(c, me, d.income[me] ?? 0, 0, false) + keep * 2 + (left - keep) * 0.05;
}

/**
 * Plan steps for every food-stage card with uses left, chosen one card at a time (fixed cooks
 * first, then flexible ones, buyers last) against the stock built so far. Returns the steps and,
 * per card, the ranked options (Hard's production alternatives).
 */
export function foodSteps(c: Ctx, cards: Map<Uid, LegalAction[]>): { steps: PlanStep[]; alts: { cardUid: Uid; options: PlanStep[] }[] } {
  const me = c.me;
  let stock = stockNow(c.s, me);
  const steps: PlanStep[] = [];
  const alts: { cardUid: Uid; options: PlanStep[] }[] = [];
  const main = chooseFood(c, me);
  const rounds = roundsLeftEstimate(c);
  const flexibility = (uid: Uid) => {
    const a = defFor(c, me, uid)?.ability;
    if (a?.kind === 'produce') return a.foods.length > 1 ? 1 : 0;
    return a?.kind === 'buyDrinks' ? (a.mode === 'errand' ? 2 : 3) : 4;
  };
  const uids = [...cards.keys()].sort((a, b) => flexibility(a) - flexibility(b));
  for (const uid of uids) {
    const opts = optionsFor(c, uid, cards.get(uid) ?? []);
    if (!opts.length) continue;
    const base = stockValue(c, me, stock);
    const scored = opts.map((o) => {
      let v = stockValue(c, me, addCounts(stock, o.gain)) - base + totalCount(o.gain) * 0.01;
      for (const g of Object.keys(o.gain) as FoodId[]) {
        if (g === 'burger' && msOpen(c.s, me, 'first_burger_produced')) v += milestoneValue(c.s, me, 'first_burger_produced', rounds);
        if (g === 'pizza' && msOpen(c.s, me, 'first_pizza_produced')) v += milestoneValue(c.s, me, 'first_pizza_produced', rounds) * (main === 'pizza' ? 1 : 0.8);
        if (g === main) v += 0.3;
      }
      return { o, v };
    });
    scored.sort((a, b) => b.v - a.v);
    const toStep = (x: { o: FoodOption; v: number }): PlanStep => ({ dim: 'food', stage: 'food', cardUid: uid, action: x.o.action, value: x.v, summary: x.o.summary });
    const best = scored[0];
    if (!best) continue;
    steps.push(toStep(best));
    alts.push({ cardUid: uid, options: scored.slice(0, 3).map(toStep) });
    stock = addCounts(stock, best.o.gain);
  }
  return { steps, alts };
}
