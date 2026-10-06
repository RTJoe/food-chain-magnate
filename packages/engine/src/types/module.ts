/**
 * Module / plugin system (architecture §3.7). The base game is itself a module. Ketchup modules
 * (docs/rules/ketchup.md) plug in through content bundles, action handlers and hooks.
 *
 * Hooks come in two shapes:
 * - lifecycle hooks (`onCreateGame`, `onPhaseEnter`, `onEvent`, ...) mutate `ctx.state` and may emit;
 * - pipeline hooks take a value and return a (possibly) modified value. The registry runs them in
 *   module order (dependencies first, then `config.modules` order), feeding each the previous output.
 */
import type {
  CampaignKind,
  EmployeeDef,
  EmployeeId,
  FoodDef,
  FoodId,
  MilestoneDef,
  MilestoneId,
  ModuleContent,
  ModuleId,
  TileDef,
  TileTemplateId,
} from './content.js';
import type { Action, Ok, Rejected, RouteStart } from './actions.js';
import type { GameEvent, SaleRoute } from './events.js';
import type {
  Campaign,
  CampaignPlacement,
  FoodCounts,
  GameState,
  House,
  HouseId,
  OwnedCard,
  Phase,
  PhaseKind,
  PlayerId,
  ReserveCard,
  RestaurantId,
  Uid,
  WorkStage,
} from './state.js';
import type { GameView, LegalAction, Placement, PlacementSpec, Viewer } from './view.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Typed options per module. Modules without options use `Record<string, never>`. */
export interface ModuleOptionsMap {
  base: Record<string, never>;
  /** ketchup.md §1: which of tiles U–Y join the pool (default all). */
  'ketchup:newDistricts': { tiles?: TileTemplateId[] };
  /**
   * ketchup.md §2. `includeTileZ`: add the two-park tile to the pool. `parallelRoadsConnect`:
   * `lobbyistOnly` (recommended) or `everywhere` (also base-map edge roads; Low-Medium confidence).
   */
  'ketchup:lobbyists': { includeTileZ?: boolean; parallelRoadsConnect?: 'lobbyistOnly' | 'everywhere' };
  'ketchup:newMilestones': Record<string, never>;
  'ketchup:coffee': Record<string, never>;
  'ketchup:kimchi': Record<string, never>;
  'ketchup:sushi': Record<string, never>;
  'ketchup:noodles': Record<string, never>;
  'ketchup:ketchup': Record<string, never>;
  'ketchup:fryChefs': Record<string, never>;
  'ketchup:massMarketeers': Record<string, never>;
  'ketchup:nightShift': Record<string, never>;
  'ketchup:ruralMarketeers': Record<string, never>;
  'ketchup:gourmetCritics': Record<string, never>;
  'ketchup:reservePrices': Record<string, never>;
  'ketchup:movieStars': Record<string, never>;
  'ketchup:hardChoices': Record<string, never>;
  'ketchup:sixPlayers': Record<string, never>;
  tutorial: TutorialOptions;
}

/** Phases the tutorial module can pause after (docs/tutorial-plan.md §4.2). */
export type TutorialPausePhase = 'restructuring' | 'orderOfBusiness' | 'working' | 'dinnertime' | 'payday' | 'marketing' | 'cleanup';

/** `config.options.tutorial`: who presses Continue, and after which phases the game pauses. */
export interface TutorialOptions {
  player: PlayerId;
  pauseAfter: TutorialPausePhase[];
}

export type ModuleOptions = { [K in ModuleId]?: ModuleOptionsMap[K] };

/** Declarative option schema for the lobby UI. */
export type OptionField =
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'enum'; label: string; values: { value: string; label: string }[]; default: string }
  | { type: 'multiselect'; label: string; values: { value: string; label: string }[]; default: string[] };

export type OptionSchema = Record<string, OptionField>;

// ---------------------------------------------------------------------------
// Hook context
// ---------------------------------------------------------------------------

/** Read-only indexes over all enabled content (base + modules, overrides applied). */
export interface ContentIndex {
  employees: Partial<Record<EmployeeId, EmployeeDef>>;
  milestones: Partial<Record<MilestoneId, MilestoneDef>>;
  foods: Partial<Record<FoodId, FoodDef>>;
  tiles: Partial<Record<TileTemplateId, TileDef>>;
}

