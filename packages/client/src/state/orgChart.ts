/**
 * Restructuring draft model and live validation (base.md §4).
 * - CEO slots hold any card, including managers.
 * - Managers hold non-managers only, and sit only in CEO slots (max 3 levels).
 * - Overfilling is legal but triggers the penalty (all but the CEO go to the beach, §4.5), so it is
 *   a warning, not an error.
 * All functions are pure; the draft is a plain object (`StructureSubmission`).
 */
import type { StructureSubmission, Uid } from '@fcm/engine';

export type OrgDraft = StructureSubmission;

export type SlotTarget = { kind: 'ceo' } | { kind: 'manager'; managerUid: Uid };

export interface OrgRules {
  ceoSlots: number;
  /** True for black manager cards (incl. night shift manager). */
  isManager(uid: Uid): boolean;
  /** Slots of a manager card (0 for others). */
  slotsOf(uid: Uid): number;
}

export interface OrgValidation {
  ceo: { used: number; capacity: number };
  managers: { uid: Uid; used: number; capacity: number }[];
  /** Hard errors: the draft cannot be submitted. */
  errors: string[];
  /** Overfill: legal, but the penalty applies. */
  overfilled: boolean;
  /** Total cards placed (excl. CEO). */
  placed: number;
}

export const emptyDraft = (): OrgDraft => ({ ceoSubs: [], managerSubs: {} });

export function draftFromStructure(s: { ceoSubs: Uid[]; managerSubs: Record<Uid, Uid[]> }, keep?: (uid: Uid) => boolean): OrgDraft {
  const ok = keep ?? (() => true);
  const ceoSubs = s.ceoSubs.filter(ok);
  const managerSubs: Record<Uid, Uid[]> = {};
  for (const m of ceoSubs) {
    const subs = (s.managerSubs[m] ?? []).filter(ok);
    if (subs.length) managerSubs[m] = subs;
  }
  return { ceoSubs, managerSubs };
}

/** Every uid placed in the draft (excl. CEO). */
export function placedUids(d: OrgDraft): Uid[] {
  return [...d.ceoSubs, ...d.ceoSubs.flatMap((m) => d.managerSubs[m] ?? [])];
}

export function handUids(all: readonly Uid[], d: OrgDraft): Uid[] {
  const placed = new Set(placedUids(d));
  return all.filter((u) => !placed.has(u));
}

/** Remove a card; a removed manager's reports go back to hand too. */
export function removeCard(d: OrgDraft, uid: Uid): OrgDraft {
  const ceoSubs = d.ceoSubs.filter((u) => u !== uid);
  const managerSubs: Record<Uid, Uid[]> = {};
  for (const m of ceoSubs) {
    const subs = (d.managerSubs[m] ?? []).filter((u) => u !== uid);
    if (subs.length) managerSubs[m] = subs;
  }
  return { ceoSubs, managerSubs };
}

/** Why a card cannot go to a target, or null if it can (capacity is not checked: overfill is legal). */
export function placementError(d: OrgDraft, uid: Uid, target: SlotTarget, rules: OrgRules): string | null {
  if (target.kind === 'ceo') return null;
  if (target.managerUid === uid) return 'A card cannot report to itself';
  if (!d.ceoSubs.includes(target.managerUid)) return 'Put the manager in a CEO slot first';
  if (!rules.isManager(target.managerUid)) return 'Only managers have slots';
  // Night Shift Manager: a manager card with no slots (KX p22); the engine rejects reports under it.
  if (rules.slotsOf(target.managerUid) === 0) return 'A Night Shift Manager has no slots';
  if (rules.isManager(uid)) return 'Managers report only to the CEO';
  return null;
}

/** Move `uid` to `target`. Returns the draft unchanged if the move is illegal. */
export function placeCard(d: OrgDraft, uid: Uid, target: SlotTarget, rules: OrgRules): OrgDraft {
  if (placementError(d, uid, target, rules)) return d;
  // Moving a manager keeps its reports; moving anything else detaches it first.
  const keepReports = target.kind === 'ceo' && d.ceoSubs.includes(uid) ? (d.managerSubs[uid] ?? []) : [];
  const base = removeCard(d, uid);
  if (target.kind === 'ceo') {
    const managerSubs = { ...base.managerSubs };
    if (keepReports.length) managerSubs[uid] = keepReports;
    return { ceoSubs: [...base.ceoSubs, uid], managerSubs };
  }
  const subs = [...(base.managerSubs[target.managerUid] ?? []), uid];
  return { ceoSubs: base.ceoSubs, managerSubs: { ...base.managerSubs, [target.managerUid]: subs } };
}

export function validateDraft(d: OrgDraft, rules: OrgRules): OrgValidation {
  const errors: string[] = [];
  const seen = new Set<Uid>();
  for (const u of placedUids(d)) {
    if (seen.has(u)) errors.push('A card is placed twice');
    seen.add(u);
  }
  for (const [m, subs] of Object.entries(d.managerSubs)) {
    if (!subs.length) continue;
    if (!d.ceoSubs.includes(m)) errors.push('Reports to a manager who is not in a CEO slot');
    if (!rules.isManager(m)) errors.push('Only managers can have reports');
    else if (rules.slotsOf(m) === 0) errors.push('A Night Shift Manager has no slots');
    if (subs.some((s) => rules.isManager(s))) errors.push('Managers report only to the CEO');
  }
  const ceo = { used: d.ceoSubs.length, capacity: rules.ceoSlots };
  const managers = d.ceoSubs
    .filter((u) => rules.isManager(u) && (rules.slotsOf(u) > 0 || (d.managerSubs[u] ?? []).length > 0))
    .map((uid) => ({ uid, used: (d.managerSubs[uid] ?? []).length, capacity: rules.slotsOf(uid) }));
  const overfilled = ceo.used > ceo.capacity || managers.some((m) => m.used > m.capacity);
  return { ceo, managers, errors: [...new Set(errors)], overfilled, placed: seen.size };
}

/** Open slots for Order of Business (base.md §5.1): empty CEO + manager slots. */
export function openSlots(v: OrgValidation): number {
  if (v.overfilled) return 0;
  return v.ceo.capacity - v.ceo.used + v.managers.reduce((n, m) => n + Math.max(0, m.capacity - m.used), 0);
}

/** Payload for `restructure.submit`: drop empty report lists. */
export function toSubmission(d: OrgDraft): StructureSubmission {
  const managerSubs: Record<Uid, Uid[]> = {};
  for (const m of d.ceoSubs) {
    const subs = d.managerSubs[m];
    if (subs?.length) managerSubs[m] = [...subs];
  }
  return { ceoSubs: [...d.ceoSubs], managerSubs };
}
