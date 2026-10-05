/**
 * Campaign placement (ai-strategy.md §3.5.3): every legal spot of every campaign kind the card can
 * place, scored with `engine.campaignReach`: demand it adds × chance I win the house × revenue per
 * item, minus demand leaked to rivals, over the rounds it runs, plus milestones; for each good I can
 * supply. Also used for the Ketchup second campaign / free mailbox / pizza radio choices.
 */
import type { CampaignKind, CampaignPlacement, FoodCounts, FoodId, PlayerId } from '@fcm/engine';
import { type Ctx, type PlacementLegal, timeUp } from '../shared/ctx.js';
import { addCounts, capacityOf, hasMs, isDrink, msOpen, roundsLeftEstimate, stockNow } from '../shared/facts.js';
import { potentialModel, canEverSupply, houseViews, unitRevenue, winProb, type HouseView } from '../shared/market.js';
import { milestoneValue } from '../shared/values.js';
import { chooseFood } from './archetype.js';

export interface CampaignOption {
  la: PlacementLegal;
  kind: CampaignKind;
  tileNumber: number;
  placement: CampaignPlacement;
  from?: unknown;
  good: FoodId;
  value: number;
  summary: string;
}

/** Goods worth advertising: what I can (or plan to) supply, marketable in this game. */
export function campaignGoods(c: Ctx, me: PlayerId = c.me): FoodId[] {
  const foods = c.content.foods;
  const out: FoodId[] = [];
  const main = chooseFood(c, me);
  for (const g of Object.keys(foods) as FoodId[]) {
    if (!foods[g]?.marketable) continue;
    if (g === main || canEverSupply(c, me, g)) out.push(g);
  }
  if (!out.length) out.push(main);
  return out;
}

/** How much of `good` I can bring per round (owned cards), for the supply discount. */
function supplyFactor(c: Ctx, good: FoodId, me: PlayerId): number {
  if (canEverSupply(c, me, good)) return 1;
  return good === chooseFood(c, me) ? 0.8 : 0.15;
}

interface Scorer {
  c: Ctx;
  me: PlayerId;
  houses: Map<string, HouseView>;
  rounds: number;
  myCampaignsOn: Map<string, number>;
  goods: FoodId[];
  supply: Record<string, number>;
  leak: number;
  /** Most of each good I could bring to one Dinnertime (owned cards + stock + a little growth). */
  maxStock: FoodCounts;
}

function makeScorer(c: Ctx, me: PlayerId): Scorer {
  const houses = new Map(houseViews(c).map((h) => [h.id, h]));
  const myCampaignsOn = new Map<string, number>();
  for (const h of houseViews(c)) {
    myCampaignsOn.set(h.id, h.campaigns.filter((cid) => c.s.board.campaigns[cid]?.owner === me).length);
  }
  const goods = campaignGoods(c, me);
  const supply: Record<string, number> = {};
  for (const g of goods) supply[g] = supplyFactor(c, g, me);
  // Ketchup milestone: demand a rival sells for me is partly refunded.
  const leak = c.s.milestones['ketchup:ketchup'] ? 0.15 : 0.3;
  const p = c.s.players[me];
  const cards = p ? Object.keys(p.employees).filter((u) => !p.busy[u]) : [];
  const maxStock = addCounts(stockNow(c.s, me), capacityOf(c, me, cards, chooseFood(c, me)));
  const main = chooseFood(c, me);
  maxStock[main] = (maxStock[main] ?? 0) + 3;
  return { c, me, houses, rounds: roundsLeftEstimate(c), myCampaignsOn, goods, supply, leak, maxStock };
}

function cantServe(sc: Scorer, h: HouseView): boolean {
  return (Object.keys(h.demand) as FoodId[]).some((g) => !canEverSupply(sc.c, sc.me, g));
}