/** Deterministic randomness bound to `state.rng` (only during createGame / setup hooks, architecture §3.8). */
export interface RngApi {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  shuffle<T>(items: T[]): T[];
}

export interface HookContext {
  /** Mutable working copy (the reducer cloned it). */
  state: GameState;
  content: ContentIndex;
  emit(event: GameEvent): void;
  rng: RngApi;
  isEnabled(module: ModuleId): boolean;
  /** Allocate a deterministic id (`${kind}-${n}`). */
  id(kind: string): string;
}

export type PipelineHook<T, Args> = (value: T, ctx: HookContext, args: Args) => T;

// ---------------------------------------------------------------------------
// Hook payload types
// ---------------------------------------------------------------------------

/** How many times a card at work can act this turn (night shift doubles salary-free cards, ketchup.md §11). */
export interface CardUses {
  uid: string;
  uses: number;
}

/** A chain competing for a house at Dinnertime (base.md §7; tiers for kimchi/sushi/noodles, ketchup.md §7). */
export interface DinnerCandidate {
  player: PlayerId;
  restaurantId: RestaurantId;
  distance: number;
  unitPrice: number;
  /** price + distance + modifiers (Ketchup −1 / −2). Lower wins. */
  score: number;
  /** Waitress count for ties (night shift doubles; movie stars beat all, ketchup.md §15). */
  waitresses: number;
  /** Movie star rank at work, if any (B=3, C=2, D=1, none=0). */
  movieStar: number;
  /** Lower tier wins regardless of score (ketchup.md §7 combined priority). Base = 0. */
  tier: number;
  /** Goods this candidate would sell (sushi/noodles substitute the whole order; kimchi +1). */
  items: FoodCounts;
}

export interface SaleBreakdown {
  player: PlayerId;
  houseId: HouseId;
  /** Price multiplier: 1, ×2 garden, ×2 park, ×3 garden + park (ketchup.md §2). */
  multiplier: number;
  lines: { good: FoodId; count: number; each: number }[];
  bonuses: { source: string; amount: number }[];
  total: number;
}

export interface SalaryBreakdown {
  player: PlayerId;
  /** Salaried cards and the per-card rate ($5; $3 with Ketchup First waitress used). */
  salaried: number;
  rate: number;
  discounts: { source: string; amount: number }[];
  total: number;
}

export interface Hooks {
  /** After base setup; modules add supply, milestones, map tiles, entities. May use rng. */
  onCreateGame(ctx: HookContext): void;
  onPhaseEnter(ctx: HookContext, phase: Phase): void;
  onPhaseExit(ctx: HookContext, phase: Phase): void;
  /**
   * An automatic phase finished and the next phase's automatic work has not started yet
   * (`runUntilInput`). A module may push a `PendingChoice` to hold the game here (tutorial pauses).
   */
  afterPhase(ctx: HookContext, finished: PhaseKind): void;
  /** Every emitted event; milestone triggers live here. */
  onEvent(ctx: HookContext, event: GameEvent): void;

  workingStages: PipelineHook<WorkStage[], { player: PlayerId }>;
  cardUses: PipelineHook<CardUses, { player: PlayerId; card: OwnedCard; def: EmployeeDef }>;
  unitPrice: PipelineHook<number, { player: PlayerId }>;
  /** null = no maximum (apartments, rural area). */
  demandCapacity: PipelineHook<number | null, { house: House }>;
  /** Tokens placed per marketing hit (apartments ×2, first_radio ×2). */
  demandAmount: PipelineHook<number, { house: House; campaign: Campaign | null }>;
  campaignReach: PipelineHook<HouseId[], { campaign: Campaign }>;
  marketingPasses: PipelineHook<number, Record<string, never>>;
  dinnerCandidates: PipelineHook<DinnerCandidate[], { house: House }>;
  saleRevenue: PipelineHook<SaleBreakdown, { house: House; candidate: DinnerCandidate }>;
  salaryTotal: PipelineHook<SalaryBreakdown, { player: PlayerId }>;
  /** Order-of-business choosing queue (movie stars first, ketchup.md §15). */
  orderQueue: PipelineHook<PlayerId[], Record<string, never>>;
  legalPlacements: PipelineHook<Placement[], { player: PlayerId; spec: PlacementSpec }>;
  /** Hide module-private info from a viewer. */
  redact: (view: GameView, args: { state: GameState; viewer: Viewer }) => GameView;

