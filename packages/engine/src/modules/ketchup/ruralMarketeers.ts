/**
 * Rural Marketeers (ketchup.md §12; DLX p25–26).
 *
 * - Rural Marketeer (x6, salary, blue): trained from the (expansion) marketing trainee. In Launch
 *   Campaigns it places a giant billboard on a free side of the rural area tile (max 4), one good
 *   that can be marketed; no range limit; always eternal (the marketeer is busy for the rest of the
 *   game and, as for every eternal campaign, has no salary). Only rural marketeers place them.
 *   Giant billboards carry no number (Q-K6): they use tiles 21–24, which run after every numbered
 *   campaign (base run order is by number).
 * - The rural area is a house with no squares (created at setup, Dinnertime order 1000 = last).
 *   Each giant billboard places 2 tokens per marketing pass (`demandAmount` ×2: "Apartments and
 *   the Rural area receive two counters per Marketeer"); no maximum demand.
 * - Dinnertime distance (Q-K7): freeways connect the rural area to the road square they touch; the
 *   distance is the borders crossed from a restaurant to that square (the touched tile is 0).
 *   With no freeway nobody reaches it. Fry chefs, noodles and kimchi apply; sushi does not.
 * - "First Rural Marketeer Used": the first player(s) to place a giant billboard may place one
 *   freeway at once (optional choice): beside an outer board edge, touching a road square on that
 *   edge, not on an airplane's position (airplanes may not cover a freeway either). 3 freeways.
 */
