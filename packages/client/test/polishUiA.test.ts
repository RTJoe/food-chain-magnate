/** 2026-10 polish (minor UI findings): pure helpers behind the Turn panel, rail, log, org chart and transport. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine, type GameEvent, type GameView, type PlayerId } from '@fcm/engine';
import { FIXTURES, stateBuilder } from '@fcm/engine/testing';
import { mustFireNow } from '../src/state/payday.js';
import { cleanText } from '../src/ui/rules/clean.js';
import { conceptLabel, needsText } from '../src/ui/learn/lessonLabels.js';
import { describePlacement, readyLabel } from '../src/state/actions.js';
import { tileOf, tileSlotName } from '../src/state/boardLabels.js';
import { cashRankLabel, freeOrderPositions, housePaysLabel, isFinalBreak, servedBy, standings } from '../src/state/selectors.js';
import { saleCaptionText } from '../src/state/offers.js';
import { campaignSteps } from '../src/state/feedback.js';
import { placementError, validateDraft, type OrgRules } from '../src/state/orgChart.js';
import { rejectionToast } from '../src/state/store.js';
import { describeEvent } from '../src/state/log.js';
import { buildCatalog } from '../src/state/catalog.js';
import { SocketTransport } from '../src/net/socketTransport.js';

const viewOf = (s: ReturnType<typeof FIXTURES.working>, me: PlayerId = 'p1'): GameView => engine.redactFor(s, me);

describe('Payday must-fire warning (M185)', () => {
  it('warns when salaries exceed cash and someone salaried is left, unless firing is waived', () => {
    expect(mustFireNow({ after: 5, cash: 0, forcedFiring: true, salariedAfter: 1 })).toBe(true);
    expect(mustFireNow({ after: 5, cash: 5, forcedFiring: true, salariedAfter: 1 })).toBe(false);
    expect(mustFireNow({ after: 5, cash: 0, forcedFiring: false, salariedAfter: 1 })).toBe(false);
    expect(mustFireNow({ after: 5, cash: 0, forcedFiring: true, salariedAfter: 0 })).toBe(false);
  });
});

describe('copy helpers', () => {
  it('rules text drops implementation notes (M188)', () => {
    expect(cleanText('Implementation note: this is a choice, not an automatic sort. A player with first choice may take position 3.')).toBe('A player with first choice may take position 3.');
    expect(cleanText('Fired cards return to the supply. Use simultaneous (hidden or ordered-irrelevant choice).')).toBe('Fired cards return to the supply.');
    expect(cleanText('The board can be viewed from any side. For code, use rows x cols = 3x3.')).toBe('The board can be viewed from any side.');
  });

  it('food buttons use display names (M189)', () => {
    const name = (f: string) => (f === 'soft_drink' ? 'Soft drink' : f);
    expect(readyLabel('Errand Boy: get soft_drink', 'soft_drink' as never, name)).toBe('Errand Boy: get soft drink');
    expect(readyLabel('Pizza Chef: make 3 pizza', null, name)).toBe('Pizza Chef: make 3 pizza');
  });

  it('lesson chips show glossary terms; missing prerequisites read as the base course (M187, M210)', () => {
    expect(conceptLabel('one_x')).toBe('1x card');
    expect(conceptLabel('not_a_term')).toBe('not a term');
    expect(needsText(['base.1', 'base.2', 'base.3'])).toBe('Needs the base course (3 lessons left)');
    expect(needsText(['base.4'])).toMatch(/^Needs \S/);
  });

  it('sale captions keep "$" for the price only (M195)', () => {
    const c = { kind: 'sale', houseId: 'h', player: 'p1', unitPrice: 10, distance: 1, score: 11, total: 10, others: [{ player: 'p2', score: 10, canSupply: false }] } as const;
    expect(saleCaptionText(c as never, (p) => (p === 'p1' ? 'Mustard' : 'Ada'), '2')).toBe('Mustard sells to house 2: $10 + 1 = 11 · beat Ada (10, no stock)');
  });

  it('house pays: garden ×2, park ×2, both ×3 (M245)', () => {
    expect(housePaysLabel(false, 1)).toBeNull();
    expect(housePaysLabel(true, 1)).toBe('Garden: pays ×2');
    expect(housePaysLabel(false, 2)).toBe('Park: pays ×2');
    expect(housePaysLabel(true, 3)).toBe('Garden + park: pays ×3');
  });

  it('a served house names its seller this round (M211)', () => {
    const sale = { type: 'sale', houseId: 'h1', player: 'p2' } as unknown as GameEvent;
    const list = [{ id: 1, round: 3, phase: 'dinnertime' as const, events: [sale] }];
    expect(servedBy(list, 3, 'h1')).toBe('p2');
    expect(servedBy(list, 4, 'h1')).toBeNull();
  });

  it('rejections in plain words, harmless no-ops not red (M202, M258, M259)', () => {
    expect(rejectionToast('STALE', 'Expected seq 4, got 3', 'undo')).toEqual({ text: expect.stringMatching(/undo was not applied/), tone: 'info' });
    expect(rejectionToast('BAD_MESSAGE', 'Nothing to undo').tone).toBe('info');
    expect(rejectionToast('UNDO_UNAVAILABLE', 'Nothing of yours to undo').text).toBe('Nothing to undo');
    expect(rejectionToast('PROTOCOL_MISMATCH', 'Server speaks protocol 1').text).toMatch(/Reload/);
    expect(rejectionToast('ILLEGAL', 'Not your turn')).toEqual({ text: 'Not your turn', tone: 'error' });
  });
});

describe('board labels (M190, M292)', () => {
  it('names squares and off-board tile slots by the rim labels', () => {
    expect(tileOf(8, 3)).toBe('B1');
    expect(tileSlotName(-1, 0, 3, 4)).toBe('above A1');
    expect(tileSlotName(1, 4, 3, 4)).toBe('right of D2');
    expect(tileSlotName(1, 1, 3, 4)).toBe('B2');
    expect(describePlacement({ kind: 'restaurant', x: 8, y: 3, entrance: 'NE' } as never)).toBe('Tile B1 · square 8,3 · entrance NE');
    expect(describePlacement({ kind: 'park', x: 12, y: 6, w: 1, h: 2 } as never)).toBe('Park at 12,6 · tile C2');
  });
});

describe('rail ranks and order track (M208, M248)', () => {
  it('equal cash shares a rank; bankrupt chains are out and last', () => {
    const s = stateBuilder({ players: 3 }).round(3).build();
    for (const id of ['p1', 'p2', 'p3']) s.players[id]!.cash = 0;
    let v = viewOf(s);
    expect(cashRankLabel(v, 'p3')).toBe('tied #1 in cash');
    s.players.p3!.cash = 30;
    s.players.p1!.bankrupt = true;
    v = viewOf(s);
    expect(cashRankLabel(v, 'p3')).toBe('#1 in cash');
    expect(cashRankLabel(v, 'p2')).toBe('#2 in cash');
    expect(cashRankLabel(v, 'p1')).toBe('Out');
    expect(standings(v)).toEqual(['p3', 'p2', 'p1']);
  });

  it('free order positions come from the choosers queue', () => {
    const v = { phase: { kind: 'orderOfBusiness', queue: ['p1', 'p2'], picks: { p1: 0 } }, turnOrder: ['p1', 'p2', 'p3'] } as unknown as GameView;
    expect(freeOrderPositions(v)).toEqual([1]);
  });

  it('the intro game ends at its first bank break (M196, M243)', () => {
    expect(isFinalBreak(1, { config: { intro: true } } as GameView)).toBe(true);
    expect(isFinalBreak(1, { config: { intro: false } } as GameView)).toBe(false);
    expect(isFinalBreak(2, { config: { intro: false } } as GameView)).toBe(true);
  });
});

describe('Marketing results keep the run’s full houses (M244)', () => {
  it('unions campaignRan.full over passes, minus houses that got demand', () => {
    const ev = [
      { type: 'campaignRan', campaignId: 'c1', pass: 1, full: ['h1', 'h2'] },
      { type: 'demandPlaced', campaignId: 'c1', houseId: 'h2', tokens: [{ good: 'burger' }] },
      { type: 'campaignRan', campaignId: 'c1', pass: 2, full: ['h3'] },
    ] as unknown as GameEvent[];
    expect(campaignSteps(ev)[0]?.full).toEqual(['h1', 'h3']);
  });
});

describe('org chart: Night Shift Manager has no slots (M246, M285)', () => {
  const rules: OrgRules = { ceoSlots: 3, isManager: (u) => u === 'nsm' || u === 'vp', slotsOf: (u) => (u === 'vp' ? 2 : 0) };
  it('refuses reports under it, still allows a real manager', () => {
    const d = { ceoSubs: ['nsm', 'vp'], managerSubs: {} };
    expect(placementError(d, 'w', { kind: 'manager', managerUid: 'nsm' }, rules)).toBe('A Night Shift Manager has no slots');
    expect(placementError(d, 'w', { kind: 'manager', managerUid: 'vp' }, rules)).toBeNull();
    expect(validateDraft({ ceoSubs: ['nsm'], managerSubs: { nsm: ['w'] } }, rules).errors).toContain('A Night Shift Manager has no slots');
    expect(validateDraft(d, rules).managers.map((m) => m.uid)).toEqual(['vp']);
  });
});

describe('log lines (M289)', () => {
  it('road opens at Clean up; a coffee shop move reads as a move', () => {
    const s = stateBuilder({ players: 2 }).round(3).build();
    const v = viewOf(s);
    const c = buildCatalog(engine.listModules(), s.config.modules);
    const road = { type: 'entityPlaced', player: null, entity: { kind: 'lobbyistRoad', id: 'e1', owner: 'p1', cells: [], arrows: [], underConstruction: false } } as unknown as GameEvent;
    expect(describeEvent(road, v, c)?.text).toBe(`${v.players.p1!.name}'s new road opens`);
    const removed = { type: 'entityRemoved', entityId: 'e2', kind: 'coffeeShop' } as unknown as GameEvent;
    const placed = { type: 'entityPlaced', player: 'p1', entity: { kind: 'coffeeShop', id: 'e3', owner: 'p1', x: 1, y: 1 } } as unknown as GameEvent;
    expect(describeEvent(placed, v, c, removed)?.text).toMatch(/moves a coffee shop$/);
    expect(describeEvent(placed, v, c)?.text).toMatch(/places a coffee shop$/);
  });

});

describe('dead socket detection (M253)', () => {
  class FakeWS {
    static all: FakeWS[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    sent: string[] = [];
    constructor(readonly url: string) {
      FakeWS.all.push(this);
    }
    send(d: string) {
      this.sent.push(d);
    }
    close() {
      this.readyState = 3;
    }
  }
  afterEach(() => vi.useRealTimers());

  it('a ping with no answer replaces the socket; an answered one does not', () => {
    vi.useFakeTimers();
    FakeWS.all = [];
    const t = new SocketTransport({ url: 'ws://x/ws', pingEvery: 1000, pongTimeout: 500, WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    t.connect();
    const a = FakeWS.all[0]!;
    a.readyState = 1;
    a.onopen?.();
    vi.advanceTimersByTime(1000); // ping sent
    a.onmessage?.({ data: JSON.stringify({ t: 'pong', ts: 1, serverTs: 2 }) });
    vi.advanceTimersByTime(600);
    expect(FakeWS.all).toHaveLength(1);
    vi.advanceTimersByTime(1000); // next ping, never answered
    vi.advanceTimersByTime(600);
    expect(FakeWS.all).toHaveLength(2);
    t.close();
  });
});
