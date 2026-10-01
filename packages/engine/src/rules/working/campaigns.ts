/**
 * 3d Launch campaigns (base.md §6.4; DLX p18–20).
 *
 * - One campaign per marketeer at work: trainee billboard (range 2, max 2), campaign manager
 *   + mailbox (range 3, max 3), brand manager + airplane (unlimited, max 4), brand director
 *   + radio (unlimited, max 5). Duration 1..max.
 * - The player takes any available campaign tile of an allowed type (`state.marketingTiles`).
 * - Board tiles (billboard, mailbox, radio): empty squares, orthogonally adjacent to a road.
 *   Road-range marketeers: the tile must touch the road their route used, within range counted
 *   in tile borders from an entrance of an OPEN restaurant; the border between that road square
 *   and the tile counts (DLX p19 example C). Footprints may be rotated (questions.md Q-B7).
 * - Airplanes: beside a board edge, 1/3/5 squares wide, no overhang past a map corner, no
 *   overlap with another airplane on the same edge (DLX p18).
 * - Goods: burger, pizza, or one drink type; marketing a good nobody can supply is allowed.
 * - The marketeer leaves the structure and is busy until the campaign ends. With "First
 *   billboard campaign" every campaign launched from then on (including the triggering one) is
 *   eternal (rules/milestones.ts applies it from the `campaignPlaced` event).
 */
import type { WorkPlaceCampaign, RouteStart } from '../../types/actions.js';
import type { CampaignKind, EmployeeDef, MarketingTileDef } from '../../types/content.js';
import type { Campaign, CampaignPlacement, Cell, GameState, PlayerId, PlayerState } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { removeFromStructure } from '../../core/cards.js';
import { contentFor } from '../../modules/registry.js';
import { FOODS } from '../../content/foods.js';
import { allEmpty, inBounds, paint, rect, touchesRoad } from '../../map/grid.js';
import { distanceField, distanceToFootprint, playerRouteStarts, routeStartRoads, type DistanceField } from '../../map/pathfinding.js';
import { launchesEternal } from '../milestones.js';
import { advanceTo, cardCheck, spend } from './stages.js';

const sameStart = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Distance field from one start, or from every open-restaurant entrance of the player. */
export function rangeField(s: GameState, player: PlayerId, from?: RouteStart): DistanceField | string {
  const starts = playerRouteStarts(s.board, player);
  if (from) {
    if (!starts.some((st) => sameStart(st, from))) return 'Range must start at an entrance of one of your open restaurants';
    return distanceField(s.board, routeStartRoads(s.board, from));
  }
  return distanceField(s.board, starts.flatMap((st) => routeStartRoads(s.board, st)));
}

/** Footprint check for an on-board campaign tile (null = fine). */
export function boardCampaignProblem(s: GameState, tile: MarketingTileDef, p: Extract<CampaignPlacement, { kind: 'board' }>): string | null {
  const okSize = (p.w === tile.w && p.h === tile.h) || (p.w === tile.h && p.h === tile.w);
  if (!okSize) return `Campaign #${tile.number} is ${tile.w}x${tile.h}`;
  if (![p.x, p.y].every(Number.isInteger)) return 'Bad coordinates';
  const cells = rect(p.x, p.y, p.w, p.h);
  if (!cells.every((c) => inBounds(s.board, c))) return 'The campaign must be on the map';
  if (!allEmpty(s.board, cells)) return 'Campaigns go on empty squares only';
  if (!touchesRoad(s.board, cells)) return 'The campaign must be next to a road';
  return null;
}

/** Airplane position check (null = fine). */
export function airplaneProblem(s: GameState, tile: MarketingTileDef, p: Extract<CampaignPlacement, { kind: 'airplane' }>, ignore?: string): string | null {
  const width = tile.width ?? tile.w;
  if (p.width !== width) return `Airplane #${tile.number} is ${width} wide`;
  if (!['N', 'E', 'S', 'W'].includes(p.side) || !Number.isInteger(p.offset)) return 'Bad airplane position';
  const len = p.side === 'N' || p.side === 'S' ? s.board.w : s.board.h;
  if (p.offset < 0 || p.offset + p.width > len) return 'Airplanes may not overhang the map';
  for (const c of Object.values(s.board.campaigns)) {
    if (c.id === ignore || c.placement.kind !== 'airplane' || c.placement.side !== p.side) continue;
    const o = c.placement;
    if (p.offset < o.offset + o.width && o.offset < p.offset + p.width) return 'Airplanes may not overlap';
  }
  return null;
}

