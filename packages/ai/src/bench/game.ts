/**
 * One bench game (docs/ai-strategy.md §8.1): every seat is a bot that only sees its redacted view.
 * Mirrors `runBotDetailed` (same input, same per-decision seed, same fallback) but keeps the
 * details the harness reports: thinking time, invalid answers, throws and rejections, and an
 * optional decision trace. No Node APIs here, so it also runs inline in tests.
 */
import type { Action, GameConfig, GameState, LegalAction, ModuleId, PlayerId } from '@fcm/engine';
import { applyAction, createGame, engine, redactFor } from '@fcm/engine';
import type { Bot, BotExplanation, BotLevel } from '../types.js';
import { createBot } from '../registry.js';
import { botInput, decisionSeed } from '../run.js';
import { fallbackAction } from '../heuristics.js';
import { viewState } from '../viewState.js';

export const ALL_KETCHUP: ModuleId[] = [
  'ketchup:newDistricts',
  'ketchup:lobbyists',
  'ketchup:newMilestones',
  'ketchup:coffee',
  'ketchup:kimchi',
  'ketchup:sushi',
  'ketchup:noodles',
  'ketchup:ketchup',
  'ketchup:fryChefs',
  'ketchup:massMarketeers',
  'ketchup:nightShift',
  'ketchup:ruralMarketeers',
  'ketchup:gourmetCritics',
  'ketchup:reservePrices',
  'ketchup:movieStars',
];

/** `--modules`: none | all | comma list (ids with or without the `ketchup:` prefix). */
export function parseModules(arg: string | undefined, players: number): ModuleId[] {
  const v = (arg ?? 'none').trim();
  if (v === '' || v === 'none') return players === 6 ? ['ketchup:sixPlayers'] : [];
  if (v === 'all') return players === 6 ? [...ALL_KETCHUP, 'ketchup:sixPlayers'] : [...ALL_KETCHUP];
  const ids = v.split(',').map((m) => (m.includes(':') ? m : `ketchup:${m}`) as ModuleId);
  if (players === 6 && !ids.includes('ketchup:sixPlayers')) ids.push('ketchup:sixPlayers');
  return ids;
}

export function benchConfig(players: number, modules: ModuleId[], intro = false): GameConfig {
  const colors = ['#b8352a', '#f2cf3f', '#2b62b8', '#5cc7b2', '#d77fc9', '#ef8a2f'];
  const chains = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc', 'siap_faji'] as const;
  return {
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `Seat ${i + 1}`, chain: chains[i] ?? 'gluttony_inc', color: colors[i] ?? '#000' })),
    modules,
    options: {},
    intro,
    introMilestones: false,
    map: { kind: 'random' },
  };
}

export interface SeatSpec {
  playerId: PlayerId;
  /** Tournament entity (e.g. "medium", or "A:easy" when both sides play the same level). */
  label: string;
  level: BotLevel;
}

export interface GameSpec {
  index: number;
  seed: number;
  rotation: number;
  seats: SeatSpec[];
  config: GameConfig;
  budgetMs: number;
  maxRounds: number;
  maxSteps: number;
  trace: boolean;
}

export interface SeatStats {
  decisions: number;
  /** Bot threw. */
  threw: number;
  /** Bot answered an action the engine rejects on its view (fallback sent instead). */
  invalid: number;
  /** Fallback actions sent (threw + invalid). */
  fallbacks: number;
  /** Actions the real state rejected (harness failure: game aborted, seat loses). */
  rejected: number;
}

export type GameEnd = 'gameOver' | 'cap' | 'rejected';

export interface GameResult {
  index: number;
  seed: number;
  rotation: number;
  seats: SeatSpec[];
  end: GameEnd;
  /** Engine ranking at game over; otherwise by cash (the offender last on a rejection). */
  ranking: PlayerId[];
  /** Finishing place per seat for wins and Elo (0 = first). A capped game is a draw: all 0. */
  places: Record<PlayerId, number>;
  /** Winner, or null for a capped game. */
  winner: PlayerId | null;
  cash: Record<PlayerId, number>;
  rounds: number;
  steps: number;
  wallMs: number;
  stats: Record<PlayerId, SeatStats>;
  /** Thinking time per seat and phase key ("working.marketing", "choice.coffeeShop", …), ms. */
  latency: Record<PlayerId, Record<string, number[]>>;
  /** First few problems (throws, invalid answers, rejections) for the report. */
  problems: string[];
}

