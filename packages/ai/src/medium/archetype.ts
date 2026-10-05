/**
 * Archetypes (ai-strategy.md §3.1): a strategy the Medium bot commits to, re-evaluated every
 * decision from the view (stateless). Each archetype is an ordered build list of cards the org
 * planner works towards; the score blends map fit, sunk investment (progress, which also acts as
 * hysteresis), how contested my houses are and which target milestones are still open.
 */
import type { EmployeeId, FoodId, MilestoneId, PlayerId } from '@fcm/engine';
import { memo, type Ctx } from '../shared/ctx.js';
import { countOwned, msOpen } from '../shared/facts.js';
import { basePriceModel, canEverSupply, houseViews, sellerOf, winProb } from '../shared/market.js';
import { entranceCell } from '../heuristics.js';

export type Archetype = 'burger_volume' | 'pizza_volume' | 'drinks_waitress' | 'cfo_rush' | 'discount' | 'luxury' | 'milestone_racer';

export const ARCHETYPES: readonly Archetype[] = ['burger_volume', 'pizza_volume', 'drinks_waitress', 'cfo_rush', 'discount', 'luxury', 'milestone_racer'];

export interface ArchetypeInfo {
  id: Archetype;
  /** Main food (burger or pizza; drinks archetype still cooks a little). */
  food: FoodId;
  /** Ordered build list (duplicates = several copies). */
  build: EmployeeId[];
  milestones: MilestoneId[];
  scores: Record<Archetype, number>;
}

const cook = (f: FoodId): EmployeeId => (f === 'pizza' ? 'pizza_cook' : 'burger_cook');
const chef = (f: FoodId): EmployeeId => (f === 'pizza' ? 'pizza_chef' : 'burger_chef');

/** Build lists (ai-strategy.md §3.1 key cards, extended to a full mid-game roster). */
export function buildList(a: Archetype, f: FoodId): EmployeeId[] {
  const C = cook(f);
  const H = chef(f);
  switch (a) {
    case 'drinks_waitress':
      return ['marketing_trainee', 'errand_boy', 'trainer', 'cart_operator', 'waitress', 'pricing_manager', 'management_trainee', 'marketing_trainee', 'errand_boy', 'waitress', 'cart_operator', C, 'recruiting_girl', 'marketing_trainee', 'junior_vp', 'truck_driver', 'waitress', 'marketing_trainee', 'pricing_manager', 'campaign_manager', 'vice_president', 'marketing_trainee'];
    case 'cfo_rush':
      return ['marketing_trainee', 'trainer', C, 'management_trainee', 'pricing_manager', 'marketing_trainee', 'junior_vp', 'trainer', 'waitress', C, 'vice_president', 'marketing_trainee', 'senior_vp', 'cfo', H, 'marketing_trainee', 'waitress', 'pricing_manager', 'campaign_manager', 'marketing_trainee'];
    case 'discount':
      return ['marketing_trainee', 'trainer', C, 'pricing_manager', 'management_trainee', 'marketing_trainee', 'pricing_manager', 'discount_manager', C, 'waitress', 'marketing_trainee', 'junior_vp', 'pricing_manager', H, 'marketing_trainee', 'discount_manager', 'waitress', 'campaign_manager', 'vice_president', 'marketing_trainee'];
    case 'luxury':
      return ['marketing_trainee', 'trainer', C, 'management_trainee', 'marketing_trainee', 'luxuries_manager', 'new_business_developer', 'waitress', C, 'marketing_trainee', 'junior_vp', 'waitress', H, 'marketing_trainee', 'new_business_developer', 'campaign_manager', 'vice_president', 'marketing_trainee'];
    case 'milestone_racer':
      return ['marketing_trainee', 'recruiting_girl', 'trainer', C, 'pricing_manager', 'marketing_trainee', 'waitress', 'management_trainee', C, 'errand_boy', 'marketing_trainee', 'junior_vp', 'waitress', H, 'marketing_trainee', 'pricing_manager', 'campaign_manager', 'vice_president', 'marketing_trainee', 'waitress'];
    default:
      return ['marketing_trainee', 'trainer', C, 'pricing_manager', 'management_trainee', 'marketing_trainee', 'waitress', C, 'marketing_trainee', 'junior_vp', 'pricing_manager', H, 'waitress', 'marketing_trainee', 'recruiting_girl', 'campaign_manager', 'marketing_trainee', 'vice_president', 'waitress', 'marketing_trainee', 'pricing_manager', 'marketing_trainee'];
  }
}

