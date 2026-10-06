/**
 * Browser lesson runner (docs/tutorial-plan.md §4.2): one `TutorialRunner` per open lesson.
 *
 *   start ─► scenario.build() + engine tutorial module (scenario.ts)
 *         ─► LocalTransport (session.startTutorial): fixed learner view, scripted seats (`actFor`),
 *            Easy bot seats (Web Worker), prelude = checkpoint actions (resume by replay)
 *         ─► action gate (session.setActionGate): only `step.allow` gets through; the engine
 *            still validates what does
 *   every view change / event batch / UI signal ─► evaluate `until`, apply `script` moves,
 *            watchdog for dead ends
 *   Skip step ─► the step's `solution` through the real UI paths (gate bypassed)
 *   checkpoint steps ─► progress.saveCheckpoint(lesson, step, actions so far)
 *
 * The coach layer (coach/CoachLayer.tsx) renders from the signals here. Shared logic lives in
 * machine.ts so the headless walker behaves the same.
 */
import { batch, effect, signal } from '@preact/signals';
import type { Action, GameEvent, GameView, LegalAction, PlayerId } from '@fcm/engine';
import { engine, legalActions, redactFor } from '@fcm/engine';
import { fallbackAction } from '@fcm/ai';
import { act, endSession, scriptedAct, setActionGate, startTutorial } from '../net/session.js';
import type { LocalTransport } from '../net/localTransport.js';
import { boardRenderer } from '../state/boardBridge.js';
import { currentBeat, requestReplay } from '../state/feedback.js';
import { boardHover, cameraCommand, followAction, placementReason, previewGood, select, selection, skipBoardBuild, topView, tutorialHighlight } from '../state/interaction.js';
import { rangeOverlay, reachOverlay } from '../state/boardOverlays.js';
import { rangeFor, reachFor } from '../state/guidance.js';
import { draft as storeDraft, me as storeMe, summaries, updateSettings, view as storeView } from '../state/store.js';
import { coachLevel, type CoachLevel } from '../ui/hints/coach.js';
import { dockTab, openSummary, seenSummary, sheetOpen } from '../ui/uiState.js';
import type { CameraFrame, Effect, Lesson, Question, SignalName, SignalValues, SolutionOp, Step, StepCtx, Target } from './dsl.js';
import { allowReachable, botSeats, evaluate, freshProgress, gateReason, hintDelay, isTap, matcherIndex, nextScripted, offersNext, sayOf, scriptedSeats, solutionOf, thenOf, type StepProgress } from './machine.js';
import { clearCheckpoint, lessonProgress, markOpened, recordQuiz, saveCheckpoint } from './progress.js';
import { courseBadges, lessonBadgeId } from './catalog.js';
import { lessonStart } from './scenario.js';
import { haulDrinks } from '../state/actions.js';
import { isBoardTarget, selectionFor, selectionMatches, targetBoardIds, targetUiNames, targetWorldRects } from './targets.js';

export type RunnerStatus = 'steps' | 'quiz' | 'done';

export interface QuizResult {
  correct: number;
  total: number;
  passed: boolean;
  newBadges: string[];
}

/** The last `[data-tutorial]` element the learner clicked (predicate signal `uiTap`). */
export const uiTap = signal<{ name: string; n: number } | null>(null);
/** The open lesson, or null. */
export const activeTutorial = signal<TutorialRunner | null>(null);
/** The scripted seat whose move is about to be applied (the rail says "thinking…" only then). */
export const scriptedActing = signal<PlayerId | null>(null);

/**
 * In a lesson, a scripted seat the engine awaits is only "thinking" while its scripted move is
 * pending; otherwise it is waiting for the lesson. Bot seats and other modes: false.
 */
export function lessonSeatWaiting(id: PlayerId): boolean {
  const r = activeTutorial.value;
  return Boolean(r && r.lesson.scenario.opponents[id] === 'scripted' && scriptedActing.value !== id);
}

const SCRIPT_DELAY_MS = 650;
const WATCHDOG_MS = 3000;
const BEAT_FALLBACK_MS = 6000;

const isDev = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

