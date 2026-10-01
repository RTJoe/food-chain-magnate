/**
 * New Districts (ketchup.md §1; DLX p3–4).
 *
 * - Tiles U–Y join the random tile pool (createGame draws from every enabled tile; the draw may
 *   contain none of them). Tile Z belongs to Lobbyists.
 * - Tile U: three separate lemonade sources. Tile V: houses 21, 22. Tile W: house 25 has a printed
 *   garden and cannot get another (base garden rules). These are data in map/tiles.ts.
 * - Apartments (π on X, 9¾ on Y) are houses for every rule unless stated:
 *   - 2 demand counters instead of each 1 (`demandAmount` ×2; with First Radio Campaign 4);
 *   - no maximum demand (base `baseDemandCapacity`); never a garden (base garden rules); parks
 *     apply (Lobbyists); Dinnertime order π = 3.14, 9¾ = 9.75.
 * Option `tiles` (subset of U–Y) is not implemented: all five join the pool.
 */
import type { GameModule } from '../../types/module.js';
import { KETCHUP_TILES } from '../../map/tiles.js';

export const NEW_DISTRICTS_MODULE: GameModule = {
  id: 'ketchup:newDistricts',
  name: 'New Districts',
  description: 'Five new map tiles, including apartments that take double demand without limit.',
  content: { tiles: KETCHUP_TILES.filter((t) => t.id !== 'Z') },
  hooks: {
    demandAmount: (amount, _ctx, { house }) => (house.kind === 'apartment' ? amount * 2 : amount),
  },
};
