/**
 * Lesson DSL (docs/tutorial-plan.md §4.1). Lessons are typed TypeScript data checked against the
 * engine: a renamed action or event breaks the build. The runner (runner.ts, browser) and the
 * headless walker (headless.ts, vitest) interpret the same data through machine.ts.
 *
 * Authoring guide: docs/tutorial-plan.md "Authoring lessons (framework API)".
 */
import type { Action, FoodId, GameEvent, GameState, GameView, LegalAction, Placement, PlacementSpec, PlayerId, TutorialPausePhase } from '@fcm/engine';
import type { Selection } from '../state/interaction.js';
import type { Settings } from '../state/store.js';
import type { DockTab } from '../ui/uiState.js';

export type LessonId = `base.${number}` | `ketchup.${string}` | `dev.${string}`;
/** Stable snake-case glossary id (docs/tutorial-plan.md §4.6). Resolved by the glossary package. */
export type GlossaryId = string;

export interface Lesson {
  id: LessonId;
  course: 'base' | 'ketchup' | 'dev';
  title: string;
  minutes: number;
  goal: string;
  concepts: GlossaryId[];
  requires?: LessonId[];
  scenario: Scenario;
  steps: Step[];
  quiz: Quiz;
  /** Awarded when the quiz is passed (default: a lesson badge named after the title). */
  badge?: { id: string; label: string };
}

export type OpponentKind = 'scripted' | 'easy' | 'medium';

export interface Scenario {
  /** Exact state, built with the fixture builder (deterministic). The runner enables the tutorial module on it. */
  build: () => GameState;
  /** The seat the device holds (fixed viewer, never handed off). */
  learner: PlayerId;
  /** Every other seat. Scripted seats move only through step `script`s; bot seats through the Web Worker. */
  opponents: Record<PlayerId, OpponentKind>;
  /** Automatic phases to pause after (engine `tutorial` module). The learner presses Continue. */
  pauseAfter: TutorialPausePhase[];
  /** Hold the game before anything runs (a scenario that starts inside an automatic phase). */
  startPaused?: boolean;
  /** Run the engine's phase loop on the built state first (default true; see engine `enableTutorial`). */
  settle?: boolean;
  /** Camera on entry. */
  camera?: CameraFrame;
}

export interface Step {
  /** Unique within the lesson; stored in progress (resume) and used by e2e. Never rename a shipped id. */
  id: string;
  /** Narration, ≤ 2 sentences / 160 characters; a function reads the live view ("You earned $30"). */
  say: string | ((ctx: StepCtx) => string);
  /** Coach marks: spotlight cutouts, board rings, overlays (≤ 3 targets). */
  show?: Target[];
  camera?: CameraFrame;
  /** What the learner may do (default 'none': only the Next button / reading). */
  allow?: Allow;
  /** Success predicate: the step completes as soon as it holds. */
  until: Predicate;
  /** Feedback shown once the step completes (carried onto the next step's strip). */
  then?: string | ((ctx: StepCtx) => string);
  /** Inactivity hint (default: after 20 s, 10 s with a single target, re-say the narration and pulse `show`). */
  hint?: Hint;
  /** Opponent moves applied as soon as the engine awaits that scripted seat during this step, in order. */
  script?: ScriptedMove[];
  /**
   * Canonical learner moves for Skip step, the headless walker and e2e: actions and taps. Required
   * whenever `allow` is not 'none' or `until` is not `{ next: true }`. Must satisfy `allow` and reach `until`.
   */
  solution?: SolutionOp[] | ((ctx: StepCtx) => SolutionOp[]);
  /** Replay the stored phase on the board (Summary "Watch again") and wait for beats. */
  replay?: { phase: 'dinnertime' | 'marketing'; from?: string };
  /** Resume point: progress (lessonId, stepId, actions so far) is saved on entry. */
  checkpoint?: boolean;
  /** Glossary entry for the strip's "What's this?" (default: none shown). */
  glossary?: GlossaryId;
  /** Label of the Next button (default "Next"). */
  nextLabel?: string;
  onEnter?: Effect[];
  onExit?: Effect[];
}

/** One canonical move: a game action (sent through the gate, bypassing `allow` on Skip) or a tap. */
export type SolutionOp = Action | { tap: Target };