function signalValues(): SignalValues {
  return {
    selection: selection.peek(),
    topView: topView.peek(),
    dockTab: dockTab.peek(),
    placementReason: placementReason.peek(),
    previewGood: previewGood.peek(),
    boardHover: boardHover.peek(),
    uiTap: uiTap.peek()?.name ?? null,
    draft: storeDraft.peek(),
  };
}

/** Board piece under a square (tile / cell taps). */
function pieceAt(v: GameView, x: number, y: number): SignalValues['selection'] {
  for (const h of Object.values(v.board.houses)) if (h.cells.some((c) => c.x === x && c.y === y)) return { kind: 'house', id: h.id };
  for (const r of Object.values(v.board.restaurants)) if (x >= r.x && x < r.x + 2 && y >= r.y && y < r.y + 2) return { kind: 'restaurant', id: r.id };
  for (const s of Object.values(v.board.drinkSources)) if (s.x === x && s.y === y) return { kind: 'source', id: s.id };
  return null;
}

export function findUiTarget(t: Target): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  for (const name of targetUiNames(t)) {
    const all = document.querySelectorAll<HTMLElement>(`[data-tutorial="${CSS.escape(name)}"]`);
    for (const el of all) if (el.getClientRects().length) return el;
    if (all[0]) return all[0];
  }
  return null;
}

export class TutorialRunner {
  readonly lesson: Lesson;
  readonly me: PlayerId;
  readonly stepIndex = signal(0);
  readonly status = signal<RunnerStatus>('steps');
  /** Feedback of the step just completed. */
  readonly thenText = signal<string | null>(null);
  /** Why the last action did not go through (gate or engine). */
  readonly notice = signal<string | null>(null);
  /** 0 none, 1 hint shown, 2 hint repeated (targets pulse). */
  readonly hintLevel = signal(0);
  /** Skip step is highlighted (hint `thenSkipAfterMs`, or the watchdog). */
  readonly skipHot = signal(false);
  readonly skipping = signal(false);
  /** Bumped when progress inside the step changes (Next, beats): the strip re-renders. */
  readonly tick = signal(0);
  readonly quizIndex = signal(0);
  readonly quizAnswers = signal<boolean[]>([]);
  /** Answer given to the current question (null = not yet), with whether it was right. */
  readonly quizPicked = signal<{ value: number | string; correct: boolean } | null>(null);
  readonly result = signal<QuizResult | null>(null);
  /** Resume failed (the engine changed): the lesson restarted from the beginning. */
  readonly restarted = signal(false);

