/**
 * Board bridge: the only contract between the 2D overlay (ui/) and the board renderer.
 *
 * The overlay never imports the 3D layer and the 3D layer never imports ui/ (architecture §2).
 * The 3D layer (packages/client/src/three/) implements `BoardBridge` and calls
 * `registerBoardBridge(impl)` once its scene is mounted into `#board-root`. Until then (or if it
 * unregisters) the overlay shows its own lightweight 2D board (ui/board2d), which implements the
 * same interface.
 *
 * Flow:
 * - The store calls `setView(view, me, events)` after every snapshot/applied message. `events` are
 *   the new (redacted) events since the previous call, for animation; empty on snapshots.
 * - When the player must pick something on the board, the overlay calls
 *   `setInteractionMode({ kind: 'place', ... })` with the engine's legal placements. The board
 *   renders ghosts/highlights, and reports the chosen one through `onPick` listeners as
 *   `{ kind: 'placement', placement }` (the exact object from `placements`). Escape/cancel on the
 *   board reports `{ kind: 'cancel' }`.
 * - `setInteractionMode({ kind: 'idle' })` ends picking. `inspect` highlights things (e.g. a
 *   player's restaurants when hovering their panel) without picking.
 * - Clicking a board object outside of placement mode reports `{ kind: 'object', id, objectKind }`
 *   (house, restaurant, campaign, source, entity id); the bridge turns it into `selection`
 *   (state/interaction.ts) so the overlay can show details.
 * - `route` mode (buyer routes) draws every candidate as a ribbon; hover / `[` `]` change
 *   `activeCandidate`, a click stages, Enter / Confirm / a second click commits the exact object.
 * - `campaign` mode groups placements by anchor square + tile number; R / rotate flips the
 *   orientation only. Its ghost shows the footprint, the road edge it uses and the reach preview.
 *
 * Board controller (bottom of this file): reacts to the view, the mode and the board hover and
 * fills the overlay signals (state/boardOverlays.ts) from the engine previews (state/guidance.ts):
 * range overlay on mode entry, reach preview for the hovered / staged campaign, route ribbons,
 * the illegal-square reason, roof-plaque capacities and the selection's related pieces.
 */
import { batch, effect, signal } from '@preact/signals';
import { publishMotion } from './motion.js';
import type { GameEvent, GameView, HouseId, Placement, PlacementKind, PlacementSpec, PlayerId } from '@fcm/engine';
import { houseBoardInfo, rangeOverlay, reachOverlay, routeOverlay, type HouseBoardInfo } from './boardOverlays.js';
import { campaignReachIds, candidateAt, houseInfoFor, outlookFor, problemAt, rangeFor, reachFor, type CampaignPlacementT, type RoutePlacementT } from './guidance.js';
import {
  activeCandidate,
  boardHover,
  ghostOrientation,
  hoverPlacement,
  pendingPlacement,
  placementReason,
  previewGood,
  selectedOutlook,
  selection,
  selectionRelated,
  type SelectionKind,
} from './interaction.js';

interface ModeCommon {
  /** Short instruction shown near the cursor ("Place your restaurant"). */
  label: string;
  /** Owner colour for ghosts, ribbons and overlays. */
  color: string;
  /** The legal action's spec: enables the range overlay and illegal-square reasons. */
  spec?: PlacementSpec;
}

export type InteractionMode =
  | { kind: 'idle' }
  | (ModeCommon & {
      kind: 'place';
      /** What is being placed (for the ghost mesh). */
      placementKind: PlacementKind;
      /** Legal placements from the engine; pick exactly one of these objects. */
      placements: Placement[];
    })
  | (ModeCommon & {
      kind: 'campaign';
      /** Token chosen in the panel (null = every tile number in `placements`). */
      tileNumber: number | null;
      placements: CampaignPlacementT[];
    })
  | (ModeCommon & {
      kind: 'route';
      /** Road / air buyer routes (distinct hauls); the pick is one of these objects. */
      placements: RoutePlacementT[];
    })
  | { kind: 'inspect'; ids: string[] };

/** Modes that pick one of `placements`. */
export type PickMode = Extract<InteractionMode, { placements: unknown }>;
export const isPickMode = (m: InteractionMode): m is PickMode => m.kind === 'place' || m.kind === 'campaign' || m.kind === 'route';

export type BoardPick =
  | { kind: 'placement'; placement: Placement }
  | { kind: 'cancel' }
  | { kind: 'object'; id: string; objectKind?: SelectionKind | 'garden' };

