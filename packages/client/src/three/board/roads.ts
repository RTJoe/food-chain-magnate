/**
 * Roads from cell adjacency (art bible §5): each road square's links decide its shape (end,
 * straight, corner, T, cross), drawn flat: painted asphalt with pavements, kerbs and yellow edge
 * lines (one canvas texture per shape, turned per square), white centre dashes, a zebra
 * crossing on each side of every tile border a road crosses, the border's hairline across the
 * road, and pale green lattice bridges. A handful of InstancedMeshes plus merged bridge decks;
 * rebuilt only when the road signature changes.
 */
import * as THREE from 'three';
import type { Board, Direction } from '@fcm/engine';
import { BOARD } from '../../boardPalette.js';
import { DELTA, DIRS, ROAD_TOP } from '../coords.js';
import { Shape, box, color, hull, mats, shade } from '../minis/kit.js';
import { buildRoadSeams, type SeamCrossing } from './seams.js';
import { roadPx, roadTexture, type RoadTexShape } from './textures.js';

export type RoadShape = 'none' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';

export function roadShape(links: readonly Direction[]): RoadShape {
  const n = new Set(links).size;
  if (n === 0) return 'none';
  if (n === 1) return 'end';
  if (n === 3) return 'tee';
  if (n === 4) return 'cross';
  const has = (d: Direction) => links.includes(d);
  return (has('N') && has('S')) || (has('E') && has('W')) ? 'straight' : 'corner';
}

const OPP: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Drawn links of a road square: every orthogonally adjacent road square connects, across tile
 * borders too, unless either side is capped (rules: "all edges of orthogonally-adjacent road
 * squares are considered connected ... regardless of how the art might look"). Boards built by
 * the test helpers only link tile borders at the midpoint, so the stored `links` are not used.
 */
export function roadLinks(b: Board, x: number, y: number): Direction[] {
  const r = b.cells[y]?.[x]?.road;
  if (!r) return [];
  return DIRS.filter((d) => {
    const o = b.cells[y + DELTA[d][1]]?.[x + DELTA[d][0]]?.road;
    return !!o && !r.capped?.includes(d) && !o.capped?.includes(OPP[d]);
  });
}

export function roadSignature(b: Board): string {
  const parts: string[] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const r = b.cells[y]?.[x]?.road;
      if (r) parts.push(`${x},${y}:${roadLinks(b, x, y).join('')}${r.bridge ? 'b' : ''}${r.underConstruction ? 'u' : ''}`);
    }
  return `${b.w}x${b.h}|${parts.join(';')}`;
}

const ANG: Record<Direction, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

export interface RoadLayer {
  group: THREE.Group;
  dispose(): void;
}

/** Canonical links of each texture shape (textures.ts), turned by ANG[d] per instance. */
const CANON: Record<Exclude<RoadTexShape, 'none'>, Direction[]> = {
  end: ['S'],
  straight: ['N', 'S'],
  corner: ['S', 'E'],
  tee: ['E', 'S', 'W'],
  cross: ['N', 'E', 'S', 'W'],
};
/** A quarter turn (+π/2 about y) takes S → E → N → W → S. */
const TURN: Record<Direction, Direction> = { S: 'E', E: 'N', N: 'W', W: 'S' };

/** Rotation (radians) that turns the canonical shape onto `links`. */
function shapeAngle(shape: Exclude<RoadTexShape, 'none'>, links: readonly Direction[]): number {
  let cur = CANON[shape];
  for (let k = 0; k < 4; k++) {
    if (cur.length === links.length && cur.every((d) => links.includes(d))) return k * (Math.PI / 2);
    cur = cur.map((d) => TURN[d]);
  }
  return 0;
}

/** Zebra bars: six across the road, 0.08 wide, 0.2 long (local z = along the road). */
const ZEBRA_BARS = 6;
/** Zebra centre from the square centre, towards the tile border. */
const ZEBRA_AT = 0.31;

