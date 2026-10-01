/**
 * Client-side fallback content, used only when the module manifest does not (yet) carry it.
 * The real tables live in the engine (`content/employees.ts`, `content/milestones.ts`) and reach the
 * client through `ModuleManifest.content`; manifest entries always win over these.
 *
 * Mirrors docs/rules/employees.md §1–2, docs/rules/milestones.md and docs/rules/ketchup.md (module list).
 */
import type {
  CardColour,
  EmployeeAbility,
  EmployeeCategory,
  EmployeeDef,
  EmployeeId,
  MilestoneDef,
  MilestoneId,
  ModuleId,
  ModuleManifest,
} from '@fcm/engine';

type Row = [
  id: EmployeeId,
  name: string,
  count: number,
  entry: boolean,
  salary: boolean,
  unique: boolean,
  colour: CardColour,
  category: EmployeeCategory,
  ability: EmployeeAbility,
  trainsInto: EmployeeId[],
  text: string,
  module?: ModuleId,
];

const MANDATORY: EmployeeAbility['kind'][] = ['price', 'waitress', 'cfo', 'fryChef', 'nightShift', 'movieStar', 'massMarketing'];

const def = ([id, name, count, entry, salary, unique, colour, category, ability, trainsInto, text, module = 'base']: Row): EmployeeDef => ({
  id,
  name,
  module,
  count,
  entry,
  salary,
  unique,
  ...(id.endsWith('movie_star') ? { uniqueGroup: 'movieStar' } : {}),
  colour,
  category,
  ability,
  mandatory: MANDATORY.includes(ability.kind),
  trainsInto,
  availability: 'supply',
  text,
  rulesRef: 'employees.md',
});

const mkt = (campaigns: EmployeeAbility & { kind: 'marketing' }) => campaigns;

