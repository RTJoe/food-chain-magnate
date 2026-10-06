/**
 * Headless lesson walker (docs/tutorial-plan.md §4.8): runs a lesson on the real engine with no DOM
 * and no Three. For each step it applies the scripted opponent moves, the bot moves and the step's
 * `solution` (actions through the gate, taps simulated on the UI signals) and checks that `until`
 * becomes true. `random` mode first plays random *allowed* actions (no-dead-end property harness).
 *
 * Used by vitest (packages/client/test/tutorial/*.test.ts); the browser runner shares machine.ts.
 */
import type { Action, GameEvent, GameState, GameView, LegalAction, PlayerId } from '@fcm/engine';
import { applyAction, legalActions, redactEvents, redactFor } from '@fcm/engine';
import { lessonStart } from './scenario.js';
import { botBudgetMs, decisionSeed, fallbackAction, runBot } from '@fcm/ai';
import { engine } from '@fcm/engine';
import type { Lesson, SignalName, SignalValues, SolutionOp, Step, StepCtx, Target } from './dsl.js';
import { allowedReady, allowReachable, botSeats, evaluate, freshProgress, gateReason, isTap, matcherIndex, needsSolution, nextScripted, offersNext, scriptedSeats, solutionOf, type StepProgress } from './machine.js';
import { isBoardTarget, selectionFor, targetBoardIds, targetUiNames, targetWorldRects } from './targets.js';

export { lessonStart };

export interface StepReport {
  id: string;
  /** What was done, in order ("scripted p2 setup.chooseReserve", "tap house 18", "next"). */
  ops: string[];
  problems: string[];
}

export interface WalkResult {
  ok: boolean;
  problems: string[];
  steps: StepReport[];
  /** Every action applied (learner, scripted, bots): the golden / resume log. */
  actions: Action[];
  state: GameState;
  view: GameView;
}

export interface WalkOptions {
  /** Play up to `maxExtra` random allowed ready actions at each gated step before the solution. */
  random?: { seed: number; maxExtra?: number };
  /** Stop after this step id (inclusive). */
  until?: string;
}

const initialSignals = (): SignalValues => ({ selection: null, topView: false, dockTab: 'turn', placementReason: null, previewGood: null, boardHover: null, uiTap: null });

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Board piece under a square (house, restaurant, source), for simulated tile / cell taps. */
function pieceAt(view: GameView, x: number, y: number): SignalValues['selection'] {
  for (const h of Object.values(view.board.houses)) if (h.cells.some((c) => c.x === x && c.y === y)) return { kind: 'house', id: h.id };
  for (const r of Object.values(view.board.restaurants)) if (x >= r.x && x < r.x + 2 && y >= r.y && y < r.y + 2) return { kind: 'restaurant', id: r.id };
  for (const s of Object.values(view.board.drinkSources)) if (s.x === x && s.y === y) return { kind: 'source', id: s.id };
  return null;
}

export const describeOp = (op: SolutionOp): string => (isTap(op) ? `tap ${JSON.stringify(op.tap)}` : op.type);

/**
 * Walk a lesson's steps. Never throws for lesson problems: they are collected in `problems`
 * (prefixed with the step id) so a test can print them all.
 */
