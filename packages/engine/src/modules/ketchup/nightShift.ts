/**
 * Night Shift Managers (ketchup.md §11; KX p14; DLX p22).
 *
 * - Night Shift Manager (x3, entry, salary, 1x, black): a manager with 0 slots that may only sit
 *   in a CEO slot (enforced on `restructure.submit`).
 * - While it is at work, every card in your structure WITHOUT a salary icon acts a second time
 *   ("as if you played two copies"); the CEO does not. Implemented as:
 *   - twice the uses for active cards (recruiting girl hires 2, kitchen/barista trainee makes 2,
 *     errand boy fetches 2, trainer trains 2 different cards, marketing trainee may start a
 *     second billboard — both busy markers on her, she returns when both end);
 *   - passive cards count twice: a pricing manager gives −$2, a waitress tips twice and counts as
 *     2 waitresses for ties (questions.md Q-K9: literal reading);
 *   - a management trainee gains no slots.
 * - Same-card training limits are unchanged (a trainer still trains a card at most once).
 */
import type { GameModule } from '../../types/module.js';
import type { GameState, PlayerId } from '../../types/state.js';
import { kcard, workDefs } from './shared.js';
import { contentFor } from '../registry.js';
import { defOf } from '../../core/cards.js';

const ID = 'ketchup:nightShift' as const;

export function nightShiftActive(s: GameState, player: PlayerId): boolean {
  const p = s.players[player];
  return Boolean(p && workDefs(s, p).some((x) => x.def.ability.kind === 'nightShift'));
}

export const NIGHT_SHIFT_MODULE: GameModule = {
  id: ID,
  name: 'Night Shift Managers',
  description: 'Employees without a salary work twice while a Night Shift Manager is at work.',
  content: {
    employees: [
      kcard('ketchup:night_shift_manager', 'Night Shift Manager', ID, 3, 'black', 'manager', { kind: 'nightShift' }, 'All your employees who do not require a salary work twice. 0 slots; CEO slot only.', 'employees.md §2; ketchup.md §11', {
        entry: true,
        salary: true,
        unique: true,
      }),
    ],
  },
  hooks: {
    actionProblem(problem, ctx, { action }) {
      if (problem || action.type !== 'restructure.submit') return problem;
      const s = ctx.state;
      const p = s.players[action.playerId];
      if (!p) return problem;
      const content = contentFor(s.config.modules);
      for (const subs of Object.values(action.structure.managerSubs ?? {})) {
        for (const uid of subs ?? []) {
          if (defOf(content, p, uid)?.ability.kind === 'nightShift') return 'A Night Shift Manager may only sit in a CEO slot';
        }
      }
      return null;
    },
    cardUses(v, ctx, { player, def }) {
      if (def.salary || def.ability.kind === 'ceo' || v.uses <= 0) return v;
      return nightShiftActive(ctx.state, player) ? { ...v, uses: v.uses * 2 } : v;
    },
    unitPrice(price, ctx, { player }) {
      const s = ctx.state;
      const p = s.players[player];
      if (!p || !nightShiftActive(s, player)) return price;
      let extra = 0;
      for (const { def } of workDefs(s, p)) if (!def.salary && def.ability.kind === 'price') extra += def.ability.delta;
      return price + extra;
    },
    tips(t, ctx, { player }) {
      return nightShiftActive(ctx.state, player) ? { waitresses: t.waitresses * 2, amount: t.amount * 2 } : t;
    },
    dinnerCandidates(cands, ctx) {
      return cands.map((c) => (nightShiftActive(ctx.state, c.player) ? { ...c, waitresses: c.waitresses * 2 } : c));
    },
  },
};
