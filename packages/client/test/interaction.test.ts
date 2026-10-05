/**
 * WP3 interaction model: campaign spot grouping, board modes, previews and the selection rules of
 * the board bridge. Runs on the engine's working fixture (p2 is in the marketing step).
 */
import { describe, expect, it } from 'vitest';
import { engine, type GameState, type LegalAction, type Placement } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { groupSpots, orientationOf } from '../src/three/spots.js';
import { boardModeFor, candidateAt, problemAt, rangeFor, reachFor } from '../src/state/guidance.js';
import { boardBridge, emitPick, interactionMode } from '../src/state/boardBridge.js';
import { activeCandidate, selection } from '../src/state/interaction.js';
import { describePlacement } from '../src/state/actions.js';
import type { GameView } from '@fcm/engine';

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

function toView(s: GameState, me: string): GameView {
  return engine.redactFor(s, me);
}

/** Working fixture with p2's errand boy turned into a cart operator (road range 2). */
function workingWithCart(): GameState {
  const s = FIXTURES.working();
  s.players.p2!.employees['p2-eb']!.employeeId = 'cart_operator';
  return s;
}

const campaignLegal = (s: GameState): PlacementLegal => {
  const l = engine.legalActions(s, 'p2').find((a): a is PlacementLegal => a.kind === 'placement' && a.spec.kind === 'campaign');
  if (!l) throw new Error('no campaign action');
  return l;
};

describe('campaign spots', () => {
  const s = FIXTURES.working();
  const legal = campaignLegal(s);
  const ps = engine.legalPlacements(s, 'p2', legal.spec);

  it('keys spots by anchor + tile number with one variant per orientation', () => {
    const { spots, of } = groupSpots(s.board, ps);
    expect(spots.length).toBeGreaterThan(0);
    for (const sp of spots) {
      expect(sp.key).toMatch(/^campaign:(\d+,\d+|air|rural|off).*#\d+$/);
      const os = sp.variants.map(orientationOf);
      expect(new Set(os).size).toBe(os.length);
      const nums = new Set(sp.variants.map((v) => (v.kind === 'campaign' ? v.tileNumber : -1)));
      expect(nums.size).toBe(1);
    }
    expect(spots.some((sp) => sp.variants.length === 2)).toBe(true);
    for (const p of ps) expect(of.get(p)).toBeDefined();
  });

  it('campaign mode narrows to the chosen token and carries the spec', () => {
    const n = (ps[0] as Extract<Placement, { kind: 'campaign' }>).tileNumber;
    const mode = boardModeFor(legal, ps, { color: '#f00', tileNumber: n });
    expect(mode.kind).toBe('campaign');
    if (mode.kind !== 'campaign') return;
    expect(mode.placements.every((p) => p.tileNumber === n)).toBe(true);
    expect(mode.spec?.tileNumber).toBe(n);
    expect(mode.spec?.cardUid).toBe(legal.cardUid ?? legal.spec.cardUid);
  });

  it('previews range, reach and the reason a square is illegal', () => {
    const v = toView(s, 'p2');
    const range = rangeFor(v, 'p2', { ...legal.spec, cardUid: legal.cardUid ?? legal.spec.cardUid });
    expect(range?.range).toBe(2);
    expect(range?.roads.length).toBeGreaterThan(0);
    const reach = reachFor(v, 'p2', ps[0]!, 'burger');
    expect(reach).not.toBeNull();
    const mode = boardModeFor(legal, ps, { color: '#f00' });
    // A square under a restaurant is never a legal billboard spot.
    const r = Object.values(s.board.restaurants)[0]!;
    const cand = candidateAt(mode, { x: r.x, y: r.y }, 'landscape');
    expect(cand?.kind).toBe('campaign');
    expect(problemAt(v, 'p2', mode.kind === 'campaign' ? mode.spec! : legal.spec, cand!)).toBeTruthy();
  });

  it('describes campaign spots with size and orientation', () => {
    const p = ps.find((x) => x.kind === 'campaign' && x.placement.kind === 'board')!;
    expect(describePlacement(p)).toMatch(/^Tile #\d+ · \d×\d at \d+,\d+/);
  });
});

describe('route mode', () => {
  const s = workingWithCart();
  const legal = engine.legalActions(s, 'p2').find((a): a is PlacementLegal => a.kind === 'placement' && a.spec.kind === 'buyerRoute' && a.cardUid === 'p2-eb');

  it('builds a route mode from road routes', () => {
    expect(legal).toBeDefined();
    const ps = engine.legalPlacements(s, 'p2', legal!.spec);
    expect(ps.length).toBeGreaterThan(0);
    const mode = boardModeFor(legal!, ps, { color: '#0af' });
    expect(mode.kind).toBe('route');
    const v = toView(s, 'p2');
    expect(describePlacement(ps[0]!, v)).toMatch(/borders$/);
  });

  it('entering route mode clears the selection and activates the first candidate', () => {
    const ps = engine.legalPlacements(s, 'p2', legal!.spec);
    boardBridge.setView(toView(s, 'p2'), 'p2', []);
    selection.value = { kind: 'house', id: Object.keys(s.board.houses)[0]! };
    boardBridge.setInteractionMode(boardModeFor(legal!, ps, { color: '#0af' }));
    expect(interactionMode.value.kind).toBe('route');
    expect(selection.value).toBeNull();
    expect(activeCandidate.value).toBe(0);
    boardBridge.setInteractionMode({ kind: 'idle' });
    expect(activeCandidate.value).toBe(-1);
  });
});

describe('selection', () => {
  it('idle object picks select the piece; picks while placing are ignored', () => {
    const s = FIXTURES.working();
    boardBridge.setView(toView(s, 'p2'), 'p2', []);
    boardBridge.setInteractionMode({ kind: 'idle' });
    const house = Object.keys(s.board.houses)[0]!;
    emitPick({ kind: 'object', id: house, objectKind: 'house' });
    expect(selection.value).toEqual({ kind: 'house', id: house });
    const rest = Object.keys(s.board.restaurants)[0]!;
    emitPick({ kind: 'object', id: rest });
    expect(selection.value).toEqual({ kind: 'restaurant', id: rest });
    const legal = campaignLegal(s);
    boardBridge.setInteractionMode(boardModeFor(legal, engine.legalPlacements(s, 'p2', legal.spec), { color: '#f00' }));
    expect(selection.value).toBeNull();
    emitPick({ kind: 'object', id: house });
    expect(selection.value).toBeNull();
    boardBridge.setInteractionMode({ kind: 'idle' });
  });
});
