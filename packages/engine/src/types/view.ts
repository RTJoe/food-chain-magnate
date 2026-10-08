/**
 * What a client sees (architecture §3.5) and UI guidance types shared by online and hot-seat
 * play: `GameView`, `Prompt`, `LegalAction`, `PlacementSpec`, `Placement`.
 */
import type { CampaignKind, Direction, FoodId, Rotation, TileTemplateId } from './content.js';
import type { Action, ActionType, BuyerRoute, RouteStart } from './actions.js';
import type {
  FoodCounts,
  CampaignId,
  CampaignPlacement,
  Cell,
  ChoiceId,
  Corner,
  GameState,
  HouseId,
  PendingChoice,
  PlayerId,
  PlayerSecrets,
  ReserveCard,
  RestaurantId,
  SourceId,
  Uid,
  WorkStage,
} from './state.js';

export type Viewer = PlayerId | 'spectator';

/**
 * Redacted state for one viewer: no `rng`, no `seed`, no other players' secrets. Module `redact`
 * hooks may hide more. Everything else in the base game is open information (base.md §4.8).
 */
export interface GameView extends Omit<GameState, 'rng' | 'seed' | 'secrets'> {
  viewer: Viewer;
  /** The viewer's own secrets (null for spectators). */
  mine: PlayerSecrets | null;
  /** Who has submitted their simultaneous decision (reserve / structure / freezer). */
  submitted: Record<PlayerId, boolean>;
  /** Reserve cards the viewer may see: own, all after the first break, or all with first_20 (milestones.md). */
  visibleReserves: Partial<Record<PlayerId, ReserveCard>>;
}

// ---------------------------------------------------------------------------
// Placements (board picks)
// ---------------------------------------------------------------------------

/** A concrete legal placement the client can render as a ghost and send back in an action. */
export type Placement =
  | { kind: 'restaurant'; x: number; y: number; entrance: Corner; from?: RouteStart }
  | { kind: 'moveRestaurant'; restaurantId: RestaurantId; x: number; y: number; entrance: Corner }
  | { kind: 'house'; houseOrder: number; x: number; y: number; gardenSide: Direction }
  | { kind: 'garden'; houseId: HouseId; side: Direction; cells: Cell[] }
  | {
      kind: 'campaign';
      campaignKind: CampaignKind;
      tileNumber: number;
      placement: CampaignPlacement;
      from?: RouteStart;
      /**
       * On-board tiles: `landscape` (w ≥ h as printed), `portrait` (rotated) or `square`. The same
       * anchor (x, y) and tile number may appear once per orientation (questions.md Q-B7).
       */
      orientation?: CampaignOrientation;
    }
  | {
      kind: 'buyerRoute';
      route: BuyerRoute;
      collects: { sourceId: SourceId; count: number }[];
      /** Borders the buyer may cross (road: tile borders incl. roadworks; air: tiles entered after the start). */
      range?: number;
      /** Borders this route crosses (≤ range). */
      bordersUsed?: number;
    }
  | { kind: 'coffeeShop'; x: number; y: number; moveFrom?: string }
  /** `piece`: lobbyist road tile id ('2', '4' straight, 'L3' corner); cells in path order. */
  | { kind: 'lobbyistRoad'; cells: Cell[]; arrows: { from: Cell; dir: Direction }[]; from: RouteStart; piece?: string }
  /** x, y, w, h = bounding box; `cells` = the squares; `piece`: park tile id ('I', 'T', 'L'). */
  | { kind: 'park'; x: number; y: number; w: number; h: number; from: RouteStart; cells?: Cell[]; piece?: string }
  | { kind: 'freeway'; side: Direction; offset: number }
  | { kind: 'mapTile'; row: number; col: number; rotation: Rotation; templateId?: TileTemplateId }
  | { kind: 'pizzaRadio'; x: number; y: number }
  | { kind: 'freeMailbox'; x: number; y: number };

export type PlacementKind = Placement['kind'];

export type CampaignOrientation = 'landscape' | 'portrait' | 'square';

