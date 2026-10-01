/**
 * The complete game state. Plain JSON only: no Set/Map/class instances/undefined-as-meaning/
 * shared references. `structuredClone(state)` and `JSON.parse(JSON.stringify(state))` must
 * both round-trip it exactly. See docs/architecture.md §3.2.
 *
 * Coordinates: board squares are `{ x, y }` with x = column (left→right) and y = row
 * (top→bottom), origin at the top-left square. One square = 1 unit in 3D; a tile = 5x5 squares.
 */
import type {
  CampaignKind,
  Direction,
  DrinkId,
  EmployeeId,
  FoodId,
  MilestoneId,
  ModuleId,
  Rotation,
  TileTemplateId,
} from './content.js';
import type { ModuleOptions } from './module.js';

// ---------------------------------------------------------------------------
// Ids (all engine-allocated ids are `${kind}-${n}` from `state.nextId`, see core/ids.ts)
// ---------------------------------------------------------------------------

export type PlayerId = string;
/** Owned employee card instance id (`card-12`). */
export type Uid = string;
export type HouseId = string;
export type RestaurantId = string;
export type CampaignId = string;
export type SourceId = string;
export type EntityId = string;
export type TileId = string;
export type ChoiceId = string;

/** Board square. */
export interface Cell {
  x: number;
  y: number;
}

/** Corner square of a 2x2 restaurant that holds the entrance (base.md §2.6, §14). */
export type Corner = 'NW' | 'NE' | 'SE' | 'SW';

/** Partial counts of goods. Missing key = 0. */
export type FoodCounts = Partial<Record<FoodId, number>>;

/** Restaurant chains (base.md §1; Ketchup adds Siap Faji). Cosmetic only. */
export type ChainId =
  | 'fried_geese_donkey'
  | 'golden_duck_diner'
  | 'santa_maria_pizza'
  | 'xango_blues_bar'
  | 'gluttony_inc'
  | 'siap_faji';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PlayerSeatConfig {
  id: PlayerId;
  name: string;
  chain: ChainId;
  /** CSS hex colour (client theme supplies defaults). */
  color: string;
}

export type MapConfig =
  /** Base rules: draw tiles at random, random rotation (base.md §2.2). */
  | { kind: 'random' }
  /** Fixed layout (tests, scenarios). `layout[row][col]`. */
  | { kind: 'fixed'; layout: { templateId: TileTemplateId; rotation: Rotation }[][] };

export interface GameConfig {
  /** 2–5 base, 2–6 with `ketchup:sixPlayers` (base.md §2.1, ketchup.md §17). Order = seat order. */
  players: PlayerSeatConfig[];
  /** Enabled modules; `base` is implied. */
  modules: ModuleId[];
  options: ModuleOptions;
  /** Intro game (base.md §13): no reserve cards, $75/player bank, no salaries, ends at first break. */
  intro: boolean;
  /** Intro game with milestones ("recommended second game", base.md §13). Ignored unless `intro`. */
  introMilestones: boolean;
  map: MapConfig;
}

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/** xoshiro128** state: four uint32 words. Never all zero. See core/rng.ts. */
export type RngState = [number, number, number, number];

// ---------------------------------------------------------------------------
// Phases (architecture §3.4; base.md §3)
// ---------------------------------------------------------------------------

/**
 * Working-phase sub-steps in strict order (base.md §6.1). `lobbyists` sits between houses and
 * restaurants (ketchup.md §2). Modules may change the list via the `workingStages` hook.
 */
export type WorkStage = 'recruit' | 'train' | 'marketing' | 'food' | 'houses' | 'lobbyists' | 'restaurants';

