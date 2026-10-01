/**
 * Reserve Prices (ketchup.md §14; KX p16; DLX p28).
 *
 * - The alternate reserve cards replace the base ones: +$200 with "Base price $5", "$10" or
 *   "$20". Chosen secretly at setup as usual.
 * - First bank break: the bank gets $200 per player (base bank.ts adds the card amounts); CEO slots
 *   do not change (no standard card revealed). The new base unit price for the rest of the game
 *   is the price on the most frequent revealed card; ties: $20 beats $10 and $5, $5 beats $10.
 *   Set here from the `bankBroke` event; Dinnertime modifiers apply on top (`state.basePrice`).
 */
import type { GameModule } from '../../types/module.js';
import type { ReserveCard } from '../../types/state.js';

const ID = 'ketchup:reservePrices' as const;

export const PRICE_RESERVES: readonly ReserveCard[] = [
  { kind: 'price', amount: 200, basePrice: 5 },
  { kind: 'price', amount: 200, basePrice: 10 },
  { kind: 'price', amount: 200, basePrice: 20 },
];

/** Tie-break preference (DLX p28): $20 > $5 > $10. */
const PREFERENCE: Record<number, number> = { 20: 3, 5: 2, 10: 1 };

/** Most frequent revealed base price; null if no price card was revealed. */
export function basePriceFromReserves(cards: ReserveCard[]): number | null {
  const counts = new Map<number, number>();
  for (const c of cards) if (c.kind === 'price') counts.set(c.basePrice, (counts.get(c.basePrice) ?? 0) + 1);
  let best: number | null = null;
  for (const [price, n] of counts) {
    if (best === null) {
      best = price;
      continue;
    }
    const bn = counts.get(best) ?? 0;
    if (n > bn || (n === bn && (PREFERENCE[price] ?? 0) > (PREFERENCE[best] ?? 0))) best = price;
  }
  return best;
}

export const RESERVE_PRICES_MODULE: GameModule = {
  id: ID,
  name: 'Reserve Prices',
  description: 'Reserve cards set the base unit price after the first bank break.',
  hooks: {
    reserveOptions: () => PRICE_RESERVES.map((c) => ({ ...c })),
    onEvent(ctx, event) {
      if (event.type !== 'bankBroke' || event.breakNo !== 1 || !event.reserves) return;
      const price = basePriceFromReserves(Object.values(event.reserves));
      if (price !== null) ctx.state.basePrice = price;
    },
  },
};
