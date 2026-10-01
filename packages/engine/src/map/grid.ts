/**
 * Board cell model: building a board from tiles, footprints, neighbours, occupancy.
 *
 * API (all pure unless named `paint*` / `clear*`, which mutate the board):
 * - Geometry: `DIRECTIONS`, `opposite`, `step`, `rect`, `inBounds`, `cellAt`, `cellIndex`,
 *   `tileOf(board, cell)` (placed tile id), `tileCoord(cell)` ({row, col}), `sameCell`.
 * - Restaurants: `restaurantCells(x, y)`, `cornerCell(x, y, corner)`, `entranceOutside(x, y, corner)`
 *   (the 2 squares outside the 2x2 orthogonal to the entrance corner, base.md §2.6),
 *   `restaurantCorners(r)` (entrance, or all 4 with a drive-in, base.md §6.3a).
 * - Houses: `houseSquares(house)` (house + garden squares, base.md §14 "house connection"),
 *   `gardenCellsFor(houseCells, side)`.
 * - Occupancy: `allEmpty`, `touchesRoad`, `adjacentRoadCells`, `paint`, `clearCells`.
 * - `buildBoard(layout, tiles, ids)`: board from placed tiles; road `links` per map.md §2
 *   (every orthogonally adjacent pair of road squares connects, within or across tiles; bridges
 *   and capped ends excepted). Pathfinding derives connectivity from cell kinds, so boards built
 *   by other code (e.g. testing/board.ts) are routed by the same rule.
 */
import type { Direction, Rotation, TileDef, TileTemplateId } from '../types/content.js';
import type { Board, BoardCell, Cell, CellKind, Corner, House, PlacedTile, Restaurant, RoadCell } from '../types/state.js';
import { allocId } from '../core/ids.js';

export const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W'];
const DELTA: Record<Direction, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const CORNERS: readonly Corner[] = ['NW', 'NE', 'SE', 'SW'];

export const opposite = (d: Direction): Direction => OPP[d];
export const step = (c: Cell, d: Direction): Cell => ({ x: c.x + DELTA[d][0], y: c.y + DELTA[d][1] });
export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const cellKey = (c: Cell): string => `${c.x},${c.y}`;

/** Direction from `a` to orthogonally adjacent `b`, or null. */
export function dirBetween(a: Cell, b: Cell): Direction | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === -1) return 'N';
  if (dx === 1 && dy === 0) return 'E';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === -1 && dy === 0) return 'W';
  return null;
}

