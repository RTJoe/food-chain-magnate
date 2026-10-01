/**
 * Fry Chefs (ketchup.md §9; KX p13; DLX p21).
 *
 * - Fry Chef (x6, salary, kitchen green): trained from any cook (burger, pizza, sushi, noodle;
 *   the "Fry Chef" cook replacement cards add the career step).
 * - Each fry chef at work: +$10 per sale (per house, apartment or rural area sold to), whatever the
 *   number of items. Not unit price (no effect on the house's choice), not doubled by gardens;
 *   several stack; the CFO counts it (it is Dinnertime income).
 *   Example (DLX p21): 3 burgers at $20 with 2 fry chefs → $60 + $20 = $80.
 */
import type { GameModule } from '../../types/module.js';
import { kcard, workDefs } from './shared.js';

const ID = 'ketchup:fryChefs' as const;

export const FRY_CHEFS_MODULE: GameModule = {
  id: ID,
  name: 'Fry Chefs',
  description: 'Fry Chefs add $10 to every sale.',
  content: {
    employees: [
      kcard('ketchup:fry_chef', 'Fry Chef', ID, 6, 'oliveGreen', 'kitchen', { kind: 'fryChef', bonusPerSale: 10 }, '+$10 for every house you sell to.', 'employees.md §2; ketchup.md §9', {
        salary: true,
      }),
    ],
    careerAdditions: {
      burger_cook: ['ketchup:fry_chef'],
      pizza_cook: ['ketchup:fry_chef'],
      'ketchup:sushi_cook': ['ketchup:fry_chef'],
      'ketchup:noodle_cook': ['ketchup:fry_chef'],
    },
  },
  hooks: {
    saleRevenue(bd, ctx) {
      const p = ctx.state.players[bd.player];
      if (!p) return bd;
      const amount = workDefs(ctx.state, p).reduce((a, x) => a + (x.def.ability.kind === 'fryChef' ? x.def.ability.bonusPerSale : 0), 0);
      if (amount === 0) return bd;
      return { ...bd, bonuses: [...bd.bonuses, { source: 'ketchup:fry_chef', amount }], total: bd.total + amount };
    },
  },
};
