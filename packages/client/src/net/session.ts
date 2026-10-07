/**
 * Binds one transport to the store: handshake, session token, resync on reconnect, room and game
 * commands. UI components call these functions and never touch a transport directly.
 */
import { ENGINE_VERSION, type Action, type EngineApi, type GameConfig, type GameState, type PlayerId, type Viewer } from '@fcm/engine';
import { PROTOCOL_VERSION, type BotLevel, type ClientMessage, type RoomConfig, type ServerMessage } from '@fcm/protocol';
import {
  clientId,
  connection,
  handleServerMessage,
  handoff,
  localBots,
  me,
  mode,
  pending,
  pushToast,
  reconnectAttempt,
  resetStore,
  restoreHistory,
  room,
  seq,
  settings,
  type Mode,
} from '../state/store.js';
import { clearHotseat, forgetRoom, rememberRoom, saveHotseat, type SavedHotseat } from '../state/recentGames.js';
import { LocalTransport, type ActResult } from './localTransport.js';
import { workerBotRunner } from './botRunner.js';
import { SocketTransport } from './socketTransport.js';
import type { Transport } from './transport.js';

export const SESSION_KEY = 'fcm.session';

let transport: Transport | null = null;
let unsubs: (() => void)[] = [];
let actionCounter = 0;
/** Room to join once the handshake completes (deep link #/room/:id). */
let wantRoom: { id: string; spectate: boolean } | null = null;
/** Last room we asked to join (to forget it from "Your games" if the server no longer has it). */
let joiningRoom: string | null = null;

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
      if (s === 'closed' && t instanceof SocketTransport && t.replaced) {
        pushToast('This game is open in another tab or window. Press "Use here" to play here instead.', 'info', 8000);
      }
      if (s === 'open' && t.kind === 'socket') hello(wasDown);
    }),
    t.onMessage((incoming) => {
      let msg = incoming;
      if (msg.t === 'welcome') {
        saveToken(msg.sessionToken);
        const want = wantRoom;
        wantRoom = null;
        if (msg.room && (!want || want.id === msg.room.id)) {
          // Re-attached to a game in progress: make sure we have the latest view.
          if (msg.room.status !== 'lobby') queueMicrotask(() => send({ t: 'game.resync' }));
        } else if (want) {
          // Asked for another room than the one the server re-attached: go there instead.
          if (msg.room) msg = { ...msg, room: null };
          queueMicrotask(() => sendJoin(want.id, want.spectate));
        }
      }
      if (t.kind === 'socket') trackRoom(msg);
      const r = handleServerMessage(msg);
      if (r.resync) send({ t: 'game.resync' });
      continueChain(msg);
    }),
  );
  if (t instanceof LocalTransport) unsubs.push(t.onHandoff((to) => (handoff.value = { to })));
}

/** Keep "Your games" (state/recentGames) in sync with what the server tells us. */
function trackRoom(msg: ServerMessage): void {
  if (msg.t === 'welcome' && msg.room) rememberRoom(msg.room, msg.clientId);
  else if (msg.t === 'room.update') {
    if (msg.room.id === joiningRoom) joiningRoom = null;
    rememberRoom(msg.room, clientId.value);
  } else if (msg.t === 'error' && msg.code === 'ROOM_NOT_FOUND' && joiningRoom) {
    forgetRoom(joiningRoom);
    joiningRoom = null;
  }
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
      sendJoin(joinRoom.id, joinRoom.spectate ?? false);
    }
    return;
  }
  const t = new SocketTransport();
  attach(t, 'online');
  t.connect();
}

/** True when the server closed this socket because another tab took the session (close code 4000). */
export const replacedElsewhere = (): boolean => transport instanceof SocketTransport && transport.replaced;

export function reconnectNow(): void {
  if (transport instanceof SocketTransport) transport.reconnectNow();
}

export const createRoom = (config?: Partial<RoomConfig>) => send({ t: 'room.create', name: displayName(), ...(config ? { config } : {}) });
function sendJoin(roomId: string, spectate: boolean): void {
  joiningRoom = roomId;
  send({ t: 'room.join', roomId, name: displayName(), spectate });
}
export const joinRoom = (roomId: string, spectate = false) => sendJoin(roomId, spectate);
export const leaveRoom = () => {
  // Leaving a lobby frees the seat, so there is nothing to resume. A game in progress keeps it.
  if (room.value?.status === 'lobby') forgetRoom(room.value.id);
  send({ t: 'room.leave' });
  room.value = null;
};
export const sit = (seat: number) => send({ t: 'room.sit', seat });
export const stand = () => send({ t: 'room.stand' });
export const setReady = (ready: boolean) => send({ t: 'room.ready', ready });
export const setRoomConfig = (config: RoomConfig) => send({ t: 'room.config', config });
export const kick = (seat: number) => send({ t: 'room.kick', seat });
export const addBot = (seat: number, level: BotLevel) => send({ t: 'room.addBot', seat, level });
export const removeBot = (seat: number) => send({ t: 'room.removeBot', seat });
export const startGame = () => send({ t: 'room.start' });
export const sendChat = (text: string) => {
  const trimmed = text.trim();
  if (trimmed) send({ t: 'chat', text: trimmed.slice(0, 500) });
};

