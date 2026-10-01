/**
 * Map tile, marketing tile and placeable-house data (map.md §4, §5, §7, §9; base.md §9).
 *
 * API:
 * - `BASE_TILES`: the 20 official base tiles A–T as `TileDef`s (canonical orientation).
 * - `KETCHUP_TILES`: tiles U–Z (data only; Ketchup modules put them in their content bundle).
 * - `tileFromGrid(id, grid, labels, extra)`: derive a `TileDef` from map.md glyph rows.
 * - `BASE_MARKETING_TILES`: campaign tiles #1–#16 with footprints and player-count removal.
 * - `BASE_PLACEABLE_HOUSES`: new-business-developer house numbers.
 */
import type {
  Direction,
  DrinkId,
  MarketingTileDef,
  ModuleId,
  PlaceableHouseDef,
  TileCell,
  TileDef,
  TileHouseDef,
  TileTemplateId,
} from '../types/content.js';

type Grid = readonly [string, string, string, string, string];

const DRINK_GLYPH: Record<string, DrinkId> = { B: 'beer', L: 'lemonade', S: 'soft_drink' };

/** 4-connected components of `glyph`, each sorted in reading order; components in reading order of their first square. */
function components(grid: Grid, glyph: string): TileCell[][] {
  const seen = new Set<string>();
  const out: TileCell[][] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (grid[r]?.[c] !== glyph || seen.has(`${r},${c}`)) continue;
      const comp: TileCell[] = [];
      const stack: [number, number][] = [[r, c]];
      seen.add(`${r},${c}`);
      while (stack.length) {
        const [cr, cc] = stack.pop() as [number, number];
        comp.push([cr, cc]);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr > 4 || nc < 0 || nc > 4 || grid[nr]?.[nc] !== glyph || seen.has(`${nr},${nc}`)) continue;
          seen.add(`${nr},${nc}`);
          stack.push([nr, nc]);
        }
      }
      comp.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      out.push(comp);
    }
  }
  return out;
}

function exitsOf(cells: TileCell[]): Direction[] {
  const has = (r: number, c: number) => cells.some(([cr, cc]) => cr === r && cc === c);
  const out: Direction[] = [];
  if (has(0, 2)) out.push('N');
  if (has(2, 4)) out.push('E');
  if (has(4, 2)) out.push('S');
  if (has(2, 0)) out.push('W');
  return out;
}

export interface TileExtra {
  module?: ModuleId;
  bridge?: boolean;
  requiresModule?: ModuleId;
  rulesRef?: string;
}

/**
 * Build a `TileDef` from map.md glyph rows. `labels` names the H/A blocks in reading order of
 * each block's first square. A printed garden (`G`) attaches to the first house (tile W).
 * For bridge tiles the crossing roads are listed as two roads (N–S and W–E) sharing (2,2).
 */
export function tileFromGrid(id: TileTemplateId, grid: Grid, labels: { order: number; label: string }[], extra: TileExtra = {}): TileDef {
  const blocks = [...components(grid, 'H'), ...components(grid, 'A')].sort(
    (a, b) => (a[0] as TileCell)[0] - (b[0] as TileCell)[0] || (a[0] as TileCell)[1] - (b[0] as TileCell)[1],
  );
  const gardens = components(grid, 'G');
  const houses: TileHouseDef[] = blocks.map((cells, i) => {
    const meta = labels[i];
    if (!meta) throw new Error(`tile ${id}: missing label for house block ${i}`);
    const first = cells[0] as TileCell;
    const h: TileHouseDef = { order: meta.order, label: meta.label, kind: grid[first[0]]?.[first[1]] === 'A' ? 'apartment' : 'house', cells };
    if (i === 0 && gardens[0]) h.garden = gardens[0];
    return h;
  });
  const drinks: TileDef['drinks'] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const d = DRINK_GLYPH[grid[r]?.[c] ?? '.'];
      if (d) drinks.push({ cell: [r, c], drink: d });
    }
  }
  let roads = components(grid, '#').map((cells) => ({ cells, exits: exitsOf(cells) }));
  if (extra.bridge) {
    // Bridge tiles: N–S and W–E roads are separate (map.md §2).
    const ns: TileCell[] = [0, 1, 2, 3, 4].map((r) => [r, 2] as const);
    const we: TileCell[] = [0, 1, 2, 3, 4].map((c) => [2, c] as const);
    roads = [
      { cells: ns, exits: ['N', 'S'] },
      { cells: we, exits: ['W', 'E'] },
    ];
  }
  const parks = components(grid, 'P');
  const def: TileDef = {
    id,
    module: extra.module ?? 'base',
    grid,
    houses,
    drinks,
    roads,
    rulesRef: extra.rulesRef ?? `map.md §4 tile ${id}`,
  };
  if (extra.bridge) def.bridge = [2, 2];
  if (parks.length) def.parks = parks;
  if (extra.requiresModule) def.requiresModule = extra.requiresModule;
  return def;
}

const h = (n: number) => ({ order: n, label: String(n) });

