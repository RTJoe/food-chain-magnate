/**
 * Base employee cards (employees.md §1). Data only. Counts sum to 222 (+ CEO, not in the supply).
 * Career tree, entry (sparkle) icons, salary icons and 1x flags read from the card-layout page
 * (RB p5) and cross-checked against the 16 cards shown in DLX.
 */
import type { EmployeeAbility, EmployeeDef, EmployeeId } from '../types/content.js';

type Opts = Partial<Pick<EmployeeDef, 'entry' | 'salary' | 'unique' | 'mandatory' | 'trainsInto' | 'availability'>>;

function card(
  id: EmployeeId,
  name: string,
  count: number,
  colour: EmployeeDef['colour'],
  category: EmployeeDef['category'],
  ability: EmployeeAbility,
  text: string,
  opts: Opts = {},
): EmployeeDef {
  return {
    id,
    name,
    module: 'base',
    count,
    entry: opts.entry ?? false,
    salary: opts.salary ?? false,
    unique: opts.unique ?? false,
    colour,
    category,
    ability,
    mandatory: opts.mandatory ?? false,
    trainsInto: opts.trainsInto ?? [],
    availability: opts.availability ?? 'supply',
    text,
    rulesRef: 'employees.md §1',
  };
}

const ENTRY = { entry: true } as const;
const PAID = { salary: true } as const;
const PAID1X = { salary: true, unique: true } as const;

