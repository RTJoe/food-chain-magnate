/**
 * Mass Marketeers (ketchup.md §10; KX p14; DLX p23–24).
 *
 * - Mass Marketeer (x6, salary, blue): trained from the (expansion) marketing trainee. A
 *   marketeer for all purposes, but it places no tile, so it never counts as "used" for New
 *   Milestones; the base First Billboard salary waiver does not name it.
 * - For each mass marketeer at work (all players combined) phase 6 runs one extra full pass:
 *   every campaign runs once per pass in number order; duration counters come off only after the
 *   last pass (base marketing.ts). Demand caps still apply.
 */
import type { GameModule } from '../../types/module.js';
import { kcard, workDefs } from './shared.js';

const ID = 'ketchup:massMarketeers' as const;

export const MASS_MARKETEERS_MODULE: GameModule = {
  id: ID,
  name: 'Mass Marketeers',
  description: 'Each Mass Marketeer at work adds an extra marketing phase.',
  content: {
    employees: [
      kcard('ketchup:mass_marketeer', 'Mass Marketeer', ID, 6, 'blue', 'marketing', { kind: 'massMarketing' }, 'Play an extra marketing phase this turn; do not remove an extra duration token.', 'employees.md §2; ketchup.md §10', {
        salary: true,
      }),
    ],
    careerAdditions: { marketing_trainee: ['ketchup:mass_marketeer'] },
  },
  hooks: {
    marketingPasses(passes, ctx) {
      const s = ctx.state;
      let extra = 0;
      for (const id of s.turnOrder) {
        const p = s.players[id];
        if (!p || p.bankrupt) continue;
        extra += workDefs(s, p).filter((x) => x.def.ability.kind === 'massMarketing').length;
      }
      return passes + extra;
    },
  },
};
