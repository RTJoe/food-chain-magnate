/**
 * Value tables (ai-strategy.md §5.3): per-round worth of a card at work and the worth of
 * milestones still open. Initial guesses tuned against Easy with the bench; Ketchup cards get a
 * value from their ability kind so unknown module cards never break anything.
 */
import type { EmployeeDef, EmployeeId, GameState, MilestoneId, PlayerId } from '@fcm/engine';

/** Per-round value of a card at work, before salary. */
export const CARD_VALUE: Partial<Record<EmployeeId, number>> = {
  waitress: 4,
  pricing_manager: 4,
  discount_manager: 6,
  luxuries_manager: 0,
  kitchen_trainee: 4,
  burger_cook: 11,
  burger_chef: 22,
  pizza_cook: 11,
  pizza_chef: 22,
  errand_boy: 5,
  cart_operator: 10,
  truck_driver: 13,
  zeppelin_pilot: 15,
  marketing_trainee: 9,
  campaign_manager: 13,
  brand_manager: 18,
  brand_director: 24,
  recruiting_girl: 6,
  recruiting_manager: 10,
  hr_director: 18,
  trainer: 8,
  coach: 13,
  guru: 17,
  management_trainee: 3,
  junior_vp: 5,
  vice_president: 7,
  senior_vp: 9,
  executive_vp: 14,
  new_business_developer: 8,
  local_manager: 9,
  regional_manager: 12,
  cfo: 15,
};

/** Value for any card (module cards by ability kind). */
export function cardValue(def: EmployeeDef | undefined): number {
  if (!def) return 0;
  const v = CARD_VALUE[def.id];
  if (v !== undefined) return v;
  const a = def.ability;
  switch (a.kind) {
    case 'produce':
      return a.timing === 'cleanup' ? 8 : 3 + a.amount * 3;
    case 'fryChef':
      return 12;
    case 'marketing':
      return 12;
    case 'massMarketing':
      return 8;
    case 'movieStar':
      return 6;
    case 'nightShift':
      return 6;
    case 'lobbyist':
      return 5;
    case 'manager':
      return a.slots;
    case 'train':
      return 6 + a.actions * 3;
    case 'recruit':
      return 4 + a.actions * 3;
    default:
      return 4;
  }
}

/**
 * Value of earning an open milestone now ($ over the rest of the game), scaled by the rounds that
 * remain. Unknown (module) milestones are worth a flat amount so the bot does not ignore them.
 */
export function milestoneValue(s: GameState, pid: PlayerId, id: MilestoneId, roundsLeft: number): number {
  const h = Math.max(1, Math.min(8, roundsLeft));
  const p = s.players[pid];
  const owned = (ids: EmployeeId[]) => (p ? Object.values(p.employees).filter((c) => ids.includes(c.employeeId)).length : 0);
  switch (id) {
    case 'first_billboard':
      return 30 + 4 * h;
    case 'first_train':
      return 12 * h;
    case 'first_hire_3':
      return 14;
    case 'first_burger_marketed':
    case 'first_pizza_marketed':
      return 8 + 4 * h;
    case 'first_drink_marketed':
      return 6 + 3 * h;
    case 'first_errand_boy':
      return 3 + 3 * h * owned(['cart_operator', 'truck_driver', 'zeppelin_pilot', 'errand_boy']);
    case 'first_20':
      return 1;
    case 'first_burger_produced':
    case 'first_pizza_produced':
      return 18;
    case 'first_waitress':
      return 2 * h * Math.max(1, owned(['waitress']));
    case 'first_throw_away':
      return 3 * h;
    case 'first_lower_prices':
      return 3 * h;
    case 'first_cart_operator':
      return 4 * h;
    case 'first_airplane':
      return 2 * h;
    case 'first_radio':
      return 5 * h;
    case 'first_100':
      return 6 * h;
    case 'first_pay_20':
      return 6;
    default:
      return 6 + h;
  }
}
