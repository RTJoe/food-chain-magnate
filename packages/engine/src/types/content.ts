/**
 * Static content definitions: employees, milestones, foods, map tiles, marketing tiles,
 * module ids. Pure data types, no logic. Tables are filled in `content/*.ts` and
 * `map/tiles.ts` (base) and `modules/ketchup/*` (expansion).
 *
 * Id conventions:
 * - Base employee and milestone ids are bare snake_case (`waitress`, `first_billboard`).
 * - Ketchup employee and milestone ids are prefixed `ketchup:` (`ketchup:fry_chef`,
 *   `ketchup:first_burger_sold`). New Milestones reuse some base names, so the prefix is required.
 * - Food ids are one closed global set and are never prefixed (`coffee`, not `ketchup:coffee`).
 * - Ketchup "replacement" base cards (Any-Cook kitchen trainee, Fry-Chef cooks, expansion
 *   marketing trainee, Movie-Star waitress) keep the base id; a module changes them through
 *   {@link ModuleContent.employeeOverrides}. See docs/rules/ketchup.md §0.
 */

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/**
 * Every module the engine knows. `base` is always on. Ketchup modules map 1:1 to the
 * sections of docs/rules/ketchup.md.
 */
export type ModuleId =
  | 'base'
  | 'ketchup:newDistricts' // ketchup.md §1 — tiles U–Y, apartments
  | 'ketchup:lobbyists' // §2 — road/park tiles, tile Z, extra map tile milestone
  | 'ketchup:newMilestones' // §3 — replaces all base milestones
  | 'ketchup:coffee' // §4 — baristas, coffee shops
  | 'ketchup:kimchi' // §5
  | 'ketchup:sushi' // §6
  | 'ketchup:noodles' // §7
  | 'ketchup:ketchup' // §8 — "someone sells your demand" milestone
  | 'ketchup:fryChefs' // §9
  | 'ketchup:massMarketeers' // §10
  | 'ketchup:nightShift' // §11
  | 'ketchup:ruralMarketeers' // §12 — rural area, giant billboards, freeways
  | 'ketchup:gourmetCritics' // §13
  | 'ketchup:reservePrices' // §14
  | 'ketchup:movieStars' // §15
  | 'ketchup:hardChoices' // §16 — base milestones only
  | 'ketchup:sixPlayers'; // §17 — requires newDistricts

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

/** Base foods/drinks (base.md §1) plus Ketchup goods (ketchup.md §4–7). */
export type FoodId =
  | 'burger'
  | 'pizza'
  | 'beer'
  | 'lemonade'
  | 'soft_drink'
  | 'coffee'
  | 'kimchi'
  | 'sushi'
  | 'noodles';

export type DrinkId = 'beer' | 'lemonade' | 'soft_drink';

/**
 * - `food`: burger, pizza, and (for milestone purposes) sushi and noodles.
 * - `drink`: the three drink types. Coffee is NOT a drink (ketchup.md §4).
 * - `coffee`: sold en route only; never marketed; never frozen.
 * - `kimchi`: side item; at most one per house (ketchup.md §5).
 */
export type FoodCategory = 'food' | 'drink' | 'coffee' | 'kimchi';

export interface FoodDef {
  id: FoodId;
  name: string;
  module: ModuleId;
  category: FoodCategory;
  /** Can be the good of a campaign. False for coffee, kimchi, sushi, noodles. */
  marketable: boolean;
  /**
   * Freezer rule (base.md §10, ketchup.md §3 coke milestone, §5).
   * `exclusive` = kimchi: if any kimchi is frozen nothing else may be.
   */
  freezer: 'yes' | 'no' | 'exclusive';
  /** Counts as "food" for milestone triggers (burger, pizza, sushi, noodles). */
  countsAsFood: boolean;
  /** Can be produced by a cook (vs bought from a drink source). */
  produced: boolean;
  /** Can be used to pay salaries with "First beer sold" (all but coffee). ketchup.md §3. */
  payableAsSalary: boolean;
}

// ---------------------------------------------------------------------------
// Employees (docs/rules/employees.md)
// ---------------------------------------------------------------------------

