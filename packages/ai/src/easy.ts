/**
 * Easy bot: sensible but beatable. One light heuristic per decision, no lookahead, one fixed plan
 * (easyPlan.ts: a build list for its main food matched against the cards it owns):
 * - setup: first restaurant where houses cluster, away from rivals; random reserve card.
 * - restructuring: seats only cards with something to do (marketeers with tiles left, cooks,
 *   buyers, a trainer when a card waits for training...), leaves the cards it trains on the beach.
 * - order of business: earliest free position.
 * - working, card by card in sub-step order: hire the next card of the plan only when it gets a
 *   seat next round or a trainer; train towards the plan while salaries stay affordable; cook what
 *   can be sold; fetch the most wanted drinks; campaign on houses it is connected to and can serve;
 *   build houses next to its restaurants; open restaurants where houses cluster.
 * - payday: fire salaried cards the plan has no use for, and whatever cash cannot carry.
 * - clean up: freeze the most plentiful goods.
 * - Ketchup choices: place what must be placed, near its restaurants when it matters; accept
 *   optional bonuses (second campaign, freeway); decline anything else.
 * A little noise (the decision's rng) keeps games from repeating.
 */
import type { Action, EmployeeDef, FoodId, GameState, LegalAction, Placement, PlayerId, StructureSubmission, Uid } from '@fcm/engine';
import {
  abilityStage,
  cardsAtWork,
  cardsInHand,
  ceoSlotsFor,
  defOf,
  freezerCapacity,
  isManager,
  isOverfilled,
  managerSlots,
  nextFloat,
  randomInt,
  salariedCards,
  salaryBreakdown,
  shuffle,
  stageIndex,
  stagesFor,
  stockOf,
  submissionProblem,
  voluntarilyFireable,
} from '@fcm/engine';
import type { Bot, BotInput } from './types.js';
import { makeCtx, type Ctx } from './shared/ctx.js';
import { houseViews, sellerOf, type HouseView } from './shared/market.js';
import { actionFromPlacement, cardDef, contentOf, demandNear, distToMine, fallbackAction, firingPlan, forcedFirePlan, placementCells, restaurantSpotScore, simpleStructure } from './heuristics.js';
import { easyCapacity, easyGood, easyPlan, MAX_MARKETEERS, seatCapacity, seatPriority, worthSeat } from './easyPlan.js';

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

/** Placements scored per placement action (Easy samples instead of scanning the whole board). */
const SAMPLE = 48;
/** Campaign spots are where the game is won: look at more of them. */
const CAMPAIGN_SAMPLE = 240;
/** Easy is sloppy about where its campaigns go (a strong player picks the best spot). */
const CAMPAIGN_NOISE = 2;

export function createEasyBot(): Bot {
  return { level: 'easy', choose: easyChoose };
}