export function walkLesson(lesson: Lesson, opts: WalkOptions = {}): WalkResult {
  const me = lesson.scenario.learner;
  const scripted = new Set(scriptedSeats(lesson));
  const bots = botSeats(lesson);
  const rnd = opts.random ? mulberry32(opts.random.seed) : null;
  const problems: string[] = [];
  const reports: StepReport[] = [];
  const actions: Action[] = [];
  let state = lessonStart(lesson).state;
  let signals = initialSignals();
  let lastAction: Action | null = null;

  const view = () => redactFor(state, me);
  const legal = (): LegalAction[] => legalActions(state, me);

  for (const step of lesson.steps) {
    const rep: StepReport = { id: step.id, ops: [], problems: [] };
    reports.push(rep);
    const bad = (msg: string) => rep.problems.push(msg);
    const prog: StepProgress = freshProgress();
    let events: GameEvent[] = [];

    const setSignal = <K extends SignalName>(name: K, value: SignalValues[K]) => {
      if (JSON.stringify(signals[name]) === JSON.stringify(value)) return;
      signals = { ...signals, [name]: value };
      prog.changes[name] = (prog.changes[name] ?? 0) + 1;
    };
    const ctx = (): StepCtx => ({ view: view(), me, events, legal: legal(), lastAction, state: () => state, signals });

    const apply = (who: PlayerId, a: Action): string | null => {
      const act = { ...a, playerId: who } as Action;
      const r = applyAction(state, act);
      if (!r.ok) return r.message;
      state = r.state;
      actions.push(act);
      if (who === me) lastAction = act;
      const red = redactEvents(r.events, me);
      events = [...events, ...red];
      for (const e of red) {
        if (e.type === 'houseConsidered' || e.type === 'sale') prog.beats.add(e.houseId);
        if (e.type === 'campaignRan') prog.beats.add(e.campaignId);
      }
      return null;
    };

    const tap = (t: Target) => {
      const v = view();
      if (isBoardTarget(t)) {
        const rect = targetWorldRects(v, t)[0];
        const cx = rect ? Math.floor((rect.x0 + rect.x1) / 2) : null;
        const cy = rect ? Math.floor((rect.z0 + rect.z1) / 2) : null;
        const sel = targetBoardIds(v, t).length ? selectionFor(v, t) : cx !== null && cy !== null ? pieceAt(v, cx, cy) : null;
        if (!rect && !sel) bad(`tap target not on the board: ${JSON.stringify(t)}`);
        setSignal('boardHover', cx !== null && cy !== null ? { id: sel?.id ?? null, cell: { x: cx, y: cy } } : null);
        setSignal('selection', sel);
        return;
      }
      const name = targetUiNames(t)[0];
      if (!name) return bad(`tap on a target with no UI name: ${JSON.stringify(t)}`);
      // uiTap counts every tap, even on the same element.
      signals = { ...signals, uiTap: name };
      prog.changes.uiTap = (prog.changes.uiTap ?? 0) + 1;
      if (name === 'camera-top') setSignal('topView', !signals.topView);
      else if (name === 'camera-reset') setSignal('topView', false);
      else if (name.startsWith('tab-')) setSignal('dockTab', name.slice(4) as SignalValues['dockTab']);
      else if (name === 'continue') {
        const head = view().pending[0];
        if (head?.kind === 'continue') {
          const err = apply(me, { type: 'tutorial.continue', playerId: me, choiceId: head.id });
          if (err) bad(`continue rejected: ${err}`);
        }
      }
    };

    for (const e of step.onEnter ?? []) {
      if ('select' in e) setSignal('selection', e.select);
      if ('openTab' in e) setSignal('dockTab', e.openTab);
    }
    // Narration must not throw on the live view.
    try {
      if (typeof step.say === 'function') step.say(ctx());
    } catch (e) {
      bad(`say() threw: ${String(e)}`);
    }
    if (needsSolution(step) && step.solution === undefined) bad('step needs a solution (allow is not none or until is not Next)');

    const awaitedLearner = () => state.awaiting.players.includes(me);
    if (step.allow && typeof step.allow === 'object' && 'actions' in step.allow && awaitedLearner() && !allowReachable(step.allow, legal(), view())) {
      bad(`dead end: no legal action matches allow (${step.allow.actions.map((m) => m.type).join(', ')})`);
    }

    // Property harness: random allowed actions first.
    if (rnd && step.allow && step.allow !== 'none') {
      const extra = Math.floor(rnd() * ((opts.random?.maxExtra ?? 2) + 1));
      for (let i = 0; i < extra; i++) {
        if (evaluate(step.until, ctx(), prog)) break;
        const choices = allowedReady(step.allow, legal(), view());
        const pick = choices[Math.floor(rnd() * choices.length)];
        if (!pick) break;
        const idx = matcherIndex(step.allow, pick, view(), prog.used);
        if (gateReason(step.allow, pick, view(), prog.used) !== null) break;
        if (apply(me, pick) === null) {
          rep.ops.push(`random ${pick.type}`);
          if (idx >= 0) prog.used[idx] = (prog.used[idx] ?? 0) + 1;
        }
      }
    }

    let ops = solutionOf(step, ctx());
    let usedSolution = false;
    for (let guard = 0; guard < 400; guard++) {
      if (evaluate(step.until, ctx(), prog)) break;
      // Opponents first: the engine may be waiting on them.
      const awaited = state.awaiting.players;
      const sp = awaited.find((p) => scripted.has(p));
      const move = sp ? nextScripted(step, prog, sp, redactFor(state, sp), legalActions(state, sp)) : null;
      if (sp && move) {
        prog.scripted.add(move.index);
        let err = apply(sp, move.action);
        if (err) {
          bad(`scripted ${sp} ${move.action.type} illegal (${err}); used the fallback move`);
          err = apply(sp, fallbackAction(state, sp, engine));
          if (err) bad(`fallback for ${sp} rejected: ${err}`);
        }
        rep.ops.push(`scripted ${sp} ${move.action.type}`);
        continue;
      }
      const bp = awaited.find((p) => bots[p]);
      if (bp) {
        const level = bots[bp] ?? 'easy';
        let a: Action;
        try {
          a = runBot({ level, view: redactFor(state, bp), playerId: bp, seed: decisionSeed(state.seed, state.history.seq, bp), budgetMs: botBudgetMs(level, 'hotSeat') });
        } catch {
          a = fallbackAction(state, bp, engine);
        }
        const err = apply(bp, a) && apply(bp, fallbackAction(state, bp, engine));
        if (err) bad(`bot ${bp} could not move: ${err}`);
        rep.ops.push(`bot ${bp} ${a.type}`);
        continue;
      }
      // A solution computed at step start may depend on state reached since (Continue ids): refresh once.
      if (!ops.length && !usedSolution && step.solution) {
        usedSolution = true;
        ops = solutionOf(step, ctx());
      }
      const op = ops.shift();
      if (op) {
        usedSolution = true;
        rep.ops.push(describeOp(op));
        if (isTap(op)) tap(op.tap);
        else {
          const v = view();
          const reason = gateReason(step.allow, { ...op, playerId: me } as Action, v, prog.used);
          if (reason) bad(`solution ${op.type} refused by the gate: ${reason}`);
          const idx = matcherIndex(step.allow, op, v, prog.used);
          const err = apply(me, op);
          if (err) bad(`solution ${op.type} rejected by the engine: ${err}`);
          else if (idx >= 0) prog.used[idx] = (prog.used[idx] ?? 0) + 1;
        }
        continue;
      }
      if (offersNext(step.until) && !prog.next) {
        prog.next = true;
        rep.ops.push('next');
        continue;
      }
      bad(`until not reached (${sp ? `scripted ${sp} has no move; ` : ''}awaiting ${state.awaiting.kind} ${state.awaiting.players.join(',')})`);
      break;
    }
    for (const e of step.onExit ?? []) {
      if ('select' in e) setSignal('selection', e.select);
      if ('openTab' in e) setSignal('dockTab', e.openTab);
    }
    problems.push(...rep.problems.map((p) => `${lesson.id} ${step.id}: ${p}`));
    if (opts.until === step.id) break;
  }
  return { ok: problems.length === 0, problems, steps: reports, actions, state, view: view() };
}

