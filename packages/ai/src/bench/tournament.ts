/**
 * Tournament schedule and aggregation (docs/ai-strategy.md §8.1–8.2). Pure: the Node pool, CLI
 * and gate build on it, and tests call it inline.
 */
import type { ModuleId, PlayerId } from '@fcm/engine';
import type { BotLevel } from '../types.js';
import { isBotLevel } from '../types.js';
import { hasBot } from '../registry.js';
import { benchConfig, playGame, type GameResult, type GameSpec, type PlayGameOptions, type SeatSpec } from './game.js';
import { latencyStats, multiplayerElo, wilson, type EloRating, type LatencyStats } from './stats.js';

/** A side in a tournament: one level on `seats` seats of every game. */
export interface Group {
  label: string;
  level: BotLevel;
  seats: number;
}

export interface TournamentOptions {
  groups: Group[];
  players: number;
  games: number;
  seed: number;
  modules: ModuleId[];
  intro: boolean;
  budgetMs: number;
  maxRounds: number;
  maxSteps: number;
  /** Every seat list is played in every cyclic rotation on the same map seed. */
  rotate: boolean;
  trace: boolean;
}

export const DEFAULTS = { players: 2, games: 200, seed: 1, budgetMs: 2000, maxRounds: 60, maxSteps: 20000 } as const;

function level(v: string): BotLevel {
  if (!isBotLevel(v)) throw new Error(`unknown bot level '${v}' (easy | medium | hard)`);
  return v;
}

/**
 * Groups from `--a X --b Y` (X on one seat, Y on the rest) or `--bots x,y,z` (one seat each,
 * grouped by level). When both sides play the same level they are labelled "A:x" / "B:x".
 */
export function buildGroups(o: { a?: string; b?: string; bots?: string; players: number }): Group[] {
  if (o.bots) {
    const levels = o.bots.split(',').map((s) => level(s.trim()));
    if (levels.length !== o.players) throw new Error(`--bots lists ${levels.length} bots for ${o.players} players`);
    const counts = new Map<BotLevel, number>();
    for (const l of levels) counts.set(l, (counts.get(l) ?? 0) + 1);
    return [...counts].map(([l, seats]) => ({ label: l, level: l, seats }));
  }
  const a = level(o.a ?? 'easy');
  const b = level(o.b ?? 'easy');
  if (o.players < 2 || o.players > 6) throw new Error('--players must be 2..6');
  const same = a === b;
  return [
    { label: same ? `A:${a}` : a, level: a, seats: 1 },
    { label: same ? `B:${b}` : b, level: b, seats: o.players - 1 },
  ];
}

export function schedule(o: TournamentOptions): GameSpec[] {
  const base: Group[] = o.groups.flatMap((g) => Array.from({ length: g.seats }, () => g));
  if (base.length !== o.players) throw new Error(`groups fill ${base.length} seats, expected ${o.players}`);
  const config = benchConfig(o.players, o.modules, o.intro);
  const rotations = o.rotate ? o.players : 1;
  return Array.from({ length: o.games }, (_, i) => {
    const rotation = i % rotations;
    const seats: SeatSpec[] = base.map((_, j) => {
      const g = base[(j - rotation + o.players) % o.players]!;
      return { playerId: `p${j + 1}`, label: g.label, level: g.level };
    });
    return { index: i, seed: o.seed + Math.floor(i / rotations), rotation, seats, config, budgetMs: o.budgetMs, maxRounds: o.maxRounds, maxSteps: o.maxSteps, trace: o.trace };
  });
}

/** Run a tournament in this thread (tests, `--workers 0`). */
export function runInline(o: TournamentOptions, opts: PlayGameOptions & { onResult?: (r: GameResult) => void } = {}): GameResult[] {
  return schedule(o).map((spec) => {
    const r = playGame(spec, opts);
    opts.onResult?.(r);
    return r;
  });
}

export interface GroupSummary {
  label: string;
  level: BotLevel;
  /** False when the level is not registered and plays as Easy. */
  registered: boolean;
  seats: number;
  games: number;
  wins: number;
  winRate: number;
  ci95: [number, number];
  /** Win rate if every seat were equally strong (seats / players). */
  expected: number;
  meanCash: number;
  /** Mean finishing place (1 = first), finished games only. */
  meanPlace: number;
  decisions: number;
  threw: number;
  invalid: number;
  internal: number;
  fallbacks: number;
  rejected: number;
  latency: LatencyStats;
  latencyByPhase: Record<string, LatencyStats>;
}

export interface HeadToHead {
  a: string;
  b: string;
  /** Seat pairs where a finished above b (draws and capped games count ½). */
  score: number;
  n: number;
  rate: number;
  ci95: [number, number];
}

