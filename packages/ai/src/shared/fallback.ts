/**
 * Internal fallbacks: a bot whose own plan produced no valid action plays the safe
 * `fallbackAction` itself, so the host never sees a bad answer. Each top-level bot `choose` /
 * `explain` notes it here, and `runBotDetailed` and the bench report it (`internalFallback`), so
 * tests and the gate can require zero. Nested uses (Medium asking Easy, Hard's rollouts) do not
 * count: there a fallback is part of the plan, not a failure.
 *
 * Module state is safe: bots are synchronous and each worker thread has its own copy.
 */
let notes = 0;

export function noteInternalFallback(): void {
  notes++;
}

/** Monotonic count of noted fallbacks (compare before and after a decision). */
export function internalFallbackCount(): number {
  return notes;
}
