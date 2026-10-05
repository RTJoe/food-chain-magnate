/**
 * Campaign reach (base.md §9; DLX p30–32): which houses a campaign places demand on.
 * A house is "reached" through any of its squares OR its garden squares (the garden is part of
 * the house). Results are house ids sorted by dinnertime order (then id).
 *
 * API:
 * - `campaignReach(board, campaign)`: dispatch on kind (base kinds; other kinds → []).
 * - `billboardReach(board, cells)`: houses orthogonally adjacent to any billboard square.
 * - `mailboxReach(board, cells)`: 4-connected flood fill over non-road squares from the mailbox;
 *   only roads (incl. bridges) and the map edge block; roads touching at a corner block too.
 * - `airplaneReach(board, placement)` + `airplaneLines`: houses with a square in the covered
 *   rows (E/W side) or columns (N/S side).
 * - `radioReach(board, cell)`: houses with a square on the radio's tile or the 8 tiles around it.
 * - `campaignCells(placement)`: squares occupied by an on-board campaign tile.
 */
import type { Board, Campaign, CampaignPlacement, Cell, HouseId } from '../types/state.js';
import { DIRECTIONS, cellAt, cellKey, houseSquares, inBounds, rect, step } from './grid.js';

function sortHouses(board: Board, ids: Iterable<HouseId>): HouseId[] {
  return [...new Set(ids)].sort((a, b) => {
    const ha = board.houses[a];
    const hb = board.houses[b];
    return (ha?.order ?? 0) - (hb?.order ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/** Board houses only (the Ketchup rural area has no squares and is never reached here). */
function boardHouses(board: Board) {
  return Object.values(board.houses).filter((h) => h.cells.length > 0);
}

export function campaignCells(p: CampaignPlacement): Cell[] {
  return p.kind === 'board' ? rect(p.x, p.y, p.w, p.h) : [];
}

export function billboardReach(board: Board, cells: Cell[]): HouseId[] {
  const near = new Set<string>();
  for (const c of cells) for (const d of DIRECTIONS) near.add(cellKey(step(c, d)));
  return sortHouses(
    board,
    boardHouses(board)
      .filter((h) => houseSquares(h).some((s) => near.has(cellKey(s))))
      .map((h) => h.id),
  );
}

/** Squares a mailbox's mail spreads over (flood fill blocked by roads and the map edge). */
export function mailboxArea(board: Board, cells: Cell[]): Set<string> {
  const seen = new Set<string>();
  const stack: Cell[] = [];
  for (const c of cells) {
    if (!inBounds(board, c) || cellAt(board, c)?.kind === 'road') continue;
    seen.add(cellKey(c));
    stack.push(c);
  }
  while (stack.length) {
    const c = stack.pop() as Cell;
    for (const d of DIRECTIONS) {
      const n = step(c, d);
      const k = cellKey(n);
      if (seen.has(k) || !inBounds(board, n) || cellAt(board, n)?.kind === 'road' || cellAt(board, n)?.tile === '') continue;
      seen.add(k);
      stack.push(n);
    }
  }
  return seen;
}

export function mailboxReach(board: Board, cells: Cell[]): HouseId[] {
  const area = mailboxArea(board, cells);
  return sortHouses(
    board,
    boardHouses(board)
      .filter((h) => houseSquares(h).some((s) => area.has(cellKey(s))))
      .map((h) => h.id),
  );
}

/** Rows (side E/W) or columns (side N/S) an airplane flies over. */
export function airplaneLines(p: Extract<CampaignPlacement, { kind: 'airplane' }>): { axis: 'row' | 'col'; from: number; to: number } {
  const axis = p.side === 'N' || p.side === 'S' ? 'col' : 'row';
  return { axis, from: p.offset, to: p.offset + p.width - 1 };
}

export function airplaneReach(board: Board, p: Extract<CampaignPlacement, { kind: 'airplane' }>): HouseId[] {
  const { axis, from, to } = airplaneLines(p);
  return sortHouses(
    board,
    boardHouses(board)
      .filter((h) => houseSquares(h).some((s) => (axis === 'col' ? s.x : s.y) >= from && (axis === 'col' ? s.x : s.y) <= to))
      .map((h) => h.id),
  );
}

export function radioReach(board: Board, cell: Cell): HouseId[] {
  const tr = Math.floor(cell.y / 5);
  const tc = Math.floor(cell.x / 5);
  return sortHouses(
    board,
    boardHouses(board)
      .filter((h) => houseSquares(h).some((s) => Math.abs(Math.floor(s.y / 5) - tr) <= 1 && Math.abs(Math.floor(s.x / 5) - tc) <= 1))
      .map((h) => h.id),
  );
}

/** Houses a base-kind campaign reaches. Module kinds (giant billboard, gourmet guide) return []: modules supply them via the `campaignReach` hook. */
export function campaignReach(board: Board, campaign: Pick<Campaign, 'kind' | 'placement'>): HouseId[] {
  const p = campaign.placement;
  switch (campaign.kind) {
    case 'billboard':
      return billboardReach(board, campaignCells(p));
    case 'mailbox':
      return mailboxReach(board, campaignCells(p));
    case 'airplane':
      return p.kind === 'airplane' ? airplaneReach(board, p) : [];
    case 'radio': {
      const c = campaignCells(p)[0];
      return c ? radioReach(board, c) : [];
    }
    default:
      return [];
  }
}

/** Squares that make up a base-kind campaign's reach, for overlays (module kinds → []). */
export function campaignArea(board: Board, campaign: Pick<Campaign, 'kind' | 'placement'>): Cell[] {
  const p = campaign.placement;
  const all: Cell[] = [];
  const keep = (pred: (c: Cell) => boolean) => {
    for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) if (pred({ x, y })) all.push({ x, y });
    return all;
  };
  switch (campaign.kind) {
    case 'billboard': {
      const cells = campaignCells(p);
      const own = new Set(cells.map(cellKey));
      const near = new Set<string>();
      for (const c of cells) for (const d of DIRECTIONS) near.add(cellKey(step(c, d)));
      return keep((c) => near.has(cellKey(c)) && !own.has(cellKey(c)));
    }
    case 'mailbox': {
      const area = mailboxArea(board, campaignCells(p));
      return keep((c) => area.has(cellKey(c)));
    }
    case 'airplane': {
      if (p.kind !== 'airplane') return [];
      const { axis, from, to } = airplaneLines(p);
      return keep((c) => (axis === 'col' ? c.x : c.y) >= from && (axis === 'col' ? c.x : c.y) <= to);
    }
    case 'radio': {
      const r = campaignCells(p)[0];
      if (!r) return [];
      const tr = Math.floor(r.y / 5);
      const tc = Math.floor(r.x / 5);
      return keep((c) => Math.abs(Math.floor(c.y / 5) - tr) <= 1 && Math.abs(Math.floor(c.x / 5) - tc) <= 1);
    }
    default:
      return [];
  }
}
