/**
 * Gourmet Food Critics (ketchup.md §13; KX p15; DLX p26).
 *
 * - Gourmet Food Critic (x6, salary, blue): trained from the (expansion) marketing trainee. In
 *   the marketing step it places a gourmet guide beside the board (position irrelevant, no range),
 *   1–3 duration counters, one good. The critic is busy while it runs.
 * - Gourmet guides are numbered 17–20 (DLX images show 20; Medium-High) and run in number order
 *   after the base campaigns.
 * - Each run places 1 demand of its good on EVERY house with a garden (printed or placed; not
 *   apartments, not park-only houses, not the rural area). Normal caps (5 with a garden).
 */
import type { GameModule } from '../../types/module.js';
import type { HouseId, PlayerId } from '../../types/state.js';
import type { Placement } from '../../types/view.js';
import { contentFor } from '../registry.js';
import { defOf } from '../../core/cards.js';
import { cardCheck } from '../../rules/working/stages.js';
import { kcard } from './shared.js';

const ID = 'ketchup:gourmetCritics' as const;
const NUMBERS = [17, 18, 19, 20];

export const GOURMET_CRITICS_MODULE: GameModule = {
  id: ID,
  name: 'Gourmet Food Critics',
  description: 'Gourmet guides market to every house with a garden.',
  content: {
    employees: [
      kcard('ketchup:gourmet_food_critic', 'Gourmet Food Critic', ID, 6, 'blue', 'marketing', { kind: 'marketing', campaigns: ['gourmetGuide'], range: 'unlimited', maxDuration: 3 }, 'Market to all houses with a garden. Max duration 3.', 'employees.md §2; ketchup.md §13', {
        salary: true,
      }),
    ],
    careerAdditions: { marketing_trainee: ['ketchup:gourmet_food_critic'] },
    marketingTiles: NUMBERS.map((number) => ({ number, kind: 'gourmetGuide' as const, module: ID, w: 0, h: 0 })),
  },
  hooks: {
    campaignPlacementProblem(problem, ctx, { def, kind, tileNumber, placement }) {
      if (kind !== 'gourmetGuide') return problem;
      const s = ctx.state;
      if (def.ability.kind !== 'marketing' || !def.ability.campaigns.includes('gourmetGuide')) return `${def.name} cannot place a gourmet guide`;
      if (contentFor(s.config.modules).marketingTiles[tileNumber]?.kind !== 'gourmetGuide') return `#${tileNumber} is not a gourmet guide`;
      if (!s.marketingTiles.includes(tileNumber)) return `Gourmet guide #${tileNumber} is not available`;
      if (placement?.kind !== 'offBoard') return 'Gourmet guides are placed beside the board';
      return null;
    },
    campaignReach(houses, ctx, { campaign }) {
      if (campaign.kind !== 'gourmetGuide') return houses;
      return Object.values(ctx.state.board.houses)
        .filter((h) => (h.kind === 'printed' || h.kind === 'placed') && h.garden !== null)
        .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
        .map((h) => h.id as HouseId);
    },
    legalPlacements(list, ctx, { player, spec }) {
      if (spec.kind !== 'campaign' || !spec.cardUid || ctx.state.phase.kind !== 'working') return list;
      if (spec.campaignKind && spec.campaignKind !== 'gourmetGuide') return list;
      const s = ctx.state;
      if (!cardCheck(s, player as PlayerId, spec.cardUid, ['marketing'], 'marketing').ok) return list;
      const p = s.players[player as PlayerId];
      const def = p ? defOf(contentFor(s.config.modules), p, spec.cardUid) : undefined;
      if (def?.ability.kind !== 'marketing' || !def.ability.campaigns.includes('gourmetGuide')) return list;
      const extra: Placement[] = s.marketingTiles
        .filter((n) => NUMBERS.includes(n) && (spec.tileNumber === undefined || spec.tileNumber === n))
        .map((n) => ({ kind: 'campaign', campaignKind: 'gourmetGuide', tileNumber: n, placement: { kind: 'offBoard' } }));
      return [...list, ...extra];
    },
  },
};
