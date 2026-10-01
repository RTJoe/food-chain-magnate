/**
 * Binds one transport to the store: handshake, session token, resync on reconnect, room and game
 * commands. UI components call these functions and never touch a transport directly.
 */
import { ENGINE_VERSION, type Action, type EngineApi, type GameConfig, type GameState, type PlayerId, type Viewer } from '@fcm/engine';
import { PROTOCOL_VERSION, type ClientMessage, type RoomConfig, type ServerMessage } from '@fcm/protocol';
import {
  clientId,
  connection,
  handleServerMessage,
  handoff,
  me,
  mode,
  pending,
  pushToast,
  reconnectAttempt,
  resetStore,
  room,
  seq,
  settings,
  type Mode,
} from '../state/store.js';
import { LocalTransport } from './localTransport.js';
import { SocketTransport } from './socketTransport.js';
import type { Transport } from './transport.js';

export const SESSION_KEY = 'fcm.session';

let transport: Transport | null = null;
let unsubs: (() => void)[] = [];
let actionCounter = 0;
/** Room to join once the handshake completes (deep link #/room/:id). */
let wantRoom: { id: string; spectate: boolean } | null = null;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const loadToken = (): string | undefined => storage()?.getItem(SESSION_KEY) ?? undefined;
const saveToken = (t: string) => t && storage()?.setItem(SESSION_KEY, t);

export function currentTransport(): Transport | null {
  return transport;
}

function attach(t: Transport, m: Mode): void {
  detach();
  resetStore();
  transport = t;
  mode.value = m;
  unsubs.push(
    t.onStatus((s) => {
      const wasDown = connection.value === 'reconnecting';
      connection.value = s;
      if (t instanceof SocketTransport) reconnectAttempt.value = t.attempt;
      if (s === 'open' && t.kind === 'socket') hello(wasDown);
    }),
    t.onMessage((msg) => {
      if (msg.t === 'welcome') {
        saveToken(msg.sessionToken);
        const want = wantRoom;
        if (msg.room) {
          wantRoom = null;
          // Re-attached to a game in progress: make sure we have the latest view.
          if (msg.room.status !== 'lobby') queueMicrotask(() => send({ t: 'game.resync' }));
        } else if (want) {
          wantRoom = null;
          queueMicrotask(() => send({ t: 'room.join', roomId: want.id, name: displayName(), spectate: want.spectate }));
        }
      }
      const r = handleServerMessage(msg);
      if (r.resync) send({ t: 'game.resync' });
      continueChain(msg);
    }),
  );
  if (t instanceof LocalTransport) unsubs.push(t.onHandoff((to) => (handoff.value = { to })));
}

function detach(): void {
  chains.clear();
  for (const u of unsubs) u();
  unsubs = [];
  transport?.close();
  transport = null;
}

function hello(reconnected: boolean): void {
  const token = loadToken();
  const name = settings.value.name.trim();
  send({ t: 'hello', clientVersion: ENGINE_VERSION, protocol: PROTOCOL_VERSION, ...(token ? { sessionToken: token } : {}), ...(name ? { name } : {}) });
  if (reconnected && room.value && room.value.status !== 'lobby') send({ t: 'game.resync' });
}

function send(msg: ClientMessage): void {
  transport?.send(msg);
}

export const displayName = (): string => settings.value.name.trim().slice(0, 24) || 'Player';

// --- Online --------------------------------------------------------------------

/** Connect to the server (idempotent). `joinRoom` is joined after the handshake unless already seated there. */
export function startOnline(joinRoom?: { id: string; spectate?: boolean }): void {
  if (joinRoom) wantRoom = { id: joinRoom.id, spectate: joinRoom.spectate ?? false };
  if (transport?.kind === 'socket' && connection.value !== 'closed') {
    if (joinRoom && room.value?.id !== joinRoom.id && connection.value === 'open') {
      wantRoom = null;
      send({ t: 'room.join', roomId: joinRoom.id, name: displayName(), spectate: joinRoom.spectate ?? false });
    }
    return;
  }
  const t = new SocketTransport();
  attach(t, 'online');
  t.connect();
}

export function reconnectNow(): void {
  if (transport instanceof SocketTransport) transport.reconnectNow();
}

export const createRoom = (config?: Partial<RoomConfig>) => send({ t: 'room.create', name: displayName(), ...(config ? { config } : {}) });
export const joinRoom = (roomId: string, spectate = false) => send({ t: 'room.join', roomId, name: displayName(), spectate });
export const leaveRoom = () => {
  send({ t: 'room.leave' });
  room.value = null;
};
export const sit = (seat: number) => send({ t: 'room.sit', seat });
export const stand = () => send({ t: 'room.stand' });
export const setReady = (ready: boolean) => send({ t: 'room.ready', ready });
export const setRoomConfig = (config: RoomConfig) => send({ t: 'room.config', config });
export const kick = (seat: number) => send({ t: 'room.kick', seat });
export const startGame = () => send({ t: 'room.start' });
export const sendChat = (text: string) => {
  const trimmed = text.trim();
  if (trimmed) send({ t: 'chat', text: trimmed.slice(0, 500) });
};

// --- Game ------------------------------------------------------------------------

/** Sends an action for `me` with the current `expectedSeq`. Returns the action id. */
export function act(action: Action): string | null {
  const who = me.value;
  if (!who) {
    pushToast('You are spectating', 'error');
    return null;
  }
  const id = `${clientId.value ?? 'c'}-${Date.now().toString(36)}-${(actionCounter++).toString(36)}`;
  const a = { ...action, playerId: who } as Action;
  pending.value = { ...pending.value, [id]: a };
  send({ t: 'game.action', id, expectedSeq: seq.value, action: a });
  return id;
}

/** Follow-up actions keyed by the id of the action they wait for (see `actChain`). */
const chains = new Map<string, Action[]>();

/**
 * Sends `actions` one after another: each waits until the previous one is applied (the server
 * checks `expectedSeq`, so they cannot be sent together). A rejection drops the rest.
 */
export function actChain(actions: Action[]): void {
  const [first, ...rest] = actions;
  if (!first) return;
  const id = act(first);
  if (id && rest.length) chains.set(id, rest);
}

function continueChain(msg: ServerMessage): void {
  const id = msg.t === 'game.applied' ? msg.actionId : msg.t === 'game.rejected' ? msg.id : undefined;
  if (!id) return;
  const rest = chains.get(id);
  if (!rest) return;
  chains.delete(id);
  if (msg.t === 'game.applied') queueMicrotask(() => actChain(rest));
}

export const undo = () => send({ t: 'game.undo', expectedSeq: seq.value });
export const resync = () => send({ t: 'game.resync' });

// --- Hot-seat and dev -------------------------------------------------------------

export function startHotseat(engine: EngineApi, config: GameConfig, seed?: number): void {
  const t = new LocalTransport({ engine, config, ...(seed !== undefined ? { seed } : {}), handoff: true });
  attach(t, 'hotseat');
  t.connect();
}

export function startFixture(engine: EngineApi, state: GameState, viewer: Viewer): void {
  const t = new LocalTransport({ engine, state, viewer, handoff: false });
  attach(t, 'dev');
  t.connect();
}

export function setDevViewer(viewer: Viewer): void {
  if (transport instanceof LocalTransport) transport.setViewer(viewer);
}

export function acceptHandoff(): void {
  const h = handoff.value;
  if (!h || !(transport instanceof LocalTransport)) return;
  handoff.value = null;
  transport.acceptHandoff(h.to as PlayerId);
}

export function endSession(): void {
  detach();
  resetStore();
  wantRoom = null;
}