export const FALLBACK_EMPLOYEES: readonly EmployeeDef[] = (
  [
    ['ceo', 'CEO', 0, false, false, false, 'ceo', 'ceo', { kind: 'ceo', slots: 3, recruits: 1 }, [], 'Hire 1 person. Always at work.'],
    ['waitress', 'Waitress', 12, true, false, false, 'purple', 'service', { kind: 'waitress', tip: 3 }, [], 'Get $3. Win ties against chains with fewer waitresses.'],
    ['management_trainee', 'Management Trainee', 18, true, false, false, 'black', 'manager', { kind: 'manager', slots: 2 }, ['junior_vp', 'new_business_developer', 'luxuries_manager'], 'Manager with 2 slots.'],
    ['junior_vp', 'Junior Vice President', 12, false, true, false, 'black', 'manager', { kind: 'manager', slots: 3 }, ['vice_president', 'local_manager', 'discount_manager', 'recruiting_manager', 'coach'], 'Manager with 3 slots.'],
    ['vice_president', 'Vice President', 6, false, true, false, 'black', 'manager', { kind: 'manager', slots: 4 }, ['senior_vp', 'regional_manager', 'guru'], 'Manager with 4 slots.'],
    ['senior_vp', 'Senior Vice President', 6, false, true, false, 'black', 'manager', { kind: 'manager', slots: 5 }, ['executive_vp', 'cfo', 'hr_director'], 'Manager with 5 slots.'],
    ['executive_vp', 'Executive Vice President', 3, false, true, true, 'black', 'manager', { kind: 'manager', slots: 10 }, [], 'Manager with 10 slots.'],
    ['new_business_developer', 'New Business Developer', 6, false, true, false, 'purple', 'housing', { kind: 'newBusiness' }, [], 'Place a house or a garden.'],
    ['luxuries_manager', 'Luxuries Manager', 3, false, true, true, 'salmon', 'pricing', { kind: 'price', delta: 10 }, [], 'Unit price +$10.'],
    ['pricing_manager', 'Pricing Manager', 12, true, false, false, 'salmon', 'pricing', { kind: 'price', delta: -1 }, [], 'Unit price −$1.'],
    ['discount_manager', 'Discount Manager', 6, false, true, false, 'salmon', 'pricing', { kind: 'price', delta: -3 }, [], 'Unit price −$3.'],
    ['local_manager', 'Local Manager', 6, false, true, false, 'red', 'restaurant', { kind: 'restaurant', mode: 'local', range: 3, driveIn: true }, [], 'Place a restaurant within road range 3 (coming soon). Drive-in.'],
    ['regional_manager', 'Regional Manager', 3, false, true, true, 'red', 'restaurant', { kind: 'restaurant', mode: 'regional', range: 'unlimited', driveIn: true }, [], 'Place a restaurant anywhere or move one. Opens now. Drive-in.'],
    ['cfo', 'CFO', 3, false, true, true, 'purple', 'finance', { kind: 'cfo', percent: 50 }, [], '+50% of cash earned this round.'],
    ['recruiting_girl', 'Recruiting Girl', 12, true, false, false, 'grey', 'recruiting', { kind: 'recruit', actions: 1, salaryDiscountPerUnused: 0 }, [], 'Hire 1 person.'],
    ['recruiting_manager', 'Recruiting Manager', 6, false, true, false, 'grey', 'recruiting', { kind: 'recruit', actions: 2, salaryDiscountPerUnused: 5 }, [], '2x: hire 1 person or pay $5 less salary.'],
    ['hr_director', 'HR Director', 3, false, true, true, 'grey', 'recruiting', { kind: 'recruit', actions: 4, salaryDiscountPerUnused: 5 }, [], '4x: hire 1 person or pay $5 less salary.'],
    ['trainer', 'Trainer', 12, true, false, false, 'grey', 'training', { kind: 'train', actions: 1, maxStepsSameCard: 1 }, [], 'Train 1 person one step.'],
    ['coach', 'Coach', 6, false, true, false, 'grey', 'training', { kind: 'train', actions: 2, maxStepsSameCard: 2 }, [], '2 training actions; may train one person two steps.'],
    ['guru', 'Guru', 3, false, true, true, 'grey', 'training', { kind: 'train', actions: 3, maxStepsSameCard: 3 }, [], '3 training actions; may train one person three steps.'],
    ['errand_boy', 'Errand Boy', 12, true, false, false, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'errand', range: 0, perSource: 1 }, ['cart_operator'], 'Get 1 drink of any type.'],
    ['cart_operator', 'Cart Operator', 6, false, true, false, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'road', range: 2, perSource: 2 }, ['truck_driver'], '2 drinks per source on route. Road range 2.'],
    ['truck_driver', 'Truck Driver', 6, false, true, false, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'road', range: 3, perSource: 3 }, ['zeppelin_pilot'], '3 drinks per source on route. Road range 3.'],
    ['zeppelin_pilot', 'Zeppelin Pilot', 3, false, true, true, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'air', range: 4, perSource: 2 }, [], '2 drinks per source, ignores roads. Range 4.'],
    ['marketing_trainee', 'Marketing Trainee', 12, true, false, false, 'blue', 'marketing', mkt({ kind: 'marketing', campaigns: ['billboard'], range: 2, maxDuration: 2 }), ['campaign_manager'], 'Billboard, max duration 2. Road range 2.'],
    ['campaign_manager', 'Campaign Manager', 6, false, true, false, 'blue', 'marketing', mkt({ kind: 'marketing', campaigns: ['billboard', 'mailbox'], range: 3, maxDuration: 3 }), ['brand_manager'], 'Mailbox or billboard, max duration 3. Road range 3.'],
    ['brand_manager', 'Brand Manager', 6, false, true, false, 'blue', 'marketing', mkt({ kind: 'marketing', campaigns: ['billboard', 'mailbox', 'airplane'], range: 'unlimited', maxDuration: 4 }), ['brand_director'], 'Airplane or lower, max duration 4. Unlimited range.'],
    ['brand_director', 'Brand Director', 3, false, true, true, 'blue', 'marketing', mkt({ kind: 'marketing', campaigns: ['billboard', 'mailbox', 'airplane', 'radio'], range: 'unlimited', maxDuration: 5 }), [], 'Radio or lower, max duration 5. Unlimited range.'],
    ['kitchen_trainee', 'Kitchen Trainee', 12, true, false, false, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['burger', 'pizza'], amount: 1, timing: 'working' }, ['burger_cook', 'pizza_cook'], 'Produce 1 burger or 1 pizza.'],
    ['burger_cook', 'Burger Cook', 6, false, true, false, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['burger'], amount: 3, timing: 'working' }, ['burger_chef'], 'Produce 3 burgers.'],
    ['burger_chef', 'Burger Chef', 3, false, true, true, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['burger'], amount: 8, timing: 'working' }, [], 'Produce 8 burgers.'],
    ['pizza_cook', 'Pizza Cook', 6, false, true, false, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['pizza'], amount: 3, timing: 'working' }, ['pizza_chef'], 'Produce 3 pizzas.'],
    ['pizza_chef', 'Pizza Chef', 3, false, true, true, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['pizza'], amount: 8, timing: 'working' }, [], 'Produce 8 pizzas.'],
    // Ketchup (employees.md §2)
    ['ketchup:fry_chef', 'Fry Chef', 6, false, true, false, 'oliveGreen', 'kitchen', { kind: 'fryChef', bonusPerSale: 10 }, [], '+$10 per house sold to.', 'ketchup:fryChefs'],
    ['ketchup:kimchi_master', 'Kimchi Master', 3, true, true, true, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['kimchi'], amount: 1, timing: 'cleanup' }, [], 'Must produce 1 kimchi at the end of Clean up.', 'ketchup:kimchi'],
    ['ketchup:sushi_cook', 'Sushi Cook', 6, false, true, false, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['sushi'], amount: 2, timing: 'working' }, ['ketchup:sushi_chef', 'ketchup:fry_chef'], 'Produce 2 sushi.', 'ketchup:sushi'],
    ['ketchup:sushi_chef', 'Sushi Chef', 3, false, true, true, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['sushi'], amount: 5, timing: 'working' }, [], 'Produce 5 sushi.', 'ketchup:sushi'],
    ['ketchup:noodle_cook', 'Noodle Cook', 6, false, true, false, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['noodles'], amount: 6, timing: 'working' }, ['ketchup:noodle_chef', 'ketchup:fry_chef'], 'Produce 6 noodles.', 'ketchup:noodles'],
    ['ketchup:noodle_chef', 'Noodle Chef', 3, false, true, true, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['noodles'], amount: 16, timing: 'working' }, [], 'Produce 16 noodles.', 'ketchup:noodles'],
    ['ketchup:barista_trainee', 'Barista Trainee', 12, true, false, false, 'oliveGreen', 'coffee', { kind: 'produce', foods: ['coffee'], amount: 1, timing: 'working' }, ['ketchup:barista'], 'Produce 1 coffee.', 'ketchup:coffee'],
    ['ketchup:barista', 'Barista', 6, false, true, false, 'oliveGreen', 'coffee', { kind: 'produce', foods: ['coffee'], amount: 2, timing: 'working' }, ['ketchup:lead_barista'], 'Produce 2 coffee.', 'ketchup:coffee'],
    ['ketchup:lead_barista', 'Lead Barista', 3, false, true, true, 'oliveGreen', 'coffee', { kind: 'produce', foods: ['coffee'], amount: 5, timing: 'working' }, [], 'Produce 5 coffee.', 'ketchup:coffee'],
    ['ketchup:lobbyist', 'Lobbyist', 6, true, true, false, 'purple', 'lobbying', { kind: 'lobbyist', range: 2 }, [], 'Place 1 road or park. Road range 2.', 'ketchup:lobbyists'],
    ['ketchup:mass_marketeer', 'Mass Marketeer', 6, false, true, false, 'blue', 'marketing', { kind: 'massMarketing' }, [], 'An extra marketing pass this round.', 'ketchup:massMarketeers'],
    ['ketchup:rural_marketeer', 'Rural Marketeer', 6, false, true, false, 'blue', 'marketing', mkt({ kind: 'marketing', campaigns: ['giantBillboard'], range: 'unlimited', maxDuration: 1, alwaysEternal: true }), [], 'Giant billboard by the rural area.', 'ketchup:ruralMarketeers'],
    ['ketchup:gourmet_food_critic', 'Gourmet Food Critic', 6, false, true, false, 'blue', 'marketing', mkt({ kind: 'marketing', campaigns: ['gourmetGuide'], range: 'unlimited', maxDuration: 3 }), [], 'Market to every house with a garden. Max duration 3.', 'ketchup:gourmetCritics'],
    ['ketchup:night_shift_manager', 'Night Shift Manager', 3, true, true, true, 'black', 'manager', { kind: 'nightShift' }, [], 'Salary-free employees work twice. 0 slots.', 'ketchup:nightShift'],
    ['ketchup:b_movie_star', 'B-Movie Star', 1, false, true, true, 'purple', 'service', { kind: 'movieStar', rank: 'B' }, [], 'Win all ties. First choice in turn order.', 'ketchup:movieStars'],
    ['ketchup:c_movie_star', 'C-Movie Star', 1, false, true, true, 'purple', 'service', { kind: 'movieStar', rank: 'C' }, [], 'Win ties (not against B). Second choice.', 'ketchup:movieStars'],
    ['ketchup:d_movie_star', 'D-Movie Star', 1, false, true, true, 'purple', 'service', { kind: 'movieStar', rank: 'D' }, [], 'Win ties (not against B or C). Third choice.', 'ketchup:movieStars'],
  ] satisfies Row[]
).map(def);

