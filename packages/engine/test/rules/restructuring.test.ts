/** Phase 1 Restructuring (base.md §4; DLX p12–13) and Phase 2 Order of Business (base.md §5; DLX p14). */
import { describe, expect, it } from 'vitest';
import type { EmployeeId, GameState, MilestoneId, PlayerId, Uid } from '../../src/index.js';
import { clone, legalActions, redactEvents, redactFor } from '../../src/index.js';
import { allocId } from '../../src/core/ids.js';
import { makeCtx } from '../../src/core/context.js';
import { runUntilInput } from '../../src/core/phase.js';
import { openSlots } from '../../src/rules/orderOfBusiness.js';
import { act, actE, newGame, rejected, throughSetup } from '../helpers/game.js';

/** Round-2 Restructuring with these cards in hand. Returns uids per player in the given order. */
function restructuring(hands: Record<PlayerId, EmployeeId[]>, opts: { players?: number; milestones?: Record<PlayerId, MilestoneId[]> } = {}) {
  const s: GameState = clone(throughSetup(newGame(opts.players ?? 2)));
  const uids: Record<PlayerId, Uid[]> = {};
  for (const [pid, ids] of Object.entries(hands)) {
    const p = s.players[pid];
    if (!p) throw new Error(pid);
    uids[pid] = ids.map((id) => {
      const uid = allocId(s, 'card');
      p.employees[uid] = { uid, employeeId: id, acquiredRound: 1 };
      s.supply[id] = (s.supply[id] ?? 0) - 1;
      return uid;
    });
  }
  for (const [pid, ms] of Object.entries(opts.milestones ?? {})) {
    for (const m of ms) (s.players[pid] as GameState['players'][string]).milestones[m] = { round: 1, phase: 'marketing' };
  }
  s.round = 2;
  s.phase = { kind: 'restructuring' };
  runUntilInput(makeCtx(s));
  return { s, uids };
}

describe('Restructuring (base.md §4)', () => {
  it('§4.3: in round 1 everyone has only the CEO, so structures are revealed automatically', () => {
    const s = throughSetup(newGame(2));
    expect(s.round).toBe(1);
    expect(s.phase.kind).toBe('orderOfBusiness');
    for (const p of Object.values(s.players)) expect(p.structure.ceoSubs).toEqual([]);
  });

  it('§4.1–4.2: submissions are secret until the last one; then revealed, rest to the beach', () => {
    const { s, uids } = restructuring({ p1: ['waitress', 'kitchen_trainee'], p2: ['errand_boy'] });
    expect(s.awaiting).toMatchObject({ kind: 'restructure' });
    const r = actE(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [uids.p1?.[0] as Uid], managerSubs: {} } });
    expect(r.state.players.p1?.structure.ceoSubs).toEqual([]);
    // Hidden from p2 in both the view and the events.
    const v2 = redactFor(r.state, 'p2');
    expect(v2.mine?.structureDraft).toBeNull();
    expect(v2.players.p1?.structure.ceoSubs).toEqual([]);
    expect(v2.submitted.p1).toBe(true);
    const ev = redactEvents(r.events, 'p2').find((e) => e.type === 'structureSubmitted');
    expect(ev && 'structure' in ev).toBe(false);
    expect(redactFor(r.state, 'p1').mine?.structureDraft?.ceoSubs).toEqual([uids.p1?.[0]]);
    expect(r.undoable).toBe(true);
    const done = actE(r.state, { type: 'restructure.submit', playerId: 'p2', structure: { ceoSubs: [uids.p2?.[0] as Uid], managerSubs: {} } });
    expect(done.events.some((e) => e.type === 'structuresRevealed')).toBe(true);
    expect(done.undoable).toBe(false);
    expect(done.state.players.p1?.structure.ceoSubs).toEqual([uids.p1?.[0]]);
    expect(done.state.players.p1?.beach).toEqual([uids.p1?.[1]]);
    expect(done.state.phase.kind).toBe('orderOfBusiness');
  });

  it('§4.1: a submission can be retracted before the reveal', () => {
    const { s, uids } = restructuring({ p1: ['waitress'], p2: ['waitress'] });
    let t = act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [], managerSubs: {} } });
    expect(rejected(t, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [], managerSubs: {} } }).code).toBe('ALREADY_SUBMITTED');
    expect(legalActions(t, 'p1').map((l) => l.label)).toEqual(['Change structure']);
    t = act(t, { type: 'restructure.retract', playerId: 'p1' });
    t = act(t, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [uids.p1?.[0] as Uid], managerSubs: {} } });
    expect(t.secrets.p1?.structureDraft?.ceoSubs).toEqual([uids.p1?.[0]]);
  });

  it('§4.4: managers only in CEO slots; manager slots hold non-managers only', () => {
    const { s, uids } = restructuring({ p1: ['management_trainee', 'junior_vp', 'waitress'], p2: [] });
    const [mt, jvp, w] = uids.p1 as [Uid, Uid, Uid];
    expect(rejected(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [mt], managerSubs: { [mt]: [jvp] } } }).message).toMatch(/Managers can only report to the CEO/);
    expect(rejected(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [w], managerSubs: { [w]: [mt] } } }).message).toMatch(/not a manager/);
    expect(rejected(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [w, w], managerSubs: {} } }).message).toMatch(/twice/);
    const t = act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [mt, jvp], managerSubs: { [mt]: [w] } } });
    expect(t.players.p1?.structure).toMatchObject({ ceoSubs: [mt, jvp], managerSubs: { [mt]: [w] } });
  });

  it('§4.5: overfilling is legal to submit and sends everything but the CEO to the beach', () => {
    const { s, uids } = restructuring({ p1: ['waitress', 'waitress', 'waitress', 'waitress'], p2: [] });
    const r = actE(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: uids.p1 as Uid[], managerSubs: {} } });
    expect(r.events.some((e) => e.type === 'structurePenalty' && e.player === 'p1')).toBe(true);
    expect(r.state.players.p1?.structure.ceoSubs).toEqual([]);
    expect(r.state.players.p1?.beach).toHaveLength(4);
  });

  it('DLX p13-14: an over-full layout of cards that fit elsewhere is re-seated, not penalised', () => {
    const { s, uids } = restructuring({ p1: ['management_trainee', 'waitress', 'waitress', 'waitress'], p2: [] });
    const [mt, w1, w2, w3] = uids.p1 as Uid[];
    // All four in the 3 CEO slots: over-full as laid out, but CEO:[MT,W,W] + MT:[W] is legal.
    const r = actE(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [mt, w1, w2, w3] as Uid[], managerSubs: {} } });
    expect(r.events.some((e) => e.type === 'structurePenalty')).toBe(false);
    expect(r.state.players.p1?.structure).toMatchObject({ ceoSubs: [mt, w1, w2], managerSubs: { [mt as Uid]: [w3] } });
    expect(r.state.players.p1?.beach).toHaveLength(0);
  });

  it('rules v1 (saved games): the same over-full layout takes the penalty', () => {
    const { s, uids } = restructuring({ p1: ['management_trainee', 'waitress', 'waitress', 'waitress'], p2: [] });
    s.config.rulesVersion = 1;
    const r = actE(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: uids.p1 as Uid[], managerSubs: {} } });
    expect(r.events.some((e) => e.type === 'structurePenalty' && e.player === 'p1')).toBe(true);
    expect(r.state.players.p1?.beach).toHaveLength(4);
  });

  it('DLX p13: more managers than CEO slots cannot be assigned, so the penalty applies', () => {
    const { s, uids } = restructuring({ p1: ['management_trainee', 'management_trainee', 'management_trainee', 'management_trainee'], p2: [] });
    const r = actE(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: uids.p1 as Uid[], managerSubs: {} } });
    expect(r.events.some((e) => e.type === 'structurePenalty' && e.player === 'p1')).toBe(true);
  });

  it('§4.6: busy marketeers cannot be placed', () => {
    const { s, uids } = restructuring({ p1: ['marketing_trainee', 'waitress'], p2: [] });
    const t = clone(s);
    const mt = uids.p1?.[0] as Uid;
    (t.players.p1 as GameState['players'][string]).busy[mt] = ['campaign-x'];
    expect(rejected(t, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [mt], managerSubs: {} } }).message).toMatch(/Busy/);
  });

  it('§4.9: "First Waitress Played" is claimed at the reveal; beach cards do not count', () => {
    const { s, uids } = restructuring({ p1: ['waitress'], p2: ['waitress'] });
    let t = act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [uids.p1?.[0] as Uid], managerSubs: {} } });
    t = act(t, { type: 'restructure.submit', playerId: 'p2', structure: { ceoSubs: [], managerSubs: {} } });
    expect(t.players.p1?.milestones.first_waitress).toBeDefined();
    expect(t.players.p2?.milestones.first_waitress).toBeUndefined();
  });
});

