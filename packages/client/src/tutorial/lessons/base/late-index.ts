/** WP-T3 lessons (L8–L15), spread into `BASE_LESSONS` (index.ts) so the two halves never touch the same lines. */
import type { Lesson } from '../../dsl.js';
import { lesson08 } from './08-drinks.js';
import { lesson09 } from './09-company.js';
import { lesson10 } from './10-order.js';
import { lesson11 } from './11-payday.js';
import { lesson12 } from './12-milestones.js';
import { lesson13 } from './13-houses.js';
import { lesson14 } from './14-bank.js';
import { lesson15 } from './15-guided.js';

export const T3_LESSONS: Lesson[] = [lesson08, lesson09, lesson10, lesson11, lesson12, lesson13, lesson14, lesson15];