type MRow = [id: MilestoneId, name: string, text: string, module?: ModuleId];

const ms = ([id, name, text, module = 'base']: MRow): MilestoneDef => ({
  id,
  name,
  module,
  trigger: { kind: 'trained' },
  effects: [],
  timing: 'immediately',
  copies: 1,
  text,
  rulesRef: 'milestones.md',
});

export const FALLBACK_MILESTONES: readonly MilestoneDef[] = (
  [
    ['first_billboard', 'First billboard', 'No salary for marketeers. Your campaigns are eternal from now on.'],
    ['first_train', 'First to train', 'Pay $15 less salary each Payday.'],
    ['first_hire_3', 'First to hire 3 in a turn', 'Gain 2 Management Trainees now.'],
    ['first_burger_marketed', 'First burger marketed', '+$5 per burger sold.'],
    ['first_pizza_marketed', 'First pizza marketed', '+$5 per pizza sold.'],
    ['first_drink_marketed', 'First drink marketed', '+$5 per drink sold.'],
    ['first_errand_boy', 'First errand boy played', 'Every buyer collects +1 per source.'],
    ['first_20', 'First to have $20', 'You may look at the reserve cards.'],
    ['first_burger_produced', 'First burger produced', 'Gain a Burger Cook.'],
    ['first_pizza_produced', 'First pizza produced', 'Gain a Pizza Cook.'],
    ['first_waitress', 'First waitress played', 'Waitresses earn $5 each.'],
    ['first_throw_away', 'First to throw away', 'Gain a freezer: keep up to 10 goods.'],
    ['first_lower_prices', 'First to lower prices', 'Unit price −$1 for the rest of the game.'],
    ['first_cart_operator', 'First cart operator played', 'Road and air buyers +1 range.'],
    ['first_airplane', 'First airplane', '+2 open slots when choosing turn order.'],
    ['first_radio', 'First radio', 'Your radios place 2 demand per house.'],
    ['first_100', 'First to have $100', 'Your CEO acts as a CFO.'],
    ['first_pay_20', 'First to pay $20 salary', 'Stack training actions on one employee.'],
    ['ketchup:first_marketeer_used', 'First marketeer used', '+$5 per demand token placed.', 'ketchup:newMilestones'],
    ['ketchup:first_marketing_trainee_used', 'First marketing trainee used', 'Gain marketing trainees.', 'ketchup:newMilestones'],
    ['ketchup:first_campaign_manager_used', 'First campaign manager used', 'Place a second campaign tile.', 'ketchup:newMilestones'],
    ['ketchup:first_brand_manager_used', 'First brand manager used', 'Airplane with two goods.', 'ketchup:newMilestones'],
    ['ketchup:first_brand_director_used', 'First brand director used', 'Radios become eternal.', 'ketchup:newMilestones'],
    ['ketchup:first_burger_sold', 'First burger sold', 'Your CEO gets 4 slots.', 'ketchup:newMilestones'],
    ['ketchup:first_pizza_sold', 'First pizza sold', 'Pizza radios on houses you sell to.', 'ketchup:newMilestones'],
    ['ketchup:first_lemonade_sold', 'First lemonade sold', 'Train employees at work within their colour.', 'ketchup:newMilestones'],
    ['ketchup:first_beer_sold', 'First beer sold', 'Pay salaries with goods.', 'ketchup:newMilestones'],
    ['ketchup:first_coke_sold', 'First soft drink sold', 'Gain a freezer.', 'ketchup:newMilestones'],
    ['ketchup:first_recruiting_girl_used', 'First recruiting girl used', 'Gain a salary-free Executive VP.', 'ketchup:newMilestones'],
    ['ketchup:first_trainer_used', 'First trainer used', 'Never forced to fire.', 'ketchup:newMilestones'],
    ['ketchup:first_discount_manager_used', 'First discount manager used', 'Burn bank cash when discounting.', 'ketchup:newMilestones'],
    ['ketchup:first_house_built', 'First house built', 'Stack training actions.', 'ketchup:newMilestones'],
    ['ketchup:first_new_restaurant', 'First new restaurant', 'A free eternal mailbox.', 'ketchup:newMilestones'],
    ['ketchup:first_waitress_used', 'First waitress used', 'Salary per salaried employee changes.', 'ketchup:newMilestones'],
    ['ketchup:first_cart_operator_used', 'First cart operator used', 'Buyers collect more per source.', 'ketchup:newMilestones'],
    ['ketchup:first_lobbyist_used', 'First lobbyist used', 'Place an extra map tile.', 'ketchup:lobbyists'],
    ['ketchup:first_coffee_sold', 'First coffee sold', 'Build an extra coffee shop.', 'ketchup:coffee'],
    ['ketchup:first_rural_marketeer_used', 'First rural marketeer used', 'Place a freeway.', 'ketchup:ruralMarketeers'],
    ['ketchup:ketchup', 'Someone sells your demand', 'Ketchup: dinnertime score −1.', 'ketchup:ketchup'],
  ] satisfies MRow[]
).map(ms);

