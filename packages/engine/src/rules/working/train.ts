/**
 * 3b Train employees (base.md §6.3; DLX p15–17).
 *
 * - Each training action moves one card one step along its career path. Trainer 1 action,
 *   coach 2, guru 3; a coach/guru may put up to 2/3 steps on the same card or split them.
 * - Only cards on the beach (including cards hired this turn) can be trained.
 * - Without "First to pay $20 or more in salaries" (stackTraining) a card trained this turn
 *   cannot be trained again by another card; with it any actions stack (DLX p15–16, p34), and
 *   several trainers may train one card in a single action (`trainers`), so the stacked chain
 *   skips empty intermediate piles like one multi-step training (questions.md Q-W10; rules v4).
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
import { legacyRules, rulesBefore } from '../../core/rulesVersion.js';
import { advanceTo, cardCheck, copiesOf, emptyPileHiresFeasible, phantomTrainable, spend, stackedTraining } from './stages.js';

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

/** Module exception (Ketchup First lemonade sold): a card at work may be trained. */
function trainableAtWork(s: GameState, a: WorkTrain): boolean {
  const p = s.players[a.playerId];
  if (!s.config.modules.length || !p || cardPlace(p, a.targetUid) !== 'work' || typeof a.toEmployeeId !== 'string') return false;
  return pipe(readCtx(s), 'trainAtWork', false, { player: a.playerId, uid: a.targetUid, toEmployeeId: a.toEmployeeId });
}

/** The trainers of an action and the steps each puts on the card (one trainer unless `trainers`). */
function sharesOf(a: WorkTrain, steps: number): { uid: Uid; steps: number }[] {
  return a.trainers ? a.trainers.map((t) => ({ uid: t.uid, steps: t.steps })) : [{ uid: a.trainerUid, steps }];
}

/** Shape of a multi-trainer action (`trainers`): the lead is `trainerUid`, distinct cards, whole steps. */
function trainersProblem(a: WorkTrain): string | null {
  const t = a.trainers;
  if (t === undefined) return null;
  if (!Array.isArray(t) || t.length < 1 || t.length > 12) return 'Bad trainers';
  if (!t.every((x) => x && typeof x.uid === 'string' && Number.isInteger(x.steps) && x.steps >= 1)) return 'Bad trainers';
  if (t[0]?.uid !== a.trainerUid) return 'The first trainer must be the acting trainer';
  if (new Set(t.map((x) => x.uid)).size !== t.length) return 'A trainer is listed twice';
  return null;
}

/**
 * Stacked training (Q-W10): split `steps` on `targetUid` between `lead` (as many as it can) and the
 * player's other trainers at work, in turn order of their cards. Null when they cannot cover it.
 */
export function stackedShares(s: GameState, player: string, lead: Uid, targetUid: Uid, steps: number): { uid: Uid; steps: number }[] | null {
  const p = s.players[player];
  const turn = s.turn;
  if (!p || !turn || !stackedTraining(s, player)) return null;
  const content = contentFor(s.config.modules);
  const order = [lead, ...Object.keys(turn.uses).filter((u) => u !== lead && u !== targetUid)];
  const out: { uid: Uid; steps: number }[] = [];
  let need = steps;
  for (const uid of order) {
    if (need <= 0) break;
    const ability = content.employees[p.employees[uid]?.employeeId as EmployeeId]?.ability;
    if (ability?.kind !== 'train' || cardPlace(p, uid) !== 'work') continue;
    const room = Math.min(turn.uses[uid] ?? 0, ability.maxStepsSameCard * copiesOf(s, player, uid) - stepsBy(s, targetUid, uid));
    if (room <= 0) {
      if (uid === lead) return null;
      continue;
    }
    const n = Math.min(room, need);
    out.push({ uid, steps: n });
    need -= n;
  }
  return need > 0 || out.length < 2 ? null : out;
}

export function validateTrain(s: GameState, a: WorkTrain): Check {
  const shape = trainersProblem(a);
  if (shape) return reject('INVALID_PAYLOAD', shape);
  // LEGACY(v3): one trainer per action.
  if (a.trainers && rulesBefore(s, 4)) return reject('INVALID_PAYLOAD', 'One trainer per training action in this game');
  const c = cardCheck(s, a.playerId, a.trainerUid, ['train'], 'train');
  if (!c.ok) return c;
  const { def, turn } = c;
  if (def.ability.kind !== 'train') return reject('CARD_UNAVAILABLE', 'Not a trainer');
  const p = s.players[a.playerId] as PlayerState;
  const content = contentFor(s.config.modules);
  const target = p.employees[a.targetUid];
  if (!target) return reject('NOT_OWNED', 'Not your card');
  if (a.targetUid === p.structure.ceo) return reject('ILLEGAL', 'The CEO cannot be trained');
  if (a.trainers?.some((t) => t.uid === a.targetUid)) return reject('ILLEGAL', 'A trainer cannot train itself');
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
  const shares = sharesOf(a, steps);
  if (shares.reduce((n, x) => n + x.steps, 0) !== steps) return reject('INVALID_PAYLOAD', `The trainers' steps must add up to ${steps}`);
  const stacking = hasEffect(s, content, a.playerId, 'stackTraining').length > 0;
  if (shares.length > 1 && !(stacking && stackedTraining(s, a.playerId))) {
    return reject('ILLEGAL', 'Several trainers on one card need "First to pay $20 or more in salaries"');
  }
  for (const share of shares) {
    const sc = share.uid === a.trainerUid ? c : cardCheck(s, a.playerId, share.uid, ['train'], 'train');
    if (!sc.ok) return sc;
    const ability = sc.def.ability;
    if (ability.kind !== 'train') return reject('CARD_UNAVAILABLE', 'Not a trainer');
    const left = turn.uses[share.uid] ?? 0;
    if (share.steps > left) return reject('ILLEGAL', `${sc.def.name} has only ${left} training action(s) left`);
    // A card working as several copies (Ketchup Night Shift, KX p22) counts as that many trainers, so
    // with a stacking milestone each copy may train the same card.
    const cap = ability.maxStepsSameCard * (stacking ? copiesOf(s, a.playerId, share.uid) : 1);
    if (stepsBy(s, a.targetUid, share.uid) + share.steps > cap) {
      return reject('ILLEGAL', `${sc.def.name} may train the same card at most ${cap} step(s)`);
    }
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
    const uses = { ...turn.uses };
    for (const share of shares) uses[share.uid] = (uses[share.uid] ?? 0) - share.steps;
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
  const shares = sharesOf(a, steps);
  for (const share of shares) {
    for (let i = 0; i < share.steps; i++) rec.by.push(share.uid);
    spend(ctx, share.uid, share.steps);
  }
  rec.steps += steps;
  ctx.emit({ type: 'employeeTrained', player: a.playerId, uid: a.targetUid, from, to: a.toEmployeeId, by: shares.map((x) => x.uid), steps, path: [...path] });
}
