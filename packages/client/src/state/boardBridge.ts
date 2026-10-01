/**
 * Board bridge: the only contract between the 2D overlay (ui/) and the board renderer.
 *
 * The overlay never imports the 3D layer and the 3D layer never imports ui/ (architecture §2).
 * The 3D layer (packages/client/src/three/) implements `BoardBridge` and calls
 * `registerBoardBridge(impl)` once its scene is mounted into `#board-root`. Until then (or if it
 * unregisters) the overlay shows its own lightweight 2D board (ui/board2d), which implements the
 * same interface.
 *
 * Flow:
 * - The store calls `setView(view, me, events)` after every snapshot/applied message. `events` are
 *   the new (redacted) events since the previous call, for animation; empty on snapshots.
 * - When the player must pick something on the board, the overlay calls
 *   `setInteractionMode({ kind: 'place', ... })` with the engine's legal placements. The board
 *   renders ghosts/highlights, and reports the chosen one through `onPick` listeners as
 *   `{ kind: 'placement', placement }` (the exact object from `placements`). Escape/cancel on the
 *   board reports `{ kind: 'cancel' }`.
 * - `setInteractionMode({ kind: 'idle' })` ends picking. `inspect` highlights things (e.g. a
 *   player's restaurants when hovering their panel) without picking.
 * - Clicking a board object outside of placement mode may report `{ kind: 'object', id }` (house,
 *   restaurant, campaign, entity id) so the overlay can show details.
 */
import { signal } from '@preact/signals';
import type { GameEvent, GameView, Placement, PlacementKind, PlayerId } from '@fcm/engine';

export type InteractionMode =
  | { kind: 'idle' }
  | {
      kind: 'place';
      /** What is being placed (for the ghost mesh). */
      placementKind: PlacementKind;
      /** Legal placements from the engine; pick exactly one of these objects. */
      placements: Placement[];
      /** Short instruction shown near the cursor ("Place your restaurant"). */
      label: string;
      /** Owner colour for ghosts. */
      color: string;
    }
  | { kind: 'inspect'; ids: string[] };

export type BoardPick = { kind: 'placement'; placement: Placement } | { kind: 'cancel' } | { kind: 'object'; id: string };

export interface BoardBridge {
  setView(view: GameView | null, me: PlayerId | null, events: readonly GameEvent[]): void;
  setInteractionMode(mode: InteractionMode): void;
  /** Subscribe to picks. Returns an unsubscribe function. */
  onPick(listener: (pick: BoardPick) => void): () => void;
}

/** Name of the registered renderer ('3d', '2d') or null. The overlay shows the 2D board while this is not '3d'. */
export const boardRenderer = signal<string | null>(null);
/** Current mode, mirrored for overlay components (placement hints, cancel button). */
export const interactionMode = signal<InteractionMode>({ kind: 'idle' });

let impl: BoardBridge | null = null;
let last: { view: GameView | null; me: PlayerId | null } = { view: null, me: null };
const pickListeners = new Set<(p: BoardPick) => void>();
let unsubscribeImpl: (() => void) | null = null;

/** Called by the board layer. Returns an unregister function. */
export function registerBoardBridge(bridge: BoardBridge, name = '3d'): () => void {
  unsubscribeImpl?.();
  impl = bridge;
  boardRenderer.value = name;
  unsubscribeImpl = bridge.onPick((p) => emitPick(p));
  bridge.setView(last.view, last.me, []);
  bridge.setInteractionMode(interactionMode.value);
  return () => {
    if (impl !== bridge) return;
    unsubscribeImpl?.();
    unsubscribeImpl = null;
    impl = null;
    boardRenderer.value = null;
  };
}

export function emitPick(p: BoardPick): void {
  for (const l of [...pickListeners]) l(p);
}

/** What the overlay uses. Safe to call with no renderer registered. */
export const boardBridge: BoardBridge = {
  setView(view, me, events) {
    last = { view, me };
    impl?.setView(view, me, events);
  },
  setInteractionMode(mode) {
    interactionMode.value = mode;
    impl?.setInteractionMode(mode);
  },
  onPick(listener) {
    pickListeners.add(listener);
    return () => pickListeners.delete(listener);
  },
};
