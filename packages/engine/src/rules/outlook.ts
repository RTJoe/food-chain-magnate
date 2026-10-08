/**
 * Board previews for the UI (ux-plan.md §4). Pure functions over a `GameState` (the client calls
 * them on a pseudo-state built from its view, as it does for `legalPlacements`), so hot-seat and
 * online behave the same. Nothing here changes rules: every function reuses the rule code and the
 * module pipelines the reducer uses.
 *
 * - `campaignReach(state, query)`: houses a (hypothetical) campaign reaches, with demand, capacity
 *   and the tokens one run would add; plus the reach area squares for an overlay.
 * - `houseCellsReach(state, cells, garden?)`: existing campaigns that would reach a house placed on
 *   `cells` (new-house flow).
 * - `rangeOverlay(state, player, cardUid?, from?)`: road squares within a card's road range, by
 *   distance, from open-restaurant entrances and coffee shops (or one `from`).
 * - `houseOutlook(state, houseId)`: capacity, demand, connected sellers ranked as Dinnertime ranks
 *   them, the would-be winner (from a forecast of the whole Dinnertime), and the campaigns that
 *   reach the house.
 * - `placementProblem(state, player, spec, candidate)`: why a placement is illegal (null = legal),
 *   via the same validation as the action it would become.
 */
import type { Action, RouteStart } from '../types/actions.js';
import type { Campaign, CampaignId, Cell, GameState, House, HouseId, PlayerId, Uid } from '../types/state.js';
import type { CampaignReachPreview, CampaignReachQuery, HouseOutlook, Placement, PlacementSpec, RangeOverlay } from '../types/view.js';
import { makeCtx, readCtx, type EngineCtx } from '../core/context.js';
import { clone } from '../core/clone.js';
import { defOf } from '../core/cards.js';
import { validateAction } from '../core/reducer.js';
import { contentFor } from '../modules/registry.js';
import { campaignArea, campaignReach as baseCampaignReach } from '../map/reach.js';
import { distanceField, playerRouteStarts, roadAt, routeStartRoads, sameRouteStart } from '../map/pathfinding.js';
import { baseDemandCapacity, campaignRunOrder } from './marketing.js';
import { hasMilestone, runPipeline } from './pricing.js';
import { rankedCandidates, runDinnertime } from './dinnertime.js';
import { openDriveIns } from './working/stages.js';
import { buyerStats } from './working/buyDrinks.js';

const PREVIEW_ID = '__preview';

function previewCampaign(q: CampaignReachQuery): Campaign {
  return {
    id: PREVIEW_ID,
    owner: q.owner ?? '',
    number: q.tileNumber ?? null,
    kind: q.kind,
    goods: q.goods?.length ? [...q.goods] : ['burger'],
    placement: q.placement,
    remaining: 1,
    eternal: false,
    marketeer: null,
    source: 'marketeer',
    linked: [],
    placedRound: 0,
  };
}

/** Houses a campaign reaches, through the `campaignReach` module pipeline (giant billboard, gourmet guide). */
function reachOf(ctx: EngineCtx, camp: Campaign): HouseId[] {
  return runPipeline(ctx, 'campaignReach', baseCampaignReach(ctx.state.board, camp), { campaign: camp });
}

const capacityOf = (ctx: EngineCtx, house: House): number | null => runPipeline(ctx, 'demandCapacity', baseDemandCapacity(house), { house });

/** Reach preview for a campaign that may not exist yet (marketing rules base.md §9, DLX p30–32). */
export function campaignReach(state: GameState, query: CampaignReachQuery): CampaignReachPreview {
  const ctx = readCtx(state);
  const camp = previewCampaign(query);
  const houses = reachOf(ctx, camp).flatMap((houseId) => {
    const house = state.board.houses[houseId];
    if (!house) return [];
    const capacity = capacityOf(ctx, house);
    const base = camp.kind === 'radio' && query.owner && hasMilestone(state, query.owner, 'first_radio') ? 2 : 1;
    const amount = runPipeline(ctx, 'demandAmount', base, { house, campaign: camp });
    const wanted = amount * camp.goods.length;
    const room = capacity === null ? wanted : Math.max(0, capacity - house.demand.length);
    const adds = Math.min(wanted, room);
    return [{ houseId, demand: house.demand.length, capacity, adds, full: capacity !== null && house.demand.length >= capacity }];
  });
  return { houses, area: campaignArea(state.board, camp) };
}

/** Existing campaigns (run order) that would reach a house placed on `cells` (+ `garden`). */
export function houseCellsReach(state: GameState, cells: Cell[], garden?: Cell[]): CampaignId[] {
  const id = PREVIEW_ID;
  const house: House = { id, kind: 'placed', order: Number.MAX_SAFE_INTEGER, label: '?', cells, garden: garden?.length ? { cells: garden, source: 'withHouse' } : null, demand: [] };
  const s: GameState = { ...state, board: { ...state.board, houses: { ...state.board.houses, [id]: house } } };
  const ctx = readCtx(s);
  return campaignRunOrder(s).filter((cid) => {
    const camp = s.board.campaigns[cid];
    return camp ? reachOf(ctx, camp).includes(id) : false;
  });
}

