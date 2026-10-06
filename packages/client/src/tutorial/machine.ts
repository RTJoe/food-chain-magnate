/**
 * The step machine's pure core, shared by the browser runner (runner.ts) and the headless walker
 * (headless.ts): the action gate, predicate evaluation, scripted-move selection and solutions.
 * No DOM, no signals: callers pass the values in.
 */
import type { Action, GameView, LegalAction, PlayerId } from '@fcm/engine';
import type { ActionMatcher, Allow, Lesson, Predicate, SignalName, SignalValues, SolutionOp, Step, StepCtx, Target } from './dsl.js';

export const NONE_REASON = 'Not in this step: read the card, then press Next.';
export const UI_REASON = 'Not in this step: this one is about looking around, not playing.';

/** Per-step counters the predicates and the gate need. */
export interface StepProgress {
  /** Signal changes since the step started. */
  changes: Partial<Record<SignalName, number>>;
  /** Animation beats (house / campaign ids) that landed since the step started. */
  beats: Set<string>;
  /** Next was pressed. */
  next: boolean;
  /** Uses of each matcher of `allow.actions` (by index). */
  used: number[];
  /** Indexes of `script` moves already applied. */
  scripted: Set<number>;
}

export const freshProgress = (): StepProgress => ({ changes: {}, beats: new Set(), next: false, used: [], scripted: new Set() });

export const isTap = (op: SolutionOp): op is { tap: Target } => typeof op === 'object' && op !== null && 'tap' in op;

/** Index of the first matcher in `allow` that admits `a` (respecting limits), or -1. */
export function matcherIndex(allow: Allow | undefined, a: Action, view: GameView, used: readonly number[] = []): number {
  if (!allow || allow === 'none' || allow === 'any' || 'ui' in allow) return allow === 'any' ? 0 : -1;
  return allow.actions.findIndex((m, i) => m.type === a.type && (m.limit === undefined || (used[i] ?? 0) < m.limit) && (!m.where || safe(() => m.where?.(a, view) ?? true, false)));
}

/** Why the gate refuses `a` in this step, or null when it may be sent (the engine still validates it). */
export function gateReason(allow: Allow | undefined, a: Action, view: GameView, used: readonly number[] = []): string | null {
  const al = allow ?? 'none';
  if (al === 'any') return null;
  if (al === 'none') return NONE_REASON;
  if ('ui' in al) return UI_REASON;
  if (matcherIndex(al, a, view, used) >= 0) return null;
  const types = [...new Set(al.actions.map((m) => m.type))];
  return al.actions.some((m) => m.type === a.type) ? 'Not this one: the card says which.' : `Not in this step: ${types.map(actionWords).join(' or ')}.`;
}

/** Short words for an action type, for gate reasons. */
export function actionWords(type: Action['type']): string {
  const words: Partial<Record<Action['type'], string>> = {
    'setup.placeRestaurant': 'place your restaurant',
    'setup.chooseReserve': 'choose a reserve card',
    'restructure.submit': 'submit your structure',
    'order.choosePosition': 'pick a turn order spot',
    'work.recruit': 'hire',
    'work.train': 'train',
    'work.produce': 'make food',
    'work.buyDrinks': 'get drinks',
    'work.placeCampaign': 'place a campaign',
    'work.skip': 'skip a card',
    'work.endTurn': 'end your turn',
    'payday.fire': 'fire',
    'payday.confirm': 'pay salaries',
    'tutorial.continue': 'press Continue',
  };
  return words[type] ?? type;
}

/**
 * Whether some legal action of the learner could satisfy `allow` (no-dead-end check). Placement
 * and compose entries count by type: their payload is built in the UI.
 */
export function allowReachable(allow: Allow | undefined, legal: readonly LegalAction[], view: GameView): boolean {
  if (!allow || allow === 'none' || allow === 'any' || 'ui' in allow) return true;
  return legal.some((l) => (l.kind === 'ready' ? matcherIndex(allow, l.action, view) >= 0 : allow.actions.some((m) => m.type === l.actionType)));
}