export type BaseEmployeeId =
  | 'ceo'
  | 'waitress'
  | 'management_trainee'
  | 'junior_vp'
  | 'vice_president'
  | 'senior_vp'
  | 'executive_vp'
  | 'new_business_developer'
  | 'luxuries_manager'
  | 'pricing_manager'
  | 'discount_manager'
  | 'local_manager'
  | 'regional_manager'
  | 'cfo'
  | 'recruiting_girl'
  | 'recruiting_manager'
  | 'hr_director'
  | 'trainer'
  | 'coach'
  | 'guru'
  | 'errand_boy'
  | 'cart_operator'
  | 'truck_driver'
  | 'zeppelin_pilot'
  | 'marketing_trainee'
  | 'campaign_manager'
  | 'brand_manager'
  | 'brand_director'
  | 'kitchen_trainee'
  | 'burger_cook'
  | 'burger_chef'
  | 'pizza_cook'
  | 'pizza_chef';

/** employees.md §2. Replacement cards (alt kitchen trainee etc.) are overrides, not new ids. */
export type KetchupEmployeeId =
  | 'ketchup:fry_chef'
  | 'ketchup:kimchi_master'
  | 'ketchup:sushi_cook'
  | 'ketchup:sushi_chef'
  | 'ketchup:noodle_cook'
  | 'ketchup:noodle_chef'
  | 'ketchup:barista_trainee'
  | 'ketchup:barista'
  | 'ketchup:lead_barista'
  | 'ketchup:lobbyist'
  | 'ketchup:mass_marketeer'
  | 'ketchup:rural_marketeer'
  | 'ketchup:gourmet_food_critic'
  | 'ketchup:night_shift_manager'
  | 'ketchup:b_movie_star'
  | 'ketchup:c_movie_star'
  | 'ketchup:d_movie_star';

export type EmployeeId = BaseEmployeeId | KetchupEmployeeId;

/** Card colour groups (employees.md "Card colour groups"); needed for "First lemonade sold". */
export type CardColour =
  | 'black' // managers
  | 'purple' // waitress, new business developer, CFO (+ movie stars)
  | 'red' // local / regional manager
  | 'salmon' // pricing, luxuries, discount managers
  | 'grey' // recruiting + training cards
  | 'lightGreen' // drink buyers
  | 'blue' // marketeers
  | 'oliveGreen' // kitchen (+ fry chef, kimchi master, sushi/noodle cooks)
  | 'teal' // coffee cards (baristas etc.): their own colour group (employees.md §2)
  | 'ceo';

/** Functional grouping used by UI and rules code. One per card. */
export type EmployeeCategory =
  | 'ceo'
  | 'manager' // has slots (incl. night shift manager with 0 slots)
  | 'recruiting'
  | 'training'
  | 'marketing'
  | 'kitchen'
  | 'coffee'
  | 'buyer'
  | 'pricing'
  | 'restaurant' // local / regional manager
  | 'housing' // new business developer
  | 'service' // waitress, movie stars
  | 'finance' // CFO
  | 'lobbying';

/** Campaign kinds, incl. Ketchup giant billboards (§12) and gourmet guides (§13). */
export type CampaignKind = 'billboard' | 'mailbox' | 'airplane' | 'radio' | 'giantBillboard' | 'gourmetGuide';

/** `unlimited` = no road connection required (brand manager/director, regional manager). */
export type Range = number | 'unlimited';

/**
 * What a card does when its action is taken (or passively while at work).
 * One entry per card; multi-function cards (CEO) have `kind: 'ceo'`.
 * Effect magnitudes here are the printed values; milestone modifiers are applied by rules code.
 */
