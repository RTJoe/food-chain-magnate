/**
 * Testing-only board construction from tile grids. Implements the normative connectivity rule
 * (map.md §2): in-tile orthogonal road adjacency connects; across tiles only at the edge midpoint.
 */
import type { Direction, Rotation, TileTemplateId } from '../types/content.js';
import type { Board, BoardCell, Cell, CellKind, House, RoadCell } from '../types/state.js';
import { allocId } from '../core/ids.js';
import { TEST_TILE_GRIDS } from './tileGrids.js';
import { parkCells } from '../map/grid.js';

export interface LayoutEntry {
  templateId: TileTemplateId;
  rotation: Rotation;
}

/** `[['A', 'O1'], ['L3', 'D']]` → layout. Optional digit = clockwise quarter turns. */
export function parseLayout(rows: string[][]): LayoutEntry[][] {
  return rows.map((row) =>
    row.map((code) => {
      const m = /^([A-Z])([0-3])?$/.exec(code);
      if (!m) throw new Error(`bad tile code ${code}`);
      return { templateId: m[1] as TileTemplateId, rotation: Number(m[2] ?? 0) as Rotation };
    }),
  );
}

/** One clockwise rotation maps canonical (r, c) to (c, 4 − r) (map.md §3). */
export function rotateCell(r: number, c: number, rotation: Rotation): [number, number] {
  let rr = r;
  let cc = c;
  for (let i = 0; i < rotation; i++) [rr, cc] = [cc, 4 - rr];
  return [rr, cc];
}

const DIRS: Record<Direction, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W'];
export const step = (c: Cell, d: Direction): Cell => ({ x: c.x + DIRS[d][0], y: c.y + DIRS[d][1] });

const GLYPH_KIND: Record<string, CellKind> = {
  '#': 'road',
  '.': 'empty',
  H: 'house',
  A: 'apartment',
  G: 'garden',
  B: 'drink',
  L: 'drink',
  S: 'drink',
  P: 'park',
};
const DRINK: Record<string, 'beer' | 'lemonade' | 'soft_drink'> = { B: 'beer', L: 'lemonade', S: 'soft_drink' };

