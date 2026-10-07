/**
 * Static board (docs/art-bible.md §5): a dark wood table, a cream coordinate band with a chrome
 * edge carrying the tile names, and one printed card slab per 5x5 map tile (off-white speckled
 * print, faint square grid, small bevel, cardboard sides) butted together with a hairline gap.
 * The seam line itself is a shader (seams.ts) so it keeps a minimum width on screen. The printed
 * plates under the minis are in decals.ts (rebuilt with occupancy, through `buildTufts`).
 */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import { BOARD } from '../../boardPalette.js';
import { RIM, hash2 } from '../coords.js';
import { Shape, box, mats, shade } from '../minis/kit.js';
import { buildPlateDecals } from './decals.js';
import { buildRimLabels, buildSeams, type SeamLayer } from './seams.js';
import { groundTileTexture, woodTexture } from './textures.js';

/** Hairline gap between tile slabs (world units). */
export const TILE_GAP = 0.02;
/** Card thickness. */
const SLAB_H = 0.12;
/** Cream coordinate band: inner and outer distance from the map edge. */
const BAND_IN = 0.6;
const BAND_OUT = 2.0;

export interface GroundLayer {
  group: THREE.Group;
  grid: THREE.LineSegments;
  seams: SeamLayer;
  setLabelYaw(yaw: number): void;
  dispose(): void;
}

export function groundSignature(b: Board): string {
  return `${b.w}x${b.h}|${b.tiles.map((t) => `${t.row},${t.col}`).join(';')}`;
}

/** Texture size for the tile print: smaller on phones (coarse pointer) to save memory. */
function groundPx(): number {
  const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  return coarse ? 512 : 1024;
}

