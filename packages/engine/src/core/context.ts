/**
 * Hook context construction. `makeCtx(state)` wraps a (cloned, mutable) state: `emit` records the
 * event, runs module `onEvent` hooks and the milestone tracker (C2 `onMilestoneEvent`) for every
 * event. `readCtx(state)` is for pure queries (legal actions, placements): `emit` is a no-op and
 * nothing may mutate the state.
 */
import type { GameEvent } from '../types/events.js';
import type { HookContext } from '../types/module.js';
import type { GameState } from '../types/state.js';
import { contentFor, lifecycle, pipe, type EngineContent, type PipelineName } from '../modules/registry.js';
import { onMilestoneEvent } from '../rules/milestones.js';
import { allocId } from './ids.js';
import { randomInt, shuffle } from './rng.js';
import { NotImplementedError } from './errors.js';

export interface EngineCtx extends HookContext {
  content: EngineContent;
  /** Events emitted so far, in order. */
  events: GameEvent[];
  readonly: boolean;
  /** Pipeline runner (also used by C2's `runPipeline`). */
  pipe(name: PipelineName, value: unknown, args: unknown): unknown;
}

/** Run a C2-owned function; until it is implemented its NotImplementedError is swallowed. */
export function seam<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof NotImplementedError) return fallback;
    throw e;
  }
}

export function makeCtx(state: GameState, readonly = false): EngineCtx {
  const content = contentFor(state.config.modules);
  let depth = 0;
  const ctx: EngineCtx = {
    state,
    content,
    events: [],
    readonly,
    isEnabled: (m) => m === 'base' || state.config.modules.includes(m),
    id: (kind) => {
      if (readonly) throw new Error('read-only context cannot allocate ids');
      return allocId(state, kind);
    },
    rng: {
      int: (n) => randomInt(state.rng, n),
      shuffle: <T>(items: T[]) => shuffle(state.rng, items),
    },
    emit: (event) => {
      if (readonly) return;
      ctx.events.push(event);
      if (depth > 32) throw new Error(`event recursion too deep at ${event.type}`);
      depth++;
      try {
        lifecycle(ctx, 'onEvent', event);
        seam(() => onMilestoneEvent(ctx, event), undefined);
      } finally {
        depth--;
      }
    },
    pipe: (name, value, args) => pipe(ctx, name, value as never, args as never),
  };
  return ctx;
}

export const readCtx = (state: GameState): EngineCtx => makeCtx(state, true);
