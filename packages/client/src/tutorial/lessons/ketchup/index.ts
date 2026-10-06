/** Ketchup course lessons (docs/tutorial-plan.md §3; WP-T4), in the plan's order. Listed lessons replace their "coming soon" card. */
import type { Lesson } from '../../dsl.js';
import { hardChoicesLesson } from './01-hard-choices.js';
import { reservePricesLesson } from './02-reserve-prices.js';
import { movieStarsLesson } from './03-movie-stars.js';
import { fryChefsLesson } from './04-fry-chefs.js';
import { nightShiftLesson } from './05-night-shift.js';
import { kimchiLesson } from './06-kimchi.js';
import { sushiLesson } from './07-sushi.js';
import { noodlesLesson } from './08-noodles.js';
import { coffeeLesson } from './09-coffee.js';
import { newDistrictsLesson } from './10-new-districts.js';
import { lobbyistsLesson } from './11-lobbyists.js';
import { massMarketeersLesson } from './12-mass-marketeers.js';
import { gourmetCriticsLesson } from './13-gourmet-critics.js';
import { ruralMarketeersLesson } from './14-rural-marketeers.js';
import { ketchupLesson } from './15-ketchup.js';
import { newMilestonesLesson } from './16-new-milestones.js';
import { sixPlayersLesson } from './17-six-players.js';

export const KETCHUP_LESSONS: Lesson[] = [
  hardChoicesLesson,
  reservePricesLesson,
  movieStarsLesson,
  fryChefsLesson,
  nightShiftLesson,
  kimchiLesson,
  sushiLesson,
  noodlesLesson,
  coffeeLesson,
  newDistrictsLesson,
  lobbyistsLesson,
  massMarketeersLesson,
  gourmetCriticsLesson,
  ruralMarketeersLesson,
  ketchupLesson,
  newMilestonesLesson,
  sixPlayersLesson,
];
