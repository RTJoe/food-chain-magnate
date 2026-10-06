/** Coach hints (ui/hints/rules.ts) on engine fixtures: right ids per situation and level, views only. */
import { describe, expect, it } from 'vitest';
import { engine, type GameState, type HouseOutlook, type PlayerId } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { buildCatalog } from '../src/state/catalog.js';
import { coachHints, type HintInput } from '../src/ui/hints/rules.js';
import type { OrgDraft } from '../src/state/orgChart.js';

const manifest = engine.listModules();
const viewOf = (s: GameState, me: PlayerId) => engine.redactFor(s, me);
const input = (s: GameState, me: PlayerId, extra: Partial<HintInput> = {}): HintInput => ({ view: viewOf(s, me), me, catalog: buildCatalog(manifest, s.config.modules), draft: null, ...extra });
const ids = (i: HintInput, level: 'off' | 'light' | 'full' = 'full') => coachHints(i, level).map((h) => h.id);

describe('coach hints', () => {
  it('off shows nothing', () => {
    const s = FIXTURES.working();
    s.players.p2!.cash = 0;
    expect(ids(input(s, 'p2'), 'off')).toEqual([]);
    expect(ids(input(s, 'p2'), 'light')).toContain('salary_short');
  });

  it('restructuring: overfill, idle trainer, no campaign tiles', () => {
    const s = FIXTURES.restructuring();
    s.secrets.p1!.structureDraft = null; // not submitted yet
    const full: OrgDraft = { ceoSubs: ['p1-mt', 'p1-w', 'p1-mkt'], managerSubs: {} };
    expect(ids(input(s, 'p1', { draft: full, ceoSlots: 2 }), 'light')).toContain('overfill');
    expect(ids(input(s, 'p1', { draft: full, ceoSlots: 3 }), 'light')).not.toContain('overfill');

    const trainerOnly: OrgDraft = { ceoSubs: ['p3-tr', 'p3-eb'], managerSubs: {} };
    expect(ids(input(s, 'p3', { draft: trainerOnly }), 'light')).toContain('trainer_idle');
    expect(ids(input(s, 'p3', { draft: { ceoSubs: ['p3-tr'], managerSubs: {} } }), 'light')).not.toContain('trainer_idle');

    const gone = FIXTURES.restructuring();
    gone.secrets.p1!.structureDraft = null;
    gone.marketingTiles = gone.marketingTiles.filter((n) => n < 11 || n > 16);
    expect(ids(input(gone, 'p1', { draft: full }), 'light')).toContain('campaign_tiles_gone');
    expect(ids(input(s, 'p1', { draft: full }), 'light')).not.toContain('campaign_tiles_gone');
  });

  it('order of business: says which position you choose', () => {
    const s = FIXTURES.restructuring();
    s.phase = { kind: 'orderOfBusiness', queue: ['p2', 'p1', 'p3'], picks: {} };
    const h = coachHints(input(s, 'p1'), 'light').find((x) => x.id === 'order_position');
    expect(h?.text).toMatch(/2nd of 3/);
  });

  it('bank low is a full-level hint', () => {
    const s = FIXTURES.working();
    s.bank.cash = 40; // 3 players: start $150
    expect(ids(input(s, 'p1'), 'full')).toContain('bank_low');
    expect(ids(input(s, 'p1'), 'light')).not.toContain('bank_low');
  });

  it('working: missing goods, ghost with no reach, losing a house by $1', () => {
    const s = FIXTURES.working();
    s.turn!.stage = 'food';
    const [hid, house] = Object.entries(s.board.houses)[0]!;
    house.demand = [{ good: 'beer' } as never];
    const outlook = (h: string): HouseOutlook | null =>
      h === hid
        ? {
            houseId: hid,
            capacity: 3,
            demand: 1,
            winner: 'p1',
            campaigns: [],
            sellers: [
              { player: 'p1', restaurantId: 'r1', unitPrice: 9, distance: 1, score: 10, tier: 0, waitresses: 1, canSupply: true },
              { player: 'p2', restaurantId: 'r2', unitPrice: 10, distance: 1, score: 11, tier: 0, waitresses: 0, canSupply: true },
            ],
          }
        : null;
    const got = coachHints(input(s, 'p2', { outlook, ghostReach: 0 }), 'full');
    expect(got.map((h) => h.id)).toEqual(expect.arrayContaining(['house_missing_goods', 'campaign_reaches_nobody', 'lose_by_one']));
    expect(got.find((h) => h.id === 'lose_by_one')?.text).toMatch(/\$10 \+ 1 = 11/);
    // Not my turn: no turn hints.
    expect(ids(input(s, 'p3', { outlook, ghostReach: 0 }))).not.toContain('campaign_reaches_nobody');
  });

  it('working: a milestone in reach this turn (full only)', () => {
    const s = FIXTURES.working();
    s.turn!.stage = 'recruit';
    s.turn!.hired = [];
    delete s.milestones.first_hire_3;
    s.milestones.first_train = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null };
    s.players.p2!.structure.ceoSubs.push('p2-tr');
    s.players.p2!.beach = s.players.p2!.beach.filter((u) => u !== 'p2-tr');
    expect(ids(input(s, 'p2'), 'full')).toContain('milestone_in_reach');
    expect(ids(input(s, 'p2'), 'light')).not.toContain('milestone_in_reach');
  });
});