export function easyChoose(input: BotInput): Action {
  const ctx = makeCtx(input);
  const s = ctx.s;
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
      return [
        { type: 'restructure.submit', playerId: me, structure: easyStructure(c) },
        { type: 'restructure.submit', playerId: me, structure: simpleStructure(s, me) },
      ];
    case 'orderOfBusiness': {
      const opts = readyOf(c.legal, 'order.choosePosition') as Extract<Action, { type: 'order.choosePosition' }>[];
      return [...opts].sort((a, b) => a.position - b.position);
    }
    case 'working':
      return decideWork(c);
    case 'payday': {
      const fire = easyFiring(c);
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
  const good = easyGood(c, me, easyPlan(c));
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
  return [...cardActions(c, acts), skip, end];
}

function cardActions(c: Ctx, entries: LegalAction[]): Action[] {
  const { s, me } = c;
  const ready = entries.flatMap((l) => (l.kind === 'ready' ? [l.action] : []));
  const places = placementsOf(entries);
  const plan = easyPlan(c);
  const good = easyGood(c, me, plan);

  // Hiring (CEO, recruiting girl / manager, HR director): the plan's next card, if it gets work.
  const hires = ready.filter((a): a is Extract<Action, { type: 'work.recruit' }> => a.type === 'work.recruit');
  if (hires.length) return planHires(c, hires);

  // Training: the plan's next step for each card waiting on the beach.
  const trains = ready.filter((a): a is Extract<Action, { type: 'work.train' }> => a.type === 'work.train');
  if (trains.length) {
    const out: Action[] = [];
    for (const t of plan.trains) {
      const a = trains.find((x) => x.targetUid === t.uid && x.toEmployeeId === t.path[0]);
      if (a) out.push(a);
    }
    // A card hired from an empty pile must be trained: any training of it will do.
    for (const a of trains) if (c.s.turn?.mustTrain.includes(a.targetUid)) out.push(a);
    return out;
  }

  // Cooking: the food wanted most near our restaurants (or what we advertise).
  const produce = ready.filter((a): a is Extract<Action, { type: 'work.produce' }> => a.type === 'work.produce');
  if (produce.length) {
    const want = demandNear(s, me);
    const pref = (f: FoodId) => (want[f] ?? 0) + (f === plan.food ? 1.5 : 0) + (f === good ? 0.5 : 0);
    return [...produce].sort((a, b) => pref(b.food ?? 'burger') - pref(a.food ?? 'burger'));
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
      return bestPlacements(c, places, (pl) => (pl.kind === 'campaign' ? campaignScore(c, pl, good) : 0), { good }, 0.1, CAMPAIGN_SAMPLE, CAMPAIGN_NOISE);
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

/** Hires for this recruit card, best first: plan cards that get a seat next round or a trainer. */
function planHires(c: Ctx, legal: Extract<Action, { type: 'work.recruit' }>[]): Action[] {
  const { s, me } = c;
  const p = s.players[me];
  if (!p) return [];
  const plan = easyPlan(c);
  let trainRoom = plan.trainActions - plan.trains.length;
  // Cards that will want a seat next round (owned, not busy, useful, not waiting for training).
  const waiting = new Set(plan.trains.map((t) => t.uid));
  let seats = seatCapacity(c, me);
  let wanting = 0;
  for (const uid of Object.keys(p.employees)) {
    if (uid === p.structure.ceo || p.busy[uid] || waiting.has(uid) || plan.extras.has(uid)) continue;
    const def = defOf(c.content, p, uid);
    if (!isManager(def)) wanting++;
  }
  const out: Action[] = [];
  for (const h of plan.hires) {
    const a = legal.find((x) => x.employeeId === h.id);
    if (!a) continue;
    const def = c.content.employees[h.id];
    if (h.needsTraining) {
      if (trainRoom <= 0) continue;
      trainRoom--;
    } else if (isManager(def)) {
      seats += Math.max(0, managerSlots(def) - 1);
    } else if (def?.ability.kind === 'train' || wanting < seats) {
      wanting++;
    } else continue;
    out.push(a);
  }
  return out;
}

/** Easy's org chart: managers that seat the most useful cards; cards it trains stay on the beach. */
function easyStructure(c: Ctx): StructureSubmission {
  const { s, me } = c;
  const p = s.players[me];
  if (!p) return { ceoSubs: [], managerSubs: {} };
  const plan = easyPlan(c);
  const def = (u: Uid) => defOf(c.content, p, u);
  const hand = cardsInHand(p);
  const inHand = new Set(hand);
  const trainCap = hand.reduce((a, u) => {
    const ab = def(u)?.ability;
    return a + (ab?.kind === 'train' ? ab.actions : 0);
  }, 0);
  const reserved = new Set(
    plan.trains
      .filter((t) => inHand.has(t.uid))
      .slice(0, trainCap)
      .map((t) => t.uid),
  );
  const managers = hand.filter((u) => isManager(def(u)) && managerSlots(def(u)) > 0 && !reserved.has(u)).sort((a, b) => managerSlots(def(b)) - managerSlots(def(a)));
  let marketeers = 0;
  const workers = hand
    .filter((u) => !isManager(def(u)) && !reserved.has(u) && worthSeat(c, me, def(u), plan, reserved.size))
    .sort((a, b) => seatPriority(c, me, def(b)) - seatPriority(c, me, def(a)) || nextFloat(c.rng) - 0.5)
    .filter((u) => def(u)?.ability.kind !== 'marketing' || ++marketeers <= MAX_MARKETEERS);
  const slots = ceoSlotsFor(s, c.content, me);
  let bestK = 0;
  let bestAtWork = -1;
  for (let k = 0; k <= Math.min(slots, managers.length); k++) {
    const cap = slots - k + managers.slice(0, k).reduce((a, m) => a + managerSlots(def(m)), 0);
    const atWork = Math.min(workers.length, cap);
    if (atWork > bestAtWork) {
      bestAtWork = atWork;
      bestK = k;
    }
  }
  const seated = managers.slice(0, bestK);
  const queue = [...workers];
  const ceoSubs: Uid[] = [...seated];
  const managerSubs: Record<Uid, Uid[]> = {};
  for (const m of seated) managerSubs[m] = queue.splice(0, managerSlots(def(m)));
  while (ceoSubs.length < slots && queue.length) ceoSubs.push(queue.shift() as Uid);
  const sub = { ceoSubs, managerSubs };
  return submissionProblem(s, me, sub) || isOverfilled(s, me, sub) ? simpleStructure(s, me) : sub;
}

/** Payday: salaried cards the plan has no use for, then whatever cash cannot carry. */
function easyFiring(c: Ctx): Uid[] {
  const { s, me } = c;
  const p = s.players[me];
  if (!p) return [];
  const plan = easyPlan(c);
  const salaried = new Set(salariedCards(s, c.content, me));
  const fireable = voluntarilyFireable(p);
  const idle = fireable.filter((u) => salaried.has(u) && plan.extras.has(u));
  // Losing money and food left over: a salaried cook whose output did not sell goes (one a round).
  if (salaryBreakdown(s, c.content, me).total > p.earningsThisRound) {
    const work = new Set(cardsAtWork(p));
    const cooks = fireable
      .filter((u) => salaried.has(u) && work.has(u) && defOf(c.content, p, u)?.ability.kind === 'produce')
      .map((u) => ({ u, a: defOf(c.content, p, u)!.ability as Extract<EmployeeDef['ability'], { kind: 'produce' }> }))
      .sort((x, y) => x.a.amount - y.a.amount);
    const unsold = (g: FoodId) => p.inventory[g] ?? 0;
    const wasted = cooks.find((x) => x.a.timing === 'working' && x.a.foods.every((g) => unsold(g) >= x.a.amount));
    if (wasted) idle.push(wasted.u);
  }
  return [...new Set([...idle, ...firingPlan(s, me)])];
}

/** Could my cards serve the house's whole order after the campaign adds `adds` of `good`? */
function servable(hv: HouseView, adds: number, uncapped: boolean, eternal: boolean, good: FoodId, cap: Partial<Record<FoodId, number>>): boolean {
  const want: Partial<Record<FoodId, number>> = { ...hv.demand };
  want[good] = (want[good] ?? 0) + adds;
  // No cap on the house (apartments, rural area): demand piles up while the campaigns already
  // reaching it run, for ever once mine is eternal. Only a fresh house I can keep selling to.
  if (uncapped) {
    if (eternal && (hv.nDemand > 0 || hv.campaigns.length > 0)) return false;
    want[good] = (want[good] ?? 0) + hv.campaigns.length * adds + (eternal ? 1 : 0);
  }
  return (Object.entries(want) as [FoodId, number][]).every(([g, n]) => (cap[g] ?? 0) >= n);
}

/** Will a campaign of this kind I place now be eternal (first_billboard-style milestone)? */
function launchesEternal(c: Ctx, kind: string): boolean {
  const p = c.s.players[c.me];
  if (!p) return false;
  return Object.keys(p.milestones).some((id) =>
    (c.content.milestones[id as keyof typeof c.content.milestones]?.effects ?? []).some((e) => e.kind === 'eternalCampaigns' && (!e.campaignKinds || e.campaignKinds.some((k) => k === kind))),
  );
}

/** Houses by id (with their connected sellers). */
function houseMap(c: Ctx): Map<string, HouseView> {
  const m = c.memo.get('easyHouses') as Map<string, HouseView> | undefined;
  if (m) return m;
  const out = new Map(houseViews(c).map((h) => [h.id, h]));
  c.memo.set('easyHouses', out);
  return out;
}

/**
 * Value of a campaign: demand it adds on houses I am connected to and could serve in full (my
 * cards' capacity covers the house's whole order), weighted towards nearby houses.
 */
function campaignScore(c: Ctx, pl: Extract<Placement, { kind: 'campaign' }>, good: FoodId): number {
  const { s, me } = c;
  let preview;
  try {
    preview = c.engine.campaignReach(s, { kind: pl.campaignKind, placement: pl.placement, owner: me, goods: [good], tileNumber: pl.tileNumber });
  } catch {
    return 0;
  }
  const cap = easyCapacity(c, me, easyPlan(c));
  const houses = houseMap(c);
  const eternal = launchesEternal(c, pl.campaignKind);
  let v = 0;
  for (const h of preview.houses) {
    if (!h.adds) continue;
    const hv = houses.get(h.houseId);
    if (!hv) continue;
    const seller = sellerOf(hv, me);
    const uncapped = h.capacity === null;
    if (seller && servable(hv, h.adds, uncapped, eternal, good, cap)) v += h.adds / (1 + seller.distance / 4);
    // Demand I will not sell only blocks the house (for ever on an apartment under an eternal campaign).
    else v -= h.adds * (uncapped ? (eternal ? 3 : 1) : 0.2);
  }
  return v;
}

/**
 * Score a random sample of each placement action's legal placements; return actions for the best
 * few, best first. `minScore` drops placements not worth an action.
 */
function bestPlacements(c: Ctx, entries: PlacementLegal[], score: (pl: Placement) => number, choices: { good?: FoodId } = {}, minScore = -Infinity, sampleSize = SAMPLE, noise = 0.01): Action[] {
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
      if (a) scored.push({ a, v: v + nextFloat(c.rng) * noise });
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

