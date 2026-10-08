/** Rejection helpers shared by the engine. */
import type { Ok, Rejected, RejectCode } from '../types/actions.js';

export const OK: Ok = { ok: true };

export function reject(code: RejectCode, message: string): Rejected {
  return { ok: false, code, message };
}

export type Check = Ok | Rejected;
