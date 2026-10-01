/**
 * Helpers for Ketchup module specs. Scenarios run through the REAL engine context (core/context
 * `makeCtx`), so module hooks, `onEvent` listeners and milestone triggers all fire exactly as in
 * `applyAction`. Two ways to build a scenario:
 *
 * 1. `kb(players, modules)` → a `StateBuilder` on the standard 3x3 test map MAP (see
 *    test/rules/c2ctx.ts for the ASCII), then run a phase function with `dine` / `market` /
 *    `fromPhase`.
 * 2. `kgame(players, modules, layout?)` → a real game through setup (test/helpers/game.ts), then
 *    `workingTurn(...)` + `act(...)` for Working-phase actions.
 */
import type { EventOf, GameEvent, GameEventType } from '../../../src/types/events.js';
import type { GameState, ModuleId } from '../../../src/types/index.js';
import { stateBuilder, type StateBuilder } from '../../../src/testing/index.js';
import { makeCtx, type EngineCtx } from '../../../src/core/context.js';
import { runUntilInput } from '../../../src/core/phase.js';
import { runDinnertime } from '../../../src/rules/dinnertime.js';
import { runMarketing } from '../../../src/rules/marketing.js';
import { MAP3, newGame, throughSetup } from '../../helpers/game.js';

export { MAP3 };

/** Standard 2-player test map (A L N / F O T / L R Q); same as test/rules/c2ctx.ts MAP. */
export const MAP: string[][] = [
  ['A', 'L', 'N'],
  ['F', 'O', 'T'],
  ['L', 'R', 'Q'],
];

export interface KCtx extends EngineCtx {
  of<T extends GameEventType>(type: T): EventOf<T>[];
}

/** Real engine context over `s` (mutates `s`). */
export function kctx(s: GameState): KCtx {
  const ctx = makeCtx(s) as KCtx;
  ctx.of = <T extends GameEventType>(type: T) => ctx.events.filter((e: GameEvent) => e.type === type) as EventOf<T>[];
  return ctx;
}

/** State builder with modules on, MAP, round 3. */
export function kb(players: number, modules: ModuleId[], layout: string[][] = MAP): StateBuilder {
  return stateBuilder({ players }).modules(modules).tiles(layout).round(3);
}

/** Run phase 4 (Dinnertime) on the built state. */
export function dine(b: StateBuilder): KCtx {
  const ctx = kctx(b.phase({ kind: 'dinnertime', houses: [], idx: 0 }).build());
  runDinnertime(ctx);
  return ctx;
}

/** Run phase 6 (Marketing) on the built state. */
export function market(b: StateBuilder): KCtx {
  const ctx = kctx(b.phase({ kind: 'marketing', pass: 1, passes: 1, order: [], idx: 0 }).build());
  runMarketing(ctx);
  return ctx;
}

/** Advance the engine from the given (built) state until input is needed. */
export function fromPhase(s: GameState): KCtx {
  const ctx = kctx(s);
  runUntilInput(ctx);
  return ctx;
}

/** A real game with modules, through setup (first restaurants on MAP3 spots) → round 1 Restructuring. */
export function kgame(players: number, modules: ModuleId[], layout: string[][] = MAP3, seed = 1): GameState {
  return throughSetup(newGame(players, seed, layout, { modules }));
}
