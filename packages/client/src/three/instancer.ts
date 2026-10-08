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
  /** Freed slots (may hold stale entries; `freeSet` is the truth). */
  private free: number[] = [];
  private freeSet = new Set<number>();
  /** Slots in use or free below the high-water mark; the mesh draws exactly this many. */
  private used = 0;
  /** Parked proxies that will want a slot again (the pool must outlive them). */
  parkedRefs = 0;

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
    let slot = -1;
    while (this.free.length) {
      const s = this.free.pop()!;
      if (this.freeSet.delete(s)) {
        slot = s;
        break;
      }
    }
    if (slot < 0) slot = this.used++;
    if (slot >= this.mesh.instanceMatrix.count) this.grow();
    this.mesh.count = this.used;
    return slot;
  }

  /** Free a slot; free slots at the top are dropped from the draw (no zero-scale vertex work). */
  release(slot: number): void {
    this.mesh.setMatrixAt(slot, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(slot);
    this.freeSet.add(slot);
    while (this.used > 0 && this.freeSet.has(this.used - 1)) this.freeSet.delete(--this.used);
    this.mesh.count = this.used;
  }

  /** No instance allocated and no parked proxy waiting for one. */
  get empty(): boolean {
    return this.used === 0 && this.parkedRefs === 0;
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
  private parked = false;
  constructor(private readonly pool: Pool) {
    super();
    this.slot = pool.alloc();
  }

  override updateMatrixWorld(force?: boolean): void {
    super.updateMatrixWorld(force);
    if (this.slot >= 0) this.pool.write(this.slot, this.visibleInScene() ? this.matrixWorld : ZERO);
  }

  /** Give the slot back while the owner is parked (pooled actors); `unpark` takes a slot again. */
  park(): void {
    if (this.slot < 0 || this.parked) return;
    this.pool.release(this.slot);
    this.slot = -1;
    this.parked = true;
    this.pool.parkedRefs++;
  }

  unpark(): void {
    if (!this.parked) return;
    this.parked = false;
    this.pool.parkedRefs--;
    this.slot = this.pool.alloc();
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
    if (this.parked) this.pool.parkedRefs--;
    this.parked = false;
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

  /** Drop pools with no instance left (a finished game's goods, chains and campaign sizes). */
  trim(): void {
    for (const [k, p] of this.pools)
      if (p.empty) {
        p.dispose();
        this.pools.delete(k);
      }
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
