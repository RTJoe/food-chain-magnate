/** Freeway ramp height, fx restore channels, camera framing key (rural side). */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import { describe, expect, it } from 'vitest';
import { baseOf, restore } from '../src/three/anim/choreos/fx.js';
import { FREEWAY, freewayGround, freewayY, roadPath, ROAD_Y, withHeight } from '../src/three/anim/path.js';
import { boardFrameKey } from '../src/three/layout.js';

describe('freeway height', () => {
  it('climbs the deck, stays on the platform, drops on to the rural tile', () => {
    expect(freewayY(-1)).toBe(ROAD_Y);
    expect(freewayY(1.6)).toBeGreaterThan(0.5);
    const top = freewayY(FREEWAY.run + 0.05);
    expect(top).toBeCloseTo(ROAD_Y + FREEWAY.rise + 0.02, 6);
    expect(freewayY(FREEWAY.run + FREEWAY.platform - 0.1)).toBeCloseTo(top, 6);
    expect(freewayY(10)).toBeLessThan(0.2);
  });

  it('withHeight follows the ground under the path', () => {
    // North exit: edge at z = 0, heading -z.
    const f = withHeight(roadPath([[0.5, 2], [0.5, -5]]), freewayGround([0.5, 0], [0, -1]));
    expect(f.yAt!(0)).toBe(ROAD_Y);
    expect(f.yAt!(2 + FREEWAY.run + 0.4)).toBeCloseTo(freewayY(FREEWAY.run + 0.4), 3);
  });
});

describe('fx restore', () => {
  it('puts back height, rotation and scale but keeps a re-based x / z', () => {
    const o = new THREE.Object3D();
    o.position.set(2.5, 0.1, 0.5);
    const b = baseOf(o);
    o.position.set(2.5, 1.3, 5.5); // mid drop, then the board grew north by 5
    o.scale.setScalar(0.4);
    restore(o, b);
    expect(o.position.toArray()).toEqual([2.5, 0.1, 5.5]);
    expect(o.scale.x).toBe(1);
  });
});

describe('boardFrameKey', () => {
  const board = (fw: boolean) =>
    ({
      w: 9,
      h: 9,
      tiles: [{ id: 'A' }],
      houses: { r: { id: 'r', kind: 'rural', cells: [] } },
      entities: fw ? { f: { id: 'f', kind: 'freeway', side: 'N', offset: 0 } } : {},
      campaigns: {},
    }) as unknown as Board;
  it('changes with the rural side, not the grid', () => {
    const a = boardFrameKey(board(false));
    const b = boardFrameKey(board(true));
    expect(a.rural).toBe('E');
    expect(b.rural).toBe('N');
    expect(a.grid).toBe(b.grid);
    expect(a.key).not.toBe(b.key);
  });
});
