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
 * - Dinnertime distance (Q-K7): freeways connect the rural area to the road squares they touch; the
 *   distance is the borders crossed from a restaurant to the nearest one (the touched tile is 0).
 *   With no freeway nobody reaches it. Fry chefs, noodles and kimchi apply; sushi does not.
 * - "First Rural Marketeer Used": the first player(s) to place a giant billboard may place one
 *   freeway at once (optional choice). The freeway is a 3x1 piece (Q-K21) beside an outer board
 *   edge: end-on (touching 1 edge square) or, from rules v4, lengthwise along the edge (3 squares,
 *   not sticking out past it). At least one touched square is a road; never on an airplane's
 *   position (airplanes may not cover a freeway either). 3 freeways.
 */
import type { RuralPlaceFreeway } from '../../types/actions.js';
import type { Direction, MilestoneDef } from '../../types/content.js';
import type { GameModule, HookContext } from '../../types/module.js';
import type { CampaignPlacement, Cell, GameState, House, PlayerId } from '../../types/state.js';
import type { Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { DIRECTIONS, cellIndex, onMap, sameCell, tileOf } from '../../map/grid.js';
import { distanceField, fieldAt, restaurantRouteStarts, restaurantStarts, roadAt, shortestRoute } from '../../map/pathfinding.js';
import type { SaleRoute } from '../../types/events.js';
import { contentFor } from '../registry.js';
import { defOf } from '../../core/cards.js';
import { awardMilestone } from '../../rules/milestones.js';
import { rulesBefore } from '../../core/rulesVersion.js';
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
 * The first map square in from board edge `side` on line `i` (column for N/S, row for E/W), and
 * how deep it lies (on a board grown by First Lobbyist Used the outer tile edge may lie inside the
 * bounding box). Null when the line has no map square.
 */
function edgeSquare(s: GameState, side: Direction, i: number): { cell: Cell; depth: number } | null {
  const { w, h } = s.board;
  const len = side === 'N' || side === 'S' ? h : w;
  const at = (d: number): Cell => {
    switch (side) {
      case 'N':
        return { x: i, y: d };
      case 'S':
        return { x: i, y: h - 1 - d };
      case 'W':
        return { x: d, y: i };
      case 'E':
        return { x: w - 1 - d, y: i };
    }
  };
  for (let d = 0; d < len; d++) if (onMap(s.board, at(d))) return { cell: at(d), depth: d };
  return null;
}

/** The square a freeway line at (side, offset) touches: the first map square in from that board edge. */
export function freewayCell(s: GameState, side: Direction, offset: number): Cell {
  return edgeSquare(s, side, offset)?.cell ?? (side === 'N' ? { x: offset, y: 0 } : side === 'S' ? { x: offset, y: s.board.h - 1 } : side === 'W' ? { x: 0, y: offset } : { x: s.board.w - 1, y: offset });
}

type FreewayAt = { side: Direction; offset: number; lengthwise?: boolean | undefined };

/**
 * Lines of its edge a freeway covers (Q-K21: the piece is 3x1). End-on it touches one square;
 * lengthwise (rules v4) it lies along the edge over offset … offset + 2.
 */
export function freewaySpan(f: Pick<FreewayAt, 'offset' | 'lengthwise'>): number[] {
  return f.lengthwise ? [f.offset, f.offset + 1, f.offset + 2] : [f.offset];
}

/** The map squares a freeway touches, one per line it covers. */
export function freewayCells(s: GameState, f: FreewayAt): Cell[] {
  return freewaySpan(f).map((i) => freewayCell(s, f.side, i));
}

/** The road squares a freeway connects to the rural area (Q-K7, KX p26: distance "starting from any Freeway"). */
export function freewayRoads(s: GameState, f: FreewayAt): Cell[] {
  return freewayCells(s, f).filter((c) => onMap(s.board, c) && roadAt(s.board, c));
}

const freeways = (s: GameState) => Object.values(s.board.entities).filter((e): e is Extract<typeof e, { kind: 'freeway' }> => e.kind === 'freeway');

/**
 * Why a freeway cannot go at (side, offset) (null = legal). KX p25: beside the outer edge of a map
 * tile, orthogonally adjacent to a road "by 1 or more squares", never over an airplane's position.
 * Q-K21 (designer rulings): the 3x1 piece goes end-on or lengthwise, any of its squares may touch
 * the road, and it may not stick out past the map's edge.
 */
export function freewayProblem(s: GameState, side: Direction, offset: number, lengthwise: boolean | undefined = false): string | null {
  if (!DIRECTIONS.includes(side) || !Number.isInteger(offset) || (lengthwise !== undefined && typeof lengthwise !== 'boolean')) return 'Bad freeway position';
  // LEGACY(v3): games before rules version 4 only place the freeway end-on (one edge square).
  if (lengthwise && rulesBefore(s, 4)) return 'Freeways go end-on in this game';
  if (freeways(s).length >= FREEWAYS) return 'No freeways left';
  const len = side === 'N' || side === 'S' ? s.board.w : s.board.h;
  const span = freewaySpan({ offset, lengthwise });
  if (offset < 0 || span[span.length - 1]! >= len) return 'Freeways go beside the map';
  const squares = span.map((i) => edgeSquare(s, side, i));
  if (!lengthwise && !squares[0]) return 'A freeway must touch a road on the map edge';
  // Lengthwise it lies flat against one straight stretch of the outer edge.
  if (squares.some((q) => !q) || new Set(squares.map((q) => q!.depth)).size > 1) return 'A freeway may not stick out past the map edge';
  if (!squares.some((q) => roadAt(s.board, q!.cell))) return 'A freeway must touch a road on the map edge';
  const covers = (from: number, width: number) => span.some((i) => i >= from && i < from + width);
  for (const camp of Object.values(s.board.campaigns)) {
    const p = camp.placement;
    if (p.kind === 'airplane' && p.side === side && covers(p.offset, p.width)) return 'A freeway may not overlap an airplane';
  }
  if (freeways(s).some((f) => f.side === side && freewaySpan(f).some((i) => span.includes(i)))) return 'There is already a freeway there';
  return null;
}

export function freewayPlacements(s: GameState): Extract<Placement, { kind: 'freeway' }>[] {
  const out: Extract<Placement, { kind: 'freeway' }>[] = [];
  const both = !rulesBefore(s, 4);
  for (const side of DIRECTIONS) {
    const len = side === 'N' || side === 'S' ? s.board.w : s.board.h;
    for (let offset = 0; offset < len; offset++) {
      if (!freewayProblem(s, side, offset)) out.push({ kind: 'freeway', side, offset });
      if (both && !freewayProblem(s, side, offset, true)) out.push({ kind: 'freeway', side, offset, lengthwise: true });
    }
  }
  return out;
}

registerChoiceKind('freeway', (s) => freewayPlacements(s).length > 0);

/** Rural-area distance for a chain: nearest open restaurant to any freeway's road square. */
export function ruralDistance(s: GameState, player: PlayerId): { restaurantId: string; distance: number } | null {
  const ends = freeways(s).flatMap((f) => freewayRoads(s, f));
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

/**
 * The delivery route to the rural area (animation): shortest road route from the restaurant to a
 * freeway's road square; `exit` is that square and the board edge the van leaves by.
 */
export function ruralRoute(s: GameState, restaurantId: string): SaleRoute | null {
  const r = s.board.restaurants[restaurantId];
  if (!r) return null;
  const ends = freeways(s).flatMap((f) => freewayRoads(s, f).map((cell) => ({ side: f.side, cell })));
  if (!ends.length) return null;
  const found = shortestRoute(s.board, restaurantRouteStarts(s.board, r), new Map(ends.map((e) => [cellIndex(s.board, e.cell), 0])));
  const end = found?.path[found.path.length - 1];
  if (!found || !end) return null;
  const exit = ends.find((e) => sameCell(e.cell, end));
  return { from: found.from, path: found.path, ...(exit ? { exit: { cell: { x: end.x, y: end.y }, side: exit.side } } : {}) };
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
    entities: [{ kind: 'freeway', name: 'Freeway', module: ID, w: 3, h: 1, limit: { scope: 'total', count: FREEWAYS }, rulesRef: 'ketchup.md §12' }],
  },
  actions: {
    'ketchup:ruralMarketeers.placeFreeway': {
      validate(state, action) {
        const a = action as RuralPlaceFreeway;
        const head = headChoice(state, a.playerId, a.choiceId, 'freeway');
        if (isRejected(head)) return head;
        const problem = freewayProblem(state, a.side, a.offset, a.lengthwise);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as RuralPlaceFreeway;
        const s = ctx.state;
        const id = ctx.id('entity');
        const at = { side: a.side, offset: a.offset, ...(a.lengthwise ? { lengthwise: true as const } : {}) };
        const touched = freewayRoads(s, at)[0] ?? freewayCell(s, a.side, a.offset);
        const entity = { kind: 'freeway' as const, id, owner: a.playerId, ...at, tile: tileOf(s.board, touched) };
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
          if (f.side === placement.side && freewaySpan(f).some((i) => i >= placement.offset && i < placement.offset + placement.width)) return 'An airplane may not cover a freeway';
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
    saleRoute: (route, ctx, { house, restaurantId }) => (house.kind === 'rural' ? ruralRoute(ctx.state, restaurantId) : route),
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
