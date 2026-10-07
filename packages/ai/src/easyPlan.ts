/**
 * The Easy bot's plan: one fixed build list for its main food (no archetypes, no lookahead),
 * matched against the cards it owns. It says which entry-level cards to hire, which owned cards to
 * train next, which cards are worth a seat, and which salaried cards it has no use for.
 */
import type { EmployeeDef, EmployeeId, FoodCounts, FoodId, PlayerId, Uid } from '@fcm/engine';
import { ceoSlotsFor, ownsUnique, salaryBreakdown } from '@fcm/engine';
import { memo, type Ctx } from './shared/ctx.js';
import { countOwned, drinkMix, isDrink, msOpen, ownedCards, salaryInfo, stockNow, type OwnedInfo } from './shared/facts.js';
import { houseViews, sellerOf } from './shared/market.js';
import { incomeGuess, rootOf, slotCapacity, trainPath } from './medium/orgPlanner.js';

export interface EasyTrain {
  uid: Uid;
  /** Training steps to the target (first = the next training). */
  path: EmployeeId[];
  target: EmployeeId;
  /** Training into the target starts a salary. */
  salaryAdded: boolean;
}

export interface EasyHire {
  id: EmployeeId;
  /** The card is only a step towards the target: it needs a trainer. */
  needsTraining: boolean;
}

export interface EasyPlan {
  food: FoodId;
  build: EmployeeId[];
  /** Owned cards to train, in build order (already filtered by salary room). */
  trains: EasyTrain[];
  /** Entry-level cards to hire, best first. */
  hires: EasyHire[];
  /** Owned cards the plan has no use for. */
  extras: Set<Uid>;
  /** More salaried cards the chain can carry next Payday. */
  salaryRoom: number;
  /** Training actions of the trainers owned. */
  trainActions: number;
}

const cookOf = (f: FoodId): EmployeeId => (f === 'pizza' ? 'pizza_cook' : 'burger_cook');
const chefOf = (f: FoodId): EmployeeId => (f === 'pizza' ? 'pizza_chef' : 'burger_chef');

/** Burger or pizza: sticky once a cook is owned, else what my connected houses want and rivals cook less. */
export function easyFood(c: Ctx, me: PlayerId = c.me): FoodId {
  return memo(c, `easyFood:${me}`, () => {
    const s = c.s;
    const burgers = countOwned(s, me, ['burger_cook', 'burger_chef']);
    const pizzas = countOwned(s, me, ['pizza_cook', 'pizza_chef']);
    if (burgers !== pizzas) return burgers > pizzas ? 'burger' : 'pizza';
    let b = 0.1;
    let p = 0;
    for (const h of houseViews(c)) {
      if (!sellerOf(h, me)) continue;
      b += h.demand.burger ?? 0;
      p += h.demand.pizza ?? 0;
    }
    for (const camp of Object.values(s.board.campaigns)) {
      if (camp.owner !== me) continue;
      if (camp.goods.includes('burger')) b += 2;
      if (camp.goods.includes('pizza')) p += 2;
    }
    for (const pid of s.turnOrder) {
      if (pid === me) continue;
      b -= 1.5 * countOwned(s, pid, ['burger_cook', 'burger_chef']);
      p -= 1.5 * countOwned(s, pid, ['pizza_cook', 'pizza_chef']);
    }
    return p > b ? 'pizza' : 'burger';
  });
}

/** Marketing tiles of these kinds are still in the supply. */
export function tilesLeft(c: Ctx, kinds: readonly string[]): boolean {
  const tiles = c.content.marketingTiles;
  return c.s.marketingTiles.some((n) => kinds.includes(tiles[n]?.kind ?? ''));
}

