/**
 * 3g Place or move restaurants (base.md §6.7; DLX p25).
 *
 * General: all 4 squares empty; the entrance corner touches a road from outside; entrances may
 * share a tile (the one-per-tile rule is for setup only, JD 1452841). At most 3 restaurants.
 * - Local manager: new restaurant COMING SOON (opens in Clean up). Its entrance must connect to
 *   the road the manager's route used: road range 3 from an entrance of an OPEN restaurant, in
 *   tile borders, the corner/road border counting like any piece (DLX p25).
 * - Regional manager: EITHER a new OPEN restaurant anywhere (unlimited range) with a drive-in
 *   sign, OR move one open restaurant anywhere / rotate it in place (keeps its drive-in). Not both.
 * Drive-ins (3c) are opened by stages.ts.
 */
import type { RouteStart, WorkMoveRestaurant, WorkPlaceRestaurant } from '../../types/actions.js';
import type { Corner, GameState, PlayerId, PlayerState } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { clearCells, cornerCell, paint, restaurantCells } from '../../map/grid.js';
import { distanceToFootprint, type DistanceField } from '../../map/pathfinding.js';
import { contentFor } from '../../modules/registry.js';
import { restaurantSpotProblem } from '../setup.js';
import { rangeField } from './campaigns.js';
import { advanceTo, cardCheck, spend } from './stages.js';

export function newRestaurantProblem(
  s: GameState,
  player: PlayerId,
  mode: 'local' | 'regional',
  range: number | 'unlimited',
  x: number,
  y: number,
  entrance: Corner,
  from?: RouteStart,
  field?: DistanceField,
): string | null {
  const p = s.players[player];
  if (!p || p.restaurantsRemaining <= 0) return 'All 3 of your restaurants are on the board';
  const spot = restaurantSpotProblem(s, x, y, entrance);
  if (spot) return spot;
  if (mode === 'regional' || range === 'unlimited') return null;
  const f = field ?? rangeField(s, player, from);
  if (typeof f === 'string') return f;
  const d = distanceToFootprint(s.board, f, [cornerCell(x, y, entrance)]);
  if (!Number.isFinite(d)) return 'The entrance is not connected by road to your open restaurants';
  if (d > range) return `Out of range (${d} borders; range ${range})`;
  return null;
}

function restaurantAbility(s: GameState, player: PlayerId, uid: string) {
  const p = s.players[player];
  const card = p?.employees[uid];
  const def = card ? contentFor(s.config.modules).employees[card.employeeId] : undefined;
  return def?.ability.kind === 'restaurant' ? def.ability : null;
}

export function validatePlaceRestaurant(s: GameState, a: WorkPlaceRestaurant): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['restaurant'], 'restaurants');
  if (!c.ok) return c;
  const ab = restaurantAbility(s, a.playerId, a.cardUid);
  if (!ab) return reject('CARD_UNAVAILABLE', 'Not a restaurant manager');
  const problem = newRestaurantProblem(s, a.playerId, ab.mode, ab.range, a.x, a.y, a.entrance, a.from);
  return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
}

export function moveRestaurantProblem(s: GameState, player: PlayerId, restaurantId: string, x: number, y: number, entrance: Corner): string | null {
  const r = s.board.restaurants[restaurantId];
  if (!r || r.owner !== player) return 'Not your restaurant';
  if (r.status !== 'open') return 'Only open restaurants can be moved';
  if (r.x === x && r.y === y && r.entrance === entrance) return 'The restaurant is already there';
  return restaurantSpotProblem(s, x, y, entrance, [restaurantId]);
}

export function validateMoveRestaurant(s: GameState, a: WorkMoveRestaurant): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['restaurant'], 'restaurants');
  if (!c.ok) return c;
  const ab = restaurantAbility(s, a.playerId, a.cardUid);
  if (ab?.mode !== 'regional') return reject('CARD_UNAVAILABLE', 'Only a regional manager can move a restaurant');
  const problem = moveRestaurantProblem(s, a.playerId, a.restaurantId, a.x, a.y, a.entrance);
  return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
}

export function applyPlaceRestaurant(ctx: EngineCtx, a: WorkPlaceRestaurant): void {
  const s = ctx.state;
  const ab = restaurantAbility(s, a.playerId, a.cardUid);
  const p = s.players[a.playerId] as PlayerState;
  if (!ab) return;
  advanceTo(ctx, 'restaurants');
  const id = ctx.id('restaurant');
  const comingSoon = ab.mode === 'local';
  paint(s.board, restaurantCells(a.x, a.y), 'restaurant', id);
  s.board.restaurants[id] = {
    id,
    owner: a.playerId,
    x: a.x,
    y: a.y,
    entrance: a.entrance,
    status: comingSoon ? 'comingSoon' : 'open',
    placedRound: s.round,
    ...(comingSoon ? {} : { driveIn: true }),
  };
  p.restaurantsRemaining -= 1;
  spend(ctx, a.cardUid);
  ctx.emit({ type: 'restaurantPlaced', player: a.playerId, restaurantId: id, x: a.x, y: a.y, entrance: a.entrance, comingSoon });
}

export function applyMoveRestaurant(ctx: EngineCtx, a: WorkMoveRestaurant): void {
  const s = ctx.state;
  const r = s.board.restaurants[a.restaurantId];
  if (!r) return;
  advanceTo(ctx, 'restaurants');
  clearCells(s.board, restaurantCells(r.x, r.y));
  paint(s.board, restaurantCells(a.x, a.y), 'restaurant', r.id);
  r.x = a.x;
  r.y = a.y;
  r.entrance = a.entrance;
  spend(ctx, a.cardUid);
  ctx.emit({ type: 'restaurantMoved', player: a.playerId, restaurantId: r.id, x: a.x, y: a.y, entrance: a.entrance });
}