function components(grid: readonly string[], glyph: string): [number, number][][] {
  const seen = new Set<string>();
  const out: [number, number][][] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (grid[r]?.[c] !== glyph || seen.has(`${r},${c}`)) continue;
      const comp: [number, number][] = [];
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

export function buildBoard(layout: LayoutEntry[][], ids: { nextId: number }): Board {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  const w = cols * 5;
  const h = rows * 5;
  const board: Board = {
    rows,
    cols,
    w,
    h,
    tileSize: 5,
    tiles: [],
    cells: [],
    houses: {},
    restaurants: {},
    campaigns: {},
    drinkSources: {},
    entities: {},
  };
  const glyphs: string[][] = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const tileIds: string[][] = Array.from({ length: h }, () => Array<string>(w).fill(''));
  const bridges = new Set<string>();

  layout.forEach((row, tr) =>
    row.forEach(({ templateId, rotation }, tc) => {
      const def = TEST_TILE_GRIDS[templateId];
      const tileId = allocId(ids, 'tile');
      board.tiles.push({ id: tileId, row: tr, col: tc, templateId, rotation });
      const toBoard = (r: number, c: number): Cell => {
        const [rr, cc] = rotateCell(r, c, rotation);
        return { x: tc * 5 + cc, y: tr * 5 + rr };
      };
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const { x, y } = toBoard(r, c);
          (glyphs[y] as string[])[x] = def.grid[r]?.[c] ?? '.';
          (tileIds[y] as string[])[x] = tileId;
        }
      }
      if (def.bridge) {
        const b = toBoard(2, 2);
        bridges.add(`${b.x},${b.y}`);
      }
      const blocks = [...components(def.grid, 'H'), ...components(def.grid, 'A')];
      blocks.sort((a, b) => (a[0] as [number, number])[0] - (b[0] as [number, number])[0] || (a[0] as [number, number])[1] - (b[0] as [number, number])[1]);
      const gardens = components(def.grid, 'G');
      blocks.forEach((block, i) => {
        const meta = def.houses[i];
        if (!meta) throw new Error(`tile ${templateId}: missing house label ${i}`);
        const first = block[0] as [number, number];
        const id = allocId(ids, 'house');
        const house: House = {
          id,
          kind: def.grid[first[0]]?.[first[1]] === 'A' ? 'apartment' : 'printed',
          order: meta.order,
          label: meta.label,
          cells: block.map(([r, c]) => toBoard(r, c)),
          garden: gardens[0] ? { cells: gardens[0].map(([r, c]) => toBoard(r, c)), source: 'printed' } : null,
          demand: [],
        };
        board.houses[id] = house;
      });
      for (const park of components(def.grid, 'P')) {
        const cells = park.map(([r, c]) => toBoard(r, c));
        const xs = cells.map((p) => p.x);
        const ys = cells.map((p) => p.y);
        const id = allocId(ids, 'entity');
        board.entities[id] = {
          kind: 'park',
          id,
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs) + 1,
          h: Math.max(...ys) - Math.min(...ys) + 1,
          printed: true,
        };
      }
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const g = def.grid[r]?.[c] ?? '.';
          const drink = DRINK[g];
          if (!drink) continue;
          const { x, y } = toBoard(r, c);
          const id = allocId(ids, 'source');
          board.drinkSources[id] = { id, x, y, drink, tile: tileId };
        }
      }
    }),
  );

  const glyphAt = (x: number, y: number) => glyphs[y]?.[x];
  board.cells = glyphs.map((row, y) =>
    row.map((g, x): BoardCell => {
      let road: RoadCell | null = null;
      if (g === '#') {
        const links: Direction[] = [];
        for (const d of DIRECTIONS) {
          const n = step({ x, y }, d);
          if (glyphAt(n.x, n.y) !== '#') continue;
          const sameTile = tileIds[n.y]?.[n.x] === tileIds[y]?.[x];
          const midpoint = d === 'E' || d === 'W' ? y % 5 === 2 : x % 5 === 2;
          if (sameTile || midpoint) links.push(d);
        }
        road = { links, bridge: bridges.has(`${x},${y}`), underConstruction: false, roadworks: 0, lobbyistRoad: null };
      }
      return { kind: GLYPH_KIND[g] ?? 'empty', tile: tileIds[y]?.[x] ?? '', occupant: null, road };
    }),
  );
  for (const house of Object.values(board.houses)) {
    for (const c of [...house.cells, ...(house.garden?.cells ?? [])]) setOccupant(board, c, house.id);
  }
  for (const s of Object.values(board.drinkSources)) setOccupant(board, s, s.id);
  for (const e of Object.values(board.entities)) {
    if (e.kind === 'park') for (const c of parkCells(e)) setOccupant(board, c, e.id);
  }
  return board;
}

export function rect(x: number, y: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

export function cellAt(board: Board, c: Cell): BoardCell | undefined {
  return board.cells[c.y]?.[c.x];
}

function setOccupant(board: Board, c: Cell, occupant: string) {
  const cell = cellAt(board, c);
  if (cell) cell.occupant = occupant;
}

/** Mark empty squares as occupied. Throws if any square is off-board or not empty. */
export function paint(board: Board, cells: Cell[], kind: CellKind, occupant: string): void {
  for (const c of cells) {
    const cell = cellAt(board, c);
    if (!cell) throw new Error(`(${c.x},${c.y}) is off the board`);
    if (cell.kind !== 'empty') throw new Error(`(${c.x},${c.y}) is not empty (${cell.kind} ${cell.occupant ?? ''})`);
    cell.kind = kind;
    cell.occupant = occupant;
  }
}

/** True if any square orthogonally next to `cells` (outside them) is a road. */
export function touchesRoad(board: Board, cells: Cell[]): boolean {
  const own = new Set(cells.map((c) => `${c.x},${c.y}`));
  return cells.some((c) =>
    DIRECTIONS.some((d) => {
      const n = step(c, d);
      return !own.has(`${n.x},${n.y}`) && cellAt(board, n)?.kind === 'road';
    }),
  );
}

/** ASCII dump for debugging fixtures: map.md glyphs plus r=restaurant c=campaign k=coffee p=park g=garden. */
export function renderAscii(board: Board): string {
  const ch: Record<CellKind, string> = {
    empty: '.',
    road: '#',
    house: 'H',
    garden: 'g',
    apartment: 'A',
    drink: 'D',
    restaurant: 'r',
    campaign: 'c',
    coffeeShop: 'k',
    park: 'p',
  };
  return board.cells.map((row) => row.map((c) => ch[c.kind]).join('')).join('\n');
}
