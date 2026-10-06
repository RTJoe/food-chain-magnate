/**
 * Base course lessons (docs/tutorial-plan.md §2). WP-T2 owns L1–L7 (first half of the array),
 * WP-T3 owns L8–L15 (second half). Lessons appear in the hub as soon as they are listed here; the
 * course map (../catalog.ts) shows planned ones as "coming soon".
 */
import type { Lesson } from '../../dsl.js';
import { lesson01 } from './01-town.js';

export const BASE_LESSONS: Lesson[] = [
  // --- WP-T2: L1–L7 ---
  lesson01,
  // --- WP-T3: L8–L15 ---
];
