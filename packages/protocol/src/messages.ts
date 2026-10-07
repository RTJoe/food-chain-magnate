/**
 * Wire protocol (architecture §4.1; docs/protocol.md). JSON objects with a `t` discriminator.
 * The protocol validates envelopes; the engine validates action semantics.
 */
import { z } from 'zod';
import type { Action, GameEvent, GameView, ModuleManifest } from '@fcm/engine';
import { isActionType } from './actionTypes.js';
import { BotLevel, RoomCode, RoomConfig, RoomInfo } from './room.js';

export const PROTOCOL_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deepest JSON nesting accepted in an action (real ones are a few levels deep). */
export const MAX_ACTION_DEPTH = 16;

/** True if `v` nests at most `max` objects/arrays deep (iterative: safe on hostile input). */
export function withinDepth(v: unknown, max: number): boolean {
  const stack: [unknown, number][] = [[v, 0]];
  while (stack.length) {
    const [x, d] = stack.pop() as [unknown, number];
    if (typeof x !== 'object' || x === null) continue;
    if (d >= max) return false;
    for (const child of Object.values(x)) stack.push([child, d + 1]);
  }
  return true;
}

/**
 * Envelope check only: known `type`, string `playerId` (server overwrites it from the seat), bounded
 * nesting. The engine validates the rest; the server also caps the serialized size.
 */
export const ActionSchema = z.custom<Action>((v) => isObject(v) && isActionType(v.type) && typeof v.playerId === 'string' && withinDepth(v, MAX_ACTION_DEPTH), {
  message: 'Unknown or malformed action',
});
const ViewSchema = z.custom<GameView>(isObject);
const EventSchema = z.custom<GameEvent>((v) => isObject(v) && typeof v.type === 'string');
const ManifestSchema = z.custom<ModuleManifest>(isObject);

const Name = z.string().trim().min(1).max(24);
const Seq = z.number().int().min(0);

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export const ClientMessage = z.discriminatedUnion('t', [
  /** First message on every connection. `sessionToken` re-attaches a previous session (§4.3). */
  z.object({ t: z.literal('hello'), clientVersion: z.string(), protocol: z.number().int(), sessionToken: z.string().optional(), name: Name.optional() }),
  z.object({ t: z.literal('room.create'), name: Name, config: RoomConfig.partial().optional() }),
  z.object({ t: z.literal('room.join'), roomId: RoomCode, name: Name, spectate: z.boolean().optional() }),
  z.object({ t: z.literal('room.leave') }),
  z.object({ t: z.literal('room.sit'), seat: z.number().int().min(0) }),
  z.object({ t: z.literal('room.stand') }),
  z.object({ t: z.literal('room.ready'), ready: z.boolean() }),
  /** Host only. */
  z.object({ t: z.literal('room.config'), config: RoomConfig }),
  /** Host only: frees a seat so another device can take it over. */
  z.object({ t: z.literal('room.kick'), seat: z.number().int().min(0) }),
  /** Host only, lobby only: put a bot of `level` on an empty seat (or change a bot seat's level). */
  z.object({ t: z.literal('room.addBot'), seat: z.number().int().min(0), level: BotLevel }),
  /** Host only, lobby only: empty a bot seat. */
  z.object({ t: z.literal('room.removeBot'), seat: z.number().int().min(0) }),
  /** Host only. */
  z.object({ t: z.literal('room.start') }),
  /** `id` is client-generated and idempotent; `expectedSeq` must equal the server's seq. */
  z.object({ t: z.literal('game.action'), id: z.string().min(1).max(64), expectedSeq: Seq, action: ActionSchema }),
  z.object({ t: z.literal('game.undo'), expectedSeq: Seq }),
  z.object({ t: z.literal('game.resync') }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(500) }),
  z.object({ t: z.literal('ping'), ts: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export const ErrorCode = z.enum([
  'BAD_MESSAGE',
  'PROTOCOL_MISMATCH',
  'NOT_IN_ROOM',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'SEAT_TAKEN',
  'NOT_HOST',
  'NOT_SEATED',
  'GAME_NOT_STARTED',
  'CANNOT_START',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ServerMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('welcome'), clientId: z.string(), sessionToken: z.string(), serverVersion: z.string(), protocol: z.number().int(), room: RoomInfo.nullable() }),
  z.object({ t: z.literal('error'), code: ErrorCode, message: z.string(), ref: z.string().optional() }),
  z.object({ t: z.literal('pong'), ts: z.number(), serverTs: z.number() }),
  z.object({ t: z.literal('room.update'), room: RoomInfo }),
  /** Full redacted view (on join, start, reconnect, resync). */
  z.object({ t: z.literal('game.snapshot'), seq: Seq, view: ViewSchema, manifest: z.array(ManifestSchema), me: z.string().nullable() }),
  /** After every applied action: the action (redacted), its events (redacted) and the new view. */
  z.object({ t: z.literal('game.applied'), seq: Seq, actionId: z.string().nullable(), action: ActionSchema, events: z.array(EventSchema), view: ViewSchema }),
  z.object({ t: z.literal('game.rejected'), id: z.string(), code: z.string(), message: z.string() }),
  /** Undo rolled the game back to `seq`. */
  z.object({ t: z.literal('game.undone'), seq: Seq, view: ViewSchema, by: z.string() }),
  z.object({
    t: z.literal('chat'),
    from: z.object({ clientId: z.string(), name: z.string(), seat: z.number().int().nullable() }),
    text: z.string(),
    ts: z.number(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export type ClientMessageType = ClientMessage['t'];
export type ServerMessageType = ServerMessage['t'];
export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { t: T }>;
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { t: T }>;

/** Parse raw text from the socket. Returns null on invalid JSON or schema mismatch. */
export function parseClientMessage(raw: string): ClientMessage | null {
  return safeParse(ClientMessage, raw);
}
export function parseServerMessage(raw: string): ServerMessage | null {
  return safeParse(ServerMessage, raw);
}

function safeParse<T>(schema: z.ZodType<T>, raw: string): T | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = schema.safeParse(data);
  return r.success ? r.data : null;
}