import type { RuralPlaceFreeway } from '../../types/actions.js';
import type { Direction, MilestoneDef } from '../../types/content.js';
import type { GameModule, HookContext } from '../../types/module.js';
import type { CampaignPlacement, Cell, GameState, House, PlayerId } from '../../types/state.js';
import type { Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { DIRECTIONS, onMap, tileOf } from '../../map/grid.js';
import { distanceField, fieldAt, restaurantStarts, roadAt } from '../../map/pathfinding.js';
import { contentFor } from '../registry.js';
import { defOf } from '../../core/cards.js';
import { awardMilestone } from '../../rules/milestones.js';
import { cardCheck } from '../../rules/working/stages.js';
import { headChoice, isRejected, kcard, pushChoice, registerChoiceKind, resolveHead } from './shared.js';

const ID = 'ketchup:ruralMarketeers' as const;
export const GIANT_BILLBOARDS = [21, 22, 23, 24];
export const FREEWAYS = 3;

const FIRST_RURAL: MilestoneDef = {
  id: 'ketchup:first_rural_marketeer_used',
  name: 'First rural marketeer used',
  module: ID,
  trigger: { kind: 'used', employees: ['ketchup:rural_marketeer'] },
  effects: [{ kind: 'placeFreeway' }],
  timing: 'immediately',
  text: 'You may place one freeway now (highway off-ramp to the rural area).',
  rulesRef: 'ketchup.md §12; DLX p26',
};

export const ruralHouse = (s: GameState): House | undefined => Object.values(s.board.houses).find((h) => h.kind === 'rural');

// ---------------------------------------------------------------------------
// Freeways
// ---------------------------------------------------------------------------

/**
 * The square a freeway at (side, offset) touches: the first map square in from that board edge
 * (on a board grown by First Lobbyist Used the outer tile edge may lie inside the bounding box).
 */
export function freewayCell(s: GameState, side: Direction, offset: number): Cell {
  const { w, h } = s.board;
  const len = side === 'N' || side === 'S' ? h : w;
  const at = (i: number): Cell => {
    switch (side) {
      case 'N':
        return { x: offset, y: i };
      case 'S':
        return { x: offset, y: h - 1 - i };
      case 'W':
        return { x: i, y: offset };
      case 'E':
        return { x: w - 1 - i, y: offset };
    }
  };
  for (let i = 0; i < len; i++) if (onMap(s.board, at(i))) return at(i);
  return at(0);
}

const freeways = (s: GameState) => Object.values(s.board.entities).filter((e): e is Extract<typeof e, { kind: 'freeway' }> => e.kind === 'freeway');

export function freewayProblem(s: GameState, side: Direction, offset: number): string | null {
  if (!DIRECTIONS.includes(side) || !Number.isInteger(offset)) return 'Bad freeway position';
  if (freeways(s).length >= FREEWAYS) return 'No freeways left';
  const len = side === 'N' || side === 'S' ? s.board.w : s.board.h;
  if (offset < 0 || offset >= len) return 'Freeways go beside the map';
  const c = freewayCell(s, side, offset);
  if (!onMap(s.board, c) || !roadAt(s.board, c)) return 'A freeway must touch a road on the map edge';
  for (const camp of Object.values(s.board.campaigns)) {
    const p = camp.placement;
    if (p.kind === 'airplane' && p.side === side && offset >= p.offset && offset < p.offset + p.width) return 'A freeway may not overlap an airplane';
  }
  if (freeways(s).some((f) => f.side === side && f.offset === offset)) return 'There is already a freeway there';
  return null;
}

export function freewayPlacements(s: GameState): Extract<Placement, { kind: 'freeway' }>[] {
  const out: Extract<Placement, { kind: 'freeway' }>[] = [];
  for (const side of DIRECTIONS) {
    const len = side === 'N' || side === 'S' ? s.board.w : s.board.h;
    for (let offset = 0; offset < len; offset++) if (!freewayProblem(s, side, offset)) out.push({ kind: 'freeway', side, offset });
  }
  return out;
}

registerChoiceKind('freeway', (s) => freewayPlacements(s).length > 0);

/** Rural-area distance for a chain: nearest open restaurant to any freeway's road square. */
export function ruralDistance(s: GameState, player: PlayerId): { restaurantId: string; distance: number } | null {
  const ends = freeways(s).map((f) => freewayCell(s, f.side, f.offset)).filter((c) => roadAt(s.board, c));
  if (!ends.length) return null;
  let best: { restaurantId: string; distance: number } | null = null;
  const rs = Object.values(s.board.restaurants)
    .filter((r) => r.owner === player && r.status === 'open')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of rs) {
    const field = distanceField(s.board, restaurantStarts(s.board, r));
    const d = Math.min(...ends.map((c) => fieldAt(field, c)));
    if (Number.isFinite(d) && (best === null || d < best.distance)) best = { restaurantId: r.id, distance: d };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Giant billboards
// ---------------------------------------------------------------------------

function giantProblem(s: GameState, tileNumber: number, placement: CampaignPlacement): string | null {
  if (contentFor(s.config.modules).marketingTiles[tileNumber]?.kind !== 'giantBillboard') return `#${tileNumber} is not a giant billboard`;
  if (!s.marketingTiles.includes(tileNumber)) return `Giant billboard #${tileNumber} is not available`;
  if (placement?.kind !== 'rural' || !DIRECTIONS.includes(placement.side)) return 'Giant billboards go on a side of the rural area';
  for (const c of Object.values(s.board.campaigns)) {
    if (c.placement.kind === 'rural' && c.placement.side === placement.side) return 'That side of the rural area is taken';
  }
  return null;
}

function addRuralArea(ctx: HookContext): void {
  const s = ctx.state;
  if (ruralHouse(s)) return;
  const id = ctx.id('house');
  s.board.houses[id] = { id, kind: 'rural', order: 1000, label: 'Rural', cells: [], garden: null, demand: [] };
}

export const RURAL_MARKETEERS_MODULE: GameModule = {
  id: ID,
  name: 'Rural Marketeers',
  description: 'Giant billboards market to the rural area, reached through freeways.',
  content: {
    employees: [
      kcard('ketchup:rural_marketeer', 'Rural Marketeer', ID, 6, 'blue', 'marketing', { kind: 'marketing', campaigns: ['giantBillboard'], range: 'unlimited', maxDuration: 1, alwaysEternal: true }, 'Place a giant billboard next to the rural area tile (eternal).', 'employees.md §2; ketchup.md §12', {
        salary: true,
      }),
    ],
    careerAdditions: { marketing_trainee: ['ketchup:rural_marketeer'] },
    marketingTiles: GIANT_BILLBOARDS.map((number) => ({ number, kind: 'giantBillboard' as const, module: ID, w: 0, h: 0 })),
    milestones: [FIRST_RURAL],
    entities: [{ kind: 'freeway', name: 'Freeway', module: ID, w: 1, h: 1, limit: { scope: 'total', count: FREEWAYS }, rulesRef: 'ketchup.md §12' }],
  },
  actions: {
    'ketchup:ruralMarketeers.placeFreeway': {
      validate(state, action) {
        const a = action as RuralPlaceFreeway;
        const head = headChoice(state, a.playerId, a.choiceId, 'freeway');
        if (isRejected(head)) return head;
        const problem = freewayProblem(state, a.side, a.offset);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as RuralPlaceFreeway;
        const s = ctx.state;
        const id = ctx.id('entity');
        const entity = { kind: 'freeway' as const, id, owner: a.playerId, side: a.side, offset: a.offset, tile: tileOf(s.board, freewayCell(s, a.side, a.offset)) };
        s.board.entities[id] = entity;
        ctx.emit({ type: 'entityPlaced', player: a.playerId, entity: { ...entity } });
        resolveHead(ctx, a.choiceId);
        return { undoable: true };
      },
    },
  },
  hooks: {
    onCreateGame: addRuralArea,
    campaignPlacementProblem(problem, ctx, { def, kind, tileNumber, placement }) {
      const s = ctx.state;
      if (kind === 'giantBillboard') {
        if (def.ability.kind !== 'marketing' || !def.ability.campaigns.includes('giantBillboard')) return `${def.name} cannot place a giant billboard`;
        return giantProblem(s, tileNumber, placement);
      }
      if (kind === 'airplane' && !problem && placement?.kind === 'airplane') {
        for (const f of freeways(s)) {
          if (f.side === placement.side && f.offset >= placement.offset && f.offset < placement.offset + placement.width) return 'An airplane may not cover a freeway';
        }
      }
      return problem;
    },
    campaignReach(houses, ctx, { campaign }) {
      if (campaign.kind !== 'giantBillboard') return houses;
      const r = ruralHouse(ctx.state);
      return r ? [r.id] : [];
    },
    demandAmount: (amount, _ctx, { house }) => (house.kind === 'rural' ? amount * 2 : amount),
    houseDistance: (best, ctx, { player, house }) => (house.kind === 'rural' ? ruralDistance(ctx.state, player) : best),
    onEvent(ctx, event) {
      if (event.type !== 'campaignPlaced' || event.campaign.kind !== 'giantBillboard') return;
      if (awardMilestone(ctx, event.player, 'ketchup:first_rural_marketeer_used')) pushChoice(ctx, { kind: 'freeway', player: event.player, optional: true });
    },
    legalActions(list, ctx, { player }) {
      const head = ctx.state.pending[0];
      if (head?.kind !== 'freeway' || head.player !== player) return list;
      return [...list, { kind: 'placement', label: 'Place a freeway', actionType: 'ketchup:ruralMarketeers.placeFreeway', spec: { kind: 'freeway', choiceId: head.id } }];
    },
    legalPlacements(list, ctx, { player, spec }) {
      const s = ctx.state;
      if (spec.kind === 'freeway') {
        const head = s.pending[0];
        return head?.kind === 'freeway' && head.player === player ? [...list, ...freewayPlacements(s)] : list;
      }
      if (spec.kind !== 'campaign' || !spec.cardUid || s.phase.kind !== 'working') return list;
      if (spec.campaignKind && spec.campaignKind !== 'giantBillboard') return list;
      if (!cardCheck(s, player, spec.cardUid, ['marketing'], 'marketing').ok) return list;
      const p = s.players[player];
      const def = p ? defOf(contentFor(s.config.modules), p, spec.cardUid) : undefined;
      if (def?.ability.kind !== 'marketing' || !def.ability.campaigns.includes('giantBillboard')) return list;
      const n = s.marketingTiles.find((t) => GIANT_BILLBOARDS.includes(t) && (spec.tileNumber === undefined || spec.tileNumber === t));
      if (n === undefined) return list;
      const extra: Placement[] = [];
      for (const side of DIRECTIONS) {
        const placement: CampaignPlacement = { kind: 'rural', side };
        if (!giantProblem(s, n, placement)) extra.push({ kind: 'campaign', campaignKind: 'giantBillboard', tileNumber: n, placement });
      }
      return [...list, ...extra];
    },
  },
};
