/**
 * Mini construction kit: chamfered primitives, a `Shape` builder that merges parts into one
 * vertex-coloured, flat-shaded geometry (one draw call per mini), shared materials and caches.
 *
 * Conventions: primitives are bottom-aligned (y = 0 at their base) unless noted. A mini's origin is
 * the centre of its footprint on the ground; its front faces +z (south).
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, PLAYER_COLORS, hex } from '../../theme.js';

export type MatKind = 'body' | 'glass' | 'glow' | 'metal';
const MAT_ORDER: MatKind[] = ['body', 'glass', 'glow', 'metal'];

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

export type Paint = string | number | THREE.Color;

export function color(c: Paint): THREE.Color {
  if (c instanceof THREE.Color) return c.clone();
  if (typeof c === 'number') return new THREE.Color(c);
  return new THREE.Color(c.startsWith('#') ? hex(c) : (COLORS as Record<string, string>)[c] ?? c);
}

/** Mix towards white (t > 0) or black (t < 0). */
export function shade(c: Paint, t: number): THREE.Color {
  const out = color(c);
  return t >= 0 ? out.lerp(new THREE.Color(1, 1, 1), t) : out.lerp(new THREE.Color(0, 0, 0), -t);
}

/** Player palette entry for a CSS colour (falls back to a generated dark/light pair). */
export function playerPalette(css: string): { base: string; dark: string; light: string } {
  const p = PLAYER_COLORS.find((c) => c.base.toLowerCase() === css.toLowerCase());
  if (p) return p;
  return { base: css, dark: `#${shade(css, -0.35).getHexString()}`, light: `#${shade(css, 0.7).getHexString()}` };
}

// ---------------------------------------------------------------------------
// Primitives (cached by parameters; never mutate the returned geometry)
// ---------------------------------------------------------------------------

const primCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = primCache.get(key);
  if (!g) {
    g = make();
    primCache.set(key, g);
  }
  return g;
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Box with one chamfer segment on every edge (44 triangles). Bottom at y = 0. */
export function box(w: number, h: number, d: number, bevel = 0.04): THREE.BufferGeometry {
  return cached(`box:${r3(w)}:${r3(h)}:${r3(d)}:${r3(bevel)}`, () => {
    const b = Math.max(0, Math.min(bevel, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    if (b <= 1e-3) return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    const X = w / 2;
    const Y = h / 2;
    const Z = d / 2;
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          pts.push(new THREE.Vector3(sx * X, sy * (Y - b), sz * (Z - b)));
          pts.push(new THREE.Vector3(sx * (X - b), sy * Y, sz * (Z - b)));
          pts.push(new THREE.Vector3(sx * (X - b), sy * (Y - b), sz * Z));
        }
    return new ConvexGeometry(pts).translate(0, Y, 0);
  });
}

/** Cylinder / frustum, bottom at y = 0. */
export function cyl(rTop: number, rBot: number, h: number, seg = 8): THREE.BufferGeometry {
  return cached(`cyl:${r3(rTop)}:${r3(rBot)}:${r3(h)}:${seg}`, () =>
    new THREE.CylinderGeometry(rTop, rBot, h, seg, 1).translate(0, h / 2, 0),
  );
}

/** Cylinder with chamfered top rim (lathe), bottom at y = 0. */
export function puck(r: number, h: number, seg = 10, bevel = 0.03): THREE.BufferGeometry {
  const b = Math.min(bevel, h / 2, r / 3);
  return lathe(
    [
      [0, 0],
      [r - b, 0],
      [r, b],
      [r, h - b],
      [r - b, h],
      [0, h],
    ],
    seg,
  );
}

export function cone(r: number, h: number, seg = 8): THREE.BufferGeometry {
  return cached(`cone:${r3(r)}:${r3(h)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1).translate(0, h / 2, 0));
}

/** Low-poly ball centred at the origin. */
export function ball(r: number, detail = 0): THREE.BufferGeometry {
  return cached(`ball:${r3(r)}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
}

/** Revolve a [radius, y] profile around +y. */
export function lathe(profile: [number, number][], seg = 10): THREE.BufferGeometry {
  return cached(`lathe:${seg}:${profile.map((p) => `${r3(p[0])},${r3(p[1])}`).join(';')}`, () =>
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
      seg,
    ),
  );
}

/** Gable roof: ridge along z, width w along x, eaves at y = 0, ridge at y = h. */
export function gable(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`gable:${r3(w)}:${r3(h)}:${r3(d)}`, () => {
    const pts = [
      [-w / 2, 0, -d / 2],
      [w / 2, 0, -d / 2],
      [-w / 2, 0, d / 2],
      [w / 2, 0, d / 2],
      [0, h, -d / 2],
      [0, h, d / 2],
      // Slight eave thickness so the roof reads as a slab.
      [-w / 2, -0.05, -d / 2],
      [w / 2, -0.05, -d / 2],
      [-w / 2, -0.05, d / 2],
      [w / 2, -0.05, d / 2],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return new ConvexGeometry(pts).translate(0, 0.05, 0);
  });
}

/** Hip roof: rectangular base w x d, ridge length `ridge` along x. */
export function hip(w: number, h: number, d: number, ridge: number): THREE.BufferGeometry {
  return cached(`hip:${r3(w)}:${r3(h)}:${r3(d)}:${r3(ridge)}`, () => {
    const pts = [
      [-w / 2, 0, -d / 2],
      [w / 2, 0, -d / 2],
      [-w / 2, 0, d / 2],
      [w / 2, 0, d / 2],
      [-ridge / 2, h, 0],
      [ridge / 2, h, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return new ConvexGeometry(pts);
  });
}

/** Convex hull of arbitrary points (cached by key). */
export function hull(key: string, pts: [number, number, number][]): THREE.BufferGeometry {
  return cached(`hull:${key}`, () => new ConvexGeometry(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))));
}

/** Flat extruded 2D shape lying in the xy plane (depth along +z, centred). */
export function extrude(key: string, shape: () => THREE.Shape, depth: number, bevel = 0): THREE.BufferGeometry {
  return cached(`ext:${key}:${r3(depth)}:${r3(bevel)}`, () => {
    const g = new THREE.ExtrudeGeometry(shape(), {
      depth,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

export function torus(r: number, tube: number, seg = 16): THREE.BufferGeometry {
  return cached(`torus:${r3(r)}:${r3(tube)}:${seg}`, () => new THREE.TorusGeometry(r, tube, 4, seg).rotateX(Math.PI / 2));
}

// ---------------------------------------------------------------------------
// Shape builder
// ---------------------------------------------------------------------------

export interface PartOpts {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: number | [number, number, number];
  mat?: MatKind;
  /** Per-part brightness jitter (hand-painted look). Default 0.04. */
  jitter?: number;
}

interface Part {
  geo: THREE.BufferGeometry;
  color: THREE.Color;
  matrix: THREE.Matrix4;
  mat: MatKind;
  jitter: number;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export function matrixOf(o: PartOpts): THREE.Matrix4 {
  const [x, y, z] = o.at ?? [0, 0, 0];
  const [rx, ry, rz] = o.rot ?? [0, 0, 0];
  const s = o.scale ?? 1;
  tmpS.set(...(typeof s === 'number' ? ([s, s, s] as const) : s));
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ')); // yaw, then local pitch, then roll
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS);
}

/** Collects coloured parts and merges them into one geometry with one group per material. */
export class Shape {
  private parts: Part[] = [];

  add(geo: THREE.BufferGeometry, paint: Paint, opts: PartOpts = {}): this {
    this.parts.push({ geo, color: color(paint), matrix: matrixOf(opts), mat: opts.mat ?? 'body', jitter: opts.jitter ?? 0.04 });
    return this;
  }

  /** Nest another shape (its parts are transformed by `opts`). */
  addShape(other: Shape, opts: PartOpts = {}): this {
    const m = matrixOf(opts);
    for (const p of other.parts) this.parts.push({ ...p, matrix: m.clone().multiply(p.matrix) });
    return this;
  }

  /** Mirror copy across x = 0 of everything added so far. */
  mirrorX(): this {
    const m = new THREE.Matrix4().makeScale(-1, 1, 1);
    const copies = this.parts.map((p) => ({ ...p, matrix: m.clone().multiply(p.matrix), mirrored: true }));
    this.parts.push(...copies);
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const byMat = new Map<MatKind, THREE.BufferGeometry[]>();
    let seed = 1;
    for (const p of this.parts) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(p.matrix);
      if (p.matrix.determinant() < 0) g = flipWinding(g);
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position!.count;
      const cols = new Float32Array(n * 3);
      // One brightness factor per part: neighbouring pieces read as separately painted.
      const j = 1 + (fract(Math.sin(seed++ * 12.9898) * 43758.5453) - 0.5) * 2 * p.jitter;
      for (let v = 0; v < n; v++) {
        cols[v * 3] = p.color.r * j;
        cols[v * 3 + 1] = p.color.g * j;
        cols[v * 3 + 2] = p.color.b * j;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const list = byMat.get(p.mat) ?? [];
      list.push(g);
      byMat.set(p.mat, list);
    }
    const mats: MatKind[] = [];
    const merged: THREE.BufferGeometry[] = [];
    for (const k of MAT_ORDER) {
      const list = byMat.get(k);
      if (!list?.length) continue;
      mats.push(k);
      merged.push(list.length === 1 ? list[0]! : mergeGeometries(list, false)!);
    }
    const out = merged.length === 1 ? merged[0]! : mergeGeometries(merged, true)!;
    if (merged.length === 1) out.addGroup(0, out.attributes.position!.count, 0);
    out.userData.mats = mats;
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }
}

function fract(n: number): number {
  return n - Math.floor(n);
}

function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position!;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of nor ? [pos, nor] : [pos]) {
      const x = a.getX(i + 1);
      const y = a.getY(i + 1);
      const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

let materials: Record<MatKind, THREE.Material> | null = null;

export function mats(): Record<MatKind, THREE.Material> {
  if (!materials) {
    materials = {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0, envMapIntensity: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.15, envMapIntensity: 1.3 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.6, envMapIntensity: 1 }),
    };
  }
  return materials;
}

export function materialsFor(geo: THREE.BufferGeometry): THREE.Material[] {
  const m = mats();
  return ((geo.userData.mats as MatKind[] | undefined) ?? ['body']).map((k) => m[k]);
}

// ---------------------------------------------------------------------------
// Geometry cache for whole minis
// ---------------------------------------------------------------------------

const miniCache = new Map<string, THREE.BufferGeometry>();

/** Build (once) and cache a mini geometry by key. */
export function miniGeo(key: string, build: () => Shape): THREE.BufferGeometry {
  let g = miniCache.get(key);
  if (!g) {
    g = build().build();
    g.userData.key = key;
    miniCache.set(key, g);
  }
  return g;
}

export function cacheStats(): { primitives: number; minis: number } {
  return { primitives: primCache.size, minis: miniCache.size };
}

// Palette shortcuts used by many builders.
export const P = {
  wall: COLORS.houseWall,
  roof: COLORS.houseRoof,
  lot: COLORS.lot,
  grass: COLORS.grass,
  hedge: COLORS.garden,
  park: COLORS.park,
  ink: COLORS.ink,
  white: '#fffaf0',
  cream: '#f7efdc',
  wood: '#9a6a43',
  woodDark: '#6e4a2f',
  steel: '#a7adb7',
  steelDark: '#6d727c',
  window: '#9fd3ea',
  windowDark: '#5d8fb0',
  trunk: '#7a5236',
  leaf: '#5f9e4a',
  leafLight: '#7dbb5a',
  stone: '#cfc6b4',
  kerb: '#d9d2c3',
  asphalt: COLORS.road,
} as const;
