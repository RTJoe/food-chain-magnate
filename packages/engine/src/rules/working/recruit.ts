/**
 * 3a Hire employees (base.md §6.2; DLX p15–16).
 *
 * - CEO 1, recruiting girl 1, recruiting manager 2, HR director 4 hire actions. Optional.
 * - Only entry-level cards can be hired. Hired cards go to the beach (trainable this turn).
 * - 1x cards: at most one per player, beach and busy included (DLX p7, p17).
 * - Empty pile: the card may still be hired if it is trained to a higher level in this turn's
 *   training step (DLX p16). It is tracked in `turn.mustTrain`; the turn cannot leave the train
 *   step until it is trained. It is accepted only if every empty-pile hire of the turn can get its
 *   own training action and its own available final card (`emptyPileHiresFeasible`).
 * - `turn.hired` counts every hire this turn, CEO's included ("First to hire 3", milestones.md).
 */
import type { EmployeeId } from '../../types/content.js';
import type { WorkRecruit } from '../../types/actions.js';
import type { GameState, PlayerState } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { defOf, ownsUnique } from '../../core/cards.js';
import { contentFor } from '../../modules/registry.js';
import { advanceTo, cardCheck, emptyPileHiresFeasible, spend } from './stages.js';

/** Training uses still available this turn (trainer, coach, guru at work). */
function trainingUsesLeft(s: GameState, p: PlayerState): number {
  const turn = s.turn;
  if (!turn) return 0;
  const content = contentFor(s.config.modules);
  let n = 0;
  for (const [uid, left] of Object.entries(turn.uses)) if (defOf(content, p, uid)?.ability.kind === 'train') n += left;
  return n;
}

/** Why `employeeId` cannot be hired by `p` now (null = can). */
export function hireProblem(s: GameState, p: PlayerState, employeeId: EmployeeId): string | null {
  const content = contentFor(s.config.modules);
  const def = content.employees[employeeId];
  if (!def || s.supply[employeeId] === undefined || def.availability !== 'supply') return 'That card is not in this game';
  if (!def.entry) return `${def.name} is not an entry-level card`;
  if (ownsUnique(content, p, employeeId)) return `You already own a ${def.name} (1x card)`;
  if ((s.supply[employeeId] ?? 0) > 0) return null;
  // Empty pile (DLX p16): only if it can still be trained up this turn, into an available card,
  // alongside every other empty-pile hire of this turn (multi-step Coach/Guru training included).
  const turn = s.turn;
  if (!turn || trainingUsesLeft(s, p) <= 0) return `The ${def.name} pile is empty`;
  if (!emptyPileHiresFeasible(s, turn, [employeeId])) return `The ${def.name} pile is empty and it cannot be trained into an available card this turn`;
  return null;
}

export function validateRecruit(s: GameState, a: WorkRecruit): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['ceo', 'recruit'], 'recruit');
  if (!c.ok) return c;
  const p = s.players[a.playerId] as PlayerState;
  if (typeof a.employeeId !== 'string') return reject('INVALID_PAYLOAD', 'Missing employee');
  const problem = hireProblem(s, p, a.employeeId);
  if (problem) return reject(problem.includes('pile is empty') ? 'SUPPLY_EMPTY' : problem.includes('1x') ? 'UNIQUE_LIMIT' : 'ILLEGAL', problem);
  return OK;
}

export function applyRecruit(ctx: EngineCtx, a: WorkRecruit): void {
  const s = ctx.state;
  const p = s.players[a.playerId] as PlayerState;
  const turn = s.turn;
  if (!turn) return;
  advanceTo(ctx, 'recruit');
  const left = s.supply[a.employeeId] ?? 0;
  const uid = ctx.id('card');
  if (left > 0) s.supply[a.employeeId] = left - 1;
  else turn.mustTrain.push(uid);
  p.employees[uid] = { uid, employeeId: a.employeeId, acquiredRound: s.round };
  p.beach.push(uid);
  spend(ctx, a.cardUid);
  turn.hired.push(uid);
  ctx.emit({ type: 'employeeHired', player: a.playerId, uid, employeeId: a.employeeId, by: a.cardUid });
}