function targetMilestones(a: Archetype, f: FoodId): MilestoneId[] {
  const marketed: MilestoneId = f === 'pizza' ? 'first_pizza_marketed' : 'first_burger_marketed';
  const produced: MilestoneId = f === 'pizza' ? 'first_pizza_produced' : 'first_burger_produced';
  switch (a) {
    case 'drinks_waitress':
      return ['first_errand_boy', 'first_waitress', 'first_drink_marketed', 'first_cart_operator', 'first_billboard'];
    case 'cfo_rush':
      return ['first_train', 'first_pay_20', 'first_100', 'first_billboard'];
    case 'discount':
      return ['first_lower_prices', 'first_billboard', marketed, 'first_train'];
    case 'luxury':
      return ['first_billboard', 'first_throw_away', 'first_train'];
    case 'milestone_racer':
      return ['first_billboard', 'first_train', 'first_hire_3', 'first_waitress', 'first_errand_boy', marketed];
    default:
      return ['first_billboard', marketed, produced, 'first_lower_prices', 'first_train'];
  }
}

/** Burger or pizza: whichever rivals compete for less, sticky once invested. */
export function chooseFood(c: Ctx, me: PlayerId = c.me): FoodId {
  return memo(c, `food:${me}`, () => {
    const s = c.s;
    const own = (ids: EmployeeId[]) => countOwned(s, me, ids);
    let burger = 3 * own(['burger_cook', 'burger_chef']) + 0.2;
    let pizza = 3 * own(['pizza_cook', 'pizza_chef']);
    // Demand already sitting on houses I can win: cook what they want (full houses take nothing else).
    const m = basePriceModel(c);
    for (const h of houseViews(c)) {
      if (!sellerOf(h, me)) continue;
      const p = winProb(c, h, m, me, null, true);
      burger += 0.8 * p * (h.demand.burger ?? 0);
      pizza += 0.8 * p * (h.demand.pizza ?? 0);
    }
    for (const camp of Object.values(s.board.campaigns)) {
      const w = camp.owner === me ? 1.5 : 0.2;
      if (camp.goods.includes('burger')) burger += w;
      if (camp.goods.includes('pizza')) pizza += w;
    }
    for (const pid of s.turnOrder) {
      if (pid === me) continue;
      burger -= 0.6 * countOwned(s, pid, ['burger_cook', 'burger_chef']);
      pizza -= 0.6 * countOwned(s, pid, ['pizza_cook', 'pizza_chef']);
    }
    if (msOpen(s, me, 'first_burger_marketed')) burger += 0.5;
    if (msOpen(s, me, 'first_pizza_marketed')) pizza += 0.5;
    if (!s.milestones.first_burger_marketed && !s.milestones.first_pizza_marketed) burger += 0.1;
    return pizza > burger ? 'pizza' : 'burger';
  });
}

/** Map facts the archetypes read: houses near me, contested houses, drinks near me. */
function mapFacts(c: Ctx, me: PlayerId): { near: number; reach: number; contested: number; uncontested: number; drinkTypes: number } {
  const m = basePriceModel(c);
  let near = 0;
  let reach = 0;
  let contested = 0;
  let uncontested = 0;
  for (const h of houseViews(c)) {
    const mine = sellerOf(h, me);
    if (!mine) continue;
    reach++;
    if (mine.distance <= 1) near++;
    const rival = h.sellers.filter((x) => x.player !== me).sort((a, b) => a.distance - b.distance)[0];
    if (!rival || rival.distance >= mine.distance + 3) uncontested++;
    else if (Math.abs(rival.distance + (m.price[rival.player] ?? 10) - mine.distance - (m.price[me] ?? 10)) <= 1) contested++;
  }
  const ents = Object.values(c.s.board.restaurants)
    .filter((r) => r.owner === me && r.status !== 'derelict')
    .map((r) => entranceCell(r.x, r.y, r.entrance));
  const types = new Set<string>();
  for (const src of Object.values(c.s.board.drinkSources)) {
    if (ents.some((e) => Math.abs(e.x - src.x) + Math.abs(e.y - src.y) <= 6)) types.add(src.drink);
  }
  return { near, reach, contested, uncontested, drinkTypes: types.size };
}