export const BASE_EMPLOYEES: readonly EmployeeDef[] = [
  card('ceo', 'CEO', 0, 'ceo', 'ceo', { kind: 'ceo', slots: 3, recruits: 1 }, 'Hire 1 person. Always at work.', { availability: 'rewardOnly' }),
  card('waitress', 'Waitress', 12, 'purple', 'service', { kind: 'waitress', tip: 3 }, 'Get $3 cash. Win ties against restaurants with fewer waitresses.', { ...ENTRY, mandatory: true }),
  card('management_trainee', 'Management Trainee', 18, 'black', 'manager', { kind: 'manager', slots: 2 }, 'Manager (2 slots).', {
    ...ENTRY,
    trainsInto: ['junior_vp', 'new_business_developer', 'luxuries_manager'],
  }),
  card('junior_vp', 'Junior Vice President', 12, 'black', 'manager', { kind: 'manager', slots: 3 }, 'Manager (3 slots).', {
    ...PAID,
    trainsInto: ['vice_president', 'local_manager', 'discount_manager', 'recruiting_manager', 'coach'],
  }),
  card('vice_president', 'Vice President', 6, 'black', 'manager', { kind: 'manager', slots: 4 }, 'Manager (4 slots).', {
    ...PAID,
    trainsInto: ['senior_vp', 'regional_manager', 'guru'],
  }),
  card('senior_vp', 'Senior Vice President', 6, 'black', 'manager', { kind: 'manager', slots: 5 }, 'Manager (5 slots).', {
    ...PAID,
    trainsInto: ['executive_vp', 'cfo', 'hr_director'],
  }),
  card('executive_vp', 'Executive Vice President', 3, 'black', 'manager', { kind: 'manager', slots: 10 }, 'Manager (10 slots).', PAID1X),
  card('new_business_developer', 'New Business Developer', 6, 'purple', 'housing', { kind: 'newBusiness' }, 'Place a house or a garden.', PAID),
  card('luxuries_manager', 'Luxuries Manager', 3, 'salmon', 'pricing', { kind: 'price', delta: 10 }, 'Price +$10.', { ...PAID1X, mandatory: true }),
  card('pricing_manager', 'Pricing Manager', 12, 'salmon', 'pricing', { kind: 'price', delta: -1 }, 'Price −$1.', { ...ENTRY, mandatory: true }),
  card('discount_manager', 'Discount Manager', 6, 'salmon', 'pricing', { kind: 'price', delta: -3 }, 'Price −$3.', { ...PAID, mandatory: true }),
  card('local_manager', 'Local Manager', 6, 'red', 'restaurant', { kind: 'restaurant', mode: 'local', range: 3, driveIn: true }, 'Place a new restaurant (COMING SOON) within road range 3. Drive-in while at work.', PAID),
  card('regional_manager', 'Regional Manager', 3, 'red', 'restaurant', { kind: 'restaurant', mode: 'regional', range: 'unlimited', driveIn: true }, 'Place a new restaurant anywhere, or move one; opens immediately. Drive-in while at work.', PAID1X),
  card('cfo', 'CFO', 3, 'purple', 'finance', { kind: 'cfo', percent: 50 }, '+50% to cash earned this round.', { ...PAID1X, mandatory: true }),
  card('recruiting_girl', 'Recruiting Girl', 12, 'grey', 'recruiting', { kind: 'recruit', actions: 1, salaryDiscountPerUnused: 0 }, 'Hire 1 person.', ENTRY),
  card('recruiting_manager', 'Recruiting Manager', 6, 'grey', 'recruiting', { kind: 'recruit', actions: 2, salaryDiscountPerUnused: 5 }, '2x: hire 1 person or $5 less salary.', PAID),
  card('hr_director', 'HR Director', 3, 'grey', 'recruiting', { kind: 'recruit', actions: 4, salaryDiscountPerUnused: 5 }, '4x: hire 1 person or $5 less salary.', PAID1X),
  card('trainer', 'Trainer', 12, 'grey', 'training', { kind: 'train', actions: 1, maxStepsSameCard: 1 }, 'Train 1 person.', ENTRY),
  card('coach', 'Coach', 6, 'grey', 'training', { kind: 'train', actions: 2, maxStepsSameCard: 2 }, '2 training slots; may train the same person two steps.', PAID),
  card('guru', 'Guru', 3, 'grey', 'training', { kind: 'train', actions: 3, maxStepsSameCard: 3 }, '3 training slots; may train the same person up to three steps.', PAID1X),
  card('errand_boy', 'Errand Boy', 12, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'errand', range: 0, perSource: 1 }, 'Get 1 drink of any type.', {
    ...ENTRY,
    trainsInto: ['cart_operator'],
  }),
  card('cart_operator', 'Cart Operator', 6, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'road', range: 2, perSource: 2 }, 'Get 2 drinks from each source on the route. Road range 2.', {
    ...PAID,
    trainsInto: ['truck_driver'],
  }),
  card('truck_driver', 'Truck Driver', 6, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'road', range: 3, perSource: 3 }, 'Get 3 drinks from each source on the route. Road range 3.', {
    ...PAID,
    trainsInto: ['zeppelin_pilot'],
  }),
  card('zeppelin_pilot', 'Zeppelin Pilot', 3, 'lightGreen', 'buyer', { kind: 'buyDrinks', mode: 'air', range: 4, perSource: 2 }, 'Get 2 drinks from each source on the route, ignoring roads. Zeppelin range 4.', PAID1X),
  card('marketing_trainee', 'Marketing Trainee', 12, 'blue', 'marketing', { kind: 'marketing', campaigns: ['billboard'], range: 2, maxDuration: 2 }, 'Place a billboard, max duration 2. Road range 2.', {
    ...ENTRY,
    trainsInto: ['campaign_manager'],
  }),
  card('campaign_manager', 'Campaign Manager', 6, 'blue', 'marketing', { kind: 'marketing', campaigns: ['billboard', 'mailbox'], range: 3, maxDuration: 3 }, 'Place a mailbox or lower, max duration 3. Road range 3.', {
    ...PAID,
    trainsInto: ['brand_manager'],
  }),
  card('brand_manager', 'Brand Manager', 6, 'blue', 'marketing', { kind: 'marketing', campaigns: ['billboard', 'mailbox', 'airplane'], range: 'unlimited', maxDuration: 4 }, 'Place an airplane or lower, max duration 4. Unlimited range.', {
    ...PAID,
    trainsInto: ['brand_director'],
  }),
  card('brand_director', 'Brand Director', 3, 'blue', 'marketing', { kind: 'marketing', campaigns: ['billboard', 'mailbox', 'airplane', 'radio'], range: 'unlimited', maxDuration: 5 }, 'Place a radio or lower, max duration 5. Unlimited range.', PAID1X),
  card('kitchen_trainee', 'Kitchen Trainee', 12, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['burger', 'pizza'], amount: 1, timing: 'working' }, 'Produce 1 burger or 1 pizza.', {
    ...ENTRY,
    trainsInto: ['burger_cook', 'pizza_cook'],
  }),
  card('burger_cook', 'Burger Cook', 6, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['burger'], amount: 3, timing: 'working' }, 'Produce 3 burgers.', {
    ...PAID,
    trainsInto: ['burger_chef'],
  }),
  card('burger_chef', 'Burger Chef', 3, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['burger'], amount: 8, timing: 'working' }, 'Produce 8 burgers.', PAID1X),
  card('pizza_cook', 'Pizza Cook', 6, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['pizza'], amount: 3, timing: 'working' }, 'Produce 3 pizzas.', {
    ...PAID,
    trainsInto: ['pizza_chef'],
  }),
  card('pizza_chef', 'Pizza Chef', 3, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['pizza'], amount: 8, timing: 'working' }, 'Produce 8 pizzas.', PAID1X),
];

/** Copies of each 1x card in play by player count (employees.md legend; DLX p2–3). */
export function uniqueCopiesFor(players: number): number {
  return players <= 3 ? 1 : players === 4 ? 2 : 3;
}
