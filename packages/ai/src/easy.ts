/**
 * Easy bot: sensible but beatable. One light heuristic per decision, no lookahead:
 * - setup: first restaurant where houses cluster, away from rivals; random reserve card.
 * - restructuring: as many cards at work as the CEO slots allow (heuristics.simpleStructure).
 * - order of business: earliest free position.
 * - working, card by card in sub-step order: hire food producers, marketeers, a buyer, a trainer
 *   and a manager; train cooks and managers while salaries stay affordable; cook what can be sold;
 *   fetch the most wanted drinks; campaign on houses near its own restaurants; build houses next
 *   to them; open restaurants where houses cluster. Anything else (moving restaurants) is skipped.
 * - payday: fire salaried cards (beach first) only when salaries exceed cash.
 * - clean up: freeze the most plentiful goods.
 * - Ketchup choices: place what must be placed, near its restaurants when it matters; accept
 *   optional bonuses (second campaign, freeway); decline anything else.
 * A little noise (the decision's rng) keeps games from repeating.
 */
import type { Action, EngineApi, FoodId, GameState, LegalAction, Placement, PlayerId, RngState, Uid } from '@fcm/engine';
import { abilityStage, freezerCapacity, nextFloat, randomInt, shuffle, stageIndex, stagesFor, stockOf } from '@fcm/engine';
import type { Bot, BotInput } from './types.js';
import { viewState } from './viewState.js';
import {
  actionFromPlacement,
  cardDef,
  contentOf,
  demandNear,
  distToMine,
  fallbackAction,
  favouriteGood,
  firingPlan,
  forcedFirePlan,
  incomeEstimate,
  ownedKinds,
  placementCells,
  restaurantSpotScore,
  salaryOutlook,
  simpleStructure,
} from './heuristics.js';

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

/** Placements scored per placement action (Easy samples instead of scanning the whole board). */
const SAMPLE = 48;
/** Campaign spots are where the game is won: look at more of them. */
const CAMPAIGN_SAMPLE = 240;

interface Ctx {
  s: GameState;
  me: PlayerId;
  engine: EngineApi;
  rng: RngState;
  legal: LegalAction[];
}

export function createEasyBot(): Bot {
  return { level: 'easy', choose: easyChoose };
}

export function easyChoose(input: BotInput): Action {
  const s = viewState(input.view);
  const ctx: Ctx = { s, me: input.playerId, engine: input.engine, rng: input.rng, legal: input.legal };
  let candidates: Action[] = [];
  try {
    candidates = decide(ctx);
  } catch {
    candidates = [];
  }
  for (const a of candidates) if (input.engine.validateAction(s, a).ok) return a;
  return fallbackAction(s, input.playerId, input.engine, input.legal, input.rng);
}

const readyOf = (legal: LegalAction[], type?: Action['type']): Action[] => legal.flatMap((l) => (l.kind === 'ready' && (!type || l.action.type === type) ? [l.action] : []));
const placementsOf = (legal: LegalAction[]): PlacementLegal[] => legal.filter((l): l is PlacementLegal => l.kind === 'placement');

