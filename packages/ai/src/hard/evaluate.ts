/**
 * Hard's evaluation function (ai-strategy.md §4.5): a state at a round boundary (next round's
 * Restructuring, or game over) scored in dollars of "my advantage". Reuses the shared market
 * model (shadow Dinnertime, win chances) and value tables, so Medium and Hard agree on what cards,
 * milestones and houses are worth.
 */
import type { FoodId, GameState, PlayerId } from '@fcm/engine';
import { ceoSlotsFor, defOf, managerSlots, salaryBreakdown } from '@fcm/engine';
import { withState, type Ctx } from '../shared/ctx.js';
import { ownedCards, roundsLeftEstimate } from '../shared/facts.js';
import { basePriceModel, finishIncome, houseViews, potentialModel, rivalStock, shadowDinner, unitRevenue, winProb } from '../shared/market.js';
import { cardValue, milestoneValue } from '../shared/values.js';
import { slotCapacity } from '../medium/orgPlanner.js';

export interface Weights {
  cash: number;
  lead: number;
  inc: number;
  incR: number;
  emp: number;
  ms: number;
  org: number;
  pos: number;
  bank: number;
}

/** Tuned weights (start: the design's initial table, ai-strategy.md §4.5). */
export const WEIGHTS: Weights = { cash: 1, lead: 0.6, inc: 0.8, incR: 0.4, emp: 1, ms: 1, org: 1, pos: 0.5, bank: 15 };

export interface Evaluation {
  value: number;
  terms: Record<string, number>;
}

const WIN = 10_000;

/** Discounted horizon: Σ 0.9^k over the rounds that remain (at most 6). */
const discounted = (h: number): number => {
  let t = 0;
  for (let k = 0; k < Math.floor(h); k++) t += 0.9 ** k;
  return t + (h % 1) * 0.9 ** Math.floor(h);
};

interface Side {
  cash: number;
  inc: number;
  sal: number;
  emp: number;
  ms: number;
  pos: number;
}

/**
 * Cards' worth over the horizon, before salary (salaries are already netted out of the income
 * term; subtracting them here too made firing a working cook look profitable). Only as many
 * non-manager cards as the managers can seat count (best first); the rest are idle and worth
 * nothing. Without the cap the search hoards free trainees it will never put to work.
 */
function cardsTerm(c: Ctx, pid: PlayerId, hf: number): number {
  const s = c.s;
  const slots: number[] = [];
  const workers: number[] = [];
  let v = 0;
  for (const o of ownedCards(s, c.content, pid)) {
    const n = managerSlots(o.def);
    if (n > 0) {
      slots.push(n);
      v += cardValue(o.def) * hf;
    } else workers.push(cardValue(o.def));
  }
  const cap = slotCapacity(slots, ceoSlotsFor(s, c.content, pid));
  workers.sort((a, b) => b - a);
  for (let i = 0; i < Math.min(cap, workers.length); i++) v += (workers[i] ?? 0) * hf;
  return v;
}

function milestonesTerm(c: Ctx, pid: PlayerId, roundsLeft: number): number {
  const p = c.s.players[pid];
  if (!p) return 0;
  let v = 0;
  for (const id of Object.keys(p.milestones)) v += milestoneValue(c.s, pid, id as never, roundsLeft) * (roundsLeft / 6);
  return v;
}

/** Spare seats next round ($2 each, at most 6): room to grow without another manager. */
function orgTerm(c: Ctx, pid: PlayerId): number {
  const p = c.s.players[pid];
  if (!p) return 0;
  const slots: number[] = [];
  let others = 0;
  for (const card of Object.values(p.employees)) {
    if (card.uid === p.structure.ceo) continue;
    const def = defOf(c.content, p, card.uid);
    const n = managerSlots(def);
    if (n > 0) slots.push(n);
    else others++;
  }
  const cap = slotCapacity(slots, ceoSlotsFor(c.s, c.content, pid));
  return 2 * Math.min(6, Math.max(0, cap - others));
}

/**
 * Board position: demand campaigns will still bring to houses (beyond next Dinnertime), weighted
 * by my chance to serve it and its price.
 */