export type EmployeeAbility =
  /** base.md §4, §6.2: 3 slots (bank-break / milestone may change), 1 free hire. */
  | { kind: 'ceo'; slots: number; recruits: 1 }
  /** Manager with N slots holding non-managers only (base.md §4.4). Night shift manager: 0 slots. */
  | { kind: 'manager'; slots: number }
  /** base.md §6.2. `salaryDiscountPerUnused` only on recruiting manager / HR director ($5). */
  | { kind: 'recruit'; actions: number; salaryDiscountPerUnused: number }
  /** base.md §6.3. `maxStepsSameCard`: trainer 1, coach 2, guru 3. */
  | { kind: 'train'; actions: number; maxStepsSameCard: number }
  /**
   * base.md §6.5 / ketchup.md §4–7. `foods` with more than one entry = player chooses one
   * (kitchen trainee: burger or pizza). `timing: 'cleanup'` = kimchi master (ketchup.md §5).
   */
  | { kind: 'produce'; foods: FoodId[]; amount: number; timing: 'working' | 'cleanup' }
  /**
   * base.md §6.5. `errand`: 1 drink of any type, no route. `road`: cart/truck (no U-turns,
   * full range). `air`: zeppelin, tile-to-tile ignoring roads.
   */
  | { kind: 'buyDrinks'; mode: 'errand' | 'road' | 'air'; range: number; perSource: number }
  /** base.md §6.4 table; ketchup.md §12–13 for giant billboard / gourmet guide. */
  | { kind: 'marketing'; campaigns: CampaignKind[]; range: Range; maxDuration: number; alwaysEternal?: boolean }
  /** ketchup.md §10: no tile; adds one extra marketing pass per card at work. */
  | { kind: 'massMarketing' }
  /** base.md §7.5 unit price modifier: pricing −1, discount −3, luxuries +10 (mandatory). */
  | { kind: 'price'; delta: number }
  /** base.md §7: $3 per waitress at work after dinnertime; tie-break by count. */
  | { kind: 'waitress'; tip: number }
  /** base.md §7: +50% of cash earned this turn, rounded up. */
  | { kind: 'cfo'; percent: number }
  /** base.md §6.6: place a house (with garden) or add a garden. */
  | { kind: 'newBusiness' }
  /** base.md §6.7. Both give drive-in while at work. */
  | { kind: 'restaurant'; mode: 'local' | 'regional'; range: Range; driveIn: true }
  /** ketchup.md §2: place one road or park tile, road range 2. */
  | { kind: 'lobbyist'; range: number }
  /** ketchup.md §9: +$10 per house sold to, per fry chef at work. */
  | { kind: 'fryChef'; bonusPerSale: number }
  /** ketchup.md §11: salary-free cards in the structure act twice. */
  | { kind: 'nightShift' }
  /** ketchup.md §15: order-of-business priority and tie-break, B > C > D. */
  | { kind: 'movieStar'; rank: 'B' | 'C' | 'D' };

export interface EmployeeDef {
  id: EmployeeId;
  name: string;
  module: ModuleId;
  /** Copies in the box (employees.md "Count"). For `unique` cards, copies in play depend on player count. */
  count: number;
  /** Play-triangle icon: may be recruited directly. */
  entry: boolean;
  /** Money icon: costs salary at Payday. */
  salary: boolean;
  /** "1x" card: a player may own at most one; supply = 1 (2–3p), 2 (4p), 3 (5–6p). */
  unique: boolean;
  /**
   * Cards sharing a group count as one 1x type (movie stars: `'movieStar'`, employees.md §2 footnote).
   * Defaults to the card's own id.
   */
  uniqueGroup?: string;
  colour: CardColour;
  category: EmployeeCategory;
  ability: EmployeeAbility;
  /** Mandatory cards act automatically (base.md §6.0): pricing/discount/luxuries, CFO, waitress. */
  mandatory: boolean;
  /** Direct career steps (one training action each). Empty = cannot be trained. */
  trainsInto: EmployeeId[];
  /**
   * `supply` = put in the supply at setup. `rewardOnly` = never in the supply; only granted by an
   * effect (Ketchup extra Executive VPs for "First recruiting girl used", ketchup.md §0).
   */
  availability: 'supply' | 'rewardOnly';
  /** Printed card text (short). */
  text: string;
  /** Rules reference, e.g. `employees.md §1; base.md §6.3`. */
  rulesRef: string;
}

// ---------------------------------------------------------------------------
// Milestones (docs/rules/milestones.md, ketchup.md §3, §8)
// ---------------------------------------------------------------------------

export type BaseMilestoneId =
  | 'first_billboard'
  | 'first_train'
  | 'first_hire_3'
  | 'first_burger_marketed'
  | 'first_pizza_marketed'
  | 'first_drink_marketed'
  | 'first_errand_boy'
  | 'first_20'
  | 'first_burger_produced'
  | 'first_pizza_produced'
  | 'first_waitress'
  | 'first_throw_away'
  | 'first_lower_prices'
  | 'first_cart_operator'
  | 'first_airplane'
  | 'first_radio'
  | 'first_100'
  | 'first_pay_20';