// --- Game ------------------------------------------------------------------------

/**
 * Lessons (docs/tutorial-plan.md §4.2) narrow what the learner may send: the gate returns null to
 * let an action through or the reason it is not part of this step. The engine stays the only judge
 * of legality: a gated-in action can still be rejected.
 */
export type ActionGate = (action: Action) => string | null;
let actionGate: { gate: ActionGate; blocked: (reason: string, action: Action) => void } | null = null;

export function setActionGate(gate: ActionGate | null, blocked: (reason: string, action: Action) => void = () => {}): void {
  actionGate = gate ? { gate, blocked } : null;
}

/** Sends an action for `me` with the current `expectedSeq`. Returns the action id. */
export function act(action: Action): string | null {
  const who = me.value;
  if (!who) {
    pushToast('You are spectating', 'error');
    return null;
  }
  if (actionGate) {
    const reason = actionGate.gate({ ...action, playerId: who } as Action);
    if (reason) {
      actionGate.blocked(reason, action);
      return null;
    }
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

/** Hot-seat game; `bots` marks seats played by bots (computed in a Web Worker). `prelude` replays a saved game. */
export function startHotseat(engine: EngineApi, config: GameConfig, seed?: number, bots: Record<PlayerId, BotLevel> = {}, prelude: Action[] = []): void {
  const withBots = Object.keys(bots).length > 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const d = transport === t ? t.saveData() : null;
    if (d) saveHotseat({ ...d, bots: { ...bots } });
  };
  const t: LocalTransport = new LocalTransport({
    engine,
    config,
    ...(seed !== undefined ? { seed } : {}),
    handoff: true,
    ...(withBots ? { bots, botRunner: workerBotRunner() } : {}),
    ...(prelude.length ? { prelude } : {}),
    // Every move is saved (debounced; at once when the page hides) so a reload can resume.
    onChange: () => {
      if (!timer) timer = setTimeout(save, 400);
    },
  });
  attach(t, 'hotseat');
  localBots.value = { ...bots };
  const hide = () => (timer || document.visibilityState === 'hidden' ? save() : undefined);
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', hide);
  unsubs.push(() => {
    window.removeEventListener('pagehide', hide);
    document.removeEventListener('visibilitychange', hide);
    if (timer) save();
  });
  t.connect();
  // Resumed: the phases already played this round get their results strips and log lines back.
  restoreHistory(t.replayed);
  save();
}

/** Resume the saved hot-seat game (state/recentGames). False (and the save dropped) when it no longer replays. */
export function resumeHotseat(engine: EngineApi, saved: SavedHotseat): boolean {
  try {
    startHotseat(engine, saved.config, saved.seed, saved.bots, saved.actions);
    return true;
  } catch (e) {
    console.warn('hot-seat resume failed', e);
    endSession();
    clearHotseat();
    pushToast('The saved hot-seat game could not be restored', 'error');
    return false;
  }
}

export function startFixture(engine: EngineApi, state: GameState, viewer: Viewer): void {
  const t = new LocalTransport({ engine, state, viewer, handoff: false });
  attach(t, 'dev');
  t.connect();
}

export interface TutorialStart {
  /** Scenario state (tutorial module already enabled). */
  state: GameState;
  /** The learner's seat: the fixed viewer, never handed off. */
  learner: PlayerId;
  /** Seats the lesson script moves through `scriptedAct`. */
  scripted?: PlayerId[];
  /** Bot seats (Easy bot in a Web Worker). */
  bots?: Record<PlayerId, BotLevel>;
  /** Actions to replay before the first snapshot (resume). */
  prelude?: Action[];
  botDelay?: number | { min: number; max: number };
}

/** Lesson game (docs/tutorial-plan.md §4.2): fixed learner view, scripted and bot opponents, no handoffs, no undo. */
export function startTutorial(engine: EngineApi, opts: TutorialStart): LocalTransport {
  const bots = opts.bots ?? {};
  const withBots = Object.keys(bots).length > 0;
  const t = new LocalTransport({
    engine,
    state: opts.state,
    viewer: opts.learner,
    handoff: false,
    undo: false,
    scripted: opts.scripted ?? [],
    prelude: opts.prelude ?? [],
    ...(withBots ? { bots, botRunner: workerBotRunner(), ...(opts.botDelay !== undefined ? { botDelay: opts.botDelay } : {}) } : {}),
  });
  attach(t, 'tutorial');
  localBots.value = { ...bots };
  t.connect();
  return t;
}

/** Tutorial: apply a scripted opponent's move (see `LocalTransport.actFor`). */
export function scriptedAct(player: PlayerId, action: Action): ActResult {
  if (!(transport instanceof LocalTransport)) return { ok: false, code: 'NOT_LOCAL', message: 'No local game' };
  return transport.actFor(player, action);
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
  actionGate = null;
  detach();
  resetStore();
  wantRoom = null;
}