/** Query for `legalPlacements`. Fields narrow the search (which card, which tile, which choice). */
export interface PlacementSpec {
  kind: PlacementKind;
  cardUid?: Uid;
  choiceId?: ChoiceId;
  campaignKind?: CampaignKind;
  tileNumber?: number;
  restaurantId?: RestaurantId;
  houseOrder?: number;
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/**
 * What the player can do now.
 * - `ready`: a fully specified action; send as-is (pass, end turn, take position 2, hire X).
 * - `placement`: needs a board pick; call `legalPlacements(spec)` and build the action from one.
 * - `compose`: needs a client-built payload (structure, firing set, freezer keep, reserve card).
 */
export type LegalAction = (
  | { kind: 'ready'; label: string; action: Action }
  | { kind: 'placement'; label: string; actionType: ActionType; cardUid?: Uid; spec: PlacementSpec }
  | {
      kind: 'compose';
      label: string;
      actionType: 'setup.chooseReserve' | 'restructure.submit' | 'payday.fire' | 'payday.confirm' | 'cleanup.freezer' | 'work.train' | 'work.recruit' | 'work.produce';
      cardUid?: Uid;
    }
) & {
  /**
   * Working 9–5: set on a card's `work.skip` entry when skipping is all that card can do, saying
   * why in one line (e.g. "No Barista left in the supply"). The UI shows it instead of "No action".
   */
  disabledReason?: string;
};

// ---------------------------------------------------------------------------
// Prompt (UI guidance; derived from a view so hot-seat == online)
// ---------------------------------------------------------------------------

export type Prompt =
  | { kind: 'waiting'; title: string; waitingFor: PlayerId[] }
  | { kind: 'spectating'; title: string; waitingFor: PlayerId[] }
  | { kind: 'placeFirstRestaurant'; title: string; canPass: boolean }
  | { kind: 'chooseReserve'; title: string; options: ReserveCard[] }
  | { kind: 'restructure'; title: string; ceoSlots: number; submitted: boolean }
  | { kind: 'chooseOrder'; title: string; freePositions: number[] }
  | { kind: 'work'; title: string; stage: WorkStage; cards: Uid[] }
  | { kind: 'payday'; title: string; owed: number; mustFire: boolean }
  | { kind: 'freezer'; title: string; capacity: number }
  | { kind: 'choice'; title: string; choice: PendingChoice }
  | { kind: 'gameOver'; title: string; ranking: PlayerId[] };

export type PromptKind = Prompt['kind'];

// ---------------------------------------------------------------------------
// Board previews (UI guidance; pure functions over a state, ux-plan.md §4)
// ---------------------------------------------------------------------------

/** A hypothetical or existing campaign to preview (`campaignReach`). */
export interface CampaignReachQuery {
  kind: CampaignKind;
  placement: CampaignPlacement;
  /** Owner (milestone and module demand amounts). Default: none. */
  owner?: PlayerId;
  /** Goods advertised (default one good). Only the count matters for `adds`. */
  goods?: FoodId[];
  tileNumber?: number;
}

export interface ReachedHouse {
  houseId: HouseId;
  /** Demand tokens on the house now. */
  demand: number;
  /** Maximum demand (null = no maximum: apartments, rural area). */
  capacity: number | null;
  /** Tokens one run of this campaign would add now (0 when full). */
  adds: number;
  full: boolean;
}

export interface CampaignReachPreview {
  /** Houses reached, in dinnertime order (module reach included: giant billboard, gourmet guide). */
  houses: ReachedHouse[];
  /**
   * Squares that make up the reach, for an overlay: billboard = squares orthogonally next to it;
   * mailbox = the flood-filled area; airplane = every square of the covered rows/columns; radio =
   * every square of the 3×3 tile block. Empty for module kinds (off-board reach).
   */
  area: Cell[];
}

/** Road range overlay for a card (or a pending coffee shop choice). */
export interface RangeOverlay {
  /** Road squares reachable within range (all reachable squares when the range is unlimited). */
  roads: { x: number; y: number; distance: number }[];
  /** Range starts used (open restaurant entrances and coffee shops, or the given `from`). */
  starts: RouteStart[];
  /** Borders allowed; null = unlimited (distances still reported). */
  range: number | null;
}

export interface HouseSeller {
  player: PlayerId;
  restaurantId: RestaurantId;
  unitPrice: number;
  distance: number;
  /** unitPrice + distance + module modifiers. */
  score: number;
  /** Lower tier wins regardless of score (Ketchup kimchi / sushi / noodles). */
  tier: number;
  waitresses: number;
  /** Has the whole order in stock now (inventory + freezer). */
  canSupply: boolean;
  /** What this offer would sell: tells Ketchup variants of one chain apart (kimchi, sushi, noodles). */
  items?: FoodCounts;
}

export interface HouseOutlook {
  houseId: HouseId;
  capacity: number | null;
  demand: number;
  /** Every connected chain, sorted as Dinnertime would rank them (eligible or not). */
  sellers: HouseSeller[];
  /** Who would win now: the best seller that can supply, or null (no demand / nobody can). */
  winner: PlayerId | null;
  /** Campaigns whose reach includes this house, in run order. */
  campaigns: CampaignId[];
}
