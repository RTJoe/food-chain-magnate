/**
 * Payday and Cleanup figures for the Turn tab, computed by the engine on the view's pseudo-state
 * (salary discounts, waivers and module hooks included), so the panel shows what will be charged.
 */
import { contentFor, FOODS, salaryAfterFiring, salaryBreakdown, salariedCards, stockOf } from '@fcm/engine';
import type { FoodCounts, FoodId, GameView, MilestoneId, PlayerId, Uid } from '@fcm/engine';
import { pseudoState } from './engine.js';

export interface PaydayFigures {
  /** Owed now, with no one fired and no goods. */
  before: number;
  /** Owed after firing `fired` and paying `tokens` goods. */
  after: number;
  /** Salary per card (base $5; $3 with First waitress used). */
  rate: number;
  /** Cards that draw a salary now (badge them). */
  salaried: Uid[];
  /** Salaried cards left after firing (cap for goods). */
  salariedAfter: number;
  /** Goods that will be spent (1 per salary, capped by salaried cards). */
  goodsUsed: number;
}

const BEER: MilestoneId = 'ketchup:first_beer_sold' as MilestoneId;
const TRAINER: MilestoneId = 'ketchup:first_trainer_used' as MilestoneId;

const countOf = (c: FoodCounts) => Object.values(c).reduce<number>((a, n) => a + (n ?? 0), 0);

export function paydayFigures(view: GameView, me: PlayerId, fired: readonly Uid[] = [], goods: FoodCounts = {}): PaydayFigures {
  const s = pseudoState(view, me);
  const content = contentFor(view.config.modules);
  const now = salaryBreakdown(s, content, me);
  // Firings already sent but not yet revealed (rules v4: hidden until everyone has decided).
  const next = salaryAfterFiring(s, content, me, [...(view.mine?.fireDraft ?? []), ...fired]);
  const goodsUsed = Math.min(countOf(goods), next.salaried);
  return {
    before: now.total,
    after: Math.max(0, next.total - goodsUsed * next.rate),
    rate: next.rate,
    salaried: salariedCards(s, content, me),
    salariedAfter: next.salaried,
    goodsUsed,
  };
}

/** First beer sold: goods in stock (inventory + freezer) that can pay salaries, 1 item = 1 salary. */
export function salaryGoods(view: GameView, me: PlayerId): [FoodId, number][] {
  const p = view.players[me];
  if (!p?.milestones[BEER]) return [];
  const stock = stockOf(pseudoState(view, me), me);
  return (Object.entries(stock) as [FoodId, number][]).filter(([g, n]) => n > 0 && FOODS.find((f) => f.id === g)?.payableAsSalary);
}

/** Text of the Payday button: says what will really happen (pay, or fire more next). */
export function paydayLabel(o: { n: number; canConfirm: boolean; after: number; cash: number; goodsUsed: number; forcedFiring: boolean }): string {
  const { n, after, cash, goodsUsed } = o;
  if (!o.canConfirm) return `Fire ${n}`;
  const goods = goodsUsed ? ` + ${goodsUsed} good${goodsUsed === 1 ? '' : 's'}` : '';
  let pay: string;
  if (after <= cash) pay = `pay $${after}${goods}`;
  else if (o.forcedFiring) return n ? `Fire ${n}, then more to cover $${after}` : `Confirm, then fire staff to cover $${after}`;
  else pay = `pay $${Math.max(0, cash)} of $${after}${goods}`;
  return n ? `Fire ${n} and ${pay}` : pay.charAt(0).toUpperCase() + pay.slice(1);
}

/** Whether a player who cannot pay must fire staff (First trainer used waives it). */
export const mustFireIfShort = (view: GameView, me: PlayerId): boolean => !view.players[me]?.milestones[TRAINER];

/**
 * Whether the Payday panel should warn up front that staff must go (DLX p29): salaries after the
 * current selection exceed cash, firing is forced, and a salaried card is still there to fire.
 * The engine prompt always sends `mustFire: false`, so the client works it out.
 */
export const mustFireNow = (o: { after: number; cash: number; forcedFiring: boolean; salariedAfter: number }): boolean => o.forcedFiring && o.after > o.cash && o.salariedAfter > 0;

// ---------------------------------------------------------------------------
// Cleanup: freezer
// ---------------------------------------------------------------------------

export interface FreezerRow {
  food: FoodId;
  /** In stock (this round's goods plus what is already frozen). */
  n: number;
  /** Already in the freezer. */
  frozen: number;
  max: number;
  /** Why the row cannot take more (coffee, kimchi exclusivity). */
  note?: string;
}

/**
 * Rows for the freezer choice: the whole stock (inventory + freezer, DLX p34: frozen items are
 * still stock and may be kept again). Coffee cannot be frozen; kimchi is frozen alone.
 */
export function freezerRows(view: GameView, me: PlayerId, keep: FoodCounts, capacity: number): FreezerRow[] {
  const p = view.players[me];
  if (!p) return [];
  const stock = stockOf(pseudoState(view, me), me);
  const rule = (g: FoodId) => FOODS.find((f) => f.id === g)?.freezer ?? 'yes';
  const total = countOf(keep);
  const kept = (Object.keys(keep) as FoodId[]).filter((g) => (keep[g] ?? 0) > 0);
  const kimchiKept = kept.some((g) => rule(g) === 'exclusive');
  return (Object.entries(stock) as [FoodId, number][])
    .filter(([, n]) => n > 0)
    .map(([food, n]) => {
      const cur = keep[food] ?? 0;
      const frozen = p.freezer[food] ?? 0;
      if (rule(food) === 'no') return { food, n, frozen, max: 0, note: 'cannot be frozen' };
      const blocked = rule(food) === 'exclusive' ? kept.some((g) => g !== food) : kimchiKept;
      if (blocked && cur === 0) return { food, n, frozen, max: 0, note: rule(food) === 'exclusive' ? 'only alone' : 'kimchi is frozen alone' };
      return { food, n, frozen, max: Math.min(n, cur + capacity - total) };
    });
}
