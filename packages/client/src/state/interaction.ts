/**
 * Board interaction signals shared by the 3D layer (three/) and the overlay (ui/). Neither side
 * imports the other (architecture §2); both read and write these.
 *
 * - The overlay can drive the camera (`cameraCommand`), the animation speed and skip, and the
 *   touch "confirm / rotate" flow (`pendingPlacement`, `confirmPlacement`, `rotatePlacement`).
 * - The board publishes what is under the pointer (`boardHover`) and whether the 3D scene is up.
 *
 * Picks themselves still flow through state/boardBridge.ts (`onPick`).
 */
import { signal } from '@preact/signals';
import type { Placement } from '@fcm/engine';

export type CameraCommand =
  | { kind: 'reset' }
  | { kind: 'top'; on?: boolean }
  | { kind: 'zoom'; by: number }
  | { kind: 'yaw'; by: number }
  /** Centre on board objects (house / restaurant / campaign / entity ids). */
  | { kind: 'focus'; ids: string[] };

/** Write a new object to fire a command (the board consumes and resets it to null). */
export const cameraCommand = signal<CameraCommand | null>(null);

/** Whether the board is in the straight-down "top" view. Mirrored by the board. */
export const topView = signal(false);

/** 1 = normal; 0.5 slow; 2 fast. */
export const animationSpeed = signal(1);
/** Bumped by the overlay to finish running animations now. */
export const skipAnimations = signal(0);

/** What the pointer is over on the board (object id or square), for tooltips. */
export const boardHover = signal<{ id: string | null; cell: { x: number; y: number } | null } | null>(null);

/**
 * Touch flow: the first tap on a legal spot stages it here (ghost shown); a second tap on the same
 * spot, Enter, or `confirmPlacement()` picks it. Null when nothing is staged.
 */
export const pendingPlacement = signal<Placement | null>(null);
/** Variants (rotations / entrances / garden sides) available for the staged spot. */
export const pendingVariants = signal(0);

/** Mouse flow: the legal placement under the pointer and how many variants its spot has (R cycles). */
export const hoverPlacement = signal<{ placement: Placement; variants: number } | null>(null);

/** Bumped by the overlay's confirm button. */
export const confirmRequest = signal(0);
/** Bumped by the overlay's rotate button (also R on the keyboard). */
export const rotateRequest = signal(0);

export function confirmPlacement(): void {
  confirmRequest.value += 1;
}

export function rotatePlacement(): void {
  rotateRequest.value += 1;
}

export function finishAnimations(): void {
  skipAnimations.value += 1;
}