/** One JSONL line per decision (docs/ai-strategy.md §8.3), after a header line per game. */
export interface TraceHeader {
  kind: 'game';
  index: number;
  seed: number;
  rotation: number;
  seats: SeatSpec[];
  config: GameConfig;
  budgetMs: number;
}

export interface TraceDecision {
  kind: 'decision';
  step: number;
  seq: number;
  seed: number;
  round: number;
  phase: string;
  stage: string | null;
  player: PlayerId;
  bot: string;
  level: BotLevel;
  ms: number;
  /** The action applied (the fallback when the bot's answer was unusable). Replays use it. */
  action: Action;
  chosen: { type: string; summary: string };
  /** The bot's own answer when it was replaced by the fallback. */
  botAction?: Action;
  fellBack: boolean;
  error?: string;
  legalCount: number;
  alternatives: { kind: LegalAction['kind']; type: string; label: string }[];
  explain?: Omit<BotExplanation, 'action'>;
}

export type TraceLine = TraceHeader | TraceDecision;

/** Phase key for latency breakdowns and traces. */
export function phaseKey(s: GameState): string {
  if (s.awaiting.kind === 'choice' && s.pending[0]) return `choice.${s.pending[0].kind}`;
  if (s.phase.kind === 'working' && s.turn) return `working.${s.turn.stage}`;
  return s.phase.kind;
}

/** Compact one-line description of an action (type plus its payload as JSON, truncated). */
export function summarizeAction(a: Action, max = 160): string {
  const { type: _type, playerId: _p, ...rest } = a as Action & Record<string, unknown>;
  const body = JSON.stringify(rest);
  const text = body === '{}' ? '' : body.length > max ? `${body.slice(0, max)}…` : body;
  return text;
}

const MAX_ALTERNATIVES = 40;
const MAX_PROBLEMS = 10;