export type Target =
  /** `[data-tutorial="<name>"]` (§4.4 list; docs/tutorial-plan.md "Authoring lessons"). */
  | { ui: string }
  | { house: number }
  /** Restaurant id, or a player id for all of that chain's restaurants. */
  | { restaurant: string }
  | { campaign: string }
  | { source: readonly [x: number, y: number] }
  | { cell: readonly [x: number, y: number] }
  /** Map tile by rim label: column letter + row number ('B2'). */
  | { tile: string }
  /** The border between two adjacent tiles ('A1', 'B1'). */
  | { seam: readonly [tileA: string, tileB: string] }
  | { card: { player: PlayerId; uid?: string; employeeId?: string } }
  /**
   * Keep a board overlay visible for this step: `range` for a placement spec (road range from your
   * doors), `reach` for a would-be campaign. Without data the target only documents intent.
   */
  | { overlay: 'range'; spec?: PlacementSpec }
  | { overlay: 'reach'; placement?: Placement; good?: FoodId }
  | { overlay: 'routes' };

export type Allow =
  | 'none'
  | 'any'
  /** Gate: only actions matching one of these may be sent. The engine still validates them. */
  | { actions: ActionMatcher[] }
  /** UI-only steps (open a tab, tap the board, toggle a view): no game action may be sent. */
  | { ui: string[] };

export interface ActionMatcher {
  type: Action['type'];
  /** Narrow by payload (e.g. only `x: 3, y: 3`). */
  where?: (a: Action, view: GameView) => boolean;
  /** How many times this matcher may be used during the step (default unlimited). */
  limit?: number;
}

/** UI signals a predicate can watch (the board and dock publish them). */
export type SignalName = 'selection' | 'topView' | 'dockTab' | 'placementReason' | 'previewGood' | 'boardHover' | 'uiTap';

export type Predicate =
  /** An event of this type in the events applied since the step started (any seat, redacted for the learner). */
  | { event: GameEvent['type']; where?: (e: GameEvent, view: GameView) => boolean }
  | { view: (v: GameView) => boolean }
  /**
   * A UI signal: `equals` (deep), `match` (function), or `changed` (true = at least once, n = at
   * least n times since the step started). `uiTap` is the last `[data-tutorial]` element clicked.
   */
  | { signal: SignalName; equals?: unknown; match?: (value: unknown, view: GameView) => boolean; changed?: true | number }
  /** An animation beat (house / campaign id) landed during the step; a function matches ids. */
  | { beat: string | ((id: string, view: GameView) => boolean) }
  /** The game is paused by the tutorial module (after this phase, or any pause with `true`). */
  | { paused: TutorialPausePhase | 'start' | true }
  /** Full context (view, events, signals); for anything the others cannot say. */
  | { test: (ctx: StepCtx) => boolean }
  /** The Next button. */
  | { next: true }
  | { all: Predicate[] }
  | { any: Predicate[] };

export interface Hint {
  afterMs?: number;
  say: string;
  show?: Target[];
  /** After this long without progress, Skip step is highlighted. */
  thenSkipAfterMs?: number;
}

export interface ScriptedMove {
  player: PlayerId;
  /** A fixed action, or one computed from the scripted seat's view and legal actions. */
  action: Action | ((view: GameView, legal: LegalAction[]) => Action);
}

export interface CameraFrame {
  kind: 'board' | 'focus' | 'rect' | 'top';
  /** `focus`: board object ids (house / restaurant / campaign / entity). */
  ids?: string[];
  /** `rect`: world rectangle (board squares; x right, z down). */
  rect?: { x0: number; z0: number; x1: number; z1: number };
}

export type Effect =
  | { openTab: Exclude<DockTab, 'chat'> }
  | { setSetting: Partial<Settings> }
  | { select: Selection | null }
  | { summary: 'open' | 'close' }
  | { camera: CameraFrame }
  | { follow: boolean };

/** UI signal values as the step sees them. */
export interface SignalValues {
  selection: Selection | null;
  topView: boolean;
  dockTab: DockTab;
  placementReason: string | null;
  previewGood: FoodId | null;
  boardHover: { id: string | null; cell: { x: number; y: number } | null } | null;
  uiTap: string | null;
}

export interface StepCtx {
  view: GameView;
  me: PlayerId;
  /** Events applied since the step started (redacted for the learner), oldest first. */
  events: GameEvent[];
  /** The learner's legal actions now. */
  legal: LegalAction[];
  lastAction: Action | null;
  /** Full engine state (scripted moves, solutions). Never use it in narration: it holds hidden info. */
  state: () => GameState;
  signals: SignalValues;
}

export interface Quiz {
  questions: Question[];
  /** Minimum correct answers to pass. */
  pass: number;
}

export type Question =
  | { kind: 'choice'; q: string; options: string[]; answer: number; why: string }
  | { kind: 'tap'; q: string; target: Target; why: string }
  | { kind: 'number'; q: string; answer: number | ((v: GameView) => number); why: string };

/** Identity helper so lesson files get full type checking and inference. */
export const defineLesson = (lesson: Lesson): Lesson => lesson;