function decide(c: Ctx): Action[] {
  const { s, me } = c;
  const head = s.pending[0];
  if (head && head.player === me) return decideChoice(c);
  switch (s.phase.kind) {
    case 'setup.restaurants':
      return [...bestPlacements(c, placementsOf(c.legal), (pl) => (pl.kind === 'restaurant' ? restaurantSpotScore(s, me, pl.x, pl.y, pl.entrance) : 0)), ...readyOf(c.legal, 'setup.pass')];
    case 'setup.reserve': {
      const opts = readyOf(c.legal, 'setup.chooseReserve');
      return opts.length ? [opts[randomInt(c.rng, opts.length)] as Action] : [];
    }
    case 'restructuring':
      return [{ type: 'restructure.submit', playerId: me, structure: simpleStructure(s, me) }];
    case 'orderOfBusiness': {
      const opts = readyOf(c.legal, 'order.choosePosition') as Extract<Action, { type: 'order.choosePosition' }>[];
      return [...opts].sort((a, b) => a.position - b.position);
    }
    case 'working':
      return decideWork(c);
    case 'payday': {
      const fire = firingPlan(s, me);
      return [...(fire.length ? [{ type: 'payday.fire', playerId: me, uids: fire } as Action] : []), { type: 'payday.confirm', playerId: me }];
    }
    case 'cleanup':
      return [{ type: 'cleanup.freezer', playerId: me, keep: freezerKeep(s, me) }, { type: 'cleanup.freezer', playerId: me, keep: {} }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Pending choices (forced firing, Ketchup rewards)
// ---------------------------------------------------------------------------

function decideChoice(c: Ctx): Action[] {
  const { s, me } = c;
  const head = s.pending[0];
  if (!head) return [];
  if (head.kind === 'forcedFire') return [{ type: 'payday.fire', playerId: me, uids: forcedFirePlan(s, me) }];
  const good = favouriteGood(s, me, (g) => contentOf(s).foods[g]?.marketable ?? false);
  const out: Action[] = [];
  for (const la of placementsOf(c.legal)) {
    const score = (pl: Placement): number => {
      if (pl.kind === 'campaign') return campaignScore(c, pl, good);
      if (pl.kind === 'mapTile' || pl.kind === 'freeway') return nextFloat(c.rng);
      const cells = placementCells(pl);
      return cells.length ? -distToMine(s, me, cells) : 0;
    };
    out.push(...bestPlacements(c, [la], score, { good }));
  }
  out.push(...readyOf(c.legal, 'choice.decline'));
  return out;
}

// ---------------------------------------------------------------------------
// Working 9–5
// ---------------------------------------------------------------------------

function cardOf(l: LegalAction): string | null {
  if (l.kind === 'ready') {
    const a = l.action as { type: string; cardUid?: string; trainerUid?: string };
    if (a.type === 'work.endTurn') return null;
    return a.cardUid ?? a.trainerUid ?? null;
  }
  if (l.kind === 'placement') return l.cardUid ?? l.spec.cardUid ?? null;
  return null;
}

function decideWork(c: Ctx): Action[] {
  const { s, me } = c;
  const p = s.players[me];
  if (!p) return [];
  const stages = stagesFor(s, me);
  const byCard = new Map<string, LegalAction[]>();
  for (const l of c.legal) {
    const uid = cardOf(l);
    if (!uid) continue;
    byCard.set(uid, [...(byCard.get(uid) ?? []), l]);
  }
  const stageOf = (uid: string) => {
    const st = abilityStage(cardDef(s, me, uid));
    return st ? stageIndex(stages, st) : 99;
  };
  const cards = [...byCard.keys()].sort((a, b) => stageOf(a) - stageOf(b));
  const end: Action = { type: 'work.endTurn', playerId: me };
  const uid = cards[0];
  if (!uid) return [end];
  const entries = byCard.get(uid) ?? [];
  const skip: Action = { type: 'work.skip', playerId: me, cardUid: uid };
  const acts = entries.filter((l) => !(l.kind === 'ready' && l.action.type === 'work.skip'));
  return [...cardActions(c, uid, acts), skip, end];
}

function cardActions(c: Ctx, uid: Uid, entries: LegalAction[]): Action[] {
  const { s, me } = c;
  const def = cardDef(s, me, uid);
  const kind = def?.ability.kind;
  const ready = entries.flatMap((l) => (l.kind === 'ready' ? [l.action] : []));
  const places = placementsOf(entries);
  const good = favouriteGood(s, me, (g) => contentOf(s).foods[g]?.marketable ?? false);

  // Hiring (CEO, recruiting girl / manager, HR director).
  const hires = ready.filter((a): a is Extract<Action, { type: 'work.recruit' }> => a.type === 'work.recruit');
  if (hires.length) {
    const scored = hires.map((a) => ({ a, v: hireScore(c, a.employeeId) })).sort((x, y) => y.v - x.v);
    const threshold = kind === 'ceo' ? 0 : 4;
    return scored.filter((x) => x.v >= threshold).map((x) => x.a);
  }

  // Training.
  const trains = ready.filter((a): a is Extract<Action, { type: 'work.train' }> => a.type === 'work.train');
  if (trains.length) {
    return trains
      .map((a) => ({ a, v: trainScore(c, a.targetUid, a.toEmployeeId) }))
      .filter((x) => x.v >= 3)
      .sort((x, y) => y.v - x.v)
      .map((x) => x.a);
  }

  // Cooking: the food wanted most near our restaurants (or what we advertise).
  const produce = ready.filter((a): a is Extract<Action, { type: 'work.produce' }> => a.type === 'work.produce');
  if (produce.length) {
    const want = demandNear(s, me);
    return [...produce].sort((a, b) => (want[b.food ?? 'burger'] ?? 0) + (b.food === good ? 0.5 : 0) - ((want[a.food ?? 'burger'] ?? 0) + (a.food === good ? 0.5 : 0)));
  }

  // Errand boys: the most wanted drink.
  const errands = ready.filter((a): a is Extract<Action, { type: 'work.buyDrinks' }> => a.type === 'work.buyDrinks');
  if (errands.length) {
    const want = demandNear(s, me);
    const drinkOf = (a: Extract<Action, { type: 'work.buyDrinks' }>) => (a.route.mode === 'errand' ? a.route.drink : 'beer');
    return [...errands].sort((a, b) => (want[drinkOf(b)] ?? 0) + (drinkOf(b) === good ? 0.5 : 0) - ((want[drinkOf(a)] ?? 0) + (drinkOf(a) === good ? 0.5 : 0)) || nextFloat(c.rng) - 0.5);
  }

  if (!places.length) return ready; // module card actions the Easy bot does not know: take any offered.

  switch (places[0]?.actionType) {
    case 'work.buyDrinks': {
      const want = demandNear(s, me);
      return bestPlacements(c, places, (pl) => (pl.kind === 'buyerRoute' ? pl.collects.reduce((a, x) => a + x.count * (1 + 0.5 * (want[s.board.drinkSources[x.sourceId]?.drink as FoodId] ?? 0)), 0) : 0), {}, 0.5);
    }
    case 'work.placeCampaign':
      return bestPlacements(c, places, (pl) => (pl.kind === 'campaign' ? campaignScore(c, pl, good) : 0), { good }, 0.05, CAMPAIGN_SAMPLE);
    case 'work.placeHouse':
    case 'work.placeGarden': {
      // A house next to our restaurant beats a garden; both only when we have a restaurant.
      const houses = places.filter((l) => l.actionType === 'work.placeHouse');
      const gardens = places.filter((l) => l.actionType === 'work.placeGarden');
      const near = (pl: Placement) => -distToMine(s, me, placementCells(pl));
      const gardenScore = (pl: Placement) => {
        if (pl.kind !== 'garden') return -99;
        const h = s.board.houses[pl.houseId];
        return -distToMine(s, me, h?.cells ?? pl.cells) + (h?.demand.length ?? 0);
      };
      return [...bestPlacements(c, houses, near), ...bestPlacements(c, gardens, gardenScore)];
    }
    case 'work.placeRestaurant':
    case 'work.moveRestaurant': {
      const opens = places.filter((l) => l.actionType === 'work.placeRestaurant');
      const p = s.players[me];
      if (!opens.length || !p || p.restaurantsRemaining <= 0) return [];
      return bestPlacements(c, opens, (pl) => (pl.kind === 'restaurant' ? restaurantSpotScore(s, me, pl.x, pl.y, pl.entrance) : -99), {}, 1).slice(0, 3);
    }
    default:
      // Ketchup lobbyists (roads / parks) and other module placements: any legal spot near us.
      return bestPlacements(c, places, (pl) => {
        const cells = placementCells(pl);
        return (cells.length ? -distToMine(s, me, cells) / 4 : 0) + nextFloat(c.rng) * 2;
      });
  }
}

/** Desirability of hiring `employeeId` now (≥ 4 is worth a recruit action; the CEO hires anything ≥ 0). */
function hireScore(c: Ctx, employeeId: string): number {
  const { s, me } = c;
  const def = contentOf(s).employees[employeeId as keyof ReturnType<typeof contentOf>['employees']];
  if (!def) return -1;
  if ((s.supply[def.id] ?? 0) <= 0) return -1; // hiring from an empty pile forces a training: avoid
  const owned = ownedKinds(s, me);
  const n = (k: keyof typeof owned) => owned[k] ?? 0;
  let v: number;
  switch (def.ability.kind) {
    case 'produce':
      v = n('produce') < 2 ? 10 : n('produce') < 3 ? 5 : 1;
      break;
    case 'marketing':
      v = !tilesLeft(s, def.ability.campaigns) ? 0 : n('marketing') < 2 ? 9 : 3;
      break;
    case 'manager':
      v = n('manager') < 1 ? 8 : n('manager') < 2 ? 4 : 1;
      break;
    case 'train':
      v = n('train') < 1 ? 7 : 2;
      break;
    case 'buyDrinks':
      v = n('buyDrinks') < 1 ? 6 : n('buyDrinks') < 2 ? 3 : 1;
      break;
    case 'recruit':
      v = s.round <= 3 && n('recruit') < 2 ? 5 : 1;
      break;
    case 'waitress':
      v = n('waitress') < 2 ? 3 : 1;
      break;
    case 'price':
      v = def.ability.delta < 0 && n('price') < 1 ? 3 : 0;
      break;
    case 'restaurant':
    case 'newBusiness':
    case 'cfo':
      v = 3;
      break;
    default:
      v = 1;
  }
  if (def.salary && !affordable(c, 1)) v -= 100;
  return v + nextFloat(c.rng);
}

/** Desirability of training `targetUid` into `to` (≥ 3 is worth the action). */
function trainScore(c: Ctx, targetUid: Uid, to: string): number {
  const { s, me } = c;
  const content = contentOf(s);
  const from = cardDef(s, me, targetUid);
  const def = content.employees[to as keyof typeof content.employees];
  if (!def || !from) return -1;
  let v: number;
  const a = def.ability;
  switch (a.kind) {
    case 'produce':
      v = a.amount > 1 ? 9 : 4;
      break;
    case 'manager':
      v = 6;
      break;
    case 'marketing':
      v = tilesLeft(s, a.campaigns) ? 6 : 1;
      break;
    case 'buyDrinks':
      v = a.mode === 'errand' ? 2 : 5;
      break;
    case 'restaurant':
      v = (s.players[me]?.restaurantsRemaining ?? 0) > 0 ? 5 : 1;
      break;
    case 'cfo':
      v = 4;
      break;
    case 'recruit':
    case 'train':
    case 'newBusiness':
      v = 3;
      break;
    case 'price':
      v = a.delta < 0 ? 2 : 1;
      break;
    default:
      v = 2;
  }
  if (def.salary && !from.salary && !affordable(c, 1)) v -= 100;
  return v + nextFloat(c.rng) * 0.5;
}

/** Are there marketing tiles left for any of these campaign kinds? */
function tilesLeft(s: GameState, kinds: readonly string[]): boolean {
  const tiles = contentOf(s).marketingTiles;
  return s.marketingTiles.some((n) => kinds.includes(tiles[n]?.kind ?? ''));
}

/** Can we carry `extra` more salaried cards at the next Payday (cash + a cautious income guess)? */
function affordable(c: Ctx, extra: number): boolean {
  const { owed, cash } = salaryOutlook(c.s, c.me);
  return owed + extra * 5 <= cash + incomeEstimate(c.s, c.me) * 0.6 - 5;
}

/** Value of a campaign: demand it would add, weighted towards houses near our restaurants. */
function campaignScore(c: Ctx, pl: Extract<Placement, { kind: 'campaign' }>, good: FoodId): number {
  const { s, me } = c;
  let preview;
  try {
    preview = c.engine.campaignReach(s, { kind: pl.campaignKind, placement: pl.placement, owner: me, goods: [good], tileNumber: pl.tileNumber });
  } catch {
    return 0;
  }
  let v = 0;
  for (const h of preview.houses) {
    const house = s.board.houses[h.houseId];
    const d = house && house.cells.length ? distToMine(s, me, house.cells) : 10;
    v += h.adds * (1 / (1 + d / 4));
  }
  return v;
}

/**
 * Score a random sample of each placement action's legal placements; return actions for the best
 * few, best first. `minScore` drops placements not worth an action.
 */
function bestPlacements(c: Ctx, entries: PlacementLegal[], score: (pl: Placement) => number, choices: { good?: FoodId } = {}, minScore = -Infinity, sampleSize = SAMPLE): Action[] {
  const scored: { a: Action; v: number }[] = [];
  for (const la of entries) {
    let opts: Placement[];
    try {
      opts = c.engine.legalPlacements(c.s, c.me, la.spec);
    } catch {
      continue;
    }
    const sample = opts.length > sampleSize ? shuffle(c.rng, [...opts]).slice(0, sampleSize) : opts;
    for (const pl of sample) {
      const v = score(pl);
      if (v < minScore) continue;
      const a = actionFromPlacement(c.s, c.me, la, pl, choices);
      if (a) scored.push({ a, v: v + nextFloat(c.rng) * 0.01 });
    }
  }
  return scored.sort((x, y) => y.v - x.v).slice(0, 6).map((x) => x.a);
}

/** Freeze the most plentiful freezable goods, up to capacity (kimchi-style exclusive goods never). */
function freezerKeep(s: GameState, me: PlayerId): Partial<Record<FoodId, number>> {
  const cap = freezerCapacity(s, me);
  if (cap <= 0) return {};
  const foods = contentOf(s).foods;
  const stock = Object.entries(stockOf(s, me)) as [FoodId, number][];
  const keep: Partial<Record<FoodId, number>> = {};
  let left = cap;
  for (const [g, n] of stock.filter(([g]) => (foods[g]?.freezer ?? 'yes') === 'yes').sort((a, b) => b[1] - a[1])) {
    if (left <= 0) break;
    const k = Math.min(n, left);
    keep[g] = k;
    left -= k;
  }
  return keep;
}

