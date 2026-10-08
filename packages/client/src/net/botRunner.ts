/**
 * Bot runners for hot-seat play: a module Web Worker in the browser (one per game, created on the
 * first bot move), or inline on the main thread where workers are unavailable (tests, old browsers).
 */
import type { Action } from '@fcm/engine';
import { runBot, type BotRequest } from '@fcm/ai';
import type { LocalBotRunner } from './localTransport.js';

/** Runs bots on the calling thread, after yielding once so the UI can paint. */
export function inlineBotRunner(): LocalBotRunner {
  return {
    run: (req) =>
      new Promise<Action>((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(runBot(req));
          } catch (e) {
            reject(e);
          }
        }, 0);
      }),
  };
}

/** A job not answered within its thinking budget plus this is abandoned (as the server's BOT_JOB_GRACE_MS). */
export const BOT_JOB_GRACE_MS = 10_000;

/**
 * A Web Worker runner; falls back to inline if the worker cannot start. A job that runs past its
 * budget + `BOT_JOB_GRACE_MS` (a bot stuck in a loop) is rejected, so the transport plays the
 * fallback move, and the worker is replaced.
 */
export function workerBotRunner(): LocalBotRunner {
  if (typeof Worker === 'undefined') return inlineBotRunner();
  let worker: Worker | null = null;
  let broken = false;
  let nextId = 1;
  const waiting = new Map<number, { resolve: (a: Action) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const inline = inlineBotRunner();
  const failAll = (e: Error) => {
    for (const w of waiting.values()) {
      clearTimeout(w.timer);
      w.reject(e);
    }
    waiting.clear();
  };
  const start = (): Worker | null => {
    if (worker || broken) return worker;
    try {
      worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module', name: 'fcm-bots' });
    } catch {
      broken = true;
      return null;
    }
    worker.onmessage = (e: MessageEvent<{ id: number; action?: Action; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      clearTimeout(w.timer);
      if (e.data.action) w.resolve(e.data.action);
      else w.reject(new Error(e.data.error ?? 'bot failed'));
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      broken = true;
      worker?.terminate();
      worker = null;
      failAll(new Error('bot worker crashed'));
    };
    return worker;
  };
  return {
    run(req: BotRequest): Promise<Action> {
      const w = start();
      if (!w) return inline.run(req);
      const id = nextId++;
      return new Promise<Action>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!waiting.has(id)) return;
          // Stuck: a worker cannot be interrupted, only replaced (the next job starts a new one).
          if (worker === w) {
            w.terminate();
            worker = null;
          }
          failAll(new Error('bot timed out'));
        }, Math.max(0, req.budgetMs ?? 0) + BOT_JOB_GRACE_MS);
        waiting.set(id, { resolve, reject, timer });
        w.postMessage({ id, req });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error('bot runner closed'));
    },
  };
}
