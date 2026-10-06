/**
 * Helpers shared by the Ketchup lessons (docs/tutorial-plan.md §3): the tutorial town with modules
 * on, the base-course prerequisite, Continue, gate matchers and narration helpers that read the
 * learner's view (never the hidden state).
 */
import type { Action, EmployeeId, GameEvent, GameState, GameView, ModuleId, PlayerId, TutorialPausePhase } from '@fcm/engine';
import { contentFor, voluntarilyFireable } from '@fcm/engine';
import { town, type StateBuilder } from '@fcm/engine/testing';
import type { ActionMatcher, LessonId, StepCtx } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';

import { continueAction } from '../dev/demo.js';

export { continueAction };

/** Every Ketchup lesson needs the base course L1–L14 passed or skipped (hub "Skip prerequisites"). */
export const BASE_COURSE: LessonId[] = Array.from({ length: 14 }, (_, i) => `base.${i + 1}` as LessonId);

export const ME: PlayerId = 'p1';
export const BO: PlayerId = 'p2';

/**
 * Set-up that `createGame` does for modules and the builder does not: the milestone supply of the
 * enabled modules (module milestones in, base ones out with New Milestones) and the 2-player Movie
 * Star tray (B only).
 */
export function withModuleSetup(b: StateBuilder): StateBuilder {
  return b.mutate((s) => {
    const content = contentFor(s.config.modules);
    const keep: GameState['milestones'] = {};
    for (const def of Object.values(content.milestones)) {
      if (!def) continue;
      keep[def.id] = s.milestones[def.id] ?? { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: def.removeAfterRound ?? null };
    }
    s.milestones = keep;
    if (s.config.modules.includes('ketchup:movieStars') && s.turnOrder.length < 4) {
      delete s.supply['ketchup:c_movie_star'];
      delete s.supply['ketchup:d_movie_star'];
    }
  });
}

/** The tutorial town (Ada on A1, Bo on C2) with Ketchup modules switched on. */
export function kTown(round: number, modules: ModuleId[], opts: { seed?: number; restaurants?: boolean | PlayerId[] } = {}): StateBuilder {
  return withModuleSetup(town({ round, seed: opts.seed ?? 2000 + round, ...(opts.restaurants !== undefined ? { restaurants: opts.restaurants } : {}) }).modules(modules));
}

/** Gate matcher for one action type, optionally narrowed by payload. */
export function only<T extends Action['type']>(type: T, where?: (a: Extract<Action, { type: T }>, v: GameView) => boolean, limit?: number): ActionMatcher {
  return { type, ...(where ? { where: (a: Action, v: GameView) => a.type === type && where(a as Extract<Action, { type: T }>, v) } : {}), ...(limit !== undefined ? { limit } : {}) };
}

export const endTurn = (p: PlayerId = ME): Action => ({ type: 'work.endTurn', playerId: p });

/** The first event of `type` since the step started. */
export function eventOf<T extends GameEvent['type']>(ctx: StepCtx, type: T, where?: (e: Extract<GameEvent, { type: T }>) => boolean): Extract<GameEvent, { type: T }> | undefined {
  return ctx.events.find((e): e is Extract<GameEvent, { type: T }> => e.type === type && (!where || where(e as Extract<GameEvent, { type: T }>)));
}

/** The sale to house number `n` in the events since the step started. */
export function saleAt(ctx: StepCtx, n: number): Extract<GameEvent, { type: 'sale' }> | undefined {
  const id = houseByNumber(ctx.view, n);
  return eventOf(ctx, 'sale', (e) => e.houseId === id);
}

export const nameOf = (v: GameView, p: PlayerId): string => (p === ME ? 'you' : (v.players[p]?.name ?? p));

/** Uid of the learner's card with this employee id (first match), or null. */
export function uidOf(v: GameView, employeeId: EmployeeId, p: PlayerId = ME): string | null {
  const emp = v.players[p]?.employees ?? {};
  return Object.values(emp).find((c) => c.employeeId === employeeId)?.uid ?? null;
}

export const cash = (v: GameView, p: PlayerId = ME): number => v.players[p]?.cash ?? 0;

/** "$10" with sign handling for narration. */
export const usd = (n: number): string => (n < 0 ? `−$${-n}` : `$${n}`);

/**
 * Continue for a pause that has not happened yet (steps that run through several phases). Pause
 * ids are deterministic: `tutorial-pause:r<round>:<phase>` (engine tutorial module).
 */
export const continueAt = (round: number, phase: TutorialPausePhase, p: PlayerId = ME): Action => ({ type: 'tutorial.continue', playerId: p, choiceId: `tutorial-pause:r${round}:${phase}` });

const PAUSE_ORDER: readonly TutorialPausePhase[] = ['restructuring', 'orderOfBusiness', 'working', 'dinnertime', 'payday', 'marketing', 'cleanup'];

/**
 * The learner's remaining moves to run a round on through several pauses: End turn (while it is
 * still the learner's turn), Continue for each pause in `phases` not yet released, then
 * `payday.confirm` when asked. Computed from the live state, so it stays right after any allowed
 * move the learner (or the dead-end property test) already made.
 */
export function runOn(ctx: StepCtx, round: number, phases: TutorialPausePhase[], opts: { payday?: boolean } = {}): Action[] {
  const ops: Action[] = [];
  const v = ctx.view;
  if (v.phase.kind === 'working' && v.turn?.player === ME && v.round === round) ops.push(endTurn());
  const rel = (ctx.state().moduleState.tutorial as { released?: string | null } | undefined)?.released ?? null;
  const [rr, rp] = rel ? rel.split(':') : [];
  const released = (ph: TutorialPausePhase) => rel !== null && (Number(rr) > round || (Number(rr) === round && PAUSE_ORDER.indexOf(rp as TutorialPausePhase) >= PAUSE_ORDER.indexOf(ph)));
  for (const ph of phases) if (!released(ph)) ops.push(continueAt(round, ph));
  if (opts.payday) ops.push(...paydayFor(ctx));
  return ops;
}

/**
 * `payday.confirm` when the learner will be asked at Payday (she has a card she could fire);
 * nothing otherwise (the engine skips players with nothing to decide).
 */
export function paydayFor(ctx: StepCtx): Action[] {
  const p = ctx.view.players[ME];
  return p && voluntarilyFireable(p).length > 0 ? [{ type: 'payday.confirm', playerId: ME }] : [];
}

/** Continue from the current pause, then confirm Payday if the learner will be asked. */
export const continueThroughPayday = (ctx: StepCtx): Action[] => [...continueAction(ctx), ...paydayFor(ctx)];