  private transport: LocalTransport | null = null;
  /** history.seq once the scenario and the checkpoint replay were applied. */
  startSeq = 0;
  private prog: StepProgress = freshProgress();
  private events: GameEvent[] = [];
  private lastAction: Action | null = null;
  private disposers: (() => void)[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private scriptTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private bypass = false;
  private evaluating = false;
  private queued = false;
  private prevSignals: SignalValues = signalValues();
  /** Actions applied when each step was entered (Back is allowed only across action-free steps). */
  private actionsAtEntry: number[] = [];
  private wroteOverlay = { range: false, reach: false };
  private followBefore = followAction.peek();
  /** Coach level before a `{ coach }` effect changed it (restored on dispose). */
  private coachBefore: CoachLevel | null = null;
  private disposed = false;

  constructor(lesson: Lesson) {
    this.lesson = lesson;
    this.me = lesson.scenario.learner;
  }

  get step(): Step {
    return this.lesson.steps[this.stepIndex.peek()] as Step;
  }

  get actions(): readonly Action[] {
    return this.transport?.actions ?? [];
  }

  /** Open the lesson; `resume` continues from the stored checkpoint when there is one. */
  start(resume = true): void {
    const lesson = this.lesson;
    const prog = lessonProgress(lesson.id);
    let at = resume && prog.stepId ? lesson.steps.findIndex((s) => s.id === prog.stepId) : 0;
    if (at < 0) at = 0;
    const prelude = at > 0 ? (prog.actions ?? []) : [];
    const base = { state: lessonStart(lesson).state, learner: this.me, scripted: scriptedSeats(lesson), bots: botSeats(lesson) };
    // A resumed lesson has already shown the setup board build: do not replay it (or wait for it).
    skipBoardBuild.value = at > 0;
    try {
      this.transport = startTutorial(engine, { ...base, prelude });
    } catch (e) {
      // A stored checkpoint the engine no longer accepts: start over rather than get stuck.
      console.warn(`[tutorial] resume of ${lesson.id} failed; restarting`, e);
      this.restarted.value = true;
      at = 0;
      this.transport = startTutorial(engine, { ...base, prelude: [] });
    }
    this.startSeq = this.transport.seq;
    markOpened(lesson.id);
    setActionGate((a) => this.gate(a), (reason) => (this.notice.value = reason));
    this.listen();
    activeTutorial.value = this;
    this.exposeForTests();
    this.enterStep(at, { resumed: at > 0 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    for (const d of this.disposers) d();
    this.disposers = [];
    setActionGate(null);
    tutorialHighlight.value = [];
    skipBoardBuild.value = false;
    scriptedActing.value = null;
    if (this.wroteOverlay.range) rangeOverlay.value = null;
    if (this.wroteOverlay.reach) reachOverlay.value = null;
    followAction.value = this.followBefore;
    if (this.coachBefore !== null) coachLevel.value = this.coachBefore;
    if (activeTutorial.peek() === this) activeTutorial.value = null;
    const w = globalThis as unknown as { __fcmTutorial?: unknown };
    if ((w.__fcmTutorial as { runner?: unknown } | undefined)?.runner === this) delete w.__fcmTutorial;
  }

  /** Leave the lesson (progress stays at the last checkpoint). */
  exit(): void {
    this.dispose();
    endSession();
  }

  // --- context ------------------------------------------------------------------

  ctx(): StepCtx | null {
    const v = storeView.peek();
    const t = this.transport;
    if (!v || !t?.state) return null;
    const state = t.state;
    let legal: LegalAction[] = [];
    try {
      legal = legalActions(state, this.me);
    } catch {
      legal = [];
    }
    return { view: v, me: this.me, events: this.events, legal, lastAction: this.lastAction, state: () => state, signals: signalValues() };
  }

  /** Narration of the current step, read from the live view. */
  say(): string {
    const c = this.ctx();
    return c ? sayOf(this.step, c) : typeof this.step.say === 'string' ? this.step.say : '';
  }

  /** The Next button is shown when Next can satisfy the step. */
  get offersNext(): boolean {
    return offersNext(this.step.until);
  }

  get canBack(): boolean {
    const i = this.stepIndex.peek();
    if (i === 0 || this.status.peek() !== 'steps') return false;
    return (this.actionsAtEntry[i - 1] ?? -1) === this.actions.length;
  }

  // --- gate ---------------------------------------------------------------------

  private gate(a: Action): string | null {
    if (this.bypass) return null;
    if (this.status.peek() !== 'steps') return 'The lesson part is over: finish the check below.';
    const v = storeView.peek();
    if (!v) return null;
    const reason = gateReason(this.step.allow, a, v, this.prog.used);
    if (reason) return reason;
    const idx = matcherIndex(this.step.allow, a, v, this.prog.used);
    if (idx >= 0) this.prog.used[idx] = (this.prog.used[idx] ?? 0) + 1;
    this.notice.value = null;
    return null;
  }

  // --- wiring -------------------------------------------------------------------

  private listen(): void {
    const t = this.transport;
    if (!t) return;
    this.disposers.push(
      t.onMessage((m) => {
        if (m.t === 'game.applied') {
          this.events = [...this.events, ...m.events];
          if (m.action.playerId === this.me) this.lastAction = m.action;
          this.noteEventBeats(m.events);
          this.activity();
        } else if (m.t === 'game.rejected') {
          this.notice.value = m.message || m.code;
        }
        this.queueEvaluate();
      }),
    );
    // UI signals: count changes, then re-evaluate.
    this.disposers.push(
      effect(() => {
        void selection.value;
        void topView.value;
        void dockTab.value;
        void placementReason.value;
        void previewGood.value;
        void boardHover.value;
        void uiTap.value;
        void storeDraft.value;
        void storeView.value;
        const now = signalValues();
        const prev = this.prevSignals;
        this.prevSignals = now;
        for (const k of Object.keys(now) as SignalName[]) {
          if (k === 'uiTap') continue; // counted per click below
          if (JSON.stringify(now[k]) !== JSON.stringify(prev[k])) this.prog.changes[k] = (this.prog.changes[k] ?? 0) + 1;
        }
        this.onQuizSelection(now.selection);
        this.queueEvaluate();
      }),
      effect(() => {
        const b = currentBeat.value;
        if (!b) return;
        this.prog.beats.add(b.id);
        // peek: reading `tick` here would subscribe this effect to the signal it writes (cycle).
        this.tick.value = this.tick.peek() + 1;
        this.queueEvaluate();
      }),
    );
    if (typeof document !== 'undefined') {
      const onClick = (e: Event) => {
        const el = (e.target as Element | null)?.closest?.('[data-tutorial]');
        const name = el?.getAttribute('data-tutorial');
        if (!name) return;
        this.prog.changes.uiTap = (this.prog.changes.uiTap ?? 0) + 1;
        uiTap.value = { name, n: (uiTap.peek()?.n ?? 0) + 1 };
        // Quiz `tap` questions on a UI target (a tab, a button) are answered by tapping it.
        if (this.status.peek() === 'quiz') this.answerTap(name);
      };
      const onActivity = () => this.activity();
      document.addEventListener('click', onClick, true);
      for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) document.addEventListener(ev, onActivity, { capture: true, passive: true });
      this.disposers.push(() => {
        document.removeEventListener('click', onClick, true);
        for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) document.removeEventListener(ev, onActivity, { capture: true });
      });
    }
  }

  /** Without the 3D animator (2D board, no WebGL) beats come from the events, a little later. */
  private noteEventBeats(events: readonly GameEvent[]): void {
    const ids: string[] = [];
    for (const e of events) {
      if (e.type === 'houseConsidered' || e.type === 'sale') ids.push(e.houseId);
      if (e.type === 'campaignRan') ids.push(e.campaignId);
    }
    if (!ids.length) return;
    const add = () => {
      for (const id of ids) this.prog.beats.add(id);
      this.tick.value++;
      this.queueEvaluate();
    };
    if (boardRenderer.peek() !== '3d') add();
    else this.timers.push(setTimeout(add, BEAT_FALLBACK_MS));
  }

  private queueEvaluate(): void {
    if (this.queued || this.disposed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.evaluate();
    });
  }