/** Value of one placement for each good; returns the best good and value. */
function scorePlacement(sc: Scorer, kind: CampaignKind, placement: CampaignPlacement, tileNumber: number, duration: number, eternal: boolean): { good: FoodId; value: number } | null {
  const { c, me } = sc;
  let reach;
  try {
    reach = c.engine.campaignReach(c.s, { kind, placement, owner: me, goods: [sc.goods[0] as FoodId], tileNumber });
  } catch {
    return null;
  }
  if (!reach.houses.length) return null;
  const m = potentialModel(c, me);
  const runs = eternal ? Math.min(6, Math.max(2, sc.rounds)) : Math.min(duration, Math.max(1, Math.ceil(sc.rounds)));
  const discount = 1 - 0.07 * (runs - 1);
  let best: { good: FoodId; value: number } | null = null;
  for (const g of sc.goods) {
    let v = 0;
    for (const rh of reach.houses) {
      const h = sc.houses.get(rh.houseId);
      if (!h) continue;
      // A full house still takes demand once it is served; count future runs at a rate of one.
      const perRun = rh.adds > 0 ? rh.adds : rh.capacity === null ? 1 : 0.6;
      const p = winProb(c, h, m, me, g, true);
      const mine = unitRevenue(c, h, m, me, g);
      const rivalRev = (m.price[h.sellers.find((x) => x.player !== me)?.player ?? me] ?? 10) * (h.garden ? 2 : 1);
      let hv = perRun * (p * mine * (sc.supply[g] ?? 1) - (1 - p) * sc.leak * rivalRev);
      if (cantServe(sc, h)) hv *= 0.25;
      // An order nobody can fill in one go (apartments pile up demand) is worth nothing.
      const need = { ...h.demand, [g]: (h.demand[g] ?? 0) + perRun };
      if ((Object.entries(need) as [FoodId, number][]).some(([gg, n]) => n > (sc.maxStock[gg] ?? 0))) hv *= 0.1;
      const crowd = sc.myCampaignsOn.get(h.id) ?? 0;
      hv /= 1 + 0.5 * crowd;
      v += hv;
    }
    v *= runs * discount;
    if (g === 'burger' && msOpen(c.s, me, 'first_burger_marketed')) v += milestoneValue(c.s, me, 'first_burger_marketed', sc.rounds) * (sc.supply[g] ?? 1);
    if (g === 'pizza' && msOpen(c.s, me, 'first_pizza_marketed')) v += milestoneValue(c.s, me, 'first_pizza_marketed', sc.rounds) * (sc.supply[g] ?? 1);
    if (isDrink(g) && msOpen(c.s, me, 'first_drink_marketed')) v += milestoneValue(c.s, me, 'first_drink_marketed', sc.rounds) * (sc.supply[g] ?? 1);
    if (!best || v > best.value) best = { good: g, value: v };
  }
  if (!best) return null;
  if (kind === 'billboard' && msOpen(c.s, me, 'first_billboard')) best.value += milestoneValue(c.s, me, 'first_billboard', sc.rounds);
  if (kind === 'airplane' && msOpen(c.s, me, 'first_airplane')) best.value += milestoneValue(c.s, me, 'first_airplane', sc.rounds);
  if (kind === 'radio' && msOpen(c.s, me, 'first_radio')) best.value += milestoneValue(c.s, me, 'first_radio', sc.rounds);
  return best;
}

const placementKey = (p: CampaignPlacement): string => JSON.stringify(p);

/**
 * Ranked campaign options for the given placement entries (one card). `duration` = the card's max
 * duration; with First Billboard every campaign is eternal.
 */
export function campaignOptions(c: Ctx, entries: PlacementLegal[], duration: number, me: PlayerId = c.me, limit = 8): CampaignOption[] {
  const sc = makeScorer(c, me);
  const eternal = hasMs(c.s, me, 'first_billboard');
  const out: CampaignOption[] = [];
  for (const la of entries) {
    let pls;
    try {
      pls = c.engine.legalPlacements(c.s, me, la.spec);
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (const pl of pls) {
      if (pl.kind !== 'campaign') continue;
      const key = placementKey(pl.placement);
      if (seen.has(key)) continue;
      seen.add(key);
      const r = scorePlacement(sc, pl.campaignKind, pl.placement, pl.tileNumber, duration, eternal);
      if (!r) continue;
      // Lower numbers run first in Marketing: a hair better.
      const value = r.value - pl.tileNumber * 0.01;
      out.push({ la, kind: pl.campaignKind, tileNumber: pl.tileNumber, placement: pl.placement, ...(pl.from ? { from: pl.from } : {}), good: r.good, value, summary: `${pl.campaignKind}#${pl.tileNumber} ${r.good} ${describe(pl.placement)}` });
      if (timeUp(c) && out.length > 20) break;
    }
  }
  out.sort((a, b) => b.value - a.value);
  return out.slice(0, limit);
}

function describe(p: CampaignPlacement): string {
  switch (p.kind) {
    case 'board':
      return `@(${p.x},${p.y})`;
    case 'airplane':
      return `@${p.side}${p.offset}`;
    case 'rural':
      return `@rural-${p.side}`;
    default:
      return '';
  }
}

/** Minimum value for placing a campaign at all (busy marketeers and eternal losses cost). */
export function campaignThreshold(c: Ctx, me: PlayerId, salaried: boolean): number {
  return hasMs(c.s, me, 'first_billboard') ? 6 : salaried ? 5 : 2;
}
