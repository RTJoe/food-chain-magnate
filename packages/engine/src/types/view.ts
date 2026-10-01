/**
 * What a client sees (architecture §3.5) and UI guidance types shared by online and hot-seat
 * play: `GameView`, `Prompt`, `LegalAction`, `PlacementSpec`, `Placement`.
 */
import type { CampaignKind, Direction, Rotation, TileTemplateId } from './content.js';
import type { Action, ActionType, BuyerRoute, RouteStart } from './actions.js';
import type {
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
  | { kind: 'campaign'; campaignKind: CampaignKind; tileNumber: number; placement: CampaignPlacement; from?: RouteStart }
  | { kind: 'buyerRoute'; route: BuyerRoute; collects: { sourceId: SourceId; count: number }[] }
  | { kind: 'coffeeShop'; x: number; y: number; moveFrom?: string }
  | { kind: 'lobbyistRoad'; cells: Cell[]; arrows: { from: Cell; dir: Direction }[]; from: RouteStart }
  | { kind: 'park'; x: number; y: number; w: number; h: number; from: RouteStart }
  | { kind: 'freeway'; side: Direction; offset: number }
  | { kind: 'mapTile'; row: number; col: number; rotation: Rotation; templateId?: TileTemplateId }
  | { kind: 'pizzaRadio'; x: number; y: number }
  | { kind: 'freeMailbox'; x: number; y: number };

export type PlacementKind = Placement['kind'];

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
export type LegalAction =
  | { kind: 'ready'; label: string; action: Action }
  | { kind: 'placement'; label: string; actionType: ActionType; cardUid?: Uid; spec: PlacementSpec }
  | {
      kind: 'compose';
      label: string;
      actionType: 'setup.chooseReserve' | 'restructure.submit' | 'payday.fire' | 'payday.confirm' | 'cleanup.freezer' | 'work.train' | 'work.recruit' | 'work.produce';
      cardUid?: Uid;
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