  private evaluate(): void {
    if (this.disposed || this.evaluating || this.status.peek() !== 'steps') return;
    const c = this.ctx();
    if (!c) return;
    this.evaluating = true;
    try {
      if (evaluate(this.step.until, c, this.prog)) {
        this.complete(c);
        return;
      }
      this.runScript();
      this.checkDeadEnd(c);
    } finally {
      this.evaluating = false;
    }
  }

  private complete(c: StepCtx): void {
    const step = this.step;
    this.thenText.value = thenOf(step, c);
    this.applyEffects(step.onExit);
    const next = this.stepIndex.peek() + 1;
    if (next >= this.lesson.steps.length) {
      this.finishSteps();
      return;
    }
    this.enterStep(next);
  }

  private enterStep(i: number, opts: { resumed?: boolean } = {}): void {
    const step = this.lesson.steps[i] as Step;
    this.clearTimers();
    batch(() => {
      this.stepIndex.value = i;
      this.prog = freshProgress();
      this.events = [];
      this.notice.value = null;
      this.hintLevel.value = 0;
      this.skipHot.value = false;
      this.tick.value++;
    });
    this.prevSignals = signalValues();
    this.actionsAtEntry[i] = this.actions.length;
    const cam = step.camera ?? (i === 0 || opts.resumed ? this.lesson.scenario.camera : undefined);
    if (cam) this.frame(cam);
    this.applyEffects(step.onEnter);
    this.showTargets(step);
    if (step.replay) this.replay(step.replay);
    if (step.checkpoint || i === 0) saveCheckpoint(this.lesson.id, step.id, i, this.lesson.steps.length, this.actions);
    this.activity();
    this.queueEvaluate();
  }

