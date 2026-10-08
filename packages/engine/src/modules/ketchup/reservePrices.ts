/**
 * Reserve Prices (ketchup.md §14; KX p28).
 *
 * - The alternate reserve cards replace the base ones: +$200 with "Base price $5", "$10" or
 *   "$20". Chosen secretly at setup as usual.
 * - First bank break: the bank gets $200 per player (base bank.ts adds the card amounts); CEO slots
 *   do not change (no standard card revealed). The new base unit price for the rest of the game
 *   is the price on the most frequent revealed card; ties: $20 beats $10 and $5, $5 beats $10.
 *   The bank sets it (rules/bank.ts) before emitting `bankBroke`, so the event carries the new
 *   price; Dinnertime modifiers apply on top (`state.basePrice`).
 */
import type { GameModule } from '../../types/module.js';
import type { ReserveCard } from '../../types/state.js';

const ID = 'ketchup:reservePrices' as const;

export const PRICE_RESERVES: readonly ReserveCard[] = [
  { kind: 'price', amount: 200, basePrice: 5 },
  { kind: 'price', amount: 200, basePrice: 10 },
  { kind: 'price', amount: 200, basePrice: 20 },
];

/** Most frequent revealed base price (KX p28); computed by the bank at the first break. */
export { basePriceFromReserves } from '../../rules/bank.js';

export const RESERVE_PRICES_MODULE: GameModule = {
  id: ID,
  name: 'Reserve Prices',
  description: 'Reserve cards set the base price after the first bank break.',
  hooks: {
    reserveOptions: () => PRICE_RESERVES.map((c) => ({ ...c })),
  },
};
