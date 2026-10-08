/**
 * Client store (architecture §5.4): signals for connection, room, view, seq, me, manifest, legal,
 * prompt, draft and settings. `handleServerMessage` is the single reducer for everything the
 * transport delivers; transports never touch signals directly.
 *
 * Game events are not queued here: each message's events go straight to the board through
 * `boardBridge.setView(view, me, events)`; the 3D animator (three/animate.ts) plays each batch
 * within 1.5 s, fast-forwarding the previous one, so nothing accumulates. The overlay consumes events only as log lines and phase summaries.
 */
import { batch, computed, signal } from '@preact/signals';
import type { Action, GameEvent, GameView, LegalAction, ModuleManifest, PhaseKind, PlayerId, Prompt } from '@fcm/engine';
import type { BotLevel, RoomInfo, ServerMessage } from '@fcm/protocol';
import type { ConnectionStatus } from '../net/transport.js';
import { announce } from './announce.js';
import { seatColor } from '../theme.js';
import { boardBridge } from './boardBridge.js';
import { buildCatalog, type Catalog } from './catalog.js';
import { legalFor, promptFor } from './guidance.js';
import { describeEvent, type LogLine } from './log.js';
import type { OrgDraft } from './orgChart.js';

export type Mode = 'online' | 'hotseat' | 'dev' | 'tutorial';

export interface ChatLine {
  id: number;
  /** Sender (online); with `ts` and `text` it identifies a line replayed by `chat.history`. */
  clientId?: string;
  name: string;
  seat: number | null;
  text: string;
  ts: number;
  mine: boolean;
}

export interface Toast {
  id: number;
  tone: 'info' | 'ok' | 'error';
  text: string;
}

export interface Settings {
  name: string;
  /** Show the coordinate list under placement prompts even when a board is available. */
  placementList: boolean;
}

export const SETTINGS_KEY = 'fcm.settings';

function loadSettings(): Settings {
  const fallback: Settings = { name: '', placementList: false };
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) } : fallback;
  } catch {
    return fallback;
  }
}

// --- Core signals ------------------------------------------------------------
export const mode = signal<Mode | null>(null);
export const connection = signal<ConnectionStatus>('idle');
export const reconnectAttempt = signal(0);
export const clientId = signal<string | null>(null);
export const room = signal<RoomInfo | null>(null);
export const roomError = signal<string | null>(null);
export const view = signal<GameView | null>(null);
export const seq = signal(0);
export const me = signal<PlayerId | null>(null);
export const manifest = signal<ModuleManifest[]>([]);
/** Restructuring draft (OrgChart editor). Reset when the phase changes. */
export const draft = signal<OrgDraft | null>(null);
export const log = signal<LogLine[]>([]);
export const chat = signal<ChatLine[]>([]);
export const unreadChat = signal(0);
export const toasts = signal<Toast[]>([]);
/** Hot-seat: the device must be passed to this player before their view is shown. */
export const handoff = signal<{ to: PlayerId } | null>(null);
/** Sent but unanswered actions, by action id. */
export const pending = signal<Record<string, Action>>({});
/** The `expectedSeq` each pending action was sent with (see `trackPending`). */
const pendingSeq = new Map<string, number>();
/** Online: the server runs another build (a deploy since this tab loaded). The page must be reloaded. */
export const reloadRequired = signal(false);
export const settings = signal<Settings>(loadSettings());
/** Hot-seat bot seats (online ones come from `room.seats`). */
export const localBots = signal<Record<PlayerId, BotLevel>>({});

/** Events of one finished automatic/summary phase (Dinnertime, Payday, Marketing), for result cards. */
export interface PhaseSummary {
  id: number;
  round: number;
  phase: PhaseKind;
  events: GameEvent[];
}
export const SUMMARY_PHASES: readonly PhaseKind[] = ['dinnertime', 'payday', 'marketing'];
export const summaries = signal<PhaseSummary[]>([]);

// --- Derived -----------------------------------------------------------------
export const catalog = computed<Catalog>(() => buildCatalog(manifest.value, view.value?.config.modules ?? []));
export const prompt = computed<Prompt | null>(() => (view.value ? promptFor(view.value, me.value, manifest.value) : null));
export const legal = computed<LegalAction[]>(() => (view.value ? legalFor(view.value, me.value, manifest.value, catalog.value) : []));
export const myPlayer = computed(() => (view.value && me.value ? view.value.players[me.value] : undefined));
export const isMyTurn = computed(() => Boolean(me.value && view.value?.awaiting.players.includes(me.value)));
export const amHost = computed(() => Boolean(room.value && clientId.value && room.value.hostClientId === clientId.value));
export const mySeat = computed(() => room.value?.seats.find((s) => s.clientId !== null && s.clientId === clientId.value) ?? null);
/** Bot seats of the game in progress, by player id (online: from the room; hot-seat: local). */
export const botSeats = computed<Record<PlayerId, BotLevel>>(() => {
  const r = room.value;
  if (mode.value !== 'online' || !r || r.status === 'lobby') return localBots.value;
  const out: Record<PlayerId, BotLevel> = {};
  for (const s of r.seats) if (s.bot) out[s.playerId] = s.bot;
  return out;
});
/** Bots the engine is waiting on right now: shown as "thinking…". */
export const botsThinking = computed<PlayerId[]>(() => (view.value?.phase.kind === 'gameOver' ? [] : (view.value?.awaiting.players ?? []).filter((p) => botSeats.value[p])));

