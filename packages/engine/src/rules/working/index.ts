/**
 * Working 9–5 (base.md §6): action dispatch, skip / end turn, and legal-action enumeration.
 * Sub-step rules live in the sibling files; the turn skeleton in stages.ts.
 */
import type { Action, WorkEndTurn, WorkSkip } from '../../types/actions.js';
import type { CampaignKind, DrinkId, EmployeeId } from '../../types/content.js';
import type { Corner, GameState, PlayerId, PlayerState } from '../../types/state.js';
import type { LegalAction, Placement, PlacementSpec } from '../../types/view.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { cardPlace, defOf } from '../../core/cards.js';
import { contentFor } from '../../modules/registry.js';
import { DRINKS } from '../../content/foods.js';
import { CORNERS, DIRECTIONS, allEmpty, rect, restaurantCells } from '../../map/grid.js';
import {
  enumerateAirRoutes,
  enumerateRoadRoutes,
  playerRouteStarts,
  routeStartOrigin,
  routeStartRoads,
  tileRCOf,
} from '../../map/pathfinding.js';
import { abilityStage, advanceTo, canAct, cardCheck, phantomTrainable, stageCheck, stageIndex, stagesFor, turnCheck, unusedDiscountActions } from './stages.js';
import { applyRecruit, hireProblem, validateRecruit } from './recruit.js';
import { applyTrain, reachableTargets, validateTrain } from './train.js';
import { applyProduce, validateProduce } from './produce.js';
import { applyBuyDrinks, buyerStats, validateBuyDrinks } from './buyDrinks.js';
import { applyCampaign, campaignPlacementProblem, rangeField, validateCampaign } from './campaigns.js';
import { applyPlaceGarden, applyPlaceHouse, gardenPlacementProblem, housePlacementProblem, validatePlaceGarden, validatePlaceHouse } from './development.js';
import { applyMoveRestaurant, applyPlaceRestaurant, moveRestaurantProblem, newRestaurantProblem, validateMoveRestaurant, validatePlaceRestaurant } from './restaurants.js';

export type WorkAction = Extract<Action, { type: `work.${string}` }>;

export const isWorkAction = (a: Action): a is WorkAction => a.type.startsWith('work.');

// ---------------------------------------------------------------------------
// Skip / end turn
// ---------------------------------------------------------------------------

function validateSkip(s: GameState, a: WorkSkip): Check {
  const t = turnCheck(s, a.playerId);
  if (!t.ok) return t;
  const p = s.players[a.playerId] as PlayerState;
  if (!p.employees[a.cardUid]) return reject('NOT_OWNED', 'Not your card');
  if ((s.turn?.uses[a.cardUid] ?? 0) <= 0) return reject('CARD_UNAVAILABLE', 'That card has no action left');
  // Training actions are reserved for cards hired from an empty pile (DLX p16).
  const turn = s.turn;
  if (turn && defOf(contentFor(s.config.modules), p, a.cardUid)?.ability.kind === 'train' && turn.mustTrain.some((u) => phantomTrainable(s, turn, u))) {
    return reject('ILLEGAL', 'Train the card hired from an empty pile first');
  }
  return OK;
}

function applySkip(ctx: EngineCtx, a: WorkSkip): void {
  const s = ctx.state;
  const turn = s.turn;
  const p = s.players[a.playerId];
  if (!turn || !p) return;
  // Declined recruit actions on recruiting managers / HR directors are salary discounts (base.md §6.2).
  const ab = defOf(ctx.content, p, a.cardUid)?.ability;
  if (ab?.kind === 'recruit' && ab.salaryDiscountPerUnused > 0) p.unusedRecruitActions += turn.uses[a.cardUid] ?? 0;
  turn.uses[a.cardUid] = 0;
  ctx.emit({ type: 'cardSkipped', player: a.playerId, uid: a.cardUid });
}

function validateEndTurn(s: GameState, a: WorkEndTurn): Check {
  const t = turnCheck(s, a.playerId);
  if (!t.ok) return t;
  return s.turn ? stageCheck(s, s.turn, 'end') : OK;
}

