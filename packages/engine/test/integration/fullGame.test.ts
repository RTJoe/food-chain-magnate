/**
 * Integration: seeded scripted bots drive games from createGame through every phase using only
 * the public API (legalActions / legalPlacements / applyAction). base.md §3 round structure.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, PhaseKind } from '../../src/index.js';
import { createGame, redactFor } from '../../src/index.js';
import { stateProblems } from '../../src/testing/validate.js';
import { config, play } from '../helpers/bot.js';

function supplyConserved(s: GameState, initial: GameState): string | null {
  // Every base card is in the supply or owned (empty-pile hires never left the supply).
  const owned: Record<string, number> = {};
  for (const p of Object.values(s.players)) for (const c of Object.values(p.employees)) owned[c.employeeId] = (owned[c.employeeId] ?? 0) + 1;
  for (const [id, n0] of Object.entries(initial.supply)) {
    const now = (s.supply[id as keyof typeof s.supply] ?? 0) + (owned[id] ?? 0);
    if (now !== n0) return `${id}: ${now} != ${n0}`;
  }
  return null;
}

describe('full game via the reducer (base.md §3)', () => {
  it('3 players play several complete rounds through all phases with structural invariants intact', () => {
    const initial = createGame(config(3), 2024);
    const phases = new Set<PhaseKind>();
    const r = play(initial, 7, (s) => s.round > 6, 20_000, (s) => {
      phases.add(s.phase.kind);
      expect(stateProblems(s)).toEqual([]);
      expect(supplyConserved(s, initial)).toBeNull();
      expect(s.awaiting.players.length > 0 || s.phase.kind === 'gameOver').toBe(true);
      redactFor(s, 'spectator');
    });
    expect(r.state.round).toBe(7);
    for (const k of ['setup.restaurants', 'setup.reserve', 'orderOfBusiness', 'working', 'payday', 'restructuring'] as PhaseKind[]) expect(phases.has(k)).toBe(true);
    const types = new Set(r.events.flat().map((e) => e.type));
    for (const t of ['employeeHired', 'turnEnded', 'structuresRevealed', 'salaryPaid', 'roundStarted', 'cardsReturned']) expect(types.has(t as never)).toBe(true);
    // Dinnertime, Marketing and Clean up are automatic: their phaseChanged events prove they ran.
    const visited = new Set(r.events.flat().flatMap((e) => (e.type === 'phaseChanged' ? [e.to.kind] : [])));
    for (const k of ['dinnertime', 'payday', 'marketing', 'cleanup'] as PhaseKind[]) expect(visited.has(k)).toBe(true);
  });

  it('a 2-player game runs until the bank breaks twice and the game ends after Dinnertime (base.md §12)', () => {
    const r = play(createGame(config(2), 5), 55, () => false, 50_000);
    expect(r.state.phase.kind).toBe('gameOver');
    expect(r.state.bank.breaks).toBe(2);
    const ended = r.events.flat().filter((e) => e.type === 'gameEnded');
    expect(ended).toHaveLength(1);
    const last = r.events.flat().filter((e) => e.type === 'phaseChanged').at(-1);
    expect(last && last.type === 'phaseChanged' ? [last.from, last.to.kind] : null).toEqual(['dinnertime', 'gameOver']);
  });

  it('intro game (base.md §13) ends at the first bank break and skips Payday salaries', () => {
    const r = play(createGame(config(2, { intro: true }), 8), 9, () => false, 50_000);
    expect(r.state.phase.kind).toBe('gameOver');
    expect(r.state.bank.breaks).toBe(1);
    expect(r.events.flat().some((e) => e.type === 'salaryPaid')).toBe(false);
  });
});