export type KetchupMilestoneId =
  // New Milestones (ketchup.md §3)
  | 'ketchup:first_marketeer_used'
  | 'ketchup:first_marketing_trainee_used'
  | 'ketchup:first_campaign_manager_used'
  | 'ketchup:first_brand_manager_used'
  | 'ketchup:first_brand_director_used'
  | 'ketchup:first_burger_sold'
  | 'ketchup:first_pizza_sold'
  | 'ketchup:first_lemonade_sold'
  | 'ketchup:first_beer_sold'
  | 'ketchup:first_coke_sold'
  | 'ketchup:first_recruiting_girl_used'
  | 'ketchup:first_trainer_used'
  | 'ketchup:first_discount_manager_used'
  | 'ketchup:first_house_built'
  | 'ketchup:first_new_restaurant'
  | 'ketchup:first_waitress_used'
  | 'ketchup:first_cart_operator_used'
  // Module milestones
  | 'ketchup:first_lobbyist_used' // §2
  | 'ketchup:first_coffee_sold' // §4
  | 'ketchup:first_rural_marketeer_used' // §12
  | 'ketchup:ketchup'; // §8

export type MilestoneId = BaseMilestoneId | KetchupMilestoneId;

/** "anyDrink" = beer, lemonade or soft drink (not coffee). */
export type FoodOrAnyDrink = FoodId | 'anyDrink';

/**
 * When a milestone is checked. Rules code fires `onEvent` hooks; this tells it which events matter.
 * See milestones.md "Trigger details for code".
 */
export type MilestoneTrigger =
  /** Campaign placed (phase 3). Optional filters on kind and good. */
  | { kind: 'campaignPlaced'; campaignKind?: CampaignKind; good?: FoodOrAnyDrink }
  /** Any employee trained one or more steps. */
  | { kind: 'trained' }
  /** ≥ count hires this turn (CEO's hire counts). */
  | { kind: 'hiredThisTurn'; count: number }
  /** "Played": one of these cards is in the structure when structures are revealed. */
  | { kind: 'atWork'; employees: EmployeeId[] }
  /** Cash ≥ amount. `anytime` = whenever cash changes; `endOfDinnertime` = after CFO bonus. */
  | { kind: 'cash'; amount: number; when: 'anytime' | 'endOfDinnertime' }
  /** Produced at least one of this food. */
  | { kind: 'produced'; food: FoodId }
  /** Discarded ≥1 token in Clean up. */
  | { kind: 'discarded' }
  /** Salary actually paid (after discounts) ≥ amount. */
  | { kind: 'salaryPaid'; amount: number }
  /** Ketchup "used": the card performed a printed function in phase 3–5 (ketchup.md §3). */
  | { kind: 'used'; employees: EmployeeId[] }
  /** Sold at least one of this good at dinnertime. */
  | { kind: 'sold'; good: FoodOrAnyDrink }
  /** Placed a house with a new business developer. */
  | { kind: 'houseBuilt' }
  /** Placed a new restaurant with a local or regional manager. */
  | { kind: 'restaurantPlaced' }
  /** Ketchup §8: another chain sold to a house holding demand your campaign placed (end of dinnertime). */
  | { kind: 'demandSoldByOther' }
  /** base.md §7: checked at the start of Dinnertime (first_lower_prices). */
  | { kind: 'startOfDinnertime'; condition: 'lowerPrices' };

/**
 * Data description of a milestone effect. The logic lives in rules/milestones.ts and module hooks;
 * this union is what they switch on and what the UI renders.
 */