  private finishSteps(): void {
    this.clearTimers();
    tutorialHighlight.value = [];
    clearCheckpoint(this.lesson.id);
    // Phones: tap questions need the board (no sheet, no Summary card over it); the check lives on the coach card.
    sheetOpen.value = false;
    this.applyEffects([{ summary: 'close' }]);
    // Stop following a replay and show the whole board, so tap questions land where the pieces are.
    followAction.value = this.followBefore;
    this.frame({ kind: 'board' });
    batch(() => {
      this.status.value = 'quiz';
      this.quizIndex.value = 0;
      this.quizAnswers.value = [];
      this.quizPicked.value = null;
    });
    select(null);
  }

  // --- targets, camera, effects --------------------------------------------------

  private showTargets(step: Step): void {
    const v = storeView.peek();
    const show = step.show ?? [];
    tutorialHighlight.value = v ? show.flatMap((t) => targetBoardIds(v, t)) : [];
    // Overlays requested by the step.
    if (this.wroteOverlay.range) rangeOverlay.value = null;
    if (this.wroteOverlay.reach) reachOverlay.value = null;
    this.wroteOverlay = { range: false, reach: false };
    for (const t of show) {
      if (!('overlay' in t) || !v) continue;
      if (t.overlay === 'range' && t.spec) {
        rangeOverlay.value = rangeFor(v, this.me, t.spec);
        this.wroteOverlay.range = true;
      }
      if (t.overlay === 'reach' && t.placement && t.good) {
        reachOverlay.value = reachFor(v, this.me, t.placement, t.good);
        this.wroteOverlay.reach = true;
      }
    }
    // Phones: board steps collapse the sheet; UI targets in the dock open it.
    const ui = show.filter((t) => !isBoardTarget(t) && !('overlay' in t));
    const inDock = ui.some((t) => findUiTarget(t)?.closest('.dock') || targetUiNames(t).some((n) => n.startsWith('tab-') || n.startsWith('hand-') || n.startsWith('work-') || n === 'continue'));
    if (inDock) sheetOpen.value = true;
    else if (show.some(isBoardTarget)) sheetOpen.value = false;
  }

  frame(c: CameraFrame): void {
    switch (c.kind) {
      case 'board':
        cameraCommand.value = { kind: 'reset' };
        break;
      case 'top':
        cameraCommand.value = { kind: 'top', on: true };
        break;
      case 'focus':
        if (c.ids?.length) cameraCommand.value = { kind: 'focus', ids: c.ids };
        break;
      case 'rect':
        if (c.rect) cameraCommand.value = { kind: 'frame', rect: c.rect };
        break;
    }
  }

  private applyEffects(effects: Effect[] | undefined): void {
    for (const e of effects ?? []) {
      if ('openTab' in e) {
        dockTab.value = e.openTab;
        sheetOpen.value = true;
      } else if ('select' in e) select(e.select);
      else if ('setSetting' in e) updateSettings(e.setSetting);
      else if ('camera' in e) this.frame(e.camera);
      else if ('follow' in e) followAction.value = e.follow;
      else if ('coach' in e) {
        if (this.coachBefore === null) this.coachBefore = coachLevel.peek();
        coachLevel.value = e.coach;
      }
      else if ('summary' in e) {
        const last = summaries.peek().at(-1);
        if (e.summary === 'open' && last) openSummary.value = last.id;
        if (e.summary === 'close') {
          openSummary.value = null;
          if (last) seenSummary.value = Math.max(seenSummary.peek(), last.id);
        }
      }
    }
  }

  private replay(r: NonNullable<Step['replay']>): void {
    const s = [...summaries.peek()].reverse().find((x) => x.phase === r.phase);
    if (s) requestReplay(s.events, r.from ?? null);
  }

  // --- opponents -----------------------------------------------------------------

