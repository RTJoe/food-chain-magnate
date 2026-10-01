/**
 * Automatic instancing. A mini adds an `InstanceProxy` (a plain Object3D) where it would add a
 * mesh; the proxy writes its world matrix into a shared `InstancedMesh` slot every frame. Tweens
 * and parenting work as usual, but N houses (or tokens, trees...) cost one draw call per geometry.
 */
import * as THREE from 'three';
import { materialsFor } from './minis/kit.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class Pool {
  mesh: THREE.InstancedMesh;
  private free: number[] = [];
  private used = 0;

  constructor(
    readonly key: string,
    private readonly geo: THREE.BufferGeometry,
    private readonly material: THREE.Material | THREE.Material[],
    private readonly parent: THREE.Object3D,
    readonly castShadow: boolean,
    cap = 16,
  ) {
    this.mesh = this.make(cap);
    parent.add(this.mesh);
  }

  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.material, cap);
    m.name = `inst:${this.key}`;
    m.frustumCulled = false;
    m.castShadow = this.castShadow;
    m.receiveShadow = true;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) m.setMatrixAt(i, ZERO);
    return m;
  }

  alloc(): number {
    const slot = this.free.pop() ?? this.used++;
    if (slot >= this.mesh.instanceMatrix.count) this.grow();
    this.mesh.count = Math.max(this.mesh.count, slot + 1);
    return slot;
  }

  release(slot: number): void {
    this.mesh.setMatrixAt(slot, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(slot);
  }

  private grow(): void {
    const old = this.mesh;
    const next = this.make(old.instanceMatrix.count * 2);
    (next.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    next.count = old.count;
    next.castShadow = old.castShadow;
    this.parent.remove(old);
    old.dispose();
    this.parent.add(next);
    this.mesh = next;
  }

  write(slot: number, m: THREE.Matrix4): void {
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const o = slot * 16;
    const e = m.elements;
    let same = true;
    for (let i = 0; i < 16; i++) {
      if (arr[o + i] !== e[i]) {
        same = false;
        break;
      }
    }
    if (same) return;
    arr.set(e, o);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}

export class InstanceProxy extends THREE.Object3D {
  private slot: number;
  constructor(private readonly pool: Pool) {
    super();
    this.slot = pool.alloc();
  }

  override updateMatrixWorld(force?: boolean): void {
    super.updateMatrixWorld(force);
    this.pool.write(this.slot, this.visibleInScene() ? this.matrixWorld : ZERO);
  }

  private visibleInScene(): boolean {
    let o: THREE.Object3D | null = this;
    while (o) {
      if (!o.visible) return false;
      if ((o as THREE.Scene).isScene) return true;
      o = o.parent;
    }
    return false; // detached
  }

  /** Free the slot. Call when the owning mini is removed. */
  release(): void {
    if (this.slot < 0) return;
    this.pool.release(this.slot);
    this.slot = -1;
    this.updateMatrixWorld = () => {};
  }
}

export class Instancer {
  private pools = new Map<string, Pool>();
  readonly root = new THREE.Group();
  private shadows = true;

  constructor() {
    this.root.name = 'instances';
  }

  /** A proxy for one instance of `geo` (pooled by `geo.userData.key ?? geo.uuid`). */
  proxy(geo: THREE.BufferGeometry, opts: { castShadow?: boolean; material?: THREE.Material | THREE.Material[] } = {}): InstanceProxy {
    const key = `${(geo.userData.key as string | undefined) ?? geo.uuid}|${opts.material ? (Array.isArray(opts.material) ? opts.material.map((m) => m.uuid).join() : opts.material.uuid) : ''}`;
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new Pool(key, geo, opts.material ?? materialsFor(geo), this.root, opts.castShadow ?? true, 16);
      pool.mesh.castShadow = this.shadows && pool.castShadow;
      this.pools.set(key, pool);
    }
    const p = new InstanceProxy(pool);
    p.name = 'proxy';
    return p;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const p of this.pools.values()) p.mesh.castShadow = on && p.castShadow;
  }

  stats(): { pools: number; instances: number } {
    let instances = 0;
    for (const p of this.pools.values()) instances += p.mesh.count;
    return { pools: this.pools.size, instances };
  }

  dispose(): void {
    for (const p of this.pools.values()) p.dispose();
    this.pools.clear();
  }
}
