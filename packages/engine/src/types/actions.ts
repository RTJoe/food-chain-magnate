/**
 * Player actions (architecture §3.3). Every action carries `playerId`; the server overwrites it
 * from the seat. Actions describe intent only; the engine validates everything.
 *
 * Working phase: cards at work act in any order within a sub-step, sub-steps in strict order
 * (base.md §6.1). Taking an action of a later sub-step closes earlier ones. Mandatory cards
 * (pricing, waitress, CFO, ...) are applied by the engine, never by an action.
 */
import type { CampaignKind, Direction, DrinkId, EmployeeId, FoodId, Rotation } from './content.js';
import type {
  CampaignPlacement,
  Cell,
  ChoiceId,
  Corner,
  EntityId,
  FoodCounts,
  GameState,
  HouseId,
  PlayerId,
  ReserveCard,
  RestaurantId,
  Uid,
} from './state.js';
import type { GameEvent } from './events.js';

/** Restructuring submission: CEO is implicit; every card not listed goes to the beach (base.md §4). */
export interface StructureSubmission {
  ceoSubs: Uid[];
  managerSubs: Record<Uid, Uid[]>;
}

/**
 * Where a range/route starts: a restaurant entrance corner (any corner with drive-in) or a
 * coffee shop (ketchup.md §4: valid start for every range).
 */
export type RouteStart =
  | { kind: 'restaurant'; restaurantId: RestaurantId; corner: Corner }
  | { kind: 'coffeeShop'; entityId: EntityId };

/**
 * Drink buyer route (base.md §6.5).
 * - `errand`: errand boy picks the drink type.
 * - `road`: cart/truck. `path` = road squares in travel order starting at the road square next to
 *   the start. Must use full range if possible, no U-turns; collects every adjacent source once.
 * - `air`: zeppelin. `tiles` = tile grid coords flown over in order, starting with the start tile;
 *   orthogonal steps, no repeats.
 */
export type BuyerRoute =
  | { mode: 'errand'; drink: DrinkId }
  | { mode: 'road'; from: RouteStart; path: Cell[] }
  | { mode: 'air'; from: RouteStart; tiles: { row: number; col: number }[] };

/** Coffee shop placement after a barista training step (ketchup.md §4). `moveFrom` when all 3 are placed. */
export interface CoffeeShopPlacement {
  x: number;
  y: number;
  moveFrom?: EntityId;
}

interface A<T extends string> {
  type: T;
  playerId: PlayerId;
}

// --- Setup (base.md §2.6–2.7) ---------------------------------------------
export interface SetupPlaceRestaurant extends A<'setup.placeRestaurant'> {
  x: number;
  y: number;
  entrance: Corner;
}
export type SetupPass = A<'setup.pass'>;
/** Secret. Reserve Prices variant uses `kind: 'price'` cards. */
export interface SetupChooseReserve extends A<'setup.chooseReserve'> {
  card: ReserveCard;
}

// --- Restructuring (base.md §4) ---------------------------------------------
/** Secret until all have submitted. Overfill is legal and triggers the penalty (base.md §4.5). */
export interface RestructureSubmit extends A<'restructure.submit'> {
  structure: StructureSubmission;
}
export type RestructureRetract = A<'restructure.retract'>;

// --- Order of business (base.md §5) -----------------------------------------
/** `position` = 0-based index on the turn order track; must be free. */
export interface OrderChoosePosition extends A<'order.choosePosition'> {
  position: number;
}

// --- Working 9–5 (base.md §6) -----------------------------------------------
/** base.md §6.2. `cardUid` = CEO, recruiting girl/manager, HR director. */
export interface WorkRecruit extends A<'work.recruit'> {
  cardUid: Uid;
  employeeId: EmployeeId;
}
/**
 * base.md §6.3. One action spends one training use of `trainerUid` per step. `toEmployeeId` may be
 * several steps up (coach/guru, or stacking with first_pay_20). `path` disambiguates when more than
 * one career path reaches the target (fry chef). `coffeeShop` when training into barista / lead barista.
 */
