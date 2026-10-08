/**
 * Client-side helpers around the rules engine (`@fcm/engine`): the module list for the lobby and a
 * pseudo-state so state-based engine helpers can run on a view.
 */
import { engine, type GameState, type GameView, type ModuleManifest, type PlayerId } from '@fcm/engine';

/** Modules the lobby can offer. */
export function availableModules(): ModuleManifest[] {
  return engine.listModules();
}

/**
 * Rebuild a `GameState`-shaped object from a view so state-based engine helpers (legalActions,
 * legalPlacements) can run on the client. Only the viewer's secrets are known; the rest are blank.
 * See the contract-change note in the C4 report: the server should send legal actions instead.
 */
export function pseudoState(view: GameView, me: PlayerId | null): GameState {
  const { viewer: _v, mine, submitted: _s, visibleReserves: _r, ...rest } = view;
  const secrets: GameState['secrets'] = {};
  for (const id of view.turnOrder) secrets[id] = { reserve: view.visibleReserves[id] ?? null, structureDraft: null };
  if (me && mine) secrets[me] = mine;
  return { ...rest, seed: 0, rng: [1, 2, 3, 4], secrets };
}
