/**
 * What a mini builder gets: where to put instanced parts, and helpers for the few non-instanced
 * pieces (textured faces, badges, contact shadows). Ghost builds swap every material for a
 * translucent tint and never instance.
 */
import * as THREE from 'three';
import type { Instancer } from '../instancer.js';
import { InstanceProxy } from '../instancer.js';
import { blobTexture, squareBlobTexture } from '../labels.js';
import { materialsFor } from './kit.js';

export interface MiniCtx {
  inst: Instancer;
  /** Ghost material (placement preview). When set, nothing is instanced and nothing casts shadows. */
  ghost?: THREE.Material;
}

/** Add a solid part (instanced unless ghosting). */
export function solid(ctx: MiniCtx, parent: THREE.Object3D, geo: THREE.BufferGeometry, opts: { castShadow?: boolean } = {}): THREE.Object3D {
  let o: THREE.Object3D;
  if (ctx.ghost) {
    o = new THREE.Mesh(geo, ctx.ghost);
  } else {
    o = ctx.inst.proxy(geo, { castShadow: opts.castShadow ?? true });
  }
  parent.add(o);
  return o;
}

/** A flat textured quad (poster face, sign). Faces +z unless rotated by the caller. */
export function face(ctx: MiniCtx, parent: THREE.Object3D, tex: THREE.Texture, w: number, h: number, glow = false): THREE.Mesh {
  const mat = ctx.ghost ?? faceMat(tex, glow);
  const m = new THREE.Mesh(quad(), mat);
  m.scale.set(w, h, 1);
  parent.add(m);
  return m;
}

let quadGeo: THREE.PlaneGeometry | null = null;
function quad(): THREE.PlaneGeometry {
  return (quadGeo ??= new THREE.PlaneGeometry(1, 1));
}

const faceMats = new Map<string, THREE.Material>();
function faceMat(tex: THREE.Texture, glow: boolean): THREE.Material {
  const k = `${tex.uuid}:${glow}`;
  let m = faceMats.get(k);
  if (!m) {
    m = glow
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0, envMapIntensity: 0.5 });
    faceMats.set(k, m);
  }
  return m;
}

/** Soft contact shadow under a mini (instanced). `square` for boxy footprints. */
export function blob(ctx: MiniCtx, parent: THREE.Object3D, w: number, d: number, square = false, strength = 1): void {
  if (ctx.ghost) return;
  const geo = blobGeo(square, strength);
  const p = ctx.inst.proxy(geo, { castShadow: false, material: blobMat(square, strength) });
  p.position.y = 0.006;
  p.scale.set(w, 1, d);
  parent.add(p);
}

const blobGeos = new Map<string, THREE.BufferGeometry>();
function blobGeo(square: boolean, strength: number): THREE.BufferGeometry {
  const k = `blob:${square}:${strength}`;
  let g = blobGeos.get(k);
  if (!g) {
    g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.userData.key = k;
    blobGeos.set(k, g);
  }
  return g;
}
const blobMats = new Map<string, THREE.Material>();
function blobMat(square: boolean, strength: number): THREE.Material {
  const k = `${square}:${strength}`;
  let m = blobMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: square ? squareBlobTexture() : blobTexture(),
      color: 0x2a2018,
      transparent: true,
      opacity: 0.38 * strength,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    blobMats.set(k, m);
  }
  return m;
}

/** Plain mesh for animated sub-parts that must move independently of instancing. */
export function mesh(ctx: MiniCtx, parent: THREE.Object3D, geo: THREE.BufferGeometry, castShadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, ctx.ghost ?? materialsFor(geo));
  m.castShadow = !ctx.ghost && castShadow;
  m.receiveShadow = !ctx.ghost;
  parent.add(m);
  return m;
}

/** Mark a per-mini geometry/material so `releaseTree` disposes it (shared caches are never disposed). */
export function owned<T extends THREE.BufferGeometry | THREE.Material>(x: T): T {
  x.userData.owned = true;
  return x;
}

/** Release instanced slots and owned GPU resources held by an object tree (call before dropping a mini). */
export function releaseTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof InstanceProxy) o.release();
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (m.geometry?.userData.owned) m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat?.userData.owned) mat.dispose();
    }
  });
}
