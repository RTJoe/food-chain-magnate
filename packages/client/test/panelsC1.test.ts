/** Turn panels and texts that must agree with the engine: open slots, bank breaks, milestones, game end. */
import { describe, expect, it } from 'vitest';
import { engine, type GameEvent, type GameState, type MilestoneId, type ModuleId, type PlayerId } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { buildCatalog } from '../src/state/catalog.js';
import { ceoSlotsOf, orderSlots } from '../src/state/orgChart.js';
import { bankBreakText, milestoneRows } from '../src/state/selectors.js';
import { describeEvent } from '../src/state/log.js';
import { coachHints } from '../src/ui/hints/rules.js';

const manifest = engine.listModules();
const viewOf = (s: GameState, me: PlayerId) => engine.redactFor(s, me);
const catalogOf = (s: GameState) => buildCatalog(manifest, s.config.modules);

describe('Order of Business open slots (engine counts)', () => {
  it('First Airplane adds 2 and the hint names it', () => {
    const s = FIXTURES.restructuring();
    s.phase = { kind: 'orderOfBusiness', queue: ['p1', 'p2', 'p3'], picks: {} };
    const before = orderSlots(viewOf(s, 'p1'), 'p1');
    s.players.p1!.milestones.first_airplane = { round: 1, phase: 'marketing' };
    const after = orderSlots(viewOf(s, 'p1'), 'p1');
    expect(after).toEqual({ open: before.open + 2, bonus: 2, penalty: false });
    const h = coachHints({ view: viewOf(s, 'p1'), me: 'p1', catalog: catalogOf(s), draft: null }, 'light').find((x) => x.id === 'order_position');
    expect(h?.text).toContain(`${after.open} open slot`);
    expect(h?.text).toContain('+2 First Airplane');
    expect(h?.text).toMatch(/1st of 3/);
  });

  it('Ketchup First Burger Sold: 4 CEO slots for that player only', () => {
    const s = FIXTURES.restructuring();
    s.config.modules = ['ketchup:newMilestones' as ModuleId];
    s.players.p1!.milestones['ketchup:first_burger_sold' as MilestoneId] = { round: 1, phase: 'dinnertime' };
    const v = viewOf(s, 'p1');
    expect(ceoSlotsOf(v, 'p1')).toBe(4);
    expect(ceoSlotsOf(v, 'p2')).toBe(s.ceoSlots);
  });

  it('a draft that cannot be seated counts as CEO alone', () => {
    const s = FIXTURES.restructuring();
    s.secrets.p1!.structureDraft = null;
    const v = viewOf(s, 'p1');
    const empty = orderSlots(v, 'p1', { ceoSubs: [], managerSubs: {} });
    expect(empty.penalty).toBe(false);
    // Every card on the CEO, far beyond its slots and with nowhere to re-seat them.
    const p = s.players.p1!;
    const all = Object.keys(p.employees).filter((u) => u !== p.structure.ceo);
    const over = orderSlots(v, 'p1', { ceoSubs: [...all, ...all.map((u) => `${u}-x`)], managerSubs: {} });
    expect(over.penalty).toBe(true);
    expect(over.open).toBe(s.ceoSlots);
  });
});

describe('hints', () => {
  it('frozen goods count as stock for the house hint (DLX p34)', () => {
    const s = FIXTURES.working();
    s.turn!.stage = 'food';
    const me = s.turn!.player;
    const [hid, house] = Object.entries(s.board.houses)[0]!;
    house.demand = [{ good: 'beer' } as never];
    const outlook = (h: string) =>
      h === hid ? { houseId: hid, capacity: 3, demand: 1, winner: me, campaigns: [], sellers: [{ player: me, restaurantId: 'r1', unitPrice: 10, distance: 1, score: 11, tier: 0, waitresses: 0, canSupply: true }] } : null;
    const run = () => coachHints({ view: viewOf(s, me), me, catalog: catalogOf(s), draft: null, outlook: outlook as never }, 'light').map((h) => h.id);
    s.players[me]!.inventory = {};
    s.players[me]!.freezer = {};
    expect(run()).toContain('house_missing_goods');
    s.players[me]!.freezer = { beer: 1 };
    expect(run()).not.toContain('house_missing_goods');
  });
});

describe('bank breaks', () => {
  const base = { config: { intro: false, modules: [] as ModuleId[] } } as never;
  it('first break: CEO slots, or base price with Reserve Prices', () => {
    expect(bankBreakText({ breakNo: 1, added: 400, ceoSlots: 4, basePrice: 10 }, base)).toBe('! Reserves add $400. CEO slots are now 4');
    const rp = { config: { intro: false, modules: ['ketchup:reservePrices'] } } as never;
    expect(bankBreakText({ breakNo: 1, added: 400, ceoSlots: 3, basePrice: 20 }, rp)).toBe('! Reserves add $400. Base price is now $20');
  });
  it('final break: after this Dinnertime, or the next one when it broke in Marketing (KX p18)', () => {
    expect(bankBreakText({ breakNo: 2, added: 0, ceoSlots: 3, basePrice: 10 }, base, 'dinnertime')).toMatch(/second time: the game ends after this Dinnertime/);
    expect(bankBreakText({ breakNo: 2, added: 0, ceoSlots: 3, basePrice: 10 }, base, 'marketing')).toMatch(/during Marketing: play continues until the next Dinnertime/);
    const intro = { config: { intro: true, modules: [] } } as never;
    expect(bankBreakText({ breakNo: 1, added: 0, ceoSlots: 3, basePrice: 10 }, intro, 'dinnertime')).toBe(': the game ends after this Dinnertime (no Payday)');
  });
});

describe('log and milestones', () => {
  it('every chain bankrupt: no winner; CFO fired for the milestone says why', () => {
    const s = FIXTURES.working();
    const v = viewOf(s, 'p1');
    const c = catalogOf(s);
    const ended = { type: 'gameEnded', ranking: ['p1', 'p2'], cash: { p1: 0, p2: 0 }, winner: null } as unknown as GameEvent;
    expect(describeEvent(ended, v, c)?.text).toBe('Every chain went bankrupt: no winner');
    const fired = { type: 'employeeFired', player: 'p1', uid: 'x', employeeId: 'cfo', forced: true, reason: 'milestone' } as unknown as GameEvent;
    expect(describeEvent(fired, v, c)?.text).toMatch(/First to have \$100/);
  });

  it('giant billboards are logged without a number', () => {
    const s = FIXTURES.working();
    const e = { type: 'campaignPlaced', player: 'p1', campaign: { id: 'c1', kind: 'giantBillboard', number: 21, goods: ['burger'] } } as unknown as GameEvent;
    expect(describeEvent(e, viewOf(s, 'p1'), catalogOf(s))?.text).not.toContain('#21');
  });

  it('a milestone first claimed this round is still claimable by others', () => {
    const s = FIXTURES.working();
    s.milestones.first_train = { claimedBy: ['p2'], claimedRound: s.round, removed: false, removeAfterRound: null };
    const row = (me: PlayerId | null) => milestoneRows(viewOf(s, 'p1'), me).find((r) => r.id === 'first_train')!;
    expect(row('p1').available).toBe(true);
    expect(row('p2').available).toBe(false);
    expect(row(null).available).toBe(false);
    s.milestones.first_train.claimedRound = s.round - 1;
    expect(row('p1').available).toBe(false);
  });
});
