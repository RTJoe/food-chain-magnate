/**
 * Roads from cell adjacency: each road square's `links` decide its shape (end, straight, corner, T,
 * cross). Rendered as a handful of InstancedMeshes (asphalt, kerbs, kerb corners, centre dashes,
 * zebra crossings) plus merged bridge decks. Rebuilt only when the road signature changes.
 */
import * as THREE from 'three';
import type { Board, Direction } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { DELTA, DIRS, ROAD_TOP } from '../coords.js';
import { P, Shape, box, color, hull, mats, shade } from '../minis/kit.js';

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

export function buildRoads(b: Board): RoadLayer {
  const group = new THREE.Group();
  group.name = 'roads';
  const disposables: { dispose(): void }[] = [];
  const isRoad = (x: number, y: number) => !!b.cells[y]?.[x]?.road;

  type Inst = { x: number; z: number; ang: number; color?: THREE.Color };
  const asphalt: Inst[] = [];
  const kerbs: Inst[] = [];
  const corners: Inst[] = [];
  const dashes: Inst[] = [];
  const zebras: Inst[] = [];
  const seamBands: Inst[] = [];
  const ts = b.tileSize;
  const tileOf = (x: number, y: number) => `${Math.floor(x / ts)},${Math.floor(y / ts)}`;
  /** The link from (x, y) towards `d` crosses a map tile border. */
  const crossesSeam = (x: number, y: number, d: Direction) => tileOf(x, y) !== tileOf(x + DELTA[d][0], y + DELTA[d][1]);
  const bridges = new Shape();
  let bridgeCount = 0;

  const asphaltC = color(COLORS.road);
  const gravelC = color('#a49b8b');
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const r = b.cells[y]?.[x]?.road;
      if (!r) continue;
      let links = roadLinks(b, x, y);
      const cx = x + 0.5;
      const cz = y + 0.5;
      const tint = (hash(x, y) - 0.5) * 0.06;
      asphalt.push({ x: cx, z: cz, ang: 0, color: (r.underConstruction ? gravelC : asphaltC).clone().multiplyScalar(1 + tint) });
      if (r.bridge) {
        // E-W deck on top (seen side-on from the default camera), N-S road underneath.
        bridgeDeck(bridges, cx, cz, rampLen(b, x, y, -1), rampLen(b, x, y, 1));
        bridgeCount++;
        links = links.filter((d) => d === 'N' || d === 'S');
      }
      for (const d of DIRS) if (!links.includes(d)) kerbs.push({ x: cx, z: cz, ang: ANG[d] });
      // Kerb posts on corners between two linked sides when the diagonal is not road.
      const pairs: [Direction, Direction, number, number][] = [
        ['N', 'E', 1, -1],
        ['E', 'S', 1, 1],
        ['S', 'W', -1, 1],
        ['W', 'N', -1, -1],
      ];
      for (const [a, c, sx, sz] of pairs)
        if (links.includes(a) && links.includes(c) && !isRoad(x + sx, y + sz)) corners.push({ x: cx + sx * 0.45, z: cz + sz * 0.45, ang: 0 });
      // Tile border crossings: a lighter band across the asphalt, centred on the seam (counted once).
      for (const d of links)
        if ((d === 'E' || d === 'S') && isRoad(x + DELTA[d][0], y + DELTA[d][1]) && crossesSeam(x, y, d))
          seamBands.push({ x: cx + DELTA[d][0] * 0.5, z: cz + DELTA[d][1] * 0.5, ang: ANG[d] });
      if (r.underConstruction) continue;
      const shape = roadShape(links);
      if (shape === 'end' || shape === 'straight' || shape === 'corner') {
        // The centre dash is interrupted where the road crosses a tile border.
        for (const d of links) if (!crossesSeam(x, y, d)) dashes.push({ x: cx + DELTA[d][0] * 0.25, z: cz + DELTA[d][1] * 0.25, ang: ANG[d] });
      } else if (shape === 'tee' || shape === 'cross') {
        for (const d of links) {
          const nx = x + DELTA[d][0];
          const ny = y + DELTA[d][1];
          const ns = roadShape(roadLinks(b, nx, ny));
          // Crossing on the arm only if the neighbour continues straight (not another junction).
          if (ns !== 'none' && ns !== 'tee' && ns !== 'cross')
            zebras.push({ x: cx + DELTA[d][0] * 0.36, z: cz + DELTA[d][1] * 0.36, ang: ANG[d] });
        }
      }
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

  const asphaltGeo = new THREE.BoxGeometry(1, ROAD_TOP + 0.02, 1).translate(0, (ROAD_TOP + 0.02) / 2 - 0.02, 0);
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 });
  disposables.push(asphaltGeo, asphaltMat);
  addInst('asphalt', asphaltGeo, asphaltMat, asphalt, 0);

  const kerbGeo = new Shape().add(box(1.0, 0.07, 0.11, 0.02), P.kerb, { at: [0, 0, 0.445], jitter: 0 }).add(box(1.0, 0.012, 0.05, 0), shade(COLORS.grass, -0.3), { at: [0, 0, 0.525], jitter: 0 }).build();
  disposables.push(kerbGeo);
  addInst('kerbs', kerbGeo, mats().body, kerbs, 0, true);

  const cornerGeo = new Shape().add(box(0.11, 0.07, 0.11, 0.02), P.kerb, { jitter: 0 }).build();
  disposables.push(cornerGeo);
  addInst('kerbCorners', cornerGeo, mats().body, corners, 0);

  const lineMat = new THREE.MeshStandardMaterial({ color: color(COLORS.roadLine), roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  disposables.push(lineMat);
  const dashGeo = new THREE.BoxGeometry(0.06, 0.006, 0.26);
  disposables.push(dashGeo);
  addInst('dashes', dashGeo, lineMat, dashes, ROAD_TOP + 0.002);

  const bandMat = new THREE.MeshStandardMaterial({ color: shade(COLORS.road, 0.2), roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const bandGeo = new THREE.BoxGeometry(0.84, 0.006, 0.3);
  disposables.push(bandMat, bandGeo);
  addInst('seamBands', bandGeo, bandMat, seamBands, ROAD_TOP + 0.001);
  // Thin seam line through the band so the border reads like the one on the grass.
  const seamLineMat = new THREE.MeshBasicMaterial({ color: shade(COLORS.tileEdge, -0.58), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const seamLineGeo = new THREE.BoxGeometry(0.84, 0.006, 0.07);
  disposables.push(seamLineMat, seamLineGeo);
  addInst('seamLines', seamLineGeo, seamLineMat, seamBands, ROAD_TOP + 0.005);

  const zebraGeo = new THREE.BufferGeometry();
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) parts.push(new THREE.BoxGeometry(0.075, 0.006, 0.2).translate(-0.32 + i * 0.16, 0, 0));
    const merged = mergeBoxes(parts);
    zebraGeo.copy(merged);
    merged.dispose();
  }
  disposables.push(zebraGeo);
  addInst('zebras', zebraGeo, lineMat, zebras, ROAD_TOP + 0.002);

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

function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    const pa = p.attributes.position!;
    const na = p.attributes.normal!;
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
    }
    const ix = p.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += pa.count;
    p.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

/** Deck height of an overpass (world units above the ground). */
export const BRIDGE_TOP = 0.66;

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

/**
 * E–W overpass over a N–S road (the one road crossing that does not connect). A raised light
 * concrete deck with dark fascia, abutments, and ramps that run down over `rampW` / `rampE`
 * squares of the neighbouring road; the lower road shows a dark band where it passes under.
 */
function bridgeDeck(s: Shape, cx: number, cz: number, rampW: number, rampE: number): void {
  const top = BRIDGE_TOP;
  const hw = 0.42;
  const deck = '#d6d0c4';
  const fascia = '#8a847a';
  const wall = '#bdb6a9';
  // Ramps (solid embankments with retaining walls) west and east.
  for (const [sx, len] of [[-1, rampW], [1, rampE]] as const) {
    const x0 = cx + sx * 0.5;
    s.add(
      hull(`rampE:${sx}:${len}`, [
        [0, 0, -hw],
        [0, 0, hw],
        [0, top, -hw],
        [0, top, hw],
        [sx * len, 0, -hw],
        [sx * len, 0, hw],
        [sx * len, ROAD_TOP + 0.005, -hw],
        [sx * len, ROAD_TOP + 0.005, hw],
      ]),
      wall,
      { at: [x0, 0, cz], jitter: 0 },
    );
    s.add(
      hull(`rampTopE:${sx}:${len}`, [
        [0, top + 0.004, -hw + 0.06],
        [0, top + 0.004, hw - 0.06],
        [sx * len, ROAD_TOP + 0.012, -hw + 0.06],
        [sx * len, ROAD_TOP + 0.012, hw - 0.06],
        [0, top - 0.01, -hw + 0.06],
        [0, top - 0.01, hw - 0.06],
        [sx * len, ROAD_TOP, -hw + 0.06],
        [sx * len, ROAD_TOP, hw - 0.06],
      ]),
      COLORS.road,
      { at: [x0, 0, cz], jitter: 0 },
    );
    // Parapet down the ramp (a sloped kerb on each side).
    for (const sz of [-1, 1])
      s.add(
        hull(`rampRail:${sx}:${sz}:${len}`, [
          [0, top - 0.02, sz * (hw - 0.06)],
          [0, top - 0.02, sz * hw],
          [0, top + 0.08, sz * (hw - 0.06)],
          [0, top + 0.08, sz * hw],
          [sx * len, ROAD_TOP, sz * (hw - 0.06)],
          [sx * len, ROAD_TOP, sz * hw],
          [sx * len, ROAD_TOP + 0.06, sz * (hw - 0.06)],
          [sx * len, ROAD_TOP + 0.06, sz * hw],
        ]),
        P.kerb,
        { at: [x0, 0, cz], jitter: 0 },
      );
    // Abutment pier face where the lower road passes.
    s.add(box(0.08, top - 0.1, hw * 2 + 0.06, 0.01), wall, { at: [x0 - sx * 0.02, 0, cz], jitter: 0 });
  }
  // Deck slab: light concrete with a darker fascia band on both long sides, asphalt on top.
  s.add(box(1.04, 0.12, hw * 2, 0.015), deck, { at: [cx, top - 0.12, cz], jitter: 0 });
  for (const sz of [-1, 1]) {
    s.add(box(1.06, 0.14, 0.03, 0.008), fascia, { at: [cx, top - 0.16, cz + sz * (hw + 0.005)], jitter: 0 });
    s.add(box(1.04, 0.08, 0.06, 0.015), P.kerb, { at: [cx, top - 0.02, cz + sz * (hw - 0.03)], jitter: 0 });
    s.add(box(1.04, 0.025, 0.03, 0.008), '#e25b4b', { at: [cx, top + 0.075, cz + sz * (hw - 0.03)], jitter: 0 });
  }
  s.add(box(1.0, 0.012, hw * 2 - 0.12, 0), COLORS.road, { at: [cx, top, cz], jitter: 0 });
  s.add(box(0.26, 0.006, 0.05, 0), COLORS.roadLine, { at: [cx - 0.25, top + 0.012, cz], jitter: 0 });
  s.add(box(0.26, 0.006, 0.05, 0), COLORS.roadLine, { at: [cx + 0.25, top + 0.012, cz], jitter: 0 });
  // The lower road in the deck's shade: dark under the deck, a softer band on each side.
  s.add(box(0.84, 0.004, hw * 2, 0), '#3a3940', { at: [cx, ROAD_TOP + 0.003, cz], jitter: 0 });
  for (const sz of [-1, 1]) s.add(box(0.84, 0.004, 0.08, 0), '#3f3e46', { at: [cx, ROAD_TOP + 0.003, cz + sz * (hw + 0.04)], jitter: 0 });
}

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
