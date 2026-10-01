/**
 * Phase 1 — Restructuring (base.md §4; DLX p12–13).
 *
 * Simultaneous and secret: each player submits which cards go to work, the rest go to the beach.
 * Submissions sit in `secrets[p].structureDraft` (redacted for others) and may be retracted until
 * the last one arrives; then all are revealed at once.
 * - CEO always at work; CEO slots (3, changed by the first bank break) hold any card.
 * - Managers only in CEO slots; manager slots hold non-managers only (max 3 levels).
 * - Overfill (more cards than slots, on the CEO or on any manager) is legal to submit and
 *   triggers the penalty: everything except the CEO goes to the beach (base.md §4.5).
 * - Busy marketeers are never placed (base.md §4.6).
 * - Players with no cards in hand are submitted automatically (turn 1: CEO only).
 */
import type { RestructureRetract, RestructureSubmit, StructureSubmission } from '../types/actions.js';
import type { GameState, PlayerId, Structure } from '../types/state.js';
import type { EngineCtx } from '../core/context.js';
import { OK, reject, type Check } from '../core/errors.js';
import { activePlayers, cardsInHand, ceoSlotsFor, defOf, isManager, managerSlots } from '../core/cards.js';
import { contentFor } from '../modules/registry.js';

/** Structural validity (not overfill). Returns a problem string or null. */
export function submissionProblem(s: GameState, player: PlayerId, sub: StructureSubmission): string | null {
  const p = s.players[player];
  if (!p) return 'Unknown player';
  if (!sub || !Array.isArray(sub.ceoSubs) || typeof sub.managerSubs !== 'object' || sub.managerSubs === null) return 'Malformed structure';
  const content = contentFor(s.config.modules);
  const hand = new Set(cardsInHand(p));
  const seen = new Set<string>();
  const use = (uid: unknown): string | null => {
    if (typeof uid !== 'string') return 'Malformed card id';
    if (!p.employees[uid]) return `You do not own ${uid}`;
    if (uid === p.structure.ceo) return 'The CEO is always at the top';
    if (p.busy[uid]) return 'Busy marketeers cannot be placed';
    if (!hand.has(uid)) return `${uid} is not in your hand`;
    if (seen.has(uid)) return `${uid} is placed twice`;
    seen.add(uid);
    return null;
  };
  for (const uid of sub.ceoSubs) {
    const e = use(uid);
    if (e) return e;
  }
  for (const [mgr, subs] of Object.entries(sub.managerSubs)) {
    if (!sub.ceoSubs.includes(mgr)) return 'A manager must sit in a CEO slot to hold cards';
    if (!isManager(defOf(content, p, mgr))) return `${mgr} is not a manager`;
    if (!Array.isArray(subs)) return 'Malformed structure';
    for (const uid of subs) {
      const e = use(uid);
      if (e) return e;
      if (isManager(defOf(content, p, uid))) return 'Managers can only report to the CEO';
    }
  }
  return null;
}

/** True if the structure holds more cards than its slots (base.md §4.5 penalty). */
export function isOverfilled(s: GameState, player: PlayerId, sub: StructureSubmission): boolean {
  const p = s.players[player];
  if (!p) return false;
  const content = contentFor(s.config.modules);
  if (sub.ceoSubs.length > ceoSlotsFor(s, content, player)) return true;
  return Object.entries(sub.managerSubs).some(([mgr, subs]) => subs.length > managerSlots(defOf(content, p, mgr)));
}

export function validateRestructure(s: GameState, a: RestructureSubmit | RestructureRetract): Check {
  if (s.phase.kind !== 'restructuring') return reject('WRONG_PHASE', 'Not restructuring');
  const sec = s.secrets[a.playerId];
  const p = s.players[a.playerId];
  if (!sec || !p) return reject('INVALID_PAYLOAD', 'Unknown player');
  if (p.bankrupt) return reject('ILLEGAL', 'Bankrupt');
  if (a.type === 'restructure.retract') return sec.structureDraft ? OK : reject('ILLEGAL', 'Nothing to retract');
  if (sec.structureDraft) return reject('ALREADY_SUBMITTED', 'Structure already submitted (retract first)');
  const problem = submissionProblem(s, a.playerId, a.structure);
  return problem ? reject('ILLEGAL', problem) : OK;
}

export function applyRestructure(ctx: EngineCtx, a: RestructureSubmit | RestructureRetract): void {
  const s = ctx.state;
  const sec = s.secrets[a.playerId];
  const p = s.players[a.playerId];
  if (!sec || !p) return;
  if (a.type === 'restructure.retract') {
    sec.structureDraft = null;
    ctx.emit({ type: 'structureRetracted', player: a.playerId });
    return;
  }
  const managerSubs: Record<string, string[]> = {};
  for (const [m, subs] of Object.entries(a.structure.managerSubs)) if (subs.length) managerSubs[m] = [...subs];
  const draft: Structure = { ceo: p.structure.ceo, ceoSubs: [...a.structure.ceoSubs], managerSubs };
  sec.structureDraft = draft;
  ctx.emit({ type: 'structureSubmitted', player: a.playerId, structure: structuredCopy(draft) });
}

const structuredCopy = (st: Structure): Structure => ({ ceo: st.ceo, ceoSubs: [...st.ceoSubs], managerSubs: Object.fromEntries(Object.entries(st.managerSubs).map(([k, v]) => [k, [...v]])) });

/** Auto-submit an empty structure for players with nothing in hand. */
export function autoSubmit(ctx: EngineCtx): void {
  const s = ctx.state;
  for (const id of activePlayers(s)) {
    const p = s.players[id];
    const sec = s.secrets[id];
    if (!p || !sec || sec.structureDraft) continue;
    if (cardsInHand(p).length === 0) sec.structureDraft = { ceo: p.structure.ceo, ceoSubs: [], managerSubs: {} };
  }
}

export function allSubmitted(s: GameState): boolean {
  return activePlayers(s).every((id) => s.secrets[id]?.structureDraft);
}

export function awaitingRestructure(s: GameState): PlayerId[] {
  return activePlayers(s).filter((id) => !s.secrets[id]?.structureDraft);
}

/** Reveal all submissions at once (base.md §4.2), apply the overfill penalty, send the rest to the beach. */
export function revealStructures(ctx: EngineCtx): void {
  const s = ctx.state;
  const structures: Record<PlayerId, Structure> = {};
  for (const id of activePlayers(s)) {
    const p = s.players[id];
    const sec = s.secrets[id];
    if (!p || !sec?.structureDraft) continue;
    const draft = sec.structureDraft;
    const hand = cardsInHand(p);
    if (isOverfilled(s, id, draft)) {
      p.structure = { ceo: p.structure.ceo, ceoSubs: [], managerSubs: {} };
      ctx.emit({ type: 'structurePenalty', player: id });
    } else {
      p.structure = structuredCopy(draft);
    }
    const placed = new Set([...p.structure.ceoSubs, ...Object.values(p.structure.managerSubs).flat()]);
    p.beach = [...p.beach, ...hand.filter((u) => !placed.has(u))];
    sec.structureDraft = null;
    structures[id] = structuredCopy(p.structure);
  }
  ctx.emit({ type: 'structuresRevealed', structures });
}
