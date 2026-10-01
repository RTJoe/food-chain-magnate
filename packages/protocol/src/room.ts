import { z } from 'zod';
import type { ModuleId, ModuleOptions } from '@fcm/engine';

/** 5-char room code (architecture §4.2): unambiguous upper-case letters and digits. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RoomCode = z.string().regex(/^[A-HJ-NP-Z2-9]{5}$/);

export const RoomStatus = z.enum(['lobby', 'playing', 'finished']);
export type RoomStatus = z.infer<typeof RoomStatus>;

/** Lobby-editable game settings (host only). Becomes the engine `GameConfig` at start. */
export const RoomConfig = z.object({
  /** 2–6 seats. */
  seatCount: z.number().int().min(2).max(6),
  modules: z.array(z.custom<ModuleId>((v) => typeof v === 'string')),
  options: z.custom<ModuleOptions>((v) => typeof v === 'object' && v !== null && !Array.isArray(v)),
  intro: z.boolean(),
  introMilestones: z.boolean(),
});
export type RoomConfig = z.infer<typeof RoomConfig>;

export const Seat = z.object({
  index: z.number().int().min(0),
  /** Engine player id once the game starts (`p1`...). */
  playerId: z.string(),
  clientId: z.string().nullable(),
  name: z.string().nullable(),
  color: z.string(),
  ready: z.boolean(),
  connected: z.boolean(),
});
export type Seat = z.infer<typeof Seat>;

export const Spectator = z.object({ clientId: z.string(), name: z.string(), connected: z.boolean() });
export type Spectator = z.infer<typeof Spectator>;

export const RoomInfo = z.object({
  id: RoomCode,
  status: RoomStatus,
  hostClientId: z.string(),
  config: RoomConfig,
  seats: z.array(Seat),
  spectators: z.array(Spectator),
  createdAt: z.number(),
});
export type RoomInfo = z.infer<typeof RoomInfo>;