export interface BoardBridge {
  setView(view: GameView | null, me: PlayerId | null, events: readonly GameEvent[]): void;
  setInteractionMode(mode: InteractionMode): void;
  /** Subscribe to picks. Returns an unsubscribe function. */
  onPick(listener: (pick: BoardPick) => void): () => void;
}

/** Name of the registered renderer ('3d', '2d') or null. The overlay shows the 2D board while this is not '3d'. */
export const boardRenderer = signal<string | null>(null);
/** Current mode, mirrored for overlay components (placement hints, cancel button). */
export const interactionMode = signal<InteractionMode>({ kind: 'idle' });
/** Latest view and viewer the board was given. */
export const boardView = signal<{ view: GameView | null; me: PlayerId | null }>({ view: null, me: null });

let impl: BoardBridge | null = null;
const pickListeners = new Set<(p: BoardPick) => void>();
let unsubscribeImpl: (() => void) | null = null;

/** Called by the board layer. Returns an unregister function. */
export function registerBoardBridge(bridge: BoardBridge, name = '3d'): () => void {
  unsubscribeImpl?.();
  impl = bridge;
  boardRenderer.value = name;
  unsubscribeImpl = bridge.onPick((p) => emitPick(p));
  const last = boardView.peek();
  bridge.setView(last.view, last.me, []);
  bridge.setInteractionMode(interactionMode.value);
  return () => {
    if (impl !== bridge) return;
    unsubscribeImpl?.();
    unsubscribeImpl = null;
    impl = null;
    boardRenderer.value = null;
  };
}

const OBJECT_KINDS: Record<string, SelectionKind> = { house: 'house', garden: 'house', restaurant: 'restaurant', campaign: 'campaign', source: 'source', entity: 'entity' };

/** Selection kind of a board id ("house-12" → house), or null. */
export function selectionKindOf(id: string, hint?: string): SelectionKind | null {
  if (hint && OBJECT_KINDS[hint]) return OBJECT_KINDS[hint];
  const v = boardView.peek().view;
  if (v) {
    if (v.board.houses[id]) return 'house';
    if (v.board.restaurants[id]) return 'restaurant';
    if (v.board.campaigns[id]) return 'campaign';
    if (v.board.drinkSources[id]) return 'source';
    if (v.board.entities[id]) return 'entity';
  }
  return null;
}

export function emitPick(p: BoardPick): void {
  // Idle-mode object picks select the piece (picking while placing is ignored: placement wins).
  if (p.kind === 'object' && !isPickMode(interactionMode.peek())) {
    const kind = selectionKindOf(p.id, p.objectKind);
    if (kind) selection.value = { kind, id: p.id };
  }
  for (const l of [...pickListeners]) l(p);
}

/** What the overlay uses. Safe to call with no renderer registered. */
export const boardBridge: BoardBridge = {
  setView(view, me, events) {
    trackNoSeller(view, events);
    // Overlay motion (ui/motion.tsx) measures the old DOM before the new view renders.
    publishMotion(boardView.peek().view, view, events, boardRenderer.peek() === '3d');
    boardView.value = { view, me };
    impl?.setView(view, me, events);
  },
  setInteractionMode(mode) {
    batch(() => {
      if (isPickMode(mode)) selection.value = null;
      activeCandidate.value = mode.kind === 'route' && mode.placements.length ? 0 : -1;
      placementReason.value = null;
      interactionMode.value = mode;
    });
    impl?.setInteractionMode(mode);
  },
  onPick(listener) {
    pickListeners.add(listener);
    return () => pickListeners.delete(listener);
  },
};

// ---------------------------------------------------------------------------
// Board controller: engine previews → overlay signals
// ---------------------------------------------------------------------------

