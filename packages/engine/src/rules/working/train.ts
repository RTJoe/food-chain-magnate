/**
 * 3b Train employees (base.md §6.3; DLX p15–17).
 *
 * - Each training action moves one card one step along its career path. Trainer 1 action,
 *   coach 2, guru 3; a coach/guru may put up to 2/3 steps on the same card or split them.
 * - Only cards on the beach (including cards hired this turn) can be trained.
 * - Without "First to pay $20 or more in salaries" (stackTraining) a card trained this turn
 *   cannot be trained again by another card; with it any actions stack (DLX p15–16, p34).
 * - The target card must be available; intermediate cards need not be (DLX p16). The old card
 *   returns to the supply (an empty-pile hire never took a physical card, so returns nothing).
 * - 1x cards: you may not train into a 1x card you already own (DLX p7, p17).
 * - With "First to have $100" a player may not train a CFO (DLX p34).
 * - While a card hired from an empty pile awaits training, training must go to it first.
 */
import type { EmployeeId } from '../../types/content.js';
import type { WorkTrain } from '../../types/actions.js';
import type { GameState, PlayerState, Uid } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { cardPlace, hasEffect, ownsUnique } from '../../core/cards.js';
import { contentFor, pipe } from '../../modules/registry.js';
import { readCtx } from '../../core/context.js';
import { legacyRules } from '../../core/rulesVersion.js';
import { advanceTo, baseUses, cardCheck, emptyPileHiresFeasible, phantomTrainable, spend } from './stages.js';

export { reachableTargets, type TrainTarget } from './stages.js';
import { reachableTargets } from './stages.js';

function pathProblem(s: GameState, from: EmployeeId, path: EmployeeId[], to: EmployeeId): string | null {
  const content = contentFor(s.config.modules);
  if (!path.length || path[path.length - 1] !== to) return 'Training path must end at the target card';
  let cur = from;
  for (const n of path) {
    if (!(content.employees[cur]?.trainsInto ?? []).includes(n)) return `${cur} cannot be trained into ${n}`;
    cur = n;
  }
  return null;
}

/** Steps already put on `target` this turn by `trainer`. */
const stepsBy = (s: GameState, target: Uid, trainer: Uid): number => (s.turn?.trained[target]?.by ?? []).filter((u) => u === trainer).length;

/** How many copies of a card are at work (module `cardUses`, e.g. Night Shift doubles salary-free cards). */
function copiesOf(s: GameState, player: string, uid: Uid): number {
  const p = s.players[player];
  const card = p?.employees[uid];
  const def = card ? contentFor(s.config.modules).employees[card.employeeId] : undefined;
  const base = baseUses(def);
  if (!card || !def || base <= 0 || !s.config.modules.length) return 1;
  const out = pipe(readCtx(s), 'cardUses', { uid, uses: base }, { player, card, def });
  return Math.max(1, Math.floor(out.uses / base));
}

/** Module exception (Ketchup First lemonade sold): a card at work may be trained. */
function trainableAtWork(s: GameState, a: WorkTrain): boolean {
  const p = s.players[a.playerId];
  if (!s.config.modules.length || !p || cardPlace(p, a.targetUid) !== 'work' || typeof a.toEmployeeId !== 'string') return false;
  return pipe(readCtx(s), 'trainAtWork', false, { player: a.playerId, uid: a.targetUid, toEmployeeId: a.toEmployeeId });
}

