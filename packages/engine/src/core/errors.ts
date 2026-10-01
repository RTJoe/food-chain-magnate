/** Rejection helpers and the not-implemented marker shared by the engine. */
import type { Ok, Rejected, RejectCode } from '../types/actions.js';

export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED';
  constructor(what: string) {
    super(`@fcm/engine: ${what} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

export const OK: Ok = { ok: true };

export function reject(code: RejectCode, message: string): Rejected {
  return { ok: false, code, message };
}

export type Check = Ok | Rejected;
