/**
 * Shared helpers for the late base lessons (L8–L15, WP-T3): Continue, live numbers read from the
 * view, and canonical moves computed from the engine (placements whose payload the UI builds).
 * Narration helpers take a `GameView` only (never hidden information).
 */
import type { Action, Campaign, Cell, GameEvent, GameView, Placement, PlacementSpec, PlayerId, PlayerState, StructureSubmission, Uid } from '@fcm/engine';
import { engine } from '@fcm/engine';
import type { Predicate, StepCtx } from '../../dsl.js';
import { houseByNumber } from '../../targets.js';

export { continueAction } from '../dev/demo.js';

/** Paused after `phase`, waiting for the learner's Continue. */
export const pausedAfter = (phase: string): Predicate => ({ paused: phase as never });

/** Uid of a player's card by employee id (first match; lessons give each kind one copy). */
export function uidOf(v: GameView, player: PlayerId, employeeId: string): Uid | null {
  const p = v.players[player];
  if (!p) return null;
  for (const [uid, c] of Object.entries(p.employees)) if (c.employeeId === employeeId) return uid;
  return null;
}

export const cashOf = (v: GameView, player: PlayerId): number => v.players[player]?.cash ?? 0;

export const nameOf = (v: GameView, player: PlayerId): string => v.players[player]?.name ?? player;

/** Drink source id at a square. */
export function sourceAt(v: GameView, [x, y]: readonly [number, number]): string | null {
  for (const s of Object.values(v.board.drinkSources)) if (s.x === x && s.y === y) return s.id;
  return null;
}

/** Whether a road path passes next to the square (orthogonally adjacent to some path square). */
export function pathTouches(path: readonly Cell[], [x, y]: readonly [number, number]): boolean {
  return path.some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) === 1);
}

/** The engine's legal placements for a spec, read from the full state (solutions only). */
export function placementsFor(ctx: StepCtx, spec: PlacementSpec): Placement[] {
  try {
    return engine.legalPlacements(ctx.state(), ctx.me, spec);
  } catch {
    return [];
  }
}

/** Open slots of a structure (CEO slots + manager slots − cards placed), from the public view. */
export function openSlots(v: GameView, player: PlayerId): number {
  const p = v.players[player];
  if (!p) return 0;
  const s = p.structure;
  return openSlotsOf(v, p, s);
}

export function openSlotsOf(v: GameView, p: PlayerState, s: Pick<StructureSubmission, 'ceoSubs' | 'managerSubs'>): number {
  const slotsOf = (u: Uid) => {
    const id = p.employees[u]?.employeeId;
    return id === 'management_trainee' ? 2 : id === 'junior_vp' ? 3 : id === 'vice_president' ? 4 : id === 'senior_vp' ? 5 : id === 'executive_vp' ? 10 : 0;
  };
  let open = Math.max(0, v.ceoSlots - s.ceoSubs.length);
  for (const m of s.ceoSubs) open += Math.max(0, slotsOf(m) - (s.managerSubs[m]?.length ?? 0));
  return open;
}

/** House id by number, or '' (narration-safe). */
export const houseId = (v: GameView, n: number): string => houseByNumber(v, n) ?? '';

/** Demand tokens on a house, by good ("2 beer, 1 burger"). */
export function demandWords(v: GameView, n: number): string {
  const h = v.board.houses[houseId(v, n)];
  if (!h || !h.demand.length) return 'nothing';
  const by = new Map<string, number>();
  for (const d of h.demand) by.set(d.good, (by.get(d.good) ?? 0) + 1);
  return [...by].map(([g, k]) => `${k} ${g.replace('_', ' ')}${k > 1 && g !== 'soft_drink' ? 's' : ''}`).join(' and ');
}

/** Sales in these events (newest dinner last). */
export const salesIn = (events: readonly GameEvent[]): Extract<GameEvent, { type: 'sale' }>[] => events.filter((e): e is Extract<GameEvent, { type: 'sale' }> => e.type === 'sale');

/** The learner's campaign placed in these events, if any. */
export function campaignPlacedBy(events: readonly GameEvent[], player: PlayerId): Campaign | null {
  for (const e of events) if (e.type === 'campaignPlaced' && e.player === player) return e.campaign;
  return null;
}

/** A milestone claim event for `player`. */
export const claimed = (events: readonly GameEvent[], player: PlayerId, id: string): boolean => events.some((e) => e.type === 'milestoneClaimed' && e.player === player && e.milestoneId === id);

/** `$` money. */
export const usd = (n: number): string => (n < 0 ? `-$${-n}` : `$${n}`);

/** Action narrowing helper for gates. */
export const is = <T extends Action['type']>(a: Action, type: T): a is Extract<Action, { type: T }> => a.type === type;
