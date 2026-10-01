/**
 * Validate + apply dispatcher (architecture §3.1, §3.3, §3.6).
 *
 * `applyAction` never mutates its input: it clones, applies the action to the clone through a
 * mutable `EngineCtx`, then runs `runUntilInput` so automatic phases resolve before returning.
 *
 * Undo (architecture §3.6): an action is undoable unless it revealed hidden information, ended a
 * decision window (end of turn, order choice, setup placement, payday confirm), or moved the game
 * to another phase / round / active player.
 */
import type { Action, ActionOf, Applied, ChoiceDecline, Ok, Rejected } from '../types/actions.js';
import type { GameState } from '../types/state.js';
import type { EngineCtx } from './context.js';
import { makeCtx, readCtx } from './context.js';
import { clone } from './clone.js';
import { OK, reject } from './errors.js';
import { runUntilInput } from './phase.js';
import { actionHandler, lifecycle, pipe } from '../modules/registry.js';
import { applyReserve, applySetupRestaurant, validateReserve, validateSetupRestaurant } from '../rules/setup.js';
import { applyRestructure, validateRestructure } from '../rules/restructuring.js';
import { applyOrder, validateOrder } from '../rules/orderOfBusiness.js';
import { applyWork, isWorkAction, validateWork } from '../rules/working/index.js';
import { applyPaydayAction, validatePaydayAction } from '../rules/payday.js';
import { applyCleanupAction, validateCleanupAction } from '../rules/cleanup.js';

function payloadProblem(state: GameState, action: Action): Rejected | null {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return reject('INVALID_PAYLOAD', 'Malformed action');
  if (typeof action.playerId !== 'string' || !state.players[action.playerId]) return reject('INVALID_PAYLOAD', 'Unknown player');
  if (state.phase.kind === 'gameOver') return reject('GAME_OVER', 'The game is over');
  return null;
}

function validateDecline(state: GameState, a: ChoiceDecline): Ok | Rejected {
  const head = state.pending[0];
  if (!head || head.id !== a.choiceId) return reject('ILLEGAL', 'No such pending choice');
  if (head.player !== a.playerId) return reject('NOT_YOUR_TURN', 'That choice belongs to another player');
  if (!head.optional) return reject('ILLEGAL', 'That choice cannot be declined');
  return OK;
}

function isModuleAction(a: Action): boolean {
  return a.type.includes(':');
}

export function validateAction(state: GameState, action: Action): Ok | Rejected {
  const bad = payloadProblem(state, action);
  if (bad) return bad;
  const head = state.pending[0];
  // A pending choice blocks everything except its resolution (payday forced firing is resolved by payday.fire).
  if (head && action.type !== 'choice.decline' && !isModuleAction(action) && !(head.kind === 'forcedFire' && action.type === 'payday.fire')) {
    return reject(head.player === action.playerId ? 'ILLEGAL' : 'NOT_YOUR_TURN', 'A pending choice must be resolved first');
  }
  if (isModuleAction(action)) {
    const h = actionHandler(state.config.modules, action.type);
    if (!h) return reject('MODULE_DISABLED', `${action.type} is not available in this game`);
    const ctx = readCtx(state);
    return h.validate(state, action, { content: ctx.content, isEnabled: ctx.isEnabled });
  }
  const base = validateBaseAction(state, action);
  if (!base.ok || state.config.modules.length === 0) return base;
  // Module rules for base actions (C6, architecture risk #2).
  try {
    const problem = pipe(readCtx(state), 'actionProblem', null, { action });
    return problem ? reject('ILLEGAL', problem) : base;
  } catch (e) {
    return reject('INVALID_PAYLOAD', e instanceof Error ? e.message : String(e));
  }
}

function validateBaseAction(state: GameState, action: Action): Ok | Rejected {
  try {
    switch (action.type) {
      case 'setup.placeRestaurant':
      case 'setup.pass':
        return validateSetupRestaurant(state, action);
      case 'setup.chooseReserve':
        return validateReserve(state, action);
      case 'restructure.submit':
      case 'restructure.retract':
        return validateRestructure(state, action);
      case 'order.choosePosition':
        return validateOrder(state, action);
      case 'payday.fire':
      case 'payday.confirm':
        return validatePaydayAction(state, action);
      case 'cleanup.freezer':
        return validateCleanupAction(state, action);
      case 'choice.decline':
        return validateDecline(state, action);
      default:
        if (isWorkAction(action)) return validateWork(state, action);
        return reject('UNKNOWN_ACTION', `Unknown action ${(action as Action).type}`);
    }
  } catch (e) {
    // Malformed payloads (missing fields) must reject, never throw.
    return reject('INVALID_PAYLOAD', e instanceof Error ? e.message : String(e));
  }
}

function dispatch(ctx: EngineCtx, action: Action): boolean {
  if (isModuleAction(action)) {
    const h = actionHandler(ctx.state.config.modules, action.type);
    return h ? h.apply(ctx, action).undoable : false;
  }
  switch (action.type) {
    case 'setup.placeRestaurant':
    case 'setup.pass':
      applySetupRestaurant(ctx, action);
      return false;
    case 'setup.chooseReserve':
      applyReserve(ctx, action);
      return true;
    case 'restructure.submit':
    case 'restructure.retract':
      applyRestructure(ctx, action);
      return true;
    case 'order.choosePosition':
      applyOrder(ctx, action);
      return false;
    case 'payday.fire':
      applyPaydayAction(ctx, action);
      return true;
    case 'payday.confirm':
      applyPaydayAction(ctx, action);
      return false;
    case 'cleanup.freezer':
      applyCleanupAction(ctx, action as ActionOf<'cleanup.freezer'>);
      return true;
    case 'choice.decline': {
      const head = ctx.state.pending.shift();
      if (head) ctx.emit({ type: 'choiceResolved', choiceId: head.id, declined: true });
      return true;
    }
    default:
      if (isWorkAction(action)) return applyWork(ctx, action).undoable;
      return false;
  }
}

/**
 * Plain-JSON contract (architecture §3.2): no shared references. The first bank break stores the
 * revealed reserve card object both in `players[p].reserveCard` and `secrets[p].reserve`; copy it.
 */
function dealias(s: GameState): void {
  for (const p of Object.values(s.players)) if (p.reserveCard) p.reserveCard = { ...p.reserveCard };
}

export function applyAction(state: GameState, action: Action): Applied | Rejected {
  const v = validateAction(state, action);
  if (!v.ok) return v;
  const next = clone(state);
  const ctx = makeCtx(next);
  const before = { phase: state.phase.kind, round: state.round, active: state.phase.kind === 'working' ? state.phase.player : null };
  if (next.config.modules.length) lifecycle(ctx, 'beforeAction', clone(action));
  let undoable = dispatch(ctx, clone(action));
  if (next.config.modules.length) lifecycle(ctx, 'onAction', clone(action));
  next.history.seq += 1;
  runUntilInput(ctx);
  dealias(next);
  const active = next.phase.kind === 'working' ? next.phase.player : null;
  if (next.phase.kind !== before.phase || next.round !== before.round || active !== before.active) undoable = false;
  if (ctx.events.some((e) => e.type === 'structuresRevealed' || e.type === 'bankBroke')) undoable = false;
  return { ok: true, state: next, events: ctx.events, undoable };
}