function positionTerm(c: Ctx, pid: PlayerId, horizon: number): number {
  const m = potentialModel(c, pid);
  let v = 0;
  for (const h of houseViews(c)) {
    if (!h.campaigns.length || !h.sellers.some((x) => x.player === pid)) continue;
    let adds = 0;
    let room = h.capacity === null ? 8 : Math.max(0, h.capacity - h.nDemand) + Math.max(0, horizon - 1);
    for (const cid of h.campaigns) {
      const camp = c.s.board.campaigns[cid];
      if (!camp) continue;
      const rounds = Math.min(camp.eternal ? horizon : camp.remaining, horizon);
      for (const g of camp.goods as FoodId[]) {
        const n = Math.min(rounds, room);
        if (n <= 0) continue;
        room -= n;
        adds += n * winProb(c, h, m, pid, g, true) * unitRevenue(c, h, m, pid, g);
      }
    }
    v += adds;
  }
  return v;
}

/** Score `s` for `me` (`root` provides the engine, content and the seat's view). */
export function evaluate(root: Ctx, s: GameState, me: PlayerId, w: Weights = WEIGHTS): Evaluation {
  const c = withState(root, s, me);
  const rivals = s.turnOrder.filter((p) => p !== me && !s.players[p]?.bankrupt);
  const cashOf = (p: PlayerId) => s.players[p]?.cash ?? 0;
  const bestRival = rivals.length ? Math.max(...rivals.map(cashOf)) : 0;
  const cashLead = cashOf(me) - bestRival;
  if (s.phase.kind === 'gameOver') {
    const rank = s.phase.ranking.indexOf(me);
    const value = (rank === 0 ? WIN : -WIN * Math.max(1, rank)) + cashLead;
    return { value, terms: { gameOver: rank, cashLead } };
  }

  const roundsLeft = roundsLeftEstimate(c);
  const horizon = Math.max(1, Math.min(6, roundsLeft));
  const hf = discounted(horizon);
  const m = basePriceModel(c);
  const stock: Record<PlayerId, ReturnType<typeof rivalStock>> = {};
  for (const p of s.turnOrder) stock[p] = rivalStock(c, p);
  const dinner = shadowDinner(c, m, stock, houseViews(c), me);
  const hasCfo = (p: PlayerId) => {
    const pl = s.players[p];
    return pl ? Object.keys(pl.employees).some((u) => defOf(c.content, pl, u)?.ability.kind === 'cfo') : false;
  };
  const side = (p: PlayerId): Side => {
    const cp = p === me ? c : withState(root, s, p);
    return {
      cash: cashOf(p),
      inc: finishIncome(cp, p, dinner.income[p] ?? 0, m.waitresses[p] ?? 0, hasCfo(p)),
      sal: salaryBreakdown(s, c.content, p).total,
      emp: cardsTerm(cp, p, hf),
      ms: milestonesTerm(cp, p, roundsLeft),
      pos: positionTerm(cp, p, horizon),
    };
  };
  const mine = side(me);
  const others = rivals.map(side);
  const maxOf = (k: keyof Side) => (others.length ? Math.max(...others.map((o) => o[k])) : 0);
  const netR = others.length ? Math.max(...others.map((o) => o.inc - o.sal)) : 0;
  const incRival = maxOf('inc');

  const lead = w.lead * (1 + (1 - Math.min(10, roundsLeft) / 10));
  const emp = mine.emp - 0.5 * maxOf('emp');
  const ms = mine.ms - 0.5 * maxOf('ms');
  const pos = mine.pos - 0.5 * maxOf('pos');
  const org = orgTerm(c, me);
  const initial = (s.config.intro ? 75 : 50) * s.turnOrder.length;
  const drained = Math.max(0, Math.min(1, 1 - s.bank.cash / Math.max(1, initial)));
  const bank = Math.sign(cashLead + mine.inc - incRival) * w.bank * drained;
  const wide = orgTerm(c, me) < 4;
  const reserve = s.bank.breaks === 0 ? 0 : (s.ceoSlots - 3) * 4 * (wide ? 1 : -1);

  const terms: Record<string, number> = {
    cash: w.cash * mine.cash,
    lead: lead * cashLead,
    inc: w.inc * (mine.inc - mine.sal) * horizon,
    incR: -w.incR * netR * horizon,
    emp: w.emp * emp,
    ms: w.ms * ms,
    org: w.org * org,
    pos: w.pos * pos,
    bank,
    reserve,
  };
  let value = 0;
  for (const v of Object.values(terms)) value += v;
  return { value, terms };
}