export type Phase =
  /**
   * base.md §2.6: round 1 in reverse turn order (place or pass); round 2 in turn order for
   * those who passed (must place). `order` is the players for the current round.
   */
  | { kind: 'setup.restaurants'; round: 1 | 2; order: PlayerId[]; idx: number; placed: PlayerId[]; passed: PlayerId[] }
  /** base.md §2.7: simultaneous secret reserve card choice (skipped in the intro game). */
  | { kind: 'setup.reserve' }
  /** base.md §4: simultaneous secret structure submission; revealed when the last one submits. */
  | { kind: 'restructuring' }
  /**
   * base.md §5: `queue` is the choosing order (most open slots first, ties by previous order;
   * movie stars first with ketchup.md §15). `picks` maps player → chosen track index (0-based).
   */
  | { kind: 'orderOfBusiness'; queue: PlayerId[]; picks: Partial<Record<PlayerId, number>> }
  /** base.md §6: `idx` into `turnOrder`; the active player's sub-state is `GameState.turn`. */
  | { kind: 'working'; player: PlayerId; idx: number }
  /**
   * base.md §7: houses in ascending `order`, rural area last (ketchup.md §12). `idx` into
   * `houses`. After the houses: tips, CFO, $100 check. No player input except pending choices.
   */
  | { kind: 'dinnertime'; houses: HouseId[]; idx: number }
  /** base.md §8: firing in turn order (`queue`), then salaries. */
  | { kind: 'payday'; queue: PlayerId[]; idx: number }
  /**
   * base.md §9: campaigns run in ascending number, `passes` times (1 + mass marketeers at work,
   * ketchup.md §10). Duration tokens removed only after the last pass.
   */
  | { kind: 'marketing'; pass: number; passes: number; order: CampaignId[]; idx: number }
  /** base.md §10: freezer decisions are simultaneous for players that have a freezer. */
  | { kind: 'cleanup' }
  /** base.md §12: most cash wins; ties to earlier turn order. `ranking[0]` is the winner. */
  | { kind: 'gameOver'; ranking: PlayerId[]; reason: 'bankBroke' | 'allBankrupt' };

export type PhaseKind = Phase['kind'];

/** Who the engine is waiting on, and for what. */
export type AwaitKind =
  | 'setup.restaurant'
  | 'setup.reserve'
  | 'restructure'
  | 'order'
  | 'work'
  | 'payday.fire'
  | 'cleanup.freezer'
  /** A `PendingChoice` is at the head of `state.pending`. */
  | 'choice'
  | 'none';

// ---------------------------------------------------------------------------
// Pending out-of-band choices (milestone rewards, forced firing, ...)
// ---------------------------------------------------------------------------

/**
 * Decisions that interrupt the normal flow. `state.pending` is a FIFO; while non-empty the engine
 * awaits the head's player. Resolved by the matching action or `choice.decline` (if optional).
 */
export type PendingChoice =
  /** base.md §8.4: cannot pay salaries → fire salaried cards until payable. */
  | { id: ChoiceId; kind: 'forcedFire'; player: PlayerId; owed: number; optional: false }
  /** ketchup.md §3 First beer sold: pay part/all of salaries with tokens. */
  | { id: ChoiceId; kind: 'payWithTokens'; player: PlayerId; owed: number; optional: true }
  /** ketchup.md §3 First pizza sold: seller must place a 2-turn pizza radio on the house's tile if possible. */
  | { id: ChoiceId; kind: 'pizzaRadio'; player: PlayerId; houseId: HouseId; optional: false }
  /** ketchup.md §3 First new restaurant: free eternal mailbox in that restaurant's block. */
  | { id: ChoiceId; kind: 'freeMailbox'; player: PlayerId; restaurantId: RestaurantId; optional: false }
  /** ketchup.md §3 First campaign manager used: optional second tile, same type/good/duration. */
  | { id: ChoiceId; kind: 'secondCampaign'; player: PlayerId; campaignId: CampaignId; optional: true }
  /** ketchup.md §2 First lobbyist used: place one leftover map tile (turn order if several). */
  | { id: ChoiceId; kind: 'extraMapTile'; player: PlayerId; optional: false }
  /** ketchup.md §12 First rural marketeer used: optional freeway. */
  | { id: ChoiceId; kind: 'freeway'; player: PlayerId; optional: true }
  /** ketchup.md §4: coffee shop placement after training a barista, or First coffee sold in Clean up. */
  | { id: ChoiceId; kind: 'coffeeShop'; player: PlayerId; source: 'training' | 'milestone'; optional: false };

export type PendingChoiceKind = PendingChoice['kind'];

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface OwnedCard {
  uid: Uid;
  employeeId: EmployeeId;
  acquiredRound: number;
  /** Never pays salary (Ketchup reward Executive VP, ketchup.md §3 First recruiting girl used). */
  salaryFree?: boolean;
}

