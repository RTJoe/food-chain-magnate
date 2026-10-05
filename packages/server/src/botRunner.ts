/**
 * Bot runner backed by `worker_threads` (docs/ai.md): a small lazy pool, one job per worker at a
 * time, FIFO queue. A job that overruns its budget (plus a grace period) or crashes its worker is
 * rejected, the worker is replaced, and the session plays the safe fallback move instead.
 */
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Action } from '@fcm/engine';
import type { BotRequest } from '@fcm/ai';
import type { BotDelay, BotRunner } from '@fcm/session';

export const BOT_JOB_GRACE_MS = 10_000;

interface Job {
  id: number;
  req: BotRequest;
  resolve: (a: Action) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface WorkerBotRunnerOptions {
  /** Pool size (default: half the cores, 1–4). */
  size?: number;
  /** Worker script (default: botWorker.js next to this file, or botWorker.ts under tsx). */
  script?: URL;
  log?: (msg: string) => void;
}

/** Where the worker script is: the compiled .js, or the .ts source when running from source (tsx, vitest). */
function defaultScript(): { url: URL; execArgv?: string[] } {
  const js = new URL('./botWorker.js', import.meta.url);
  if (existsSync(fileURLToPath(js))) return { url: js };
  const ts = new URL('./botWorker.ts', import.meta.url);
  const argv = [...process.execArgv];
  if (!argv.some((a) => a.includes('tsx'))) argv.push('--import', 'tsx');
  if (!argv.some((a) => a.includes('fcm-source'))) argv.push('--conditions=fcm-source');
  return { url: ts, execArgv: argv };
}

export class WorkerBotRunner {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private closed = false;
  private readonly size: number;
  private readonly script: { url: URL; execArgv?: string[] };
  private readonly log: (msg: string) => void;

  constructor(opts: WorkerBotRunnerOptions = {}) {
    this.size = Math.max(1, opts.size ?? Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))));
    this.script = opts.script ? { url: opts.script } : defaultScript();
    this.log = opts.log ?? ((m) => console.warn(m));
  }

  /** The `BotRunner` to hand to sessions. */
  readonly run: BotRunner = (req) =>
    new Promise<Action>((resolve, reject) => {
      if (this.closed) return reject(new Error('bot runner closed'));
      this.queue.push({ id: this.nextId++, req, resolve, reject });
      this.pump();
    });

  get workers(): number {
    return this.slots.length;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const j of this.queue.splice(0)) j.reject(new Error('bot runner closed'));
    await Promise.all(
      this.slots.splice(0).map((s) => {
        if (s.timer) clearTimeout(s.timer);
        s.job?.reject(new Error('bot runner closed'));
        return s.worker.terminate();
      }),
    );
  }

  private pump(): void {
    while (this.queue.length) {
      let slot = this.slots.find((s) => !s.job);
      if (!slot && this.slots.length < this.size) slot = this.spawn();
      if (!slot) return;
      const job = this.queue.shift() as Job;
      slot.job = job;
      slot.timer = setTimeout(() => this.fail(slot as Slot, new Error(`bot move timed out after ${job.req.budgetMs + BOT_JOB_GRACE_MS} ms`)), job.req.budgetMs + BOT_JOB_GRACE_MS);
      slot.timer.unref?.();
      slot.worker.postMessage({ id: job.id, req: job.req });
    }
  }

  private spawn(): Slot {
    const worker = new Worker(this.script.url, this.script.execArgv ? { execArgv: this.script.execArgv } : {});
    worker.unref();
    const slot: Slot = { worker, job: null, timer: null };
    worker.on('message', (msg: { id: number; action?: Action; error?: string }) => {
      const job = slot.job;
      if (!job || job.id !== msg.id) return;
      this.release(slot);
      if (msg.action) job.resolve(msg.action);
      else job.reject(new Error(msg.error ?? 'bot failed'));
      this.pump();
    });
    worker.on('error', (e: unknown) => this.fail(slot, e instanceof Error ? e : new Error(String(e))));
    worker.on('exit', (code) => {
      if (this.closed) return;
      if (this.slots.includes(slot)) this.fail(slot, new Error(`bot worker exited (${code})`));
    });
    this.slots.push(slot);
    return slot;
  }

  private release(slot: Slot): void {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.job = null;
  }

  /** Reject the slot's job, drop the worker (a new one is spawned on demand). */
  private fail(slot: Slot, e: Error): void {
    const job = slot.job;
    this.release(slot);
    const i = this.slots.indexOf(slot);
    if (i >= 0) this.slots.splice(i, 1);
    void slot.worker.terminate().catch(() => {});
    if (job) {
      this.log(`bots: worker failed: ${e.message}`);
      job.reject(e);
    }
    if (!this.closed) this.pump();
  }
}

/** `FCM_BOT_DELAY_MS`: "400-900" (random range) or "0" / "250" (fixed). Absent or invalid: the default. */
export function botDelayFromEnv(env: NodeJS.ProcessEnv = process.env): { botDelay?: BotDelay } {
  const v = env.FCM_BOT_DELAY_MS?.trim();
  if (!v) return {};
  const m = /^(\d+)\s*[-,]\s*(\d+)$/.exec(v);
  if (m) return { botDelay: { min: Number(m[1]), max: Math.max(Number(m[1]), Number(m[2])) } };
  return /^\d+$/.test(v) ? { botDelay: Number(v) } : {};
}
