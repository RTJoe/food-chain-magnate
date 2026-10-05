/**
 * Runs bench games in parallel on `worker_threads` (Node only; never imported by the browser
 * bundle). One game per task; the worker writes its own trace file when tracing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { playGame, type GameResult, type GameSpec, type TraceLine } from './game.js';
import { WEIGHTS } from '../hard/evaluate.js';
import { createHardBot, type HardOptions } from '../hard/index.js';
import { registerBot } from '../registry.js';

/**
 * Tuning hook: `FCM_HARD_WEIGHTS='{"inc":1.2}'` overrides Hard's evaluation weights in this process
 * and its workers (they inherit the environment), so weight sweeps need no code edits.
 */
const tuning = process.env.FCM_HARD_WEIGHTS;
if (tuning) Object.assign(WEIGHTS, JSON.parse(tuning) as Partial<typeof WEIGHTS>);
/** Ablation hook: `FCM_HARD_OPTS='{"phases":["working"]}'` (any `HardOptions` field). */
const hardOpts = process.env.FCM_HARD_OPTS;
if (hardOpts) registerBot('hard', () => createHardBot(JSON.parse(hardOpts) as HardOptions));

/** Default pool size: half the cores (the machine is shared), at least 1. */
export function defaultWorkers(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

export function traceFile(dir: string, index: number): string {
  return join(dir, `game-${String(index).padStart(4, '0')}.jsonl`);
}

/** Play one game, writing its trace to `traceDir` when the spec asks for one. */
export function playAndTrace(spec: GameSpec, traceDir: string | null): GameResult {
  const lines: string[] = [];
  const result = playGame(spec, { onTrace: (l: TraceLine) => lines.push(JSON.stringify(l)) });
  if (spec.trace && traceDir) {
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(traceFile(traceDir, spec.index), `${lines.join('\n')}\n`);
  }
  return result;
}

export interface PoolResult {
  results: GameResult[];
  /** Games that crashed the harness (engine or bot bug outside `choose`), with the error. */
  crashes: { index: number; seed: number; error: string }[];
}

function workerScript(): { url: URL; execArgv: string[] } {
  const ts = import.meta.url.endsWith('.ts');
  const url = new URL(ts ? './worker.ts' : './worker.js', import.meta.url);
  const argv = [...process.execArgv];
  if (ts && !argv.some((a) => a.includes('tsx'))) argv.push('--import', 'tsx');
  if (!argv.some((a) => a.includes('fcm-source'))) argv.push('--conditions=fcm-source');
  return { url, execArgv: argv };
}

export interface WorkerJob {
  spec: GameSpec;
  traceDir: string | null;
}
export type WorkerReply = { index: number; result: GameResult } | { index: number; error: string };

/** Play `specs` on `workers` threads (0 = inline in this thread). Results arrive in completion order. */
export async function runPool(specs: GameSpec[], opts: { workers: number; traceDir: string | null; onResult?: (r: GameResult, done: number) => void }): Promise<PoolResult> {
  const results: GameResult[] = [];
  const crashes: PoolResult['crashes'] = [];
  const done = () => results.length + crashes.length;
  if (opts.workers <= 0) {
    for (const spec of specs) {
      try {
        const r = playAndTrace(spec, opts.traceDir);
        results.push(r);
        opts.onResult?.(r, done());
      } catch (e) {
        crashes.push({ index: spec.index, seed: spec.seed, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { results, crashes };
  }
  const script = workerScript();
  const queue = specs.slice();
  const size = Math.min(opts.workers, specs.length);
  await new Promise<void>((resolve, reject) => {
    let live = size;
    const start = () => {
      const worker = new Worker(script.url, { execArgv: script.execArgv });
      let current: GameSpec | undefined;
      const next = () => {
        current = queue.shift();
        if (current) worker.postMessage({ spec: current, traceDir: opts.traceDir } satisfies WorkerJob);
        else void worker.terminate();
      };
      worker.on('message', (msg: WorkerReply) => {
        if ('result' in msg) {
          results.push(msg.result);
          opts.onResult?.(msg.result, done());
        } else crashes.push({ index: msg.index, seed: current?.seed ?? -1, error: msg.error });
        next();
      });
      worker.on('error', (e: Error) => {
        if (current) crashes.push({ index: current.index, seed: current.seed, error: `worker crashed: ${e.message}` });
        current = undefined;
        // Replace the dead worker so the remaining games still run.
        if (queue.length) {
          live++;
          start();
        }
      });
      worker.on('exit', () => {
        if (--live === 0) resolve();
      });
      worker.once('online', next);
    };
    try {
      for (let i = 0; i < size; i++) start();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
    if (size === 0) resolve();
  });
  return { results, crashes };
}