/** A marketeer without tiles of its kinds is replaced by the next card up its career. */
function usableMarketeer(c: Ctx, id: EmployeeId): EmployeeId {
  let cur = id;
  for (let i = 0; i < 4; i++) {
    const a = c.content.employees[cur]?.ability;
    if (a?.kind !== 'marketing' || tilesLeft(c, a.campaigns)) return cur;
    const next = c.content.employees[cur]?.trainsInto.find((n) => c.content.employees[n]?.ability.kind === 'marketing');
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

const broke = (c: Ctx, me: PlayerId): boolean => {
  const p = c.s.players[me];
  return Boolean(p) && c.s.round >= 4 && p!.cash < 10 && p!.earningsThisRound < 10;
};

const marketingNow = (c: Ctx, me: PlayerId): boolean => Object.values(c.s.board.campaigns).some((k) => k.owner === me);

/** The fixed build list: market early, a trainer, cooks, slots, then expansion. */
function buildList(c: Ctx, me: PlayerId, food: FoodId): EmployeeId[] {
  const s = c.s;
  const p = s.players[me];
  const C = cookOf(food);
  const list: EmployeeId[] = ['marketing_trainee', 'kitchen_trainee', 'trainer', 'management_trainee', C, 'marketing_trainee', C];
  if (drinkMix(c, me).length) list.push('errand_boy');
  list.push('waitress', 'junior_vp', 'campaign_manager');
  // Broke with no sales: a waitress's tips are the only free income (and pay the next salary).
  if (broke(c, me)) list.unshift('waitress');
  // Stuck (few houses within reach, or no campaign of mine on the board for a while): a bigger
  // marketeer and a second restaurant come right after the first cook.
  const reachable = houseViews(c).filter((h) => sellerOf(h, me)).length;
  const marketing = marketingNow(c, me);
  const fewHouses = s.round >= 3 && reachable <= 2;
  const noCampaigns = s.round >= 5 && !marketing;
  if (noCampaigns) list.splice(list.indexOf(C), 0, 'campaign_manager');
  if ((p?.restaurantsRemaining ?? 0) > 0) {
    if (fewHouses || noCampaigns) list.splice(list.indexOf(C) + 1, 0, 'local_manager');
    else list.push('local_manager');
  }
  if (s.houseTiles.length || s.gardenTiles > 0) list.push('new_business_developer');
  list.push(chefOf(food), 'pricing_manager', 'marketing_trainee', 'waitress', 'marketing_trainee');
  return list.filter((id) => c.content.employees[id] && s.supply[id] !== undefined).map((id) => usableMarketeer(c, id));
}

/**
 * Early on a marketeer stuck on an eternal campaign still fills its place in the plan (Easy is slow
 * to scale its marketing); from this round on it is replaced, so long games keep their campaigns.
 */
const REPLACE_SPENT_FROM_ROUND = 8;
/** A busy marketeer on an eternal campaign never comes back: the plan does not count it. */
function spent(c: Ctx, me: PlayerId, o: OwnedInfo): boolean {
  const ids = c.s.players[me]?.busy[o.uid];
  return Boolean(ids?.length) && ids!.every((id) => c.s.board.campaigns[id]?.eternal);
}

export function easyPlan(c: Ctx, me: PlayerId = c.me): EasyPlan {
  return memo(c, `easyPlan:${me}`, () => {
    const s = c.s;
    const p = s.players[me];
    const food = easyFood(c, me);
    const build = buildList(c, me, food);
    const owned = ownedCards(s, c.content, me).filter((o) => s.round < REPLACE_SPENT_FROM_ROUND || !spent(c, me, o));
    const used = new Set<Uid>();
    const covered = new Set<number>();
    build.forEach((target, i) => {
      const o = owned.find((x) => !used.has(x.uid) && x.id === target);
      if (!o) return;
      used.add(o.uid);
      covered.add(i);
    });
    const sal = salaryInfo(c, me);
    const income = Math.max(p?.earningsThisRound ?? 0, incomeGuess(c, me));
    // first_train's $15 off covers salaries until it is used up (and is coming if still open).
    const bd = salaryBreakdown(s, c.content, me);
    const free = bd.discounts.filter((d) => d.source === 'first_train').reduce((a, d) => a + d.amount, 0);
    const freeSlots = Math.max(0, Math.floor((free - bd.salaried * bd.rate) / Math.max(1, bd.rate)));
    const salaryRoom = Math.floor((sal.cash + 0.6 * income - sal.owed) / 5) + freeSlots + (msOpen(s, me, 'first_train') ? 3 : 0);
    // Bootstrap: the first salaried card (a cook) is worth a stretch, or nothing ever pays.
    let room = sal.salaried === 0 && (marketingNow(c, me) || s.round <= 4) ? Math.max(1, salaryRoom) : salaryRoom;
    const trains: EasyTrain[] = [];
    const hires: EasyHire[] = [];
    const supplyLeft = new Map<EmployeeId, number>();
    build.forEach((target, i) => {
      if (covered.has(i)) return;
      const def = c.content.employees[target];
      if (!def || (s.supply[target] ?? 0) <= 0 || (p && ownsUnique(c.content, p, target))) return;
      let best: { o: OwnedInfo; path: EmployeeId[] } | null = null;
      for (const o of owned) {
        if (used.has(o.uid) || o.place === 'busy') continue;
        const path = trainPath(c, o.id, target);
        if (path && path.length && (!best || path.length < best.path.length)) best = { o, path };
      }
      if (best) {
        used.add(best.o.uid);
        const salaryAdded = def.salary && !best.o.def.salary;
        if (salaryAdded && room <= 0) return;
        if (salaryAdded) room--;
        trains.push({ uid: best.o.uid, path: best.path, target, salaryAdded });
        return;
      }
      if (hires.length >= 3) return;
      const root = rootOf(c, target);
      if (!root) return;
      const left = supplyLeft.get(root.id) ?? s.supply[root.id] ?? 0;
      if (left <= 0) return;
      const rootDef = c.content.employees[root.id];
      // A salaried entry card (or a salaried target) waits for salary room.
      if ((rootDef?.salary || def.salary) && room <= 0) return;
      if (rootDef?.salary) room--;
      supplyLeft.set(root.id, left - 1);
      hires.push({ id: root.id, needsTraining: root.path.length > 0 });
    });
    const extras = new Set(owned.filter((o) => !used.has(o.uid)).map((o) => o.uid));
    const trainActions = owned.reduce((a, o) => a + (o.def.ability.kind === 'train' ? o.def.ability.actions : 0), 0);
    return { food, build, trains, hires, extras, salaryRoom, trainActions };
  });
}

/** Is a card worth a seat (Easy only seats cards with something to do)? */
export function worthSeat(c: Ctx, me: PlayerId, def: EmployeeDef | undefined, plan: EasyPlan, trainees: number): boolean {
  const a = def?.ability;
  if (!a) return false;
  const p = c.s.players[me];
  switch (a.kind) {
    case 'marketing':
      return tilesLeft(c, a.campaigns) || Boolean(a.alwaysEternal);
    case 'produce':
      return a.foods.some((f) => f !== 'coffee');
    case 'train':
      return trainees > 0 || plan.hires.some((h) => h.needsTraining);
    case 'recruit':
      return plan.hires.length >= 2;
    case 'newBusiness':
      return c.s.houseTiles.length > 0 || c.s.gardenTiles > 0;
    case 'restaurant':
      return true;
    case 'price':
      return a.delta < 0;
    case 'lobbyist':
    case 'nightShift':
      return false;
    default:
      return Boolean(p);
  }
}

/** Order of seats (higher first): cooks and the trainer, a restaurant to open, then marketeers. */
export function seatPriority(c: Ctx, me: PlayerId, def: EmployeeDef | undefined): number {
  const a = def?.ability;
  // A salaried card costs the same on the beach: put it to work first.
  const paid = def?.salary ? 0.5 : 0;
  switch (a?.kind) {
    case 'produce':
      return 9 + a.amount / 20 + paid;
    case 'train':
      return 8.5 + paid;
    case 'marketing':
      return 8.2 + paid;
    case 'restaurant':
      return ((c.s.players[me]?.restaurantsRemaining ?? 0) > 0 ? 8 : 5) + paid;
    case 'buyDrinks':
      return 7 + paid;
    case 'newBusiness':
      return 6.5 + paid;
    case 'recruit':
      return 5 + paid;
    case 'fryChef':
    case 'cfo':
      return 4.5 + paid;
    case 'waitress':
      return broke(c, me) ? 9.5 : 4;
    case 'massMarketing':
      return 4 + paid;
    case 'price':
      return 3.5 + paid;
    default:
      return 1;
  }
}

/** Marketeers Easy puts to work at once (more just sit in slots without good spots). */
export const MAX_MARKETEERS = 3;

/** Goods my cards can bring in one round (owned, not busy), with a cook assumed for the plan food early on. */
export function easyCapacity(c: Ctx, me: PlayerId, plan: EasyPlan): FoodCounts {
  return memo(c, `easyCap:${me}`, () => {
    const p = c.s.players[me];
    const out: FoodCounts = { ...stockNow(c.s, me) };
    if (!p) return out;
    const drinks = drinkMix(c, me);
    for (const o of ownedCards(c.s, c.content, me)) {
      if (o.place === 'busy') continue;
      const a = o.def.ability;
      if (a.kind === 'produce' && a.timing === 'working') {
        const g = a.foods.includes(plan.food) ? plan.food : (a.foods[0] as FoodId);
        out[g] = (out[g] ?? 0) + a.amount;
      } else if (a.kind === 'buyDrinks') {
        const n = a.mode === 'errand' ? 1 : a.perSource * 2;
        const g = drinks[0];
        if (g) out[g] = (out[g] ?? 0) + n;
      }
    }
    // A cook is always in the plan: market for it before it arrives.
    out[plan.food] = Math.max(out[plan.food] ?? 0, 3);
    return out;
  });
}

/** The good to advertise: the plan food unless drinks are what I can bring in most. */
export function easyGood(c: Ctx, me: PlayerId, plan: EasyPlan): FoodId {
  const cap = easyCapacity(c, me, plan);
  let best: FoodId = plan.food;
  for (const [g, n] of Object.entries(cap) as [FoodId, number][]) {
    if (isDrink(g) && n > (cap[best] ?? 0) && (c.content.foods[g]?.marketable ?? false)) best = g;
  }
  return best;
}

/** Cards that can be at work next round with the managers owned. */
export function seatCapacity(c: Ctx, me: PlayerId): number {
  const owned = ownedCards(c.s, c.content, me).filter((o) => o.place !== 'busy');
  const slots = owned.flatMap((o) => (o.def.ability.kind === 'manager' && o.def.ability.slots > 0 ? [o.def.ability.slots] : []));
  return slotCapacity(slots, ceoSlotsFor(c.s, c.content, me));
}