export type MilestoneEffect =
  /** first_billboard (a): marketeers (except trainee) pay no salary. */
  | { kind: 'noMarketeerSalary' }
  /** first_billboard (b): campaigns placed from now on are eternal (incl. the triggering one). */
  | { kind: 'eternalCampaigns'; campaignKinds?: CampaignKind[] }
  /** first_train −$15; floored at $0. */
  | { kind: 'salaryDiscount'; amount: number }
  /** first_hire_3, burger/pizza produced, marketing trainee used, recruiting girl used, trainer used. */
  | { kind: 'gainEmployees'; employees: { id: EmployeeId; count: number }[]; trainableThisTurn: boolean; salaryFree?: boolean }
  /** +$ per item of this good sold; not unit price, not doubled by gardens, boosted by CFO. */
  | { kind: 'saleBonus'; good: FoodOrAnyDrink; amount: number }
  /** first_errand_boy: every buyer +N per source. */
  | { kind: 'buyerPerSourceBonus'; amount: number }
  /** ketchup first_cart_operator_used: absolute per-source values per card. */
  | { kind: 'buyerPerSourceOverride'; values: Partial<Record<EmployeeId, number>> }
  /** first_cart_operator: road/air buyers +N range. */
  | { kind: 'buyerRangeBonus'; amount: number }
  /** first_20: may look at face-down reserve cards. */
  | { kind: 'peekReserves' }
  /** first_waitress: tip per waitress. */
  | { kind: 'waitressTip'; amount: number }
  /** first_throw_away, ketchup first_coke_sold: keep up to N tokens in Clean up. */
  | { kind: 'freezer'; capacity: number }
  /** first_lower_prices: permanent unit price delta. */
  | { kind: 'unitPrice'; delta: number }
  /** first_airplane: +N open slots for order of business only. */
  | { kind: 'orderSlots'; amount: number }
  /** first_radio: each radio places N tokens per house. */
  | { kind: 'radioTokens'; amount: number }
  /** first_100: CEO acts as CFO; must fire owned CFO; may never train a CFO. */
  | { kind: 'ceoIsCfo' }
  /** first_pay_20, ketchup first_house_built: stack training actions on one card. */
  | { kind: 'stackTraining' }
  /** ketchup first_marketeer_used: +$5 per demand token placed; dinnertime distance −2. */
  | { kind: 'marketeerDemandCash'; perToken: number }
  /** Dinnertime score delta (first_marketeer_used −2, ketchup −1). */
  | { kind: 'dinnerScore'; delta: number }
  /** ketchup first_campaign_manager_used: second tile, same type/good/duration, this turn. */
  | { kind: 'secondCampaign' }
  /** ketchup first_brand_manager_used: airplane with two goods, this turn. */
  | { kind: 'twoGoodAirplane' }
  /** ketchup first_burger_sold: CEO has N slots for the rest of the game. */
  | { kind: 'ceoSlots'; slots: number }
  /** ketchup first_pizza_sold: first N pizza-buying houses this turn get a D-turn pizza radio. */
  | { kind: 'pizzaRadios'; houses: number; duration: number }
  /** ketchup first_lemonade_sold: train cards at work into same-colour cards. */
  | { kind: 'trainAtWorkSameColour' }
  /** ketchup first_beer_sold: pay salaries with tokens (not coffee). */
  | { kind: 'payWithTokens' }
  /** ketchup first_trainer_used: never forced to fire for non-payment. */
  | { kind: 'noForcedFiring' }
  /** ketchup first_discount_manager_used: burn $N from bank each turn discounts ≥ $min. */
  | { kind: 'bankBurn'; amount: number; minDiscount: number }
  /** ketchup first_new_restaurant: eternal mailbox in that restaurant's block, any good. */
  | { kind: 'freeMailbox' }
  /** ketchup first_waitress_used: salary per salaried employee. */
  | { kind: 'salaryPerEmployee'; amount: number }
  /** ketchup first_coffee_sold: build one extra coffee shop in Clean up, no range limit. */
  | { kind: 'extraCoffeeShop' }
  /** ketchup first_rural_marketeer_used: place one freeway now. */
  | { kind: 'placeFreeway' }
  /** ketchup first_lobbyist_used: place one extra map tile from leftovers. */
  | { kind: 'extraMapTile' };

/**
 * When the effect first applies, relative to the turn it was earned (milestones.md table, "When effect starts").
 * - `immediately`: from the moment of the trigger (incl. the triggering action where stated).
 * - `thisPayday`, `thisMarketing`: later this turn.
 * - `nextTurn`, `nextOrderOfBusiness`, `nextCleanup`, `nextDinnertime`: not this turn.
 */
export type MilestoneTiming =
  | 'immediately'
  | 'thisPayday'
  | 'thisMarketing'
  | 'nextOrderOfBusiness'
  | 'nextDinnertime'
  | 'nextCleanup'
  | 'nextTurn';

export interface MilestoneDef {
  id: MilestoneId;
  name: string;
  module: ModuleId;
  trigger: MilestoneTrigger;
  effects: MilestoneEffect[];
  timing: MilestoneTiming;
  /**
   * Hard choices / New Milestones marker: in Clean up of this round, remove the milestone
   * if still unclaimed (ketchup.md §3, §16). Usually set by the module at setup.
   */
  removeAfterRound?: number;
  /** @deprecated No copy counts: milestones are per-player board marks (milestones.md rule 5). Ignored. */
  copies?: number;
  text: string;
  rulesRef: string;
}

// ---------------------------------------------------------------------------
// Map tiles (docs/rules/map.md)
// ---------------------------------------------------------------------------

/** Base A–T, Ketchup U–Y (New Districts) and Z (Lobbyists parks). */
export type TileTemplateId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J'
  | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T'
  | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

/** Compass side. Also the edges of a tile and of the board. */
export type Direction = 'N' | 'E' | 'S' | 'W';

