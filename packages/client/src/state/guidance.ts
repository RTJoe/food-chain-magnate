/**
 * Prompt, legal actions and legal placements for the viewer.
 *
 * Order of preference:
 * 1. the toy engine, when the game is a toy game (its rules differ from Food Chain Magnate);
 * 2. the real engine (`derivePrompt` is view-based; `legalActions`/`legalPlacements` run on a
 *    pseudo-state rebuilt from the view);
 * 3. a view-based fallback in this file, so fixtures and partial engines still drive the UI.
 */
import { engine as realEngine } from '@fcm/engine';
import { toyEngine } from '@fcm/engine/testing';
import type {
  Action,
  CampaignOrientation,
  CampaignReachPreview,
  Cell,
  DrinkId,
  EmployeeId,
  FoodId,
  GameView,
  HouseId,
  HouseOutlook,
  LegalAction,
  ModuleManifest,
  PendingChoice,
  Placement,
  PlacementKind,
  PlacementSpec,
  PlayerId,
  Prompt,
  ReserveCard,
  Uid,
} from '@fcm/engine';
import type { InteractionMode } from './boardBridge.js';
import type { HouseBoardInfo, RangeOverlayData, ReachOverlayData } from './boardOverlays.js';
import type { Catalog } from './catalog.js';
import { employeeName } from './catalog.js';
import { isToyManifest, pseudoState } from './engine.js';
import { cardStage, cardsAtWork, fireable, freeOrderPositions, phaseLabel, workStages } from './selectors.js';

const STANDARD_RESERVES: ReserveCard[] = [
  { kind: 'standard', amount: 100, ceoSlots: 2 },
  { kind: 'standard', amount: 200, ceoSlots: 3 },
  { kind: 'standard', amount: 300, ceoSlots: 4 },
];

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function promptFor(view: GameView, me: PlayerId | null, manifest: readonly ModuleManifest[]): Prompt {
  if (isToyManifest(manifest)) return toyEngine.derivePrompt(view, me);
  const pr = attempt(() => realEngine.derivePrompt(view, me)) ?? fallbackPrompt(view, me);
  // The engine heads every pending choice "Decision needed": say which decision it is.
  return pr.kind === 'choice' ? { ...pr, title: choiceTitle(pr.choice) } : pr;
}

const nameOf = (view: GameView, id: PlayerId) => view.players[id]?.name ?? id;

export function fallbackPrompt(view: GameView, me: PlayerId | null): Prompt {
  const phase = view.phase;
  const waitingFor = view.awaiting.players;
  if (phase.kind === 'gameOver') return { kind: 'gameOver', title: 'Game over', ranking: phase.ranking };
  if (me === null) return { kind: 'spectating', title: `Spectating · ${phaseLabel(phase)}`, waitingFor };
  const head: PendingChoice | undefined = view.pending[0];
  if (head) {
    if (head.player === me) return { kind: 'choice', title: choiceTitle(head), choice: head };
    return { kind: 'waiting', title: `Waiting for ${nameOf(view, head.player)}`, waitingFor: [head.player] };
  }
  // Restructuring: a submitted player is no longer awaited but may still retract.
  if (phase.kind === 'restructuring' && (view.submitted[me] || view.mine?.structureDraft)) {
    return { kind: 'restructure', title: 'Structure submitted', ceoSlots: view.ceoSlots, submitted: true };
  }
  if (!waitingFor.includes(me)) {
    const names = waitingFor.map((id) => nameOf(view, id));
    const title = names.length ? `Waiting for ${names.join(', ')}` : phaseLabel(phase);
    return { kind: 'waiting', title, waitingFor };
  }
  switch (phase.kind) {
    case 'setup.restaurants':
      return { kind: 'placeFirstRestaurant', title: 'Place your first restaurant', canPass: phase.round === 1 };
    case 'setup.reserve':
      return { kind: 'chooseReserve', title: 'Choose your reserve card', options: STANDARD_RESERVES };
    case 'restructuring':
      return { kind: 'restructure', title: 'Build your company structure', ceoSlots: view.ceoSlots, submitted: false };
    case 'orderOfBusiness':
      return { kind: 'chooseOrder', title: 'Choose your place in turn order', freePositions: freeOrderPositions(view) };
    case 'working': {
      const p = view.players[me];
      const cards = p && view.turn ? cardsAtWork(p).filter((u) => (view.turn?.uses[u] ?? 0) > 0) : [];
      return { kind: 'work', title: 'Your turn: put your staff to work', stage: view.turn?.stage ?? 'recruit', cards };
    }
    case 'payday':
      return { kind: 'payday', title: 'Payday: fire staff, then pay salaries', owed: 0, mustFire: false };
    case 'cleanup':
      return { kind: 'freezer', title: 'Clean up: choose goods to freeze', capacity: 10 };
    default:
      return { kind: 'waiting', title: phaseLabel(phase), waitingFor };
  }
}

