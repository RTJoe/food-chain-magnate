import type { ActionType } from '@fcm/engine';

/**
 * Every engine action type, for envelope validation. Kept exhaustive at compile time: adding an
 * action to the engine without listing it here fails `npm run typecheck`.
 */
export const ACTION_TYPES = [
  'setup.placeRestaurant',
  'setup.pass',
  'setup.chooseReserve',
  'restructure.submit',
  'restructure.retract',
  'order.choosePosition',
  'work.recruit',
  'work.train',
  'work.produce',
  'work.buyDrinks',
  'work.placeCampaign',
  'work.placeHouse',
  'work.placeGarden',
  'work.placeRestaurant',
  'work.moveRestaurant',
  'work.skip',
  'work.endTurn',
  'payday.fire',
  'payday.confirm',
  'cleanup.freezer',
  'choice.decline',
  'ketchup:lobbyists.placeRoad',
  'ketchup:lobbyists.placePark',
  'ketchup:lobbyists.placeMapTile',
  'ketchup:coffee.placeShop',
  'ketchup:ruralMarketeers.placeFreeway',
  'ketchup:newMilestones.placePizzaRadio',
  'ketchup:newMilestones.placeFreeMailbox',
  'ketchup:newMilestones.placeSecondCampaign',
] as const satisfies readonly ActionType[];

/** Local-only actions (the in-process tutorial, docs/tutorial-plan.md §4.2): never accepted over the wire. */
type LocalOnly = 'tutorial.continue';
type Missing = Exclude<ActionType, (typeof ACTION_TYPES)[number] | LocalOnly>;
/** Compile-time exhaustiveness check: errors if `Missing` is not `never`. */
export const ACTION_TYPES_EXHAUSTIVE: [Missing] extends [never] ? true : Missing = true;

const SET: ReadonlySet<string> = new Set(ACTION_TYPES);
export const isActionType = (t: unknown): t is ActionType => typeof t === 'string' && SET.has(t);
