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
import { boardBridge } from './boardBridge.js';
import { buildCatalog, type Catalog } from './catalog.js';
import { legalFor, promptFor } from './guidance.js';
import { describeEvent, type LogLine } from './log.js';
import type { OrgDraft } from './orgChart.js';

export type Mode = 'online' | 'hotseat' | 'dev' | 'tutorial';

export interface ChatLine {
  id: number;
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

export function pushToast(text: string, tone: Toast['tone'] = 'info', ms = 4200): void {
  const t: Toast = { id: nextToastId++, tone, text };
  toasts.value = [...toasts.value.slice(-3), t];
  if (typeof setTimeout !== 'undefined' && ms > 0) setTimeout(() => dismissToast(t.id), ms);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/** Chat panel visibility, so unread counts only grow while it is closed. */
export const chatOpen = signal(false);

function appendLog(v: GameView, s: number, events: readonly GameEvent[]): void {
  const c = buildCatalog(manifest.value, v.config.modules);
  const lines: LogLine[] = [];
  for (const e of events) {
    const d = describeEvent(e, v, c);
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
    localBots.value = {};
  });
  phaseBuf = null;
  boardBridge.setView(null, null, []);
}

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

export function handleServerMessage(msg: ServerMessage): HandleResult {
  switch (msg.t) {
    case 'welcome':
      batch(() => {
        clientId.value = msg.clientId;
        room.value = msg.room;
      });
      return {};
    case 'error':
      if (msg.code === 'ROOM_NOT_FOUND') roomError.value = msg.message || 'Room not found';
      pushToast(msg.message || msg.code, 'error');
      return {};
    case 'pong':
      return {};
    case 'room.update':
      room.value = msg.room;
      roomError.value = null;
      return {};
    case 'game.snapshot':
      batch(() => {
        manifest.value = msg.manifest;
        // Hot-seat hands the device to another player: their restructuring draft starts fresh.
        if (me.value !== msg.me) draft.value = null;
        me.value = msg.me;
        setView(msg.view, msg.seq);
        startPhaseBuffer(msg.view);
        if (log.value.length === 0) addLocalLog(`Joined at round ${msg.view.round}`);
      });
      boardBridge.setView(msg.view, msg.me, []);
      return {};
    case 'game.applied': {
      if (msg.seq <= seq.value && view.value) return {};
      const gap = view.value !== null && msg.seq > seq.value + 1;
      const prev = view.value;
      batch(() => {
        collectSummaries(prev, msg.events);
        setView(msg.view, msg.seq);
        appendLog(msg.view, msg.seq, msg.events);
        if (msg.actionId && pending.value[msg.actionId]) {
          const { [msg.actionId]: _done, ...rest } = pending.value;
          pending.value = rest;
        }
      });
      boardBridge.setView(msg.view, me.value, msg.events);
      return gap ? { resync: true } : {};
    }
    case 'game.rejected': {
      const { [msg.id]: _gone, ...rest } = pending.value;
      pending.value = rest;
      // Lessons show the engine's reason in the coach strip instead (tutorial/runner.ts).
      if (mode.value !== 'tutorial') pushToast(msg.message || msg.code, 'error');
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
  }
}
