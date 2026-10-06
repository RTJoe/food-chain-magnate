/**
 * WP-D wiring (animation-plan §5): every board-piece / phase beat kind has a choreography, and the
 * overlay's cash claims hold a counter until the board settles it (state/motion.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameView } from '@fcm/engine';
import { registry, type BeatKind } from '../src/three/anim/index.js';
import { cashClaims, cashPulse, clearCashClaims, motionBatch, onBeforeMotion, publishMotion, settleCash } from '../src/state/motion.js';
import { finishAnimations } from '../src/state/interaction.js';

const WPD: BeatKind[] = [
  'restaurantPlaced', 'restaurantMoved', 'restaurantOpened', 'driveIns', 'houseBuilt', 'gardenAdded', 'campaignPlaced',
  'entityPlaced', 'entityRemoved', 'mapTile', 'bankrupt', 'gameStarted', 'turn', 'phase', 'produce', 'discard', 'tips',
  'salary', 'milestone', 'bankBroke', 'gameEnded',
];

describe('WP-D choreographies', () => {
  it('registers a choreography for every board-piece and phase beat kind', () => {
    for (const k of WPD) expect(registry.has(k), k).toBe(true);
  });
});

describe('cash claims', () => {
  afterEach(() => {
    clearCashClaims();
    vi.useRealTimers();
  });
  const view = {} as GameView;
  const pay: GameEvent[] = [
    { type: 'tipsPaid', player: 'p1', waitresses: 1, amount: 3 },
    { type: 'salaryPaid', player: 'p1', gross: 10, discounts: 0, paid: 10 },
    { type: 'salaryPaid', player: 'p2', gross: 0, discounts: 0, paid: 0 },
  ];

  it('claims tips and salaries when the 3D board animates, and settles them one by one', () => {
    publishMotion(null, view, pay, true);
    expect(cashClaims.value).toEqual({ p1: -7 });
    settleCash('p1', 3);
    expect(cashClaims.value).toEqual({ p1: -10 });
    expect(cashPulse.value).toMatchObject({ player: 'p1', delta: 3 });
    settleCash('p1', -10);
    expect(cashClaims.value).toEqual({});
  });

  it('claims nothing without the 3D board, and a snapshot or Skip releases everything', () => {
    publishMotion(null, view, pay, false);
    expect(cashClaims.value).toEqual({});
    publishMotion(null, view, pay, true);
    publishMotion(view, {} as GameView, [], true);
    expect(cashClaims.value).toEqual({});
    publishMotion(null, view, pay, true);
    finishAnimations();
    expect(cashClaims.value).toEqual({});
  });

  it('expires claims the board never settles', () => {
    vi.useFakeTimers();
    publishMotion(null, view, pay, true);
    vi.advanceTimersByTime(6000);
    expect(cashClaims.value).toEqual({});
  });

  it('runs before-hooks synchronously, then publishes the batch', () => {
    const seen: number[] = [];
    const stop = onBeforeMotion((b) => seen.push(b.n));
    publishMotion(null, view, [{ type: 'roundStarted', round: 2 }]);
    stop();
    expect(seen).toEqual([motionBatch.value!.n]);
    expect(motionBatch.value!.events[0]).toMatchObject({ type: 'roundStarted' });
  });
});
