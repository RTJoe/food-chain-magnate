/**
 * Setup: first restaurants and reserve cards (base.md §2.6–2.7; DLX p4–6).
 *
 * §2.6 First restaurants: round 1 in REVERSE turn order, each player places one restaurant or
 * passes; round 2 in turn order for those who passed, who must place now. Placement: all 4
 * squares empty; the entrance corner touches a road from outside (one of the 2 outside squares
 * orthogonal to the corner); the entrance is not on the same map tile as an existing
 * restaurant's entrance (initial placement only, JD 1452841). A player with no legal spot is
 * skipped (cannot happen on official maps; recorded as a pass).
 *
 * §2.7 Reserve: each player secretly picks +$100 (2 slots) / +$200 (3) / +$300 (4). Not in the
 * intro game.
 */
import type { SetupChooseReserve, SetupPass, SetupPlaceRestaurant } from '../types/actions.js';
import type { Corner, GameState, PlayerId, ReserveCard } from '../types/state.js';
import type { Placement } from '../types/view.js';
import type { EngineCtx } from '../core/context.js';
import { OK, reject, type Check } from '../core/errors.js';
import { CORNERS, allEmpty, cellAt, cornerCell, entranceOutside, inBounds, paint, restaurantCells, tileOf } from '../map/grid.js';
import { roadAt } from '../map/pathfinding.js';
import { pipe } from '../modules/registry.js';
import { readCtx } from '../core/context.js';

export const STANDARD_RESERVES: readonly ReserveCard[] = [
  { kind: 'standard', amount: 100, ceoSlots: 2 },
  { kind: 'standard', amount: 200, ceoSlots: 3 },
  { kind: 'standard', amount: 300, ceoSlots: 4 },
];

/** Shared by setup and later placements: 2x2 in bounds, all squares empty, entrance touches a road from outside. */
export function restaurantSpotProblem(s: GameState, x: number, y: number, entrance: Corner, ignore: string[] = []): string | null {
  if (!CORNERS.includes(entrance)) return 'Bad entrance corner';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad coordinates';
  const cells = restaurantCells(x, y);
  if (!cells.every((c) => inBounds(s.board, c))) return 'Restaurant must be on the map';
  const free = cells.every((c) => {
    const cell = cellAt(s.board, c);
    return cell?.kind === 'empty' || (cell?.occupant !== null && cell?.occupant !== undefined && ignore.includes(cell.occupant));
  });
  if (!free) return 'All 4 squares must be empty';
  if (!entranceOutside(x, y, entrance).some((c) => roadAt(s.board, c))) return 'The entrance must touch a road';
  return null;
}

/** base.md §2.6.3: the initial-placement-only tile rule. */
export function initialPlacementProblem(s: GameState, x: number, y: number, entrance: Corner): string | null {
  const p = restaurantSpotProblem(s, x, y, entrance);
  if (p) return p;
  const tile = tileOf(s.board, cornerCell(x, y, entrance));
  for (const r of Object.values(s.board.restaurants)) {
    if (tileOf(s.board, cornerCell(r.x, r.y, r.entrance)) === tile) return 'The entrance may not share a map tile with another restaurant entrance';
  }
  return null;
}

export function legalInitialPlacements(s: GameState): Placement[] {
  const out: Placement[] = [];
  for (let y = 0; y < s.board.h - 1; y++) {
    for (let x = 0; x < s.board.w - 1; x++) {
      if (!allEmpty(s.board, restaurantCells(x, y))) continue;
      for (const entrance of CORNERS) if (!initialPlacementProblem(s, x, y, entrance)) out.push({ kind: 'restaurant', x, y, entrance });
    }
  }
  return out;
}

export function currentSetupPlayer(s: GameState): PlayerId | null {
  return s.phase.kind === 'setup.restaurants' ? (s.phase.order[s.phase.idx] ?? null) : null;
}

