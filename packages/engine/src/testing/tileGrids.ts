/**
 * Testing-only transcription of the map.md tile grids (canonical orientation), used by the
 * state builder to make realistic boards before `map/tiles.ts` exists. The real tile table
 * (`TileDef`, with roads/exits) lives in `map/tiles.ts` and is owned by the engine map code.
 *
 * `houses` lists house/apartment labels for each H/A block in reading order of the block's
 * first square (map.md §4, §9).
 */
import type { TileTemplateId } from '../types/content.js';

export interface TestTileGrid {
  grid: readonly [string, string, string, string, string];
  houses: { order: number; label: string }[];
  bridge?: boolean;
}

const h = (n: number) => ({ order: n, label: String(n) });

export const TEST_TILE_GRIDS: Record<TileTemplateId, TestTileGrid> = {
  A: { grid: ['..#..', '..#..', '#####', 'HH#..', 'HH#..'], houses: [h(2)] },
  B: { grid: ['..#HH', '..#HH', '#####', '..#..', '..#..'], houses: [h(4)] },
  C: { grid: ['#####', '#.HH#', '#.HH#', '#...#', '#####'], houses: [h(5)] },
  D: { grid: ['#####', '#HH.#', '#HH.#', '.....', '.....'], houses: [h(7)] },
  E: { grid: ['###..', '#B...', '#.HH#', '..HH#', '..###'], houses: [h(8)] },
  F: { grid: ['HH#..', 'HH#..', '#####', '.....', '.....'], houses: [h(10)] },
  G: { grid: ['HH#..', 'HH#..', '#####', '..#..', '..#..'], houses: [h(12)], bridge: true },
  H: { grid: ['..#..', '..#..', '#####', '.HH..', '.HH..'], houses: [h(13)] },
  I: { grid: ['..#..', '..#..', '#####', '...HH', '...HH'], houses: [h(15)] },
  J: { grid: ['..###', '.HH.#', '#HH.#', '#....', '###..'], houses: [h(16)] },
  K: { grid: ['#####', '#.HH#', '#.HH#', '.....', '.....'], houses: [h(18)] },
  L: { grid: ['..#..', '..#..', '#####', '...L.', '.....'], houses: [] },
  M: { grid: ['..###', '...L#', '#...#', '#S...', '###..'], houses: [] },
  N: { grid: ['..#..', '.B#..', '#####', '.....', '.....'], houses: [] },
  O: { grid: ['.B#..', '..#..', '#####', '..#..', '..#..'], houses: [] },
  P: { grid: ['..#..', 'L.#..', '#####', '..#..', '..#B.'], houses: [], bridge: true },
  Q: { grid: ['..#..', '..#..', '#####', '.S...', '.....'], houses: [] },
  R: { grid: ['..#..', '.S#..', '#####', '..#..', '..#..'], houses: [] },
  S: { grid: ['..#S.', '..#..', '#####', 'B.#..', '..#..'], houses: [] },
  T: { grid: ['..#..', '.L#..', '#####', '..#..', '..#..'], houses: [] },
  // Ketchup New Districts (map.md §9)
  U: { grid: ['.###.', '##.##', '#L.L#', '##L##', '.###.'], houses: [] },
  V: { grid: ['..HH.', '..HH.', '#####', '.HH..', '.HH..'], houses: [h(22), h(21)] },
  W: { grid: ['.....', 'HH...', 'HH###', 'GG...', '.....'], houses: [h(25)] },
  X: { grid: ['..#..', '.AAA.', '#AAA#', '.AAA.', '..#..'], houses: [{ order: 3.14, label: 'π' }] },
  Y: { grid: ['#####', '#AAA#', '#AAA#', '#AAA.', '###..'], houses: [{ order: 9.75, label: '9¾' }] },
  // Ketchup Lobbyists park tile
  Z: { grid: ['PP#..', 'PP#..', '#####', '..#PP', '..#PP'], houses: [] },
};
