/**
 * Kimchi (ketchup.md §5; KX p11; DLX p5–6).
 *
 * - Kimchi Master (x3, entry, salary, 1x): does nothing in phase 3. In Clean up, after food was
 *   thrown away / frozen, its owner gains 1 kimchi, kept automatically until next turn.
 *   Implementation: masters at work are recorded on entering Clean up (the structure is still
 *   intact); the kimchi is added when Clean up ends (after the freezer step), into the stock.
 * - Kimchi cannot be marketed (FoodDef). Freezer: kimchi is exclusive (base cleanup validation).
 * - Dinnertime: see foodTiers.ts — a chain that can satisfy the house AND has kimchi wins
 *   regardless of price/distance and sells exactly 1 kimchi with the order.
 * - Adds the expansion luxuries manager (ketchup.md §0).
 */
import type { GameModule } from '../../types/module.js';
import type { PlayerId } from '../../types/state.js';
import { FOODS } from '../../content/foods.js';
import { applyFoodTiers } from './foodTiers.js';
import { addExtraLuxuriesManager, kcard, moduleState, peekState, workDefs } from './shared.js';

const ID = 'ketchup:kimchi' as const;

interface KimchiState {
  /** Kimchi masters at work when Clean up began, per player. */
  masters: Record<PlayerId, string[]>;
}

export const KIMCHI_MODULE: GameModule = {
  id: ID,
  name: 'Kimchi',
  description: 'Kimchi Masters make kimchi in Clean up; houses prefer chains that add a kimchi.',
  content: {
    foods: FOODS.filter((f) => f.id === 'kimchi'),
    employees: [
      kcard('ketchup:kimchi_master', 'Kimchi Master', ID, 3, 'oliveGreen', 'kitchen', { kind: 'produce', foods: ['kimchi'], amount: 1, timing: 'cleanup' }, 'At the end of Clean up, gain 1 kimchi.', 'employees.md §2; ketchup.md §5', {
        entry: true,
        salary: true,
        unique: true,
      }),
    ],
  },
  hooks: {
    onCreateGame(ctx) {
      addExtraLuxuriesManager(ctx, ID);
    },
    onPhaseEnter(ctx, phase) {
      if (phase.kind !== 'cleanup') return;
      const s = ctx.state;
      const st = moduleState<KimchiState>(s, ID, () => ({ masters: {} }));
      st.masters = {};
      for (const id of s.turnOrder) {
        const p = s.players[id];
        if (!p || p.bankrupt) continue;
        const uids = workDefs(s, p)
          .filter((x) => x.def.ability.kind === 'produce' && x.def.ability.timing === 'cleanup')
          .map((x) => x.uid);
        if (uids.length) st.masters[id] = uids;
      }
    },
    onPhaseExit(ctx, phase) {
      if (phase.kind !== 'cleanup') return;
      const s = ctx.state;
      const st = peekState<KimchiState>(s, ID);
      if (!st) return;
      for (const id of s.turnOrder) {
        const p = s.players[id];
        if (!p || p.bankrupt) continue;
        for (const uid of st.masters[id] ?? []) {
          if (!p.employees[uid]) continue;
          p.inventory.kimchi = (p.inventory.kimchi ?? 0) + 1;
          ctx.emit({ type: 'foodProduced', player: id, uid, food: 'kimchi', count: 1 });
        }
      }
      st.masters = {};
    },
    dinnerCandidates: (cands, ctx, { house }) => applyFoodTiers(cands, ctx, house),
  },
};
