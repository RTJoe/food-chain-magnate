/**
 * Working 9–5 turn skeleton (base.md §6, §6.0, §6.1, §6.3a; DLX p14–25).
 *
 * - Players act one at a time in turn order; a player completes all actions before the next.
 * - Sub-steps in strict order: recruit → train → driveIns → marketing → food → houses →
 *   (lobbyists, Ketchup) → restaurants. Taking an action of a later sub-step closes the earlier
 *   ones; going back is illegal. Within a sub-step, cards act in any order.
 * - Every card at work gets its uses at the start of the turn (CEO 1 hire, recruiting manager 2,
 *   HR director 4, trainer 1 / coach 2 / guru 3, everything else 1; module `cardUses` pipeline).
 * - 3c Open drive-ins is mandatory and automatic: when the turn passes it and a local or regional
 *   manager is at work, every OPEN restaurant of the player gets a drive-in sign.
 * - Unused recruit actions on recruiting managers / HR directors become $5 Payday discounts
 *   (base.md §6.2); unused CEO / recruiting girl actions give nothing.
 */
import type { EmployeeDef, EmployeeId } from '../../types/content.js';
import type { CardUses } from '../../types/module.js';
import type { GameState, PlayerId, PlayerState, TurnState, Uid, WorkStage } from '../../types/state.js';
import { BASE_WORK_STAGE_ORDER } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { readCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { cardPlace, cardsAtWork, defOf, hasEffect, ownsUnique } from '../../core/cards.js';
import { contentFor, pipe } from '../../modules/registry.js';
import { rulesBefore } from '../../core/rulesVersion.js';

/** Sub-steps for this player (base order; Ketchup lobbyists only when that module is on). */
export function stagesFor(s: GameState, player: PlayerId, ctx: EngineCtx = readCtx(s)): WorkStage[] {
  const base = BASE_WORK_STAGE_ORDER.filter((st) => st !== 'lobbyists' || s.config.modules.includes('ketchup:lobbyists'));
  return pipe(ctx, 'workingStages', [...base], { player });
}

export function stageIndex(stages: WorkStage[], st: WorkStage): number {
  const i = stages.indexOf(st);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

/** Printed uses of a card at work (before module pipelines). */
export function baseUses(def: EmployeeDef | undefined): number {
  const a = def?.ability;
  if (!a) return 0;
  switch (a.kind) {
    case 'ceo':
      return a.recruits;
    case 'recruit':
    case 'train':
      return a.actions;
    case 'produce':
      return a.timing === 'working' ? 1 : 0;
    case 'buyDrinks':
    case 'marketing':
    case 'newBusiness':
    case 'restaurant':
    case 'lobbyist':
      return 1;
    default:
      return 0;
  }
}

/** The stage in which a card's action is taken (null for passive cards). */
export function abilityStage(def: EmployeeDef | undefined): WorkStage | null {
  switch (def?.ability.kind) {
    case 'ceo':
    case 'recruit':
      return 'recruit';
    case 'train':
      return 'train';
    case 'marketing':
      return 'marketing';
    case 'produce':
    case 'buyDrinks':
      return 'food';
    case 'newBusiness':
      return 'houses';
    case 'lobbyist':
      return 'lobbyists';
    case 'restaurant':
      return 'restaurants';
    default:
      return null;
  }
}

/** Start a player's working turn: compute uses, stage = first sub-step. */
export function beginTurn(ctx: EngineCtx, player: PlayerId): void {
  const s = ctx.state;
  const p = s.players[player];
  if (!p) return;
  const uses: Record<Uid, number> = {};
  for (const uid of cardsAtWork(p)) {
    const card = p.employees[uid];
    const def = defOf(ctx.content, p, uid);
    if (!card || !def) continue;
    const out = pipe(ctx, 'cardUses', { uid, uses: baseUses(def) } satisfies CardUses, { player, card, def }) as CardUses;
    if (out.uses > 0) uses[uid] = out.uses;
  }
  const stages = stagesFor(s, player, ctx);
  const turn: TurnState = {
    player,
    stage: stages[0] ?? 'recruit',
    uses,
    hired: [],
    mustTrain: [],
    trained: {},
    campaignsPlaced: [],
    used: [],
  };
  s.turn = turn;
  p.unusedRecruitActions = 0;
  delete p.unusedRecruitByCard;
  ctx.emit({ type: 'turnStarted', player });
  ctx.emit({ type: 'workStageChanged', player, stage: turn.stage });
  // 3c drive-ins: hiring and training never look at restaurants, and no restaurant can be
  // placed before 3g, so opening the signs at turn start is equivalent to opening them at 3c
  // and keeps validation of later steps independent of the current step.
  openDriveIns(ctx, player);
}

/** base.md §6.3a: drive-in signs on every OPEN restaurant when a local/regional manager is at work. */
export function openDriveIns(ctx: EngineCtx, player: PlayerId): void {
  const s = ctx.state;
  const p = s.players[player];
  if (!p) return;
  const has = cardsAtWork(p).some((uid) => defOf(ctx.content, p, uid)?.ability.kind === 'restaurant');
  if (!has) return;
  const ids: string[] = [];
  for (const r of Object.values(s.board.restaurants)) {
    if (r.owner !== player || r.status !== 'open' || r.driveIn) continue;
    r.driveIn = true;
    ids.push(r.id);
  }
  if (ids.length) ctx.emit({ type: 'driveInsOpened', player, restaurantIds: ids.sort() });
}

/** Move the turn forward to `target`, running automatic sub-steps passed on the way. */
export function advanceTo(ctx: EngineCtx, target: WorkStage | 'end'): void {
  const s = ctx.state;
  const turn = s.turn;
  if (!turn) return;
  const stages = stagesFor(s, turn.player, ctx);
  const from = stageIndex(stages, turn.stage);
  const to = target === 'end' ? stages.length - 1 : stageIndex(stages, target);
  if (to <= from) return;
  for (let i = from + 1; i <= to; i++) {
    const st = stages[i] as WorkStage;
    if (i > stageIndex(stages, 'train')) dropUntrainedHires(ctx);
    if (st === 'driveIns') openDriveIns(ctx, turn.player);
  }
  turn.stage = stages[to] as WorkStage;
  ctx.emit({ type: 'workStageChanged', player: turn.player, stage: turn.stage });
}

/** Record a card's use (one action). */
export function spend(ctx: EngineCtx, uid: Uid, n = 1): void {
  const turn = ctx.state.turn;
  if (!turn) return;
  turn.uses[uid] = Math.max(0, (turn.uses[uid] ?? 0) - n);
  if (!turn.used.includes(uid)) turn.used.push(uid);
}

/** Remaining uses of recruiting-manager / HR-director cards (base.md §6.2 discount). */
export function unusedDiscountActions(s: GameState, turn: TurnState): Record<Uid, number> {
  const p = s.players[turn.player];
  const out: Record<Uid, number> = {};
  if (!p) return out;
  const content = contentFor(s.config.modules);
  for (const [uid, left] of Object.entries(turn.uses)) {
    const a = defOf(content, p, uid)?.ability;
    if (a?.kind === 'recruit' && a.salaryDiscountPerUnused > 0 && left > 0) out[uid] = left;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

export type CardOk = { ok: true; def: EmployeeDef; turn: TurnState };

/** It is `player`'s working turn and nothing else must be resolved first. */
export function turnCheck(s: GameState, player: PlayerId): Check & { turn?: TurnState } {
  if (s.phase.kind !== 'working') return reject('WRONG_PHASE', 'Not in the Working 9–5 phase');
  if (s.phase.player !== player || s.turn?.player !== player) return reject('NOT_YOUR_TURN', 'It is not your turn');
  if (s.pending.length) return reject('ILLEGAL', 'Resolve the pending choice first');
  return { ok: true, turn: s.turn };
}

/**
 * The card is yours, at work, has a use left, has one of `kinds`, and the turn can still reach
 * `stage` (base.md §6.1 strict order; base.md §6.2 empty-pile hires must be trained first).
 */
/** Player-facing names of the Working 9–5 sub-steps, used in rejection messages. */
const STAGE_NAMES: Record<WorkStage | 'end', string> = {
  end: 'End of turn',
  recruit: 'Hire',
  train: 'Train',
  driveIns: 'Drive-ins',
  marketing: 'Campaigns',
  food: 'Food & drinks',
  houses: 'Houses & gardens',
  lobbyists: 'Roads & parks',
  restaurants: 'Restaurants',
};

export function cardCheck(s: GameState, player: PlayerId, uid: Uid, kinds: EmployeeDef['ability']['kind'][], stage: WorkStage): CardOk | ReturnType<typeof reject> {
  const t = turnCheck(s, player);
  if (!t.ok) return t;
  const turn = t.turn as TurnState;
  const p = s.players[player];
  const card = p?.employees[uid];
  if (!p || !card) return reject('NOT_OWNED', 'Not your card');
  const content = contentFor(s.config.modules);
  const def = content.employees[card.employeeId];
  if (!def || !kinds.includes(def.ability.kind)) return reject('CARD_UNAVAILABLE', `${def?.name ?? card.employeeId} cannot do that`);
  if (!canAct(p, turn, uid)) return reject('CARD_UNAVAILABLE', `${def.name} is not at work`);
  if ((turn.uses[uid] ?? 0) <= 0) return reject('CARD_UNAVAILABLE', `${def.name} has no action left this turn`);
  const st = stageCheck(s, turn, stage);
  if (!st.ok) return st;
  return { ok: true, def, turn };
}

/**
 * A card may act if it is at work, or if it went busy on a campaign placed this turn and still has
 * a use left (a night-shift marketing trainee's second billboard, ketchup.md §11; never in base,
 * where a marketeer has one use).
 */
export function canAct(p: PlayerState, turn: TurnState, uid: Uid): boolean {
  const place = cardPlace(p, uid);
  if (place === 'work') return true;
  return place === 'busy' && (turn.uses[uid] ?? 0) > 0 && (p.busy[uid] ?? []).every((c) => turn.campaignsPlaced.includes(c));
}

export function stageCheck(s: GameState, turn: TurnState, stage: WorkStage | 'end'): Check {
  const stages = stagesFor(s, turn.player);
  const cur = stageIndex(stages, turn.stage);
  const want = stage === 'end' ? stages.length : stageIndex(stages, stage);
  if (want < cur) return reject('ILLEGAL', `The ${STAGE_NAMES[stage]} step is over (you are at ${STAGE_NAMES[turn.stage]})`);
  if (want > stageIndex(stages, 'train') && turn.mustTrain.some((u) => phantomTrainable(s, turn, u))) {
    return reject('ILLEGAL', 'A card hired from an empty pile must be trained before moving on');
  }
  return OK;
}

// ---------------------------------------------------------------------------
// Career paths and empty-pile hires (base.md §6.2–6.3)
// ---------------------------------------------------------------------------

export interface TrainTarget {
  to: EmployeeId;
  /** Cards passed through, ending with `to`. */
  path: EmployeeId[];
}

/** Every card reachable from `from` in 1..maxSteps training steps (shortest path each). */
export function reachableTargets(s: GameState, _p: PlayerState | undefined, from: EmployeeId, maxSteps: number): TrainTarget[] {
  const content = contentFor(s.config.modules);
  const out: TrainTarget[] = [];
  const seen = new Set<EmployeeId>([from]);
  let frontier: TrainTarget[] = [{ to: from, path: [] }];
  for (let d = 0; d < maxSteps; d++) {
    const next: TrainTarget[] = [];
    for (const f of frontier) {
      for (const n of content.employees[f.to]?.trainsInto ?? []) {
        if (seen.has(n) || !content.employees[n]) continue;
        seen.add(n);
        const t = { to: n, path: [...f.path, n] };
        out.push(t);
        next.push(t);
      }
    }
    frontier = next;
  }
  return out;
}

/** How many copies of a card are at work (module `cardUses`, e.g. Night Shift doubles salary-free cards). */
export function copiesOf(s: GameState, player: string, uid: Uid): number {
  const p = s.players[player];
  const card = p?.employees[uid];
  const def = card ? contentFor(s.config.modules).employees[card.employeeId] : undefined;
  const base = baseUses(def);
  if (!card || !def || base <= 0 || !s.config.modules.length) return 1;
  const out = pipe(readCtx(s), 'cardUses', { uid, uses: base }, { player, card, def });
  return Math.max(1, Math.floor(out.uses / base));
}

/**
 * Stacked training as one action (questions.md Q-W10): with "First to pay $20" (stackTraining)
 * several trainers may put their steps on one card in a single `work.train`, and only the final
 * card must be available (DLX p16; designer: "Only the final personnel card has to be available",
 * non-existing cards may be "borrowed" within the turn). LEGACY(v3): not available.
 */
export function stackedTraining(s: GameState, player: PlayerId): boolean {
  if (rulesBefore(s, 4)) return false;
  return hasEffect(s, contentFor(s.config.modules), player, 'stackTraining').length > 0;
}

/** Training cards at work with uses left: how many steps each may put on one card. */
function trainersAtWork(s: GameState, p: PlayerState, uses: Record<Uid, number>, stacking: boolean): { uid: Uid; left: number; cap: number }[] {
  const content = contentFor(s.config.modules);
  return Object.keys(uses).flatMap((uid) => {
    const a = defOf(content, p, uid)?.ability;
    if (a?.kind !== 'train' || (uses[uid] ?? 0) <= 0 || cardPlace(p, uid) !== 'work') return [];
    // A card working as several copies (Night Shift) counts as that many trainers when training stacks.
    return [{ uid, left: uses[uid] ?? 0, cap: a.maxStepsSameCard * (stacking ? copiesOf(s, p.id, uid) : 1) }];
  });
}

/**
 * Can stacked trainers cover every card's steps? Card j needs `lengths[j]` steps; a trainer puts at
 * most `cap` on one card and `left` in all (a small bipartite flow, augmented one step at a time).
 */
function stepsFit(lengths: number[], trainers: { left: number; cap: number }[]): boolean {
  const flow = lengths.map(() => trainers.map(() => 0));
  const used = trainers.map(() => 0);
  const augment = (j: number, seen: Set<number>): boolean => {
    const row = flow[j] as number[];
    for (let t = 0; t < trainers.length; t++) {
      const tr = trainers[t] as { left: number; cap: number };
      if (seen.has(t) || (row[t] ?? 0) >= tr.cap) continue;
      seen.add(t);
      if ((used[t] ?? 0) < tr.left) {
        row[t] = (row[t] ?? 0) + 1;
        used[t] = (used[t] ?? 0) + 1;
        return true;
      }
      for (let k = 0; k < lengths.length; k++) {
        const other = flow[k] as number[];
        if ((other[t] ?? 0) > 0 && augment(k, seen)) {
          other[t] = (other[t] ?? 0) - 1;
          row[t] = (row[t] ?? 0) + 1;
          return true;
        }
      }
    }
    return false;
  };
  for (let j = 0; j < lengths.length; j++) for (let n = 0; n < (lengths[j] ?? 0); n++) if (!augment(j, new Set())) return false;
  return true;
}

/**
 * Can a card hired from an empty pile still be trained this turn? (Some training card at work
 * has uses left and reaches an available, allowed target; with stacked training, several together.)
 */
export function phantomTrainable(s: GameState, turn: TurnState, uid: Uid): boolean {
  const p = s.players[turn.player];
  const card = p?.employees[uid];
  if (!p || !card) return false;
  const content = contentFor(s.config.modules);
  const noCfo = hasEffect(s, content, turn.player, 'ceoIsCfo').length > 0;
  const allowed = (to: EmployeeId) => (s.supply[to] ?? 0) > 0 && !ownsUnique(content, p, to, uid) && !(noCfo && content.employees[to]?.ability.kind === 'cfo');
  if (stackedTraining(s, turn.player)) {
    const reach = trainersAtWork(s, p, turn.uses, true).reduce((n, t) => n + Math.min(t.left, t.cap), 0);
    return reach > 0 && reachableTargets(s, p, card.employeeId, reach).some((t) => allowed(t.to));
  }
  for (const [tUid, left] of Object.entries(turn.uses)) {
    const a = defOf(content, p, tUid)?.ability;
    if (a?.kind !== 'train' || left <= 0 || cardPlace(p, tUid) !== 'work') continue;
    const reach = reachableTargets(s, p, card.employeeId, Math.min(left, a.maxStepsSameCard));
    if (reach.some((t) => allowed(t.to))) return true;
  }
  return false;
}

/**
 * DLX p16: a card may be hired from an empty pile only if it is trained up this turn, and the card
 * it ends as must be available (only intermediate cards may be missing). Can every pending
 * empty-pile hire (`turn.mustTrain`, plus `extra` cards about to be hired) still be given its own
 * training action and its own available target card? Each needs one trainer card at work with
 * enough uses left (at most its per-card cap) and one supply copy of a card it reaches; trainers
 * and supply copies are shared out by a small search (a handful of hires at most).
 */
export function emptyPileHiresFeasible(s: GameState, turn: TurnState, extra: EmployeeId[] = [], uses: Record<Uid, number> = turn.uses, supply: GameState['supply'] = s.supply): boolean {
  const p = s.players[turn.player];
  if (!p) return false;
  const content = contentFor(s.config.modules);
  const noCfo = hasEffect(s, content, turn.player, 'ceoIsCfo').length > 0;
  const cards: { uid?: Uid; employeeId: EmployeeId }[] = [
    ...turn.mustTrain.flatMap((uid) => (p.employees[uid] ? [{ uid, employeeId: p.employees[uid].employeeId }] : [])),
    ...extra.map((employeeId) => ({ employeeId })),
  ];
  if (!cards.length) return true;
  if (stackedTraining(s, turn.player)) {
    // Stacked training (Q-W10): trainers share out their steps; each card needs an available final card.
    const pool = trainersAtWork(s, p, uses, true);
    const reach = pool.reduce((n, t) => n + Math.min(t.left, t.cap), 0);
    const stock: Partial<Record<EmployeeId, number>> = { ...supply };
    const taken1x = new Set<EmployeeId>();
    const lengths: number[] = [];
    const place = (i: number): boolean => {
      const card = cards[i];
      if (!card) return true;
      for (const target of reachableTargets(s, p, card.employeeId, reach)) {
        const def = content.employees[target.to];
        if ((stock[target.to] ?? 0) <= 0 || ownsUnique(content, p, target.to, card.uid) || (def?.unique && taken1x.has(target.to))) continue;
        if (noCfo && def?.ability.kind === 'cfo') continue;
        lengths.push(target.path.length);
        if (stepsFit(lengths, pool)) {
          stock[target.to] = (stock[target.to] ?? 0) - 1;
          if (def?.unique) taken1x.add(target.to);
          const ok = place(i + 1);
          stock[target.to] = (stock[target.to] ?? 0) + 1;
          if (def?.unique) taken1x.delete(target.to);
          if (ok) return true;
        }
        lengths.pop();
      }
      return false;
    };
    return place(0);
  }
  const trainers = Object.keys(uses).flatMap((tUid) => {
    const a = defOf(content, p, tUid)?.ability;
    return a?.kind === 'train' && (uses[tUid] ?? 0) > 0 && cardPlace(p, tUid) === 'work' ? [{ uid: tUid, cap: a.maxStepsSameCard }] : [];
  });
  const left: Record<Uid, number> = Object.fromEntries(trainers.map((t) => [t.uid, uses[t.uid] ?? 0]));
  const stock: Partial<Record<EmployeeId, number>> = { ...supply };
  const taken1x = new Set<EmployeeId>();
  const place = (i: number): boolean => {
    const card = cards[i];
    if (!card) return true;
    for (const t of trainers) {
      const max = Math.min(left[t.uid] ?? 0, t.cap);
      if (max <= 0) continue;
      for (const target of reachableTargets(s, p, card.employeeId, max)) {
        const def = content.employees[target.to];
        if ((stock[target.to] ?? 0) <= 0 || ownsUnique(content, p, target.to, card.uid) || (def?.unique && taken1x.has(target.to))) continue;
        if (noCfo && def?.ability.kind === 'cfo') continue;
        stock[target.to] = (stock[target.to] ?? 0) - 1;
        left[t.uid] = (left[t.uid] ?? 0) - target.path.length;
        if (def?.unique) taken1x.add(target.to);
        const ok = place(i + 1);
        stock[target.to] = (stock[target.to] ?? 0) + 1;
        left[t.uid] = (left[t.uid] ?? 0) + target.path.length;
        if (def?.unique) taken1x.delete(target.to);
        if (ok) return true;
      }
    }
    return false;
  };
  return place(0);
}

/**
 * Leaving the train step: an empty-pile hire that can no longer be trained was never taken from
 * a pile, so it simply disappears (questions.md Q-W1).
 */
export function dropUntrainedHires(ctx: EngineCtx): void {
  const s = ctx.state;
  const turn = s.turn;
  const p = turn ? s.players[turn.player] : undefined;
  if (!turn || !p || !turn.mustTrain.length) return;
  for (const uid of turn.mustTrain) {
    const card = p.employees[uid];
    if (!card) continue;
    delete p.employees[uid];
    p.beach = p.beach.filter((u) => u !== uid);
    ctx.emit({ type: 'employeeFired', player: p.id, uid, employeeId: card.employeeId, forced: true, reason: 'untrained' });
  }
  turn.mustTrain = [];
}
