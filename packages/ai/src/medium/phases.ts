/**
 * The short decisions: setup (first restaurant, reserve card), order of business, Payday firing,
 * Clean up freezer (ai-strategy.md §3.4, §3.7, §3.8).
 */
import type { Action, FoodCounts, FoodId, ReserveCard, Uid } from '@fcm/engine';
import { cardsAtWork, freezerCapacity, salaryBreakdown, salariedCards, stockOf, voluntarilyFireable } from '@fcm/engine';
import { placementsOf, readyOf, type Ctx } from '../shared/ctx.js';
import { roundsLeftEstimate } from '../shared/facts.js';
import { basePriceModel, houseViews, winProb } from '../shared/market.js';
import { cardValue } from '../shared/values.js';
import { chooseArchetype } from './archetype.js';
import { restaurantOptions } from './develop.js';
import { orgPlan, tilesLeft } from './orgPlanner.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function chooseSetupRestaurant(c: Ctx): Action[] {
  const opts = restaurantOptions(c, placementsOf(c.legal), c.me, 14);
  return [...opts.map((o) => o.action), ...readyOf(c.legal, 'setup.pass')];
}

/** Reserve card (§3.8): $300 / 4 slots by default; narrower for fast strategies. */
export function chooseReserve(c: Ctx): Action[] {
  const opts = readyOf(c.legal, 'setup.chooseReserve').filter((a): a is Extract<Action, { type: 'setup.chooseReserve' }> => a.type === 'setup.chooseReserve');
  const arch = chooseArchetype(c).id;
  const score = (r: ReserveCard): number => {
    // Reserve Prices: a $5 base price makes the bank last forever (price war); never vote for it.
    if (r.kind === 'price') return r.basePrice === 20 ? (arch === 'luxury' || arch === 'cfo_rush' ? 3 : 1) : r.basePrice === 5 ? -1 : 2;
    if (arch === 'milestone_racer' || arch === 'cfo_rush') return r.amount === 100 ? 2 : r.amount === 300 ? 1 : 0;
    if (arch === 'drinks_waitress') return r.amount === 200 ? 2 : r.amount === 300 ? 1 : 0;
    return r.amount === 300 ? 2 : r.amount === 200 ? 1 : 0;
  };
  return [...opts].sort((a, b) => score(b.card) - score(a.card));
}

// ---------------------------------------------------------------------------
// Order of business
// ---------------------------------------------------------------------------

/** Earliest position, unless going last is worth more (regional manager waiting to react). */
export function chooseOrder(c: Ctx): Action[] {
  const opts = readyOf(c.legal, 'order.choosePosition').filter((a): a is Extract<Action, { type: 'order.choosePosition' }> => a.type === 'order.choosePosition');
  return [...opts].sort((a, b) => orderValue(c, b.position) - orderValue(c, a.position));
}