// --- Helpers -----------------------------------------------------------------
let nextLogId = 1;
let nextToastId = 1;
let nextChatId = 1;
let nextSummaryId = 1;
/** Events collected for the phase in progress. */
let phaseBuf: { phase: PhaseKind; round: number; events: GameEvent[] } | null = null;

function startPhaseBuffer(v: GameView | null): void {
  // Hot-seat sends a snapshot after every handoff: keep what was collected for the same phase.
  if (v && phaseBuf && phaseBuf.phase === v.phase.kind && phaseBuf.round === v.round) return;
  phaseBuf = v ? { phase: v.phase.kind, round: v.round, events: [] } : null;
}

/** Splits applied events at `phaseChanged` and keeps the ones of summary phases. */
function collectSummaries(prev: GameView | null, events: readonly GameEvent[]): void {
  if (!phaseBuf) startPhaseBuffer(prev);
  let round = phaseBuf?.round ?? prev?.round ?? 0;
  const done: PhaseSummary[] = [];
  for (const e of events) {
    if (e.type === 'roundStarted') round = e.round;
    // A lesson pause after an automatic phase (engine `tutorial` module) comes before the phase
    // ends: close its summary now so the lesson can replay it while paused.
    if (e.type === 'choicePending' && e.kind === 'continue' && phaseBuf && SUMMARY_PHASES.includes(phaseBuf.phase) && phaseBuf.events.length) {
      done.push({ id: nextSummaryId++, round: phaseBuf.round, phase: phaseBuf.phase, events: phaseBuf.events });
      phaseBuf = { phase: phaseBuf.phase, round: phaseBuf.round, events: [] };
      continue;
    }
    if (e.type === 'phaseChanged' || e.type === 'gameEnded') {
      if (phaseBuf && SUMMARY_PHASES.includes(phaseBuf.phase) && phaseBuf.events.length) {
        done.push({ id: nextSummaryId++, round: phaseBuf.round, phase: phaseBuf.phase, events: phaseBuf.events });
      }
      phaseBuf = e.type === 'phaseChanged' ? { phase: e.to.kind, round, events: [] } : null;
      continue;
    }
    phaseBuf?.events.push(e);
  }
  if (done.length) summaries.value = [...summaries.value, ...done].slice(-12);
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings.value));
  } catch {
    /* private mode */
  }
}

const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleToast(id: number, ms: number): void {
  if (typeof setTimeout === 'undefined' || ms <= 0) return;
  clearTimeout(toastTimers.get(id));
  toastTimers.set(id, setTimeout(() => dismissToast(id), ms));
}

/** Show a toast and read it to screen readers. Errors stay 10 s, and hover or focus holds any toast (WCAG 2.2.1). */
/**
 * Toast for a server or local rejection: plain words for codes that carry developer text
 * ("Expected seq 4, got 3"), and a neutral tone for harmless no-ops ("Nothing to undo").
 */
export function rejectionToast(code: string, message: string, id?: string): { text: string; tone: Toast['tone'] } {
  if (code === 'STALE') {
    return { text: id === 'undo' ? 'The game moved on while you were reconnecting, so your undo was not applied.' : 'The game moved on while you were reconnecting. Check the board and try again.', tone: 'info' };
  }
  if (code === 'PROTOCOL_MISMATCH' || code === 'RELOAD_REQUIRED') return { text: 'A new version of the game is out. Reload the page to keep playing; your seat is kept.', tone: 'error' };
  if (code === 'UNDO_UNAVAILABLE' || /^nothing (of yours )?to undo$/i.test(message)) return { text: 'Nothing to undo', tone: 'info' };
  return { text: message || code, tone: 'error' };
}

export function pushToast(text: string, tone: Toast['tone'] = 'info', ms = tone === 'error' ? 10_000 : 4200): void {
  const t: Toast = { id: nextToastId++, tone, text };
  toasts.value = [...toasts.value.slice(-3), t];
  announce(text, tone === 'error');
  scheduleToast(t.id, ms);
}