/**
 * Company structure (base.md §4.4). CEO on top with `ceoSubs` (≤ CEO slots); managers in CEO
 * slots hold non-managers in `managerSubs[managerUid]`. Max 3 levels.
 */
export interface Structure {
  ceo: Uid;
  ceoSubs: Uid[];
  managerSubs: Record<Uid, Uid[]>;
}

/** Reserve cards (base.md §2.7; ketchup.md §14 Reserve Prices variant). */
export type ReserveCard =
  | { kind: 'standard'; amount: 100 | 200 | 300; ceoSlots: 2 | 3 | 4 }
  | { kind: 'price'; amount: 200; basePrice: 5 | 10 | 20 };

export interface EarnedMilestone {
  round: number;
  phase: PhaseKind;
}

/**
 * Card locations: every owned card is exactly one of: in `structure` (at work), in `beach`,
 * a key of `busy` (marketeer on a campaign), or in hand (none of these; only during
 * Restructuring, when every non-busy card is in hand).
 */
export interface PlayerState {
  id: PlayerId;
  name: string;
  chain: ChainId;
  color: string;
  cash: number;
  employees: Record<Uid, OwnedCard>;
  structure: Structure;
  beach: Uid[];
  /** Busy marketeers → their campaign(s). Night-shift marketing trainee may have two (ketchup.md §11). */
  busy: Record<Uid, CampaignId[]>;
  inventory: FoodCounts;
  /** Tokens kept from the previous Clean up (base.md §10). Merged into inventory at round start. */
  freezer: FoodCounts;
  milestones: Partial<Record<MilestoneId, EarnedMilestone>>;
  /** Restaurants not yet on the board (3 at start). */
  restaurantsRemaining: number;
  /** Revealed reserve card (after the first bank break). The choice itself is in `secrets`. */
  reserveCard: ReserveCard | null;
  /** Unused recruit actions on recruiting managers / HR directors this turn ($5 each, base.md §8.3). */
  unusedRecruitActions: number;
  /** Cash earned this round in Dinnertime (incl. tips), for CFO and logs. */
  earningsThisRound: number;
  /** Salary actually paid last Payday (first_pay_20). */
  salaryPaidThisRound: number;
  /** Bankrupt chains are out at the end of the turn (base.md §12). */
  bankrupt: boolean;
}

/** Hidden per-player information (architecture §3.5). */
export interface PlayerSecrets {
  reserve: ReserveCard | null;
  /** Submitted but not yet revealed structure (Restructuring). */
  structureDraft: Structure | null;
}

// ---------------------------------------------------------------------------
// Working-phase turn state
// ---------------------------------------------------------------------------

export interface TrainingRecord {
  /** Cards (trainer/coach/guru uids) whose actions were spent on this target. */
  by: Uid[];
  steps: number;
}

/**
 * Sub-state of the active player during Working (base.md §6). Also the undo checkpoint
 * boundary (architecture §3.6).
 */
