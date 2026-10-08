/**
 * Houses, gardens and restaurants (ai-strategy.md §3.5.5–3.5.6) and the first restaurant at setup.
 * Spots are pre-ranked with a cheap distance proxy, then the best few are checked exactly: the
 * action is applied to a copy of the view state and every house's outlook is read again, so the
 * value is the change in houses I would win, weighted by what they are worth.
 */
import type { Action, GameState, PlayerId, Placement } from '@fcm/engine';
import { actionFromPlacement, cellsDistance, entranceCell, otherEntrances, myEntrances, placementCells, type Pt } from '../heuristics.js';
import { type Ctx, type PlacementLegal, timeUp, withState } from '../shared/ctx.js';
import { roundsLeftEstimate } from '../shared/facts.js';
import { basePriceModel, houseViews, sellerOf, winProb, type HouseView } from '../shared/market.js';

export interface DevOption {
  action: Action;
  value: number;
  summary: string;
}

/** What a house is worth to whoever wins it, per round: demand now, campaigns feeding it, garden. */
function houseWorth(c: Ctx, h: HouseView): number {
  const feed = h.campaigns.length;
  const base = Math.max(h.nDemand, Math.min(feed, 3)) + 0.4;
  return base * (c.s.basePrice || 10) * (h.garden ? 2 : 1);
}

/** Σ over houses of my win chance × worth, in state `s` (restaurant spots are judged on this). */
function positionValue(c: Ctx, s: GameState, me: PlayerId): number {
  const cc = withState(c, s, me);
  const m = basePriceModel(cc);
  let v = 0;
  for (const h of houseViews(cc)) {
    const mine = sellerOf(h, me);
    if (!mine) continue;
    const p = winProb(cc, h, m, me, null, true);
    // Being close matters even when no rival is connected yet: rivals arrive, campaigns need range.
    const closeness = 1 / (1 + mine.distance * 0.35);
    v += houseWorth(cc, h) * (0.6 * p + 0.4 * closeness);
  }
  return v;
}

/** Cheap proxy for a restaurant spot: houses near the entrance, away from rivals and my own. */
function spotProxy(c: Ctx, me: PlayerId): (e: Pt) => number {
  const rivals = otherEntrances(c.s, me);
  const mine = myEntrances(c.s, me);
  const houses = Object.values(c.s.board.houses)
    .filter((h) => h.cells.length)
    .map((h) => ({ cells: h.cells, w: (1 + h.demand.length) * (h.garden ? 1.6 : 1), dm: cellsDistance(h.cells, mine), dr: cellsDistance(h.cells, rivals) }));
  const sources = Object.values(c.s.board.drinkSources);
  return (e: Pt) => {
    let v = 0;
    for (const h of houses) {
      const d = cellsDistance(h.cells, [e]);
      if (d > 8) continue;
      const gain = Number.isFinite(h.dm) ? Math.max(0, h.dm - d) / 3 : 1;
      const contested = Number.isFinite(h.dr) && h.dr <= d ? 0.5 : 1;
      v += h.w * contested * Math.min(1, gain + 0.2) * (1 / (1 + d / 4));
    }
    for (const src of sources) if (Math.abs(src.x - e.x) + Math.abs(src.y - e.y) <= 5) v += 0.4;
    return v;
  };
}

function rankSpots(c: Ctx, entries: PlacementLegal[], me: PlayerId, keep: number): { la: PlacementLegal; pl: Placement; proxy: number }[] {
  const out: { la: PlacementLegal; pl: Placement; proxy: number }[] = [];
  const proxy = spotProxy(c, me);
  for (const la of entries) {
    let pls: Placement[];
    try {
      pls = c.engine.legalPlacements(c.s, me, la.spec);
    } catch {
      continue;
    }
    for (const pl of pls) {
      if (pl.kind !== 'restaurant' && pl.kind !== 'moveRestaurant') continue;
      out.push({ la, pl, proxy: proxy(entranceCell(pl.x, pl.y, pl.entrance)) });
    }
  }
  out.sort((a, b) => b.proxy - a.proxy);
  return out.slice(0, keep);
}

/** Exact value of a restaurant placement: my position value after minus before. */
function exactRestaurantGain(c: Ctx, a: Action, me: PlayerId, before: number): number | null {
  const r = c.engine.applyAction(c.s, a);
  if (!r.ok) return null;
  const s = r.state;
  // COMING SOON restaurants open at Cleanup: judge the spot as if open.
  for (const rest of Object.values(s.board.restaurants)) if (rest.owner === me && rest.status === 'comingSoon') rest.status = 'open';
  return positionValue(c, s, me) - before;
}

