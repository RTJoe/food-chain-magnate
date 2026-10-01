/**
 * Noodles (ketchup.md §7; KX p11; DLX p9).
 *
 * - Noodle Cook (x6, salary, makes 6, from the "Any Cook" kitchen trainee) and Noodle Chef
 *   (x3, 1x, makes 16). Produced like food; cannot be marketed; counts as food; can be frozen.
 * - Only if no chain can satisfy a house (and, for garden houses, none has enough sushi), the
 *   house looks for chains with at least as many noodles as its demand tokens. All-or-nothing.
 *   Houses, apartments and the rural area. See foodTiers.ts.
 * - Adds the expansion luxuries manager (ketchup.md §0).
 */
import type { GameModule } from '../../types/module.js';
import { FOODS } from '../../content/foods.js';
import { applyFoodTiers } from './foodTiers.js';
import { addExtraLuxuriesManager, kcard } from './shared.js';

const ID = 'ketchup:noodles' as const;
const REF = 'employees.md §2; ketchup.md §7';

export const NOODLES_MODULE: GameModule = {
  id: ID,
  name: 'Noodles',
  description: 'Noodle cooks and chefs; houses nobody can serve eat noodles instead.',
  content: {
    foods: FOODS.filter((f) => f.id === 'noodles'),
    employees: [
      kcard('ketchup:noodle_cook', 'Noodle Cook', ID, 6, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['noodles'], amount: 6, timing: 'working' }, 'Produce 6 noodles.', REF, {
        salary: true,
        trainsInto: ['ketchup:noodle_chef'],
      }),
      kcard('ketchup:noodle_chef', 'Noodle Chef', ID, 3, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['noodles'], amount: 16, timing: 'working' }, 'Produce 16 noodles.', REF, {
        salary: true,
        unique: true,
      }),
    ],
    careerAdditions: { kitchen_trainee: ['ketchup:noodle_cook'] },
  },
  hooks: {
    onCreateGame(ctx) {
      addExtraLuxuriesManager(ctx, ID);
    },
    dinnerCandidates: (cands, ctx, { house }) => applyFoodTiers(cands, ctx, house),
  },
};
