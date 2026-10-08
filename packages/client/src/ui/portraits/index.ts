/**
 * Employee-card portraits: `portraitFor(id)` draws the figure for one employee inside the card's
 * `0 0 100 70` frame, or the old flat silhouette for ids without a portrait yet.
 * Parts and conventions: ./parts.tsx.
 */
import type { EmployeeId } from "@fcm/engine";
import type { PortraitFn, PortraitSet } from "./types.js";
import { managers } from "./managers.js";
import { kitchen } from "./kitchen.js";
import { buyers } from "./buyers.js";
import { marketing } from "./marketing.js";
import { people } from "./people.js";
import { service } from "./service.js";
import { planning } from "./planning.js";
import { coffee } from "./coffee.js";

export type { PortraitFn, PortraitSet } from "./types.js";
export { Silhouette } from "./parts.js";

const ALL: PortraitSet = {
  ...managers,
  ...kitchen,
  ...buyers,
  ...marketing,
  ...people,
  ...service,
  ...planning,
  ...coffee,
};

/** The portrait for `id`, or undefined when none is drawn yet (use `Silhouette`). */
export function portraitFor(id: EmployeeId | string): PortraitFn | undefined {
  return ALL[id as EmployeeId];
}

/** Ids that have a drawn portrait. */
export const portraitIds = (): EmployeeId[] => Object.keys(ALL) as EmployeeId[];
