/** Path follower (animation-plan §4.3, §4.5): lane side, rounded corners, arc length, yaw. */
import { describe, expect, it } from 'vitest';
import { airPath, CORNER, LANE, roadPath, tripDuration, tripEase } from '../src/three/anim/path.js';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('roadPath', () => {
  it('straight east: lane on the right (south, +z), yaw 0, length = distance', () => {
    const f = roadPath([
      [0, 0],
      [4, 0],
    ]);
    expect(f.length).toBeCloseTo(4, 6);
    const a = f.at(0);
    const b = f.at(f.length);
    expect([a.x, a.z]).toEqual([0, LANE]);
    expect(b.x).toBeCloseTo(4, 6);
    expect(b.z).toBeCloseTo(LANE, 6);
    expect(close(a.yaw, 0)).toBe(true);
  });

  it('heading north drives on the east side; yaw points the +x nose up the board', () => {
    const f = roadPath([
      [0, 4],
      [0, 0],
    ]);
    const p = f.at(1);
    expect(p.x).toBeCloseTo(LANE, 6);
    expect(p.yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it('an L turn is rounded (shorter than the sharp offset corner) and yaw turns through the corner', () => {
    // East 3, then south 3: a right turn; the inner lane corner sits at (3 - LANE, LANE).
    const f = roadPath([
      [0, 0],
      [3, 0],
      [3, 3],
    ]);
    const sharp = 3 - LANE + (3 - LANE);
    expect(f.length).toBeLessThan(sharp);
    expect(f.length).toBeGreaterThan(sharp - 2 * CORNER);
    const start = f.at(0);
    const end = f.at(f.length);
    expect([start.x, start.z]).toEqual([0, LANE]);
    expect(end.x).toBeCloseTo(3 - LANE, 6);
    expect(end.z).toBeCloseTo(3, 6);
    expect(start.yaw).toBeCloseTo(0, 6);
    expect(end.yaw).toBeCloseTo(-Math.PI / 2, 6);
    // Halfway through the corner the heading is diagonal (south-east).
    const mid = f.at(f.nearest(3 - LANE - 0.09, LANE + 0.09));
    expect(mid.yaw).toBeLessThan(-0.3);
    expect(mid.yaw).toBeGreaterThan(-Math.PI / 2 + 0.3);
  });

  it('at() clamps, writes into out, and nearest() finds arc lengths', () => {
    const f = roadPath(
      [
        [0, 0],
        [2, 0],
      ],
      { lane: 0 },
    );
    const out = { x: 0, z: 0, yaw: 0 };
    expect(f.at(-1, out)).toBe(out);
    expect(out.x).toBe(0);
    expect(f.at(99).x).toBeCloseTo(2, 6);
    expect(f.nearest(1.02, 0.5)).toBeCloseTo(1, 1);
  });

  it('degenerate input gives a zero-length follower', () => {
    const f = roadPath([[1, 1]]);
    expect(f.length).toBe(0);
    expect(f.at(0.5)).toMatchObject({ x: 1, z: 1 });
  });
});

describe('airPath and timing', () => {
  it('passes through every waypoint at its height', () => {
    const pts: [number, number][] = [
      [0, 0],
      [5, 0],
      [5, 5],
    ];
    const f = airPath(pts, 2.2);
    expect(f.y).toBe(2.2);
    for (const [x, z] of pts) {
      const p = f.at(f.nearest(x, z));
      expect(Math.hypot(p.x - x, p.z - z)).toBeLessThan(0.06);
    }
  });

  it('tripDuration clamps to 0.45–1.4 s; tripEase runs 0 → 1 monotonically', () => {
    expect(tripDuration(0)).toBe(0.45);
    expect(tripDuration(100)).toBe(1.4);
    expect(tripDuration(2.25)).toBeCloseTo(0.75, 6);
    const e = tripEase(1);
    let last = 0;
    for (let i = 0; i <= 20; i++) {
      const v = e(i / 20);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      last = v;
    }
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
  });
});