export interface WorkTrain extends A<'work.train'> {
  trainerUid: Uid;
  targetUid: Uid;
  toEmployeeId: EmployeeId;
  path?: EmployeeId[];
  coffeeShop?: CoffeeShopPlacement;
}
/** base.md §6.5. `food` when the card offers a choice (kitchen trainee). All-or-nothing amount. */
export interface WorkProduce extends A<'work.produce'> {
  cardUid: Uid;
  food?: FoodId;
}
export interface WorkBuyDrinks extends A<'work.buyDrinks'> {
  cardUid: Uid;
  route: BuyerRoute;
}
/**
 * base.md §6.4; ketchup.md §12–13. `tileNumber` = chosen marketing tile (free choice).
 * `goods` has 2 entries only for the two-good airplane. `from` = range origin (road-range marketeers).
 */
export interface WorkPlaceCampaign extends A<'work.placeCampaign'> {
  cardUid: Uid;
  campaignKind: CampaignKind;
  tileNumber: number;
  goods: FoodId[];
  placement: CampaignPlacement;
  duration: number;
  from?: RouteStart;
}
/** base.md §6.6: new 2x2 house at (x,y) plus its 2x1 garden on side `gardenSide`. `houseOrder` picks the tile number. */
export interface WorkPlaceHouse extends A<'work.placeHouse'> {
  cardUid: Uid;
  houseOrder: number;
  x: number;
  y: number;
  gardenSide: Direction;
}
/** base.md §6.6: garden on side `side` of a printed house. */
export interface WorkPlaceGarden extends A<'work.placeGarden'> {
  cardUid: Uid;
  houseId: HouseId;
  side: Direction;
}
/** base.md §6.7 local (range 3, COMING SOON) or regional (anywhere, opens now). */
export interface WorkPlaceRestaurant extends A<'work.placeRestaurant'> {
  cardUid: Uid;
  x: number;
  y: number;
  entrance: Corner;
  from?: RouteStart;
}
/** base.md §6.7 regional manager move/rotate (same x,y = rotate in place). */
export interface WorkMoveRestaurant extends A<'work.moveRestaurant'> {
  cardUid: Uid;
  restaurantId: RestaurantId;
  x: number;
  y: number;
  entrance: Corner;
}
/** Explicitly decline an optional card action (UI convenience; ending the turn skips all). */
export interface WorkSkip extends A<'work.skip'> {
  cardUid: Uid;
}
export type WorkEndTurn = A<'work.endTurn'>;

// --- Payday (base.md §8) ----------------------------------------------------
/** Voluntary firing (turn order). Also used to resolve a `forcedFire` pending choice. */
export interface PaydayFire extends A<'payday.fire'> {
  uids: Uid[];
}
/** Done firing. `tokens` = salary paid in goods (ketchup First beer sold). */
export interface PaydayConfirm extends A<'payday.confirm'> {
  tokens?: FoodCounts;
}

// --- Clean up (base.md §10) -------------------------------------------------
export interface CleanupFreezer extends A<'cleanup.freezer'> {
  keep: FoodCounts;
}

// --- Generic pending choice --------------------------------------------------
/** Decline an optional `PendingChoice`. */
export interface ChoiceDecline extends A<'choice.decline'> {
  choiceId: ChoiceId;
}

