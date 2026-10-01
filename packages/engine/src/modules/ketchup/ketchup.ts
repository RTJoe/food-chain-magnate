/**
 * Ketchup — "Someone sells your demand" (ketchup.md §8; KX p13; DLX p20).
 *
 * - At the END of a Dinnertime a player gains the milestone if, during it, another player sold to
 *   a house carrying demand that this player's marketeer created (demand tokens record `by`; pizza
 *   radios and the free mailbox are not linked to a marketeer and do not count). Several players
 *   can earn it from one sale. It cannot affect the Dinnertime in which it was earned.
 * - Effect: in Dinnertime your score is unit price + distance − 1 (stacks with First marketeer
 *   used −2). No effect on any range. Works for drink-only orders.
 */
import type { MilestoneDef } from '../../types/content.js';
import type { GameModule } from '../../types/module.js';
import type { PlayerId } from '../../types/state.js';
import { awardMilestone } from '../../rules/milestones.js';
import { hasMilestone } from '../../rules/pricing.js';
import { moduleState, peekState } from './shared.js';

const ID = 'ketchup:ketchup' as const;

export const KETCHUP_MILESTONE: MilestoneDef = {
  id: 'ketchup:ketchup',
  name: 'Someone sells your demand',
  module: ID,
  trigger: { kind: 'demandSoldByOther' },
  effects: [{ kind: 'dinnerScore', delta: -1 }],
  timing: 'nextDinnertime',
  text: 'In Dinnertime your price + distance counts $1 less.',
  rulesRef: 'ketchup.md §8; DLX p20',
};

interface KetchupState {
  /** Players whose marketeer demand was sold by someone else this Dinnertime. */
  qualified: PlayerId[];
}

export const KETCHUP_MODULE: GameModule = {
  id: ID,
  name: 'Ketchup',
  description: 'Earn a $1 Dinnertime edge when a rival sells to demand you created.',
  content: { milestones: [KETCHUP_MILESTONE] },
  hooks: {
    onPhaseEnter(ctx, phase) {
      if (phase.kind === 'dinnertime') moduleState<KetchupState>(ctx.state, ID, () => ({ qualified: [] })).qualified = [];
    },
    onEvent(ctx, event) {
      if (event.type !== 'sale') return;
      const s = ctx.state;
      const house = s.board.houses[event.houseId];
      if (!house) return;
      const st = moduleState<KetchupState>(s, ID, () => ({ qualified: [] }));
      for (const t of house.demand) {
        if (t.by && t.by !== event.player && !st.qualified.includes(t.by)) st.qualified.push(t.by);
      }
    },
    onPhaseExit(ctx, phase) {
      if (phase.kind !== 'dinnertime') return;
      const s = ctx.state;
      const st = peekState<KetchupState>(s, ID);
      if (!st) return;
      for (const id of s.turnOrder) if (st.qualified.includes(id) && !s.players[id]?.bankrupt) awardMilestone(ctx, id, 'ketchup:ketchup');
      st.qualified = [];
    },
    dinnerCandidates(cands, ctx) {
      return cands.map((c) => (hasMilestone(ctx.state, c.player, 'ketchup:ketchup') ? { ...c, score: c.score - 1 } : c));
    },
  },
};
