/**
 * Dinnertime priority for Kimchi, Sushi and Noodles (ketchup.md §5–7, combined priority KX p11 /
 * DLX p31–32). One function serves all three modules so the result does not depend on module order.
 *
 * Every base candidate (exact order, tier 0) gets variants:
 * - sushi (tier −1): garden houses only (printed or placed with a garden; never apartments, the
 *   rural area or park-only houses); as many sushi as the house has demand tokens;
 * - noodles (tier +1): any house; as many noodles as demand tokens;
 * - kimchi (tier −10 on top of each of the above): the same order plus exactly 1 kimchi.
 * Lower tier wins regardless of price; within a tier normal competition applies. The base drops
 * variants a chain cannot deliver in full, so e.g. noodles only win when no chain can deliver the
 * exact order (or enough sushi), and a chain with kimchi beats every chain without it.
 *
 * Garden house order: sushi+kimchi, exact+kimchi, noodles+kimchi, sushi, exact, noodles.
 * Other houses:       exact+kimchi, noodles+kimchi, exact, noodles.
 */
import type { DinnerCandidate, HookContext } from '../../types/module.js';
import type { House } from '../../types/state.js';
import { isOn } from './shared.js';

export const TIER = { sushi: -1, exact: 0, noodles: 1, kimchiBonus: -10 } as const;

export function sushiHouse(house: House): boolean {
  return (house.kind === 'printed' || house.kind === 'placed') && house.garden !== null;
}

/** `dinnerCandidates` hook body shared by the three modules (idempotent: runs once per house). */
export function applyFoodTiers(cands: DinnerCandidate[], ctx: HookContext, house: House): DinnerCandidate[] {
  // Base candidates all have tier 0; any other tier means the variants were already added.
  if (cands.some((c) => c.tier !== 0)) return cands;
  const s = ctx.state;
  const n = house.demand.length;
  if (n === 0) return cands;
  const out: DinnerCandidate[] = [];
  for (const c of cands) {
    const variants: DinnerCandidate[] = [c];
    if (isOn(s, 'ketchup:sushi') && sushiHouse(house)) variants.push({ ...c, tier: TIER.sushi, items: { sushi: n } });
    if (isOn(s, 'ketchup:noodles')) variants.push({ ...c, tier: TIER.noodles, items: { noodles: n } });
    if (isOn(s, 'ketchup:kimchi')) {
      for (const v of [...variants]) variants.push({ ...v, tier: v.tier + TIER.kimchiBonus, items: { ...v.items, kimchi: 1 } });
    }
    out.push(...variants);
  }
  return out;
}