/** Value of a turn-order position (higher = better); exposed for Hard. */
export function orderValue(c: Ctx, position: number): number {
  const n = c.s.turnOrder.length;
  const p = c.s.players[c.me];
  // Earlier positions win dinner ties and get first pick of campaign / restaurant spots.
  let v = (n - position) * 2;
  if (p) {
    const regional = cardsAtWork(p).some((u) => c.content.employees[p.employees[u]?.employeeId ?? 'ceo']?.id === 'regional_manager');
    if (regional && position === n - 1) v += 1;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Payday
// ---------------------------------------------------------------------------

/** Per-round worth of a card for keeping it (plan cards are kept). */
function keepValue(c: Ctx, uid: Uid, planned: Set<Uid>): number {
  const p = c.s.players[c.me];
  const def = p ? c.content.employees[p.employees[uid]?.employeeId ?? 'ceo'] : undefined;
  if (idle(c, uid)) return 0;
  let v = cardValue(def);
  if (planned.has(uid)) v += 10;
  return v;
}

/**
 * A salaried card with nothing to do: cooks / buyers of goods no connected house wants and no
 * campaign of mine advertises, marketeers whose campaign tiles are all gone.
 */
function idle(c: Ctx, uid: Uid): boolean {
  const p = c.s.players[c.me];
  const a = p ? c.content.employees[p.employees[uid]?.employeeId ?? 'ceo']?.ability : undefined;
  if (!a) return false;
  const wanted = (goods: readonly FoodId[]): boolean => {
    for (const h of houseViews(c)) if (h.sellers.some((x) => x.player === c.me) && goods.some((g) => (h.demand[g] ?? 0) > 0)) return true;
    return Object.values(c.s.board.campaigns).some((camp) => camp.owner === c.me && camp.goods.some((g) => goods.includes(g)));
  };
  if (a.kind === 'produce' && a.timing === 'working') return !wanted(a.foods);
  if (a.kind === 'buyDrinks') return !wanted(['beer', 'lemonade', 'soft_drink']);
  if (a.kind === 'marketing') return !tilesLeft(c, a.campaigns);
  return false;
}

/** Voluntary firing (§3.7): salaried cards the plan has no use for, and whatever cash forces. */
export function fireCandidates(c: Ctx, n = 4): Uid[][] {
  const me = c.me;
  const p = c.s.players[me];
  if (!p) return [[]];
  const plan = orgPlan(c);
  const planned = new Set<Uid>([...plan.covered.values(), ...plan.trains.map((t) => t.uid)]);
  const salaried = new Set(salariedCards(c.s, c.content, me));
  const pool = voluntarilyFireable(p)
    .filter((u) => salaried.has(u))
    .sort((a, b) => keepValue(c, a, planned) - keepValue(c, b, planned));
  const bd = salaryBreakdown(c.s, c.content, me);
  const rounds = roundsLeftEstimate(c);
  const base: Uid[] = [];
  let owed = bd.total;
  // Cash: never let salaries exceed cash (forced firing picks worse).
  for (const u of pool) {
    if (owed <= p.cash) break;
    base.push(u);
    owed -= bd.rate;
  }
  // Idle salaried extras that will not pay back before the game ends; idle planned cards only
  // when cash is tight.
  const tight = p.cash - owed < 15;
  for (const u of pool) {
    if (base.includes(u)) continue;
    if (planned.has(u) ? tight && idle(c, u) : keepValue(c, u, planned) < 5 || rounds < 1.5) base.push(u);
  }
  const out: Uid[][] = [base];
  for (let k = 0; k < pool.length && out.length < n; k++) {
    const u = pool[k] as Uid;
    out.push(base.includes(u) ? base.filter((x) => x !== u) : [...base, u]);
  }
  return out;
}

export function choosePayday(c: Ctx): Action[] {
  const fire = fireCandidates(c, 1)[0] ?? [];
  const confirm: Action = { type: 'payday.confirm', playerId: c.me };
  return fire.length ? [{ type: 'payday.fire', playerId: c.me, uids: fire }, confirm] : [confirm];
}

/** Forced firing: cheapest cards to lose first, busy marketeers last; stop once payable. */
export function forcedFire(c: Ctx): Uid[] {
  const me = c.me;
  const p = c.s.players[me];
  if (!p) return [];
  const plan = orgPlan(c);
  const planned = new Set<Uid>([...plan.covered.values(), ...plan.trains.map((t) => t.uid)]);
  const bd = salaryBreakdown(c.s, c.content, me);
  const off = bd.discounts.reduce((a, d) => a + d.amount, 0);
  const sal = salariedCards(c.s, c.content, me).sort((a, b) => Number(Boolean(p.busy[a])) - Number(Boolean(p.busy[b])) || keepValue(c, a, planned) - keepValue(c, b, planned));
  const out: Uid[] = [];
  let remaining = sal.length;
  for (const u of sal) {
    if (Math.max(0, remaining * bd.rate - off) <= p.cash) break;
    out.push(u);
    remaining--;
  }
  return out.length ? out : sal.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Clean up
// ---------------------------------------------------------------------------

/** Freezer: keep what next round's demand (houses I can win) wants, drinks before food. */
export function chooseFreezer(c: Ctx): Action[] {
  const me = c.me;
  const cap = freezerCapacity(c.s, me);
  const keep: FoodCounts = {};
  if (cap > 0) {
    const m = basePriceModel(c);
    const want: FoodCounts = {};
    for (const h of houseViews(c)) {
      const feeds = h.campaigns.map((cid) => c.s.board.campaigns[cid]).filter(Boolean);
      for (const camp of feeds) for (const g of camp?.goods ?? []) want[g] = (want[g] ?? 0) + winProb(c, h, m, me, g, true);
      for (const [g, n] of Object.entries(h.demand) as [FoodId, number][]) want[g] = (want[g] ?? 0) + n * winProb(c, h, m, me, g, true);
    }
    const foods = c.content.foods;
    const stock = (Object.entries(stockOf(c.s, me)) as [FoodId, number][]).filter(([g]) => (foods[g]?.freezer ?? 'yes') === 'yes');
    stock.sort((a, b) => (want[b[0]] ?? 0) - (want[a[0]] ?? 0) || b[1] - a[1]);
    let left = cap;
    for (const [g, n] of stock) {
      if (left <= 0) break;
      const k = Math.min(n, left);
      keep[g] = k;
      left -= k;
    }
  }
  return [
    { type: 'cleanup.freezer', playerId: me, keep },
    { type: 'cleanup.freezer', playerId: me, keep: {} },
  ];
}

