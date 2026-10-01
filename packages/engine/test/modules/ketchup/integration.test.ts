/**
 * Ketchup integration (docs/rules/ketchup.md "Each module can be used alone or combined"): seeded
 * bots drive whole games through the public API only (legalActions / legalPlacements /
 * applyAction), with every Ketchup module combined and with each module alone. Every step must
 * keep the state structurally valid, plain JSON, redactable and awaiting someone.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, ModuleId, PhaseKind } from '../../../src/index.js';
import { createGame, legalActions, redactFor, replay } from '../../../src/index.js';
import { stateProblems } from '../../../src/testing/validate.js';
import { balancedBotAction, config, play } from '../../helpers/bot.js';

/** Every module that can be combined (Hard Choices conflicts with New Milestones; 6 Players needs 6 seats). */
const ALL: ModuleId[] = [
  'ketchup:newDistricts',
  'ketchup:lobbyists',
  'ketchup:newMilestones',
  'ketchup:coffee',
  'ketchup:kimchi',
  'ketchup:sushi',
  'ketchup:noodles',
  'ketchup:ketchup',
  'ketchup:fryChefs',
  'ketchup:massMarketeers',
  'ketchup:nightShift',
  'ketchup:ruralMarketeers',
  'ketchup:gourmetCritics',
  'ketchup:reservePrices',
  'ketchup:movieStars',
];

function checkStep(s: GameState): void {
  const problems = stateProblems(s);
  if (problems.length) throw new Error(`round ${s.round} ${s.phase.kind}:\n${problems.join('\n')}`);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  if (s.phase.kind !== 'gameOver') {
    expect(s.awaiting.players.length).toBeGreaterThan(0);
    const who = s.awaiting.players[0] as string;
    expect(legalActions(s, who).length).toBeGreaterThan(0);
  }
  const view = redactFor(s, 'spectator');
  expect('rng' in view).toBe(false);
}

function types(events: GameEvent[][]): Set<string> {
  return new Set(events.flat().map((e) => e.type));
}

describe('Ketchup: all modules combined', () => {
  it('3 players play 10 full rounds with every combinable module on; invariants hold at every step', () => {
    const initial = createGame(config(3, { modules: ALL }), 31);
    const phases = new Set<PhaseKind>();
    const r = play(initial, 17, (s) => s.round > 10, 20_000, (s) => {
      phases.add(s.phase.kind);
      checkStep(s);
    }, balancedBotAction);
    expect(r.state.round).toBe(11);
    expect(Object.values(r.state.board.houses).some((h) => h.kind === 'rural')).toBe(true);
    const seen = types(r.events);
    for (const t of ['structuresRevealed', 'employeeHired', 'salaryPaid', 'cardsReturned', 'turnEnded']) expect(seen.has(t)).toBe(true);
    const visited = new Set(r.events.flat().flatMap((e) => (e.type === 'phaseChanged' ? [e.to.kind] : [])));
    for (const k of ['restructuring', 'orderOfBusiness', 'working', 'dinnertime', 'payday', 'marketing', 'cleanup'] as PhaseKind[]) expect(visited.has(k)).toBe(true);
    // Replays reproduce the game exactly (determinism with modules, architecture §3.8).
    const again = replay(initial.config, initial.seed, r.actions);
    expect(again.state).toEqual(r.state);
  });

  it('intro game with every module (and intro milestones) runs to the end at the first bank break', () => {
    const r = play(createGame(config(2, { modules: ALL, intro: true, introMilestones: true }), 1), 13, () => false, 20_000, checkStep, balancedBotAction);
    expect(r.state.phase.kind).toBe('gameOver');
    expect(r.state.bank.breaks).toBe(1);
    expect(r.events.flat().filter((e) => e.type === 'gameEnded')).toHaveLength(1);
  });

  it('6 players with every module and 6 Players: 4x6 map, Siap Faji seat, several rounds', () => {
    const cfg = config(6, { modules: [...ALL, 'ketchup:sixPlayers'] });
    cfg.players[5] = { ...(cfg.players[5] as (typeof cfg.players)[number]), chain: 'siap_faji' };
    const initial = createGame(cfg, 6);
    expect([initial.board.rows, initial.board.cols]).toEqual([4, 6]);
    expect(initial.bank.cash).toBe(300);
    const r = play(initial, 66, (s) => s.round > 4, 20_000, checkStep, balancedBotAction);
    expect(r.state.round).toBe(5);
  });
});

describe('Ketchup: each module alone', () => {
  const alone: { id: ModuleId; modules: ModuleId[]; players: number }[] = [
    ...ALL.map((id) => ({ id, modules: [id], players: 3 })),
    { id: 'ketchup:hardChoices', modules: ['ketchup:hardChoices'], players: 3 },
    { id: 'ketchup:sixPlayers', modules: ['ketchup:newDistricts', 'ketchup:sixPlayers'], players: 6 },
  ];
  for (const { id, modules, players } of alone) {
    it(`${id}: a seeded ${players}-player game plays 6 rounds with invariants intact`, () => {
      const initial = createGame(config(players, { modules }), 101);
      const r = play(initial, 7, (s) => s.round > 6, 20_000, checkStep, balancedBotAction);
      expect(r.state.round > 6 || r.state.phase.kind === 'gameOver').toBe(true);
      expect(r.state.config.modules).toEqual(modules);
    });
  }
});
