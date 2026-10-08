/**
 * Dinnertime offers as players see them.
 *
 * Kimchi / Sushi / Noodles give each chain up to 4 variants of its offer (ketchup.md §5–7, engine
 * modules/ketchup/foodTiers.ts) and the engine reports every variant. Players think in chains, so
 * the client shows one offer per chain: its best variant that can supply the order, else its best
 * variant. Scores may carry module modifiers (Ketchup −1, First marketeer −2): the math shows them.
 */
import type { PlayerId } from '@fcm/engine';
import type { PhaseCaption } from './feedback.js';

interface OfferLike {
  player: PlayerId;
  score: number;
  canSupply: boolean;
  tier?: number;
}

/**
 * One offer per chain, in the input's (ranked) order of the kept offer. Per chain the kept offer is
 * the best one that can supply (lowest tier, then score), else the best one; ties keep input order.
 */
export function collapseOffers<T extends OfferLike>(offers: readonly T[]): T[] {
  const better = (a: T, b: T): boolean => {
    if (a.canSupply !== b.canSupply) return a.canSupply;
    const ta = a.tier ?? 0;
    const tb = b.tier ?? 0;
    return ta !== tb ? ta < tb : a.score < b.score;
  };
  const best = new Map<PlayerId, T>();
  for (const o of offers) {
    const cur = best.get(o.player);
    if (!cur || better(o, cur)) best.set(o.player, o);
  }
  const keep = new Set(best.values());
  return offers.filter((o) => keep.has(o));
}

/** score − price − distance: what modules added (0 in the base game). */
export function scoreModifier(o: { unitPrice: number; distance: number; score: number }): number {
  return o.score - o.unitPrice - o.distance;
}

/**
 * "$10 + 0 − 2 = $8" (modifier shown only when non-zero). `compact` drops the spaces (3D chips);
 * `dollarScore: false` prints the total without "$".
 */
export function scoreMath(o: { unitPrice: number; distance: number; score: number }, opts: { compact?: boolean; dollarScore?: boolean } = {}): string {
  const sp = opts.compact ? '' : ' ';
  const total = opts.dollarScore === false ? `${o.score}` : `$${o.score}`;
  return `${scoreTerms(o, opts.compact)}${sp}=${sp}${total}`;
}

/** The left side of `scoreMath`: "$10 + 0 − 2" (for markup that styles the total). */
export function scoreTerms(o: { unitPrice: number; distance: number; score: number }, compact = false): string {
  const sp = compact ? '' : ' ';
  const mod = scoreModifier(o);
  const modText = mod === 0 ? '' : `${sp}${mod < 0 ? '−' : '+'}${sp}${Math.abs(mod)}`;
  return `$${o.unitPrice}${sp}+${sp}${o.distance}${modText}`;
}

/**
 * Live caption for a sale: "Ada sells to house 3: $10 + 0 − 2 = 8 · beat Bo (9)". The score
 * (price + distance) is not money, so only the unit price carries a "$".
 */
export function saleCaptionText(c: Extract<PhaseCaption, { kind: 'sale' }>, name: (p: PlayerId) => string, house: string): string {
  const others = c.others.map((o) => `${name(o.player)} (${o.score}${o.canSupply ? '' : ', no stock'})`).join(', ');
  return `${name(c.player)} sells to house ${house}: ${scoreMath(c, { dollarScore: false })}${others ? ` · beat ${others}` : ''}`;
}
