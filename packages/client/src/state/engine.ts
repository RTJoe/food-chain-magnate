/**
 * Which rules engine the client uses locally (hot-seat, prompts, legal actions, dev fixtures).
 * The real engine (`@fcm/engine`) is built in parallel with the client; until a function is
 * implemented it throws `NotImplementedError`, and the client falls back to the toy engine or to
 * its own view-based guidance (state/guidance.ts).
 */
import { engine as realEngine, type EngineApi, type GameState, type GameView, type ModuleManifest, type PlayerId } from '@fcm/engine';
import { TOY_MANIFEST, toyEngine } from '@fcm/engine/testing';

export const isNotImplemented = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'NOT_IMPLEMENTED';

/** True when the real engine can at least create games. */
export function realEngineReady(): boolean {
  try {
    realEngine.listModules();
    return true;
  } catch {
    return false;
  }
}

/** Engine for a new hot-seat game: the real one once it works, else the toy game. */
export function hotseatEngine(): EngineApi {
  return realEngineReady() ? realEngine : toyEngine;
}

/**
 * Engine for dev fixtures (real Food Chain Magnate states): the real engine, with the toy engine's
 * generic redaction as a stand-in while `redactFor`/`redactEvents` are unimplemented. Rules
 * functions are never delegated to the toy game (its rules differ); `listModules` falls back to an
 * empty list so the client does not treat a fixture as a toy game.
 */
export function hybridEngine(): EngineApi {
  const toyOk = new Set<keyof EngineApi>(['redactFor', 'redactEvents']);
  const out = {} as Record<keyof EngineApi, unknown>;
  // Every function either engine has (the real engine's board previews included), so new
  // EngineApi members pass through even before the toy engine stubs them.
  const keys = new Set([...Object.keys(realEngine), ...Object.keys(toyEngine)] as (keyof EngineApi)[]);
  for (const key of keys) {
    out[key] = (...args: unknown[]) => {
      try {
        return (realEngine[key] as (...a: unknown[]) => unknown)(...args);
      } catch (e) {
        if (!isNotImplemented(e)) throw e;
        if (key === 'listModules') return [];
        if (!toyOk.has(key) || typeof toyEngine[key] !== 'function') throw e;
        return (toyEngine[key] as (...a: unknown[]) => unknown)(...args);
      }
    };
  }
  return out as unknown as EngineApi;
}

export function isToyManifest(manifest: readonly ModuleManifest[]): boolean {
  return manifest.length === 1 && manifest[0]?.name === TOY_MANIFEST.name;
}

/** Modules the lobby can offer: the engine's list when available. */
export function availableModules(): ModuleManifest[] | null {
  try {
    return realEngine.listModules();
  } catch {
    return null;
  }
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
