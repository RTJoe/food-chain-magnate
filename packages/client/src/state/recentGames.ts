/**
 * Online rooms this browser has been in, kept in localStorage['fcm.games'] so the Home screen can
 * offer one-click resume ("Your games"). Updated by net/session.ts from room updates.
 */
import { signal } from '@preact/signals';
import type { RoomInfo, RoomStatus } from '@fcm/protocol';

export interface RecentGame {
  /** Room code. */
  id: string;
  status: RoomStatus;
  /** Seated players' names (the room's display name). */
  players: string[];
  /** My seat index, or null if spectating. */
  seat: number | null;
  /** Last time we saw this room (ms). */
  lastSeen: number;
}

export const RECENT_GAMES_KEY = 'fcm.games';
const MAX_GAMES = 20;
/** Matches the server's default retention: older rooms are gone. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function load(): RecentGame[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_GAMES_KEY);
    const list = raw ? (JSON.parse(raw) as RecentGame[]) : [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return Array.isArray(list) ? list.filter((g) => g && typeof g.id === 'string' && g.lastSeen > cutoff) : [];
  } catch {
    return [];
  }
}

function save(list: RecentGame[]): void {
  recentGames.value = list;
  try {
    globalThis.localStorage?.setItem(RECENT_GAMES_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** Most recent first. */
export const recentGames = signal<RecentGame[]>(load());

export function rememberRoom(room: RoomInfo, myClientId: string | null): void {
  const seat = myClientId ? (room.seats.find((s) => s.clientId === myClientId)?.index ?? null) : null;
  const entry: RecentGame = {
    id: room.id,
    status: room.status,
    players: room.seats.flatMap((s) => (s.clientId && s.name ? [s.name] : [])),
    seat,
    lastSeen: Date.now(),
  };
  save([entry, ...recentGames.value.filter((g) => g.id !== room.id)].slice(0, MAX_GAMES));
}

export function forgetRoom(id: string): void {
  if (recentGames.value.some((g) => g.id === id)) save(recentGames.value.filter((g) => g.id !== id));
}
