/**
 * 3e Prep drinks (base.md §6.5; DLX p21–23).
 *
 * - Errand boy: 1 drink of any type, no route (the type need not be on the map).
 * - Cart operator / truck driver: road route of range 2 / 3 from an entrance corner of an OPEN
 *   restaurant (any corner with a drive-in). The path starts on a road square next to the corner
 *   (stepping onto another tile costs 1); no immediate reversal; revisits allowed. Route length is
 *   free (0..range) but every supplier next to the traced road is collected (questions.md Q-B2).
 *   2 / 3 drinks per supplier; each supplier once per buyer.
 * - Zeppelin: tile-to-tile ignoring roads, range 4, never re-entering a tile; 2 per supplier on
 *   every tile entered including the start tile.
 * - "First errand boy played": +1 per supplier (errand boys get 2). "First cart operator played":
 *   road/air buyers +1 range (DLX p34). Ketchup per-card overrides via `buyerPerSourceOverride`.
 */
import type { BuyerRoute, WorkBuyDrinks } from '../../types/actions.js';
import type { DrinkId, EmployeeDef } from '../../types/content.js';
import type { GameState, PlayerId, SourceId } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { hasEffect } from '../../core/cards.js';
import { contentFor } from '../../modules/registry.js';
import { DRINKS } from '../../content/foods.js';
import { playerRouteStarts, routeStartOrigin, routeStartRoads, tileRCOf, validateAirRoute, validateRoadRoute, sameRouteStart } from '../../map/pathfinding.js';
import { advanceTo, cardCheck, spend } from './stages.js';

/** Effective per-source amount and range for a buyer card of `player`. */
export function buyerStats(s: GameState, player: PlayerId, def: EmployeeDef): { perSource: number; range: number } {
  if (def.ability.kind !== 'buyDrinks') return { perSource: 0, range: 0 };
  const content = contentFor(s.config.modules);
  let perSource = def.ability.perSource;
  for (const e of hasEffect(s, content, player, 'buyerPerSourceBonus')) perSource += e.amount;
  for (const e of hasEffect(s, content, player, 'buyerPerSourceOverride')) {
    const v = e.values[def.id];
    if (v !== undefined) perSource = v;
  }
  let range = def.ability.range;
  if (def.ability.mode !== 'errand') for (const e of hasEffect(s, content, player, 'buyerRangeBonus')) range += e.amount;
  return { perSource, range };
}


export type DrinkHaul = { sourceId: SourceId | null; drink: DrinkId; count: number }[];

/** Validate the route and compute what it collects. */
export function drinkHaul(s: GameState, a: WorkBuyDrinks, def: EmployeeDef): DrinkHaul | string {
  if (def.ability.kind !== 'buyDrinks') return 'Not a drink buyer';
  const route = a.route;
  if (!route || typeof route !== 'object') return 'Missing route';
  const { perSource, range } = buyerStats(s, a.playerId, def);
  const mode = def.ability.mode;
  if (route.mode !== mode) return `${def.name} needs a ${mode} route`;
  if (route.mode === 'errand') {
    if (!(DRINKS as readonly string[]).includes(route.drink)) return 'Choose beer, lemonade or soda';
    return [{ sourceId: null, drink: route.drink, count: perSource }];
  }
  const starts = playerRouteStarts(s.board, a.playerId);
  if (!starts.some((st) => sameRouteStart(st, route.from))) return 'The route must start at an entrance of one of your open restaurants';
  let sources: SourceId[];
  if (route.mode === 'road') {
    if (!Array.isArray(route.path)) return 'Missing path';
    const check = validateRoadRoute(s.board, routeStartRoads(s.board, route.from), route.path, range);
    if (!check.ok) return check.message;
    sources = check.sources;
  } else {
    const origin = routeStartOrigin(s.board, route.from);
    if (!origin || !Array.isArray(route.tiles)) return 'Bad route';
    const check = validateAirRoute(s.board, [tileRCOf(origin)], route.tiles, range);
    if (!check.ok) return check.message;
    sources = check.sources;
  }
  return sources.map((id) => ({ sourceId: id, drink: s.board.drinkSources[id]?.drink as DrinkId, count: perSource }));
}

export function validateBuyDrinks(s: GameState, a: WorkBuyDrinks): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['buyDrinks'], 'food');
  if (!c.ok) return c;
  const haul = drinkHaul(s, a, c.def);
  return typeof haul === 'string' ? reject('ILLEGAL_ROUTE', haul) : OK;
}

/** A plain copy of the played route (actions may carry extra keys from clients). */
function cloneRoute(r: WorkBuyDrinks['route']): BuyerRoute {
  if (r.mode === 'errand') return { mode: 'errand', drink: r.drink };
  if (r.mode === 'road') return { mode: 'road', from: { ...r.from }, path: r.path.map((c) => ({ x: c.x, y: c.y })) };
  return { mode: 'air', from: { ...r.from }, tiles: r.tiles.map((t) => ({ row: t.row, col: t.col })) };
}

export function applyBuyDrinks(ctx: EngineCtx, a: WorkBuyDrinks): void {
  const s = ctx.state;
  const p = s.players[a.playerId];
  const card = p?.employees[a.cardUid];
  const def = card ? ctx.content.employees[card.employeeId] : undefined;
  if (!p || !def) return;
  const haul = drinkHaul(s, a, def);
  if (typeof haul === 'string') return;
  advanceTo(ctx, 'food');
  for (const h of haul) p.inventory[h.drink] = (p.inventory[h.drink] ?? 0) + h.count;
  spend(ctx, a.cardUid);
  const path = a.route.mode === 'road' ? a.route.path.map((c) => ({ x: c.x, y: c.y })) : [];
  ctx.emit({ type: 'drinksBought', player: a.playerId, uid: a.cardUid, path, collected: haul.map((h) => ({ ...h })), route: cloneRoute(a.route) });
}
