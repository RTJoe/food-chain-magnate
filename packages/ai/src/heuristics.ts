/**
 * Shared building blocks for bots: content lookups, board distances and demand, a valid org chart,
 * turning engine placements into actions, and a never-stall fallback. Pure functions over a
 * `GameState` rebuilt from a view (see viewState.ts).
 */
import type {
  Action,
  Corner,
  EmployeeDef,
  EngineApi,
  FoodId,
  GameState,
  LegalAction,
  Placement,
  PlayerId,
  PlayerState,
  RngState,
  StructureSubmission,
  Uid,
} from '@fcm/engine';
import {
  cardsAtWork,
  cardsInHand,
  ceoSlotsFor,
  contentFor,
  defOf,
  isManager,
  isOverfilled,
  managerSlots,
  randomInt,
  salariedCards,
  salaryBreakdown,
  submissionProblem,
  voluntarilyFireable,
} from '@fcm/engine';

export type Content = ReturnType<typeof contentFor>;
type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

export const contentOf = (s: GameState): Content => contentFor(s.config.modules);

export function cardDef(s: GameState, player: PlayerId, uid: Uid): EmployeeDef | undefined {
  const p = s.players[player];
  return p ? defOf(contentOf(s), p, uid) : undefined;
}

/** Number of owned cards per ability kind (at work, beach, busy and hand). */
export function ownedKinds(s: GameState, player: PlayerId): Partial<Record<EmployeeDef['ability']['kind'], number>> {
  const p = s.players[player];
  const out: Partial<Record<EmployeeDef['ability']['kind'], number>> = {};
  if (!p) return out;
  const content = contentOf(s);
  for (const c of Object.values(p.employees)) {
    const k = content.employees[c.employeeId]?.ability.kind;
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Board geometry
// ---------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

export function entranceCell(x: number, y: number, corner: Corner): Pt {
  return { x: corner.endsWith('E') ? x + 1 : x, y: corner.startsWith('S') ? y + 1 : y };
}

const manhattan = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Minimum Manhattan distance between two cell lists (Infinity if either is empty). */
export function cellsDistance(a: readonly Pt[], b: readonly Pt[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, manhattan(p, q));
  return best;
}

/** Entrance cells of the player's restaurants on the board (open or coming soon). */
export function myEntrances(s: GameState, player: PlayerId): Pt[] {
  return Object.values(s.board.restaurants)
    .filter((r) => r.owner === player && r.status !== 'derelict')
    .map((r) => entranceCell(r.x, r.y, r.entrance));
}

export function otherEntrances(s: GameState, player: PlayerId): Pt[] {
  return Object.values(s.board.restaurants)
    .filter((r) => r.owner !== player && r.status !== 'derelict')
    .map((r) => entranceCell(r.x, r.y, r.entrance));
}

/** Distance from cells to the player's nearest restaurant entrance (large when none). */
export function distToMine(s: GameState, player: PlayerId, cells: readonly Pt[]): number {
  const d = cellsDistance(cells, myEntrances(s, player));
  return Number.isFinite(d) ? d : 30;
}

/** Demand tokens per good on houses within `radius` of the player's restaurants (all houses if none). */
export function demandNear(s: GameState, player: PlayerId, radius = 8): Partial<Record<FoodId, number>> {
  const mine = myEntrances(s, player);
  const out: Partial<Record<FoodId, number>> = {};
  for (const h of Object.values(s.board.houses)) {
    if (mine.length && h.cells.length && cellsDistance(h.cells, mine) > radius) continue;
    for (const t of h.demand) out[t.good] = (out[t.good] ?? 0) + 1;
  }
  return out;
}

/** Houses (count, demand tokens) whose cells lie within `radius` of `at`. */
export function housesAround(s: GameState, at: Pt, radius: number): { houses: number; demand: number } {
  let houses = 0;
  let demand = 0;
  for (const h of Object.values(s.board.houses)) {
    if (!h.cells.length || cellsDistance(h.cells, [at]) > radius) continue;
    houses++;
    demand += h.demand.length;
  }
  return { houses, demand };
}

/** Score a restaurant spot: houses and demand nearby, away from rivals. */
export function restaurantSpotScore(s: GameState, player: PlayerId, x: number, y: number, entrance: Corner): number {
  const e = entranceCell(x, y, entrance);
  const near = housesAround(s, e, 6);
  const rival = cellsDistance([e], otherEntrances(s, player));
  const own = cellsDistance([e], myEntrances(s, player));
  return near.houses * 2 + near.demand + (rival < 5 ? -3 : 0) + (own < 6 ? -4 : 0);
}

// ---------------------------------------------------------------------------
// Supply side: what the player can sell
// ---------------------------------------------------------------------------

/** Rough units per good the player's cards can bring in a turn (at work if any, else owned). */
export function supplyCapacity(s: GameState, player: PlayerId, atWorkOnly = false): Partial<Record<FoodId, number>> {
  const p = s.players[player];
  const out: Partial<Record<FoodId, number>> = {};
  if (!p) return out;
  const content = contentOf(s);
  const uids = atWorkOnly ? cardsAtWork(p) : Object.keys(p.employees);
  for (const uid of uids) {
    const a = defOf(content, p, uid)?.ability;
    if (!a) continue;
    if (a.kind === 'produce') for (const f of a.foods) out[f] = (out[f] ?? 0) + a.amount / a.foods.length;
    if (a.kind === 'buyDrinks') {
      const n = a.mode === 'errand' ? 1 : a.perSource * 2;
      for (const d of ['beer', 'lemonade', 'soft_drink'] as FoodId[]) out[d] = (out[d] ?? 0) + n / 3;
    }
  }
  return out;
}

/** The good the player should advertise: what it can supply and what is wanted nearby. */
export function favouriteGood(s: GameState, player: PlayerId, marketable: (g: FoodId) => boolean = () => true): FoodId {
  const cap = supplyCapacity(s, player);
  const p = s.players[player];
  const stock: Partial<Record<FoodId, number>> = {};
  for (const src of [p?.inventory ?? {}, p?.freezer ?? {}]) for (const [g, n] of Object.entries(src) as [FoodId, number][]) stock[g] = (stock[g] ?? 0) + n;
  let best: FoodId = 'burger';
  let bestScore = -1;
  for (const g of new Set([...Object.keys(cap), ...Object.keys(stock), 'burger'] as FoodId[])) {
    if (!marketable(g)) continue;
    const score = (cap[g] ?? 0) * 2 + (stock[g] ?? 0) + (g === 'burger' ? 0.1 : 0);
    if (score > bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return best;
}

/** Salary owed at the next Payday and the player's cash. */
export function salaryOutlook(s: GameState, player: PlayerId): { owed: number; cash: number; salaried: number } {
  const p = s.players[player];
  const content = contentOf(s);
  return { owed: salaryBreakdown(s, content, player).total, cash: p?.cash ?? 0, salaried: salariedCards(s, content, player).length };
}

/** Very rough income estimate for this round: sellable units near our restaurants at $10. */
export function incomeEstimate(s: GameState, player: PlayerId): number {
  const demand = Object.values(demandNear(s, player)).reduce<number>((a, n) => a + (n ?? 0), 0);
  const cap = Object.values(supplyCapacity(s, player, true)).reduce<number>((a, n) => a + (n ?? 0), 0);
  return Math.min(demand, cap) * (s.basePrice || 10);
}

// ---------------------------------------------------------------------------
// Restructuring
// ---------------------------------------------------------------------------

/** How much a card is worth having at work (higher = sooner into a slot). */
export function workPriority(s: GameState, def: EmployeeDef | undefined): number {
  if (!def) return 0;
  const early = s.round <= 2;
  switch (def.ability.kind) {
    case 'produce':
      return 9 + def.ability.amount / 10;
    case 'marketing':
      return 8;
    case 'buyDrinks':
      return 7;
    case 'train':
      return early ? 7.5 : 6;
    case 'recruit':
      return early ? 8.5 : 4;
    case 'fryChef':
      return 5;
    case 'newBusiness':
    case 'restaurant':
      return 4.5;
    case 'cfo':
    case 'waitress':
    case 'massMarketing':
      return 4;
    case 'price':
      return def.ability.delta < 0 ? 3.5 : 2;
    case 'movieStar':
    case 'lobbyist':
      return 3;
    case 'nightShift':
      return 2;
    default:
      return 1;
  }
}

/**
 * A legal, never-overfilled org chart: choose how many managers to seat so the most cards work,
 * then fill slots by `workPriority`. Ketchup night-shift managers only take CEO slots.
 */
export function simpleStructure(s: GameState, player: PlayerId): StructureSubmission {
  const p = s.players[player];
  if (!p) return { ceoSubs: [], managerSubs: {} };
  const content = contentOf(s);
  const def = (u: Uid) => defOf(content, p, u);
  const hand = cardsInHand(p);
  const managers = hand.filter((u) => isManager(def(u))).sort((a, b) => managerSlots(def(b)) - managerSlots(def(a)));
  const ceoOnly = hand.filter((u) => def(u)?.ability.kind === 'nightShift');
  const others = hand.filter((u) => !isManager(def(u)) && def(u)?.ability.kind !== 'nightShift').sort((a, b) => workPriority(s, def(b)) - workPriority(s, def(a)));
  const slots = ceoSlotsFor(s, content, player);
  let bestK = 0;
  let bestAtWork = -1;
  for (let k = 0; k <= Math.min(slots, managers.length); k++) {
    const cap = slots - k + managers.slice(0, k).reduce((a, m) => a + managerSlots(def(m)), 0);
    const atWork = k + Math.min(others.length, cap);
    if (atWork > bestAtWork) {
      bestAtWork = atWork;
      bestK = k;
    }
  }
  const seated = managers.slice(0, bestK);
  const queue = [...others];
  const ceoSubs: Uid[] = [...seated];
  const managerSubs: Record<Uid, Uid[]> = {};
  while (ceoSubs.length < slots && queue.length) ceoSubs.push(queue.shift() as Uid);
  for (const m of seated) managerSubs[m] = queue.splice(0, managerSlots(def(m)));
  while (ceoSubs.length < slots && ceoOnly.length) ceoSubs.push(ceoOnly.shift() as Uid);
  const sub = { ceoSubs, managerSubs };
  return submissionProblem(s, player, sub) || isOverfilled(s, player, sub) ? { ceoSubs: [], managerSubs: {} } : sub;
}

// ---------------------------------------------------------------------------
// Payday / Clean up
// ---------------------------------------------------------------------------

/** Salaried cards to fire so salaries fit in cash (beach first, then the least useful at work). */
export function firingPlan(s: GameState, player: PlayerId, keepCash = 0): Uid[] {
  const p = s.players[player] as PlayerState | undefined;
  if (!p) return [];
  const content = contentOf(s);
  const salaried = new Set(salariedCards(s, content, player));
  const { owed, cash } = salaryOutlook(s, player);
  if (owed <= cash - keepCash) return [];
  const beach = new Set(p.beach);
  const pool = voluntarilyFireable(p)
    .filter((u) => salaried.has(u))
    .sort((a, b) => Number(beach.has(b)) - Number(beach.has(a)) || workPriority(s, defOf(content, p, a)) - workPriority(s, defOf(content, p, b)));
  const out: Uid[] = [];
  let left = owed;
  for (const u of pool) {
    if (left <= cash - keepCash) break;
    out.push(u);
    left -= 5;
  }
  return out;
}

/** Forced firing (pending `forcedFire`): non-busy salaried cards first, stop once payable. */
export function forcedFirePlan(s: GameState, player: PlayerId): Uid[] {
  const p = s.players[player];
  if (!p) return [];
  const content = contentOf(s);
  const bd = salaryBreakdown(s, content, player);
  const off = bd.discounts.reduce((a, d) => a + d.amount, 0);
  const sal = salariedCards(s, content, player).sort((a, b) => Number(Boolean(p.busy[a])) - Number(Boolean(p.busy[b])) || workPriority(s, defOf(content, p, a)) - workPriority(s, defOf(content, p, b)));
  const out: Uid[] = [];
  let remaining = sal.length;
  for (const u of sal) {
    if (Math.max(0, remaining * bd.rate - off) <= p.cash) break;
    out.push(u);
    remaining--;
  }
  return out.length ? out : sal.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Placements → actions
// ---------------------------------------------------------------------------

export interface PlacementChoices {
  /** Good for campaigns / free mailbox. */
  good?: FoodId;
  /** Campaign duration (clamped to the card's maximum). */
  duration?: number;
}

/** Build the action a placement stands for (null when the kind is unknown). */
export function actionFromPlacement(s: GameState, player: PlayerId, la: PlacementLegal, pl: Placement, choices: PlacementChoices = {}): Action | null {
  const cardUid = la.cardUid ?? la.spec.cardUid ?? '';
  const choiceId = la.spec.choiceId ?? '';
  const good = choices.good ?? 'burger';
  if (pl.kind === 'campaign' && la.actionType === 'ketchup:newMilestones.placeSecondCampaign') {
    return { type: 'ketchup:newMilestones.placeSecondCampaign', playerId: player, choiceId, tileNumber: pl.tileNumber, placement: pl.placement };
  }
  switch (pl.kind) {
    case 'restaurant':
      return la.actionType === 'setup.placeRestaurant'
        ? { type: 'setup.placeRestaurant', playerId: player, x: pl.x, y: pl.y, entrance: pl.entrance }
        : { type: 'work.placeRestaurant', playerId: player, cardUid, x: pl.x, y: pl.y, entrance: pl.entrance, ...(pl.from ? { from: pl.from } : {}) };
    case 'moveRestaurant':
      return { type: 'work.moveRestaurant', playerId: player, cardUid, restaurantId: pl.restaurantId, x: pl.x, y: pl.y, entrance: pl.entrance };
    case 'house':
      return { type: 'work.placeHouse', playerId: player, cardUid, houseOrder: pl.houseOrder, x: pl.x, y: pl.y, gardenSide: pl.gardenSide };
    case 'garden':
      return { type: 'work.placeGarden', playerId: player, cardUid, houseId: pl.houseId, side: pl.side };
    case 'campaign': {
      const a = cardDef(s, player, cardUid)?.ability;
      const max = a?.kind === 'marketing' ? a.maxDuration : 1;
      const duration = Math.max(1, Math.min(max, choices.duration ?? max));
      return {
        type: 'work.placeCampaign',
        playerId: player,
        cardUid,
        campaignKind: pl.campaignKind,
        tileNumber: pl.tileNumber,
        goods: [good],
        placement: pl.placement,
        duration,
        ...(pl.from ? { from: pl.from } : {}),
      };
    }
    case 'buyerRoute':
      return { type: 'work.buyDrinks', playerId: player, cardUid, route: pl.route };
    case 'coffeeShop':
      return { type: 'ketchup:coffee.placeShop', playerId: player, choiceId, x: pl.x, y: pl.y, ...(pl.moveFrom ? { moveFrom: pl.moveFrom } : {}) };
    case 'lobbyistRoad':
      return { type: 'ketchup:lobbyists.placeRoad', playerId: player, cardUid, cells: pl.cells, arrows: pl.arrows, from: pl.from };
    case 'park':
      return { type: 'ketchup:lobbyists.placePark', playerId: player, cardUid, x: pl.x, y: pl.y, w: pl.w, h: pl.h, from: pl.from };
    case 'mapTile':
      return { type: 'ketchup:lobbyists.placeMapTile', playerId: player, choiceId, row: pl.row, col: pl.col, rotation: pl.rotation, ...(pl.templateId ? { templateId: pl.templateId } : {}) };
    case 'freeway':
      return { type: 'ketchup:ruralMarketeers.placeFreeway', playerId: player, choiceId, side: pl.side, offset: pl.offset };
    case 'pizzaRadio':
      return { type: 'ketchup:newMilestones.placePizzaRadio', playerId: player, choiceId, x: pl.x, y: pl.y };
    case 'freeMailbox':
      return { type: 'ketchup:newMilestones.placeFreeMailbox', playerId: player, choiceId, x: pl.x, y: pl.y, good };
    default:
      return null;
  }
}

/** Cells a placement covers (for distance scoring); empty when off-board. */
export function placementCells(pl: Placement): Pt[] {
  switch (pl.kind) {
    case 'restaurant':
    case 'moveRestaurant':
      return [entranceCell(pl.x, pl.y, pl.entrance)];
    case 'house':
      return [
        { x: pl.x, y: pl.y },
        { x: pl.x + 1, y: pl.y + 1 },
      ];
    case 'garden':
      return pl.cells;
    case 'campaign':
      return pl.placement.kind === 'board' ? [{ x: pl.placement.x, y: pl.placement.y }, { x: pl.placement.x + pl.placement.w - 1, y: pl.placement.y + pl.placement.h - 1 }] : [];
    case 'coffeeShop':
    case 'pizzaRadio':
    case 'freeMailbox':
    case 'park':
      return [{ x: pl.x, y: pl.y }];
    case 'lobbyistRoad':
      return pl.cells;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

const PROGRESS: readonly Action['type'][] = ['work.endTurn', 'payday.confirm', 'cleanup.freezer', 'choice.decline', 'setup.pass'];

/**
 * A legal action that moves the game on, for when a bot has nothing better (or failed): end the
 * turn / confirm / decline, else any ready action, else a minimal composed payload, else the first
 * legal placement. Every candidate is validated against `s`. Hosts call it on the real state.
 */
export function fallbackAction(s: GameState, player: PlayerId, engine: EngineApi, legal: LegalAction[] = engine.legalActions(s, player), rng?: RngState): Action {
  const ok = (a: Action | null | undefined): a is Action => Boolean(a) && engine.validateAction(s, a as Action).ok;
  const ready = legal.flatMap((l) => (l.kind === 'ready' ? [l.action] : []));
  for (const t of PROGRESS) {
    const a = ready.find((r) => r.type === t);
    if (ok(a)) return a;
  }
  for (const l of legal) {
    if (l.kind !== 'compose') continue;
    const a = composeFallback(s, player, l.actionType);
    if (ok(a)) return a;
  }
  for (const a of ready) if (ok(a)) return a;
  for (const l of legal) {
    if (l.kind !== 'placement') continue;
    const opts = engine.legalPlacements(s, player, l.spec);
    const start = rng && opts.length ? randomInt(rng, opts.length) : 0;
    for (let i = 0; i < Math.min(opts.length, 20); i++) {
      const a = actionFromPlacement(s, player, l, opts[(start + i) % opts.length] as Placement);
      if (ok(a)) return a;
    }
    if (l.cardUid) {
      const skip: Action = { type: 'work.skip', playerId: player, cardUid: l.cardUid };
      if (ok(skip)) return skip;
    }
  }
  return { type: 'work.endTurn', playerId: player };
}

function composeFallback(s: GameState, player: PlayerId, type: Extract<LegalAction, { kind: 'compose' }>['actionType']): Action | null {
  switch (type) {
    case 'restructure.submit':
      return { type, playerId: player, structure: simpleStructure(s, player) };
    case 'payday.fire': {
      const head = s.pending[0];
      if (head?.kind === 'forcedFire' && head.player === player) return { type, playerId: player, uids: forcedFirePlan(s, player) };
      return { type: 'payday.confirm', playerId: player };
    }
    case 'payday.confirm':
      return { type, playerId: player };
    case 'cleanup.freezer':
      return { type, playerId: player, keep: {} };
    default:
      return null;
  }
}
