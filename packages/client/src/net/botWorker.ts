/**
 * Web Worker entry for hot-seat bots (docs/ai.md): `{ id, req }` in, `{ id, action }` or
 * `{ id, error }` out. Keeps bot thinking off the UI thread.
 */
import { runBot, type BotRequest } from '@fcm/ai';

const scope = self as unknown as { onmessage: ((e: MessageEvent<{ id: number; req: BotRequest }>) => void) | null; postMessage(msg: unknown): void };

scope.onmessage = (e) => {
  const { id, req } = e.data;
  try {
    scope.postMessage({ id, action: runBot(req) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
