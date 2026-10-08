/**
 * Cleanup scenarios (base.md §10, §12 bankruptcy; DLX p33; milestones.md first_throw_away).
 * Map: see c2ctx.ts.
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type StateBuilder } from '../../src/testing/index.js';
import { applyCleanupAction, freezerCapacity, isCleanupComplete, runCleanup, validateCleanupAction } from '../../src/rules/cleanup.js';
import { milestoneAvailable } from '../../src/rules/milestones.js';
import type { CleanupFreezer } from '../../src/types/index.js';
import { MAP, makeCtx, type TestCtx } from './c2ctx.js';

function base(players = 2): StateBuilder {
  return stateBuilder({ players }).tiles(MAP).round(3);
}

function cleanup(b: StateBuilder): TestCtx {
  const ctx = makeCtx(b.phase({ kind: 'cleanup' }).build());
  runCleanup(ctx);
  return ctx;
}

const freeze = (playerId: string, keep: CleanupFreezer['keep']): CleanupFreezer => ({ type: 'cleanup.freezer', playerId, keep });

describe('A. throw away (base.md §10A)', () => {
  it('unsold stock is thrown away; everyone who throws something away this round claims First to Throw Away', () => {
    const ctx = cleanup(base(3).inventory('p1', { burger: 2 }).inventory('p2', { beer: 1 }));
    const s = ctx.state;
    expect(s.players.p1?.inventory).toEqual({});
    expect(s.players.p2?.inventory).toEqual({});
    expect(ctx.of('foodDiscarded').map((e) => e.player)).toEqual(['p1', 'p2']);
    expect(s.players.p1?.milestones.first_throw_away).toBeDefined();
    expect(s.players.p2?.milestones.first_throw_away).toBeDefined();
    expect(s.players.p3?.milestones.first_throw_away).toBeUndefined();
    // D: crossed out for p3 at the end of this Cleanup.
    expect(milestoneAvailable(s, 'p3', 'first_throw_away')).toBe(false);
  });

  it('base.md §12: a bankrupt chain throwing its stock away claims nothing and leaves the milestone open', () => {
    const b = base(3).inventory('p2', { burger: 2 });
    const st = b.build();
    (st.players.p2 as { bankrupt: boolean }).bankrupt = true;
    const ctx = makeCtx({ ...st, phase: { kind: 'cleanup' } });
    runCleanup(ctx);
    expect(ctx.state.players.p2?.inventory).toEqual({});
    expect(ctx.of('milestoneClaimed')).toHaveLength(0);
    expect(ctx.state.milestones.first_throw_away).toMatchObject({ claimedBy: [], removed: false });
    expect(milestoneAvailable(ctx.state, 'p1', 'first_throw_away')).toBe(true);
  });

  it('the freezer earned this round is not usable until the next Cleanup', () => {
    const s = base().milestone('p1', 'first_throw_away', 3).build();
    expect(freezerCapacity(s, 'p1')).toBe(0);
    const s2 = base().milestone('p1', 'first_throw_away', 2).build();
    expect(freezerCapacity(s2, 'p1')).toBe(10);
  });

  it('with a freezer and ≤ 10 items, everything is kept automatically (stays in stock)', () => {
    const ctx = cleanup(base().milestone('p1', 'first_throw_away', 2).inventory('p1', { burger: 3 }).freezer('p1', { beer: 2 }));
    expect(ctx.state.awaiting.kind).toBe('none');
    expect(ctx.state.players.p1?.inventory).toEqual({});
    expect(ctx.state.players.p1?.freezer).toEqual({ burger: 3, beer: 2 });
    expect(ctx.of('foodDiscarded')).toHaveLength(0);
  });

  it('with more than 10 items the player chooses up to 10 to keep (any mix); the rest is thrown away', () => {
    const ctx = cleanup(base().milestone('p1', 'first_throw_away', 2).inventory('p1', { burger: 8, pizza: 5 }));
    expect(ctx.state.awaiting).toEqual({ kind: 'cleanup.freezer', players: ['p1'] });
    expect(isCleanupComplete(ctx.state)).toBe(false);
    expect(validateCleanupAction(ctx.state, freeze('p1', { burger: 8, pizza: 3 }))).toMatchObject({ ok: false, code: 'ILLEGAL' });
    expect(validateCleanupAction(ctx.state, freeze('p1', { beer: 1 }))).toMatchObject({ ok: false, code: 'ILLEGAL' });
    expect(validateCleanupAction(ctx.state, freeze('p1', { burger: -1 }))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(validateCleanupAction(ctx.state, freeze('p2', {}))).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    const a = freeze('p1', { burger: 6, pizza: 4 });
    expect(validateCleanupAction(ctx.state, a)).toEqual({ ok: true });
    applyCleanupAction(ctx, a);
    expect(ctx.state.players.p1?.freezer).toEqual({ burger: 6, pizza: 4 });
    expect(ctx.of('foodDiscarded')[0]?.goods).toEqual({ burger: 2, pizza: 1 });
    expect(isCleanupComplete(ctx.state)).toBe(true);
    expect(ctx.state.awaiting.kind).toBe('none');
  });

  it('nothing to throw away → no milestone', () => {
    const ctx = cleanup(base());
    expect(ctx.state.players.p1?.milestones.first_throw_away).toBeUndefined();
    expect(milestoneAvailable(ctx.state, 'p1', 'first_throw_away')).toBe(true);
  });
});

describe('B–C. cards and signs (base.md §10B–C)', () => {
  it('structure and beach go back to hand; busy marketeers stay; unused recruit actions reset', () => {
    const b = base()
      .card('p1', 'management_trainee', 'work', 'mt')
      .card('p1', 'waitress', { under: 'mt' }, 'w')
      .card('p1', 'burger_cook', 'beach', 'cook')
      .marketeerCampaign('marketing_trainee', 'mkt', {
        owner: 'p1',
        kind: 'airplane',
        number: 4,
        goods: ['burger'],
        placement: { kind: 'airplane', side: 'W', offset: 3, width: 1 },
        remaining: 2,
      })
      .mutate((s) => {
        (s.players.p1 as { unusedRecruitActions: number }).unusedRecruitActions = 2;
      });
    const p1 = cleanup(b).state.players.p1;
    expect(p1?.structure).toEqual({ ceo: b.ceoUid('p1'), ceoSubs: [], managerSubs: {} });
    expect(p1?.beach).toEqual([]);
    expect(Object.keys(p1?.employees ?? {})).toEqual(expect.arrayContaining(['mt', 'w', 'cook', 'mkt']));
    expect(Object.keys(p1?.busy ?? {})).toEqual(['mkt']);
    expect(p1?.unusedRecruitActions).toBe(0);
  });

  it('COMING SOON restaurants open; drive-in signs are removed', () => {
    const ctx = cleanup(
      base()
        .restaurant('p1', 3, 3, 'NW', 'comingSoon', 'r-soon')
        .restaurant('p2', 3, 5, 'NW', 'open', 'r-drive')
        .mutate((s) => {
          (s.board.restaurants['r-drive'] as { driveIn?: boolean }).driveIn = true;
        }),
    );
    expect(ctx.state.board.restaurants['r-soon']?.status).toBe('open');
    expect(ctx.state.board.restaurants['r-drive']?.driveIn).toBeUndefined();
    expect(ctx.of('restaurantOpened')).toEqual([{ type: 'restaurantOpened', restaurantId: 'r-soon' }]);
  });
});

describe('D. cross out milestones (base.md §10D, §11)', () => {
  it('milestones claimed this round become unavailable to everyone else; unclaimed ones stay', () => {
    const ctx = cleanup(base().milestone('p1', 'first_train', 3));
    expect(ctx.state.milestones.first_train?.removed).toBe(true);
    expect(milestoneAvailable(ctx.state, 'p2', 'first_train')).toBe(false);
    expect(milestoneAvailable(ctx.state, 'p2', 'first_billboard')).toBe(true);
    expect(ctx.of('milestonesRemoved')[0]?.milestoneIds).toContain('first_train');
  });
});

describe('bankruptcy at end of turn (base.md §12, JD 1473813)', () => {
  it('a bankrupt chain returns its cards to the supply, its restaurants become derelict, its campaigns stay', () => {
    const b = base()
      .restaurant('p1', 3, 3, 'NW', 'open', 'r1')
      .card('p1', 'burger_cook', 'beach')
      .marketeerCampaign('campaign_manager', 'cm', {
        id: 'c',
        owner: 'p1',
        kind: 'airplane',
        number: 4,
        goods: ['burger'],
        placement: { kind: 'airplane', side: 'W', offset: 3, width: 1 },
        remaining: 2,
      })
      .inventory('p1', { burger: 2 })
      .mutate((s) => {
        (s.players.p1 as { bankrupt: boolean }).bankrupt = true;
      });
    const before = b.build().supply;
    const ctx = cleanup(b);
    const s = ctx.state;
    expect(Object.keys(s.players.p1?.employees ?? {})).toEqual([b.ceoUid('p1')]);
    expect(s.supply.burger_cook).toBe((before.burger_cook ?? 0) + 1);
    expect(s.supply.campaign_manager).toBe((before.campaign_manager ?? 0) + 1);
    expect(s.board.restaurants.r1?.status).toBe('derelict');
    expect(s.board.campaigns.c).toMatchObject({ marketeer: null, remaining: 2 });
    // A bankrupt chain does not claim First to Throw Away.
    expect(s.players.p1?.milestones.first_throw_away).toBeUndefined();
    expect(s.phase.kind).toBe('cleanup');
  });

  it('if every chain is bankrupt, the game ends', () => {
    const ctx = cleanup(
      base().mutate((s) => {
        for (const p of Object.values(s.players)) (p as { bankrupt: boolean }).bankrupt = true;
      }),
    );
    expect(ctx.state.phase).toMatchObject({ kind: 'gameOver', reason: 'allBankrupt' });
    // base.md §12 (JD 1473813, 1660800): if everyone goes bankrupt, everyone loses.
    expect(ctx.of('gameEnded')[0]).toMatchObject({ winner: null });
  });
});
