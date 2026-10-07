/** Connection banner wording (online play). Pure, so it can be tested without a DOM. */
import type { ConnectionStatus } from '../net/transport.js';

export interface BannerState {
  text: string;
  /** Button label, or null for none. */
  action: string | null;
  tone: 'warn' | 'info';
}

export function connectionBanner(status: ConnectionStatus, attempt: number, replaced: boolean): BannerState | null {
  if (status === 'open' || status === 'idle') return null;
  if (status === 'closed' && replaced) return { text: 'This game is open in another tab.', action: 'Use here', tone: 'info' };
  if (status === 'connecting') return { text: 'Connecting to the server…', action: null, tone: 'warn' };
  if (status === 'reconnecting') return { text: `Connection lost. Reconnecting${attempt > 1 ? ` (attempt ${attempt})` : ''}…`, action: 'Retry now', tone: 'warn' };
  return { text: 'Disconnected from the server.', action: 'Retry now', tone: 'warn' };
}

/**
 * A running hot-seat game lives only in this tab's memory: ending it from the menu asks first, and a
 * reload or navigation away warns. Not once the game is over.
 */
export function hotseatAtRisk(mode: string | null, hasView: boolean, gameOver: boolean): boolean {
  return mode === 'hotseat' && hasView && !gameOver;
}

export const END_HOTSEAT_CONFIRM = 'End this game? A hot-seat game is not saved, so it cannot be resumed.';
