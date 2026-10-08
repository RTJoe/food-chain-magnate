/** Easy's Ketchup placement choices (freeways), on states built with the engine's test helpers. */
import { describe, expect, it } from 'vitest';
import type { Action, GameState, Uid } from '@fcm/engine';
import { engine, redactFor } from '@fcm/engine';
import { act, workingTurn } from '../../engine/test/helpers/game.js';
import { kgame } from '../../engine/test/modules/ketchup/helpers.js';
import { decisionSeed, runBotDetailed } from '../src/index.js';

/** p1 with two rural marketeers places a giant billboard: the optional freeway choice is pending. */
function freewayChoice(seed: number): GameState {
  const { s, work } = workingTurn(kgame(2, ['ketchup:ruralMarketeers'], undefined, seed), 'p1', { work: ['ketchup:rural_marketeer', 'ketchup:rural_marketeer'] as never });
  const giant = { type: 'work.placeCampaign', playerId: 'p1', cardUid: work[0] as Uid, campaignKind: 'giantBillboard', tileNumber: 21, goods: ['burger'], placement: { kind: 'rural', side: 'N' }, duration: 1 } as Action;
  return act(s, giant);
}

/** p1's rank among the rural area's sellers (0 = wins it), or -1 when not connected. */
function ruralRank(s: GameState): number {
  const rural = Object.values(s.board.houses).find((h) => h.kind === 'rural');
  return rural ? (engine.houseOutlook(s, rural.id)?.sellers.findIndex((x) => x.player === 'p1') ?? -1) : -1;
}

describe('Easy: freeways (KX p26: rural distance counts from any freeway)', () => {
  it.each([1, 2, 3])('places the freeway where it wins the rural area (seed %i)', (seed) => {
    const t = freewayChoice(seed);
    expect(t.pending[0]).toMatchObject({ kind: 'freeway', player: 'p1' });
    expect(ruralRank(t)).toBe(-1);
    const r = runBotDetailed({ level: 'easy', view: redactFor(t, 'p1'), playerId: 'p1', seed: decisionSeed(seed, t.history.seq, 'p1'), budgetMs: 300 }, engine);
    expect(r).toMatchObject({ fellBack: false, internalFallback: false });
    expect(r.action.type).toBe('ketchup:ruralMarketeers.placeFreeway');
    const next = engine.applyAction(t, r.action);
    expect(next.ok && ruralRank(next.state)).toBe(0);
  });
});