/** Quiz sanity: answers are valid indices, tap targets exist in the final state, numbers compute. */
export function quizProblems(lesson: Lesson, view: GameView): string[] {
  const out: string[] = [];
  lesson.quiz.questions.forEach((q, i) => {
    const at = `${lesson.id} quiz ${i + 1}`;
    if (!q.why.trim()) out.push(`${at}: missing why`);
    if (q.kind === 'choice' && (q.answer < 0 || q.answer >= q.options.length || !Number.isInteger(q.answer))) out.push(`${at}: answer ${q.answer} is not an option`);
    if (q.kind === 'tap' && isBoardTarget(q.target) && !targetBoardIds(view, q.target).length && !targetWorldRects(view, q.target).length) out.push(`${at}: tap target not on the board`);
    if (q.kind === 'number') {
      try {
        const n = typeof q.answer === 'function' ? q.answer(view) : q.answer;
        if (!Number.isFinite(n)) out.push(`${at}: answer is not a number`);
      } catch (e) {
        out.push(`${at}: answer() threw ${String(e)}`);
      }
    }
  });
  if (lesson.quiz.pass > lesson.quiz.questions.length) out.push(`${lesson.id} quiz: pass ${lesson.quiz.pass} > ${lesson.quiz.questions.length} questions`);
  return out;
}

/** Authoring lint: ids unique, narration short, targets bounded (docs/tutorial-plan.md §4.9). */
export function lessonLint(lesson: Lesson): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const s of lesson.steps) {
    if (ids.has(s.id)) out.push(`${lesson.id}: duplicate step id ${s.id}`);
    ids.add(s.id);
    if (typeof s.say === 'string') {
      if (s.say.length > 160) out.push(`${lesson.id} ${s.id}: narration over 160 characters`);
      if ((s.say.match(/[.!?](\s|$)/g) ?? []).length > 2) out.push(`${lesson.id} ${s.id}: narration over 2 sentences`);
    }
  }
  return out;
}

/** No-dead-end property: `seeds` random walks; returns every problem found. */
export function deadEndProblems(lesson: Lesson, seeds = 50): string[] {
  const out = new Set<string>();
  for (let seed = 1; seed <= seeds; seed++) for (const p of walkLesson(lesson, { random: { seed } }).problems) out.add(p);
  return [...out];
}

export type { Step };
