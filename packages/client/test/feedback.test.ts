/**
 * WP5 phase feedback and Ketchup placement helpers: Dinnertime / Marketing steps from real engine
 * events, the winning route drawn for a sale, and lobbyist road spots that turn in place.
 */
import { describe, expect, it } from 'vitest';
import { engine, type GameEvent, type GameState, type Placement } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { makeCtx } from '../../engine/src/core/context.js';
import { runUntilInput } from '../../engine/src/core/phase.js';
import { clone } from '../../engine/src/core/clone.js';
import { campaignSteps, dinnerFeedback, dinnerSteps } from '../src/state/feedback.js';
import { dinnerRoute } from '../src/three/overlays/feedback.js';
import { groupSpots, orientationOf } from '../src/three/spots.js';
import { rotateTileCell } from '../src/three/ketchupGhosts.js';

/** Resolve the automatic phases of a fixture (as its next action would). */
function resolve(s: GameState): { state: GameState; events: GameEvent[] } {
  const next = clone(s);
  const ctx = makeCtx(next);
  runUntilInput(ctx);
  return { state: next, events: ctx.events };
}

function dinner() {
  const s = FIXTURES.dinnertime();
  s.bank.cash = 2000; // keep the bank from breaking (the game would end)
  return resolve(s);
}

describe('dinner steps', () => {
  const { state, events } = dinner();
  const steps = dinnerSteps(events);

  it('lists the houses in resolution order with the outcome', () => {
    const considered = events.filter((e) => e.type === 'houseConsidered').map((e) => (e as { houseId: string }).houseId);
    expect(steps.map((s) => s.houseId)).toEqual(considered);
    expect(steps.some((s) => s.sale)).toBe(true);
    expect(steps.some((s) => s.stayedHome && !s.sale)).toBe(true);
  });

  it('marks exactly the seller as the winning offer', () => {
    for (const s of steps.filter((x) => x.sale)) {
      const won = s.offers.filter((o) => o.won);
      expect(won.map((o) => o.player)).toEqual([s.sale!.player]);
      expect(dinnerFeedback(s)).toMatchObject({ kind: 'dinner', houseId: s.houseId, winner: { player: s.sale!.player, restaurantId: s.sale!.restaurantId } });
    }
  });

  it('draws a winning route as long as the sale distance (tile borders)', () => {
    const b = state.board;
    const tile = (c: { x: number; y: number }) => `${Math.floor(c.x / b.tileSize)},${Math.floor(c.y / b.tileSize)}`;
    for (const s of steps.filter((x) => x.sale)) {
      const sale = s.sale!;
      const r = dinnerRoute(b, sale.restaurantId, sale.houseId);
      expect(r, `route to ${sale.houseId}`).not.toBeNull();
      const rest = b.restaurants[sale.restaurantId]!;
      const corner = r!.from.kind === 'restaurant' ? r!.from.corner : rest.entrance;
      const origin = { x: rest.x + (corner.endsWith('E') ? 1 : 0), y: rest.y + (corner.startsWith('S') ? 1 : 0) };
      let borders = tile(origin) !== tile(r!.path[0]!) ? 1 : 0;
      for (let i = 1; i < r!.path.length; i++) if (tile(r!.path[i - 1]!) !== tile(r!.path[i]!)) borders++;
      expect(borders).toBe(sale.distance);
    }
  });
});

describe('campaign steps', () => {
  it('follows the marketing run order with the demand each campaign dropped', () => {
    let { state } = dinner();
    const all: GameEvent[] = [];
    for (const p of ['p1', 'p2', 'p3']) {
      const r = engine.applyAction(state, { type: 'payday.confirm', playerId: p });
      if (!r.ok) continue;
      state = r.state;
      all.push(...r.events);
    }
    const ran = all.filter((e) => e.type === 'campaignRan').map((e) => (e as { campaignId: string }).campaignId);
    expect(ran.length).toBeGreaterThan(0);
    const steps = campaignSteps(all);
    expect(steps.map((s) => s.campaignId)).toEqual([...new Set(ran)]);
    const drops = all.filter((e) => e.type === 'demandPlaced' && (e as { campaignId: string | null }).campaignId).length;
    expect(steps.reduce((n, s) => n + s.drops.length, 0)).toBe(drops);
  });
});

describe('lobbyist road spots', () => {
  it('groups both orientations of a road piece at one anchor', () => {
    const s = FIXTURES.ketchup();
    s.phase = { kind: 'working', player: 'p2', idx: s.turnOrder.indexOf('p2') };
    s.turn = { stage: 'recruit', uses: { 'p2-lob': 1 }, hired: [], mustTrain: [], trained: {}, campaignsPlaced: [], used: [], player: 'p2' };
    s.awaiting = { kind: 'work', players: ['p2'] };
    const ps: Placement[] = engine.legalPlacements(s, 'p2', { kind: 'lobbyistRoad', cardUid: 'p2-lob' });
    expect(ps.length).toBeGreaterThan(0);
    const { spots } = groupSpots(s.board, ps);
    for (const sp of spots) {
      const os = sp.variants.map(orientationOf);
      expect(new Set(os).size).toBe(os.length);
      expect(new Set(sp.variants.map((v) => (v.kind === 'lobbyistRoad' ? v.cells.length : 0))).size).toBe(1);
    }
    expect(spots.some((sp) => sp.variants.length === 2)).toBe(true);
    expect(spots.length).toBeLessThan(ps.length);
  });
});

describe('map tile ghost rotation', () => {
  it('turns tile cells clockwise like the engine (map.md §3)', () => {
    expect(rotateTileCell(0, 4, 1)).toEqual([4, 4]);
    expect(rotateTileCell(0, 0, 1)).toEqual([0, 4]);
    expect(rotateTileCell(1, 3, 4)).toEqual([1, 3]);
  });
});
