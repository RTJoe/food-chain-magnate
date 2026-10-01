/**
 * @fcm/engine public API (architecture §3.1). Pure, deterministic, synchronous, no DOM/Node APIs.
 * C0 provides the contracts and stubs; C1/C2 implement them. `testing/toyGame.ts` implements the
 * same `EngineApi` so server and client can be built before the real engine lands.
 */
import type { Action, Applied, Ok, Rejected } from './types/actions.js';
import type { GameEvent } from './types/events.js';
import type { ModuleManifest } from './types/module.js';
import type { GameConfig, GameState, PlayerId } from './types/state.js';
import type { GameView, LegalAction, Placement, PlacementSpec, Prompt, Viewer } from './types/view.js';

export type * from './types/index.js';
export { createRng, nextUint32, nextFloat, randomInt, shuffle, pick } from './core/rng.js';
export { allocId, idKind, type IdKind } from './core/ids.js';
export { clone } from './core/clone.js';
export { FOODS, DRINKS } from './content/foods.js';

export const ENGINE_VERSION = '0.1.0';

export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED';
  constructor(what: string) {
    super(`@fcm/engine: ${what} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

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

export function createGame(_config: GameConfig, _seed: number): GameState {
  throw new NotImplementedError('createGame');
}
export function validateAction(_state: GameState, _action: Action): Ok | Rejected {
  throw new NotImplementedError('validateAction');
}
export function applyAction(_state: GameState, _action: Action): Applied | Rejected {
  throw new NotImplementedError('applyAction');
}
export function legalActions(_state: GameState, _playerId: PlayerId): LegalAction[] {
  throw new NotImplementedError('legalActions');
}
export function legalPlacements(_state: GameState, _playerId: PlayerId, _spec: PlacementSpec): Placement[] {
  throw new NotImplementedError('legalPlacements');
}
export function redactFor(_state: GameState, _viewer: Viewer): GameView {
  throw new NotImplementedError('redactFor');
}
export function redactEvents(_events: GameEvent[], _viewer: Viewer): GameEvent[] {
  throw new NotImplementedError('redactEvents');
}
export function derivePrompt(_view: GameView, _me: PlayerId | null): Prompt {
  throw new NotImplementedError('derivePrompt');
}
export function replay(_config: GameConfig, _seed: number, _actions: Action[]): { state: GameState; events: GameEvent[][] } {
  throw new NotImplementedError('replay');
}
export function listModules(): ModuleManifest[] {
  throw new NotImplementedError('listModules');
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
