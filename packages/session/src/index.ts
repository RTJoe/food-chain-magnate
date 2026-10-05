/**
 * @fcm/session — transport-agnostic room/game session logic (seats, undo, checkpoints,
 * redaction fan-out). Architecture §2, §4. Imports engine + protocol only.
 */
export const SESSION_PACKAGE = '@fcm/session';
export * from './room.js';
export * from './gameSession.js';
export * from './undo.js';
export * from './bots.js';
