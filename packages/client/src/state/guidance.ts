/**
 * Prompt, legal actions and legal placements for the viewer, from the rules engine
 * (`derivePrompt` is view-based; `legalActions`/`legalPlacements` run on a pseudo-state rebuilt
 * from the view). An engine exception is logged and yields a neutral result.
 */
import { engine as realEngine, houseCapacities } from '@fcm/engine';
import type {
  Action,
  CampaignOrientation,
  CampaignReachPreview,
  Cell,
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
} from '@fcm/engine';
import type { InteractionMode } from './boardBridge.js';
import type { HouseBoardInfo, RangeOverlayData, ReachOverlayData } from './boardOverlays.js';
import type { Catalog } from './catalog.js';
import { pseudoState } from './engine.js';
import { phaseLabel, STAGE_LABELS } from './selectors.js';

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    console.error('[guidance] engine call failed', e);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function promptFor(view: GameView, me: PlayerId | null, _manifest: readonly ModuleManifest[]): Prompt {
  const pr: Prompt = attempt(() => realEngine.derivePrompt(view, me)) ?? { kind: 'waiting', title: phaseLabel(view.phase), waitingFor: view.awaiting.players };
  // The engine heads every pending choice "Decision needed": say which decision it is.
  if (pr.kind === 'choice') return { ...pr, title: choiceTitle(pr.choice) };
  // ...and names the Working sub-step by its id ("Your turn: driveIns"): use the stage chip's label.
  if (pr.kind === 'work') return { ...pr, title: `Your turn: ${STAGE_LABELS[pr.stage] ?? pr.stage}` };
  return pr;
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
    return 'Secret. When the bank first breaks, it gains $200 per player, and the most common card sets the base price for the rest of the game (ties: $20 beats $10 and $5; $5 beats $10). CEO slots do not change.';
  }
  return 'Secret. When the bank first breaks, all cards are revealed: the bank gets the sum, and the most common choice sets everyone’s CEO slots (a tie goes to the highest number).';
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

export function legalFor(view: GameView, me: PlayerId | null, _manifest: readonly ModuleManifest[], _c: Catalog): LegalAction[] {
  if (!me || view.viewer === 'spectator') return [];
  const state = pseudoState(view, me);
  return attempt(() => realEngine.legalActions(state, me)) ?? [];
}

/**
 * Asks the engine whether `action` would be accepted right now (on the view's pseudo-state).
 * Returns the rejection message, or null when it is fine or cannot be checked locally.
 */
export function actionProblem(view: GameView, me: PlayerId | null, action: Action, _manifest: readonly ModuleManifest[]): string | null {
  if (!me) return null;
  const r = attempt(() => realEngine.validateAction(pseudoState(view, me), action));
  return r && !r.ok ? r.message : null;
}

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

export function placementsFor(view: GameView, me: PlayerId | null, spec: PlacementSpec, _manifest: readonly ModuleManifest[], _c: Catalog): Placement[] {
  if (!me) return [];
  const state = pseudoState(view, me);
  return attempt(() => realEngine.legalPlacements(state, me, spec)) ?? [];
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
    case 'lobbyistRoad': {
      // A legal road of the hovered orientation, slid so its first square is under the pointer.
      const roads = ps.filter((p): p is Extract<Placement, { kind: 'lobbyistRoad' }> => p.kind === 'lobbyistRoad');
      const like = roads.find((p) => boxOrientation(p.cells) === orientation) ?? roads[0];
      const c0 = like?.cells[0];
      if (!like || !c0) return null;
      const dx = x - c0.x;
      const dy = y - c0.y;
      const at = (c: Cell): Cell => ({ x: c.x + dx, y: c.y + dy });
      return { ...like, cells: like.cells.map(at), arrows: like.arrows.map((a) => ({ ...a, from: at(a.from) })) };
    }
    case 'park': {
      const parks = ps.filter((p): p is Extract<Placement, { kind: 'park' }> => p.kind === 'park');
      const like = parks.find((p) => (p.w === p.h ? 'square' : p.w > p.h ? 'landscape' : 'portrait') === orientation) ?? parks[0];
      if (!like) return null;
      const dx = x - like.x;
      const dy = y - like.y;
      return { ...like, x, y, ...(like.cells ? { cells: like.cells.map((c) => ({ x: c.x + dx, y: c.y + dy })) } : {}) };
    }
    default:
      return null;
  }
}

function boxOrientation(cells: readonly Cell[]): CampaignOrientation {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  return w === h ? 'square' : w > h ? 'landscape' : 'portrait';
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
  // Only the capacity is needed: houseCapacities skips houseOutlook's seller ranking and campaign reach.
  const state = attempt(() => pseudoState(view, me));
  const caps = state ? attempt(() => houseCapacities(state)) : undefined;
  for (const id of Object.keys(view.board.houses)) {
    const info: HouseBoardInfo = {};
    if (caps && id in caps) info.capacity = caps[id];
    if (noSeller.has(id)) info.noSeller = true;
    if (Object.keys(info).length) out[id] = info;
  }
  return out;
}
