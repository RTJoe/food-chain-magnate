/**
 * Board overlay signals (ux-plan WP2). The 3D layer draws whatever these hold; the overlay (ui/)
 * and the interaction model (state/interaction.ts, WP3) write them. Neither side imports the other.
 *
 * Data shapes mirror the engine view additions planned in ux-plan §4 (`rangeOverlay`,
 * `campaignReach`, `houseOutlook`) so engine results are passed straight through.
 */
import { signal } from '@preact/signals';
import type { BuyerRoute, Cell, FoodId, HouseId, RouteStart, SourceId } from '@fcm/engine';

/** Content inset in CSS px: parts of the board element covered by panels (rail, dock, bars). */
export interface BoardInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Explicit board inset. Null = the scene measures it from the table layout (`.table-board` and a
 * fixed bottom sheet). Set it to override (e.g. a custom layout).
 */
export const boardInset = signal<BoardInset | null>(null);

/** Settings: doubles the tile seam width and adds a faint checkerboard tint per map tile. */
export const highContrastTiles = signal(false);

/** Per-house data from the engine (`houseOutlook`) or the last dinnertime. Missing = derive locally. */
export interface HouseBoardInfo {
  /** Demand capacity; null = unlimited (apartment, rural). Undefined = derive 3 / 5 / ∞. */
  capacity?: number | null;
  /** Had demand and no road-connected seller in the last dinnertime (grey dot until marketing). */
  noSeller?: boolean;
}

export const houseBoardInfo = signal<Record<HouseId, HouseBoardInfo>>({});

/** Road range (engine `rangeOverlay`): road squares with their distance in tile borders. */
export interface RangeOverlayData {
  roads: readonly { x: number; y: number; distance: number }[];
  starts?: readonly RouteStart[];
  range: number;
  /** Player colour (CSS). */
  color?: string;
  /** Dim map tiles with no road in range (default true). */
  dimOutside?: boolean;
}

/** Campaign reach preview: houses reached, good dropped, which of them are full. */
export interface ReachOverlayData {
  houseIds: readonly HouseId[];
  good: FoodId;
  full?: readonly HouseId[];
  color?: string;
  /** Mailbox flood-fill region / radio tile block to tint. */
  cells?: readonly Cell[];
  /** Airplane: covered rows or columns as a band across the board. */
  band?: { axis: 'row' | 'col'; from: number; to: number };
}

/** One buyer route candidate (structurally a `Placement` of kind `buyerRoute`, plus extras). */
export interface RouteRibbon {
  route: Exclude<BuyerRoute, { mode: 'errand' }>;
  collects: readonly { sourceId: SourceId; count: number }[];
  color?: string;
  range?: number;
  bordersUsed?: number;
}

export interface RouteOverlayData {
  candidates: readonly RouteRibbon[];
  active: number;
  color?: string;
}

export const rangeOverlay = signal<RangeOverlayData | null>(null);
export const reachOverlay = signal<ReachOverlayData | null>(null);
export const routeOverlay = signal<RouteOverlayData | null>(null);
