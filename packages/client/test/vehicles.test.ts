import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Instancer } from '../src/three/instancer.js';
import { ActorPool, hasActor, type ActorKind } from '../src/three/anim/pool.js';
import { ROAD_Y } from '../src/three/anim/path.js';
import type { Stage } from '../src/three/scene.js';
import { ACTOR_FACTORIES, CARGO_SLOTS, vehicleOf, yawOf, type VehicleKind } from '../src/three/minis/vehicles.js';
import { PROP_FACTORIES, animateConfetti, animatePuff, animateRadioRings, type PropKind } from '../src/three/minis/props.js';
import '../src/three/minis/vehiclesActors.js';

const RED = '#d94f3d';

// Minimal canvas stub: blob shadows and decals draw canvas textures (never uploaded in node).
if (typeof document === 'undefined') {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
}

/** Triangles drawn for everything instanced so far (one actor per fresh Instancer). */
function tris(inst: Instancer): { tris: number; pools: number } {
  let t = 0;
  for (const m of inst.root.children as THREE.InstancedMesh[]) {
    const g = m.geometry;
    t += ((g.index ? g.index.count : g.attributes.position!.count) / 3) * m.count;
  }
  return { tris: t, pools: inst.root.children.length };
}

/** Per-kind triangle budgets (animation-plan §3 targets, raised for the chamfered kit primitives). */
const BUDGET: Record<VehicleKind, number> = { van: 900, scooter: 1100, cart: 1100, truck: 1100, zeppelin: 1000, airplane: 1100, mailman: 900 };

describe('vehicle actors', () => {
  for (const kind of Object.keys(ACTOR_FACTORIES) as VehicleKind[]) {
    it(`${kind}: contract, budget, motion`, () => {
      const inst = new Instancer();
      const a = ACTOR_FACTORIES[kind]({ inst }, { color: RED });
      const scene = new THREE.Scene();
      scene.add(inst.root, a.root);
      // Contract: body child of root, shadow a sibling of body, anchors under body.
      expect(a.root.getObjectByName('body')).toBe(a.body);
      expect(a.body.parent).toBe(a.root);
      const shadow = a.root.children.find((c) => c.name === 'shadow');
      expect(shadow).toBeTruthy();
      expect(a.body.getObjectByName('cargo')).toBe(a.cargo);
      expect(a.body.getObjectByName('drop')).toBe(a.drop);
      expect(vehicleOf(a.root)).toBe(a);
      expect(CARGO_SLOTS[kind].length).toBeGreaterThan(0);
      // Shadow stays on the ground under a flying root.
      a.root.position.set(3, 2.2, 4);
      scene.updateMatrixWorld(true);
      expect(shadow!.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(0.05);
      // Budget and draw calls: a handful of pools per actor.
      const { tris: t, pools } = tris(inst);
      expect(t).toBeGreaterThan(50);
      expect(t).toBeLessThanOrEqual(BUDGET[kind]);
      expect(pools).toBeLessThanOrEqual(6);
      // Driving 1 unit forward rolls the wheels / swings the legs; yaw change banks aircraft.
      a.body.rotation.y = yawOf(1, 0);
      a.root.position.set(0, ROAD_Y, 0);
      a.tick(0.016, 0);
      a.root.position.x = 0.05;
      a.body.rotation.y = 0.05;
      for (let i = 1; i <= 20; i++) {
        a.root.position.x = 0.05 * i;
        a.body.rotation.y = 0.05 * i;
        a.tick(0.016, i * 0.016);
      }
      const moved = a.rig.children.some((c) => c.rotation.z !== 0) || a.rig.rotation.x !== 0 || a.rig.getObjectByName('operator') !== undefined;
      expect(moved).toBe(true);
      a.reset();
      expect(a.rig.rotation.x).toBe(0);
      a.dispose();
    });
  }

  it('shares geometry across colours for wheels and legs, hull per colour', () => {
    const inst = new Instancer();
    for (const color of [RED, '#3f8fd2', '#4caf6a']) ACTOR_FACTORIES.van({ inst }, { color });
    const names = (inst.root.children as THREE.InstancedMesh[]).map((m) => m.name);
    expect(names.filter((n) => n.includes('v:wheel')).length).toBe(1);
    expect(names.filter((n) => n.includes('v:van:')).length).toBe(3);
  });

  it('lite build is a single instance per ground vehicle', () => {
    for (const kind of ['van', 'truck', 'scooter'] as const) {
      const inst = new Instancer();
      ACTOR_FACTORIES[kind]({ inst }, { color: RED, lite: true });
      expect(inst.stats().instances).toBe(1);
    }
  });
});

describe('props', () => {
  it('every prop builds with a body and animates without throwing', () => {
    const inst = new Instancer();
    for (const kind of Object.keys(PROP_FACTORIES) as PropKind[]) {
      const p = PROP_FACTORIES[kind]({ inst }, { color: RED, good: 'lemonade' });
      expect(p.getObjectByName('body')).toBeTruthy();
      for (const k of [0, 0.3, 0.7, 1]) {
        if (kind === 'steam' || kind === 'dust') animatePuff(p, k);
        if (kind === 'confetti') animateConfetti(p, k);
        if (kind === 'radioRings') animateRadioRings(p, k, 1.5);
      }
    }
  });
});

describe('actor pool round trip', () => {
  it('registers every pool kind and recycles without growth', () => {
    const inst = new Instancer();
    const overlay = new THREE.Group();
    const stage = { inst, overlay, invalidate() {} } as unknown as Stage;
    const pool = new ActorPool(stage);
    const kinds: ActorKind[] = ['van', 'scooter', 'cart', 'truck', 'zeppelin', 'airplane', 'crate', 'envelope', 'leaflet', 'puff', 'confetti', 'ghostToken'];
    for (const k of kinds) expect(hasActor(k)).toBe(true);
    const cycle = () => {
      const got = kinds.map((k) => pool.get(k, RED, k === 'crate' ? 'beer' : null));
      for (const o of got) pool.release(o);
    };
    cycle();
    const before = { ...inst.stats(), ...pool.stats() };
    for (let i = 0; i < 100; i++) cycle();
    expect({ ...inst.stats(), ...pool.stats() }).toEqual(before);
    expect(pool.stats().live).toBe(0);
  });
});
