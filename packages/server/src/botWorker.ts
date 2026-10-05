/**
 * Worker-thread entry for bot moves (docs/ai.md). Receives `{ id, req: BotRequest }`, answers
 * `{ id, action }` or `{ id, error }`. Pure CPU work on a copy of the seat's redacted view, so a
 * slow (Hard) bot never blocks the hub's event loop or other rooms.
 */
import { parentPort } from 'node:worker_threads';
import { runBot, type BotRequest } from '@fcm/ai';

parentPort?.on('message', (msg: { id: number; req: BotRequest }) => {
  try {
    parentPort?.postMessage({ id: msg.id, action: runBot(msg.req) });
  } catch (e) {
    parentPort?.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
  }
});
