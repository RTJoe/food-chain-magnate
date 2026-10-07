/**
 * Printed locations on the map tiles (docs/art-bible.md §5 "Printed locations"): magenta house and
 * apartment plates, green garden and park plates, and the printed drink suppliers. They lie flat
 * on the tile print under the minis (one merged mesh, one atlas texture), so a mini's margin and
 * any square it does not cover show the print, as on the real tiles.
 */
import * as THREE from 'three';
import type { Board, Cell } from '@fcm/engine';
import { plateAtlas, plateUV, type PlateKind } from './textures.js';

/** Just above the tile print, below roads (ROAD_TOP) and the seam line. */
const DECAL_Y = 0.006;
const INSET = 0.03;

interface Quad {
  kind: PlateKind;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Turn the art a quarter (tall gardens). */
  turn: boolean;
}

function bounds(cells: readonly Cell[]): { x0: number; z0: number; x1: number; z1: number } | null {
  if (!cells.length) return null;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    z0 = Math.min(z0, c.y);
    x1 = Math.max(x1, c.x + 1);
    z1 = Math.max(z1, c.y + 1);
  }
  return { x0, z0, x1, z1 };
}

export function plateQuads(b: Board): Quad[] {
  const out: Quad[] = [];
  const add = (kind: PlateKind, r: { x0: number; z0: number; x1: number; z1: number } | null) => {
    if (!r) return;
    out.push({ kind, x0: r.x0 + INSET, z0: r.z0 + INSET, x1: r.x1 - INSET, z1: r.z1 - INSET, turn: kind === 'garden' && r.z1 - r.z0 > r.x1 - r.x0 });
  };
  for (const h of Object.values(b.houses)) {
    if (h.kind === 'rural') continue;
    add(h.kind === 'apartment' ? 'apartment' : 'house', bounds(h.cells));
    if (h.garden) add('garden', bounds(h.garden.cells));
  }
  for (const e of Object.values(b.entities)) {
    if (e.kind !== 'park') continue;
    if (e.cells?.length) for (const c of e.cells) add('park', { x0: c.x, z0: c.y, x1: c.x + 1, z1: c.y + 1 });
    else add('park', { x0: e.x, z0: e.y, x1: e.x + e.w, z1: e.y + e.h });
  }
  for (const s of Object.values(b.drinkSources)) {
    const k: PlateKind = s.drink === 'beer' ? 'beer' : s.drink === 'lemonade' ? 'lemonade' : 'soft_drink';
    add(k, { x0: s.x, z0: s.y, x1: s.x + 1, z1: s.y + 1 });
  }
  return out;
}

let material: THREE.MeshStandardMaterial | null = null;
function decalMaterial(): THREE.MeshStandardMaterial {
  material ??= new THREE.MeshStandardMaterial({
    map: plateAtlas(),
    roughness: 0.8,
    metalness: 0,
    envMapIntensity: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return material;
}

/**
 * The plates as one mesh. Returned as a single-instance InstancedMesh because the reconciler keeps
 * this layer as one (its `dispose` frees the merged geometry too).
 */
export function buildPlateDecals(b: Board): THREE.InstancedMesh | null {
  const quads = plateQuads(b);
  if (!quads.length) return null;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const q of quads) {
    const [u0, v0, u1, v1] = plateUV(q.kind);
    const base = pos.length / 3;
    // NW, NE, SE, SW corners; v up = north.
    const corners: [number, number][] = [
      [q.x0, q.z0],
      [q.x1, q.z0],
      [q.x1, q.z1],
      [q.x0, q.z1],
    ];
    const uvs: [number, number][] = q.turn
      ? [
          [u0, v1],
          [u0, v0],
          [u1, v0],
          [u1, v1],
        ]
      : [
          [u0, v1],
          [u1, v1],
          [u1, v0],
          [u0, v0],
        ];
    corners.forEach(([x, z], i) => {
      pos.push(x, DECAL_Y, z);
      nor.push(0, 1, 0);
      uv.push(...uvs[i]!);
    });
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.InstancedMesh(geo, decalMaterial(), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'plates';
  const base = mesh.dispose.bind(mesh);
  mesh.dispose = () => {
    geo.dispose();
    return base();
  };
  return mesh;
}
