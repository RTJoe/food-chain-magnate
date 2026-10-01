/**
 * Card location and ownership helpers (base.md §4; employees.md legend).
 * Every owned card is in exactly one place: the structure (at work), the beach, busy (marketeer
 * on a campaign) or the hand (only between Clean up and the Restructuring reveal).
 */
import type { EmployeeDef, EmployeeId, MilestoneEffect, MilestoneId } from '../types/content.js';
import type { GameState, PlayerId, PlayerState, Uid } from '../types/state.js';
import type { ContentIndex } from '../types/module.js';

export type CardPlace = 'work' | 'beach' | 'busy' | 'hand';

/** CEO, CEO-slot cards and manager-slot cards. */
export function cardsAtWork(p: PlayerState): Uid[] {
  const out = [p.structure.ceo, ...p.structure.ceoSubs];
  for (const m of p.structure.ceoSubs) out.push(...(p.structure.managerSubs[m] ?? []));
  return out;
}

export function cardPlace(p: PlayerState, uid: Uid): CardPlace {
  if (p.busy[uid]) return 'busy';
  if (p.beach.includes(uid)) return 'beach';
  if (cardsAtWork(p).includes(uid)) return 'work';
  return 'hand';
}

/** Cards in hand (not at work, not on the beach, not busy, not the CEO). */
export function cardsInHand(p: PlayerState): Uid[] {
  return Object.keys(p.employees).filter((u) => u !== p.structure.ceo && cardPlace(p, u) === 'hand');
}

export function defOf(content: ContentIndex, p: PlayerState, uid: Uid): EmployeeDef | undefined {
  const c = p.employees[uid];
  return c ? content.employees[c.employeeId] : undefined;
}

export const isManager = (def: EmployeeDef | undefined): boolean => def?.ability.kind === 'manager';

export function managerSlots(def: EmployeeDef | undefined): number {
  return def?.ability.kind === 'manager' ? def.ability.slots : 0;
}

/** Remove a card from the structure (busy marketeer leaves its slot, base.md §6.4). */
export function removeFromStructure(p: PlayerState, uid: Uid): void {
  p.structure.ceoSubs = p.structure.ceoSubs.filter((u) => u !== uid);
  for (const m of Object.keys(p.structure.managerSubs)) {
    p.structure.managerSubs[m] = (p.structure.managerSubs[m] ?? []).filter((u) => u !== uid);
  }
}

export const uniqueGroupOf = (def: EmployeeDef): string => def.uniqueGroup ?? def.id;

/**
 * 1x rule (DLX p7, p17): a player may own at most one card of each 1x type, beach and busy
 * included. True if the player already owns a card of `employeeId`'s 1x group (ignoring `exceptUid`).
 */
export function ownsUnique(content: ContentIndex, p: PlayerState, employeeId: EmployeeId, exceptUid?: Uid): boolean {
  const def = content.employees[employeeId];
  if (!def?.unique) return false;
  const group = uniqueGroupOf(def);
  return Object.values(p.employees).some((c) => {
    if (c.uid === exceptUid) return false;
    const d = content.employees[c.employeeId];
    return Boolean(d?.unique && uniqueGroupOf(d) === group);
  });
}

// ---------------------------------------------------------------------------
// Milestone effects owned by a player (data-driven from MilestoneDef.effects)
// ---------------------------------------------------------------------------

export function milestoneEffects(state: GameState, content: ContentIndex, player: PlayerId): { id: MilestoneId; effect: MilestoneEffect }[] {
  const p = state.players[player];
  if (!p) return [];
  const out: { id: MilestoneId; effect: MilestoneEffect }[] = [];
  for (const id of Object.keys(p.milestones) as MilestoneId[]) {
    for (const effect of content.milestones[id]?.effects ?? []) out.push({ id, effect });
  }
  return out;
}

export function hasEffect<K extends MilestoneEffect['kind']>(
  state: GameState,
  content: ContentIndex,
  player: PlayerId,
  kind: K,
): Extract<MilestoneEffect, { kind: K }>[] {
  return milestoneEffects(state, content, player)
    .map((x) => x.effect)
    .filter((e): e is Extract<MilestoneEffect, { kind: K }> => e.kind === kind);
}

/** CEO slots for a player: the global value, or a Ketchup per-player override (milestone `ceoSlots`). */
export function ceoSlotsFor(state: GameState, content: ContentIndex, player: PlayerId): number {
  const over = hasEffect(state, content, player, 'ceoSlots');
  return over.length ? Math.max(...over.map((e) => e.slots)) : state.ceoSlots;
}

export const activePlayers = (s: GameState): PlayerId[] => s.turnOrder.filter((id) => s.players[id] && !s.players[id]?.bankrupt);