type OutlookSeller = HouseOutlook['sellers'][number];
interface ForecastHouse {
  sellers: OutlookSeller[];
  winner: PlayerId | null;
}

const forecasts = new WeakMap<GameState, Map<HouseId, ForecastHouse> | null>();

/**
 * What Dinnertime would do if it ran on `state` now (memoised per state object): a copy gets the
 * drive-ins every local/regional manager at work will open (base.md §6.3a), then the real
 * Dinnertime runs on it — First to Lower Prices at its start, houses in ascending number, each
 * winner's goods used up before the next house is ranked (DLX p26–28). Null if it cannot run.
 */
function dinnerForecast(state: GameState): Map<HouseId, ForecastHouse> | null {
  if (forecasts.has(state)) return forecasts.get(state) ?? null;
  let out: Map<HouseId, ForecastHouse> | null = null;
  try {
    const sim = clone(state);
    const ctx = makeCtx(sim);
    for (const id of sim.turnOrder) if (!sim.players[id]?.bankrupt) openDriveIns(ctx, id);
    runDinnertime(ctx);
    out = new Map();
    for (const e of ctx.events) {
      if (e.type === 'houseConsidered') {
        const house = sim.board.houses[e.houseId];
        const waitresses = new Map(house ? rankedCandidates(ctx, house).map((r) => [r.candidate.player, r.candidate.waitresses]) : []);
        const sellers = (e.offers ?? []).map((o) => ({
          player: o.player,
          restaurantId: o.restaurantId,
          unitPrice: o.unitPrice,
          distance: o.distance,
          score: o.score,
          tier: o.tier,
          waitresses: waitresses.get(o.player) ?? 0,
          canSupply: o.canSupply,
          ...(o.items ? { items: { ...o.items } } : {}),
        }));
        out.set(e.houseId, { sellers, winner: null });
      } else if (e.type === 'sale') {
        const f = out.get(e.houseId);
        if (f) f.winner = e.player;
      }
    }
  } catch {
    out = null;
  }
  forecasts.set(state, out);
  return out;
}

/**
 * Capacity, sellers and campaigns for one house (base.md §7, §9). For a house with demand the
 * sellers and winner are those Dinnertime would produce if it ran now (`dinnerForecast`):
 * `canSupply` counts only the stock left after the earlier houses. Otherwise sellers are ranked at
 * current prices.
 */
export function houseOutlook(state: GameState, houseId: HouseId): HouseOutlook | null {
  const house = state.board.houses[houseId];
  if (!house) return null;
  const ctx = readCtx(state);
  const forecast = house.demand.length ? dinnerForecast(state)?.get(houseId) : undefined;
  const sellers =
    forecast?.sellers ??
    rankedCandidates(ctx, house).map(({ candidate: c, canSupply }) => ({
      player: c.player,
      restaurantId: c.restaurantId,
      unitPrice: c.unitPrice,
      distance: c.distance,
      score: c.score,
      tier: c.tier,
      waitresses: c.waitresses,
      canSupply,
      items: { ...c.items },
    }));
  const winner = house.demand.length ? (forecast ? forecast.winner : (sellers.find((x) => x.canSupply)?.player ?? null)) : null;
  const campaigns = campaignRunOrder(state).filter((cid) => {
    const camp = state.board.campaigns[cid];
    return camp ? reachOf(ctx, camp).includes(houseId) : false;
  });
  return { houseId, capacity: capacityOf(ctx, house), demand: house.demand.length, sellers, winner, campaigns };
}


/** The road range a card (or the player's pending coffee shop choice) measures from, or null = unlimited. */
function rangeFor(state: GameState, player: PlayerId, cardUid?: Uid): { range: number | null; road: boolean } {
  const p = state.players[player];
  if (!cardUid) {
    const head = state.pending[0];
    // ketchup.md §4: a coffee shop from training goes within road range 2.
    if (head?.kind === 'coffeeShop' && head.player === player) return { range: head.source === 'training' ? 2 : null, road: true };
    return { range: null, road: true };
  }
  const def = p ? defOf(contentFor(state.config.modules), p, cardUid) : undefined;
  const a = def?.ability;
  if (!def || !a) return { range: null, road: true };
  switch (a.kind) {
    case 'marketing':
      return { range: a.range === 'unlimited' ? null : a.range, road: true };
    case 'restaurant':
      return { range: a.mode === 'local' && a.range !== 'unlimited' ? a.range : null, road: true };
    case 'lobbyist':
      return { range: a.range, road: true };
    case 'buyDrinks':
      return { range: buyerStats(state, player, def).range, road: a.mode === 'road' };
    default:
      return { range: null, road: true };
  }
}

/**
 * Road squares within range of the player's open-restaurant entrances and coffee shops (or one
 * `from`), with their distance in tile borders — the field `marketingRangeProblem` and the
 * lobbyist / local manager / coffee shop checks measure against. Zeppelins (air) get no roads.
 */
