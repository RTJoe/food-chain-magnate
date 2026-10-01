/**
 * The Ketchup Mechanism & Other Ideas (docs/rules/ketchup.md): one module per section, in rulebook
 * order. Registered by modules/registry.ts. Each module works alone or combined with the others
 * (Hard Choices conflicts with New Milestones; 6 Players requires New Districts).
 */
import type { GameModule } from '../../types/module.js';
import { NEW_DISTRICTS_MODULE } from './newDistricts.js';
import { LOBBYISTS_MODULE } from './lobbyists.js';
import { NEW_MILESTONES_MODULE } from './newMilestones.js';
import { COFFEE_MODULE } from './coffee.js';
import { KIMCHI_MODULE } from './kimchi.js';
import { SUSHI_MODULE } from './sushi.js';
import { NOODLES_MODULE } from './noodles.js';
import { KETCHUP_MODULE } from './ketchup.js';
import { FRY_CHEFS_MODULE } from './fryChefs.js';
import { MASS_MARKETEERS_MODULE } from './massMarketeers.js';
import { NIGHT_SHIFT_MODULE } from './nightShift.js';
import { RURAL_MARKETEERS_MODULE } from './ruralMarketeers.js';
import { GOURMET_CRITICS_MODULE } from './gourmetCritics.js';
import { RESERVE_PRICES_MODULE } from './reservePrices.js';
import { MOVIE_STARS_MODULE } from './movieStars.js';
import { HARD_CHOICES_MODULE } from './hardChoices.js';
import { SIX_PLAYERS_MODULE } from './sixPlayers.js';

export const KETCHUP_MODULES: readonly GameModule[] = [
  NEW_DISTRICTS_MODULE,
  LOBBYISTS_MODULE,
  NEW_MILESTONES_MODULE,
  COFFEE_MODULE,
  KIMCHI_MODULE,
  SUSHI_MODULE,
  NOODLES_MODULE,
  KETCHUP_MODULE,
  FRY_CHEFS_MODULE,
  MASS_MARKETEERS_MODULE,
  NIGHT_SHIFT_MODULE,
  RURAL_MARKETEERS_MODULE,
  GOURMET_CRITICS_MODULE,
  RESERVE_PRICES_MODULE,
  MOVIE_STARS_MODULE,
  HARD_CHOICES_MODULE,
  SIX_PLAYERS_MODULE,
];

export {
  NEW_DISTRICTS_MODULE,
  LOBBYISTS_MODULE,
  NEW_MILESTONES_MODULE,
  COFFEE_MODULE,
  KIMCHI_MODULE,
  SUSHI_MODULE,
  NOODLES_MODULE,
  KETCHUP_MODULE,
  FRY_CHEFS_MODULE,
  MASS_MARKETEERS_MODULE,
  NIGHT_SHIFT_MODULE,
  RURAL_MARKETEERS_MODULE,
  GOURMET_CRITICS_MODULE,
  RESERVE_PRICES_MODULE,
  MOVIE_STARS_MODULE,
  HARD_CHOICES_MODULE,
  SIX_PLAYERS_MODULE,
};