/** Score every archetype and pick the best (ai-strategy.md §3.1 formula, weights tuned). */
export function chooseArchetype(c: Ctx, me: PlayerId = c.me): ArchetypeInfo {
  return memo(c, `arch:${me}`, () => {
    const s = c.s;
    const food = chooseFood(c, me);
    const f = mapFacts(c, me);
    const players = s.turnOrder.length;
    const scores = {} as Record<Archetype, number>;
    const p = s.players[me];
    const owned = new Map<EmployeeId, number>();
    for (const card of Object.values(p?.employees ?? {})) owned.set(card.employeeId, (owned.get(card.employeeId) ?? 0) + 1);
    for (const a of ARCHETYPES) {
      const f2 = a === 'pizza_volume' ? 'pizza' : a === 'burger_volume' ? 'burger' : food;
      const build = buildList(a, f2).slice(0, 8);
      const left = new Map(owned);
      let have = 0;
      for (const e of build) {
        const n = left.get(e) ?? 0;
        if (n > 0) {
          have++;
          left.set(e, n - 1);
        }
      }
      const progress = have / build.length;
      const ms = targetMilestones(a, f2);
      const msAvail = ms.filter((m) => msOpen(s, me, m)).length / Math.max(1, ms.length);
      const uncont = f.reach ? 1 - f.contested / f.reach : 0.5;
      let mapFit = 0;
      switch (a) {
        case 'burger_volume':
        case 'pizza_volume':
          mapFit = Math.min(1, (f.near + 0.5 * f.reach) / 5);
          break;
        case 'drinks_waitress':
          mapFit = f.drinkTypes >= 2 ? 0.5 + 0.2 * (f.drinkTypes - 2) : 0;
          break;
        case 'luxury':
          mapFit = f.uncontested >= 3 ? Math.min(1, f.uncontested / 4) : 0;
          break;
        case 'discount':
          mapFit = f.reach ? Math.min(1, (2 * f.contested) / f.reach) : 0;
          break;
        case 'cfo_rush':
          mapFit = f.reach <= 3 ? 0.6 : 0.2;
          break;
        case 'milestone_racer':
          mapFit = players === 2 ? 0.5 : 0.2;
          break;
      }
      let score = 0.35 * mapFit + 0.25 * progress + 0.2 * (a === 'discount' ? 1 - uncont : uncont) + 0.2 * msAvail;
      // Opponent reading: rivals with a discount manager make luxury pointless.
      for (const pid of s.turnOrder) {
        if (pid === me) continue;
        if (countOwned(s, pid, ['discount_manager']) > 0) {
          if (a === 'luxury') score -= 0.2;
          if (a === 'discount') score += 0.1;
        }
        if (a === 'pizza_volume' && canEverSupply(c, pid, 'burger') && !canEverSupply(c, pid, 'pizza')) score += 0.05;
        if (a === 'burger_volume' && canEverSupply(c, pid, 'pizza') && !canEverSupply(c, pid, 'burger')) score += 0.05;
      }
      // Low base price (Reserve Prices $5): discounting leaves nothing to earn.
      if (a === 'discount' && s.basePrice < 10) score -= 0.4;
      // Volume play is the robust default; the others must clearly fit the map.
      if (a === 'burger_volume' || a === 'pizza_volume') score += 0.15;
      if ((a === 'burger_volume' && food === 'burger') || (a === 'pizza_volume' && food === 'pizza')) score += 0.1;
      scores[a] = score;
    }
    const best = (Object.entries(scores) as [Archetype, number][]).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'burger_volume';
    const food2 = best === 'pizza_volume' ? 'pizza' : best === 'burger_volume' ? 'burger' : food;
    return { id: best, food: food2, build: buildList(best, food2), milestones: targetMilestones(best, food2), scores };
  });
}
