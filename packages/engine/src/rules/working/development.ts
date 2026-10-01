/**
 * 3f Place houses & gardens — New Business Developer (base.md §6.6; DLX p24; map.md §5–6).
 *
 * One action per NBD: a new house+garden combo OR a garden on an existing house.
 * - New house: any available combo token (the player picks its number); a 2x2 house with its
 *   2x1 garden forming a 2x3 piece, on empty squares, unlimited range, with part of an edge
 *   orthogonally adjacent to a road. It may span tile borders.
 * - New garden: next to a printed house without a garden, on empty squares, so that house and
 *   garden form a 2x3 rectangle. Apartments and placed houses never get one. Limited to 8.
 */
import type { WorkPlaceGarden, WorkPlaceHouse } from '../../types/actions.js';
import type { Direction } from '../../types/content.js';
import type { Cell, GameState, House } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { DIRECTIONS, allEmpty, gardenCellsFor, inBounds, paint, rect, touchesRoad } from '../../map/grid.js';
import { advanceTo, cardCheck, spend } from './stages.js';

export function housePlacementProblem(s: GameState, houseOrder: number, x: number, y: number, side: Direction): string | null {
  if (!s.houseTiles.includes(houseOrder)) return `House #${houseOrder} is not available`;
  if (!DIRECTIONS.includes(side)) return 'Bad garden side';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad coordinates';
  const cells = rect(x, y, 2, 2);
  const garden = gardenCellsFor(cells, side);
  const all = [...cells, ...garden];
  if (!all.every((c) => inBounds(s.board, c))) return 'The house must be on the map';
  if (!allEmpty(s.board, all)) return 'Houses go on empty squares only';
  if (!touchesRoad(s.board, all)) return 'The house must be next to a road';
  return null;
}

export function gardenPlacementProblem(s: GameState, houseId: string, side: Direction): string | null {
  const house = s.board.houses[houseId];
  if (!house) return 'No such house';
  if (house.kind !== 'printed') return 'Only printed houses can get a garden';
  if (house.garden) return 'That house already has a garden';
  if (s.gardenTiles <= 0) return 'No garden tiles left';
  if (!DIRECTIONS.includes(side)) return 'Bad garden side';
  const cells = gardenCellsFor(house.cells, side);
  if (!cells.every((c) => inBounds(s.board, c))) return 'The garden must be on the map';
  if (!allEmpty(s.board, cells)) return 'Gardens go on empty squares only';
  return null;
}

export function validatePlaceHouse(s: GameState, a: WorkPlaceHouse): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['newBusiness'], 'houses');
  if (!c.ok) return c;
  const p = housePlacementProblem(s, a.houseOrder, a.x, a.y, a.gardenSide);
  return p ? reject('ILLEGAL_PLACEMENT', p) : OK;
}

export function validatePlaceGarden(s: GameState, a: WorkPlaceGarden): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['newBusiness'], 'houses');
  if (!c.ok) return c;
  const p = gardenPlacementProblem(s, a.houseId, a.side);
  return p ? reject('ILLEGAL_PLACEMENT', p) : OK;
}

const copy = (cells: Cell[]): Cell[] => cells.map((c) => ({ x: c.x, y: c.y }));

export function applyPlaceHouse(ctx: EngineCtx, a: WorkPlaceHouse): void {
  const s = ctx.state;
  advanceTo(ctx, 'houses');
  const id = ctx.id('house');
  const cells = rect(a.x, a.y, 2, 2);
  const garden = gardenCellsFor(cells, a.gardenSide);
  const house: House = {
    id,
    kind: 'placed',
    order: a.houseOrder,
    label: String(a.houseOrder),
    cells,
    garden: { cells: garden, source: 'withHouse' },
    demand: [],
  };
  paint(s.board, cells, 'house', id);
  paint(s.board, garden, 'garden', id);
  s.board.houses[id] = house;
  s.houseTiles = s.houseTiles.filter((n) => n !== a.houseOrder);
  spend(ctx, a.cardUid);
  ctx.emit({ type: 'houseBuilt', player: a.playerId, houseId: id, cells: copy(cells), garden: copy(garden) });
}

export function applyPlaceGarden(ctx: EngineCtx, a: WorkPlaceGarden): void {
  const s = ctx.state;
  const house = s.board.houses[a.houseId];
  if (!house) return;
  advanceTo(ctx, 'houses');
  const cells = gardenCellsFor(house.cells, a.side);
  paint(s.board, cells, 'garden', house.id);
  house.garden = { cells, source: 'gardenTile' };
  s.gardenTiles -= 1;
  spend(ctx, a.cardUid);
  ctx.emit({ type: 'gardenAdded', player: a.playerId, houseId: house.id, cells: copy(cells) });
}
