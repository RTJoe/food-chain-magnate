/**
 * CI-style gate over the design's success criteria (docs/ai-strategy.md §8.5).
 *
 *   npm run ai:gate                          quick CI profile (legality, completion, Medium >= 60 % vs Easy)
 *   npm run ai:gate -- --profile full        the full §8.5 table (long)
 *   npm run ai:gate -- --only medium-vs-easy --set medium-vs-easy.minWinRate=0.7 --set medium-vs-easy.games=40
 *   npm run ai:gate -- --config gate.json    checks from a file ({ "checks": [GateCheck, …] })
 *
 * Checks that need an unregistered level are skipped (failed with --strict). Exit code 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasBot } from '../registry.js';
import type { BotLevel } from '../types.js';
import { bool, num, parseArgs, str } from './args.js';
import { runBench, shortPath } from './cli.js';
import { parseModules } from './game.js';
import { defaultWorkers } from './pool.js';
import { buildGroups, DEFAULTS, type Summary, type TournamentOptions } from './tournament.js';

export interface GateCheck {
  name: string;
  /** `a` on one seat, `b` on the rest; or `bots` one level per seat. */
  a?: BotLevel;
  b?: BotLevel;
  bots?: BotLevel[];
  players: number;
  games: number;
  seed: number;
  budgetMs: number;
  /** none | all | comma list. */
  modules?: string;
  maxRounds?: number;
  /** Group whose win rate / latency is checked (default: the `a` side, or the first of `bots`). */
  subject?: BotLevel;
  minWinRate?: number;
  /** Lower bound of the Wilson 95 % interval. */
  minWinLower?: number;
  /** Across all seats (default 0 for both). */
  maxRejected?: number;
  maxFallbacks?: number;
  /** Share of games that end by game over within `completionRounds` (default: the round cap). */
  minCompletion?: number;
  completionRounds?: number;
  /** Subject's p95 thinking time per decision. */
  maxP95Ms?: number;
  /** Play the check twice and require identical games (ranking, cash, length). */
  deterministic?: boolean;
}

const base = { players: 2, seed: 1, budgetMs: 300 };

export const PROFILES: Record<string, GateCheck[]> = {
  /** §8.5 "CI gate": small, fixed seeds, noise-tolerant. */
  ci: [
    { ...base, name: 'easy-legality', a: 'easy', b: 'easy', games: 10, seed: 1000, modules: 'all', players: 3 },
    { ...base, name: 'easy-completion', a: 'easy', b: 'easy', games: 20, seed: 1, modules: 'all', minCompletion: 0.9, completionRounds: 40 },
    { ...base, name: 'medium-vs-easy', a: 'medium', b: 'easy', games: 20, seed: 2000, minWinRate: 0.6, minCompletion: 0.9 },
    { ...base, name: 'hard-vs-medium', a: 'hard', b: 'medium', games: 10, seed: 3000, minCompletion: 0.9 },
  ],
  /** The full §8.5 success-criteria table. */
  full: [
    { name: 'medium-vs-easy-2p', a: 'medium', b: 'easy', players: 2, games: 200, seed: 1, budgetMs: 2000, minWinRate: 0.8, minWinLower: 0.75, maxP95Ms: 50 },
    { name: 'medium-vs-easy-4p', a: 'medium', b: 'easy', players: 4, games: 100, seed: 1, budgetMs: 2000, minWinRate: 0.6 },
    { name: 'hard-vs-medium-2p', a: 'hard', b: 'medium', players: 2, games: 200, seed: 1, budgetMs: 2000, minWinRate: 0.65, minWinLower: 0.6, maxP95Ms: 2100 },
    { name: 'hard-vs-medium-3p', a: 'hard', b: 'medium', players: 3, games: 99, seed: 1, budgetMs: 2000, minWinRate: 0.5 },
    { name: 'easy-completion-2p', a: 'easy', b: 'easy', players: 2, games: 100, seed: 1, budgetMs: 500, modules: 'all', minCompletion: 0.9, completionRounds: 40 },
    { name: 'easy-completion-3p', a: 'easy', b: 'easy', players: 3, games: 99, seed: 1, budgetMs: 500, modules: 'all', minCompletion: 0.9, completionRounds: 40 },
    { name: 'medium-completion', a: 'medium', b: 'medium', players: 2, games: 100, seed: 1, budgetMs: 2000, minCompletion: 0.95, completionRounds: 40 },
    { name: 'ketchup-medium-vs-easy-3p', a: 'medium', b: 'easy', players: 3, games: 99, seed: 1, budgetMs: 2000, modules: 'all', minWinRate: 0.7 },
    { name: 'medium-determinism', a: 'medium', b: 'easy', players: 2, games: 20, seed: 500, budgetMs: 2000, deterministic: true },
  ],
};