export function rect(x: number, y: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

export const inBounds = (board: Board, c: Cell): boolean => c.x >= 0 && c.y >= 0 && c.x < board.w && c.y < board.h;
export const cellAt = (board: Board, c: Cell): BoardCell | undefined => board.cells[c.y]?.[c.x];
export const cellIndex = (board: Board, c: Cell): number => c.y * board.w + c.x;
export const cellFromIndex = (board: Board, i: number): Cell => ({ x: i % board.w, y: Math.floor(i / board.w) });

/** Placed tile id of a square ('' off-board). */
export const tileOf = (board: Board, c: Cell): string => cellAt(board, c)?.tile ?? '';
/** Tile grid coordinates of a square. */
export const tileCoord = (c: Cell): { row: number; col: number } => ({ row: Math.floor(c.y / 5), col: Math.floor(c.x / 5) });

// ---------------------------------------------------------------------------
// Restaurants (2x2, entrance corner)
// ---------------------------------------------------------------------------

export const restaurantCells = (x: number, y: number): Cell[] => rect(x, y, 2, 2);

export function cornerCell(x: number, y: number, corner: Corner): Cell {
  return { x: corner.endsWith('W') ? x : x + 1, y: corner.startsWith('N') ? y : y + 1 };
}

/** The 2 squares outside the 2x2 that are orthogonally adjacent to the entrance corner (base.md §2.6, §14). */
export function entranceOutside(x: number, y: number, corner: Corner): Cell[] {
  const c = cornerCell(x, y, corner);
  const vert: Direction = corner.startsWith('N') ? 'N' : 'S';
  const horiz: Direction = corner.endsWith('W') ? 'W' : 'E';
  return [step(c, vert), step(c, horiz)];
}

/** Corners usable as entrances: the entrance, or all four with a drive-in (base.md §6.3a). */
export function restaurantCorners(r: Pick<Restaurant, 'entrance' | 'driveIn'>): Corner[] {
  return r.driveIn ? [...CORNERS] : [r.entrance];
}

// ---------------------------------------------------------------------------
// Houses
// ---------------------------------------------------------------------------

/** House squares plus garden squares (a garden is part of the house, base.md §9, §14). */
export function houseSquares(house: Pick<House, 'cells' | 'garden'>): Cell[] {
  return [...house.cells, ...(house.garden?.cells ?? [])];
}

/** 2x1 garden strip on one side of a 2x2 house so house + garden form a 2x3 rectangle (base.md §6.6). */
export function gardenCellsFor(houseCells: Cell[], side: Direction): Cell[] {
  const x0 = Math.min(...houseCells.map((c) => c.x));
  const y0 = Math.min(...houseCells.map((c) => c.y));
  const x1 = Math.max(...houseCells.map((c) => c.x));
  const y1 = Math.max(...houseCells.map((c) => c.y));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  switch (side) {
    case 'N':
      return rect(x0, y0 - 1, w, 1);
    case 'S':
      return rect(x0, y1 + 1, w, 1);
    case 'W':
      return rect(x0 - 1, y0, 1, h);
    case 'E':
      return rect(x1 + 1, y0, 1, h);
  }
}

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

export function allEmpty(board: Board, cells: Cell[]): boolean {
  return cells.every((c) => cellAt(board, c)?.kind === 'empty');
}

/** Road squares orthogonally adjacent to `cells` (outside them), deduplicated, reading order. */
export function adjacentRoadCells(board: Board, cells: Cell[]): Cell[] {
  const own = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (const c of cells) {
    for (const d of DIRECTIONS) {
      const n = step(c, d);
      const k = cellKey(n);
      if (own.has(k) || seen.has(k)) continue;
      if (cellAt(board, n)?.kind === 'road') {
        seen.add(k);
        out.push(n);
      }
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function touchesRoad(board: Board, cells: Cell[]): boolean {
  return adjacentRoadCells(board, cells).length > 0;
}

/** Mark squares as occupied. Throws if any square is off-board or not empty. */
export function paint(board: Board, cells: Cell[], kind: CellKind, occupant: string): void {
  for (const c of cells) {
    const cell = cellAt(board, c);
    if (!cell) throw new Error(`(${c.x},${c.y}) is off the board`);
    if (cell.kind !== 'empty') throw new Error(`(${c.x},${c.y}) is not empty (${cell.kind})`);
    cell.kind = kind;
    cell.occupant = occupant;
  }
}

/** Return squares to empty (restaurant moved). */
export function clearCells(board: Board, cells: Cell[]): void {
  for (const c of cells) {
    const cell = cellAt(board, c);
    if (!cell) continue;
    cell.kind = 'empty';
    cell.occupant = null;
    cell.road = null;
  }
}

// ---------------------------------------------------------------------------
// Board construction
// ---------------------------------------------------------------------------

/** One clockwise rotation maps canonical (r, c) to (c, 4 − r) (map.md §3). */
export function rotateTileCell(r: number, c: number, rotation: Rotation): [number, number] {
  let rr = r;
  let cc = c;
  for (let i = 0; i < rotation; i++) [rr, cc] = [cc, 4 - rr];
  return [rr, cc];
}

const CW: Record<Direction, Direction> = { N: 'E', E: 'S', S: 'W', W: 'N' };
export function rotateDir(d: Direction, rotation: Rotation): Direction {
  let out = d;
  for (let i = 0; i < rotation; i++) out = CW[out];
  return out;
}

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

export interface LayoutEntry {
  templateId: TileTemplateId;
  rotation: Rotation;
}

/**
 * Recompute every road square's `links` from adjacency (map.md §2): two orthogonally adjacent
 * road squares connect unless either side is capped or under construction. Bridges keep all
 * four links; the straight-through rule is applied by pathfinding.
 */
export function relinkRoads(board: Board): void {
  for (let y = 0; y < board.h; y++) {
    for (let x = 0; x < board.w; x++) {
      const road = board.cells[y]?.[x]?.road;
      if (!road) continue;
      road.links = [];
      for (const d of DIRECTIONS) {
        const n = step({ x, y }, d);
        const other = cellAt(board, n)?.road;
        if (!other) continue;
        if (road.capped?.includes(d) || other.capped?.includes(opposite(d))) continue;
        road.links.push(d);
      }
    }
  }
}

export function buildBoard(layout: LayoutEntry[][], tiles: Partial<Record<TileTemplateId, TileDef>>, ids: { nextId: number }): Board {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  const w = cols * 5;
  const h = rows * 5;
  const board: Board = { rows, cols, w, h, tileSize: 5, tiles: [], cells: [], houses: {}, restaurants: {}, campaigns: {}, drinkSources: {}, entities: {} };
  board.cells = Array.from({ length: h }, () =>
    Array.from({ length: w }, (): BoardCell => ({ kind: 'empty', tile: '', occupant: null, road: null })),
  );
  layout.forEach((row, tr) =>
    row.forEach(({ templateId, rotation }, tc) => {
      const def = tiles[templateId];
      if (!def) throw new Error(`unknown tile ${templateId}`);
      const tileId = allocId(ids, 'tile');
      const placed: PlacedTile = { id: tileId, row: tr, col: tc, templateId, rotation };
      board.tiles.push(placed);
      const toBoard = (r: number, c: number): Cell => {
        const [rr, cc] = rotateTileCell(r, c, rotation);
        return { x: tc * 5 + cc, y: tr * 5 + rr };
      };
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const p = toBoard(r, c);
          const cell = board.cells[p.y]?.[p.x] as BoardCell;
          const g = def.grid[r]?.[c] ?? '.';
          cell.tile = tileId;
          cell.kind = GLYPH_KIND[g] ?? 'empty';
          if (g === '#') cell.road = { links: [], bridge: false, underConstruction: false, roadworks: 0, lobbyistRoad: null } satisfies RoadCell;
        }
      }
      if (def.bridge) {
        const b = toBoard(def.bridge[0], def.bridge[1]);
        const road = board.cells[b.y]?.[b.x]?.road;
        if (road) road.bridge = true;
      }
      for (const cap of def.cappedEnds ?? []) {
        const p = toBoard(cap.cell[0], cap.cell[1]);
        const road = board.cells[p.y]?.[p.x]?.road;
        if (road) (road.capped ??= []).push(rotateDir(cap.side, rotation));
      }
      for (const hd of def.houses) {
        const id = allocId(ids, 'house');
        const cells = hd.cells.map(([r, c]) => toBoard(r, c));
        const house: House = {
          id,
          kind: hd.kind === 'apartment' ? 'apartment' : 'printed',
          order: hd.order,
          label: hd.label,
          cells,
          garden: hd.garden ? { cells: hd.garden.map(([r, c]) => toBoard(r, c)), source: 'printed' } : null,
          demand: [],
        };
        board.houses[id] = house;
        for (const c of houseSquares(house)) {
          const cell = cellAt(board, c);
          if (cell) cell.occupant = id;
        }
      }
      for (const d of def.drinks) {
        const p = toBoard(d.cell[0], d.cell[1]);
        const id = allocId(ids, 'source');
        board.drinkSources[id] = { id, x: p.x, y: p.y, drink: d.drink, tile: tileId };
        const cell = cellAt(board, p);
        if (cell) cell.occupant = id;
      }
      for (const park of def.parks ?? []) {
        const cells = park.map(([r, c]) => toBoard(r, c));
        const id = allocId(ids, 'entity');
        const xs = cells.map((p) => p.x);
        const ys = cells.map((p) => p.y);
        board.entities[id] = {
          kind: 'park',
          id,
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs) + 1,
          h: Math.max(...ys) - Math.min(...ys) + 1,
          printed: true,
        };
        for (const c of cells) {
          const cell = cellAt(board, c);
          if (cell) cell.occupant = id;
        }
      }
    }),
  );
  relinkRoads(board);
  return board;
}
