/**
 * Course map (docs/tutorial-plan.md §1.3, §3): every planned lesson in order, merged with the
 * lessons that exist (lessons/*). A planned entry without a lesson shows as "coming soon".
 * Badges (§4.5) are defined here too.
 */
import type { Lesson, LessonId } from './dsl.js';
import type { LearnProgress } from './progress.js';
import { BASE_LESSONS } from './lessons/base/index.js';
import { KETCHUP_LESSONS } from './lessons/ketchup/index.js';
import { demoLesson } from './lessons/dev/demo.js';

export interface CourseEntry {
  id: LessonId;
  course: 'base' | 'ketchup';
  title: string;
  minutes: number;
  /** Ketchup module id the lesson teaches. */
  module?: string;
  requires: LessonId[];
  /** The playable lesson, when written. */
  lesson: Lesson | null;
  /** L16: not a lesson, a hot-seat game with the coach on. */
  freePlay?: boolean;
}

const BASE_PLAN: [title: string, minutes: number][] = [
  ['The town', 5],
  ['Your restaurant', 6],
  ['The CEO and your first hire', 7],
  ['Making food', 6],
  ['Dinnertime: who sells and why', 8],
  ['Prices and competition', 9],
  ['Marketing creates demand', 9],
  ['Drinks and buyer routes', 8],
  ['Building a company', 10],
  ['Turn order and open slots', 5],
  ['Payday and salaries', 8],
  ['Milestones', 8],
  ['Houses, gardens and new restaurants', 9],
  ['The bank, reserve cards and the end', 8],
  ['Guided game vs an Easy bot', 40],
  ['Free play with a coach', 0],
];

const KETCHUP_PLAN: [module: string, title: string, minutes: number][] = [
  ['hardChoices', 'Hard Choices', 5],
  ['reservePrices', 'Reserve Prices', 6],
  ['movieStars', 'Movie Stars', 6],
  ['fryChefs', 'Fry Chefs', 5],
  ['nightShift', 'Night Shift Managers', 6],
  ['kimchi', 'Kimchi', 6],
  ['sushi', 'Sushi', 5],
  ['noodles', 'Noodles', 6],
  ['coffee', 'Coffee', 8],
  ['newDistricts', 'New Districts', 7],
  ['lobbyists', 'Lobbyists', 8],
  ['massMarketeers', 'Mass Marketeers', 5],
  ['gourmetCritics', 'Gourmet Food Critics', 4],
  ['ruralMarketeers', 'Rural Marketeers', 7],
  ['ketchup', 'Ketchup', 5],
  ['newMilestones', 'New Milestones', 8],
  ['sixPlayers', 'Six Players', 4],
];

const BASE_CORE: LessonId[] = Array.from({ length: 14 }, (_, i) => `base.${i + 1}` as LessonId);

function byId(list: readonly Lesson[]): Map<LessonId, Lesson> {
  return new Map(list.map((l) => [l.id, l]));
}

export function buildCourses(base: readonly Lesson[] = BASE_LESSONS, ketchup: readonly Lesson[] = KETCHUP_LESSONS): { base: CourseEntry[]; ketchup: CourseEntry[] } {
  const b = byId(base);
  const k = byId(ketchup);
  const baseEntries = BASE_PLAN.map(([title, minutes], i): CourseEntry => {
    const id = `base.${i + 1}` as LessonId;
    const lesson = b.get(id) ?? null;
    return {
      id,
      course: 'base',
      title: lesson?.title ?? title,
      minutes: lesson?.minutes ?? minutes,
      requires: lesson?.requires ?? (i === 0 ? [] : [`base.${i}` as LessonId]),
      lesson,
      ...(i === 15 ? { freePlay: true } : {}),
    };
  });
  const ketchupEntries = KETCHUP_PLAN.map(([mod, title, minutes]): CourseEntry => {
    const id = `ketchup.${mod}` as LessonId;
    const lesson = k.get(id) ?? null;
    return { id, course: 'ketchup', title: lesson?.title ?? title, minutes: lesson?.minutes ?? minutes, module: `ketchup:${mod}`, requires: lesson?.requires ?? BASE_CORE, lesson };
  });
  return { base: baseEntries, ketchup: ketchupEntries };
}

export const COURSES = buildCourses();

/** Every playable lesson by id (course lessons plus the dev demo). */
export const LESSONS: ReadonlyMap<LessonId, Lesson> = new Map([...BASE_LESSONS, ...KETCHUP_LESSONS, demoLesson].map((l) => [l.id, l]));

export const lessonById = (id: string): Lesson | undefined => LESSONS.get(id as LessonId);

export const entryById = (id: string): CourseEntry | undefined => [...COURSES.base, ...COURSES.ketchup].find((e) => e.id === id);

/** The next course entry after `id` (same course), for "Next lesson". */
export function nextEntry(id: LessonId): CourseEntry | undefined {
  const list = id.startsWith('ketchup.') ? COURSES.ketchup : COURSES.base;
  const i = list.findIndex((e) => e.id === id);
  return i >= 0 ? list[i + 1] : undefined;
}

// ---------------------------------------------------------------------------
// Badges (§4.5)
// ---------------------------------------------------------------------------

export interface BadgeDef {
  id: string;
  label: string;
  description: string;
}

export const COURSE_BADGES: BadgeDef[] = [
  { id: 'diner_owner', label: 'Diner Owner', description: 'Pass lessons 1–7.' },
  { id: 'chain_builder', label: 'Chain Builder', description: 'Pass lessons 8–14.' },
  { id: 'magnate_apprentice', label: 'Magnate Apprentice', description: 'Finish the guided game.' },
  { id: 'ketchup_connoisseur', label: 'Ketchup Connoisseur', description: 'Pass every Ketchup lesson.' },
  { id: 'perfect_score', label: 'Perfect Score', description: 'Every base quiz at 100%.' },
];

export const lessonBadgeId = (l: Lesson): string => l.badge?.id ?? `lesson:${l.id}`;
export const lessonBadgeLabel = (l: Lesson): string => l.badge?.label ?? l.title;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `base.${a + i}` as LessonId);

/** Course badges earned by this progress. */
export function courseBadges(p: LearnProgress): string[] {
  const passed = (id: LessonId) => p.lessons[id]?.status === 'passed';
  const out: string[] = [];
  if (range(1, 7).every(passed)) out.push('diner_owner');
  if (range(8, 14).every(passed)) out.push('chain_builder');
  if (passed('base.15')) out.push('magnate_apprentice');
  if (COURSES.ketchup.every((e) => passed(e.id))) out.push('ketchup_connoisseur');
  if (BASE_CORE.every((id) => p.lessons[id]?.quizBest === 100)) out.push('perfect_score');
  return out;
}

/** Why an entry is locked (missing prerequisites), or null. Passed or skipped prerequisites count. */
export function lockedBy(e: CourseEntry, p: LearnProgress): LessonId[] {
  return e.requires.filter((id) => {
    const s = p.lessons[id]?.status;
    return s !== 'passed' && s !== 'skipped';
  });
}