/** The learner's ready legal actions that `allow` admits. */
export function allowedReady(allow: Allow | undefined, legal: readonly LegalAction[], view: GameView): Action[] {
  return legal.flatMap((l) => (l.kind === 'ready' && matcherIndex(allow, l.action, view) >= 0 ? [l.action] : []));
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Evaluate a predicate against the live context and the step's counters. */
export function evaluate(p: Predicate, ctx: StepCtx, prog: StepProgress): boolean {
  if ('next' in p) return prog.next;
  if ('all' in p) return p.all.every((q) => evaluate(q, ctx, prog));
  if ('any' in p) return p.any.some((q) => evaluate(q, ctx, prog));
  if ('event' in p) return ctx.events.some((e) => e.type === p.event && (!p.where || safe(() => p.where?.(e, ctx.view) ?? true, false)));
  if ('view' in p) return safe(() => p.view(ctx.view), false);
  if ('test' in p) return safe(() => p.test(ctx), false);
  if ('paused' in p) {
    const head = ctx.view.pending[0];
    return head?.kind === 'continue' && head.player === ctx.me && (p.paused === true || head.phase === p.paused);
  }
  if ('beat' in p) {
    for (const id of prog.beats) if (typeof p.beat === 'string' ? id === p.beat : safe(() => (p.beat as (id: string, v: GameView) => boolean)(id, ctx.view), false)) return true;
    return false;
  }
  // signal
  const value = ctx.signals[p.signal];
  if (p.changed !== undefined) {
    const n = prog.changes[p.signal] ?? 0;
    if (n < (p.changed === true ? 1 : p.changed)) return false;
  }
  if (p.equals !== undefined && !deepEqual(value, p.equals)) return false;
  if (p.match && !safe(() => p.match?.(value, ctx.view) ?? false, false)) return false;
  if (p.changed === undefined && p.equals === undefined && !p.match) return value !== null && value !== undefined && value !== false;
  return true;
}

/** True when the predicate can only be satisfied by pressing Next (shows the Next button prominently). */
export function waitsForNext(p: Predicate): boolean {
  if ('next' in p) return true;
  if ('all' in p) return p.all.some(waitsForNext);
  if ('any' in p) return p.any.every(waitsForNext);
  return false;
}

/** True when Next can satisfy (part of) the predicate: show a Next button. */
export function offersNext(p: Predicate): boolean {
  if ('next' in p) return true;
  if ('all' in p) return p.all.some(offersNext);
  if ('any' in p) return p.any.some(offersNext);
  return false;
}

export const sayOf = (step: Step, ctx: StepCtx): string => (typeof step.say === 'function' ? safe(() => (step.say as (c: StepCtx) => string)(ctx), '') : step.say);

export const thenOf = (step: Step, ctx: StepCtx): string | null => (step.then === undefined ? null : typeof step.then === 'function' ? safe(() => (step.then as (c: StepCtx) => string)(ctx), null) : step.then);

/** The step's canonical moves (a fresh array: callers consume it). */
export const solutionOf = (step: Step, ctx: StepCtx): SolutionOp[] => (step.solution === undefined ? [] : typeof step.solution === 'function' ? [...step.solution(ctx)] : [...step.solution]);

/** Whether a step must carry a solution (authoring rule; the headless test enforces it). */
export function needsSolution(step: Step): boolean {
  return (step.allow !== undefined && step.allow !== 'none') || !waitsForNext(step.until);
}

/**
 * The next scripted move for `player` in this step, or null. A move whose action function throws
 * is skipped; illegality is the caller's to check (it falls back to the AI's fallback move).
 */
export function nextScripted(step: Step, prog: StepProgress, player: PlayerId, view: GameView, legal: LegalAction[]): { index: number; action: Action } | null {
  const moves = step.script ?? [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.player !== player || prog.scripted.has(i)) continue;
    const action = typeof m.action === 'function' ? safe(() => (m.action as (v: GameView, l: LegalAction[]) => Action)(view, legal), null) : m.action;
    if (action) return { index: i, action: { ...action, playerId: player } as Action };
  }
  return null;
}

/** Scripted seats of a lesson. */
export const scriptedSeats = (lesson: Lesson): PlayerId[] =>
  Object.entries(lesson.scenario.opponents)
    .filter(([, k]) => k === 'scripted')
    .map(([p]) => p);

/** Bot seats of a lesson (Easy / Medium bots). */
export const botSeats = (lesson: Lesson): Record<PlayerId, 'easy' | 'medium'> =>
  Object.fromEntries(Object.entries(lesson.scenario.opponents).filter(([, k]) => k !== 'scripted')) as Record<PlayerId, 'easy' | 'medium'>;

/** Default inactivity before a hint: 20 s, 10 s on steps with a single target. */
export const hintDelay = (step: Step): number => step.hint?.afterMs ?? ((step.show?.length ?? 0) === 1 ? 10_000 : 20_000);

/** The matcher list of an action gate (empty for other kinds). */
export const matchers = (allow: Allow | undefined): ActionMatcher[] => (allow && typeof allow === 'object' && 'actions' in allow ? allow.actions : []);
