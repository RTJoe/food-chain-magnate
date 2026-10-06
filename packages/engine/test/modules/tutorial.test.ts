/**
 * Tutorial module (docs/tutorial-plan.md §4.2): pauses after configured automatic phases with a
 * `continue` choice for the learner, changes no rule, replays deterministically, hidden from lobbies.
 */
import { describe, expect, it } from 'vitest';
import type { Action, GameState, PlayerId, TutorialPausePhase } from '../../src/index.js';
import { applyAction, enableTutorial, legalActions, listModules, TUTORIAL_PAUSE_PHASES, validateAction } from '../../src/index.js';
import { assertValidState, town } from '../../src/testing/index.js';

/** Round 1 Restructuring on the tutorial town, both chains with only their CEO. */
const scenario = (): GameState => town({ round: 1 }).phase({ kind: 'restructuring' }).build();

/** A simple non-tutorial move for whoever the engine awaits (null when paused or game over). */
function move(s: GameState): Action | null {
  if (s.pending[0]) return null;
  const who = s.awaiting.players[0] as PlayerId | undefined;
  if (!who) return null;
  const legal = legalActions(s, who);
  const ready = (type: Action['type']) => legal.find((l) => l.kind === 'ready' && l.action.type === type);
  for (const t of ['order.choosePosition', 'work.endTurn', 'payday.confirm', 'cleanup.freezer'] as const) {
    const l = ready(t);
    if (l && l.kind === 'ready') return l.action;
  }
  if (s.phase.kind === 'restructuring') {
    const p = s.players[who];
    if (p) return { type: 'restructure.submit', playerId: who, structure: { ceoSubs: [], managerSubs: {} } };
  }
  throw new Error(`no simple move in ${s.phase.kind} (${s.awaiting.kind})`);
}

function step(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.message}`);
  return r.state;
}

/** Drive one round (to Restructuring of round 2), continuing every pause. */
function playRound(start: GameState) {
  let s = start;
  const holds: string[] = [];
  const actions: Action[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const head = s.pending[0];
    if (head?.kind === 'continue') {
      holds.push(`${s.round}:${head.phase}`);
      if (s.round === 2) break;
      const a: Action = { type: 'tutorial.continue', playerId: head.player, choiceId: head.id };
      actions.push(a);
      s = step(s, a);
      continue;
    }
    if (s.round === 2) break;
    const a = move(s);
    if (!a) break;
    actions.push(a);
    s = step(s, a);
  }
  return { state: s, holds, actions };
}

const strip = (s: GameState) => ({ round: s.round, phase: s.phase, players: s.players, board: s.board, bank: s.bank, supply: s.supply, milestones: s.milestones, turnOrder: s.turnOrder, nextId: s.nextId });

describe('tutorial module', () => {
  it('pauses after every configured phase, in order, once each', () => {
    const { state } = enableTutorial(scenario(), { player: 'p1', pauseAfter: [...TUTORIAL_PAUSE_PHASES] });
    const r = playRound(state);
    expect(r.holds).toEqual(['1:restructuring', '1:orderOfBusiness', '1:working', '1:dinnertime', '1:payday', '1:marketing', '1:cleanup', '2:restructuring']);
    assertValidState(r.state);
  });

  it('pauses only after the listed phases', () => {
    const pauseAfter: TutorialPausePhase[] = ['dinnertime', 'cleanup'];
    const { state } = enableTutorial(scenario(), { player: 'p1', pauseAfter });
    expect(playRound(state).holds).toEqual(['1:dinnertime', '1:cleanup']);
  });

  it('holds the game: only the learner can continue, nobody else can act', () => {
    const { state: s } = enableTutorial(scenario(), { player: 'p1', pauseAfter: ['restructuring'] });
    const head = s.pending[0];
    expect(head).toMatchObject({ kind: 'continue', player: 'p1', phase: 'restructuring', optional: false });
    expect(s.awaiting).toEqual({ kind: 'choice', players: ['p1'] });
    expect(legalActions(s, 'p2')).toEqual([]);
    const mine = legalActions(s, 'p1');
    expect(mine).toEqual([{ kind: 'ready', label: 'Continue', action: { type: 'tutorial.continue', playerId: 'p1', choiceId: head?.id } }]);
    expect(validateAction(s, { type: 'tutorial.continue', playerId: 'p2', choiceId: head?.id ?? '' }).ok).toBe(false);
    expect(validateAction(s, { type: 'tutorial.continue', playerId: 'p1', choiceId: 'nope' }).ok).toBe(false);
    expect(validateAction(s, { type: 'order.choosePosition', playerId: 'p1', position: 0 }).ok).toBe(false);
    // The pause sits between the reveal and Order of Business: structures are already revealed.
    expect(s.phase.kind).toBe('orderOfBusiness');
  });

  it('changes no rule: the same moves give the same game with pauses, without pauses and without the module', () => {
    const paused = playRound(enableTutorial(scenario(), { player: 'p1', pauseAfter: [...TUTORIAL_PAUSE_PHASES] }).state);
    const moves = paused.actions.filter((a) => a.type !== 'tutorial.continue');
    let plain = enableTutorial(scenario(), { player: 'p1', pauseAfter: [] }).state;
    // Settled the same way, then with the module removed again.
    let off = structuredClone(plain);
    off.config.modules = [];
    off.config.options = {};
    off.moduleState = {};
    for (const a of moves) {
      plain = step(plain, a);
      off = step(off, a);
    }
    expect(strip(plain)).toEqual(strip(paused.state));
    expect(strip(off)).toEqual(strip(paused.state));
  });

  it('replays (scenario, actions) to an identical state', () => {
    const start = enableTutorial(scenario(), { player: 'p1', pauseAfter: [...TUTORIAL_PAUSE_PHASES] }).state;
    const first = playRound(start);
    let again = start;
    for (const a of first.actions) again = step(again, a);
    expect(again).toEqual(first.state);
    expect(JSON.parse(JSON.stringify(again))).toEqual(again);
  });

  it('startPaused holds before anything runs; settle: false leaves the state as built', () => {
    const built = scenario();
    const paused = enableTutorial(built, { player: 'p1', pauseAfter: [], startPaused: true });
    expect(paused.state.pending[0]).toMatchObject({ kind: 'continue', phase: 'start' });
    expect(paused.state.phase.kind).toBe('restructuring');
    const head = paused.state.pending[0];
    const next = step(paused.state, { type: 'tutorial.continue', playerId: 'p1', choiceId: head?.id ?? '' });
    expect(next.pending).toEqual([]);
    expect(next.phase.kind).not.toBe('restructuring');
    const raw = enableTutorial(built, { player: 'p1', pauseAfter: ['dinnertime'], settle: false });
    expect(raw.events).toEqual([]);
    expect(raw.state.awaiting).toEqual(built.awaiting);
    expect(raw.state.config.modules).toContain('tutorial');
    expect(built.config.modules).not.toContain('tutorial');
  });

  it('is internal: never listed for lobbies', () => {
    expect(listModules().map((m) => m.id)).not.toContain('tutorial');
  });
});
