/**
 * The bot's reading of the dinner table: every house with its demand and connected sellers
 * (engine `houseOutlook`), a price model (unit price and waitresses per chain, known after the
 * Restructuring reveal, estimated before), win probabilities and a deterministic "shadow
 * Dinnertime" that predicts who sells what (ai-strategy.md §2, §3.6, §5.2).
 */
import type { FoodCounts, FoodId, GameState, House, HouseSeller, PlayerId, Uid } from '@fcm/engine';
import { cardsAtWork, defOf } from '@fcm/engine';
import { memo, type Ctx } from './ctx.js';
import { addCounts, capacityOf, formulaPrice, hasMs, isDrink, saleBonus, stockNow, tipPerWaitress, waitressesIn } from './facts.js';

export interface HouseView {
  id: string;
  order: number;
  house: House;
  demand: FoodCounts;
  nDemand: number;
  capacity: number | null;
  garden: boolean;
  /** Connected chains as the engine ranks them now (scores at current prices). */
  sellers: HouseSeller[];
  /** Campaigns reaching the house, in run order. */
  campaigns: string[];
}

export function houseViews(c: Ctx): HouseView[] {
  return memo(c, 'houses', () => {
    const out: HouseView[] = [];
    for (const h of Object.values(c.s.board.houses)) {
      let o = null;
      try {
        o = c.engine.houseOutlook(c.s, h.id);
      } catch {
        o = null;
      }
      const demand: FoodCounts = {};
      for (const t of h.demand) demand[t.good] = (demand[t.good] ?? 0) + 1;
      out.push({ id: h.id, order: h.order, house: h, demand, nDemand: h.demand.length, capacity: o?.capacity ?? (h.garden ? 5 : 3), garden: Boolean(h.garden), sellers: o?.sellers ?? [], campaigns: o?.campaigns ?? [] });
    }
    return out.sort((a, b) => a.order - b.order);
  });
}

export const sellerOf = (h: HouseView, pid: PlayerId): HouseSeller | undefined => h.sellers.find((x) => x.player === pid);

// ---------------------------------------------------------------------------
// Price model
// ---------------------------------------------------------------------------

export interface PriceModel {
  price: Record<PlayerId, number>;
  waitresses: Record<PlayerId, number>;
  /** Extra $ per house sold (Ketchup fry chefs at work). */
  perHouse: Record<PlayerId, number>;
  /** Structures are revealed: prices are facts, not estimates. */
  certain: boolean;
}

/** Are structures public now (after the Restructuring reveal, before the next one)? */
export const structuresKnown = (s: GameState): boolean => s.phase.kind !== 'restructuring' && s.phase.kind !== 'setup.restaurants' && s.phase.kind !== 'setup.reserve' && s.round > 0;

/** Price a chain will likely charge this round: its cards at work if known, else its negative price cards. */
export function expectedAtWork(c: Ctx, pid: PlayerId): Uid[] {
  const p = c.s.players[pid];
  if (!p) return [];
  if (structuresKnown(c.s)) return cardsAtWork(p);
  // Unknown: assume price cuts and waitresses it owns go to work (luxuries rarely do).
  return Object.keys(p.employees).filter((u) => {
    if (p.busy[u]) return false;
    const a = defOf(c.content, p, u)?.ability;
    return (a?.kind === 'price' && a.delta < 0) || a?.kind === 'waitress' || a?.kind === 'fryChef';
  });
}

export function basePriceModel(c: Ctx): PriceModel {
  return memo(c, 'priceModel', () => {
    const m: PriceModel = { price: {}, waitresses: {}, perHouse: {}, certain: structuresKnown(c.s) };
    for (const pid of c.s.turnOrder) {
      const work = expectedAtWork(c, pid);
      m.price[pid] = enginePrice(c, pid) ?? formulaPrice(c.s, c.content, pid, work);
      if (!m.certain) m.price[pid] = formulaPrice(c.s, c.content, pid, work) + modulePriceOffset(c, pid);
      m.waitresses[pid] = waitressesIn(c.s, c.content, pid, work);
      m.perHouse[pid] = fryBonus(c, pid, work);
    }
    return m;
  });
}

/** The engine's own unit price for a chain (module pipelines included), when it sells anywhere. */
function enginePrice(c: Ctx, pid: PlayerId): number | null {
  for (const h of houseViews(c)) {
    const sl = sellerOf(h, pid);
    if (sl) return sl.unitPrice;
  }
  return null;
}

/** Module price offset (engine price − formula price at current structure), 0 when unknown. */
function modulePriceOffset(c: Ctx, pid: PlayerId): number {
  const p = c.s.players[pid];
  const e = enginePrice(c, pid);
  if (!p || e === null) return 0;
  return e - formulaPrice(c.s, c.content, pid, cardsAtWork(p));
}

