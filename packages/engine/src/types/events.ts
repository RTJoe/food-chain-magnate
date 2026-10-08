/**
 * Fine-grained events emitted by `applyAction` / `runUntilInput` for logs and animation
 * (architecture §3.4). Events never carry information the viewer may not see after
 * `redactEvents`: secret payloads are optional and stripped for other viewers.
 */
import type { CampaignKind, Direction, EmployeeId, FoodId, MilestoneId, Rotation, TileTemplateId } from './content.js';
import type { BuyerRoute, RouteStart } from './actions.js';
import type {
  Campaign,
  CampaignId,
  Cell,
  ChoiceId,
  Corner,
  DemandToken,
  EntityId,
  FoodCounts,
  HouseId,
  ModuleEntity,
  PendingChoiceKind,
  Phase,
  PhaseKind,
  PlayerId,
  ReserveCard,
  RestaurantId,
  SourceId,
  Structure,
  Uid,
  WorkStage,
} from './state.js';

interface E<T extends string> {
  type: T;
}

/**
 * The road a delivery took (animation): from the winning restaurant's entrance (`from`) along road
 * squares (`path`, the first one next to the start) to a road square next to the house. Its tile
 * borders (plus roadworks) equal the sale's `distance`. Ketchup rural area: `path` ends on the
 * freeway's road square and `exit` names the board edge the van leaves by.
 */
/**
 * Why a card left: chosen at Payday, could not pay salaries (DLX p29), First to Have $100's CFO
 * (DLX p34), the chain went bankrupt, or an empty-pile hire that could not be trained (DLX p16).
 */
export type FireReason = 'voluntary' | 'cannotPay' | 'milestone' | 'bankrupt' | 'untrained';

export interface SaleRoute {
  from: RouteStart;
  path: Cell[];
  exit?: { cell: Cell; side: Direction };
}

/** One line of a sale's income (base.md §7 "Selling"). */
export interface SaleLine {
  good: FoodId;
  count: number;
  /** Per-item amount after garden/park multiplier (unit price × multiplier). */
  each: number;
}

export interface SaleBonus {
  /** e.g. `first_burger_marketed`, `ketchup:fry_chef`. */
  source: string;
  amount: number;
}

/** A chain that competed for a house at Dinnertime, as ranked (base.md §7.5–7.7). */
export interface SaleCandidate {
  player: PlayerId;
  restaurantId: RestaurantId;
  unitPrice: number;
  distance: number;
  /** unitPrice + distance + module modifiers; lower wins (after `tier`). */
  score: number;
  tier: number;
  /** Could deliver the whole order. */
  canSupply: boolean;
  /** What this offer would sell (Ketchup variants: kimchi on top, sushi or noodles instead). */
  items?: FoodCounts;
}

