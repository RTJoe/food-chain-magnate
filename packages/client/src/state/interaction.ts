/**
 * Board interaction signals shared by the 3D layer (three/) and the overlay (ui/). Neither side
 * imports the other (architecture §2); both read and write these.
 *
 * - The overlay can drive the camera (`cameraCommand`), the animation speed and skip, and the
 *   touch "confirm / rotate" flow (`pendingPlacement`, `confirmPlacement`, `rotatePlacement`).
 * - The board publishes what is under the pointer (`boardHover`) and whether the 3D scene is up.
 *
 * Picks themselves still flow through state/boardBridge.ts (`onPick`).
 *
 * Selection model (ux-plan §3.3, WP3): `selection` is the one inspected board piece (idle-mode
 * clicks set it, place/route/campaign modes clear it, Esc clears it); `selectionRelated` are the
 * pieces ringed faintly with it (sellers, reaching campaigns, reached houses); `inspectIds` is a
 * transient highlight (rail hover) that never touches `selection`.
 *
 * Candidate model: `activeCandidate` is the index into the current mode's `placements` that the
 * board shows as active (route mode: the solid ribbon; campaign mode: the ghost). Board hover and
 * `[` / `]` write it; the panel can write it too (`setActiveCandidate`) and the board follows.
 */
import { signal } from '@preact/signals';
import type { CampaignOrientation, FoodId, HouseOutlook, Placement } from '@fcm/engine';

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

// ---------------------------------------------------------------------------
// Selection, candidates, reasons (WP3)
// ---------------------------------------------------------------------------

export type SelectionKind = 'house' | 'restaurant' | 'campaign' | 'source' | 'entity';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

/** The board piece being inspected (idle-mode pick, log link, summary row). Null = none. */
export const selection = signal<Selection | null>(null);
/** Pieces ringed faintly with the selection (derived by the board controller in boardBridge.ts). */
export const selectionRelated = signal<readonly string[]>([]);
/** Engine outlook for a selected house (sellers ranked as dinnertime, campaigns reaching it). */
export const selectedOutlook = signal<HouseOutlook | null>(null);
/** Transient highlight (e.g. a player's pieces while hovering their rail panel). Does not touch `selection`. */
export const inspectIds = signal<readonly string[]>([]);

export function select(s: Selection | null): void {
  selection.value = s;
}

/**
 * Route / campaign / place modes: index into the mode's `placements` shown as active (-1 = none).
 * Route mode starts at 0; the board writes it on hover and `[` / `]`.
 */
export const activeCandidate = signal(-1);

/** Make candidate `i` active (panel row hover / ◀ ▶ buttons). The board redraws to match. */
export function setActiveCandidate(i: number): void {
  activeCandidate.value = i;
}

/** Bumped by `cycleCandidate`; the board steps the active candidate (and the staged one). */
export const cycleRequest = signal<{ by: number; n: number }>({ by: 0, n: 0 });

/** Step the active route / campaign candidate by `by` (-1 = previous, +1 = next), like `[` / `]`. */
export function cycleCandidate(by: number): void {
  cycleRequest.value = { by, n: cycleRequest.peek().n + 1 };
}

/** Why the square under the pointer is not a legal spot (engine `placementProblem`), or null. */
export const placementReason = signal<string | null>(null);

/** Campaign mode: the orientation the ghost uses (sticky; R / rotate flips it). */
export const ghostOrientation = signal<CampaignOrientation | null>(null);

/**
 * Campaign good shown in the reach preview chips ("+1 burger"). Panels set it when the player picks
 * the good; it can change while a ghost is staged (it does not affect legality).
 */
export const previewGood = signal<FoodId | null>(null);