export function buildRoads(b: Board): RoadLayer {
  const group = new THREE.Group();
  group.name = 'roads';
  const disposables: { dispose(): void }[] = [];
  const isRoad = (x: number, y: number) => !!b.cells[y]?.[x]?.road;
  const onBoard = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h;

  type Inst = { x: number; z: number; ang: number; color?: THREE.Color };
  const asphalt: Record<RoadTexShape, Inst[]> = { none: [], end: [], straight: [], corner: [], tee: [], cross: [] };
  const dashes: Inst[] = [];
  const zebras: Inst[] = [];
  const crossings: SeamCrossing[] = [];
  const ts = b.tileSize;
  const tileOf = (x: number, y: number) => `${Math.floor(x / ts)},${Math.floor(y / ts)}`;
  /** The road continues from (x, y) towards `d` onto another map tile. */
  const seamArm = (x: number, y: number, d: Direction) => {
    const nx = x + DELTA[d][0];
    const ny = y + DELTA[d][1];
    return onBoard(nx, ny) && isRoad(nx, ny) && tileOf(x, y) !== tileOf(nx, ny);
  };
  const bridges = new Shape();
  let bridgeCount = 0;

  const road = color(BOARD.road);
  const gravel = color(BOARD.gravel);
  const gravelTint = new THREE.Color(gravel.r / road.r, gravel.g / road.g, gravel.b / road.b);
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const r = b.cells[y]?.[x]?.road;
      if (!r) continue;
      let links = roadLinks(b, x, y);
      const cx = x + 0.5;
      const cz = y + 0.5;
      if (r.bridge) {
        // E-W deck on top (seen side-on from the default camera), N-S road underneath.
        bridgeDeck(bridges, cx, cz, rampLen(b, x, y, -1), rampLen(b, x, y, 1));
        bridgeCount++;
        links = links.filter((d) => d === 'N' || d === 'S');
      }
      // Roads run off the map edge open (no kerb line across them).
      for (const d of DIRS)
        if (!links.includes(d) && !onBoard(x + DELTA[d][0], y + DELTA[d][1]) && links.includes(OPP[d])) links = [...links, d];
      const shape = roadShape(links);
      const tint = 1 + (hash(x, y) - 0.5) * 0.06;
      const c = r.underConstruction ? gravelTint.clone().multiplyScalar(tint) : new THREE.Color(tint, tint, tint);
      asphalt[shape].push({ x: cx, z: cz, ang: shape === 'none' ? 0 : shapeAngle(shape, links), color: c });
      for (const d of links)
        if (seamArm(x, y, d)) {
          zebras.push({ x: cx + DELTA[d][0] * ZEBRA_AT, z: cz + DELTA[d][1] * ZEBRA_AT, ang: ANG[d] });
          if (d === 'E') crossings.push({ x: x + 1, z: cz, alongZ: true });
          if (d === 'S') crossings.push({ x: cx, z: y + 1, alongZ: false });
        }
      if (r.underConstruction || r.bridge) continue;
      // White centre dashes (0.25 on, 0.25 off), stopped at junctions and tile-border crossings.
      if (shape === 'end' || shape === 'straight' || shape === 'corner')
        for (const d of links) if (!seamArm(x, y, d)) dashes.push({ x: cx + DELTA[d][0] * 0.25, z: cz + DELTA[d][1] * 0.25, ang: ANG[d] });
    }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const addInst = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], list: Inst[], y: number, cast = false) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ang);
      m.compose(new THREE.Vector3(it.x, y, it.z), q, one);
      im.setMatrixAt(i, m);
      if (it.color) im.setColorAt(i, it.color);
    });
    im.name = name;
    im.receiveShadow = true;
    im.castShadow = cast;
    group.add(im);
    disposables.push(im);
  };

  // Asphalt: a flat printed square per road square, one instanced mesh per shape texture.
  const squareGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  disposables.push(squareGeo);
  const px = roadPx();
  for (const shape of Object.keys(asphalt) as RoadTexShape[]) {
    if (!asphalt[shape].length) continue;
    const mat = new THREE.MeshStandardMaterial({ map: roadTexture(shape, px), roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
    disposables.push(mat);
    addInst(`asphalt:${shape}`, squareGeo, mat, asphalt[shape], ROAD_TOP);
  }

  const paintMat = new THREE.MeshStandardMaterial({ color: color(BOARD.roadDash), roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  disposables.push(paintMat);
  const dashGeo = new THREE.PlaneGeometry(0.04, 0.25).rotateX(-Math.PI / 2);
  disposables.push(dashGeo);
  addInst('dashes', dashGeo, paintMat, dashes, ROAD_TOP + 0.002);

  const zebraGeo = mergePlanes(Array.from({ length: ZEBRA_BARS }, (_, i) => [-0.3 + (i * 0.6) / (ZEBRA_BARS - 1), 0, 0.075, 0.2] as const));
  disposables.push(zebraGeo);
  addInst('zebras', zebraGeo, paintMat, zebras, ROAD_TOP + 0.002);

  // Tile border across the road: the same shader hairline as on the print, in ink.
  const roadSeams = buildRoadSeams(ts, crossings);
  if (roadSeams) {
    group.add(roadSeams.mesh);
    disposables.push(roadSeams);
  }

  if (bridgeCount) {
    const geo = bridges.build();
    const mesh = new THREE.Mesh(geo, (geo.userData.mats as string[]).map((k) => mats()[k as 'body']));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'bridges';
    group.add(mesh);
    disposables.push(geo);
  }

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Flat rectangles [cx, cz, w, d] merged into one geometry (y up). */
function mergePlanes(rects: readonly (readonly [number, number, number, number])[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const [cx, cz, w, d] of rects) {
    const base = pos.length / 3;
    pos.push(cx - w / 2, 0, cz - d / 2, cx + w / 2, 0, cz - d / 2, cx + w / 2, 0, cz + d / 2, cx - w / 2, 0, cz + d / 2);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

/** Deck height of an overpass (world units above the ground). */
export const BRIDGE_TOP = 0.56;

/** Ramp run west (-1) / east (+1) of the overpass at (x, y): a full square over a straight road, else half. */
function rampLen(b: Board, x: number, y: number, sx: -1 | 1): number {
  const n = b.cells[y]?.[x + sx]?.road;
  const nl = roadLinks(b, x + sx, y);
  return n && !n.bridge && nl.length === 2 && nl.includes('E') && nl.includes('W') ? 1.0 : 0.5;
}

/**
 * Height of the overpass road surface above the ground road at world (x, z), for traffic on the
 * upper (E-W) road; 0 away from decks and ramps.
 */
export function bridgeLift(b: Board, x: number, z: number): number {
  const by = Math.floor(z);
  if (Math.abs(z - (by + 0.5)) > 0.45) return 0;
  for (let bx = Math.floor(x) - 1; bx <= Math.floor(x) + 1; bx++) {
    if (!b.cells[by]?.[bx]?.road?.bridge) continue;
    const dx = x - (bx + 0.5);
    const rise = BRIDGE_TOP - ROAD_TOP;
    if (Math.abs(dx) <= 0.5) return rise;
    const len = rampLen(b, bx, by, dx < 0 ? -1 : 1);
    const k = 1 - (Math.abs(dx) - 0.5) / len;
    if (k > 0) return rise * k;
  }
  return 0;
}

const barCache = new Map<string, THREE.BufferGeometry>();
/** Centred bar along x (len) with a square cross-section (t). */
function bar(len: number, t = 0.035): THREE.BufferGeometry {
  const k = `${len.toFixed(3)}:${t}`;
  let g = barCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(len, t, t);
    barCache.set(k, g);
  }
  return g;
}

/** A flat X-braced truss in the x-y plane at depth z, from x0 to x1 between heights y0 and y1. */
function truss(s: Shape, x0: number, x1: number, y0: number, y1: number, z: number, panels: number, c: string): void {
  const len = x1 - x0;
  const h = y1 - y0;
  s.add(bar(len + 0.035), c, { at: [(x0 + x1) / 2, y1, z], jitter: 0 });
  s.add(bar(len + 0.035), c, { at: [(x0 + x1) / 2, y0, z], jitter: 0 });
  const p = len / panels;
  const diag = Math.hypot(p, h);
  const a = Math.atan2(h, p);
  for (let i = 0; i <= panels; i++) s.add(bar(h, 0.03), c, { at: [x0 + i * p, (y0 + y1) / 2, z], rot: [0, 0, Math.PI / 2], jitter: 0 });
  for (let i = 0; i < panels; i++) {
    const mx = x0 + (i + 0.5) * p;
    s.add(bar(diag, 0.025), c, { at: [mx, (y0 + y1) / 2, z], rot: [0, 0, a], jitter: 0 });
    s.add(bar(diag, 0.025), c, { at: [mx, (y0 + y1) / 2, z], rot: [0, 0, -a], jitter: 0 });
  }
}

/**
 * E–W overpass over a N–S road (the one road crossing that does not connect), drawn as the map
 * tiles' pale green steel lattice bridge: a through truss (X-braced sides, X bracing overhead) on
 * green piers, and open steel ramps that run down over `rampW` / `rampE` squares of
 * the neighbouring road. The lower road keeps running underneath in the deck's shade.
 */
function bridgeDeck(s: Shape, cx: number, cz: number, rampW: number, rampE: number): void {
  const top = BRIDGE_TOP;
  const hw = 0.42;
  const steel = BOARD.bridge;
  const steelD = BOARD.bridgeDark;
  const road = BOARD.road;
  // Ramps: sloped asphalt on a green girder each side, with a sloped rail.
  for (const [sx, len] of [[-1, rampW], [1, rampE]] as const) {
    const x0 = cx + sx * 0.5;
    s.add(
      hull(`rampTopL:${sx}:${len}`, [
        [0, top + 0.004, -hw],
        [0, top + 0.004, hw],
        [sx * len, ROAD_TOP + 0.008, -hw],
        [sx * len, ROAD_TOP + 0.008, hw],
        [0, top - 0.04, -hw],
        [0, top - 0.04, hw],
        [sx * len, ROAD_TOP, -hw],
        [sx * len, ROAD_TOP, hw],
      ]),
      road,
      { at: [x0, 0, cz], jitter: 0 },
    );
    // Ramp paint: yellow edge lines and a white centre line, a hair above the sloped asphalt.
    const strip = (key: string, zc: number, w: number, c: string, from = 0, to = 1) => {
      const xa = sx * len * from;
      const xb = sx * len * to;
      const ya = top + 0.004 + (ROAD_TOP + 0.008 - top - 0.004) * from + 0.003;
      const yb = top + 0.004 + (ROAD_TOP + 0.008 - top - 0.004) * to + 0.003;
      s.add(
        hull(`rampPaint:${key}:${sx}:${len}`, [
          [xa, ya, zc - w / 2],
          [xa, ya, zc + w / 2],
          [xb, yb, zc - w / 2],
          [xb, yb, zc + w / 2],
          [xa, ya - 0.002, zc - w / 2],
          [xa, ya - 0.002, zc + w / 2],
          [xb, yb - 0.002, zc - w / 2],
          [xb, yb - 0.002, zc + w / 2],
        ]),
        c,
        { at: [x0, 0, cz], jitter: 0 },
      );
    };
    for (const sz of [-1, 1]) strip(`edge${sz}`, sz * (hw - 0.12), 0.018, BOARD.roadEdge);
    for (let f = 0.12; f < 0.95; f += 0.5) strip(`dash${f}`, 0, 0.035, BOARD.roadDash, f, Math.min(1, f + 0.25));
    for (const sz of [-1, 1]) {
      const z = sz * (hw + 0.02);
      s.add(
        hull(`rampGirderL:${sx}:${sz}:${len}`, [
          [0, top + 0.02, z - 0.02],
          [0, top + 0.02, z + 0.02],
          [0, top - 0.14, z - 0.02],
          [0, top - 0.14, z + 0.02],
          [sx * len, ROAD_TOP + 0.03, z - 0.02],
          [sx * len, ROAD_TOP + 0.03, z + 0.02],
          [sx * len, ROAD_TOP, z - 0.02],
          [sx * len, ROAD_TOP, z + 0.02],
        ]),
        steelD,
        { at: [x0, 0, cz], jitter: 0 },
      );
      s.add(
        hull(`rampRailL:${sx}:${sz}:${len}`, [
          [0, top + 0.14, z - 0.016],
          [0, top + 0.14, z + 0.016],
          [0, top + 0.11, z - 0.016],
          [0, top + 0.11, z + 0.016],
          [sx * len, ROAD_TOP + 0.1, z - 0.016],
          [sx * len, ROAD_TOP + 0.1, z + 0.016],
          [sx * len, ROAD_TOP + 0.07, z - 0.016],
          [sx * len, ROAD_TOP + 0.07, z + 0.016],
        ]),
        steel,
        { at: [x0, 0, cz], jitter: 0 },
      );
      // Rail posts along the ramp.
      for (let i = 1; i < 3; i++) {
        const f = i / 3;
        const yb = top + (ROAD_TOP - top) * f;
        s.add(bar(0.11, 0.022), steel, { at: [x0 + sx * len * f, yb + 0.07, cz + z], rot: [0, 0, Math.PI / 2], jitter: 0 });
      }
    }
  }
  // Deck: asphalt between raised kerbed walkways, yellow edge lines and white dashes, on a green slab.
  s.add(box(1.04, 0.05, hw * 2 + 0.04, 0.01), steelD, { at: [cx, top - 0.05, cz], jitter: 0 });
  s.add(box(1.0, 0.012, hw * 2, 0), road, { at: [cx, top - 0.004, cz], jitter: 0 });
  for (const sz of [-1, 1]) {
    s.add(box(1.0, 0.018, 0.075, 0), BOARD.pavement, { at: [cx, top + 0.007, cz + sz * (hw - 0.0375)], jitter: 0 });
    s.add(box(1.0, 0.02, 0.014, 0), BOARD.kerb, { at: [cx, top + 0.008, cz + sz * (hw - 0.082)], jitter: 0 });
    s.add(box(1.0, 0.004, 0.018, 0), BOARD.roadEdge, { at: [cx, top + 0.003, cz + sz * (hw - 0.12)], jitter: 0 });
  }
  for (const dx of [-0.25, 0.25]) s.add(box(0.25, 0.004, 0.035, 0), BOARD.roadDash, { at: [cx + dx, top + 0.003, cz], jitter: 0 });
  // Through truss: an X-braced lattice each side and X bracing overhead (what the top view sees,
  // as the printed tiles draw it); traffic on the deck passes under the top bracing.
  const tH = 0.44;
  const x0 = cx - 0.52;
  const x1 = cx + 0.52;
  for (const sz of [-1, 1]) truss(s, x0, x1, top, top + tH, cz + sz * (hw + 0.02), 3, steel);
  const span = hw * 2 + 0.04;
  for (let i = 0; i <= 3; i++) s.add(bar(span, 0.03), steel, { at: [x0 + (i * (x1 - x0)) / 3, top + tH, cz], rot: [0, Math.PI / 2, 0], jitter: 0 });
  const p = (x1 - x0) / 3;
  const dl = Math.hypot(p, span);
  const da = Math.atan2(span, p);
  for (let i = 0; i < 3; i++)
    for (const sg of [-1, 1]) s.add(bar(dl, 0.025), steel, { at: [x0 + (i + 0.5) * p, top + tH, cz], rot: [0, sg * da, 0], jitter: 0 });
  // Piers under the deck, clear of the lower road's lanes.
  for (const dx of [-0.5, 0.5]) for (const sz of [-1, 1]) s.add(bar(top - 0.05 - ROAD_TOP, 0.05), steelD, { at: [cx + dx, ROAD_TOP + (top - 0.05 - ROAD_TOP) / 2, cz + sz * hw], rot: [0, 0, Math.PI / 2], jitter: 0 });
  // The lower road in the deck's shade.
  s.add(box(0.98, 0.004, hw * 2, 0), shade(road, -0.38), { at: [cx, ROAD_TOP + 0.003, cz], jitter: 0 });
  for (const sz of [-1, 1]) s.add(box(0.98, 0.004, 0.1, 0), shade(road, -0.2), { at: [cx, ROAD_TOP + 0.003, cz + sz * (hw + 0.05)], jitter: 0 });
}

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