// --- Ketchup module actions (`${moduleId}.${name}`) -------------------------
/** ketchup.md §2: lobbyist road tile (sub-step `lobbyists`). */
export interface LobbyistPlaceRoad extends A<'ketchup:lobbyists.placeRoad'> {
  cardUid: Uid;
  cells: Cell[];
  arrows: { from: Cell; dir: Direction }[];
  from: RouteStart;
}
/** ketchup.md §2: park tile. */
export interface LobbyistPlacePark extends A<'ketchup:lobbyists.placePark'> {
  cardUid: Uid;
  x: number;
  y: number;
  w: number;
  h: number;
  from: RouteStart;
}
/** ketchup.md §2 First lobbyist used: resolves an `extraMapTile` choice. Engine draws the tile. */
export interface LobbyistPlaceMapTile extends A<'ketchup:lobbyists.placeMapTile'> {
  choiceId: ChoiceId;
  row: number;
  col: number;
  rotation: Rotation;
}
/** ketchup.md §4: resolves a `coffeeShop` choice. */
export interface CoffeePlaceShop extends A<'ketchup:coffee.placeShop'> {
  choiceId: ChoiceId;
  x: number;
  y: number;
  moveFrom?: EntityId;
}
/** ketchup.md §12: resolves a `freeway` choice. */
export interface RuralPlaceFreeway extends A<'ketchup:ruralMarketeers.placeFreeway'> {
  choiceId: ChoiceId;
  side: Direction;
  offset: number;
}
/** ketchup.md §3 First pizza sold: resolves a `pizzaRadio` choice. */
export interface NewMilestonesPlacePizzaRadio extends A<'ketchup:newMilestones.placePizzaRadio'> {
  choiceId: ChoiceId;
  x: number;
  y: number;
}
/** ketchup.md §3 First new restaurant: resolves a `freeMailbox` choice. */
export interface NewMilestonesPlaceFreeMailbox extends A<'ketchup:newMilestones.placeFreeMailbox'> {
  choiceId: ChoiceId;
  x: number;
  y: number;
  good: FoodId;
}
/** ketchup.md §3 First campaign manager used: resolves a `secondCampaign` choice. */
export interface NewMilestonesPlaceSecondCampaign extends A<'ketchup:newMilestones.placeSecondCampaign'> {
  choiceId: ChoiceId;
  tileNumber: number;
  placement: CampaignPlacement;
}

export type KetchupAction =
  | LobbyistPlaceRoad
  | LobbyistPlacePark
  | LobbyistPlaceMapTile
  | CoffeePlaceShop
  | RuralPlaceFreeway
  | NewMilestonesPlacePizzaRadio
  | NewMilestonesPlaceFreeMailbox
  | NewMilestonesPlaceSecondCampaign;

export type BaseAction =
  | SetupPlaceRestaurant
  | SetupPass
  | SetupChooseReserve
  | RestructureSubmit
  | RestructureRetract
  | OrderChoosePosition
  | WorkRecruit
  | WorkTrain
  | WorkProduce
  | WorkBuyDrinks
  | WorkPlaceCampaign
  | WorkPlaceHouse
  | WorkPlaceGarden
  | WorkPlaceRestaurant
  | WorkMoveRestaurant
  | WorkSkip
  | WorkEndTurn
  | PaydayFire
  | PaydayConfirm
  | CleanupFreezer
  | ChoiceDecline;

export type Action = BaseAction | KetchupAction;
export type ActionType = Action['type'];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type RejectCode =
  | 'INVALID_PAYLOAD' // malformed action
  | 'UNKNOWN_ACTION' // type not handled (module disabled?)
  | 'MODULE_DISABLED'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_SUBMITTED'
  | 'NOT_OWNED' // card/restaurant not yours
  | 'CARD_UNAVAILABLE' // card used up, not at work, busy
  | 'SUPPLY_EMPTY'
  | 'UNIQUE_LIMIT' // 1x card already owned
  | 'ILLEGAL_PLACEMENT'
  | 'ILLEGAL_ROUTE'
  | 'ILLEGAL' // any other rules violation; message explains
  | 'GAME_OVER'
  | 'NOT_IMPLEMENTED';

export interface Ok {
  ok: true;
}

export interface Rejected {
  ok: false;
  code: RejectCode;
  message: string;
}

export interface Applied {
  ok: true;
  state: GameState;
  events: GameEvent[];
  /**
   * False when the action revealed hidden info, consumed randomness, or ended a decision window
   * (architecture §3.6).
   */
  undoable: boolean;
}
