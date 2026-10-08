/**
 * Online rooms this browser has been in, kept in localStorage['fcm.games'] so the Home screen can
 * offer one-click resume ("Your games"). Updated by net/session.ts from room updates. Also the
 * saved hot-seat game (bottom of this file).
 */
import { signal } from '@preact/signals';
import { restoredConfig, type Action, type GameConfig, type PlayerId } from '@fcm/engine';
import type { BotLevel, RoomInfo, RoomStatus } from '@fcm/protocol';

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

// --- Hot-seat save ------------------------------------------------------------------------------

/**
 * The hot-seat game in progress on this device, kept in localStorage['fcm.hotseat'] after every
 * move so a reload, a discarded tab or an accidental close can resume it (Home → Resume, or a
 * reload on #/hotseat). Resume replays `actions` on `createGame(config, seed)`.
 */
export interface SavedHotseat {
  v: 1;
  config: GameConfig;
  seed: number;
  bots: Record<PlayerId, BotLevel>;
  actions: Action[];
  /** For the Home entry. */
  round: number;
  phase: string;
  over: boolean;
  savedAt: number;
}

export const HOTSEAT_KEY = 'fcm.hotseat';

function loadHotseat(): SavedHotseat | null {
  try {
    const raw = globalThis.localStorage?.getItem(HOTSEAT_KEY);
    const s = raw ? (JSON.parse(raw) as SavedHotseat) : null;
    if (!(s && s.v === 1 && s.config && Array.isArray(s.actions) && typeof s.seed === 'number')) return null;
    // A save from before rules versions existed replays under the version-1 rules.
    return { ...s, config: restoredConfig(s.config) };
  } catch {
    return null;
  }
}

export const savedHotseat = signal<SavedHotseat | null>(loadHotseat());

export function saveHotseat(s: Omit<SavedHotseat, 'v' | 'savedAt'>): void {
  const entry: SavedHotseat = { v: 1, ...s, savedAt: Date.now() };
  savedHotseat.value = entry;
  try {
    globalThis.localStorage?.setItem(HOTSEAT_KEY, JSON.stringify(entry));
  } catch {
    /* storage full or blocked: the game still runs, it just cannot be resumed */
  }
}

export function clearHotseat(): void {
  savedHotseat.value = null;
  try {
    globalThis.localStorage?.removeItem(HOTSEAT_KEY);
  } catch {
    /* storage unavailable */
  }
}
