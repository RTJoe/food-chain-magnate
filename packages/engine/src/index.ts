/**
 * @fcm/engine public API (architecture §3.1). Pure, deterministic, synchronous, no DOM/Node APIs.
 * `testing/toyGame.ts` (exported from `@fcm/engine/testing`) implements the same `EngineApi` so
 * server and client can swap engines.
 */
import type { Action, Applied, Ok, Rejected } from './types/actions.js';
import type { GameEvent } from './types/events.js';
import type { ModuleManifest } from './types/module.js';
import type { RouteStart } from './types/actions.js';
import type { CampaignId, Cell, GameConfig, GameState, HouseId, PlayerId, Uid } from './types/state.js';
import type { CampaignReachPreview, CampaignReachQuery, GameView, HouseOutlook, LegalAction, Placement, PlacementSpec, Prompt, RangeOverlay, Viewer } from './types/view.js';
import { createGame } from './core/createGame.js';
import { applyAction, validateAction } from './core/reducer.js';
import { legalActions, legalPlacements } from './core/legal.js';
import { redactEvents, redactFor } from './core/redact.js';
import { derivePrompt } from './core/prompt.js';
import { replay } from './core/replay.js';
import { allModules, manifestOf } from './modules/registry.js';
import { campaignReach, houseCellsReach, houseOutlook, placementProblem, rangeOverlay } from './rules/outlook.js';
import { enableTutorial as enableTutorialWith, type EnableTutorialOptions } from './modules/tutorial.js';
import { makeCtx } from './core/context.js';
import { runUntilInput } from './core/phase.js';

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
export { campaignReach, houseCellsReach, houseOutlook, placementProblem, rangeOverlay };

/**
 * Read-only rules helpers for AI players (@fcm/ai) and tools. Pure functions over a state; they
 * add no rules of their own. Bots call them on a state rebuilt from their redacted view.
 */
export { contentFor } from './modules/registry.js';
export { cardsAtWork, cardsInHand, cardPlace, ceoSlotsFor, defOf, isManager, managerSlots, ownsUnique } from './core/cards.js';
export { SALARY, salaryAfterFiring, salaryBreakdown, salariedCards, voluntarilyFireable } from './rules/payday.js';
export { submissionProblem, isOverfilled } from './rules/restructuring.js';
export { freezerCapacity, stockOf } from './rules/cleanup.js';
export { reserveOptions } from './rules/setup.js';
export { abilityStage, stageIndex, stagesFor } from './rules/working/stages.js';

export { TUTORIAL_PAUSE_PHASES, type EnableTutorialOptions } from './modules/tutorial.js';

/**
 * Tutorial scenarios (docs/tutorial-plan.md §4.2): enable the internal `tutorial` module on a built
 * state (pause after `pauseAfter` phases, `continue` choices for `player`) and settle it. Pure.
 */
export function enableTutorial(state: GameState, opts: EnableTutorialOptions): { state: GameState; events: GameEvent[] } {
  return enableTutorialWith(state, opts, (s) => {
    const ctx = makeCtx(s);
    runUntilInput(ctx);
    return ctx.events;
  });
}

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

  // --- Board previews (UI guidance, ux-plan.md §4; pure, run on a pseudo-state from a view) ---

  /** Houses a (hypothetical) campaign reaches with demand/capacity/adds, plus the reach area squares. Module reach included. */
  campaignReach(state: GameState, query: CampaignReachQuery): CampaignReachPreview;
  /** Existing campaigns that would reach a house placed on `cells` (+ `garden`). */
  houseCellsReach(state: GameState, cells: Cell[], garden?: Cell[]): CampaignId[];
  /** Road squares within the card's road range by distance (no card: the player's pending coffee shop choice). */
  rangeOverlay(state: GameState, playerId: PlayerId, cardUid?: Uid, from?: RouteStart): RangeOverlay;
  /** Capacity, ranked sellers, would-be winner and reaching campaigns for a house (null = unknown house). */
  houseOutlook(state: GameState, houseId: HouseId): HouseOutlook | null;
  /** Why a placement is illegal for `spec` (null = legal); the message a rejected action would carry. */
  placementProblem(state: GameState, playerId: PlayerId, spec: PlacementSpec, candidate: Placement): string | null;
}

export function listModules(): ModuleManifest[] {
  return allModules()
    .filter((m) => !m.internal)
    .map(manifestOf);
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
  campaignReach,
  houseCellsReach,
  rangeOverlay,
  houseOutlook,
  placementProblem,
};