export function buildGround(b: Board): GroundLayer {
  const group = new THREE.Group();
  group.name = 'ground';
  const disposables: { dispose(): void }[] = [];
  const W = b.w;
  const H = b.h;

  // Wood table under everything (UVs scaled so the grain stays ~6 squares per repeat).
  const R = Math.max(W, H) * 2.4 + 20;
  const tableGeo = new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2);
  const uv = tableGeo.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * R * 2) / 6, (uv.getY(i) * R * 2) / 6);
  const tableMat = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xffffff, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.set(W / 2, -SLAB_H - 0.002, H / 2);
  table.receiveShadow = true;
  table.name = 'table';
  group.add(table);
  disposables.push(tableGeo, tableMat);

  // Coordinate band: cream frame with a chrome edge on both sides, ticks per square, pegs per tile.
  const s = new Shape();
  const bandW = BAND_OUT - BAND_IN;
  const bandMid = (BAND_IN + BAND_OUT) / 2;
  const bandY = -SLAB_H;
  const bandH = SLAB_H + 0.02;
  const rim = BOARD.rim;
  const chrome = BOARD.chrome;
  const chromeD = BOARD.chromeShade;
  // North / south pieces span the corners; west / east fit between them.
  for (const z of [-bandMid, H + bandMid]) s.add(box(W + BAND_OUT * 2, bandH, bandW, 0.02), rim, { at: [W / 2, bandY, z], jitter: 0 });
  for (const x of [-bandMid, W + bandMid]) s.add(box(bandW, bandH, H + BAND_IN * 2, 0.02), rim, { at: [x, bandY, H / 2], jitter: 0 });
  const edge = (len: number, at: [number, number, number], alongX: boolean, c: THREE.Color | string) =>
    s.add(alongX ? box(len, bandH + 0.025, 0.07, 0.015) : box(0.07, bandH + 0.025, len, 0.015), c, { at, jitter: 0 });
  for (const d of [BAND_IN, BAND_OUT]) {
    const c = d === BAND_IN ? chromeD : chrome;
    edge(W + d * 2, [W / 2, bandY, -d], true, c);
    edge(W + d * 2, [W / 2, bandY, H + d], true, c);
    edge(H + d * 2 - 0.07, [-d, bandY, H / 2], false, c);
    edge(H + d * 2 - 0.07, [W + d, bandY, H / 2], false, c);
  }
  const top = bandY + bandH;
  const tick = shade(BOARD.rimInk, 0.25);
  const peg = shade(BOARD.rimInk, 0);
  for (let x = 0; x < W; x++) for (const z of [-BAND_IN - 0.2, H + BAND_IN + 0.2]) s.add(box(0.05, 0.006, 0.2, 0), tick, { at: [x + 0.5, top, z], jitter: 0 });
  for (let y = 0; y < H; y++) for (const x of [-BAND_IN - 0.2, W + BAND_IN + 0.2]) s.add(box(0.2, 0.006, 0.05, 0), tick, { at: [x, top, y + 0.5], jitter: 0 });
  for (let x = 0; x <= W; x += b.tileSize) for (const z of [-BAND_IN - 0.25, H + BAND_IN + 0.25]) s.add(box(0.07, 0.008, 0.36, 0), peg, { at: [x, top, z], jitter: 0 });
  for (let y = 0; y <= H; y += b.tileSize) for (const x of [-BAND_IN - 0.25, W + BAND_IN + 0.25]) s.add(box(0.36, 0.008, 0.07, 0), peg, { at: [x, top, y], jitter: 0 });
  // Dark base under the tiles: what shows through the hairline gaps.
  s.add(box(W + 0.04, 0.02, H + 0.04, 0), shade(BOARD.core, -0.45), { at: [W / 2, -SLAB_H - 0.001, H / 2], jitter: 0 });
  const frameGeo = s.build();
  disposables.push(frameGeo);
  const frame = new THREE.Mesh(frameGeo, mats().body);
  frame.receiveShadow = true;
  frame.name = 'board';
  group.add(frame);

  // Tile slabs: printed top (shared texture, turned / mirrored per tile) and cardboard sides.
  const tiles = buildTileSlabs(b);
  disposables.push(tiles.geometry);
  const topMat = new THREE.MeshStandardMaterial({ map: groundTileTexture(groundPx()), roughness: 0.86, metalness: 0, envMapIntensity: 0.45 });
  const sideMat = new THREE.MeshStandardMaterial({ color: BOARD.core, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
  disposables.push(topMat, sideMat);
  const slabs = new THREE.Mesh(tiles.geometry, [topMat, sideMat]);
  slabs.receiveShadow = true;
  slabs.name = 'tiles';
  group.add(slabs);

  // Tile coordinates on the band (columns A, B, ... north and south; rows 1, 2, ... west and east).
  const labels = buildRimLabels(b, bandMid, top + 0.004);
  group.add(labels.group);
  disposables.push(labels);

  // Optional square grid (darker than the print grid, for counting squares).
  const pts: number[] = [];
  for (let x = 0; x <= W; x++) pts.push(x, 0.004, 0, x, 0.004, H);
  for (let y = 0; y <= H; y++) pts.push(0, 0.004, y, W, 0.004, y);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: BOARD.seam, transparent: true, opacity: 0.55, depthWrite: false });
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  grid.visible = false;
  grid.name = 'grid';
  grid.renderOrder = 1;
  group.add(grid);
  disposables.push(gridGeo, gridMat);

  // Seam lines (shader, always on): readable at any zoom, independent of the geometry above.
  const seams = buildSeams(b);
  group.add(seams.mesh);
  disposables.push(seams);

  return {
    group,
    grid,
    seams,
    setLabelYaw: (yaw) => labels.setYaw(yaw),
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** One merged geometry: per tile a textured top (group 0) and four sides (group 1). */
function buildTileSlabs(b: Board): { geometry: THREE.BufferGeometry } {
  const ts = b.tileSize;
  const g = TILE_GAP / 2;
  const topPos: number[] = [];
  const topNor: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];
  const sidePos: number[] = [];
  const sideNor: number[] = [];
  const sideIdx: number[] = [];
  for (const t of b.tiles) {
    const x0 = t.col * ts + g;
    const z0 = t.row * ts + g;
    const x1 = (t.col + 1) * ts - g;
    const z1 = (t.row + 1) * ts - g;
    // Orientation of the shared print: 4 turns x mirror, from the tile's position.
    const v = Math.floor(hash2(t.col, t.row, 11) * 8);
    const k = v % 4;
    const flip = v >= 4;
    const base = topPos.length / 3;
    for (const [lx, lz] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      topPos.push(lx ? x1 : x0, 0, lz ? z1 : z0);
      topNor.push(0, 1, 0);
      let u = flip ? 1 - lx : lx;
      let w = 1 - lz;
      for (let i = 0; i < k; i++) [u, w] = [1 - w, u];
      topUv.push(u, w);
    }
    topIdx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    const y0 = -SLAB_H;
    const quad = (a: [number, number, number], bb: [number, number, number], c: [number, number, number], d: [number, number, number], n: [number, number, number]) => {
      const s0 = sidePos.length / 3;
      for (const p of [a, bb, c, d]) {
        sidePos.push(...p);
        sideNor.push(...n);
      }
      sideIdx.push(s0, s0 + 1, s0 + 2, s0, s0 + 2, s0 + 3);
    };
    quad([x0, y0, z1], [x1, y0, z1], [x1, 0, z1], [x0, 0, z1], [0, 0, 1]);
    quad([x1, y0, z0], [x0, y0, z0], [x0, 0, z0], [x1, 0, z0], [0, 0, -1]);
    quad([x1, y0, z1], [x1, y0, z0], [x1, 0, z0], [x1, 0, z1], [1, 0, 0]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, 0, z1], [x0, 0, z0], [-1, 0, 0]);
  }
  const n = topPos.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...topPos, ...sidePos], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([...topNor, ...sideNor], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([...topUv, ...new Array((sidePos.length / 3) * 2).fill(0)], 2));
  geo.setIndex([...topIdx, ...sideIdx.map((i) => i + n)]);
  geo.addGroup(0, topIdx.length, 0);
  geo.addGroup(topIdx.length, sideIdx.length, 1);
  geo.computeBoundingSphere();
  return { geometry: geo };
}

/**
 * Printed plates under the minis (houses, gardens, apartments, parks, drink suppliers). Rebuilt
 * when occupancy changes (the reconciler's "tufts" layer; the grass tufts went with the grass).
 */
export function buildTufts(b: Board): THREE.InstancedMesh | null {
  return buildPlateDecals(b);
}