export interface TurnState {
  player: PlayerId;
  /** Current sub-step; only moves forward (base.md §6.1). */
  stage: WorkStage;
  /** Remaining uses per card at work (multi-action cards, night shift doubling). 0 = spent. */
  uses: Record<Uid, number>;
  /** Uids hired this turn (CEO hire counts, first_hire_3). */
  hired: Uid[];
  /** Hired from an empty pile: must be trained to a higher level this turn (base.md §6.2). */
  mustTrain: Uid[];
  /** Training applied this turn per target uid (base.md §6.3 stacking limits). */
  trained: Record<Uid, TrainingRecord>;
  /** Campaigns placed this turn (eternal timing, milestones). */
  campaignsPlaced: CampaignId[];
  /** Cards that performed a printed function this turn (Ketchup "used", ketchup.md §3). */
  used: Uid[];
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type CellKind =
  | 'empty'
  | 'road'
  | 'house'
  | 'garden'
  | 'apartment'
  | 'drink'
  | 'restaurant'
  | 'campaign'
  | 'coffeeShop'
  | 'park';

export interface RoadCell {
  /** Orthogonal neighbours this road square connects to (in-tile adjacency + edge-midpoint crossings). */
  links: Direction[];
  /** Overpass square: straight through only (map.md §2). */
  bridge: boolean;
  /** Lobbyist road still under construction: unusable (ketchup.md §2). */
  underConstruction: boolean;
  /** Roadworks markers on this square: +1 dinnertime distance each. */
  roadworks: number;
  /** Lobbyist road entity this square belongs to, if any. */
  lobbyistRoad: EntityId | null;
}

export interface BoardCell {
  kind: CellKind;
  /** Placed tile this square belongs to. */
  tile: TileId;
  /** Id of the house/restaurant/campaign/source/entity occupying the square. */
  occupant: string | null;
  road: RoadCell | null;
}

export interface PlacedTile {
  id: TileId;
  /** Grid position in tiles. */
  row: number;
  col: number;
  templateId: TileTemplateId;
  rotation: Rotation;
}

/**
 * A demand token. `by`/`campaign` record who created it (Ketchup milestone §8, First marketeer
 * used $5/token). Null for non-marketeer demand (pizza radio, free mailbox).
 */
export interface DemandToken {
  good: FoodId;
  by: PlayerId | null;
  campaign: CampaignId | null;
}

/**
 * Anything that buys at Dinnertime.
 * - `printed`: house printed on a map tile (may have a printed garden: tile W).
 * - `placed`: new business developer house; always has a garden (map.md §5).
 * - `apartment`: Ketchup π / 9¾ — 2 tokens per demand, no cap, no garden (ketchup.md §1).
 * - `rural`: Ketchup rural area — off-board, eats last, no cap, reached via freeways (§12).
 * Demand caps are derived (3 / 5 with garden / none), not stored.
 */
export interface House {
  id: HouseId;
  kind: 'printed' | 'placed' | 'apartment' | 'rural';
  /** Dinnertime order key (π = 3.14, 9¾ = 9.75; rural = 1000). */
  order: number;
  label: string;
  /** House squares. Empty for the rural area. */
  cells: Cell[];
  garden: { cells: Cell[]; source: 'printed' | 'gardenTile' | 'withHouse' } | null;
  demand: DemandToken[];
}

export type RestaurantStatus = 'comingSoon' | 'open' | 'derelict';

export interface Restaurant {
  id: RestaurantId;
  owner: PlayerId;
  /** Top-left square of the 2x2 footprint. */
  x: number;
  y: number;
  entrance: Corner;
  /** COMING SOON from a local manager; opens in Clean up (base.md §6.7). Derelict after bankruptcy. */
  status: RestaurantStatus;
  placedRound: number;
}

/**
 * Where a campaign tile sits.
 * - `board`: billboard, mailbox, radio, pizza radio, free mailbox — a w x h rectangle of squares.
 * - `airplane`: beside board edge `side`, covering `width` rows (E/W) or columns (N/S) starting at
 *   `offset` (base.md §6.4).
 * - `rural`: giant billboard on one side of the rural area (ketchup.md §12).
 * - `offBoard`: gourmet guide (ketchup.md §13).
 */
export type CampaignPlacement =
  | { kind: 'board'; x: number; y: number; w: number; h: number }
  | { kind: 'airplane'; side: Direction; offset: number; width: 1 | 3 | 5 }
  | { kind: 'rural'; side: Direction }
  | { kind: 'offBoard' };

export interface Campaign {
  id: CampaignId;
  owner: PlayerId;
  /** Marketing tile number; run order (base.md §9). */
  number: number;
  kind: CampaignKind;
  /** Advertised good(s). Two entries only for the Ketchup two-good airplane (A then B). */
  goods: FoodId[];
  placement: CampaignPlacement;
  /** Duration tokens left. Eternal campaigns keep 1 forever. */
  remaining: number;
  eternal: boolean;
  /** Busy marketeer; null for pizza radios and the free mailbox. */
  marketeer: Uid | null;
  source: 'marketeer' | 'pizzaRadio' | 'freeMailbox';
  /** Campaign-manager second tile: both linked; marketeer returns when both are gone. */
  linked: CampaignId[];
  placedRound: number;
}

export interface DrinkSource {
  id: SourceId;
  x: number;
  y: number;
  drink: DrinkId;
  tile: TileId;
}

/** Module-owned board pieces (Ketchup). The client renders unknown kinds generically. */
export type ModuleEntity =
  /** ketchup.md §4: 1x1, entrances on all sides, max 1 per tile. */
  | { kind: 'coffeeShop'; id: EntityId; owner: PlayerId; x: number; y: number }
  /** ketchup.md §2 park tile or tile Z printed park. */
  | { kind: 'park'; id: EntityId; x: number; y: number; w: number; h: number; printed: boolean }
  /** ketchup.md §2 lobbyist road tile; arrows mark the connection ends. */
  | {
      kind: 'lobbyistRoad';
      id: EntityId;
      owner: PlayerId;
      cells: Cell[];
      underConstruction: boolean;
      arrows: { from: Cell; dir: Direction }[];
    }
  /** ketchup.md §2 roadworks marker; removed in Clean up. */
  | { kind: 'roadworks'; id: EntityId; x: number; y: number; road: EntityId }
  /** ketchup.md §12 freeway beside an outer tile edge, touching a road on that tile. */
  | { kind: 'freeway'; id: EntityId; owner: PlayerId; side: Direction; offset: number; tile: TileId };

export type ModuleEntityKind = ModuleEntity['kind'];

export interface Board {
  /** Size in tiles. */
  rows: number;
  cols: number;
  /** Size in squares (= cols*5, rows*5). The Ketchup extra map tile may grow the board; the engine re-bases coordinates so (0,0) stays top-left. */
  w: number;
  h: number;
  tileSize: 5;
  tiles: PlacedTile[];
  /** Derived occupancy index `cells[y][x]`; rebuilt by the engine after every board change. */
  cells: BoardCell[][];
  houses: Record<HouseId, House>;
  restaurants: Record<RestaurantId, Restaurant>;
  campaigns: Record<CampaignId, Campaign>;
  drinkSources: Record<SourceId, DrinkSource>;
  entities: Record<EntityId, ModuleEntity>;
}

// ---------------------------------------------------------------------------
// Global
// ---------------------------------------------------------------------------

export interface MilestoneSupply {
  /** Every player who earned it (same-turn sharing, milestones.md rule 2). */
  claimedBy: PlayerId[];
  /** Round of the first claim. */
  claimedRound: number | null;
  /** Removed in Clean up after the claim round, or by hard choices / New Milestones markers. */
  removed: boolean;
  /** Remove at Clean up of this round if unclaimed (ketchup.md §3, §16). */
  removeAfterRound: number | null;
}

export interface Bank {
  cash: number;
  breaks: 0 | 1 | 2;
  /** Reserve cards revealed and added (first break). */
  reserveOpened: boolean;
  /** Unpaid income after the second break (base.md §12). */
  ious: Record<PlayerId, number>;
  /** Money removed from the game (Ketchup First discount manager used). */
  burned: number;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  seed: number;
  rng: RngState;
  /** Next id counter (core/ids.ts). */
  nextId: number;
  /** 1-based turn number. 0 during setup. */
  round: number;
  phase: Phase;
  awaiting: { kind: AwaitKind; players: PlayerId[] };
  turnOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  board: Board;
  /** Employee piles. Missing key = not in this game. */
  supply: Partial<Record<EmployeeId, number>>;
  /** Milestones in play. Missing key = not in this game. */
  milestones: Partial<Record<MilestoneId, MilestoneSupply>>;
  bank: Bank;
  /** CEO slots for all players (3; changes at first bank break, base.md §12). */
  ceoSlots: number;
  /** Base unit price ($10; Reserve Prices may change it, ketchup.md §14). */
  basePrice: number;
  /** Remaining placeable house tiles by order number (map.md §5). */
  houseTiles: number[];
  /** Remaining garden tiles (8 in base). */
  gardenTiles: number;
  /** Marketing tile numbers not on the board and not removed. */
  marketingTiles: number[];
  /** Leftover shuffled map tiles (Ketchup lobbyist extra tile, ketchup.md §2). */
  tilePool: TileTemplateId[];
  secrets: Record<PlayerId, PlayerSecrets>;
  /** Out-of-band decisions queue (head is active). */
  pending: PendingChoice[];
  /** Per-module private state. Keys are module ids. */
  moduleState: Partial<Record<ModuleId, unknown>>;
  /** Working-phase sub-state; null outside Working. */
  turn: TurnState | null;
  /** `seq` = number of actions applied. */
  history: { seq: number };
}