function applyEndTurn(ctx: EngineCtx, a: WorkEndTurn): void {
  const s = ctx.state;
  const turn = s.turn;
  const p = s.players[a.playerId];
  if (!turn || !p || s.phase.kind !== 'working') return;
  advanceTo(ctx, 'end');
  p.unusedRecruitActions += unusedDiscountActions(s, turn);
  ctx.emit({ type: 'turnEnded', player: a.playerId });
  s.turn = null;
  s.phase.idx += 1;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function validateWork(s: GameState, a: WorkAction): Check {
  switch (a.type) {
    case 'work.recruit':
      return validateRecruit(s, a);
    case 'work.train':
      return validateTrain(s, a);
    case 'work.produce':
      return validateProduce(s, a);
    case 'work.buyDrinks':
      return validateBuyDrinks(s, a);
    case 'work.placeCampaign':
      return validateCampaign(s, a);
    case 'work.placeHouse':
      return validatePlaceHouse(s, a);
    case 'work.placeGarden':
      return validatePlaceGarden(s, a);
    case 'work.placeRestaurant':
      return validatePlaceRestaurant(s, a);
    case 'work.moveRestaurant':
      return validateMoveRestaurant(s, a);
    case 'work.skip':
      return validateSkip(s, a);
    case 'work.endTurn':
      return validateEndTurn(s, a);
  }
}

export function applyWork(ctx: EngineCtx, a: WorkAction): { undoable: boolean } {
  switch (a.type) {
    case 'work.recruit':
      applyRecruit(ctx, a);
      break;
    case 'work.train':
      applyTrain(ctx, a);
      break;
    case 'work.produce':
      applyProduce(ctx, a);
      break;
    case 'work.buyDrinks':
      applyBuyDrinks(ctx, a);
      break;
    case 'work.placeCampaign':
      applyCampaign(ctx, a);
      break;
    case 'work.placeHouse':
      applyPlaceHouse(ctx, a);
      break;
    case 'work.placeGarden':
      applyPlaceGarden(ctx, a);
      break;
    case 'work.placeRestaurant':
      applyPlaceRestaurant(ctx, a);
      break;
    case 'work.moveRestaurant':
      applyMoveRestaurant(ctx, a);
      break;
    case 'work.skip':
      applySkip(ctx, a);
      break;
    case 'work.endTurn':
      applyEndTurn(ctx, a);
      return { undoable: false };
  }
  return { undoable: true };
}

// ---------------------------------------------------------------------------
// Legal actions (UI guidance; every `ready` action is re-validated by core/legal.ts)
// ---------------------------------------------------------------------------

export function workingLegalActions(s: GameState, player: PlayerId): LegalAction[] {
  const t = turnCheck(s, player);
  if (!t.ok || !s.turn) return [];
  const turn = s.turn;
  const p = s.players[player] as PlayerState;
  const content = contentFor(s.config.modules);
  const stages = stagesFor(s, player);
  const cur = stageIndex(stages, turn.stage);
  const out: LegalAction[] = [];
  for (const [uid, left] of Object.entries(turn.uses)) {
    if (left <= 0 || !canAct(p, turn, uid)) continue;
    const def = defOf(content, p, uid);
    const st = abilityStage(def);
    if (!def || !st || stageIndex(stages, st) < cur) continue;
    const a = def.ability;
    switch (a.kind) {
      case 'ceo':
      case 'recruit': {
        for (const e of Object.values(content.employees)) {
          if (!e?.entry || hireProblem(s, p, e.id)) continue;
          out.push({ kind: 'ready', label: `${def.name}: hire ${e.name}`, action: { type: 'work.recruit', playerId: player, cardUid: uid, employeeId: e.id } });
        }
        break;
      }
      case 'train': {
        for (const target of p.beach) {
          const card = p.employees[target];
          if (!card) continue;
          for (const tt of reachableTargets(s, p, card.employeeId, Math.min(left, a.maxStepsSameCard))) {
            out.push({
              kind: 'ready',
              label: `${def.name}: train ${content.employees[card.employeeId]?.name ?? card.employeeId} → ${content.employees[tt.to]?.name ?? tt.to}`,
              action: { type: 'work.train', playerId: player, trainerUid: uid, targetUid: target, toEmployeeId: tt.to as EmployeeId },
            });
          }
        }
        break;
      }
      case 'produce':
        for (const food of a.foods) {
          out.push({ kind: 'ready', label: `${def.name}: make ${a.amount} ${food}`, action: { type: 'work.produce', playerId: player, cardUid: uid, food } });
        }
        break;
      case 'buyDrinks':
        if (a.mode === 'errand') {
          for (const drink of DRINKS) {
            out.push({ kind: 'ready', label: `${def.name}: get ${drink}`, action: { type: 'work.buyDrinks', playerId: player, cardUid: uid, route: { mode: 'errand', drink: drink as DrinkId } } });
          }
        } else {
          out.push({ kind: 'placement', label: `${def.name}: buy drinks`, actionType: 'work.buyDrinks', cardUid: uid, spec: { kind: 'buyerRoute', cardUid: uid } });
        }
        break;
      case 'marketing':
        for (const kind of a.campaigns) {
          if (!s.marketingTiles.some((n) => content.marketingTiles[n]?.kind === kind)) continue;
          out.push({ kind: 'placement', label: `${def.name}: place a ${kind}`, actionType: 'work.placeCampaign', cardUid: uid, spec: { kind: 'campaign', cardUid: uid, campaignKind: kind } });
        }
        break;
      case 'newBusiness':
        if (s.houseTiles.length) out.push({ kind: 'placement', label: `${def.name}: build a house`, actionType: 'work.placeHouse', cardUid: uid, spec: { kind: 'house', cardUid: uid } });
        if (s.gardenTiles > 0) out.push({ kind: 'placement', label: `${def.name}: add a garden`, actionType: 'work.placeGarden', cardUid: uid, spec: { kind: 'garden', cardUid: uid } });
        break;
      case 'restaurant':
        if (p.restaurantsRemaining > 0) out.push({ kind: 'placement', label: `${def.name}: place a restaurant`, actionType: 'work.placeRestaurant', cardUid: uid, spec: { kind: 'restaurant', cardUid: uid } });
        if (a.mode === 'regional') out.push({ kind: 'placement', label: `${def.name}: move a restaurant`, actionType: 'work.moveRestaurant', cardUid: uid, spec: { kind: 'moveRestaurant', cardUid: uid } });
        break;
      default:
        break;
    }
    out.push({ kind: 'ready', label: `Skip ${def.name}`, action: { type: 'work.skip', playerId: player, cardUid: uid } });
  }
  out.push({ kind: 'ready', label: 'End turn', action: { type: 'work.endTurn', playerId: player } });
  return out;
}

/** Board placements for a working-phase card (base kinds; modules extend via the pipeline). */
export function workingPlacements(s: GameState, player: PlayerId, spec: PlacementSpec): Placement[] {
  const uid = spec.cardUid;
  const p = s.players[player];
  if (!uid || !p || !s.turn) return [];
  const content = contentFor(s.config.modules);
  const def = defOf(content, p, uid);
  if (!def) return [];
  const st = abilityStage(def);
  if (!st || !cardCheck(s, player, uid, [def.ability.kind], st).ok) return [];
  const out: Placement[] = [];
  const a = def.ability;
  const W = s.board.w;
  const H = s.board.h;
  switch (spec.kind) {
    case 'buyerRoute': {
      if (a.kind !== 'buyDrinks' || a.mode === 'errand') return [];
      const { range, perSource } = buyerStats(s, player, def);
      const seen = new Set<string>();
      for (const from of playerRouteStarts(s.board, player)) {
        if (a.mode === 'road') {
          for (const r of enumerateRoadRoutes(s.board, routeStartRoads(s.board, from), range)) {
            const key = r.sources.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              kind: 'buyerRoute',
              route: { mode: 'road', from, path: r.path },
              collects: r.sources.map((sourceId) => ({ sourceId, count: perSource })),
              range,
              bordersUsed: r.borders,
            });
          }
        } else {
          const origin = routeStartOrigin(s.board, from);
          if (!origin) continue;
          for (const r of enumerateAirRoutes(s.board, [tileRCOf(origin)], range)) {
            const key = r.sources.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              kind: 'buyerRoute',
              route: { mode: 'air', from, tiles: r.tiles },
              collects: r.sources.map((sourceId) => ({ sourceId, count: perSource })),
              range,
              bordersUsed: r.tiles.length - 1,
            });
          }
        }
      }
      return out;
    }
    case 'campaign': {
      if (a.kind !== 'marketing') return [];
      const field = a.range === 'unlimited' ? undefined : rangeField(s, player);
      if (typeof field === 'string') return [];
      const kinds: CampaignKind[] = spec.campaignKind ? [spec.campaignKind] : a.campaigns;
      for (const kind of kinds) {
        const numbers = s.marketingTiles.filter((n) => content.marketingTiles[n]?.kind === kind && (spec.tileNumber === undefined || spec.tileNumber === n));
        for (const n of numbers) {
          const tile = content.marketingTiles[n];
          if (!tile) continue;
          if (kind === 'airplane') {
            const width = (tile.width ?? tile.w) as 1 | 3 | 5;
            for (const side of DIRECTIONS) {
              const len = side === 'N' || side === 'S' ? W : H;
              for (let offset = 0; offset + width <= len; offset++) {
                const placement = { kind: 'airplane' as const, side, offset, width };
                if (!campaignPlacementProblem(s, player, def, kind, n, placement, undefined, field)) out.push({ kind: 'campaign', campaignKind: kind, tileNumber: n, placement });
              }
            }
            continue;
          }
          // Module kinds with no on-board footprint (giant billboard, gourmet guide) come from module hooks.
          if (tile.w <= 0 || tile.h <= 0) continue;
          const sizes = tile.w === tile.h ? [[tile.w, tile.h]] : [[tile.w, tile.h], [tile.h, tile.w]];
          for (const [w, h] of sizes as [number, number][]) {
            for (let y = 0; y + h <= H; y++) {
              for (let x = 0; x + w <= W; x++) {
                if (!allEmpty(s.board, rect(x, y, w, h))) continue;
                const placement = { kind: 'board' as const, x, y, w, h };
                const orientation = w === h ? 'square' : w === tile.w ? 'landscape' : 'portrait';
                if (!campaignPlacementProblem(s, player, def, kind, n, placement, undefined, field)) out.push({ kind: 'campaign', campaignKind: kind, tileNumber: n, placement, orientation });
              }
            }
          }
        }
      }
      return out;
    }
    case 'house': {
      if (a.kind !== 'newBusiness') return [];
      const order = spec.houseOrder ?? s.houseTiles[0];
      if (order === undefined) return [];
      for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
          for (const gardenSide of DIRECTIONS) {
            if (!housePlacementProblem(s, order, x, y, gardenSide)) out.push({ kind: 'house', houseOrder: order, x, y, gardenSide });
          }
        }
      }
      return out;
    }
    case 'garden': {
      if (a.kind !== 'newBusiness') return [];
      for (const house of Object.values(s.board.houses)) {
        for (const side of DIRECTIONS) {
          if (gardenPlacementProblem(s, house.id, side)) continue;
          const xs = house.cells.map((c) => c.x);
          const ys = house.cells.map((c) => c.y);
          const x0 = Math.min(...xs);
          const y0 = Math.min(...ys);
          const cells = side === 'N' ? rect(x0, y0 - 1, 2, 1) : side === 'S' ? rect(x0, y0 + 2, 2, 1) : side === 'W' ? rect(x0 - 1, y0, 1, 2) : rect(x0 + 2, y0, 1, 2);
          out.push({ kind: 'garden', houseId: house.id, side, cells });
        }
      }
      return out;
    }
    case 'restaurant': {
      if (a.kind !== 'restaurant') return [];
      const field = a.mode === 'local' && a.range !== 'unlimited' ? rangeField(s, player) : undefined;
      if (typeof field === 'string') return [];
      for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
          if (!allEmpty(s.board, restaurantCells(x, y))) continue;
          for (const entrance of CORNERS as Corner[]) {
            if (!newRestaurantProblem(s, player, a.mode, a.range, x, y, entrance, undefined, field)) out.push({ kind: 'restaurant', x, y, entrance });
          }
        }
      }
      return out;
    }
    case 'moveRestaurant': {
      if (a.kind !== 'restaurant' || a.mode !== 'regional') return [];
      const rs = Object.values(s.board.restaurants).filter((r) => r.owner === player && r.status === 'open' && (!spec.restaurantId || r.id === spec.restaurantId));
      for (const r of rs) {
        for (let y = 0; y < H - 1; y++) {
          for (let x = 0; x < W - 1; x++) {
            for (const entrance of CORNERS as Corner[]) {
              if (!moveRestaurantProblem(s, player, r.id, x, y, entrance)) out.push({ kind: 'moveRestaurant', restaurantId: r.id, x, y, entrance });
            }
          }
        }
      }
      return out;
    }
    default:
      return [];
  }
}