/** The 20 official base tiles (map.md §4), grids read from component scans. */
export const BASE_TILES: readonly TileDef[] = [
  tileFromGrid('A', ['..#..', '..#..', '#####', 'HH#..', 'HH#..'], [h(2)]),
  tileFromGrid('B', ['..#HH', '..#HH', '#####', '..#..', '..#..'], [h(4)]),
  tileFromGrid('C', ['#####', '#.HH#', '#.HH#', '#...#', '#####'], [h(5)]),
  tileFromGrid('D', ['#####', '#HH.#', '#HH.#', '.....', '.....'], [h(7)]),
  tileFromGrid('E', ['###..', '#B...', '#.HH#', '..HH#', '..###'], [h(8)]),
  tileFromGrid('F', ['HH#..', 'HH#..', '#####', '.....', '.....'], [h(10)]),
  tileFromGrid('G', ['HH#..', 'HH#..', '#####', '..#..', '..#..'], [h(12)], { bridge: true }),
  tileFromGrid('H', ['..#..', '..#..', '#####', '.HH..', '.HH..'], [h(13)]),
  tileFromGrid('I', ['..#..', '..#..', '#####', '...HH', '...HH'], [h(15)]),
  tileFromGrid('J', ['..###', '.HH.#', '#HH.#', '#....', '###..'], [h(16)]),
  tileFromGrid('K', ['#####', '#.HH#', '#.HH#', '.....', '.....'], [h(18)]),
  tileFromGrid('L', ['..#..', '..#..', '#####', '...L.', '.....'], []),
  tileFromGrid('M', ['..###', '...L#', '#...#', '#S...', '###..'], []),
  tileFromGrid('N', ['..#..', '.B#..', '#####', '.....', '.....'], []),
  tileFromGrid('O', ['.B#..', '..#..', '#####', '..#..', '..#..'], []),
  tileFromGrid('P', ['..#..', 'L.#..', '#####', '..#..', '..#B.'], [], { bridge: true }),
  tileFromGrid('Q', ['..#..', '..#..', '#####', '.S...', '.....'], []),
  tileFromGrid('R', ['..#..', '.S#..', '#####', '..#..', '..#..'], []),
  tileFromGrid('S', ['..#S.', '..#..', '#####', 'B.#..', '..#..'], []),
  tileFromGrid('T', ['..#..', '.L#..', '#####', '..#..', '..#..'], []),
];

/** Ketchup tiles (map.md §9). Data only: the Ketchup modules add them to the pool. */
export const KETCHUP_TILES: readonly TileDef[] = [
  tileFromGrid('U', ['.###.', '##.##', '#L.L#', '##L##', '.###.'], [], { module: 'ketchup:newDistricts', requiresModule: 'ketchup:newDistricts', rulesRef: 'map.md §9 tile U' }),
  tileFromGrid('V', ['..HH.', '..HH.', '#####', '.HH..', '.HH..'], [h(22), h(21)], { module: 'ketchup:newDistricts', requiresModule: 'ketchup:newDistricts', rulesRef: 'map.md §9 tile V' }),
  tileFromGrid('W', ['.....', 'HH...', 'HH###', 'GG...', '.....'], [h(25)], { module: 'ketchup:newDistricts', requiresModule: 'ketchup:newDistricts', rulesRef: 'map.md §9 tile W' }),
  tileFromGrid('X', ['..#..', '.AAA.', '#AAA#', '.AAA.', '..#..'], [{ order: 3.14, label: 'π' }], { module: 'ketchup:newDistricts', requiresModule: 'ketchup:newDistricts', rulesRef: 'map.md §9 tile X' }),
  tileFromGrid('Y', ['#####', '#AAA#', '#AAA#', '#AAA.', '###..'], [{ order: 9.75, label: '9¾' }], { module: 'ketchup:newDistricts', requiresModule: 'ketchup:newDistricts', rulesRef: 'map.md §9 tile Y' }),
  tileFromGrid('Z', ['PP#..', 'PP#..', '#####', '..#PP', '..#PP'], [], { module: 'ketchup:lobbyists', requiresModule: 'ketchup:lobbyists', rulesRef: 'map.md §9 tile Z' }),
];

/**
 * Campaign tiles (base.md §9 table; map.md §7). Footprints for #8 (mailbox) and #16 (billboard)
 * are unverified (questions.md Q-M2): #8 = 2x2, #16 = 1x1. `minPlayers`: removed below that count
 * (base.md §2.1: #12/#15/#16 out at 2p, #15/#16 at 3p, #16 at 4p).
 */
export const BASE_MARKETING_TILES: readonly MarketingTileDef[] = [
  { number: 1, kind: 'radio', module: 'base', w: 1, h: 1 },
  { number: 2, kind: 'radio', module: 'base', w: 1, h: 1 },
  { number: 3, kind: 'radio', module: 'base', w: 1, h: 1 },
  { number: 4, kind: 'airplane', module: 'base', w: 1, h: 2, width: 1 },
  { number: 5, kind: 'airplane', module: 'base', w: 3, h: 2, width: 3 },
  { number: 6, kind: 'airplane', module: 'base', w: 5, h: 2, width: 5 },
  { number: 7, kind: 'mailbox', module: 'base', w: 2, h: 2 },
  { number: 8, kind: 'mailbox', module: 'base', w: 2, h: 2 },
  { number: 9, kind: 'mailbox', module: 'base', w: 1, h: 1 },
  { number: 10, kind: 'mailbox', module: 'base', w: 1, h: 1 },
  { number: 11, kind: 'billboard', module: 'base', w: 3, h: 2 },
  { number: 12, kind: 'billboard', module: 'base', w: 2, h: 2, minPlayers: 3 },
  { number: 13, kind: 'billboard', module: 'base', w: 3, h: 1 },
  { number: 14, kind: 'billboard', module: 'base', w: 2, h: 1 },
  { number: 15, kind: 'billboard', module: 'base', w: 1, h: 1, minPlayers: 4 },
  { number: 16, kind: 'billboard', module: 'base', w: 1, h: 1, minPlayers: 5 },
];

/** map.md §5: house+garden combo tokens. 3, 6, 17 inferred (questions.md Q-M3). */
export const BASE_PLACEABLE_HOUSES: readonly PlaceableHouseDef[] = [1, 3, 6, 9, 11, 14, 17, 19].map((n) => ({ order: n, label: String(n) }));
