/**
 * Player facts read from a state: owned cards, unit price for a set of cards at work, waitresses,
 * production capacity, salaries, milestones. Pure reads; no rules of their own beyond arithmetic
 * that mirrors the engine (pricing.ts, payday.ts) for hypothetical structures.
 */
import type { EmployeeDef, EmployeeId, FoodCounts, FoodId, GameState, MilestoneId, PlayerId, Uid } from '@fcm/engine';
import { cardsAtWork, defOf, salaryBreakdown } from '@fcm/engine';
import type { Content } from '../heuristics.js';
import { memo, type Ctx } from './ctx.js';

export const DRINK_IDS: readonly FoodId[] = ['beer', 'lemonade', 'soft_drink'];
export const isDrink = (g: FoodId): boolean => DRINK_IDS.includes(g);

export const hasMs = (s: GameState, pid: PlayerId, id: MilestoneId): boolean => Boolean(s.players[pid]?.milestones[id]);

/** Can `pid` still earn milestone `id` (in play, not removed, not owned)? */
export function msOpen(s: GameState, pid: PlayerId, id: MilestoneId): boolean {
  const m = s.milestones[id];
  if (!m || m.removed || hasMs(s, pid, id)) return false;
  return m.claimedRound === null || m.claimedRound === s.round;
}

export interface OwnedInfo {
  uid: Uid;
  id: EmployeeId;
  def: EmployeeDef;
  place: 'work' | 'beach' | 'busy' | 'hand';
}

export function ownedCards(s: GameState, content: Content, pid: PlayerId): OwnedInfo[] {
  const p = s.players[pid];
  if (!p) return [];
  const work = new Set(cardsAtWork(p));
  const beach = new Set(p.beach);
  const out: OwnedInfo[] = [];
  for (const card of Object.values(p.employees)) {
    if (card.uid === p.structure.ceo) continue;
    const def = content.employees[card.employeeId];
    if (!def) continue;
    const place = p.busy[card.uid] ? 'busy' : beach.has(card.uid) ? 'beach' : work.has(card.uid) ? 'work' : 'hand';
    out.push({ uid: card.uid, id: card.employeeId, def, place });
  }
  return out;
}

export function countOwned(s: GameState, pid: PlayerId, ids: readonly EmployeeId[]): number {
  const p = s.players[pid];
  if (!p) return 0;
  return Object.values(p.employees).filter((c) => ids.includes(c.employeeId)).length;
}

export const priceDeltaOf = (def: EmployeeDef | undefined): number => (def?.ability.kind === 'price' ? def.ability.delta : 0);

/** Unit price formula (base.md §7.5) for the given cards at work, before module pipelines. */
export function formulaPrice(s: GameState, content: Content, pid: PlayerId, atWork: readonly Uid[]): number {
  const p = s.players[pid];
  if (!p) return s.basePrice;
  let price = s.basePrice;
  for (const u of atWork) price += priceDeltaOf(defOf(content, p, u));
  if (hasMs(s, pid, 'first_lower_prices')) price -= 1;
  return price;
}

export function waitressesIn(s: GameState, content: Content, pid: PlayerId, atWork: readonly Uid[]): number {
  const p = s.players[pid];
  if (!p) return 0;
  return atWork.filter((u) => defOf(content, p, u)?.ability.kind === 'waitress').length;
}

export const tipPerWaitress = (s: GameState, pid: PlayerId): number => 3 + (hasMs(s, pid, 'first_waitress') ? 2 : 0);

/** $ bonus per item sold (milestones *_marketed; not doubled by gardens). */
export function saleBonus(s: GameState, pid: PlayerId, good: FoodId): number {
  if (good === 'burger' && hasMs(s, pid, 'first_burger_marketed')) return 5;
  if (good === 'pizza' && hasMs(s, pid, 'first_pizza_marketed')) return 5;
  if (isDrink(good) && hasMs(s, pid, 'first_drink_marketed')) return 5;
  return 0;
}

/** Per-source amount of a road/air buyer for `pid` (first_errand_boy bonus). */
export function buyerPerSource(s: GameState, pid: PlayerId, def: EmployeeDef): number {
  if (def.ability.kind !== 'buyDrinks') return 0;
  return def.ability.perSource + (hasMs(s, pid, 'first_errand_boy') ? 1 : 0);
}

/**
 * Goods a set of cards brings in one Working phase. Flexible cooks (kitchen trainee) count towards
 * `flexGood`; buyers count `drinksPerBuyer` estimated items spread over the drinks near the player.
 */
export function capacityOf(c: Ctx, pid: PlayerId, uids: readonly Uid[], flexGood: FoodId = 'burger'): FoodCounts {
  const s = c.s;
  const p = s.players[pid];
  const out: FoodCounts = {};
  if (!p) return out;
  const drinks = drinkMix(c, pid);
  for (const u of uids) {
    const def = defOf(c.content, p, u);
    const a = def?.ability;
    if (!a || !def) continue;
    if (a.kind === 'produce' && a.timing === 'working') {
      const g = a.foods.includes(flexGood) ? flexGood : (a.foods[0] as FoodId);
      out[g] = (out[g] ?? 0) + a.amount;
    } else if (a.kind === 'buyDrinks') {
      if (a.mode === 'errand') {
        const g = drinks[0] ?? 'soft_drink';
        out[g] = (out[g] ?? 0) + 1 + (hasMs(s, pid, 'first_errand_boy') ? 1 : 0);
      } else {
        const per = buyerPerSource(s, pid, def);
        const sources = Math.min(drinks.length, a.mode === 'air' ? 3 : 2) || 0;
        for (let i = 0; i < sources; i++) {
          const g = drinks[i] as FoodId;
          out[g] = (out[g] ?? 0) + per;
        }
      }
    }
  }
  return out;
}

