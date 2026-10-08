import type { VNode } from "preact";
import type { EmployeeId } from "@fcm/engine";

/** Draws one portrait's contents inside the card's `0 0 100 70` frame. */
export type PortraitFn = () => VNode;

/** One family's portraits, keyed by employee id. */
export type PortraitSet = Partial<Record<EmployeeId, PortraitFn>>;
