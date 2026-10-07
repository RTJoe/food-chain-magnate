/** View-only UI state (tabs, sheets, selections). Game state lives in state/store.ts. */
import { signal } from '@preact/signals';
import type { LegalAction, PlayerId, Uid } from '@fcm/engine';

export type DockTab = 'turn' | 'company' | 'market' | 'milestones' | 'log' | 'chat';

export const dockTab = signal<DockTab>('turn');
/** Mobile bottom sheet expanded. */
export const sheetOpen = signal(false);
/** Player whose company the Company tab shows (null = me, or the first player). */
export const companyPlayer = signal<PlayerId | null>(null);
export const menuOpen = signal(false);
/**
 * Set on the first Tab press of the session: the player is using the keyboard, so placement
 * prompts list every board spot as buttons too (the "List placements" setting, switched on).
 */
export const keyboardUser = signal(false);
/** Prompt key whose modal the player minimised (payday, freezer, game over). */
export const minimisedModal = signal<string | null>(null);

/** Working-phase picker: chosen card and the action being composed. */
export interface WorkSelection {
  cardUid: Uid | null;
  action: LegalAction | null;
}
export const workSelection = signal<WorkSelection>({ cardUid: null, action: null });

export function resetWorkSelection(): void {
  workSelection.value = { cardUid: null, action: null };
}

/** Highest phase summary id the player has dismissed. */
export const seenSummary = signal(0);
/** Summary shown in the results card (null = latest unseen). */
export const openSummary = signal<number | null>(null);