describe('Order of Business (base.md §5)', () => {
  it('§5.1: open slots = empty CEO slots + empty manager slots', () => {
    const { s, uids } = restructuring({ p1: ['management_trainee', 'waitress'], p2: [] });
    const [mt, w] = uids.p1 as [Uid, Uid];
    const t = act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: [mt], managerSubs: { [mt]: [w] } } });
    // CEO 3 slots − 1 + MT 2 slots − 1 = 3.
    expect(openSlots(t, 'p1')).toBe(3);
  });

  it('§5.3: most open slots chooses first and may take ANY free position; the last is assigned', () => {
    const { s, uids } = restructuring({ p1: ['waitress', 'waitress', 'waitress'], p2: [] });
    let t = act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: uids.p1 as Uid[], managerSubs: {} } });
    // p2: 3 open slots, p1: 0 → p2 chooses first.
    expect(t.phase).toMatchObject({ kind: 'orderOfBusiness', queue: ['p2', 'p1'] });
    expect(t.awaiting).toEqual({ kind: 'order', players: ['p2'] });
    expect(legalActions(t, 'p2').map((l) => l.label)).toEqual(['Take position 1', 'Take position 2']);
    t = act(t, { type: 'order.choosePosition', playerId: 'p2', position: 1 });
    expect(t.turnOrder).toEqual(['p1', 'p2']);
    expect(t.phase.kind).toBe('working');
  });

  it('§5.4: ties go to the player earlier in the previous turn order', () => {
    const s = throughSetup(newGame(3));
    const prev = s.turnOrder;
    expect(s.phase).toMatchObject({ kind: 'orderOfBusiness', queue: prev });
    expect(rejected(s, { type: 'order.choosePosition', playerId: prev[1] as string, position: 0 }).code).toBe('NOT_YOUR_TURN');
    let t = act(s, { type: 'order.choosePosition', playerId: prev[0] as string, position: 2 });
    expect(rejected(t, { type: 'order.choosePosition', playerId: prev[1] as string, position: 2 }).message).toMatch(/not free/);
    t = act(t, { type: 'order.choosePosition', playerId: prev[1] as string, position: 0 });
    expect(t.turnOrder).toEqual([prev[1], prev[2], prev[0]]);
  });

  it('§5.2: "First airplane campaign" adds 2 open slots for this count', () => {
    const { s } = restructuring({ p1: ['waitress'], p2: [] }, { milestones: { p1: ['first_airplane'] } });
    expect(openSlots(s, 'p1')).toBe(5);
  });
});