const mod = (id: ModuleId, name: string, description: string, extra: Partial<ModuleManifest> = {}): ModuleManifest => ({
  id,
  name,
  description,
  requires: [],
  conflicts: [],
  options: {},
  content: {},
  ...extra,
});

/** Lobby module list when the engine cannot list modules yet (docs/rules/ketchup.md module list). */
export const FALLBACK_MODULES: readonly ModuleManifest[] = [
  mod('ketchup:newDistricts', 'New Districts', 'Five new map tiles with apartment blocks that hold unlimited demand.', {
    options: {
      tiles: {
        type: 'multiselect',
        label: 'Tiles in the pool',
        values: ['U', 'V', 'W', 'X', 'Y'].map((t) => ({ value: t, label: `Tile ${t}` })),
        default: ['U', 'V', 'W', 'X', 'Y'],
      },
    },
  }),
  mod('ketchup:lobbyists', 'Lobbyists', 'Lobbyists build new roads and parks; roadworks slow down rivals.', {
    options: {
      includeTileZ: { type: 'boolean', label: 'Add the two-park tile Z', default: true },
      parallelRoadsConnect: {
        type: 'enum',
        label: 'Parallel roads connect',
        values: [
          { value: 'lobbyistOnly', label: 'Lobbyist roads only' },
          { value: 'everywhere', label: 'Everywhere' },
        ],
        default: 'lobbyistOnly',
      },
    },
  }),
  mod('ketchup:newMilestones', 'New Milestones', 'Replaces all base milestones with 17 new ones.', { conflicts: ['ketchup:hardChoices'] }),
  mod('ketchup:coffee', 'Coffee', 'Baristas brew coffee and open coffee shops that sell to passing diners.'),
  mod('ketchup:kimchi', 'Kimchi', 'A Kimchi Master adds kimchi as a side dish that wins ties.'),
  mod('ketchup:sushi', 'Sushi', 'Sushi cooks serve houses with a garden before anyone else.'),
  mod('ketchup:noodles', 'Noodles', 'Noodle cooks feed houses nobody else can serve.'),
  mod('ketchup:ketchup', 'Ketchup', 'Earn a milestone when a rival sells to demand you created.'),
  mod('ketchup:fryChefs', 'Fry Chefs', 'Fry chefs earn $10 for every house you sell to.'),
  mod('ketchup:massMarketeers', 'Mass Marketeers', 'Each mass marketeer runs every campaign an extra time.'),
  mod('ketchup:nightShift', 'Night Shift Managers', 'Salary-free employees work twice.'),
  mod('ketchup:ruralMarketeers', 'Rural Marketeers', 'A rural area off the map, reached by freeways and giant billboards.'),
  mod('ketchup:gourmetCritics', 'Gourmet Food Critics', 'Gourmet guides market to every house with a garden.'),
  mod('ketchup:reservePrices', 'Reserve Prices', 'Alternative reserve cards change the base unit price.'),
  mod('ketchup:movieStars', 'Movie Stars', 'Movie stars win ties and pick turn order first.'),
  mod('ketchup:hardChoices', 'Hard Choices', 'Unclaimed milestones are removed after round 2 or 3.', { conflicts: ['ketchup:newMilestones'] }),
  mod('ketchup:sixPlayers', 'Six Players', 'Adds a sixth chain and a 4x6 map.', { requires: ['ketchup:newDistricts'] }),
];
