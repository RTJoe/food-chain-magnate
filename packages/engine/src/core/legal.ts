/**
 * legalActions / legalPlacements aggregation (architecture §3.1; risk 4: the engine supplies
 * legal placements so the UI never re-implements rules).
 *
 * Every `ready` action returned is re-validated with `validateAction`, so the list never offers
 * something the reducer would reject. `placement` entries name a `PlacementSpec` to pass to
 * `legalPlacements`; `compose` entries need a client-built payload (structure, firing, freezer).
 */
import type { Action } from '../types/actions.js';
import type { GameState, PlayerId } from '../types/state.js';
import type { LegalAction, Placement, PlacementSpec } from '../types/view.js';
import { pipe } from '../modules/registry.js';
import { readCtx } from './context.js';
import { validateAction } from './reducer.js';
import { legalInitialPlacements, reserveOptions } from '../rules/setup.js';
import { freePositions, currentChooser } from '../rules/orderOfBusiness.js';
import { stillFireable } from '../rules/payday.js';
import { freezerCapacity } from '../rules/cleanup.js';
import { annotateNoAction, workingLegalActions, workingPlacements } from '../rules/working/index.js';

export function legalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const s = state;
  const p = s.players[playerId];
  if (!p || s.phase.kind === 'gameOver') return [];
  const out: LegalAction[] = [];
  const ready = (label: string, action: Action) => out.push({ kind: 'ready', label, action });
  const head = s.pending[0];
  if (head) {
    if (head.player !== playerId) return [];
    if (head.optional) ready('Decline', { type: 'choice.decline', playerId, choiceId: head.id });
    if (head.kind === 'forcedFire') out.push({ kind: 'compose', label: `Fire employees to cover $${head.owed} in salaries`, actionType: 'payday.fire' });
    return filterReady(s, moduleLegal(s, playerId, out));
  }
  const ph = s.phase;
  switch (ph.kind) {
    case 'setup.restaurants':
      if (ph.order[ph.idx] !== playerId) break;
      out.push({ kind: 'placement', label: 'Place your first restaurant', actionType: 'setup.placeRestaurant', spec: { kind: 'restaurant' } });
      if (ph.round === 1) ready('Pass', { type: 'setup.pass', playerId });
      break;
    case 'setup.reserve':
      if (s.secrets[playerId]?.reserve) break;
      for (const card of reserveOptions(s)) {
        // KX p28: Reserve Prices cards vote on the base price.
        const label = card.kind === 'price' ? `Reserve card: base price $${card.basePrice} (+$${card.amount})` : `Reserve card +$${card.amount}`;
        ready(label, { type: 'setup.chooseReserve', playerId, card });
      }
      break;
    case 'restructuring':
      if (!s.awaiting.players.includes(playerId) && !s.secrets[playerId]?.structureDraft) break;
      if (s.secrets[playerId]?.structureDraft) ready('Change structure', { type: 'restructure.retract', playerId });
      else out.push({ kind: 'compose', label: 'Choose who goes to work', actionType: 'restructure.submit' });
      break;
    case 'orderOfBusiness':
      if (currentChooser(s) !== playerId) break;
      for (const pos of freePositions(s)) ready(`Take position ${pos + 1}`, { type: 'order.choosePosition', playerId, position: pos });
      break;
    case 'working':
      out.push(...workingLegalActions(s, playerId));
      break;
    case 'payday':
      if (s.awaiting.kind !== 'payday.fire' || !s.awaiting.players.includes(playerId)) break;
      if (stillFireable(s, playerId).length) out.push({ kind: 'compose', label: 'Fire employees', actionType: 'payday.fire' });
      ready('Done firing', { type: 'payday.confirm', playerId });
      break;
    case 'cleanup':
      if (s.awaiting.kind !== 'cleanup.freezer' || !s.awaiting.players.includes(playerId)) break;
      out.push({ kind: 'compose', label: `Keep up to ${freezerCapacity(s, playerId)} items in the freezer`, actionType: 'cleanup.freezer' });
      ready('Throw everything away', { type: 'cleanup.freezer', playerId, keep: {} });
      break;
    default:
      break;
  }
  return annotateNoAction(s, playerId, filterReady(s, moduleLegal(s, playerId, out)));
}

/** Module additions (pending module choices, module card actions; C6). */
function moduleLegal(s: GameState, player: PlayerId, list: LegalAction[]): LegalAction[] {
  return s.config.modules.length ? pipe(readCtx(s), 'legalActions', list, { player }) : list;
}

function filterReady(s: GameState, list: LegalAction[]): LegalAction[] {
  return list.filter((a) => a.kind !== 'ready' || validateAction(s, a.action).ok);
}

export function legalPlacements(state: GameState, playerId: PlayerId, spec: PlacementSpec): Placement[] {
  const s = state;
  let base: Placement[] = [];
  if (s.phase.kind === 'setup.restaurants') {
    if (spec.kind === 'restaurant' && s.phase.order[s.phase.idx] === playerId) base = legalInitialPlacements(s);
  } else if (s.phase.kind === 'working') {
    base = workingPlacements(s, playerId, spec);
  }
  return pipe(readCtx(s), 'legalPlacements', base, { player: playerId, spec });
}