  // --- Added by C6 (Ketchup modules; architecture risk #2). All default to base behaviour. ---

  /** A validated action is about to be dispatched. Mutates `ctx.state` (e.g. record a module payload of a base action). */
  beforeAction(ctx: HookContext, action: Action): void;
  /** After a validated action was dispatched (before `runUntilInput`). Mutates `ctx.state`. */
  onAction(ctx: HookContext, action: Action): void;
  /** Extra rules for base actions: return a problem string to reject (`ILLEGAL`). Runs only when the base accepted. */
  actionProblem: PipelineHook<string | null, { action: Action }>;
  /** Legal actions for `player` (module pending choices, module card actions). Ready entries are re-validated. */
  legalActions: PipelineHook<LegalAction[], { player: PlayerId }>;
  /** Nearest connected OPEN restaurant of a chain for a house (rural area via freeways, ketchup.md §12). */
  houseDistance: PipelineHook<{ restaurantId: RestaurantId; distance: number } | null, { player: PlayerId; house: House }>;
  /** The delivery route a sale shows (animation): base = the restaurant's shortest road route; the rural area routes via a freeway. */
  saleRoute: PipelineHook<SaleRoute | null, { player: PlayerId; restaurantId: RestaurantId; house: House }>;
  /** Placement problem for a campaign (null = legal). Modules decide their own campaign kinds (giant billboard, gourmet guide). */
  campaignPlacementProblem: PipelineHook<
    string | null,
    { player: PlayerId; def: EmployeeDef; kind: CampaignKind; tileNumber: number; placement: CampaignPlacement; from?: RouteStart }
  >;
  /** How many goods a campaign may advertise (2 for the First-brand-manager airplane, ketchup.md §3). Base 1. */
  campaignGoods: PipelineHook<number, { player: PlayerId; def: EmployeeDef; kind: CampaignKind }>;
  /** Waitress tips after the houses (night shift doubles, ketchup.md §11). */
  tips: PipelineHook<{ waitresses: number; amount: number }, { player: PlayerId }>;
  /** Reserve cards offered at setup (Reserve Prices variant, ketchup.md §14). */
  reserveOptions: PipelineHook<ReserveCard[], Record<string, never>>;
  /** Freezer capacity this Clean up (First soda sold, ketchup.md §3). */
  freezerCapacity: PipelineHook<number, { player: PlayerId }>;
  /** Must a player who cannot pay salaries fire employees? (First trainer used: no, ketchup.md §3.) */
  forcedFiring: PipelineHook<boolean, { player: PlayerId }>;
  /** Does an owned card cost salary this Payday? (eternal-radio brand director keeps it, ketchup.md §3.) */
  cardSalaried: PipelineHook<boolean, { player: PlayerId; uid: Uid }>;
  /** May a card at work be trained (First lemonade sold, ketchup.md §3)? Base: only beach cards. */
  trainAtWork: PipelineHook<boolean, { player: PlayerId; uid: Uid; toEmployeeId: EmployeeId }>;
}

export interface ActionHandler<A extends Action = Action> {
  validate(state: GameState, action: A, ctx: Pick<HookContext, 'content' | 'isEnabled'>): Ok | Rejected;
  /** Mutates `ctx.state`. Returns whether the action is undoable (architecture §3.6). */
  apply(ctx: HookContext, action: A): { undoable: boolean };
}

export interface GameModule {
  id: ModuleId;
  name: string;
  description: string;
  requires?: ModuleId[];
  /** Cannot be combined (e.g. hardChoices with newMilestones). */
  conflicts?: ModuleId[];
  options?: OptionSchema;
  content?: ModuleContent;
  /** Keyed by action type (`ketchup:coffee.placeShop`). */
  actions?: Partial<Record<Action['type'], ActionHandler>>;
  hooks?: Partial<Hooks>;
  /** Engine-internal (the tutorial): hidden from `listModules`, so lobbies never offer it. */
  internal?: boolean;
}

/** Serializable description of a module for the client (rendered generically). */
export interface ModuleManifest {
  id: ModuleId;
  name: string;
  description: string;
  requires: ModuleId[];
  conflicts: ModuleId[];
  options: OptionSchema;
  content: ModuleContent;
}