export type GameEvent =
  // --- Flow ---------------------------------------------------------------
  | (E<'gameStarted'> & { players: PlayerId[]; turnOrder: PlayerId[] })
  | (E<'roundStarted'> & { round: number })
  | (E<'phaseChanged'> & { from: PhaseKind | null; to: Phase })
  | (E<'turnStarted'> & { player: PlayerId })
  | (E<'workStageChanged'> & { player: PlayerId; stage: WorkStage })
  | (E<'turnEnded'> & { player: PlayerId })
  | (E<'turnOrderSet'> & { turnOrder: PlayerId[] })
  | (E<'choicePending'> & { choiceId: ChoiceId; kind: PendingChoiceKind; player: PlayerId })
  | (E<'choiceResolved'> & { choiceId: ChoiceId; declined: boolean })
  // --- Setup --------------------------------------------------------------
  | (E<'setupPassed'> & { player: PlayerId })
  /** `card` only present for the owner (redacted otherwise). */
  | (E<'reserveChosen'> & { player: PlayerId; card?: ReserveCard })
  // --- Restructuring / order ----------------------------------------------
  /** Draft only for the owner. */
  | (E<'structureSubmitted'> & { player: PlayerId; structure?: Structure })
  | (E<'structureRetracted'> & { player: PlayerId })
  | (E<'structuresRevealed'> & { structures: Record<PlayerId, Structure> })
  /** base.md §4.5 overfill: everything but the CEO to the beach. */
  | (E<'structurePenalty'> & { player: PlayerId })
  | (E<'orderChosen'> & { player: PlayerId; position: number })
  // --- Employees ----------------------------------------------------------
  | (E<'employeeHired'> & { player: PlayerId; uid: Uid; employeeId: EmployeeId; by: Uid })
  /** Milestone rewards and other free cards. */
  | (E<'employeeGained'> & { player: PlayerId; uid: Uid; employeeId: EmployeeId; reason: string })
  | (E<'employeeTrained'> & { player: PlayerId; uid: Uid; from: EmployeeId; to: EmployeeId; by: Uid[]; steps: number; /** Cards passed through, ending with `to`. */ path?: EmployeeId[] })
  | (E<'employeeFired'> & { player: PlayerId; uid: Uid; employeeId: EmployeeId; forced: boolean; reason?: FireReason })
  | (E<'cardSkipped'> & { player: PlayerId; uid: Uid })
  | (E<'cardsReturned'> & { player: PlayerId })
  | (E<'marketeerReturned'> & { player: PlayerId; uid: Uid })
  // --- Goods --------------------------------------------------------------
  | (E<'foodProduced'> & { player: PlayerId; uid: Uid | null; food: FoodId; count: number })
  | (E<'drinksBought'> & {
      player: PlayerId;
      uid: Uid;
      /** Road squares of a road route (kept for logs); empty for errand / air / milestone hauls. */
      path: Cell[];
      collected: { sourceId: SourceId | null; drink: FoodId; count: number }[];
      /** The buyer's route as played (start, road path or air tiles). Absent on milestone hauls. */
      route?: BuyerRoute;
      /** Why drinks arrived without a buyer route (milestone id), e.g. Ketchup new milestones. */
      reason?: string;
    })
  | (E<'foodDiscarded'> & { player: PlayerId; goods: FoodCounts })
  | (E<'foodFrozen'> & { player: PlayerId; goods: FoodCounts })
  // --- Board --------------------------------------------------------------
  | (E<'restaurantPlaced'> & { player: PlayerId; restaurantId: RestaurantId; x: number; y: number; entrance: Corner; comingSoon: boolean })
  | (E<'restaurantMoved'> & { player: PlayerId; restaurantId: RestaurantId; x: number; y: number; entrance: Corner; from?: { x: number; y: number; entrance: Corner } })
  | (E<'restaurantOpened'> & { restaurantId: RestaurantId })
  /** base.md §6.3a: drive-in signs placed on these open restaurants (Working step 3c). */
  | (E<'driveInsOpened'> & { player: PlayerId; restaurantIds: RestaurantId[] })
  | (E<'houseBuilt'> & { player: PlayerId; houseId: HouseId; cells: Cell[]; garden: Cell[] })
  | (E<'gardenAdded'> & { player: PlayerId; houseId: HouseId; cells: Cell[] })
  | (E<'campaignPlaced'> & { player: PlayerId; campaign: Campaign })
  | (E<'entityPlaced'> & { player: PlayerId | null; entity: ModuleEntity })
  | (E<'entityRemoved'> & { entityId: EntityId; kind?: ModuleEntity['kind'] })
  | (E<'mapTileAdded'> & { player: PlayerId; templateId: TileTemplateId; row: number; col: number; rotation: Rotation })
  // --- Dinnertime (base.md §7) --------------------------------------------
  /** `candidates`: chains that can deliver. `offers`: every connected chain, ranked, with `canSupply`. */
  | (E<'houseConsidered'> & { houseId: HouseId; candidates: PlayerId[]; offers?: SaleCandidate[] })
  | (E<'houseStayedHome'> & { houseId: HouseId })
  | (E<'sale'> & {
      houseId: HouseId;
      player: PlayerId;
      restaurantId: RestaurantId;
      distance: number;
      unitPrice: number;
      lines: SaleLine[];
      bonuses: SaleBonus[];
      total: number;
      /** Every chain that could deliver, ranked best first (the winner is first). */
      candidates?: SaleCandidate[];
      /** The delivery's road route (animation). Absent when no road connects (module overrides). */
      route?: SaleRoute;
    })
  /** ketchup.md §4: coffee sold en route. */
  | (E<'coffeeSold'> & { houseId: HouseId; player: PlayerId; at: RestaurantId | EntityId; amount: number; /** Fry Chef part of `amount` (once per house per chain, KX p21). */ fryChefBonus?: number })
  | (E<'tipsPaid'> & { player: PlayerId; waitresses: number; amount: number })
  | (E<'cfoBonus'> & { player: PlayerId; amount: number })
  | (E<'bankBroke'> & { breakNo: 1 | 2; reserves?: Record<PlayerId, ReserveCard>; added: number; ceoSlots: number; basePrice: number })
  | (E<'iouIssued'> & { player: PlayerId; amount: number })
  | (E<'bankrupt'> & { player: PlayerId })
  // --- Payday (base.md §8) ------------------------------------------------
  | (E<'salaryPaid'> & { player: PlayerId; gross: number; discounts: number; paid: number; tokens?: FoodCounts })
  | (E<'bankBurned'> & { player: PlayerId; amount: number })
  // --- Marketing (base.md §9) ---------------------------------------------
  /** `reached`: houses in reach (run order); `full`: the reached houses that took no demand. */
  | (E<'campaignRan'> & { campaignId: CampaignId; pass: number; reached?: HouseId[]; full?: HouseId[] })
  | (E<'demandPlaced'> & { campaignId: CampaignId | null; houseId: HouseId; tokens: DemandToken[] })
  | (E<'marketingIncome'> & { player: PlayerId; campaignId: CampaignId; amount: number })
  | (E<'campaignTicked'> & { campaignId: CampaignId; remaining: number })
  | (E<'campaignExpired'> & { campaignId: CampaignId; kind: CampaignKind; marketeer: Uid | null })
  // --- Milestones ---------------------------------------------------------
  | (E<'milestoneClaimed'> & { player: PlayerId; milestoneId: MilestoneId })
  | (E<'milestonesRemoved'> & { milestoneIds: MilestoneId[] })
  // --- Money --------------------------------------------------------------
  | (E<'cashChanged'> & { player: PlayerId; delta: number; reason: string; bank: number })
  // --- End ----------------------------------------------------------------
  | (E<'gameEnded'> & { ranking: PlayerId[]; cash: Record<PlayerId, number>; /** Null when every chain went bankrupt (base.md §12). */ winner?: PlayerId | null });

export type GameEventType = GameEvent['type'];
export type EventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;
