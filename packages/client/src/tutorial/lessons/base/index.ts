/**
 * Base course lessons (docs/tutorial-plan.md §2). WP-T2 owns L1–L7 (first half of the array),
 * WP-T3 owns L8–L15 (second half). Lessons appear in the hub as soon as they are listed here; the
 * course map (../catalog.ts) shows planned ones as "coming soon".
 */
import type { Lesson } from '../../dsl.js';
import { lesson01 } from './01-town.js';
import { lesson02 } from './02-restaurant.js';
import { lesson03 } from './03-ceo-hire.js';
import { lesson04 } from './04-food.js';
import { lesson05 } from './05-dinnertime.js';
import { lesson06 } from './06-prices.js';
import { lesson07 } from './07-marketing.js';
import { T3_LESSONS } from './late-index.js';

export const BASE_LESSONS: Lesson[] = [
  // --- WP-T2: L1–L7 ---
  lesson01,
  lesson02,
  lesson03,
  lesson04,
  lesson05,
  lesson06,
  lesson07,
  // --- WP-T3: L8–L15 ---
  ...T3_LESSONS,
];
