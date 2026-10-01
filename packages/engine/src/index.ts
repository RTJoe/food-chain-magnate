/**
 * @fcm/engine public API (architecture §3.1). Pure, deterministic, synchronous, no DOM/Node APIs.
 * `testing/toyGame.ts` (exported from `@fcm/engine/testing`) implements the same `EngineApi` so
 * server and client can swap engines.
 */
import type { Action, Applied, Ok, Rejected } from './types/actions.js';
import type { GameEvent } from './types/events.js';
import type { ModuleManifest } from './types/module.js';
import type { GameConfig, GameState, PlayerId } from './types/state.js';
import type { GameView, LegalAction, Placement, PlacementSpec, Prompt, Viewer } from './types/view.js';
import { createGame } from './core/createGame.js';
import { applyAction, validateAction } from './core/reducer.js';
import { legalActions, legalPlacements } from './core/legal.js';
import { redactEvents, redactFor } from './core/redact.js';
import { derivePrompt } from './core/prompt.js';
import { replay } from './core/replay.js';
import { allModules, manifestOf } from './modules/registry.js';

export type * from './types/index.js';
export { BASE_WORK_STAGE_ORDER } from './types/state.js';
export { createRng, nextUint32, nextFloat, randomInt, shuffle, pick } from './core/rng.js';
export { allocId, idKind, type IdKind } from './core/ids.js';
export { clone } from './core/clone.js';
export { NotImplementedError } from './core/errors.js';
export { FOODS, DRINKS } from './content/foods.js';
export { BASE_EMPLOYEES } from './content/employees.js';
export { registerModule } from './modules/registry.js';
export { createGame, validateAction, applyAction, legalActions, legalPlacements, redactFor, redactEvents, derivePrompt, replay };

export const ENGINE_VERSION = '0.2.0';

/** The whole engine surface as one object, so alternative engines (toy, real) are swappable. */
export interface EngineApi {
  createGame(config: GameConfig, seed: number): GameState;
  validateAction(state: GameState, action: Action): Ok | Rejected;
  applyAction(state: GameState, action: Action): Applied | Rejected;
  legalActions(state: GameState, playerId: PlayerId): LegalAction[];
  legalPlacements(state: GameState, playerId: PlayerId, spec: PlacementSpec): Placement[];
  redactFor(state: GameState, viewer: Viewer): GameView;
  redactEvents(events: GameEvent[], viewer: Viewer): GameEvent[];
  /** UI guidance; shared so hot-seat == online. */
  derivePrompt(view: GameView, me: PlayerId | null): Prompt;
  replay(config: GameConfig, seed: number, actions: Action[]): { state: GameState; events: GameEvent[][] };
  listModules(): ModuleManifest[];
}

export function listModules(): ModuleManifest[] {
  return allModules().map(manifestOf);
}

export const engine: EngineApi = {
  createGame,
  validateAction,
  applyAction,
  legalActions,
  legalPlacements,
  redactFor,
  redactEvents,
  derivePrompt,
  replay,
  listModules,
};