export function choiceTitle(c: PendingChoice): string {
  switch (c.kind) {
    case 'forcedFire':
      return `You cannot pay $${c.owed}: fire salaried staff`;
    case 'payWithTokens':
      return 'Pay part of your salaries with goods?';
    case 'pizzaRadio':
      return 'Place a pizza radio';
    case 'freeMailbox':
      return 'Place your free mailbox';
    case 'secondCampaign':
      return 'Place a second campaign tile?';
    case 'extraMapTile':
      return 'Place an extra map tile';
    case 'freeway':
      return 'Place a freeway?';
    case 'coffeeShop':
      return 'Place a coffee shop';
    case 'continue':
      return 'Paused: continue when ready';
  }
}

/** What the reserve cards do (base game vs Reserve Prices, KX p28). */
export function reserveRule(options: readonly ReserveCard[]): string {
  if (options[0]?.kind === 'price') {
    return 'Secret. When the bank first breaks, it gains $200 per player, and the most common card sets the base unit price for the rest of the game (ties: $20 beats $10 and $5; $5 beats $10). CEO slots do not change.';
  }
  return 'Secret. When the bank first breaks, all cards are revealed: the bank gets the sum, and the most common choice sets everyone’s CEO slots.';
}

/** One line naming why a pending choice appeared (the milestone or card behind it). */
export function choiceReason(c: PendingChoice): string | null {
  switch (c.kind) {
    case 'pizzaRadio':
      return 'First pizza sold: place a 2-turn pizza radio on the tile of the house you sold to.';
    case 'freeMailbox':
      return 'First new restaurant: place a free eternal mailbox in that restaurant\u2019s block.';
    case 'secondCampaign':
      return 'First campaign manager used: you may add a second tile of the same type, good and duration.';
    case 'extraMapTile':
      return 'First lobbyist used: place one of the leftover map tiles.';
    case 'freeway':
      return 'First rural marketeer used: you may place a freeway.';
    case 'coffeeShop':
      return c.source === 'milestone' ? 'First coffee sold: place 1 coffee shop.' : 'You trained a barista: place 1 coffee shop.';
    default:
      return null;
  }
}