/** Range check for road-range marketeers (null = fine). */
export function marketingRangeProblem(s: GameState, player: PlayerId, def: EmployeeDef, cells: Cell[], from?: RouteStart, field?: DistanceField): string | null {
  if (def.ability.kind !== 'marketing' || def.ability.range === 'unlimited') return null;
  const f = field ?? rangeField(s, player, from);
  if (typeof f === 'string') return f;
  const d = distanceToFootprint(s.board, f, cells);
  if (!Number.isFinite(d)) return 'The campaign is not connected by road to your open restaurants';
  if (d > def.ability.range) return `Out of range (${d} borders; range ${def.ability.range})`;
  return null;
}

/** Full placement check for a given tile and placement (shared with legal placements). */
export function campaignPlacementProblem(
  s: GameState,
  player: PlayerId,
  def: EmployeeDef,
  kind: CampaignKind,
  tileNumber: number,
  placement: CampaignPlacement,
  from?: RouteStart,
  field?: DistanceField,
): string | null {
  if (def.ability.kind !== 'marketing') return 'Not a marketeer';
  if (!def.ability.campaigns.includes(kind)) return `${def.name} cannot place a ${kind}`;
  const tile = contentFor(s.config.modules).marketingTiles[tileNumber];
  if (!tile || tile.kind !== kind) return `#${tileNumber} is not a ${kind}`;
  if (!s.marketingTiles.includes(tileNumber)) return `Campaign #${tileNumber} is not available`;
  if (!placement || typeof placement !== 'object') return 'Missing placement';
  if (kind === 'airplane') {
    if (placement.kind !== 'airplane') return 'Airplanes are placed beside the board';
    return airplaneProblem(s, tile, placement);
  }
  if (kind === 'billboard' || kind === 'mailbox' || kind === 'radio') {
    if (placement.kind !== 'board') return 'This campaign goes on the board';
    return boardCampaignProblem(s, tile, placement) ?? marketingRangeProblem(s, player, def, rect(placement.x, placement.y, placement.w, placement.h), from, field);
  }
  return `${kind} campaigns are not part of the base game`;
}

export function validateCampaign(s: GameState, a: WorkPlaceCampaign): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['marketing'], 'marketing');
  if (!c.ok) return c;
  const { def } = c;
  if (def.ability.kind !== 'marketing') return reject('CARD_UNAVAILABLE', 'Not a marketeer');
  if (!Array.isArray(a.goods) || a.goods.length !== 1) return reject('INVALID_PAYLOAD', 'Advertise exactly one good');
  const good = FOODS.find((f) => f.id === a.goods[0]);
  if (!good?.marketable || (good.module !== 'base' && !s.config.modules.includes(good.module))) return reject('ILLEGAL', 'That good cannot be marketed');
  if (!Number.isInteger(a.duration) || a.duration < 1 || a.duration > def.ability.maxDuration) {
    return reject('ILLEGAL', `Duration must be 1–${def.ability.maxDuration}`);
  }
  const problem = campaignPlacementProblem(s, a.playerId, def, a.campaignKind, a.tileNumber, a.placement, a.from);
  return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
}

export function applyCampaign(ctx: EngineCtx, a: WorkPlaceCampaign): void {
  const s = ctx.state;
  const turn = s.turn;
  const p = s.players[a.playerId] as PlayerState;
  if (!turn) return;
  advanceTo(ctx, 'marketing');
  const id = ctx.id('campaign');
  const placement: CampaignPlacement = JSON.parse(JSON.stringify(a.placement)) as CampaignPlacement;
  if (placement.kind === 'board') paint(s.board, rect(placement.x, placement.y, placement.w, placement.h), 'campaign', id);
  const eternal = launchesEternal(ctx, a.playerId, a.campaignKind);
  const camp: Campaign = {
    id,
    owner: a.playerId,
    number: a.tileNumber,
    kind: a.campaignKind,
    goods: [...a.goods],
    placement,
    remaining: eternal ? 1 : a.duration,
    eternal,
    marketeer: a.cardUid,
    source: 'marketeer',
    linked: [],
    placedRound: s.round,
  };
  s.board.campaigns[id] = camp;
  s.marketingTiles = s.marketingTiles.filter((n) => n !== a.tileNumber);
  spend(ctx, a.cardUid);
  turn.uses[a.cardUid] = 0;
  removeFromStructure(p, a.cardUid);
  p.busy[a.cardUid] = [...(p.busy[a.cardUid] ?? []), id];
  turn.campaignsPlaced.push(id);
  ctx.emit({ type: 'campaignPlaced', player: a.playerId, campaign: JSON.parse(JSON.stringify(camp)) as Campaign });
}