function byCash(s: GameState, ids: PlayerId[]): PlayerId[] {
  const order = new Map(s.turnOrder.map((p, i) => [p, i]));
  return ids.slice().sort((a, b) => (s.players[b]?.cash ?? 0) - (s.players[a]?.cash ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export interface PlayGameOptions {
  /** Bot factory (default `createBot`); tests inject bots here. */
  makeBot?: (level: BotLevel) => Bot;
  /** Receives trace lines when `spec.trace` is on. */
  onTrace?: (line: TraceLine) => void;
  now?: () => number;
}

export function playGame(spec: GameSpec, opts: PlayGameOptions = {}): GameResult {
  const now = opts.now ?? (() => performance.now());
  const makeBot = opts.makeBot ?? createBot;
  const t0 = now();
  const bots = new Map<PlayerId, Bot>(spec.seats.map((s) => [s.playerId, makeBot(s.level)]));
  const seatOf = new Map(spec.seats.map((s) => [s.playerId, s]));
  const stats: Record<PlayerId, SeatStats> = {};
  const latency: Record<PlayerId, Record<string, number[]>> = {};
  for (const s of spec.seats) {
    stats[s.playerId] = { decisions: 0, threw: 0, invalid: 0, fallbacks: 0, rejected: 0 };
    latency[s.playerId] = {};
  }
  const problems: string[] = [];
  const problem = (msg: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(`game ${spec.index} (seed ${spec.seed}) ${msg}`);
  };
  const trace = spec.trace ? opts.onTrace : undefined;
  trace?.({ kind: 'game', index: spec.index, seed: spec.seed, rotation: spec.rotation, seats: spec.seats, config: spec.config, budgetMs: spec.budgetMs });

  let state = createGame(spec.config, spec.seed);
  let steps = 0;
  let offender: PlayerId | null = null;
  while (state.phase.kind !== 'gameOver' && state.round <= spec.maxRounds && steps < spec.maxSteps) {
    const who = state.awaiting.players[0];
    if (!who) throw new Error(`game ${spec.index}: nobody awaited in ${state.phase.kind}`);
    const seat = seatOf.get(who);
    const bot = bots.get(who);
    if (!seat || !bot) throw new Error(`game ${spec.index}: no bot for ${who}`);
    const key = phaseKey(state);
    const where = `step ${steps} r${state.round} ${key} ${who}(${seat.label})`;
    const input = botInput({ level: seat.level, view: redactFor(state, who), playerId: who, seed: decisionSeed(spec.seed, state.history.seq, who), budgetMs: spec.budgetMs }, engine);
    const vs = viewState(input.view);
    let answer: Action | null = null;
    let explanation: BotExplanation | undefined;
    let error: string | undefined;
    const tBot = now();
    try {
      if (trace && bot.explain) {
        explanation = bot.explain(input);
        answer = explanation.action;
      } else answer = bot.choose(input);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ms = now() - tBot;
    const st = stats[who]!;
    st.decisions++;
    (latency[who]![key] ??= []).push(Math.round(ms * 1000) / 1000);
    let action: Action | null = answer ? ({ ...answer, playerId: who } as Action) : null;
    let fellBack = false;
    if (error) {
      st.threw++;
      problem(`${where}: threw ${error}`);
    } else if (!action) {
      error = 'no action';
      st.invalid++;
      problem(`${where}: returned no action`);
    } else {
      const v = engine.validateAction(vs, action);
      if (!v.ok) {
        st.invalid++;
        error = `invalid: ${v.code} ${v.message}`;
        problem(`${where}: invalid ${action.type} (${v.code}: ${v.message})`);
      }
    }
    const botAction = action;
    if (error || !action) {
      st.fallbacks++;
      fellBack = true;
      action = fallbackAction(vs, who, engine, input.legal, input.rng);
    }
    if (trace) {
      const line: TraceDecision = {
        kind: 'decision',
        step: steps,
        seq: state.history.seq,
        seed: spec.seed,
        round: state.round,
        phase: key,
        stage: state.turn?.stage ?? null,
        player: who,
        bot: seat.label,
        level: seat.level,
        ms: Math.round(ms * 1000) / 1000,
        action,
        chosen: { type: action.type, summary: summarizeAction(action) },
        fellBack,
        legalCount: input.legal.length,
        alternatives: input.legal.slice(0, MAX_ALTERNATIVES).map((l) => ({ kind: l.kind, type: l.kind === 'ready' ? l.action.type : l.actionType, label: l.label })),
      };
      if (fellBack && botAction) line.botAction = botAction;
      if (error) line.error = error;
      if (explanation) {
        const { action: _a, ...rest } = explanation;
        line.explain = rest;
      }
      trace(line);
    }
    const applied = applyAction(state, action);
    if (!applied.ok) {
      st.rejected++;
      problem(`${where}: REJECTED ${action.type} ${applied.code} ${applied.message}`);
      offender = who;
      break;
    }
    state = applied.state;
    steps++;
  }

  const ids = spec.seats.map((s) => s.playerId);
  let end: GameEnd;
  let ranking: PlayerId[];
  const places: Record<PlayerId, number> = {};
  let winner: PlayerId | null;
  if (state.phase.kind === 'gameOver') {
    end = 'gameOver';
    ranking = state.phase.ranking.slice();
    ranking.forEach((p, i) => (places[p] = i));
    winner = ranking[0] ?? null;
  } else if (offender) {
    end = 'rejected';
    ranking = [...byCash(state, ids.filter((p) => p !== offender)), offender];
    ranking.forEach((p, i) => (places[p] = i));
    winner = ranking[0] ?? null;
  } else {
    end = 'cap';
    ranking = byCash(state, ids);
    for (const p of ids) places[p] = 0;
    winner = null;
  }
  return {
    index: spec.index,
    seed: spec.seed,
    rotation: spec.rotation,
    seats: spec.seats,
    end,
    ranking,
    places,
    winner,
    cash: Object.fromEntries(ids.map((p) => [p, state.players[p]?.cash ?? 0])),
    rounds: state.round,
    steps,
    wallMs: Math.round(now() - t0),
    stats,
    latency,
    problems,
  };
}