export function rangeOverlay(state: GameState, player: PlayerId, cardUid?: Uid, from?: RouteStart): RangeOverlay {
  const { range, road } = rangeFor(state, player, cardUid);
  const all = playerRouteStarts(state.board, player);
  const starts = from ? all.filter((st) => sameRouteStart(st, from)) : all;
  if (!road || !starts.length) return { roads: [], starts, range };
  const field = distanceField(state.board, starts.flatMap((st) => routeStartRoads(state.board, st)));
  const roads: RangeOverlay['roads'] = [];
  for (let y = 0; y < state.board.h; y++) {
    for (let x = 0; x < state.board.w; x++) {
      const distance = field.dist[y * field.w + x] ?? Infinity;
      if (!Number.isFinite(distance) || (range !== null && distance > range) || !roadAt(state.board, { x, y })) continue;
      roads.push({ x, y, distance });
    }
  }
  return { roads, starts, range };
}

/** The action a placement becomes (campaign goods/duration default to burger / 1: they never affect legality). */
function actionFor(state: GameState, player: PlayerId, spec: PlacementSpec, p: Placement): Action | null {
  const cardUid = spec.cardUid ?? '';
  const choiceId = spec.choiceId ?? state.pending[0]?.id ?? '';
  const playerId = player;
  switch (p.kind) {
    case 'restaurant':
      if (state.phase.kind === 'setup.restaurants') return { type: 'setup.placeRestaurant', playerId, x: p.x, y: p.y, entrance: p.entrance };
      return { type: 'work.placeRestaurant', playerId, cardUid, x: p.x, y: p.y, entrance: p.entrance, ...(p.from ? { from: p.from } : {}) };
    case 'moveRestaurant':
      return { type: 'work.moveRestaurant', playerId, cardUid, restaurantId: p.restaurantId, x: p.x, y: p.y, entrance: p.entrance };
    case 'house':
      return { type: 'work.placeHouse', playerId, cardUid, houseOrder: p.houseOrder, x: p.x, y: p.y, gardenSide: p.gardenSide };
    case 'garden':
      return { type: 'work.placeGarden', playerId, cardUid, houseId: p.houseId, side: p.side };
    case 'campaign':
      if (spec.choiceId && !spec.cardUid) return { type: 'ketchup:newMilestones.placeSecondCampaign', playerId, choiceId, tileNumber: p.tileNumber, placement: p.placement };
      return {
        type: 'work.placeCampaign',
        playerId,
        cardUid,
        campaignKind: p.campaignKind,
        tileNumber: p.tileNumber,
        goods: ['burger'],
        placement: p.placement,
        duration: 1,
        ...(p.from ? { from: p.from } : {}),
      };
    case 'buyerRoute':
      return { type: 'work.buyDrinks', playerId, cardUid, route: p.route };
    case 'coffeeShop':
      return { type: 'ketchup:coffee.placeShop', playerId, choiceId, x: p.x, y: p.y, ...(p.moveFrom ? { moveFrom: p.moveFrom } : {}) };
    case 'lobbyistRoad':
      return { type: 'ketchup:lobbyists.placeRoad', playerId, cardUid, cells: p.cells, arrows: p.arrows, from: p.from };
    case 'park':
      return { type: 'ketchup:lobbyists.placePark', playerId, cardUid, x: p.x, y: p.y, w: p.w, h: p.h, from: p.from };
    case 'freeway':
      return { type: 'ketchup:ruralMarketeers.placeFreeway', playerId, choiceId, side: p.side, offset: p.offset };
    case 'mapTile':
      return { type: 'ketchup:lobbyists.placeMapTile', playerId, choiceId, row: p.row, col: p.col, rotation: p.rotation, ...(p.templateId ? { templateId: p.templateId } : {}) };
    case 'pizzaRadio':
      return { type: 'ketchup:newMilestones.placePizzaRadio', playerId, choiceId, x: p.x, y: p.y };
    case 'freeMailbox':
      return { type: 'ketchup:newMilestones.placeFreeMailbox', playerId, choiceId, x: p.x, y: p.y, good: 'burger' };
    default:
      return null;
  }
}

/**
 * Why `candidate` is not a legal placement for `spec` (null = legal). Uses the reducer's own
 * validation of the action the placement becomes, so module rules apply and the message is the
 * one a rejected action would carry (out of range, occupied, wrong sub-step, ...).
 */
export function placementProblem(state: GameState, player: PlayerId, spec: PlacementSpec, candidate: Placement): string | null {
  if (!candidate || candidate.kind !== spec.kind) return `Expected a ${spec.kind} placement`;
  if (candidate.kind === 'campaign' && spec.tileNumber !== undefined && candidate.tileNumber !== spec.tileNumber) return `Expected campaign #${spec.tileNumber}`;
  const action = actionFor(state, player, spec, candidate);
  if (!action) return 'Unknown placement';
  const r = validateAction(state, action);
  return r.ok ? null : r.message;
}