/** Houses that had demand and no seller in the last dinnertime; cleared when marketing runs. */
let noSeller = new Set<HouseId>();
function trackNoSeller(view: GameView | null, events: readonly GameEvent[]): void {
  if (!view) {
    noSeller = new Set();
    return;
  }
  for (const e of events) {
    if (e.type === 'houseStayedHome') noSeller.add(e.houseId);
    else if (e.type === 'campaignRan' || (e.type === 'phaseChanged' && e.to.kind === 'marketing')) noSeller.clear();
  }
  for (const id of [...noSeller]) if (!view.board.houses[id]?.demand.length) noSeller.delete(id);
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether the controller wrote the overlay signals (so it only clears what it drew). */
const owns = { range: false, reach: false, routes: false };

// Roof plaques: capacity from the engine's houseOutlook (modules included), "no seller" dots.
effect(() => {
  const { view, me } = boardView.value;
  if (!view) return;
  const next: Record<HouseId, HouseBoardInfo> = houseInfoFor(view, me, noSeller);
  if (!sameJson(next, houseBoardInfo.peek())) houseBoardInfo.value = next;
});

// Range overlay on mode entry (road-range marketeers, local manager, lobbyists, coffee shop).
effect(() => {
  const m = interactionMode.value;
  const { view, me } = boardView.value;
  const data = view && isPickMode(m) && m.kind !== 'route' && m.spec ? rangeFor(view, me, m.spec, m.color) : null;
  if (data) {
    if (!sameJson(data, rangeOverlay.peek())) rangeOverlay.value = data;
    owns.range = true;
  } else if (owns.range) {
    rangeOverlay.value = null;
    owns.range = false;
  }
});

// Reach preview for the staged (else hovered / active) campaign-like placement.
const REACH_KINDS = new Set<PlacementKind>(['campaign', 'pizzaRadio', 'freeMailbox']);
effect(() => {
  const m = interactionMode.value;
  const { view, me } = boardView.value;
  const good = previewGood.value;
  const p = pendingPlacement.value ?? hoverPlacement.value?.placement ?? null;
  const data = view && p && (m.kind === 'campaign' || m.kind === 'place') && REACH_KINDS.has(p.kind) ? reachFor(view, me, p, good, m.color) : null;
  if (data) {
    if (!sameJson(data, reachOverlay.peek())) reachOverlay.value = data;
    owns.reach = true;
  } else if (owns.reach) {
    reachOverlay.value = null;
    owns.reach = false;
  }
});

// Route ribbons: every candidate faint, the active one solid.
effect(() => {
  const m = interactionMode.value;
  const active = activeCandidate.value;
  if (m.kind === 'route' && m.placements.length) {
    routeOverlay.value = { candidates: m.placements.map((p) => ({ route: p.route as Exclude<typeof p.route, { mode: 'errand' }>, collects: p.collects, ...(p.range !== undefined ? { range: p.range } : {}), ...(p.bordersUsed !== undefined ? { bordersUsed: p.bordersUsed } : {}) })), active: Math.max(0, active), color: m.color };
    owns.routes = true;
  } else if (owns.routes) {
    routeOverlay.value = null;
    owns.routes = false;
  }
});

// Say why not: hovering a square with no legal spot publishes the engine's reason.
let reasonKey = '';
effect(() => {
  const m = interactionMode.value;
  const hover = boardHover.value;
  const onSpot = hoverPlacement.value !== null;
  const orient = ghostOrientation.value;
  const { view, me } = boardView.peek();
  const cell = hover?.cell ?? null;
  if (!view || !cell || onSpot || (m.kind !== 'place' && m.kind !== 'campaign') || !m.spec) {
    reasonKey = '';
    if (placementReason.peek() !== null) placementReason.value = null;
    return;
  }
  const key = `${cell.x},${cell.y},${orient}`;
  if (key === reasonKey) return;
  reasonKey = key;
  const cand = candidateAt(m, cell, orient);
  placementReason.value = cand ? problemAt(view, me, m.spec, cand) : null;
});

// Selection: related pieces (sellers' restaurants + reaching campaigns / reached houses) and the house outlook.
effect(() => {
  const sel = selection.value;
  const { view, me } = boardView.value;
  let related: string[] = [];
  let outlook = null;
  if (sel && view) {
    const exists =
      sel.kind === 'house' ? !!view.board.houses[sel.id] : sel.kind === 'restaurant' ? !!view.board.restaurants[sel.id] : sel.kind === 'campaign' ? !!view.board.campaigns[sel.id] : sel.kind === 'source' ? !!view.board.drinkSources[sel.id] : !!view.board.entities[sel.id];
    if (!exists) {
      selection.value = null;
      return;
    }
    if (sel.kind === 'house') {
      outlook = outlookFor(view, me, sel.id);
      if (outlook) related = [...new Set([...outlook.sellers.map((s) => s.restaurantId), ...outlook.campaigns])];
    } else if (sel.kind === 'campaign') {
      related = campaignReachIds(view, me, sel.id);
    }
  }
  if (!sameJson(related, selectionRelated.peek())) selectionRelated.value = related;
  if (!sameJson(outlook, selectedOutlook.peek())) selectedOutlook.value = outlook;
});