/** Pointer or focus on a toast holds it open; leaving gives it a few more seconds. */
export function holdToast(id: number, held: boolean): void {
  if (held) {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
  } else if (toasts.peek().some((t) => t.id === id)) scheduleToast(id, 4000);
}

export function dismissToast(id: number): void {
  clearTimeout(toastTimers.get(id));
  toastTimers.delete(id);
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/** Chat panel visibility, so unread counts only grow while it is closed. */
export const chatOpen = signal(false);

function appendLog(v: GameView, s: number, events: readonly GameEvent[]): void {
  const c = buildCatalog(manifest.value, v.config.modules);
  const lines: LogLine[] = [];
  let phase: string | null = null;
  for (const [i, e] of events.entries()) {
    if (e.type === 'phaseChanged') phase = e.to.kind;
    const d = describeEvent(e, v, c, events[i - 1], phase);
    if (d) lines.push({ ...d, id: nextLogId++, seq: s, round: v.round });
  }
  if (lines.length) log.value = [...log.value, ...lines].slice(-400);
}

/**
 * A resumed local game (net/session.ts): rebuild the results strips and log lines of the moves
 * replayed before the first snapshot, without animating them. Call before that snapshot arrives.
 */
export function restoreHistory(moves: readonly { seq: number; events: readonly GameEvent[]; view: GameView }[]): void {
  if (!moves.length) return;
  batch(() => {
    let prev: GameView | null = null;
    for (const m of moves) {
      collectSummaries(prev, m.events);
      appendLog(m.view, m.seq, m.events);
      prev = m.view;
    }
  });
}

export function addLocalLog(text: string, icon: LogLine['icon'] = 'info'): void {
  log.value = [...log.value, { id: nextLogId++, seq: seq.value, round: view.value?.round ?? 0, icon, text, player: null }];
}

/** Clears all game/room state (leaving a room, switching mode). Settings survive. */
export function resetStore(): void {
  batch(() => {
    mode.value = null;
    connection.value = 'idle';
    reconnectAttempt.value = 0;
    clientId.value = null;
    room.value = null;
    roomError.value = null;
    view.value = null;
    seq.value = 0;
    me.value = null;
    manifest.value = [];
    draft.value = null;
    log.value = [];
    chat.value = [];
    unreadChat.value = 0;
    toasts.value = [];
    handoff.value = null;
    pending.value = {};
    summaries.value = [];
    reloadRequired.value = false;
    localBots.value = {};
  });
  phaseBuf = null;
  pendingSeq.clear();
  boardBridge.setView(null, null, []);
}

/** Record a sent action until the server answers it (`game.applied` or `game.rejected`). */
export function trackPending(id: string, action: Action, expectedSeq: number): void {
  pendingSeq.set(id, expectedSeq);
  pending.value = { ...pending.value, [id]: action };
}

/** Forget pending actions (answered, timed out or superseded). */
export function dropPending(ids: readonly string[]): void {
  const gone = ids.filter((id) => id in pending.value);
  for (const id of ids) pendingSeq.delete(id);
  if (!gone.length) return;
  const next = { ...pending.value };
  for (const id of gone) delete next[id];
  pending.value = next;
}

/** Pending actions with the `expectedSeq` they were sent with (resent after a reconnect). */
export function pendingActions(): { id: string; action: Action; expectedSeq: number }[] {
  return Object.entries(pending.value).map(([id, action]) => ({ id, action, expectedSeq: pendingSeq.get(id) ?? seq.value }));
}

const chatKey = (l: { clientId?: string; ts: number; text: string }) => `${l.clientId ?? ''}|${l.ts}|${l.text}`;

export interface HandleResult {
  /** The client missed a message (seq gap): request `game.resync`. */
  resync?: boolean;
}

function setView(v: GameView, s: number): void {
  const prev = view.value;
  if (prev && (prev.phase.kind !== v.phase.kind || prev.round !== v.round)) draft.value = null;
  view.value = v;
  seq.value = s;
}

/** Seat colours from the server or a saved game, mapped to the current palette (theme.ts seatColor). */
function recolor(msg: ServerMessage): ServerMessage {
  const m = msg as ServerMessage & { view?: GameView | null; room?: RoomInfo | null };
  let out = m;
  if (m.view?.players && Object.values(m.view.players).some((p) => seatColor(p.color) !== p.color)) {
    const players = Object.fromEntries(Object.entries(m.view.players).map(([id, p]) => [id, { ...p, color: seatColor(p.color) }]));
    out = { ...out, view: { ...m.view, players } as GameView };
  }
  if (m.room?.seats?.some((x) => seatColor(x.color) !== x.color)) out = { ...out, room: { ...m.room, seats: m.room.seats.map((x) => ({ ...x, color: seatColor(x.color) })) } };
  return out as ServerMessage;
}

export function handleServerMessage(raw: ServerMessage): HandleResult {
  const msg = recolor(raw);
  switch (msg.t) {
    case 'welcome':
      batch(() => {
        clientId.value = msg.clientId;
        room.value = msg.room;
      });
      return {};
    case 'error':
      if (msg.code === 'ROOM_NOT_FOUND') roomError.value = msg.message || 'Room not found';
      // Another build on the server: a blocking "Reload" screen says it instead of a toast.
      if (msg.code === 'RELOAD_REQUIRED' || msg.code === 'PROTOCOL_MISMATCH') {
        reloadRequired.value = true;
        return {};
      }
      {
        const t = rejectionToast(msg.code, msg.message);
        pushToast(t.text, t.tone);
      }
      return {};
    case 'pong':
      return {};
    case 'room.update':
      room.value = msg.room;
      roomError.value = null;
      return {};
    case 'game.snapshot': {
      // Online, a snapshot behind what we already applied means the server lost moves (crash, no
      // flush): say so, and drop log lines for moves that no longer happened.
      const rewound = mode.value === 'online' && view.value !== null && msg.seq < seq.value;
      // An action sent before `msg.seq` was either applied (the snapshot includes it) or overtaken:
      // its own answer may never come (lost on a dropped socket), so stop waiting for it.
      dropPending(pendingActions().filter((p) => p.expectedSeq < msg.seq).map((p) => p.id));
      batch(() => {
        if (rewound) {
          log.value = log.value.filter((l) => l.seq <= msg.seq);
          pushToast('The server restarted and lost the latest move. Check the board and make it again if it was yours.', 'info', 8000);
        }
        manifest.value = msg.manifest;
        // Hot-seat hands the device to another player: their restructuring draft starts fresh.
        if (me.value !== msg.me) draft.value = null;
        me.value = msg.me;
        setView(msg.view, msg.seq);
        startPhaseBuffer(msg.view);
        if (log.value.length === 0) addLocalLog(msg.view.round ? `Joined at round ${msg.view.round}` : 'Game started');
      });
      boardBridge.setView(msg.view, msg.me, []);
      return {};
    }
    case 'game.applied': {
      if (msg.seq <= seq.value && view.value) return {};
      const gap = view.value !== null && msg.seq > seq.value + 1;
      const prev = view.value;
      batch(() => {
        collectSummaries(prev, msg.events);
        setView(msg.view, msg.seq);
        appendLog(msg.view, msg.seq, msg.events);
        if (msg.actionId) dropPending([msg.actionId]);
      });
      boardBridge.setView(msg.view, me.value, msg.events);
      return gap ? { resync: true } : {};
    }
    case 'game.rejected': {
      dropPending([msg.id]);
      // Lessons show the engine's reason in the coach strip instead (tutorial/runner.ts).
      if (mode.value !== 'tutorial') {
        const t = rejectionToast(msg.code, msg.message, msg.id);
        pushToast(t.text, t.tone);
      }
      return {};
    }
    case 'game.undone':
      batch(() => {
        setView(msg.view, msg.seq);
        startPhaseBuffer(msg.view);
        addLocalLog(`${msg.view.players[msg.by]?.name ?? msg.by} took back an action`, 'info');
      });
      boardBridge.setView(msg.view, me.value, []);
      return {};
    case 'chat': {
      const line: ChatLine = {
        id: nextChatId++,
        clientId: msg.from.clientId,
        name: msg.from.name,
        seat: msg.from.seat,
        text: msg.text,
        ts: msg.ts,
        mine: msg.from.clientId === clientId.value,
      };
      batch(() => {
        chat.value = [...chat.value, line].slice(-200);
        if (!chatOpen.value && !line.mine) unreadChat.value += 1;
      });
      return {};
    }
    case 'chat.history': {
      // The room's chat as the server keeps it. Lines already shown keep their ids; new ones that
      // came in while this client was away count as unread (not on a fresh page load).
      const known = new Map(chat.value.map((l) => [chatKey(l), l]));
      const reconnect = known.size > 0;
      let unread = 0;
      const lines = msg.lines.map((l): ChatLine => {
        const had = known.get(chatKey({ clientId: l.from.clientId, ts: l.ts, text: l.text }));
        if (had) return had;
        const mine = l.from.clientId === clientId.value;
        if (reconnect && !mine) unread++;
        return { id: nextChatId++, clientId: l.from.clientId, name: l.from.name, seat: l.from.seat, text: l.text, ts: l.ts, mine };
      });
      // Server notices (rollback) are not in the history: keep them.
      const notices = chat.value.filter((l) => l.clientId === 'server');
      batch(() => {
        chat.value = [...lines, ...notices].sort((a, b) => a.ts - b.ts).slice(-200);
        if (!chatOpen.value && unread) unreadChat.value += unread;
      });
      return {};
    }
  }
}