function fryBonus(c: Ctx, pid: PlayerId, work: readonly Uid[]): number {
  const p = c.s.players[pid];
  if (!p) return 0;
  let n = 0;
  for (const u of work) {
    const a = defOf(c.content, p, u)?.ability;
    if (a?.kind === 'fryChef') n += a.bonusPerSale;
  }
  return n;
}

/** The price model with `pid`'s structure replaced by `atWork` (my structure candidates). */
export function modelWith(c: Ctx, pid: PlayerId, atWork: readonly Uid[]): PriceModel {
  const base = basePriceModel(c);
  const p = c.s.players[pid];
  const offset = p ? modulePriceOffset(c, pid) : 0;
  return {
    ...base,
    price: { ...base.price, [pid]: formulaPrice(c.s, c.content, pid, atWork) + offset },
    waitresses: { ...base.waitresses, [pid]: waitressesIn(c.s, c.content, pid, atWork) },
    perHouse: { ...base.perHouse, [pid]: fryBonus(c, pid, atWork) },
  };
}

/**
 * Future-looking model for campaigns and development: my price as if every price cut I own (not
 * busy) were at work, rivals as in the base model. Campaigns run for rounds to come.
 */
export function potentialModel(c: Ctx, pid: PlayerId = c.me): PriceModel {
  return memo(c, `potential:${pid}`, () => {
    const p = c.s.players[pid];
    if (!p) return basePriceModel(c);
    const cuts = Object.keys(p.employees).filter((u) => {
      const a = defOf(c.content, p, u)?.ability;
      return !p.busy[u] && ((a?.kind === 'price' && a.delta < 0) || a?.kind === 'waitress');
    });
    const m = modelWith(c, pid, [p.structure.ceo, ...cuts]);
    const base = basePriceModel(c);
    // Cut only as far as undercutting the cheapest rival needs; never below $1.
    const lowest = m.price[pid] ?? 10;
    const current = base.price[pid] ?? 10;
    const rivals = c.s.turnOrder.filter((x) => x !== pid).map((x) => base.price[x] ?? 10);
    const target = rivals.length ? Math.min(...rivals) - 1 : current;
    const price = Math.max(1, Math.min(current, Math.max(lowest, target)));
    return { ...m, price: { ...m.price, [pid]: price }, certain: false };
  });
}

// ---------------------------------------------------------------------------
// Winning houses
// ---------------------------------------------------------------------------

interface Ranked {
  player: PlayerId;
  tier: number;
  score: number;
  waitresses: number;
  order: number;
}

function ranked(c: Ctx, h: HouseView, m: PriceModel): Ranked[] {
  return h.sellers
    .map((sl) => ({
      player: sl.player,
      tier: sl.tier,
      score: sl.score - sl.unitPrice + (m.price[sl.player] ?? sl.unitPrice),
      waitresses: m.waitresses[sl.player] ?? sl.waitresses,
      order: c.s.turnOrder.indexOf(sl.player),
    }))
    .sort((a, b) => a.tier - b.tier || a.score - b.score || b.waitresses - a.waitresses || a.order - b.order);
}

/** Rivals able to supply `good` at all (own a producer / buyer for it, or hold stock). */
export function canEverSupply(c: Ctx, pid: PlayerId, good: FoodId): boolean {
  return memo(c, `canSupply:${pid}:${good}`, () => {
    const p = c.s.players[pid];
    if (!p) return false;
    if ((stockNow(c.s, pid)[good] ?? 0) > 0) return true;
    for (const u of Object.keys(p.employees)) {
      const a = defOf(c.content, p, u)?.ability;
      if (a?.kind === 'produce' && a.foods.includes(good)) return true;
      if (a?.kind === 'buyDrinks' && isDrink(good)) return true;
    }
    return false;
  });
}

/**
 * Probability that `me` wins house `h` for an order that includes `good` (null: the current
 * order), against rivals that could supply it. Step function when prices are known and `soft` is
 * false; a logistic in the score margin otherwise (rivals may still change prices).
 */
export function winProb(c: Ctx, h: HouseView, m: PriceModel, me: PlayerId = c.me, good: FoodId | null = null, soft = !m.certain): number {
  const rs = ranked(c, h, m);
  const mine = rs.find((r) => r.player === me);
  if (!mine) return 0;
  const goods = good ? [good] : (Object.keys(h.demand) as FoodId[]);
  const rivals = rs.filter((r) => r.player !== me && goods.every((g) => canEverSupply(c, r.player, g)));
  if (!rivals.length) return 1;
  const best = rivals[0] as Ranked;
  if (best.tier !== mine.tier) return best.tier > mine.tier ? 1 : 0;
  const margin = best.score - mine.score;
  const tieWin = mine.waitresses !== best.waitresses ? mine.waitresses > best.waitresses : mine.order < best.order;
  if (!soft) return margin > 0 ? 1 : margin < 0 ? 0 : tieWin ? 1 : 0;
  const x = margin + (tieWin ? 0.4 : -0.4);
  return 1 / (1 + Math.exp(-x / 0.9));
}