/** Placement kind that resolves a pending choice, if it needs a board pick. */
export function choicePlacementKind(c: PendingChoice): PlacementKind | null {
  switch (c.kind) {
    case 'pizzaRadio':
      return 'pizzaRadio';
    case 'freeMailbox':
      return 'freeMailbox';
    case 'secondCampaign':
      return 'campaign';
    case 'extraMapTile':
      return 'mapTile';
    case 'freeway':
      return 'freeway';
    case 'coffeeShop':
      return 'coffeeShop';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export function legalFor(view: GameView, me: PlayerId | null, manifest: readonly ModuleManifest[], c: Catalog): LegalAction[] {
  if (!me || view.viewer === 'spectator') return [];
  const state = pseudoState(view, me);
  if (isToyManifest(manifest)) return attempt(() => toyEngine.legalActions(state, me)) ?? [];
  return attempt(() => realEngine.legalActions(state, me)) ?? fallbackLegal(view, me, c);
}

/** View-based approximation of the engine's legal actions (the engine stays authoritative). */
export function fallbackLegal(view: GameView, me: PlayerId, c: Catalog): LegalAction[] {
  const p = view.players[me];
  if (!p || view.phase.kind === 'gameOver') return [];
  const out: LegalAction[] = [];
  const ready = (label: string, action: Action) => out.push({ kind: 'ready', label, action });
  const head = view.pending[0];
  if (head) {
    if (head.player !== me) return [];
    const kind = choicePlacementKind(head);
    if (kind) out.push({ kind: 'placement', label: choiceTitle(head), actionType: choiceActionType(head), spec: { kind, choiceId: head.id } });
    if (head.kind === 'forcedFire') out.push({ kind: 'compose', label: 'Fire employees', actionType: 'payday.fire' });
    if (head.optional) ready('Decline', { type: 'choice.decline', playerId: me, choiceId: head.id });
    return out;
  }
  const awaited = view.awaiting.players.includes(me);
  switch (view.phase.kind) {
    case 'setup.restaurants':
      if (!awaited) return [];
      out.push({ kind: 'placement', label: 'Place restaurant', actionType: 'setup.placeRestaurant', spec: { kind: 'restaurant' } });
      if (view.phase.round === 1) ready('Pass', { type: 'setup.pass', playerId: me });
      return out;
    case 'setup.reserve':
      if (!awaited) return [];
      for (const card of STANDARD_RESERVES) ready(`Reserve $${card.amount}`, { type: 'setup.chooseReserve', playerId: me, card });
      return out;
    case 'restructuring':
      if (view.submitted[me] || view.mine?.structureDraft) ready('Retract', { type: 'restructure.retract', playerId: me });
      else out.push({ kind: 'compose', label: 'Submit structure', actionType: 'restructure.submit' });
      return out;
    case 'orderOfBusiness':
      if (!awaited) return [];
      for (const pos of freeOrderPositions(view)) ready(`Position ${pos + 1}`, { type: 'order.choosePosition', playerId: me, position: pos });
      return out;
    case 'working': {
      if (!awaited || !view.turn) return [];
      const stages = workStages(view);
      const now = stages.indexOf(view.turn.stage);
      for (const uid of cardsAtWork(p)) {
        if ((view.turn.uses[uid] ?? 0) <= 0) continue;
        const id = p.employees[uid]?.employeeId;
        const d = id ? c.employees[id] : undefined;
        const stage = cardStage(d);
        if (!d || !stage || stages.indexOf(stage) < now) continue;
        out.push(...cardActions(view, me, uid, d.id, c));
        ready(`Skip ${d.name}`, { type: 'work.skip', playerId: me, cardUid: uid });
      }
      ready('End turn', { type: 'work.endTurn', playerId: me });
      return out;
    }
    case 'payday':
      if (!awaited) return [];
      if (fireable(p).length) out.push({ kind: 'compose', label: 'Fire employees', actionType: 'payday.fire' });
      out.push({ kind: 'compose', label: 'Pay salaries', actionType: 'payday.confirm' });
      return out;
    case 'cleanup':
      if (!awaited) return [];
      out.push({ kind: 'compose', label: 'Freeze goods', actionType: 'cleanup.freezer' });
      return out;
    default:
      return out;
  }
}

function choiceActionType(c: PendingChoice): Action['type'] {
  switch (c.kind) {
    case 'pizzaRadio':
      return 'ketchup:newMilestones.placePizzaRadio';
    case 'freeMailbox':
      return 'ketchup:newMilestones.placeFreeMailbox';
    case 'secondCampaign':
      return 'ketchup:newMilestones.placeSecondCampaign';
    case 'extraMapTile':
      return 'ketchup:lobbyists.placeMapTile';
    case 'freeway':
      return 'ketchup:ruralMarketeers.placeFreeway';
    case 'coffeeShop':
      return 'ketchup:coffee.placeShop';
    case 'forcedFire':
      return 'payday.fire';
    case 'payWithTokens':
      return 'payday.confirm';
    case 'continue':
      return 'tutorial.continue';
  }
}

function cardActions(view: GameView, me: PlayerId, cardUid: Uid, id: EmployeeId, c: Catalog): LegalAction[] {
  const d = c.employees[id];
  if (!d) return [];
  const a = d.ability;
  const name = employeeName(c, id);
  switch (a.kind) {
    case 'ceo':
    case 'recruit':
      return [{ kind: 'compose', label: `Hire with ${name}`, actionType: 'work.recruit', cardUid }];
    case 'train':
      return [{ kind: 'compose', label: `Train with ${name}`, actionType: 'work.train', cardUid }];
    case 'produce':
      if (a.foods.length > 1) return [{ kind: 'compose', label: `Cook with ${name}`, actionType: 'work.produce', cardUid }];
      return [{ kind: 'ready', label: `Make ${a.amount} ${a.foods[0] ?? ''}`, action: { type: 'work.produce', playerId: me, cardUid } }];
    case 'buyDrinks':
      return [{ kind: 'placement', label: a.mode === 'errand' ? 'Fetch a drink' : 'Plan a drinks route', actionType: 'work.buyDrinks', cardUid, spec: { kind: 'buyerRoute', cardUid } }];
    case 'marketing':
      return a.campaigns.map((k) => ({
        kind: 'placement' as const,
        label: `Launch ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
        actionType: 'work.placeCampaign' as const,
        cardUid,
        spec: { kind: 'campaign' as const, cardUid, campaignKind: k },
      }));
    case 'newBusiness':
      return [
        { kind: 'placement', label: 'Build a house', actionType: 'work.placeHouse', cardUid, spec: { kind: 'house', cardUid } },
        { kind: 'placement', label: 'Add a garden', actionType: 'work.placeGarden', cardUid, spec: { kind: 'garden', cardUid } },
      ];
    case 'restaurant': {
      const out: LegalAction[] = [];
      if ((view.players[me]?.restaurantsRemaining ?? 0) > 0) {
        out.push({ kind: 'placement', label: 'Open a restaurant', actionType: 'work.placeRestaurant', cardUid, spec: { kind: 'restaurant', cardUid } });
      }
      if (a.mode === 'regional') {
        out.push({ kind: 'placement', label: 'Move a restaurant', actionType: 'work.moveRestaurant', cardUid, spec: { kind: 'moveRestaurant', cardUid } });
      }
      return out;
    }
    case 'lobbyist':
      return [
        { kind: 'placement', label: 'Build a road', actionType: 'ketchup:lobbyists.placeRoad', cardUid, spec: { kind: 'lobbyistRoad', cardUid } },
        { kind: 'placement', label: 'Lay out a park', actionType: 'ketchup:lobbyists.placePark', cardUid, spec: { kind: 'park', cardUid } },
      ];
    default:
      return [];
  }
}

/**
 * Asks the engine whether `action` would be accepted right now (on the view's pseudo-state).
 * Returns the rejection message, or null when it is fine or cannot be checked locally.
 */
export function actionProblem(view: GameView, me: PlayerId | null, action: Action, manifest: readonly ModuleManifest[]): string | null {
  if (!me || isToyManifest(manifest)) return null;
  const r = attempt(() => realEngine.validateAction(pseudoState(view, me), action));
  return r && !r.ok ? r.message : null;
}

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

export function placementsFor(view: GameView, me: PlayerId | null, spec: PlacementSpec, manifest: readonly ModuleManifest[], c: Catalog): Placement[] {
  if (!me) return [];
  const state = pseudoState(view, me);
  if (isToyManifest(manifest)) return [];
  return attempt(() => realEngine.legalPlacements(state, me, spec)) ?? fallbackPlacements(view, me, spec, c);
}

/** Only the board-free placements can be derived without the rules engine. */
export function fallbackPlacements(view: GameView, me: PlayerId, spec: PlacementSpec, c: Catalog): Placement[] {
  const cardId = spec.cardUid ? view.players[me]?.employees[spec.cardUid]?.employeeId : undefined;
  const ability = cardId ? c.employees[cardId]?.ability : undefined;
  if (spec.kind === 'buyerRoute' && ability?.kind === 'buyDrinks' && ability.mode === 'errand') {
    const drinks: DrinkId[] = ['beer', 'lemonade', 'soft_drink'];
    return drinks.map((drink) => ({ kind: 'buyerRoute', route: { mode: 'errand', drink }, collects: [] }));
  }
  if (spec.kind === 'campaign' && spec.campaignKind === 'gourmetGuide') {
    const n = view.marketingTiles[0] ?? 0;
    return [{ kind: 'campaign', campaignKind: 'gourmetGuide', tileNumber: n, placement: { kind: 'offBoard' } }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Board modes and previews (ux-plan §3.1–3.3, WP3)
// ---------------------------------------------------------------------------

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;
export type CampaignPlacementT = Extract<Placement, { kind: 'campaign' }>;
export type RoutePlacementT = Extract<Placement, { kind: 'buyerRoute' }>;

/** Road / air buyer routes (drawn as ribbons); errand-boy fetches are not board picks. */
export const isBoardRoute = (p: Placement): p is RoutePlacementT => p.kind === 'buyerRoute' && p.route.mode !== 'errand';

/** On-board orientation of a campaign placement (engine field, else from w × h). */
export function orientationOf(p: Placement): CampaignOrientation | null {
  if (p.kind !== 'campaign') return null;
  if (p.orientation) return p.orientation;
  const pl = p.placement;
  if (pl.kind !== 'board') return null;
  return pl.w === pl.h ? 'square' : pl.w > pl.h ? 'landscape' : 'portrait';
}

/** Legal campaign placements grouped by tile number (token picker counts). */
export function placementsByToken(placements: readonly Placement[]): Map<number, CampaignPlacementT[]> {
  const out = new Map<number, CampaignPlacementT[]>();
  for (const p of placements) {
    if (p.kind !== 'campaign') continue;
    const list = out.get(p.tileNumber) ?? [];
    list.push(p);
    out.set(p.tileNumber, list);
  }
  return out;
}

/**
 * The board mode for a placement `LegalAction` and its legal placements:
 * - buyer routes (road / air) → `route` (ribbons; hover / [ ] to choose, Enter / Confirm commits);
 * - campaigns → `campaign` (spots keyed by anchor + tile number, R flips orientation), narrowed to
 *   `tileNumber` when given (the token picked in the panel);
 * - everything else → `place`.
 * `spec` is carried so the board controller can draw the range overlay and explain illegal squares.
 */
export function boardModeFor(legal: PlacementLegal, placements: readonly Placement[], opts: { color: string; label?: string; tileNumber?: number | null }): InteractionMode {
  const label = opts.label ?? legal.label;
  const spec: PlacementSpec = { ...legal.spec, ...(legal.cardUid && !legal.spec.cardUid ? { cardUid: legal.cardUid } : {}) };
  if (legal.spec.kind === 'buyerRoute') {
    const routes = placements.filter(isBoardRoute);
    if (routes.length) return { kind: 'route', placements: routes, label, color: opts.color, spec };
  }
  if (legal.spec.kind === 'campaign') {
    const t = opts.tileNumber ?? null;
    const camps = placements.filter((p): p is CampaignPlacementT => p.kind === 'campaign' && (t === null || p.tileNumber === t));
    return { kind: 'campaign', tileNumber: t, placements: camps, label, color: opts.color, spec: t === null ? spec : { ...spec, tileNumber: t } };
  }
  return { kind: 'place', placementKind: legal.spec.kind, placements: [...placements], label, color: opts.color, spec };
}

/** Engine range overlay for a placement spec (road-range cards, coffee shop choice). Null = unlimited / not applicable. */
export function rangeFor(view: GameView, me: PlayerId | null, spec: PlacementSpec, color?: string): RangeOverlayData | null {
  if (!me) return null;
  const ranged: PlacementSpec['kind'][] = ['campaign', 'restaurant', 'lobbyistRoad', 'park', 'coffeeShop'];
  if (!ranged.includes(spec.kind)) return null;
  if (!spec.cardUid && spec.kind !== 'coffeeShop') return null;
  const r = attempt(() => realEngine.rangeOverlay(pseudoState(view, me), me, spec.cardUid));
  if (!r || r.range === null || !r.roads.length) return null;
  return { roads: r.roads, starts: r.starts, range: r.range, ...(color ? { color } : {}) };
}

/** Campaign-like preview query for a placement (campaign, pizza radio, free mailbox). */
function reachQuery(p: Placement, me: PlayerId, good: FoodId | null) {
  const goods = good ? [good] : undefined;
  if (p.kind === 'campaign') return { kind: p.campaignKind, placement: p.placement, owner: me, tileNumber: p.tileNumber, ...(goods ? { goods } : {}) };
  if (p.kind === 'pizzaRadio') return { kind: 'radio' as const, placement: { kind: 'board' as const, x: p.x, y: p.y, w: 1, h: 1 }, owner: me, goods: ['pizza' as FoodId] };
  if (p.kind === 'freeMailbox') return { kind: 'mailbox' as const, placement: { kind: 'board' as const, x: p.x, y: p.y, w: 1, h: 1 }, owner: me, ...(goods ? { goods } : {}) };
  return null;
}

/** Engine reach preview (`campaignReach`) for a hypothetical campaign placement. */
export function reachPreview(view: GameView, me: PlayerId | null, p: Placement, good: FoodId | null): CampaignReachPreview | null {
  if (!me) return null;
  const q = reachQuery(p, me, good);
  if (!q) return null;
  return attempt(() => realEngine.campaignReach(pseudoState(view, me), q)) ?? null;
}

/** Reach overlay data for a hypothetical placement: rings + chips, mailbox / radio cells, airplane band. */
export function reachFor(view: GameView, me: PlayerId | null, p: Placement, good: FoodId | null, color?: string): ReachOverlayData | null {
  const r = reachPreview(view, me, p, good);
  if (!r) return null;
  const shown: FoodId = good ?? (p.kind === 'pizzaRadio' ? 'pizza' : 'burger');
  const base: ReachOverlayData = {
    houseIds: r.houses.map((h) => h.houseId),
    good: shown,
    full: r.houses.filter((h) => h.full).map((h) => h.houseId),
    ...(color ? { color } : {}),
  };
  const pl = p.kind === 'campaign' ? p.placement : null;
  if (pl?.kind === 'airplane') {
    // N / S planes fly over columns, E / W over rows.
    const axis = pl.side === 'N' || pl.side === 'S' ? 'col' : 'row';
    return { ...base, band: { axis, from: pl.offset, to: pl.offset + pl.width - 1 } };
  }
  return r.area.length ? { ...base, cells: r.area } : base;
}

/** Why `candidate` is illegal for `spec` (engine message), or null when legal / unknown. */
export function problemAt(view: GameView, me: PlayerId | null, spec: PlacementSpec, candidate: Placement): string | null {
  if (!me) return null;
  return attempt(() => realEngine.placementProblem(pseudoState(view, me), me, spec, candidate)) ?? null;
}

/**
 * A would-be placement anchored at `cell`, shaped like the mode's legal placements, so the engine
 * can explain why that square is not legal. Null for kinds with no square-anchored shape.
 */
export function candidateAt(mode: InteractionMode, cell: Cell, orientation: CampaignOrientation | null): Placement | null {
  if (mode.kind !== 'place' && mode.kind !== 'campaign') return null;
  const ps: readonly Placement[] = mode.placements;
  const kind = mode.kind === 'campaign' ? 'campaign' : mode.placementKind;
  const { x, y } = cell;
  switch (kind) {
    case 'campaign': {
      const board = ps.filter((p): p is CampaignPlacementT => p.kind === 'campaign' && p.placement.kind === 'board');
      const like = board.find((p) => orientationOf(p) === orientation) ?? board[0];
      if (!like || like.placement.kind !== 'board') return null;
      const { w, h } = like.placement;
      return { kind: 'campaign', campaignKind: like.campaignKind, tileNumber: like.tileNumber, placement: { kind: 'board', x, y, w, h }, ...(like.orientation ? { orientation: like.orientation } : {}) };
    }
    case 'restaurant':
      return { kind: 'restaurant', x, y, entrance: 'NW' };
    case 'house': {
      const first = ps.find((p) => p.kind === 'house');
      return first && first.kind === 'house' ? { kind: 'house', houseOrder: first.houseOrder, x, y, gardenSide: 'S' } : null;
    }
    case 'coffeeShop':
      return { kind: 'coffeeShop', x, y };
    case 'pizzaRadio':
      return { kind: 'pizzaRadio', x, y };
    case 'freeMailbox':
      return { kind: 'freeMailbox', x, y };
    default:
      return null;
  }
}

/** Engine outlook for a house (null when unknown or the engine cannot run on this view). */
export function outlookFor(view: GameView, me: PlayerId | null, houseId: HouseId): HouseOutlook | null {
  return attempt(() => realEngine.houseOutlook(pseudoState(view, me), houseId)) ?? null;
}

/** Houses an existing campaign reaches now. */
export function campaignReachIds(view: GameView, me: PlayerId | null, campaignId: string): HouseId[] {
  const c = view.board.campaigns[campaignId];
  if (!c) return [];
  const q = { kind: c.kind, placement: c.placement, owner: c.owner, goods: c.goods, ...(c.number !== null ? { tileNumber: c.number } : {}) };
  return attempt(() => realEngine.campaignReach(pseudoState(view, me), q).houses.map((h) => h.houseId)) ?? [];
}

/** Roof plaque data for every house: capacity from the engine (`houseOutlook`), "no seller" from the last dinnertime. */
export function houseInfoFor(view: GameView, me: PlayerId | null, noSeller: ReadonlySet<HouseId>): Record<HouseId, HouseBoardInfo> {
  const out: Record<HouseId, HouseBoardInfo> = {};
  const state = attempt(() => pseudoState(view, me));
  for (const id of Object.keys(view.board.houses)) {
    const o = state ? attempt(() => realEngine.houseOutlook(state, id)) : undefined;
    const info: HouseBoardInfo = {};
    if (o) info.capacity = o.capacity;
    if (noSeller.has(id)) info.noSeller = true;
    if (Object.keys(info).length) out[id] = info;
  }
  return out;
}
