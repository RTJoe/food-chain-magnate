/**
 * Phase feedback (ux-plan §2.3, WP5): what the board shows while Dinnertime and Marketing resolve,
 * and what the results strip (ui/Summary.tsx) asks the board to show when the player steps through
 * houses or campaigns. Neither side imports the other: the 3D layer reads `boardFeedback` and
 * writes `phaseCaption`; the overlay writes `boardFeedback` and reads `phaseCaption`.
 *
 * Also the pure event → step helpers shared by both (`dinnerSteps`, `campaignSteps`).
 */
import { effect, signal } from '@preact/signals';
import type { Campaign, CampaignId, FoodId, GameEvent, GameView, HouseId, PlayerId, RestaurantId, SaleCandidate } from '@fcm/engine';
import { boardView } from './boardBridge.js';

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

/** One chain's offer for a house, as Dinnertime ranked it. */
export interface DinnerOffer {
  player: PlayerId;
  restaurantId: RestaurantId;
  unitPrice: number;
  distance: number;
  /** unitPrice + distance + module modifiers (lower wins). */
  score: number;
  canSupply: boolean;
  won: boolean;
}

/** One house of a Dinnertime, in resolution order. */
export interface DinnerStep {
  houseId: HouseId;
  offers: DinnerOffer[];
  sale: Ev<'sale'> | null;
  stayedHome: boolean;
}

/** One campaign run of a Marketing phase, in run order. */
export interface CampaignStep {
  campaignId: CampaignId;
  /** Houses that got demand from this run, with the goods dropped. */
  drops: { houseId: HouseId; goods: FoodId[] }[];
  /** Duration left after the run (null = eternal / not ticked). */
  remaining: number | null;
  expired: boolean;
}

/** What the board draws for the step the results strip is on. */
export type BoardFeedback =
  | {
      kind: 'dinner';
      houseId: HouseId;
      winner: { player: PlayerId; restaurantId: RestaurantId; distance: number } | null;
      offers: DinnerOffer[];
      stayedHome: boolean;
    }
  | {
      kind: 'campaign';
      campaignId: CampaignId;
      owner: PlayerId | null;
      good: FoodId | null;
      /** Houses that got demand. */
      houses: HouseId[];
      /** Houses in reach that took nothing (full). */
      full: HouseId[];
    };

export const boardFeedback = signal<BoardFeedback | null>(null);

/** Live caption while a phase animates (written by the 3D animator, shown by the overlay). */
export type PhaseCaption = { key: number } & (
  | { kind: 'sale'; houseId: HouseId; player: PlayerId; unitPrice: number; distance: number; total: number; others: { player: PlayerId; score: number; canSupply: boolean }[] }
  | { kind: 'stayedHome'; houseId: HouseId }
  | { kind: 'campaign'; campaignId: CampaignId; number: number | null; owner: PlayerId | null; goods: FoodId[]; houses: HouseId[]; full: HouseId[] }
  | { kind: 'done'; phase: 'dinnertime' | 'marketing'; sales: number; stayedHome: number; campaigns: number }
);

export const phaseCaption = signal<PhaseCaption | null>(null);

let captionKey = 0;
let captionTimer: ReturnType<typeof setTimeout> | null = null;

/** Show a caption; `holdMs` > 0 clears it after that long (unless replaced meanwhile). */
export function showCaption(c: DistributiveOmit<PhaseCaption, 'key'>, holdMs = 0): void {
  const key = ++captionKey;
  phaseCaption.value = { ...c, key } as PhaseCaption;
  if (captionTimer) clearTimeout(captionTimer);
  captionTimer = null;
  if (holdMs > 0)
    captionTimer = setTimeout(() => {
      if (phaseCaption.peek()?.key === key) phaseCaption.value = null;
    }, holdMs);
}

