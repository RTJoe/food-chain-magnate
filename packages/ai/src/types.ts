/**
 * The bot contract (docs/ai.md). A bot is a pure function from what one seat can see to one action.
 * It never sees the full `GameState`: only the seat's redacted `GameView`, the legal actions the
 * engine offers that seat, and the engine itself (to query placements, previews, or simulate on a
 * state it builds from the view).
 */
import type { Action, EngineApi, GameView, LegalAction, PlayerId, RngState } from '@fcm/engine';

export type BotLevel = 'easy' | 'medium' | 'hard';

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

export const isBotLevel = (v: unknown): v is BotLevel => v === 'easy' || v === 'medium' || v === 'hard';

export interface BotInput {
  /** The game as the bot's seat sees it (`engine.redactFor(state, playerId)`). */
  view: GameView;
  /** The seat the bot plays. Always awaited by the engine when `choose` is called. */
  playerId: PlayerId;
  /**
   * `engine.legalActions` for `playerId`, computed on the view's state (see `viewState`). Every
   * `ready` entry is valid as-is; `placement` entries need `engine.legalPlacements(viewState(view),
   * playerId, spec)`; `compose` entries need a bot-built payload (structure, firing, freezer).
   */
  legal: LegalAction[];
  /** The rules engine. Pure; safe to call on states the bot builds (`viewState`, `sampleState`). */
  engine: EngineApi;
  /** Seeded RNG owned by this decision (mutated in place by the engine's rng helpers). */
  rng: RngState;
  /** Soft thinking budget in milliseconds. Search bots should stop and answer before it runs out. */
  budgetMs: number;
}

export interface Bot {
  readonly level: BotLevel;
  /**
   * One action for `input.playerId`. Must be legal for the real game state: the hidden parts of the
   * state (other players' secrets, rng) never make a legal-on-the-view action illegal. Must not
   * throw; the host falls back to a safe action if it does or if the action is rejected.
   */
  choose(input: BotInput): Action;
  /**
   * Optional, for tuning and debugging only (decision traces, `bench/`): the same decision as
   * `choose(input)` with the reasoning behind it. Hosts never call it; the bench harness calls it
   * instead of `choose` when tracing, so `explain(input).action` must equal what `choose(input)`
   * returns for the same input and rng seed. Must not throw.
   */
  explain?(input: BotInput): BotExplanation;
}

/** One scored alternative in a {@link BotExplanation}. */
export interface ScoredAlternative {
  /** Short human-readable description ("billboard#13 burger d2 @ (11,5)"). */
  summary: string;
  score: number;
  /** Samples / rollouts behind `score` (search bots). */
  n?: number;
  /** Evaluation terms behind `score`. */
  terms?: Record<string, number>;
}

/**
 * What a bot considered for one decision (docs/ai-strategy.md §8.3). Every field but `action` is
 * optional; the trace records whatever the bot provides.
 */
export interface BotExplanation {
  action: Action;
  /** Strategy label (Medium/Hard archetype). */
  archetype?: string;
  /** Candidates scored, rollouts run, determinization samples, search horizon. */
  candidates?: number;
  rollouts?: number;
  samples?: number;
  horizon?: number;
  /** Best alternatives, best first (the chosen one included). */
  top?: ScoredAlternative[];
  /** Evaluation terms of the chosen action. */
  evalTerms?: Record<string, number>;
  warnings?: string[];
  /** Anything else worth logging (must be JSON-serializable). */
  extra?: Record<string, unknown>;
}

/**
 * Serializable request a host sends to wherever bots run (inline, a worker thread, a Web Worker).
 * `runBot` turns it into a `BotInput` and an action.
 */
export interface BotRequest {
  level: BotLevel;
  view: GameView;
  playerId: PlayerId;
  /** Seed for the decision's RNG (hosts derive it from game seed, seq and seat: reproducible). */
  seed: number;
  budgetMs: number;
}