/** Drinks near the player's restaurants, most common first (manhattan proxy for buyer routes). */
export function drinkMix(c: Ctx, pid: PlayerId): FoodId[] {
  return memo(c, `drinkMix:${pid}`, () => {
    const ents = Object.values(c.s.board.restaurants).filter((r) => r.owner === pid && r.status !== 'derelict');
    const count: Partial<Record<FoodId, number>> = {};
    for (const src of Object.values(c.s.board.drinkSources)) {
      const d = Math.min(...ents.map((r) => Math.abs(r.x - src.x) + Math.abs(r.y - src.y)), 99);
      if (d <= 8) count[src.drink] = (count[src.drink] ?? 0) + (d <= 4 ? 2 : 1);
    }
    return (Object.entries(count) as [FoodId, number][]).sort((a, b) => b[1] - a[1]).map(([g]) => g);
  });
}

export function addCounts(a: FoodCounts, b: FoodCounts): FoodCounts {
  const out: FoodCounts = { ...a };
  for (const [g, n] of Object.entries(b) as [FoodId, number][]) out[g] = (out[g] ?? 0) + n;
  return out;
}

export const totalCount = (c: FoodCounts): number => Object.values(c).reduce<number>((a, n) => a + (n ?? 0), 0);

export function stockNow(s: GameState, pid: PlayerId): FoodCounts {
  const p = s.players[pid];
  return p ? addCounts(p.inventory, p.freezer) : {};
}

export interface SalaryInfo {
  owed: number;
  salaried: number;
  cash: number;
}

export function salaryInfo(c: Ctx, pid: PlayerId = c.me): SalaryInfo {
  const bd = salaryBreakdown(c.s, c.content, pid);
  return { owed: bd.total, salaried: bd.salaried, cash: c.s.players[pid]?.cash ?? 0 };
}

/** Per-round income rate of the table (last Dinnertime's earnings), for bank-break estimates. */
export function roundsLeftEstimate(c: Ctx): number {
  return memo(c, 'roundsLeft', () => {
    const s = c.s;
    const players = s.turnOrder.filter((id) => !s.players[id]?.bankrupt);
    const income = players.reduce((a, id) => a + Math.max(0, s.players[id]?.earningsThisRound ?? 0), 0);
    const rate = Math.max(8 * players.length, income);
    let pool = s.bank.cash;
    if (s.bank.breaks === 0 && !s.config.intro) {
      for (const id of players) pool += c.view.visibleReserves[id]?.amount ?? 200;
    }
    return Math.max(1, Math.min(12, pool / rate));
  });
}

/** New Milestones: $ leaving the bank each Restructuring for the first discount manager's owner. */
export const BURN = 100;
export const BURN_MS = 'ketchup:first_discount_manager_used' as MilestoneId;

/** Total price cut (positive $) of `uids` (New Milestones bank burn needs $3 or more). */
export function discountOf(c: Ctx, pid: PlayerId, uids: readonly Uid[]): number {
  const p = c.s.players[pid];
  if (!p) return 0;
  return -uids.reduce((a, u) => a + Math.min(0, priceDeltaOf(defOf(c.content, p, u))), 0);
}

/** Can `pid` burn $100 a round (New Milestones): holds the milestone and owns $3+ of price cuts. */
export function burnsBank(c: Ctx, pid: PlayerId): boolean {
  const p = c.s.players[pid];
  if (!p || !hasMs(c.s, pid, BURN_MS)) return false;
  return discountOf(c, pid, Object.keys(p.employees).filter((u) => !p.busy[u])) >= 3;
}

/**
 * How badly the game is stalling, 0..1 (bots are stateless, so this is read from the state alone).
 * The bank only falls by what Dinnertime pays out minus the salaries paid back in at Payday; when
 * that net drain would take many more rounds to empty the bank, late in the game, nothing is
 * pushing towards the end (small maps, price wars, idle salaried cards). Medium then places more
 * campaigns, puts more marketeers to work and fires salaried cards that sat on the beach.
 */
export function stallPressure(c: Ctx): number {
  return memo(c, 'stall', () => {
    const s = c.s;
    if (s.config.intro || s.round < 10) return 0;
    const players = s.turnOrder.filter((id) => !s.players[id]?.bankrupt);
    let net = 0;
    for (const id of players) net += Math.max(0, s.players[id]?.earningsThisRound ?? 0) - salaryBreakdown(s, c.content, id).total + (burnsBank(c, id) ? BURN : 0);
    let pool = s.bank.cash;
    if (s.bank.breaks === 0) for (const id of players) pool += c.view.visibleReserves[id]?.amount ?? 200;
    const rounds = pool / Math.max(1, net);
    const slow = Math.max(0, Math.min(1, (rounds - 8) / 12));
    const late = Math.max(0, Math.min(1, (s.round - 10) / 5));
    return slow * late;
  });
}
