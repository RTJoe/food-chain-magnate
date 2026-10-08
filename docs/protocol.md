# Wire protocol

Source of truth: `packages/protocol/src/messages.ts` and `room.ts` (TypeScript types are `z.infer` of the zod schemas). This page lists every message. Architecture context: `docs/architecture.md` §4.

## Transport

- WebSocket at `ws://<host>:<port>/ws` (default port 3000). Same origin as the client.
- Each frame is one JSON object with a string discriminator `t`.
- `PROTOCOL_VERSION = 1`. The client sends it in `hello`; a mismatch gets `error PROTOCOL_MISMATCH`.
- `clientVersion` is `ENGINE_VERSION`, plus `+<build id>` when the client bundle knows its build (git SHA). The server answers `error RELOAD_REQUIRED` when the engine version differs, or when both sides know their build id and they differ: an open tab from before a deploy runs old rules. The client stops reconnecting and asks the player to reload; the seat is kept.
- The protocol validates envelopes only. For `game.action` it checks that `action.type` is a known engine action type and `action.playerId` is a string. The server overwrites `playerId` from the seat. The engine validates everything else and answers with `game.rejected`.
- Max frame size: 256 KB.

## Client → Server

| `t` | Fields | Who | Notes |
|---|---|---|---|
| `hello` | `clientVersion: string` (`<engine version>[+<build id>]`), `protocol: number`, `sessionToken?: string`, `name?: string` | anyone | First message. A known `sessionToken` re-attaches the previous seat (§4.3). |
| `room.create` | `name: string` (1–24), `config?: Partial<RoomConfig>` | anyone | Creates a room; the sender becomes host and joins it. |
| `room.join` | `roomId: string` (5 chars, `A–Z` minus I/O, `2–9`), `name`, `spectate?: boolean` | anyone | Joins as unseated member, or spectator. |
| `room.leave` | — | member | Leaves the room (keeps the seat reserved while playing). |
| `room.sit` | `seat: number` | member | Lobby only. |
| `room.stand` | — | seated | Lobby only. |
| `room.ready` | `ready: boolean` | seated | Lobby only. |
| `room.config` | `config: RoomConfig` | host | Lobby only. |
| `room.kick` | `seat: number` | host | Frees a seat so another device can take it over. |
| `room.addBot` | `seat: number`, `level: 'easy' \| 'medium' \| 'hard'` | host | Lobby only. Puts a bot on an empty seat (or changes a bot seat's level). Bot seats are ready and connected. |
| `room.removeBot` | `seat: number` | host | Lobby only. Empties a bot seat. |
| `room.start` | — | host | Starts the game when all seated players are ready. |
| `game.action` | `id: string` (≤64, client-generated, idempotent), `expectedSeq: number`, `action: Action` | seated | Rejected if `expectedSeq` ≠ server seq. A repeated `id` is not applied twice. |
| `game.undo` | `expectedSeq: number` | seated | Undo own last undoable action (architecture §3.6). |
| `game.resync` | — | member | Server replies with `game.snapshot`. |
| `chat` | `text: string` (1–500) | member | |
| `ping` | `ts: number` | anyone | Server replies `pong`. |

## Server → Client

| `t` | Fields | Notes |
|---|---|---|
| `welcome` | `clientId`, `sessionToken`, `serverVersion` (`0.1.0`, or `0.1.0+<git sha>` when the build id is known), `protocol`, `room: RoomInfo \| null` | Reply to `hello`. Store `sessionToken` in `localStorage['fcm.session']`. |
| `error` | `code: ErrorCode`, `message`, `ref?` | Non-game errors. Codes: `BAD_MESSAGE`, `PROTOCOL_MISMATCH`, `RELOAD_REQUIRED`, `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `SEAT_TAKEN`, `NOT_HOST`, `NOT_SEATED`, `GAME_NOT_STARTED`, `CANNOT_START`, `RATE_LIMITED` (also after too many `room.join` misses on one connection), `NOT_IMPLEMENTED`, `INTERNAL`. |
| `pong` | `ts` (echo), `serverTs` | |
| `room.update` | `room: RoomInfo` | Any lobby/seat/connection change. |
| `game.snapshot` | `seq`, `view: GameView`, `manifest: ModuleManifest[]`, `me: PlayerId \| null` | On start, join, reconnect, resync. Full redacted view. |
| `game.applied` | `seq`, `actionId: string \| null`, `action`, `events: GameEvent[]`, `view` | After every applied action, per viewer (events and view redacted for that viewer). `actionId` is set only for the sender. |
| `game.rejected` | `id` (the action id), `code` (engine `RejectCode`, `INVALID_PAYLOAD` or `INTERNAL`), `message` | Only to the sender. |
| `game.undone` | `seq`, `view`, `by: PlayerId` | Game rolled back to `seq`. |
| `chat` | `from: { clientId, name, seat \| null }`, `text`, `ts` | To every connected member. Kept in the room's history. |
| `chat.history` | `lines: { from, text, ts }[]` | The room's last 100 chat messages, oldest first, after `welcome` (re-attached to a room) and after `room.join`. Persisted with the room, so it survives reloads and restarts. Replaces the client's chat list. |

## Shared types

- `RoomInfo { id, status: 'lobby' | 'playing' | 'finished', hostClientId, config: RoomConfig, seats: Seat[], spectators: Spectator[], createdAt }`
- `RoomConfig { seatCount: 2–6, modules: ModuleId[], options: ModuleOptions, intro, introMilestones }`
- `Seat { index, playerId, clientId | null, name | null, color, ready, connected, bot: BotLevel | null }`. A bot seat has `clientId: null`, `ready: true`, `connected: true`; the server plays it (docs/ai.md). Clients show "thinking…" while the engine awaits a bot seat.
- `Spectator { clientId, name, connected }`
- `Action`, `GameEvent`, `GameView`, `ModuleManifest`, `RejectCode`: `@fcm/engine` types (`packages/engine/src/types/`).

## Error codes in practice

The server handles every message above. `NOT_IMPLEMENTED` is only sent by the hot-seat `LocalTransport` (packages/client), for room messages that make no sense in a local game. A `game.action` that fails inside the server gets `game.rejected` with code `INTERNAL` (carrying the action id), so the client stops waiting for it; other failures get `error INTERNAL` with `ref` set to the message type.
