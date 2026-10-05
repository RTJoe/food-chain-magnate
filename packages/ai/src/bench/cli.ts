/**
 * Tournament CLI (docs/ai-strategy.md §8.1).
 *
 *   npm run ai:bench -- --a medium --b easy --players 2 --games 200 --seed 1 --modules none --budget 2000
 *   npm run ai:bench -- --bots hard,medium,medium --games 99 --trace
 *
 * Writes summary.json, elo.json, games.jsonl (and traces/ with --trace) to --out
 * (default packages/ai/runs/<timestamp>-<label>), and prints a report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bool, num, parseArgs, str, type Args } from './args.js';
import { parseModules } from './game.js';
import { defaultWorkers, runPool } from './pool.js';
import { formatReport } from './report.js';
import { buildGroups, DEFAULTS, schedule, summarize, type Summary, type TournamentOptions } from './tournament.js';

export const USAGE = `Usage: npm run ai:bench -- [options]
  --a <level>          bot on one seat (easy|medium|hard; default easy)
  --b <level>          bot on the other seats (default easy)
  --bots a,b,c         one level per seat instead of --a/--b (grouped by level)
  --players <n>        2..6 (default ${DEFAULTS.players}; implied by --bots)
  --games <n>          games in total (default ${DEFAULTS.games}); seeds advance once per rotation set
  --seed <n>           first game seed (default ${DEFAULTS.seed})
  --modules <m>        none | all | comma list of Ketchup modules (default none)
  --intro              intro game
  --budget <ms>        soft thinking budget per decision (default ${DEFAULTS.budgetMs})
  --max-rounds <n>     abort (draw, flagged) after this round (default ${DEFAULTS.maxRounds})
  --max-steps <n>      abort after this many decisions (default ${DEFAULTS.maxSteps})
  --no-rotate          keep the seat order fixed (default: every seat list in every rotation)
  --workers <n>        worker threads (default half the cores = ${defaultWorkers()}; 0 = inline)
  --trace              write JSONL decision traces (out/traces/game-NNNN.jsonl)
  --out <dir>          output directory (default packages/ai/runs/<timestamp>-<label>)
  --phases             print latency per phase
  --json               print summary.json instead of the report`;

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

export function optionsFrom(a: Args): TournamentOptions {
  const bots = str(a, 'bots');
  const players = bots ? bots.split(',').length : num(a, 'players', DEFAULTS.players);
  return {
    groups: buildGroups({ a: str(a, 'a'), b: str(a, 'b'), bots, players }),
    players,
    games: num(a, 'games', DEFAULTS.games),
    seed: num(a, 'seed', DEFAULTS.seed),
    modules: parseModules(str(a, 'modules'), players),
    intro: bool(a, 'intro'),
    budgetMs: num(a, 'budget', DEFAULTS.budgetMs),
    maxRounds: num(a, 'max-rounds', DEFAULTS.maxRounds),
    maxSteps: num(a, 'max-steps', DEFAULTS.maxSteps),
    rotate: !bool(a, 'no-rotate'),
    trace: bool(a, 'trace'),
  };
}

export interface BenchRun {
  summary: Summary;
  out: string;
  crashes: { index: number; seed: number; error: string }[];
}

/** Run a tournament on the pool and write its output files. */
export async function runBench(o: TournamentOptions, opts: { workers: number; out: string; progress?: boolean }): Promise<BenchRun> {
  mkdirSync(opts.out, { recursive: true });
  const specs = schedule(o);
  const t0 = Date.now();
  const tick = Math.max(1, Math.round(specs.length / 20));
  const { results, crashes } = await runPool(specs, {
    workers: opts.workers,
    traceDir: o.trace ? join(opts.out, 'traces') : null,
    onResult: (_r, done) => {
      if (opts.progress && (done % tick === 0 || done === specs.length)) process.stderr.write(`\r${done}/${specs.length} games`);
    },
  });
  if (opts.progress) process.stderr.write('\n');
  const summary = summarize(o, results);
  summary.meta.workers = opts.workers;
  summary.meta.elapsedMs = Date.now() - t0;
  summary.meta.date = new Date().toISOString();
  for (const c of crashes) summary.problems.push(`game ${c.index} (seed ${c.seed}) CRASHED: ${c.error.split('\n')[0]}`);
  const sorted = results.slice().sort((x, y) => x.index - y.index);
  writeFileSync(join(opts.out, 'summary.json'), `${JSON.stringify({ ...summary, crashes }, null, 2)}\n`);
  writeFileSync(join(opts.out, 'elo.json'), `${JSON.stringify(summary.elo, null, 2)}\n`);
  writeFileSync(
    join(opts.out, 'games.jsonl'),
    sorted.map((r) => JSON.stringify({ index: r.index, seed: r.seed, rotation: r.rotation, seats: Object.fromEntries(r.seats.map((s) => [s.playerId, s.label])), end: r.end, winner: r.winner, ranking: r.ranking, cash: r.cash, rounds: r.rounds, steps: r.steps, wallMs: r.wallMs, stats: r.stats })).join('\n') + '\n',
  );
  return { summary, out: opts.out, crashes };
}

/** Path relative to the cwd when it is inside it, else absolute. */
export function shortPath(p: string): string {
  const r = relative(process.cwd(), p);
  return r && !r.startsWith('..') ? r : p;
}

export function defaultOut(o: TournamentOptions, prefix = ''): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = o.groups.map((g) => `${g.level}${g.seats > 1 ? g.seats : ''}`).join('-vs-');
  return join(repoRoot, 'packages/ai/runs', `${stamp}-${prefix}${label}-${o.players}p`);
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2), ['intro', 'no-rotate', 'trace', 'phases', 'json', 'help']);
  if (bool(a, 'help')) {
    console.log(USAGE);
    return;
  }
  const o = optionsFrom(a);
  const workers = num(a, 'workers', defaultWorkers());
  const outArg = str(a, 'out');
  const out = outArg ? resolve(outArg) : defaultOut(o);
  const run = await runBench(o, { workers, out, progress: process.stderr.isTTY });
  if (bool(a, 'json')) console.log(JSON.stringify(run.summary, null, 2));
  else {
    console.log(formatReport(run.summary, { phases: bool(a, 'phases') }));
    console.log(`\noutput: ${shortPath(out)}${o.trace ? `\ninspect: npm run ai:inspect -- ${shortPath(join(out, 'traces', 'game-0000.jsonl'))} --step 0 --rerun` : ''}`);
  }
  if (run.crashes.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    console.error(USAGE);
    process.exit(2);
  });
}