export function clearCaption(): void {
  if (captionTimer) clearTimeout(captionTimer);
  captionTimer = null;
  phaseCaption.value = null;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ---------------------------------------------------------------------------
// Campaigns that ran out (gone from the view, still named in results)
// ---------------------------------------------------------------------------

const campaignMemo = new Map<CampaignId, Campaign>();
effect(() => {
  const v = boardView.value.view;
  if (v) for (const c of Object.values(v.board.campaigns)) campaignMemo.set(c.id, c);
});

/** A campaign from the view, or as last seen (expired campaigns leave the board). */
export function campaignInfo(view: GameView | null, id: CampaignId): Campaign | undefined {
  return view?.board.campaigns[id] ?? campaignMemo.get(id);
}

// ---------------------------------------------------------------------------
// Event → steps
// ---------------------------------------------------------------------------

const toOffer = (c: SaleCandidate, winner: PlayerId | null): DinnerOffer => ({
  player: c.player,
  restaurantId: c.restaurantId,
  unitPrice: c.unitPrice,
  distance: c.distance,
  score: c.score,
  canSupply: c.canSupply,
  won: c.player === winner,
});

/** Houses of a Dinnertime in resolution order, with every ranked offer and the outcome. */
export function dinnerSteps(events: readonly GameEvent[]): DinnerStep[] {
  const out: DinnerStep[] = [];
  const at = new Map<HouseId, DinnerStep>();
  const step = (houseId: HouseId): DinnerStep => {
    let s = at.get(houseId);
    if (!s) {
      s = { houseId, offers: [], sale: null, stayedHome: false };
      at.set(houseId, s);
      out.push(s);
    }
    return s;
  };
  for (const e of events) {
    if (e.type === 'houseConsidered') {
      const s = step(e.houseId);
      if (e.offers?.length) s.offers = e.offers.map((o) => toOffer(o, null));
    } else if (e.type === 'sale') {
      const s = step(e.houseId);
      s.sale = e;
      const ranked = s.offers.length ? s.offers : (e.candidates ?? []).map((o) => toOffer(o, null));
      s.offers = ranked.length
        ? ranked.map((o) => ({ ...o, won: o.player === e.player }))
        : [{ player: e.player, restaurantId: e.restaurantId, unitPrice: e.unitPrice, distance: e.distance, score: e.unitPrice + e.distance, canSupply: true, won: true }];
    } else if (e.type === 'houseStayedHome') {
      step(e.houseId).stayedHome = true;
    }
  }
  return out;
}

/** Campaign runs of a Marketing phase in run order, with the demand each one dropped. */
export function campaignSteps(events: readonly GameEvent[]): CampaignStep[] {
  const out: CampaignStep[] = [];
  const at = new Map<CampaignId, CampaignStep>();
  let cur: CampaignStep | null = null;
  const step = (id: CampaignId): CampaignStep => {
    let s = at.get(id);
    if (!s) {
      s = { campaignId: id, drops: [], remaining: null, expired: false };
      at.set(id, s);
      out.push(s);
    }
    return s;
  };
  for (const e of events) {
    if (e.type === 'campaignRan') cur = step(e.campaignId);
    else if (e.type === 'demandPlaced') {
      const s = e.campaignId ? step(e.campaignId) : cur;
      if (s) s.drops.push({ houseId: e.houseId, goods: e.tokens.map((t) => t.good) });
    } else if (e.type === 'campaignTicked') step(e.campaignId).remaining = e.remaining;
    else if (e.type === 'campaignExpired') step(e.campaignId).expired = true;
  }
  return out;
}

/** Board feedback for a dinner step. */
export function dinnerFeedback(s: DinnerStep): BoardFeedback {
  return {
    kind: 'dinner',
    houseId: s.houseId,
    winner: s.sale ? { player: s.sale.player, restaurantId: s.sale.restaurantId, distance: s.sale.distance } : null,
    offers: s.offers,
    stayedHome: s.stayedHome && !s.sale,
  };
}