export interface CriterionResult {
  criterion: string;
  ok: boolean;
  actual: string;
  target: string;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

export function levelsOf(c: GateCheck): BotLevel[] {
  return c.bots ?? [c.a ?? 'easy', c.b ?? 'easy'];
}

export function tournamentFor(c: GateCheck): TournamentOptions {
  const players = c.bots ? c.bots.length : c.players;
  return {
    groups: buildGroups({ a: c.a, b: c.b, bots: c.bots?.join(','), players }),
    players,
    games: c.games,
    seed: c.seed,
    modules: parseModules(c.modules, players),
    intro: false,
    budgetMs: c.budgetMs,
    maxRounds: c.maxRounds ?? DEFAULTS.maxRounds,
    maxSteps: DEFAULTS.maxSteps,
    rotate: true,
    trace: false,
  };
}

/** Evaluate a check's criteria on a finished tournament. */
export function evaluate(c: GateCheck, s: Summary): CriterionResult[] {
  const out: CriterionResult[] = [];
  const subjectLevel = c.subject ?? c.bots?.[0] ?? c.a ?? 'easy';
  const subject = s.groups.find((g) => g.level === subjectLevel) ?? s.groups[0]!;
  const total = (k: 'rejected' | 'fallbacks' | 'invalid' | 'threw') => s.groups.reduce((n, g) => n + g[k], 0);
  const maxRejected = c.maxRejected ?? 0;
  const maxFallbacks = c.maxFallbacks ?? 0;
  out.push({ criterion: 'rejected actions', ok: total('rejected') <= maxRejected, actual: String(total('rejected')), target: `<= ${maxRejected}` });
  out.push({ criterion: 'fallbacks (invalid + threw)', ok: total('fallbacks') <= maxFallbacks, actual: `${total('fallbacks')} (${total('invalid')} + ${total('threw')})`, target: `<= ${maxFallbacks}` });
  if (c.minWinRate !== undefined) out.push({ criterion: `${subject.label} win rate`, ok: subject.winRate >= c.minWinRate, actual: pct(subject.winRate), target: `>= ${pct(c.minWinRate)}` });
  if (c.minWinLower !== undefined) out.push({ criterion: `${subject.label} win rate CI lower bound`, ok: subject.ci95[0] >= c.minWinLower, actual: pct(subject.ci95[0]), target: `>= ${pct(c.minWinLower)}` });
  if (c.minCompletion !== undefined) {
    const within = c.completionRounds ?? s.meta.maxRounds;
    const rate = s.games.total ? s.games.finishedRounds.filter((r) => r <= within).length / s.games.total : 0;
    out.push({ criterion: `games over within ${within} rounds`, ok: rate >= c.minCompletion, actual: pct(rate), target: `>= ${pct(c.minCompletion)}` });
  }
  if (c.maxP95Ms !== undefined) out.push({ criterion: `${subject.label} p95 decision ms`, ok: subject.latency.p95 < c.maxP95Ms, actual: subject.latency.p95.toFixed(1), target: `< ${c.maxP95Ms}` });
  return out;
}

/** `--set name.field=value` overrides (numbers and booleans parsed). */
function applySet(checks: GateCheck[], sets: string[]): void {
  for (const s of sets) {
    const m = /^([^.=]+)\.([^=]+)=(.*)$/.exec(s);
    if (!m) throw new Error(`--set expects name.field=value, got '${s}'`);
    const [, name, field, raw] = m as unknown as [string, string, string, string];
    const targets = checks.filter((c) => name === '*' || c.name === name);
    if (!targets.length) throw new Error(`--set: no check named '${name}'`);
    const value: unknown = raw === 'true' ? true : raw === 'false' ? false : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    for (const t of targets) (t as unknown as Record<string, unknown>)[field] = value;
  }
}

function setFlags(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--set' && argv[i + 1]) out.push(argv[++i]!);
    else if (argv[i]!.startsWith('--set=')) out.push(argv[i]!.slice(6));
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const a = parseArgs(argv, ['strict', 'help']);
  if (bool(a, 'help')) {
    console.log('Usage: npm run ai:gate -- [--profile ci|full] [--config gate.json] [--only a,b] [--set name.field=value]… [--workers n] [--strict] [--out dir]');
    return;
  }
  const config = str(a, 'config');
  const checks: GateCheck[] = config
    ? (JSON.parse(readFileSync(config, 'utf8')) as { checks: GateCheck[] }).checks
    : structuredClone(PROFILES[str(a, 'profile') ?? 'ci'] ?? []);
  if (!checks.length) throw new Error(`no checks (profiles: ${Object.keys(PROFILES).join(', ')})`);
  applySet(checks, setFlags(argv));
  const only = str(a, 'only')?.split(',');
  const strict = bool(a, 'strict');
  const workers = num(a, 'workers', defaultWorkers());
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outRoot = str(a, 'out') ? resolve(str(a, 'out')!) : resolve(fileURLToPath(new URL('../../../..', import.meta.url)), 'packages/ai/runs', `${stamp}-gate`);
  const t0 = Date.now();
  let failed = 0;
  for (const c of checks) {
    if (only && !only.includes(c.name)) continue;
    const missing = [...new Set(levelsOf(c))].filter((l) => l !== 'easy' && !hasBot(l));
    if (missing.length) {
      console.log(`${strict ? 'FAIL' : 'SKIP'}  ${c.name}: ${missing.join(', ')} not registered`);
      if (strict) failed++;
      continue;
    }
    const o = tournamentFor(c);
    const run = await runBench(o, { workers, out: join(outRoot, c.name) });
    const results = evaluate(c, run.summary);
    if (run.crashes.length) results.push({ criterion: 'harness crashes', ok: false, actual: String(run.crashes.length), target: '0' });
    if (c.deterministic) {
      const again = await runBench(o, { workers, out: join(outRoot, `${c.name}-again`) });
      const key = (out: string) => readFileSync(join(out, 'games.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => {
        const g = JSON.parse(l) as Record<string, unknown>;
        return JSON.stringify([g.index, g.end, g.ranking, g.cash, g.rounds, g.steps]);
      }).join('\n');
      const same = key(run.out) === key(again.out);
      results.push({ criterion: 'identical games on replay', ok: same, actual: same ? 'identical' : 'differ', target: 'identical' });
    }
    const ok = results.every((r) => r.ok);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name} (${o.groups.map((g) => g.label + (g.seats > 1 ? ` x${g.seats}` : '')).join(' vs ')}, ${o.players}p, ${c.games} games, budget ${c.budgetMs} ms, ${((run.summary.meta.elapsedMs ?? 0) / 1000).toFixed(1)} s)`);
    for (const r of results) console.log(`        ${r.ok ? 'ok  ' : 'FAIL'} ${r.criterion}: ${r.actual} (target ${r.target})`);
    for (const p of run.summary.problems.slice(0, 5)) console.log(`        ! ${p}`);
  }
  console.log(`\n${failed ? `${failed} check(s) failed` : 'gate passed'} in ${((Date.now() - t0) / 1000).toFixed(1)} s; output ${shortPath(outRoot)}`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
