/**
 * Sushi (ketchup.md §6; KX p11; DLX p7–8).
 *
 * - Sushi Cook (x6, salary, makes 2, trained from the "Any Cook" kitchen trainee) and Sushi Chef
 *   (x3, 1x, makes 5). Produced like food; cannot be marketed; counts as food; can be frozen.
 * - Only houses with a garden want sushi: if a chain has at least as many sushi as the house's
 *   demand tokens, the house eats sushi there (all-or-nothing, normal competition among those
 *   chains); otherwise normal rules. Paid as normal items (garden doubling). See foodTiers.ts.
 * - Adds the expansion luxuries manager (ketchup.md §0).
 */
import type { GameModule } from '../../types/module.js';
import { FOODS } from '../../content/foods.js';
import { applyFoodTiers } from './foodTiers.js';
import { addExtraLuxuriesManager, kcard } from './shared.js';

const ID = 'ketchup:sushi' as const;
const REF = 'employees.md §2; ketchup.md §6';

export const SUSHI_MODULE: GameModule = {
  id: ID,
  name: 'Sushi',
  description: 'Sushi cooks and chefs; garden houses eat sushi when a chain has enough.',
  content: {
    foods: FOODS.filter((f) => f.id === 'sushi'),
    employees: [
      kcard('ketchup:sushi_cook', 'Sushi Cook', ID, 6, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['sushi'], amount: 2, timing: 'working' }, 'Produce 2 sushi.', REF, {
        salary: true,
        trainsInto: ['ketchup:sushi_chef'],
      }),
      kcard('ketchup:sushi_chef', 'Sushi Chef', ID, 3, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['sushi'], amount: 5, timing: 'working' }, 'Produce 5 sushi.', REF, {
        salary: true,
        unique: true,
      }),
    ],
    // "Any Cook" kitchen trainee (ketchup.md §0).
    careerAdditions: { kitchen_trainee: ['ketchup:sushi_cook'] },
  },
  hooks: {
    onCreateGame(ctx) {
      addExtraLuxuriesManager(ctx, ID);
    },
    dinnerCandidates: (cands, ctx, { house }) => applyFoodTiers(cands, ctx, house),
  },
};