export interface Summary {
  meta: {
    groups: Group[];
    players: number;
    games: number;
    seed: number;
    modules: ModuleId[];
    intro: boolean;
    budgetMs: number;
    maxRounds: number;
    rotate: boolean;
    workers?: number;
    elapsedMs?: number;
    date?: string;
  };
  groups: GroupSummary[];
  headToHead: HeadToHead[];
  elo: Record<string, EloRating>;
  games: {
    total: number;
    finished: number;
    capped: number;
    rejected: number;
    completionRate: number;
    /** Finished by game over within 40 rounds (design criterion), share of all games. */
    within40: number;
    meanRounds: number;
    maxRounds: number;
    /** Round each finished game ended in, by game index (completion criteria with other limits). */
    finishedRounds: number[];
    meanSteps: number;
    meanWallMs: number;
    /** Wins by seat (p1 = first in turn order at setup); a seat-order confound check. */
    winsBySeat: Record<PlayerId, number>;
  };
  problems: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(o: TournamentOptions, results: GameResult[]): Summary {
  const sorted = results.slice().sort((x, y) => x.index - y.index);
  const finished = sorted.filter((r) => r.end === 'gameOver');
  const groups: GroupSummary[] = o.groups.map((g) => {
    let wins = 0;
    const cash: number[] = [];
    const places: number[] = [];
    const lat: number[] = [];
    const byPhase: Record<string, number[]> = {};
    const t = { decisions: 0, threw: 0, invalid: 0, internal: 0, fallbacks: 0, rejected: 0 };
    for (const r of sorted) {
      if (r.winner && r.seats.find((s) => s.playerId === r.winner)?.label === g.label) wins++;
      for (const s of r.seats) {
        if (s.label !== g.label) continue;
        cash.push(r.cash[s.playerId] ?? 0);
        if (r.end === 'gameOver') places.push((r.places[s.playerId] ?? 0) + 1);
        const st = r.stats[s.playerId];
        if (st) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += st[k];
        for (const [phase, ms] of Object.entries(r.latency[s.playerId] ?? {})) {
          (byPhase[phase] ??= []).push(...ms);
          for (const m of ms) lat.push(m);
        }
      }
    }
    return {
      label: g.label,
      level: g.level,
      registered: g.level === 'easy' || hasBot(g.level),
      seats: g.seats,
      games: sorted.length,
      wins,
      winRate: sorted.length ? wins / sorted.length : 0,
      ci95: wilson(wins, sorted.length),
      expected: g.seats / o.players,
      meanCash: mean(cash),
      meanPlace: mean(places),
      ...t,
      latency: latencyStats(lat),
      latencyByPhase: Object.fromEntries(Object.entries(byPhase).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, latencyStats(v)])),
    };
  });

  const headToHead: HeadToHead[] = [];
  for (let i = 0; i < o.groups.length; i++) {
    for (let j = i + 1; j < o.groups.length; j++) {
      const a = o.groups[i]!.label;
      const b = o.groups[j]!.label;
      let score = 0;
      let n = 0;
      for (const r of sorted) {
        for (const sa of r.seats.filter((s) => s.label === a)) {
          for (const sb of r.seats.filter((s) => s.label === b)) {
            const pa = r.places[sa.playerId] ?? 0;
            const pb = r.places[sb.playerId] ?? 0;
            score += pa < pb ? 1 : pa === pb ? 0.5 : 0;
            n++;
          }
        }
      }
      headToHead.push({ a, b, score, n, rate: n ? score / n : 0, ci95: wilson(score, n) });
    }
  }

  const elo = multiplayerElo(sorted.map((r) => ({ places: r.seats.map((s) => ({ entity: s.label, place: r.places[s.playerId] ?? 0 })) })), { seed: o.seed });
  const winsBySeat: Record<PlayerId, number> = {};
  for (const r of sorted) if (r.winner) winsBySeat[r.winner] = (winsBySeat[r.winner] ?? 0) + 1;
  const rounds = finished.map((r) => r.rounds);
  return {
    meta: { groups: o.groups, players: o.players, games: o.games, seed: o.seed, modules: o.modules, intro: o.intro, budgetMs: o.budgetMs, maxRounds: o.maxRounds, rotate: o.rotate },
    groups,
    headToHead,
    elo,
    games: {
      total: sorted.length,
      finished: finished.length,
      capped: sorted.filter((r) => r.end === 'cap').length,
      rejected: sorted.filter((r) => r.end === 'rejected').length,
      completionRate: sorted.length ? finished.length / sorted.length : 0,
      within40: sorted.length ? finished.filter((r) => r.rounds <= 40).length / sorted.length : 0,
      meanRounds: mean(rounds),
      maxRounds: rounds.length ? Math.max(...rounds) : 0,
      finishedRounds: rounds,
      meanSteps: mean(sorted.map((r) => r.steps)),
      meanWallMs: mean(sorted.map((r) => r.wallMs)),
      winsBySeat,
    },
    problems: sorted.flatMap((r) => r.problems).slice(0, 20),
  };
}