export function validateSetupRestaurant(s: GameState, a: SetupPlaceRestaurant | SetupPass): Check {
  if (s.phase.kind !== 'setup.restaurants') return reject('WRONG_PHASE', 'Not placing first restaurants');
  if (currentSetupPlayer(s) !== a.playerId) return reject('NOT_YOUR_TURN', 'Not your turn to place');
  if (a.type === 'setup.pass') return s.phase.round === 1 ? OK : reject('ILLEGAL', 'In the second round you must place a restaurant');
  const p = initialPlacementProblem(s, a.x, a.y, a.entrance);
  return p ? reject('ILLEGAL_PLACEMENT', p) : OK;
}

export function applySetupRestaurant(ctx: EngineCtx, a: SetupPlaceRestaurant | SetupPass): void {
  const s = ctx.state;
  if (s.phase.kind !== 'setup.restaurants') return;
  const ph = s.phase;
  if (a.type === 'setup.pass') {
    ph.passed.push(a.playerId);
    ctx.emit({ type: 'setupPassed', player: a.playerId });
  } else {
    const id = ctx.id('restaurant');
    paint(s.board, restaurantCells(a.x, a.y), 'restaurant', id);
    s.board.restaurants[id] = { id, owner: a.playerId, x: a.x, y: a.y, entrance: a.entrance, status: 'open', placedRound: s.round };
    const p = s.players[a.playerId];
    if (p) p.restaurantsRemaining -= 1;
    ph.placed.push(a.playerId);
    ctx.emit({ type: 'restaurantPlaced', player: a.playerId, restaurantId: id, x: a.x, y: a.y, entrance: a.entrance, comingSoon: false });
  }
  ph.idx += 1;
}

/**
 * Skip players who cannot place and move to round 2 when needed. Returns 'await' if a player
 * must act, 'done' when every player has placed (or cannot).
 */
export function normalizeSetup(ctx: EngineCtx): 'await' | 'done' {
  const s = ctx.state;
  for (let guard = 0; guard < 64; guard++) {
    if (s.phase.kind !== 'setup.restaurants') return 'done';
    const ph = s.phase;
    const who = ph.order[ph.idx];
    if (who !== undefined) {
      if (legalInitialPlacements(s).length > 0) return 'await';
      if (ph.round === 1) ph.passed.push(who);
      ctx.emit({ type: 'setupPassed', player: who });
      ph.idx += 1;
      continue;
    }
    if (ph.round === 1 && ph.passed.length > 0) {
      const order = s.turnOrder.filter((id) => ph.passed.includes(id));
      s.phase = { kind: 'setup.restaurants', round: 2, order, idx: 0, placed: ph.placed, passed: [] };
      ctx.emit({ type: 'phaseChanged', from: 'setup.restaurants', to: s.phase });
      continue;
    }
    return 'done';
  }
  return 'done';
}

// ---------------------------------------------------------------------------
// Reserve cards (base.md §2.7)
// ---------------------------------------------------------------------------

export function reserveOptions(s: GameState): ReserveCard[] {
  const base = [...STANDARD_RESERVES];
  return s.config.modules.length ? pipe(readCtx(s), 'reserveOptions', base, {}) : base;
}

export function validateReserve(s: GameState, a: SetupChooseReserve): Check {
  if (s.phase.kind !== 'setup.reserve') return reject('WRONG_PHASE', 'Not choosing reserve cards');
  const sec = s.secrets[a.playerId];
  if (!sec) return reject('INVALID_PAYLOAD', 'Unknown player');
  if (sec.reserve) return reject('ALREADY_SUBMITTED', 'Reserve card already chosen');
  const card = a.card;
  const ok = reserveOptions(s).some((r) => JSON.stringify(r) === JSON.stringify(card));
  return ok ? OK : reject('INVALID_PAYLOAD', 'Not one of your reserve cards');
}

export function applyReserve(ctx: EngineCtx, a: SetupChooseReserve): void {
  const sec = ctx.state.secrets[a.playerId];
  if (!sec) return;
  sec.reserve = { ...a.card } as ReserveCard;
  ctx.emit({ type: 'reserveChosen', player: a.playerId, card: { ...a.card } as ReserveCard });
}

export function reserveDone(s: GameState): boolean {
  return s.turnOrder.every((id) => s.players[id]?.bankrupt || s.secrets[id]?.reserve);
}
