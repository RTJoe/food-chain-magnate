/**
 * Learn progress (docs/tutorial-plan.md §4.5): `localStorage['fcm.learn']` v1. Written on every
 * checkpoint and quiz; `learnProgress` is a signal so the hub re-renders. No server: export/import
 * as JSON moves it between devices.
 */
import { signal } from '@preact/signals';
import type { Action } from '@fcm/engine';
import type { LessonId } from './dsl.js';

export const LEARN_KEY = 'fcm.learn';

export type LessonStatus = 'new' | 'started' | 'passed' | 'skipped';

export interface LessonProgress {
  status: LessonStatus;
  /** Checkpoint step and every action applied before it (resume by deterministic replay). */
  stepId?: string;
  actions?: Action[];
  /** Steps reached / total, for "in progress N%". */
  stepIndex?: number;
  steps?: number;
  /** Best quiz score, percent. */
  quizBest?: number;
  passedAt?: number;
}

export interface LearnProgress {
  v: 1;
  lessons: Partial<Record<LessonId, LessonProgress>>;
  badges: string[];
  /** Last lesson opened (the hub's Continue card). */
  last?: LessonId;
}

const empty = (): LearnProgress => ({ v: 1, lessons: {}, badges: [] });

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parse(raw: string | null | undefined): LearnProgress | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<LearnProgress>;
    if (p?.v !== 1 || typeof p.lessons !== 'object' || !p.lessons) return null;
    return { v: 1, lessons: p.lessons, badges: Array.isArray(p.badges) ? p.badges.filter((b): b is string => typeof b === 'string') : [], ...(p.last ? { last: p.last } : {}) };
  } catch {
    return null;
  }
}

export const learnProgress = signal<LearnProgress>(parse(storage()?.getItem(LEARN_KEY)) ?? empty());

/** True once anything was stored (Home shows the first-time banner until then). */
export const hasLearnProgress = (): boolean => Boolean(storage()?.getItem(LEARN_KEY));

function write(next: LearnProgress): void {
  learnProgress.value = next;
  try {
    storage()?.setItem(LEARN_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota: progress lives for this session only */
  }
}

export const lessonProgress = (id: LessonId): LessonProgress => learnProgress.value.lessons[id] ?? { status: 'new' };

function patchLesson(id: LessonId, patch: Partial<LessonProgress>, extra: Partial<LearnProgress> = {}): void {
  const cur = learnProgress.value;
  const prev = cur.lessons[id] ?? { status: 'new' as const };
  write({ ...cur, ...extra, lessons: { ...cur.lessons, [id]: { ...prev, ...patch } } });
}

/** Opened a lesson: remember it for Continue; a new lesson becomes started. */
export function markOpened(id: LessonId): void {
  const prev = lessonProgress(id);
  patchLesson(id, prev.status === 'new' ? { status: 'started' } : {}, { last: id });
}

/** Checkpoint: the step to resume at and the actions that lead there. Never downgrades a pass. */
export function saveCheckpoint(id: LessonId, stepId: string, stepIndex: number, steps: number, actions: readonly Action[]): void {
  const prev = lessonProgress(id);
  patchLesson(id, { status: prev.status === 'passed' ? 'passed' : 'started', stepId, stepIndex, steps, actions: [...actions] });
}

/** Steps done: the checkpoint is cleared so the next start is fresh (the quiz is next). */
export function clearCheckpoint(id: LessonId): void {
  const { stepId: _s, actions: _a, ...rest } = lessonProgress(id);
  const cur = learnProgress.value;
  write({ ...cur, lessons: { ...cur.lessons, [id]: { ...rest, stepIndex: rest.steps ?? rest.stepIndex } } });
}

/** Quiz finished. Returns whether it passed and which badges are new. */
export function recordQuiz(id: LessonId, correct: number, total: number, pass: number, lessonBadge: string, courseBadges: (p: LearnProgress) => string[]): { passed: boolean; newBadges: string[] } {
  const pct = total ? Math.round((correct / total) * 100) : 100;
  const prev = lessonProgress(id);
  const passed = correct >= pass;
  const status: LessonStatus = passed || prev.status === 'passed' ? 'passed' : prev.status === 'skipped' ? 'skipped' : 'started';
  patchLesson(id, { status, quizBest: Math.max(prev.quizBest ?? 0, pct), ...(passed && !prev.passedAt ? { passedAt: Date.now() } : {}) });
  const before = new Set(learnProgress.value.badges);
  const earned = new Set(before);
  if (passed) earned.add(lessonBadge);
  for (const b of courseBadges(learnProgress.value)) earned.add(b);
  const newBadges = [...earned].filter((b) => !before.has(b));
  if (newBadges.length) write({ ...learnProgress.value, badges: [...earned] });
  return { passed, newBadges };
}

/** Skip lesson / skip prerequisites: seen, not passed. */
export function markSkipped(ids: readonly LessonId[]): void {
  const cur = learnProgress.value;
  const lessons = { ...cur.lessons };
  for (const id of ids) {
    const prev = lessons[id] ?? { status: 'new' as const };
    if (prev.status !== 'passed') lessons[id] = { ...prev, status: 'skipped' };
  }
  write({ ...cur, lessons });
}

/** Start a lesson over (keeps its best quiz score and pass). */
export function restartLesson(id: LessonId): void {
  const { stepId: _s, actions: _a, stepIndex: _i, ...rest } = lessonProgress(id);
  const cur = learnProgress.value;
  write({ ...cur, lessons: { ...cur.lessons, [id]: rest } });
}

export function exportProgress(): string {
  return JSON.stringify(learnProgress.value, null, 2);
}

/** Replace progress with an exported file's contents. False when it is not a v1 export. */
export function importProgress(json: string): boolean {
  const p = parse(json);
  if (!p) return false;
  write(p);
  return true;
}

/** Tests: forget everything. */
export function resetProgress(): void {
  write(empty());
}
