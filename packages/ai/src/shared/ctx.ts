/**
 * Decision context shared by the Medium (and Hard) bots: the view rebuilt as a state, the seat, the
 * engine, the rng, the legal actions, a deadline, and a per-decision memo for derived facts.
 */
import type { Action, EmployeeDef, EngineApi, GameState, GameView, LegalAction, PlayerId, RngState, Uid } from '@fcm/engine';
import { defOf } from '@fcm/engine';
import type { BotInput } from '../types.js';
import { viewState } from '../viewState.js';
import { contentOf, type Content } from '../heuristics.js';

export type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

export interface Ctx {
  view: GameView;
  /** Pseudo-state of the view (own secrets, blanks elsewhere). Never mutated. */
  s: GameState;
  me: PlayerId;
  engine: EngineApi;
  rng: RngState;
  legal: LegalAction[];
  content: Content;
  /** `Date.now()` value after which expensive loops stop early. */
  deadline: number;
  /** Per-decision cache for derived facts (houses, prices, plans). */
  memo: Map<string, unknown>;
}

export function makeCtx(input: BotInput, budgetShare = 0.5): Ctx {
  const s = viewState(input.view);
  return {
    view: input.view,
    s,
    me: input.playerId,
    engine: input.engine,
    rng: input.rng,
    legal: input.legal,
    content: contentOf(s),
    deadline: Date.now() + Math.max(20, Math.min(250, input.budgetMs * budgetShare)),
    memo: new Map(),
  };
}

/** Same decision, another seat or state (used for rival modelling and hypothetical states). */
export function withState(c: Ctx, s: GameState, me: PlayerId = c.me, legal: LegalAction[] = c.legal): Ctx {
  return { ...c, s, me, legal, memo: new Map() };
}

export function memo<T>(c: Ctx, key: string, f: () => T): T {
  if (c.memo.has(key)) return c.memo.get(key) as T;
  const v = f();
  c.memo.set(key, v);
  return v;
}

export const timeUp = (c: Ctx): boolean => Date.now() > c.deadline;

export const readyOf = (legal: LegalAction[], type?: Action['type']): Action[] =>
  legal.flatMap((l) => (l.kind === 'ready' && (!type || l.action.type === type) ? [l.action] : []));

export const placementsOf = (legal: LegalAction[]): PlacementLegal[] => legal.filter((l): l is PlacementLegal => l.kind === 'placement');

export const isValid = (c: Ctx, a: Action | null | undefined): a is Action => Boolean(a) && c.engine.validateAction(c.s, a as Action).ok;

export function defFor(c: Ctx, player: PlayerId, uid: Uid): EmployeeDef | undefined {
  const p = c.s.players[player];
  return p ? defOf(c.content, p, uid) : undefined;
}

/** Card uid an entry of the working legal list belongs to (null for end turn). */
export function cardOfLegal(l: LegalAction): Uid | null {
  if (l.kind === 'ready') {
    const a = l.action as { type: string; cardUid?: string; trainerUid?: string };
    if (a.type === 'work.endTurn') return null;
    return a.cardUid ?? a.trainerUid ?? null;
  }
  if (l.kind === 'placement') return l.cardUid ?? l.spec.cardUid ?? null;
  return l.cardUid ?? null;
}
