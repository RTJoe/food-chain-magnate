import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Board } from '@fcm/engine';
import { Instancer } from '../src/three/instancer.js';
import { MAST_TOP, MX, MZ, addCampaignMarker, mailboxShape, radioShape } from '../src/three/minis/marketing.js';
import { BADGE_MIN_PX } from '../src/three/labels.js';
import { BRIDGE_TOP, bridgeLift, roadLinks } from '../src/three/board/roads.js';
import { ROAD_TOP } from '../src/three/coords.js';

// Minimal canvas stub: badges draw canvas textures (never uploaded in node).
if (typeof document === 'undefined') {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 128, height: 128, getContext: () => ctx2d }) };
}

describe('campaign minis', () => {
  it('mailbox stays inside its 1x1 footprint at its board yaw', () => {
    const g = mailboxShape().build();
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2 + 0.3));
    g.computeBoundingBox();
    const b = g.boundingBox!;
    for (const v of [b.min.x, b.min.z, b.max.x, b.max.z]) expect(Math.abs(v)).toBeLessThan(0.45);
  });

  it('radio mast tapers to a narrow top under the beacon and stays on its plate', () => {
    const g = radioShape().build();
    const pos = g.attributes.position!;
    let top = 0;
    let foot = 0;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i) - MX, pos.getZ(i) - MZ);
      if (pos.getY(i) > MAST_TOP - 0.1 && pos.getY(i) < MAST_TOP) top = Math.max(top, d);
      expect(Math.abs(pos.getX(i))).toBeLessThan(0.45);
      expect(Math.abs(pos.getZ(i))).toBeLessThan(0.45);
      if (pos.getY(i) < 0.1) foot = Math.max(foot, d);
    }
    expect(top).toBeLessThan(0.13);
    expect(foot).toBeGreaterThan(0.3);
  });

  it('campaign marker keeps a minimum on-screen size and pushes plaques away', () => {
    const parent = new THREE.Group();
    addCampaignMarker({ inst: new Instancer() }, parent, { color: '#e8b730', goods: ['beer'], number: 7, remaining: 2, eternal: false }, 1.5, [0, 0]);
    const badge = parent.getObjectByName('badge')!;
    expect(badge.userData.minPx).toBe(BADGE_MIN_PX);
    expect(badge.userData.obstacle).toBe(true);
  });
});

describe('roads', () => {
  // Two road squares touching across a tile border (x 4 | x 5), not at the midpoint, plus a bridge row.
  const cell = (road: object | null) => ({ kind: 'empty', tile: 't', occupant: null, road });
  const cells = Array.from({ length: 5 }, () => Array.from({ length: 10 }, () => cell(null)));
  cells[0]![4] = cell({ links: ['S'] });
  cells[0]![5] = cell({ links: ['S'] });
  cells[2]![3] = cell({ links: ['E', 'W'] });
  cells[2]![4] = cell({ links: ['N', 'E', 'S', 'W'], bridge: true });
  cells[2]![5] = cell({ links: ['E', 'W'] });
  cells[2]![6] = cell({ links: ['E', 'W'] });
  const b = { w: 10, h: 5, tileSize: 5, cells } as unknown as Board;

  it('connects every pair of adjacent road squares, across tile borders too', () => {
    expect(roadLinks(b, 4, 0)).toEqual(['E']);
    expect(roadLinks(b, 5, 0)).toEqual(['W']);
  });

  it('lifts upper-road traffic over an overpass and leaves the rest on the ground', () => {
    expect(bridgeLift(b, 4.5, 2.5)).toBeCloseTo(BRIDGE_TOP - ROAD_TOP);
    expect(bridgeLift(b, 5.5, 2.5)).toBeCloseTo((BRIDGE_TOP - ROAD_TOP) / 2);
    expect(bridgeLift(b, 8.5, 2.5)).toBe(0);
    expect(bridgeLift(b, 4.5, 0.5)).toBe(0);
  });
});

describe('edge pieces on a grown board', () => {
  it('airplanes and freeways sit against the outermost real tile, not the bounding box', async () => {
    const { campaignAnchor, edgeGap, freewayAnchor } = await import('../src/three/layout.js');
    // 10 x 5 board: the east half of the board is an empty slot (tile '') on rows 0-4.
    const cells = Array.from({ length: 5 }, () => Array.from({ length: 10 }, (_, x) => ({ tile: x < 5 ? 'A' : '', kind: 'empty' })));
    const b = { w: 10, h: 5, cells, tiles: [], entities: {}, houses: {} } as unknown as Parameters<typeof edgeGap>[0];
    expect(edgeGap(b, 'E', 2)).toBe(5);
    expect(edgeGap(b, 'W', 2)).toBe(0);
    expect(edgeGap(b, 'N', 7)).toBe(0); // a fully empty column keeps the board edge
    expect(freewayAnchor(b, 'E', 2).x).toBe(5);
    // Lengthwise: centred one square out, along rows 1-3.
    expect(freewayAnchor(b, 'E', 1, true)).toMatchObject({ x: 5.5, z: 2.5 });
    const plane = campaignAnchor(b, { kind: 'airplane', side: 'E', offset: 1, width: 3 });
    expect(plane.x).toBeCloseTo(5 + 1.7);
  });
});

describe('freeway signs (M096)', () => {
  it('every freeway points the way to the rural area', async () => {
    const { freewayTurn } = await import('../src/three/layout.js');
    const b = (sides: string[]) => ({ w: 10, h: 10, entities: Object.fromEntries(sides.map((side, i) => [`f${i}`, { kind: 'freeway', id: `f${i}`, side, offset: 2 }])) }) as never;
    expect(freewayTurn(b(['E']), 'E')).toBe('ahead');
    expect(freewayTurn(b(['E', 'N']), 'N')).toBe('right');
    expect(freewayTurn(b(['E', 'S']), 'S')).toBe('left');
    expect(freewayTurn(b(['E', 'W']), 'W')).toBe('right');
  });
});