/** Ranked restaurant options (new restaurant / setup), exact-checked; best first. */
export function restaurantOptions(c: Ctx, entries: PlacementLegal[], me: PlayerId = c.me, exact = 6): DevOption[] {
  const before = positionValue(c, c.s, me);
  const out: DevOption[] = [];
  for (const { la, pl, proxy } of rankSpots(c, entries, me, exact)) {
    const a = actionFromPlacement(c.s, me, la, pl);
    if (!a) continue;
    const gain = exactRestaurantGain(c, a, me, before);
    if (gain === null) continue;
    out.push({ action: a, value: gain + proxy * 0.5, summary: `restaurant @(${pl.kind === 'restaurant' || pl.kind === 'moveRestaurant' ? `${pl.x},${pl.y}` : '?'})` });
    if (timeUp(c)) break;
  }
  return out.sort((x, y) => y.value - x.value);
}

/** Minimum gain for a new restaurant during Working (the card could rest instead; range limits). */
export const RESTAURANT_THRESHOLD = 6;

/** House / garden options for a new business developer. */
export function houseOptions(c: Ctx, entries: PlacementLegal[], me: PlayerId = c.me): DevOption[] {
  const m = basePriceModel(c);
  const rounds = Math.min(4, roundsLeftEstimate(c));
  const out: DevOption[] = [];
  const mine = myEntrances(c.s, me);
  const rivals = otherEntrances(c.s, me);
  const price = Math.max(1, m.price[me] ?? 10);
  for (const la of entries) {
    let pls: Placement[];
    try {
      pls = c.engine.legalPlacements(c.s, me, la.spec);
    } catch {
      continue;
    }
    if (la.spec.kind === 'garden') {
      for (const pl of pls) {
        if (pl.kind !== 'garden') continue;
        const h = houseViews(c).find((x) => x.id === pl.houseId);
        if (!h || h.garden) continue;
        const p = winProb(c, h, m, me, null, true);
        const myFeed = h.campaigns.filter((cid) => c.s.board.campaigns[cid]?.owner === me).length;
        const rate = Math.min(3, Math.max(h.nDemand > 0 ? 1 : 0, myFeed));
        const v = p * rate * price * rounds + p * (h.capacity !== null ? 2 : 0) * price * 0.3;
        const a = actionFromPlacement(c.s, me, la, pl);
        if (a) out.push({ action: a, value: v, summary: `garden ${h.house.label}` });
      }
    } else if (la.spec.kind === 'house') {
      const scored: { pl: Placement; v: number }[] = [];
      for (const pl of pls) {
        if (pl.kind !== 'house') continue;
        const cells = placementCells(pl);
        const dm = cellsDistance(cells, mine);
        const dr = cellsDistance(cells, rivals);
        if (!Number.isFinite(dm) || dm > 6) continue;
        const pWin = !Number.isFinite(dr) || dr > dm + 1 ? 1 : dr === dm ? 0.5 : dr > dm ? 0.8 : 0.1;
        scored.push({ pl, v: pWin * (3 - dm * 0.3) });
      }
      scored.sort((a, b) => b.v - a.v);
      for (const { pl, v: proxy } of scored.slice(0, 10)) {
        if (pl.kind !== 'house') continue;
        const cells = [
          { x: pl.x, y: pl.y },
          { x: pl.x + 1, y: pl.y },
          { x: pl.x, y: pl.y + 1 },
          { x: pl.x + 1, y: pl.y + 1 },
        ];
        let feeds = 0;
        try {
          feeds = c.engine.houseCellsReach(c.s, cells).filter((cid) => c.s.board.campaigns[cid]?.owner === me).length;
        } catch {
          feeds = 0;
        }
        const v = (proxy / 3) * Math.min(3, feeds) * price * 2 * rounds + proxy;
        const a = actionFromPlacement(c.s, me, la, pl);
        if (a) out.push({ action: a, value: v, summary: `house ${pl.houseOrder} @(${pl.x},${pl.y})` });
      }
    }
  }
  return out.sort((x, y) => y.value - x.value);
}

export const HOUSE_THRESHOLD = 5;
