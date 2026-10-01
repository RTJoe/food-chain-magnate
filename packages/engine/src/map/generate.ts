/**
 * Seeded map layout (base.md §2.1–2.2; map.md §1, §8).
 *
 * API:
 * - `mapSize(players)`: [rows, cols] in tiles: 2p 3x3, 3p 3x4, 4p 4x4, 5p 5x4, 6p 4x6.
 * - `drawLayout(rng, pool, rows, cols, opts)`: uniform random draw without replacement and a
 *   random rotation per tile. Never modifies tiles or adds roads (dead ends are legal).
 *   `requireAllDrinks` (intro game, base.md §13; questions.md Q-B5): redraw the whole map until
 *   beer, lemonade and soft drink all appear.
 */
import type { DrinkId, Rotation, TileDef, TileTemplateId } from '../types/content.js';
import type { RngState } from '../types/state.js';
import { randomInt, shuffle } from '../core/rng.js';
import type { LayoutEntry } from './grid.js';

export const MAP_SIZES: Readonly<Record<number, readonly [number, number]>> = { 2: [3, 3], 3: [3, 4], 4: [4, 4], 5: [5, 4], 6: [4, 6] };

export function mapSize(players: number): [number, number] {
  const s = MAP_SIZES[players];
  if (!s) throw new Error(`no map size for ${players} players`);
  return [s[0], s[1]];
}

export interface DrawOptions {
  requireAllDrinks?: boolean;
}

export function drawLayout(
  rng: RngState,
  pool: TileTemplateId[],
  tiles: Partial<Record<TileTemplateId, TileDef>>,
  rows: number,
  cols: number,
  opts: DrawOptions = {},
): { layout: LayoutEntry[][]; leftover: TileTemplateId[] } {
  const need = rows * cols;
  if (pool.length < need) throw new Error(`map needs ${need} tiles, pool has ${pool.length}`);
  const allDrinks: DrinkId[] = ['beer', 'lemonade', 'soft_drink'];
  const canSatisfy = allDrinks.every((d) => pool.some((t) => tiles[t]?.drinks.some((x) => x.drink === d)));
  for (let attempt = 0; ; attempt++) {
    const order = shuffle(rng, [...pool]);
    const chosen = order.slice(0, need);
    if (opts.requireAllDrinks && canSatisfy && attempt < 1000) {
      const present = new Set(chosen.flatMap((t) => tiles[t]?.drinks.map((x) => x.drink) ?? []));
      if (!allDrinks.every((d) => present.has(d))) continue;
    }
    const layout: LayoutEntry[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: LayoutEntry[] = [];
      for (let c = 0; c < cols; c++) row.push({ templateId: chosen[r * cols + c] as TileTemplateId, rotation: randomInt(rng, 4) as Rotation });
      layout.push(row);
    }
    return { layout, leftover: order.slice(need) };
  }
}
