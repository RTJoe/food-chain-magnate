/**
 * Tutorial module (docs/tutorial-plan.md §4.2). Internal: never offered in lobbies, never enabled
 * in hot-seat or online games. It changes no rule; it only holds the game between phases.
 *
 * - Option `config.options.tutorial = { player, pauseAfter }`.
 * - Hook `afterPhase(finished)`: when `finished ∈ pauseAfter`, push a `continue` PendingChoice for
 *   `player`. `runUntilInput` stops at a pending head, so the next phase's automatic work waits.
 * - Action `tutorial.continue` resolves it; the loop runs on to the next input or pause.
 * - `enableTutorial(state, opts)` turns the module on for a built scenario state and settles it.
 *
 * Each hold fires once per (round, phase): `moduleState.tutorial.released` remembers the hold the
 * learner continued from, so re-entering the loop after Continue does not pause again. Everything
 * is plain state, so `(scenario, actions)` replays reproduce the same pauses.
 */
import type { Action, Ok, Rejected, TutorialContinue } from '../types/actions.js';
import type { GameEvent } from '../types/events.js';
import type { GameModule, HookContext, TutorialOptions, TutorialPausePhase } from '../types/module.js';
import type { ChoiceId, GameState, PhaseKind, PlayerId } from '../types/state.js';
import type { LegalAction } from '../types/view.js';
import { clone } from '../core/clone.js';
import { OK, reject } from '../core/errors.js';

export const TUTORIAL_PAUSE_PHASES: readonly TutorialPausePhase[] = ['restructuring', 'orderOfBusiness', 'working', 'dinnertime', 'payday', 'marketing', 'cleanup'];

interface TutorialState {
  /** `${round}:${phase}` of the last hold the learner continued from. */
  released: string | null;
}

const holdKey = (s: GameState, phase: PhaseKind | 'start') => `${s.round}:${phase}`;

function optionsOf(s: GameState): TutorialOptions | null {
  const o = s.config.options.tutorial;
  return o && typeof o === 'object' && typeof o.player === 'string' ? o : null;
}

function tstate(s: GameState): TutorialState {
  const t = s.moduleState.tutorial as TutorialState | undefined;
  if (t) return t;
  const fresh: TutorialState = { released: null };
  s.moduleState.tutorial = fresh;
  return fresh;
}

/**
 * Pause choices do not allocate from `nextId`, so a lesson's ids (cards, campaigns) match a game
 * without the module. The id never ends in digits (validate.ts reads `-<n>` suffixes as allocations).
 */
const pauseId = (s: GameState, phase: PhaseKind | 'start'): ChoiceId => `tutorial-pause:r${s.round}:${phase}`;

function pushContinue(ctx: Pick<HookContext, 'state' | 'emit'>, player: PlayerId, phase: PhaseKind | 'start'): ChoiceId {
  const id = pauseId(ctx.state, phase);
  ctx.state.pending.push({ id, kind: 'continue', player, phase, optional: false });
  ctx.emit({ type: 'choicePending', choiceId: id, kind: 'continue', player });
  return id;
}

function validateContinue(s: GameState, a: TutorialContinue): Ok | Rejected {
  const head = s.pending[0];
  if (!head || head.kind !== 'continue' || head.id !== a.choiceId) return reject('ILLEGAL', 'The game is not paused');
  if (head.player !== a.playerId) return reject('NOT_YOUR_TURN', 'Only the learner can continue');
  return OK;
}

export const TUTORIAL_MODULE: GameModule = {
  id: 'tutorial',
  name: 'Tutorial',
  description: 'Pauses the game after automatic phases so a lesson can explain them. Changes no rules.',
  internal: true,
  actions: {
    'tutorial.continue': {
      validate: (s, action) => validateContinue(s, action as TutorialContinue),
      apply(ctx, action) {
        const s = ctx.state;
        const head = s.pending.shift();
        if (head?.kind === 'continue') tstate(s).released = holdKey(s, head.phase);
        ctx.emit({ type: 'choiceResolved', choiceId: (action as TutorialContinue).choiceId, declined: false });
        return { undoable: false };
      },
    },
  },
  hooks: {
    afterPhase(ctx, finished) {
      const s = ctx.state;
      const o = optionsOf(s);
      if (!o || !o.pauseAfter.includes(finished as TutorialPausePhase) || s.phase.kind === 'gameOver') return;
      if (tstate(s).released === holdKey(s, finished)) return;
      if (s.pending.length) return;
      pushContinue(ctx, o.player, finished);
    },
    legalActions(list, ctx, { player }): LegalAction[] {
      const head = ctx.state.pending[0];
      if (head?.kind !== 'continue' || head.player !== player) return list;
      const action: Action = { type: 'tutorial.continue', playerId: player, choiceId: head.id };
      return [...list, { kind: 'ready', label: 'Continue', action }];
    },
  },
};

export interface EnableTutorialOptions extends TutorialOptions {
  /** Hold the game before anything runs (a scenario that starts inside an automatic phase). */
  startPaused?: boolean;
  /**
   * Run the phase loop once so a hand-built state is in the shape the engine leaves after an
   * action (awaiting, auto-submissions, automatic phases up to the first input or pause). Default true.
   */
  settle?: boolean;
}

/**
 * Turn the tutorial module on for a scenario state (a `StateBuilder` result). Returns the new state
 * and the events of settling it. Pure: the input is not modified.
 */
export function enableTutorial(
  state: GameState,
  opts: EnableTutorialOptions,
  run: (s: GameState) => GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const s = clone(state);
  if (!s.config.modules.includes('tutorial')) s.config.modules = [...s.config.modules, 'tutorial'];
  s.config.options = { ...s.config.options, tutorial: { player: opts.player, pauseAfter: [...opts.pauseAfter] } };
  s.moduleState.tutorial = { released: null } satisfies TutorialState;
  const events: GameEvent[] = [];
  if (opts.startPaused) {
    const id = pauseId(s, 'start');
    s.pending.unshift({ id, kind: 'continue', player: opts.player, phase: 'start', optional: false });
    s.awaiting = { kind: 'choice', players: [opts.player] };
    events.push({ type: 'choicePending', choiceId: id, kind: 'continue', player: opts.player });
    return { state: s, events };
  }
  if (opts.settle === false) return { state: s, events };
  return { state: s, events: run(s) };
}