/** Clockwise quarter turns. Rotation formula (map.md §3): new(r,c) = old(4−c, r). */
export type Rotation = 0 | 1 | 2 | 3;

/** [row, col] within a 5x5 tile, canonical orientation (house number upright). */
export type TileCell = readonly [row: number, col: number];

/** Map.md notation characters. */
export type TileGlyph = '#' | '.' | 'H' | 'B' | 'L' | 'S' | 'A' | 'G' | 'P';

export interface TileHouseDef {
  /** Dinnertime order key. Printed numbers; apartments π = 3.14, 9¾ = 9.75 (ketchup.md §1). */
  order: number;
  /** Display label: "12", "π", "9¾". */
  label: string;
  kind: 'house' | 'apartment';
  cells: TileCell[];
  /** Printed garden squares (tile W only). */
  garden?: TileCell[];
}

export interface TileRoadDef {
  /** Connected road squares of one printed road. */
  cells: TileCell[];
  /** @deprecated Informational only; tiles link by adjacency (map.md §2), not by edge-midpoint exits. */
  exits: Direction[];
}

export interface TileDef {
  id: TileTemplateId;
  module: ModuleId;
  /** 5 strings of 5 glyphs, canonical orientation, row 0 = top. */
  grid: readonly [string, string, string, string, string];
  houses: TileHouseDef[];
  drinks: { cell: TileCell; drink: DrinkId }[];
  /** Separate printed roads (E, J, M have two). Bridge tiles list both crossing roads. */
  roads: TileRoadDef[];
  /** Overpass at this cell: straight through only, no turning (tiles G, P). */
  bridge?: TileCell;
  /** Capped road ends (map.md §2): the road square does not connect across this side. */
  cappedEnds?: { cell: TileCell; side: Direction }[];
  /** Ketchup tile Z parks (2x2 each). */
  parks?: TileCell[][];
  /** Only in the pool when this module is on (tile Z: lobbyists). */
  requiresModule?: ModuleId;
  rulesRef: string;
}

// ---------------------------------------------------------------------------
// Marketing tiles (base.md §9, map.md §7, ketchup.md §12–13)
// ---------------------------------------------------------------------------

export interface MarketingTileDef {
  /** Campaign number; sets run order in the marketing phase. */
  number: number;
  kind: CampaignKind;
  module: ModuleId;
  /**
   * Footprint in squares for on-board tiles (billboard, mailbox, radio), in canonical orientation;
   * the placement may rotate it. Airplanes: `w` = rows/cols covered (1, 3 or 5), `h` = 2 (depth).
   * Off-board kinds (gourmet guide) use 0x0; giant billboards span a full rural-area side.
   * Several footprints are unverified (map.md §7) — keep them data, not code.
   */
  w: number;
  h: number;
  /** Airplanes (#4/#5/#6): covered rows/cols 1/3/5 (base.md §9); equals the placement `width`. */
  width?: 1 | 3 | 5;
  /** Removed at low player counts (billboards #12/#15/#16, base.md §2.1): min players for this tile. */
  minPlayers?: number;
}

/** Placeable house tiles (map.md §5): numbers 1, 3, 6, 9, 11, 14, 17, 19 (Medium confidence). */
export interface PlaceableHouseDef {
  order: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Module content bundle
// ---------------------------------------------------------------------------

/** Board entity kinds a module may introduce (rendered generically by the client if unknown). */
export interface EntityDef {
  kind: string;
  name: string;
  module: ModuleId;
  /** Footprint for placement previews; 0x0 = off-board. */
  w: number;
  h: number;
  /** Number of pieces available per player (`perPlayer`) or in total (`total`). */
  limit?: { scope: 'perPlayer' | 'total'; count: number };
  rulesRef: string;
}

export interface ModuleContent {
  employees?: EmployeeDef[];
  /** Partial replacements of existing defs (Ketchup replacement cards' career paths, ketchup.md §0). */
  employeeOverrides?: Partial<Record<EmployeeId, Partial<Omit<EmployeeDef, 'id'>>>>;
  /** Extra copies added to the supply (e.g. +1 luxuries manager with sushi/kimchi/noodles/coffee). */
  extraSupply?: Partial<Record<EmployeeId, number>>;
  milestones?: MilestoneDef[];
  /** New Milestones removes all base milestones. */
  replacesBaseMilestones?: boolean;
  foods?: FoodDef[];
  tiles?: TileDef[];
  marketingTiles?: MarketingTileDef[];
  placeableHouses?: PlaceableHouseDef[];
  entities?: EntityDef[];
}
