/**
 * New Districts (ketchup.md §1; DLX p3–4).
 *
 * - Tiles U–Y join the random tile pool (createGame draws from every enabled tile; the draw may
 *   contain none of them). Tile Z (two printed parks) comes with Lobbyists.
 * - Tile U: three separate lemonade sources. Tile V: houses 21, 22. Tile W: house 25 has a printed
 *   garden and cannot get another (base garden rules). These are data in map/tiles.ts.
 * - Apartments (π on X, 9¾ on Y) are houses for every rule unless stated:
 *   - 2 demand counters instead of each 1 (`demandAmount` ×2; with First Radio Campaign 4);
 *   - no maximum demand (base `baseDemandCapacity`); never a garden (base garden rules); parks
 *     apply (Lobbyists); Dinnertime order π = 3.14, 9¾ = 9.75.
 * - Option `tiles` (questions.md Q-K26): 'districts' (U–Y, default), 'districtsAndPark' (U–Z) or
 *   'park' (only tile Z: the KX p2 "Upmarket Area" scenario, meant without Lobbyists). Parks price
 *   houses ×2 (×3 with a garden) whether or not Lobbyists is on (`parkSaleRevenue`). U–Y always
 *   join when the game needs them: 6 players (25 tiles, DLX p30) or Lobbyists at 5+ (KX p15).
 *   Choosing single tiles of U–Y is not offered.
 */
import type { GameConfig } from '../../types/state.js';
import type { TileTemplateId } from '../../types/content.js';
import type { GameModule } from '../../types/module.js';
import { KETCHUP_TILES } from '../../map/tiles.js';
import { parkSaleRevenue } from './shared.js';

const ID = 'ketchup:newDistricts';
export const NEW_DISTRICTS_TILE_OPTIONS = ['districts', 'districtsAndPark', 'park'] as const;
export type NewDistrictsTiles = (typeof NEW_DISTRICTS_TILE_OPTIONS)[number];
const DISTRICTS: readonly TileTemplateId[] = ['U', 'V', 'W', 'X', 'Y'];

/** The `tiles` option of a config (default 'districts'). */
export function newDistrictsTiles(cfg: Pick<GameConfig, 'options'>): NewDistrictsTiles {
  const v = (cfg.options as { [ID]?: { tiles?: unknown } } | undefined)?.[ID]?.tiles;
  return NEW_DISTRICTS_TILE_OPTIONS.includes(v as NewDistrictsTiles) ? (v as NewDistrictsTiles) : 'districts';
}

/** The random-map tile pool after the New Districts `tiles` option (createGame). */
export function newDistrictsPool(cfg: Pick<GameConfig, 'modules' | 'options' | 'players'>, pool: TileTemplateId[]): TileTemplateId[] {
  if (!cfg.modules.includes(ID)) return pool;
  const opt = newDistrictsTiles(cfg);
  const lobbyists = cfg.modules.includes('ketchup:lobbyists');
  const needAll = cfg.modules.includes('ketchup:sixPlayers') || (lobbyists && cfg.players.length >= 5);
  const districts = opt !== 'park' || needAll;
  const park = opt !== 'districts' || lobbyists;
  const out = pool.filter((id) => (DISTRICTS.includes(id) ? districts : id === 'Z' ? park : true));
  if (park && !out.includes('Z')) out.push('Z');
  return out.sort();
}

export const NEW_DISTRICTS_MODULE: GameModule = {
  id: ID,
  name: 'New Districts',
  description: 'Five new map tiles, including apartments that take double demand without limit.',
  options: {
    tiles: {
      type: 'enum',
      label: 'Map tiles',
      values: [
        { value: 'districts', label: 'Tiles U–Y' },
        { value: 'districtsAndPark', label: 'Tiles U–Y and the park tile Z' },
        { value: 'park', label: 'Only the park tile Z (Upmarket Area)' },
      ],
      default: 'districts',
    },
  },
  // Tile Z is listed here too so the board can be built when the option puts it in the pool.
  content: { tiles: [...KETCHUP_TILES] },
  hooks: {
    demandAmount: (amount, _ctx, { house }) => (house.kind === 'apartment' ? amount * 2 : amount),
    // Lobbyists prices parks itself; without it the park tile Z still doubles prices (Q-K26).
    saleRevenue: (bd, ctx, args) => (ctx.isEnabled('ketchup:lobbyists') ? bd : parkSaleRevenue(bd, ctx, args)),
  },
};