  private runScript(): void {
    const t = this.transport;
    const s = t?.state;
    if (!t || !s || this.scriptTimer) return;
    const scripted = new Set(scriptedSeats(this.lesson));
    const sp = s.awaiting.players.find((p) => scripted.has(p));
    if (!sp) return;
    const move = nextScripted(this.step, this.prog, sp, redactFor(s, sp), legalActions(s, sp));
    if (!move) return;
    this.prog.scripted.add(move.index);
    const stepAt = this.stepIndex.peek();
    scriptedActing.value = sp;
    this.scriptTimer = setTimeout(() => {
      this.scriptTimer = null;
      scriptedActing.value = null;
      if (this.disposed || this.stepIndex.peek() !== stepAt) return;
      const r = scriptedAct(sp, move.action);
      if (!r.ok) {
        const msg = `[tutorial] ${this.lesson.id} ${this.step.id}: scripted ${sp} ${move.action.type} illegal (${r.message}); using the fallback move`;
        if (isDev()) console.error(msg);
        else console.warn(msg);
        const cur = this.transport?.state;
        if (cur) scriptedAct(sp, fallbackAction(cur, sp, engine));
      }
      this.queueEvaluate();
    }, SCRIPT_DELAY_MS);
  }

  /** No allowed action is legal while the engine waits on the learner: log it and skip the step. */
  private checkDeadEnd(c: StepCtx): void {
    const step = this.step;
    const gated = step.allow && typeof step.allow === 'object' && 'actions' in step.allow;
    const stuck = gated && c.view.awaiting.players.includes(this.me) && !allowReachable(step.allow, c.legal, c.view);
    if (!stuck) {
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = null;
      return;
    }
    if (this.watchdog) return;
    const stepAt = this.stepIndex.peek();
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      if (this.disposed || this.stepIndex.peek() !== stepAt) return;
      const cc = this.ctx();
      if (!cc || allowReachable(this.step.allow, cc.legal, cc.view)) return;
      console.error(`[tutorial] ${this.lesson.id} ${this.step.id}: dead end (no legal action matches allow); skipping the step`);
      this.skipHot.value = true;
      void this.skip();
    }, WATCHDOG_MS);
  }

  // --- learner controls ----------------------------------------------------------

  next(): void {
    this.prog.next = true;
    this.tick.value++;
    this.activity();
    this.queueEvaluate();
  }

  back(): void {
    if (!this.canBack) return;
    this.thenText.value = null;
    this.enterStep(this.stepIndex.peek() - 1);
  }

  /** Apply the step's canonical moves through the real paths (actions bypass `allow`, not the engine). */
  async skip(): Promise<void> {
    if (this.skipping.peek() || this.status.peek() !== 'steps') return;
    this.skipping.value = true;
    const stepAt = this.stepIndex.peek();
    try {
      const c = this.ctx();
      let ops: SolutionOp[] = c ? solutionOf(this.step, c) : [];
      let refreshed = false;
      const repeat = Boolean(this.step.repeatSolution);
      for (let guard = 0; guard < (repeat ? 3000 : 40) && this.stepIndex.peek() === stepAt && this.status.peek() === 'steps' && !this.disposed; guard++) {
        const cc = this.ctx();
        if (cc && evaluate(this.step.until, cc, this.prog)) break;
        if (!ops.length && (!refreshed || repeat) && typeof this.step.solution === 'function' && cc) {
          refreshed = true;
          ops = solutionOf(this.step, cc);
          // A repeating solution with nothing to do yet: wait for opponents and bots.
          if (repeat && !ops.length) {
            await this.settle(250);
            continue;
          }
        }
        const op = ops.shift();
        if (!op) {
          if (this.offersNext) this.next();
          else await this.settle();
          if (!ops.length && refreshed) break;
          continue;
        }
        if (isTap(op)) this.tap(op.tap);
        else await this.sendBypassed(op);
        await this.settle();
      }
    } finally {
      this.skipping.value = false;
      this.queueEvaluate();
    }
  }

  /** Wait for the store and scripted opponents to catch up. */
  private settle(ms = 80): Promise<void> {
    return new Promise((r) => setTimeout(r, this.scriptTimer ? SCRIPT_DELAY_MS + 50 : ms));
  }

  private sendBypassed(a: Action): Promise<void> {
    const t = this.transport;
    return new Promise((resolve) => {
      if (!t) return resolve();
      this.bypass = true;
      let id: string | null = null;
      try {
        id = act(a);
      } finally {
        this.bypass = false;
      }
      if (!id) return resolve();
      const off = t.onMessage((m) => {
        if ((m.t === 'game.applied' && m.actionId === id) || (m.t === 'game.rejected' && m.id === id)) {
          off();
          resolve();
        }
      });
      setTimeout(() => {
        off();
        resolve();
      }, 3000);
    });
  }

  /** Perform a tap the way the learner would: select a board piece or click a UI element. */
  tap(t: Target): void {
    const v = storeView.peek();
    if (isBoardTarget(t) && v) {
      const rect = targetWorldRects(v, t)[0];
      const cx = rect ? Math.floor((rect.x0 + rect.x1) / 2) : null;
      const cy = rect ? Math.floor((rect.z0 + rect.z1) / 2) : null;
      const sel = targetBoardIds(v, t).length ? selectionFor(v, t) : cx !== null && cy !== null ? pieceAt(v, cx, cy) : null;
      if (cx !== null && cy !== null) boardHover.value = { id: sel?.id ?? null, cell: { x: cx, y: cy } };
      select(sel);
      return;
    }
    findUiTarget(t)?.click();
  }

  // --- hints ---------------------------------------------------------------------

  private activity(): void {
    if (this.disposed) return;
    for (const t of this.timers.splice(0)) clearTimeout(t);
    if (this.hintLevel.peek() !== 0) this.hintLevel.value = 0;
    if (this.status.peek() !== 'steps') return;
    const step = this.step;
    const d = hintDelay(step);
    this.timers.push(
      setTimeout(() => (this.hintLevel.value = 1), d),
      setTimeout(() => (this.hintLevel.value = 2), d * 2),
    );
    if (step.hint?.thenSkipAfterMs !== undefined) this.timers.push(setTimeout(() => (this.skipHot.value = true), step.hint.thenSkipAfterMs));
  }

  private clearTimers(): void {
    for (const t of this.timers.splice(0)) clearTimeout(t);
    if (this.scriptTimer) clearTimeout(this.scriptTimer);
    this.scriptTimer = null;
    scriptedActing.value = null;
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  // --- quiz ------------------------------------------------------------------------

  get question(): Question | undefined {
    return this.lesson.quiz.questions[this.quizIndex.peek()];
  }

  /** Answer the current question (choice index, number, or a tap target's selection). */
  answer(value: number): void {
    const q = this.question;
    const v = storeView.peek();
    if (!q || this.quizPicked.peek() || !v) return;
    let correct = false;
    if (q.kind === 'choice') correct = value === q.answer;
    else if (q.kind === 'number') correct = value === (typeof q.answer === 'function' ? q.answer(v) : q.answer);
    this.quizPicked.value = { value, correct };
  }

  private onQuizSelection(sel: SignalValues['selection']): void {
    if (this.status.peek() !== 'quiz' || this.quizPicked.peek() || !sel) return;
    const q = this.question;
    const v = storeView.peek();
    if (q?.kind !== 'tap' || !v || !isBoardTarget(q.target)) return;
    this.quizPicked.value = { value: sel.id, correct: selectionMatches(v, q.target, sel) };
  }

  /** UI tap questions: a `[data-tutorial]` element was tapped. */
  answerTap(name: string): void {
    const q = this.question;
    if (q?.kind !== 'tap' || this.quizPicked.peek()) return;
    this.quizPicked.value = { value: name, correct: targetUiNames(q.target).includes(name) };
  }

  nextQuestion(): void {
    const picked = this.quizPicked.peek();
    if (!picked) return;
    const answers = [...this.quizAnswers.peek(), picked.correct];
    batch(() => {
      this.quizAnswers.value = answers;
      this.quizPicked.value = null;
      this.quizIndex.value = this.quizIndex.peek() + 1;
    });
    select(null);
    if (answers.length >= this.lesson.quiz.questions.length) this.finishQuiz(answers);
  }

  private finishQuiz(answers: boolean[]): void {
    const correct = answers.filter(Boolean).length;
    const total = this.lesson.quiz.questions.length;
    const r = recordQuiz(this.lesson.id, correct, total, this.lesson.quiz.pass, lessonBadgeId(this.lesson), courseBadges);
    this.result.value = { correct, total, ...r };
    this.status.value = 'done';
  }

  retryQuiz(): void {
    batch(() => {
      this.status.value = 'quiz';
      this.quizIndex.value = 0;
      this.quizAnswers.value = [];
      this.quizPicked.value = null;
      this.result.value = null;
    });
  }

  // --- e2e hook ----------------------------------------------------------------------

  /** `window.__fcmTutorial` for Playwright's `runLesson` (state, canonical moves, target rects). */
  private exposeForTests(): void {
    const runner = this;
    const w = globalThis as unknown as { __fcmTutorial?: unknown };
    w.__fcmTutorial = {
      runner,
      current() {
        const c = runner.ctx();
        const step = runner.step;
        return {
          lessonId: runner.lesson.id,
          stepId: step.id,
          index: runner.stepIndex.peek(),
          status: runner.status.peek(),
          offersNext: runner.offersNext,
          solution: c ? solutionOf(step, c) : [],
          seq: runner.transport?.seq ?? 0,
          /** history.seq right after the start state and the resume replay (before any new move). */
          startSeq: runner.startSeq,
          quiz: runner.status.peek() === 'quiz' ? { index: runner.quizIndex.peek(), question: runner.question ?? null, picked: runner.quizPicked.peek() } : null,
          result: runner.result.peek(),
        };
      },
      /** Client-px rect of a target (board via `__fcmBoard.project`, UI via the DOM), or null. */
      targetRect(t: Target) {
        return targetClientRect(t);
      },
      skip: () => runner.skip(),
      /** Employee id of one of the learner's cards (e2e finds `hand-card-<employeeId>` for a uid). */
      employeeOf(uid: string) {
        return storeView.peek()?.players[runner.me]?.employees[uid]?.employeeId ?? null;
      },
      /** A house's printed label (e2e matches garden rows). */
      houseLabel(id: string) {
        return storeView.peek()?.board.houses[id]?.label ?? null;
      },
      /** Drinks a road / air `work.buyDrinks` action collects, as the haul rows list them (e2e picks the row). */
      haul(a: Action) {
        const st = runner.transport?.state;
        if (!st || a.type !== 'work.buyDrinks' || a.route.mode === 'errand') return null;
        const same = engine.legalPlacements(st, runner.me, { kind: 'buyerRoute', cardUid: a.cardUid }).find((p) => p.kind === 'buyerRoute' && JSON.stringify(p.route) === JSON.stringify(a.route));
        return same && same.kind === 'buyerRoute' ? haulDrinks(same, storeView.peek()) : null;
      },
      /** The current quiz question's correct answer (choice index, number, or tap target). */
      quizAnswer() {
        const q = runner.question;
        const v = storeView.peek();
        if (!q || !v) return null;
        if (q.kind === 'choice') return q.answer;
        if (q.kind === 'number') return typeof q.answer === 'function' ? q.answer(v) : q.answer;
        return q.target;
      },
    };
  }
}

/** Client-px bounding box of a target: UI element rect, or the projected board footprint. */
export function targetClientRect(t: Target): { x: number; y: number; w: number; h: number } | null {
  if (!isBoardTarget(t)) {
    const el = findUiTarget(t);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  }
  const v = storeView.peek();
  const board = (globalThis as unknown as { __fcmBoard?: { project(x: number, z: number, y?: number): { x: number; y: number } } }).__fcmBoard;
  if (!v || !board) return null;
  const rects = targetWorldRects(v, t);
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects)
    for (const [x, z] of [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x0, r.z1],
      [r.x1, r.z1],
    ] as const) {
      const p = board.project(x, z, 0.1);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Open a lesson (Learn route). Disposes any lesson still open. */
export function openLesson(lesson: Lesson, resume = true): TutorialRunner {
  activeTutorial.peek()?.exit();
  const r = new TutorialRunner(lesson);
  r.start(resume);
  return r;
}

/** Whether `me` matches the lesson learner (sanity for the coach layer). */
export const isLearnerView = (r: TutorialRunner): boolean => storeMe.peek() === r.me;