/** $ one item of `good` earns `pid` at house `h` under model `m`. */
export function unitRevenue(c: Ctx, h: HouseView, m: PriceModel, pid: PlayerId, good: FoodId): number {
  const price = Math.max(0, m.price[pid] ?? c.s.basePrice);
  return price * (h.garden ? 2 : 1) + saleBonus(c.s, pid, good);
}

// ---------------------------------------------------------------------------
// Shadow Dinnertime
// ---------------------------------------------------------------------------

export interface DinnerResult {
  income: Record<PlayerId, number>;
  /** Items each chain sells. */
  sold: Record<PlayerId, FoodCounts>;
  /** Winner per house id (houses with demand only). */
  winner: Record<string, PlayerId | null>;
  /** Demand I lost per good because I lacked stock where I would have won on price. */
  shortfall: FoodCounts;
}

/** Houses in Dinnertime order; first ranked chain holding the whole order sells it (base.md §7). */
export function shadowDinner(c: Ctx, m: PriceModel, stock: Record<PlayerId, FoodCounts>, houses: HouseView[] = houseViews(c), me: PlayerId = c.me): DinnerResult {
  const st: Record<PlayerId, FoodCounts> = {};
  for (const [pid, s] of Object.entries(stock)) st[pid] = { ...s };
  const res: DinnerResult = { income: {}, sold: {}, winner: {}, shortfall: {} };
  for (const pid of c.s.turnOrder) {
    res.income[pid] = 0;
    res.sold[pid] = {};
  }
  for (const h of houses) {
    if (!h.nDemand) continue;
    res.winner[h.id] = null;
    const order = Object.entries(h.demand) as [FoodId, number][];
    let blockedMe = false;
    for (const r of ranked(c, h, m)) {
      const have = st[r.player] ?? {};
      if (!order.every(([g, n]) => (have[g] ?? 0) >= n)) {
        if (r.player === me && !blockedMe) {
          blockedMe = true;
          for (const [g, n] of order) res.shortfall[g] = (res.shortfall[g] ?? 0) + Math.max(0, n - (have[g] ?? 0));
        }
        continue;
      }
      for (const [g, n] of order) {
        have[g] = (have[g] ?? 0) - n;
        res.income[r.player] = (res.income[r.player] ?? 0) + n * unitRevenue(c, h, m, r.player, g);
        const sold = res.sold[r.player] as FoodCounts;
        sold[g] = (sold[g] ?? 0) + n;
      }
      res.income[r.player] = (res.income[r.player] ?? 0) + (m.perHouse[r.player] ?? 0);
      res.winner[h.id] = r.player;
      break;
    }
  }
  return res;
}

/** Tips and CFO on top of sales (base.md §7). */
export function finishIncome(c: Ctx, pid: PlayerId, sales: number, waitresses: number, cfo: boolean): number {
  let income = sales + waitresses * tipPerWaitress(c.s, pid);
  if (cfo || hasMs(c.s, pid, 'first_100')) income = Math.ceil(income * 1.5);
  return income;
}

/** Has `pid` already taken its Working turn this round (its stock is final)? */
export function workedThisRound(c: Ctx, pid: PlayerId): boolean {
  const ph = c.s.phase;
  if (ph.kind !== 'working') return false;
  const idx = c.s.turnOrder.indexOf(pid);
  return idx < ph.idx;
}

/** Stock a rival will have at Dinnertime: final if it already worked, else stock + what its cards make. */
export function rivalStock(c: Ctx, pid: PlayerId): FoodCounts {
  return memo(c, `rivalStock:${pid}`, () => {
    const now = stockNow(c.s, pid);
    if (workedThisRound(c, pid) || (c.s.phase.kind === 'working' && c.s.phase.player === pid)) return now;
    const p = c.s.players[pid];
    if (!p) return now;
    const cards = structuresKnown(c.s) ? cardsAtWork(p) : Object.keys(p.employees).filter((u) => !p.busy[u]);
    return addCounts(now, capacityOf(c, pid, cards, favouriteFood(c, pid)));
  });
}

/** The food a chain is most likely to cook with flexible cooks: what its campaigns advertise. */
export function favouriteFood(c: Ctx, pid: PlayerId): FoodId {
  let burger = 0;
  let pizza = 0;
  for (const camp of Object.values(c.s.board.campaigns)) {
    if (camp.owner !== pid) continue;
    if (camp.goods.includes('burger')) burger++;
    if (camp.goods.includes('pizza')) pizza++;
  }
  return pizza > burger ? 'pizza' : 'burger';
}