// ---------------------------------------------------------------------------
// "Why can't this card act?" (UI guidance, ux-plan.md §2.2)
// ---------------------------------------------------------------------------

const KIND_NAMES: Partial<Record<CampaignKind, string>> = { giantBillboard: 'giant billboard', gourmetGuide: 'gourmet guide' };

/** One-line reason a card at work with uses left has nothing legal but skipping (cheap checks only). */
export function noActionReason(s: GameState, player: PlayerId, uid: string): string {
  const p = s.players[player];
  const content = contentFor(s.config.modules);
  const def = p ? defOf(content, p, uid) : undefined;
  if (!p || !def) return 'Nothing this card can do now';
  const a = def.ability;
  switch (a.kind) {
    case 'ceo':
    case 'recruit': {
      const problems = Object.values(content.employees)
        .filter((e) => e?.entry)
        .map((e) => (e ? hireProblem(s, p, e.id) : null));
      return problems.every(Boolean) ? 'No entry-level card can be hired (piles empty or 1x cards owned)' : 'Nothing can be hired now';
    }
    case 'train': {
      const turn = s.turn;
      const left = turn?.uses[uid] ?? 0;
      const targets = p.beach.filter((t) => t !== p.structure.ceo && p.employees[t]);
      if (!targets.length) return 'No card on the beach to train';
      const reasons: string[] = [];
      for (const target of targets) {
        const card = p.employees[target];
        if (!card) continue;
        const options = reachableTargets(s, p, card.employeeId, Math.min(left, a.maxStepsSameCard));
        if (!options.length) {
          reasons.push(`${content.employees[card.employeeId]?.name ?? card.employeeId} cannot be trained further`);
          continue;
        }
        for (const o of options) {
          const v = validateTrain(s, { type: 'work.train', playerId: player, trainerUid: uid, targetUid: target, toEmployeeId: o.to as EmployeeId });
          if (!v.ok) reasons.push(v.message);
        }
      }
      const unique = [...new Set(reasons)];
      return unique.length ? unique.slice(0, 2).join('; ') : 'No card on the beach can be trained';
    }
    case 'marketing': {
      const missing = a.campaigns.filter((k) => !s.marketingTiles.some((n) => content.marketingTiles[n]?.kind === k));
      if (missing.length === a.campaigns.length) return `No ${missing.map((k) => KIND_NAMES[k] ?? k).join(' / ')} campaign tiles left`;
      return 'No legal campaign placement';
    }
    case 'newBusiness':
      return 'No house or garden tiles left';
    case 'restaurant':
      return p.restaurantsRemaining <= 0 ? 'All your restaurants are on the map' : 'No legal restaurant placement';
    default:
      return 'Nothing this card can do now';
  }
}

/**
 * Annotate each card's `work.skip` entry with `disabledReason` when skipping is the only thing it
 * can do (run after `ready` entries are re-validated).
 */
export function annotateNoAction(s: GameState, player: PlayerId, list: LegalAction[]): LegalAction[] {
  if (s.phase.kind !== 'working' || s.pending.length) return list;
  const cardOf = (l: LegalAction): string | undefined => {
    if (l.kind === 'ready') {
      const act = l.action as { cardUid?: string; trainerUid?: string };
      return act.cardUid ?? act.trainerUid;
    }
    return l.cardUid ?? (l.kind === 'placement' ? l.spec.cardUid : undefined);
  };
  const acting = new Set(list.filter((l) => !(l.kind === 'ready' && (l.action.type === 'work.skip' || l.action.type === 'work.endTurn'))).map(cardOf));
  return list.map((l) => {
    if (l.kind !== 'ready' || l.action.type !== 'work.skip' || acting.has(l.action.cardUid)) return l;
    return { ...l, disabledReason: noActionReason(s, player, l.action.cardUid) };
  });
}