export function validateTrain(s: GameState, a: WorkTrain): Check {
  const c = cardCheck(s, a.playerId, a.trainerUid, ['train'], 'train');
  if (!c.ok) return c;
  const { def, turn } = c;
  if (def.ability.kind !== 'train') return reject('CARD_UNAVAILABLE', 'Not a trainer');
  const p = s.players[a.playerId] as PlayerState;
  const content = contentFor(s.config.modules);
  const target = p.employees[a.targetUid];
  if (!target) return reject('NOT_OWNED', 'Not your card');
  if (a.targetUid === p.structure.ceo) return reject('ILLEGAL', 'The CEO cannot be trained');
  if (cardPlace(p, a.targetUid) !== 'beach' && !trainableAtWork(s, a)) return reject('CARD_UNAVAILABLE', 'Only cards on the beach can be trained');
  if (!turn.mustTrain.includes(a.targetUid) && turn.mustTrain.some((u) => phantomTrainable(s, turn, u))) {
    return reject('ILLEGAL', 'First train the card hired from an empty pile');
  }
  if (typeof a.toEmployeeId !== 'string' || !content.employees[a.toEmployeeId]) return reject('INVALID_PAYLOAD', 'Unknown target card');
  let path: EmployeeId[];
  if (a.path) {
    if (!Array.isArray(a.path)) return reject('INVALID_PAYLOAD', 'Bad path');
    const problem = pathProblem(s, target.employeeId, a.path, a.toEmployeeId);
    if (problem) return reject('ILLEGAL', problem);
    path = a.path;
  } else {
    const t = reachableTargets(s, p, target.employeeId, 16).find((x) => x.to === a.toEmployeeId);
    if (!t) return reject('ILLEGAL', `${content.employees[target.employeeId]?.name ?? target.employeeId} cannot be trained into ${a.toEmployeeId}`);
    path = t.path;
  }
  const steps = path.length;
  const left = turn.uses[a.trainerUid] ?? 0;
  if (steps > left) return reject('ILLEGAL', `${def.name} has only ${left} training action(s) left`);
  const stacking = hasEffect(s, content, a.playerId, 'stackTraining').length > 0;
  // A card working as several copies (Ketchup Night Shift, KX p22) counts as that many trainers, so
  // with a stacking milestone each copy may train the same card.
  const cap = def.ability.maxStepsSameCard * (stacking ? copiesOf(s, a.playerId, a.trainerUid) : 1);
  if (stepsBy(s, a.targetUid, a.trainerUid) + steps > cap) {
    return reject('ILLEGAL', `${def.name} may train the same card at most ${cap} step(s)`);
  }
  const rec = turn.trained[a.targetUid];
  if (rec && !stacking && rec.by.some((u) => u !== a.trainerUid)) {
    return reject('ILLEGAL', 'This card was already trained this turn by another card ("First to pay $20" allows stacking)');
  }
  if (ownsUnique(content, p, a.toEmployeeId, a.targetUid)) return reject('UNIQUE_LIMIT', 'You already own that 1x card');
  if ((s.supply[a.toEmployeeId] ?? 0) <= 0) return reject('SUPPLY_EMPTY', `No ${content.employees[a.toEmployeeId]?.name ?? a.toEmployeeId} left`);
  if (content.employees[a.toEmployeeId]?.ability.kind === 'cfo' && hasEffect(s, content, a.playerId, 'ceoIsCfo').length) {
    return reject('ILLEGAL', 'With "First to have $100" you may not train a CFO');
  }
  // DLX p16: this training must not strand another card hired from an empty pile this turn.
  const others = turn.mustTrain.filter((u) => u !== a.targetUid);
  // LEGACY(v1): not checked.
  if (others.length && !legacyRules(s) && emptyPileHiresFeasible(s, turn)) {
    const uses = { ...turn.uses, [a.trainerUid]: left - steps };
    const supply = { ...s.supply, [a.toEmployeeId]: (s.supply[a.toEmployeeId] ?? 0) - 1 };
    if (!turn.mustTrain.includes(a.targetUid) && supply[target.employeeId] !== undefined) supply[target.employeeId] = (supply[target.employeeId] ?? 0) + 1;
    if (!emptyPileHiresFeasible(s, { ...turn, mustTrain: others }, [], uses, supply)) {
      return reject('ILLEGAL', 'That would leave another card hired from an empty pile with nothing to be trained into');
    }
  }
  return OK;
}

export function applyTrain(ctx: EngineCtx, a: WorkTrain): void {
  const s = ctx.state;
  const turn = s.turn;
  const p = s.players[a.playerId] as PlayerState;
  const card = p.employees[a.targetUid];
  if (!turn || !card) return;
  advanceTo(ctx, 'train');
  const from = card.employeeId;
  const path = a.path ?? reachableTargets(s, p, from, 16).find((x) => x.to === a.toEmployeeId)?.path ?? [a.toEmployeeId];
  const steps = path.length;
  const virtual = turn.mustTrain.includes(a.targetUid);
  if (!virtual && s.supply[from] !== undefined) s.supply[from] = (s.supply[from] ?? 0) + 1;
  s.supply[a.toEmployeeId] = (s.supply[a.toEmployeeId] ?? 0) - 1;
  card.employeeId = a.toEmployeeId;
  turn.mustTrain = turn.mustTrain.filter((u) => u !== a.targetUid);
  const rec = (turn.trained[a.targetUid] ??= { by: [], steps: 0 });
  for (let i = 0; i < steps; i++) rec.by.push(a.trainerUid);
  rec.steps += steps;
  spend(ctx, a.trainerUid, steps);
  ctx.emit({ type: 'employeeTrained', player: a.playerId, uid: a.targetUid, from, to: a.toEmployeeId, by: [a.trainerUid], steps, path: [...path] });
}
