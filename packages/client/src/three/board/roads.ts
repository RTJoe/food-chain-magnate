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

export function roadSignature(b: Board): string {
  const parts: string[] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const r = b.cells[y]?.[x]?.road;
      if (r) parts.push(`${x},${y}:${[...r.links].sort().join('')}${r.bridge ? 'b' : ''}${r.underConstruction ? 'u' : ''}`);
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
  const bridges = new Shape();
  let bridgeCount = 0;

  const asphaltC = color(COLORS.road);
  const gravelC = color('#a49b8b');
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const r = b.cells[y]?.[x]?.road;
      if (!r) continue;
      let links = r.links.length ? [...r.links] : DIRS.filter((d) => isRoad(x + DELTA[d][0], y + DELTA[d][1]));
      const cx = x + 0.5;
      const cz = y + 0.5;
      const tint = (hash(x, y) - 0.5) * 0.06;
      asphalt.push({ x: cx, z: cz, ang: 0, color: (r.underConstruction ? gravelC : asphaltC).clone().multiplyScalar(1 + tint) });
      if (r.bridge) {
        bridgeDeck(bridges, cx, cz);
        bridgeCount++;
        links = links.filter((d) => d === 'E' || d === 'W');
      }
      for (const d of DIRS) if (!links.includes(d) && !(r.bridge && (d === 'N' || d === 'S'))) kerbs.push({ x: cx, z: cz, ang: ANG[d] });
      // Kerb posts on corners between two linked sides when the diagonal is not road.
      const pairs: [Direction, Direction, number, number][] = [
        ['N', 'E', 1, -1],
        ['E', 'S', 1, 1],
        ['S', 'W', -1, 1],
        ['W', 'N', -1, -1],
      ];
      for (const [a, c, sx, sz] of pairs)
        if (links.includes(a) && links.includes(c) && !isRoad(x + sx, y + sz)) corners.push({ x: cx + sx * 0.45, z: cz + sz * 0.45, ang: 0 });
      if (r.underConstruction) continue;
      const shape = roadShape(links);
      if (shape === 'end' || shape === 'straight' || shape === 'corner') {
        for (const d of links) dashes.push({ x: cx + DELTA[d][0] * 0.25, z: cz + DELTA[d][1] * 0.25, ang: ANG[d] });
      } else if (shape === 'tee' || shape === 'cross') {
        for (const d of links) {
          const nx = x + DELTA[d][0];
          const ny = y + DELTA[d][1];
          const nr = b.cells[ny]?.[nx]?.road;
          // Crossing on the arm only if the neighbour continues straight (not another junction).
          if (nr && roadShape(nr.links) !== 'tee' && roadShape(nr.links) !== 'cross')
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

/** N–S overpass deck over an E–W road; ramps reach half a square into the N and S neighbours. */
function bridgeDeck(s: Shape, cx: number, cz: number): void {
  const top = 0.34;
  const hw = 0.42;
  const deck = '#9b958c';
  // Ramps (solid embankments) north and south.
  for (const sz of [-1, 1]) {
    const z0 = cz + sz * 0.5;
    const z1 = cz + sz * 1.0;
    s.add(
      hull(`ramp:${sz}`, [
        [-hw, 0, 0],
        [hw, 0, 0],
        [-hw, top, 0],
        [hw, top, 0],
        [-hw, 0, sz * 0.5],
        [hw, 0, sz * 0.5],
        [-hw, ROAD_TOP + 0.005, sz * 0.5],
        [hw, ROAD_TOP + 0.005, sz * 0.5],
      ]),
      P.stone,
      { at: [cx, 0, z0], jitter: 0 },
    );
    void z1;
    s.add(
      hull(`rampTop:${sz}`, [
        [-hw + 0.06, top + 0.004, 0],
        [hw - 0.06, top + 0.004, 0],
        [-hw + 0.06, ROAD_TOP + 0.012, sz * 0.5],
        [hw - 0.06, ROAD_TOP + 0.012, sz * 0.5],
        [-hw + 0.06, top - 0.01, 0],
        [hw - 0.06, top - 0.01, 0],
        [-hw + 0.06, ROAD_TOP, sz * 0.5],
        [hw - 0.06, ROAD_TOP, sz * 0.5],
      ]),
      COLORS.road,
      { at: [cx, 0, z0], jitter: 0 },
    );
  }
  // Deck slab with girder, asphalt top and parapets.
  s.add(box(hw * 2, 0.08, 1.0, 0.015), deck, { at: [cx, top - 0.08, cz], jitter: 0 });
  s.add(box(hw * 2 - 0.12, 0.012, 1.0, 0), COLORS.road, { at: [cx, top, cz], jitter: 0 });
  s.add(box(0.05, 0.006, 0.26, 0), COLORS.roadLine, { at: [cx, top + 0.012, cz - 0.25], jitter: 0 });
  s.add(box(0.05, 0.006, 0.26, 0), COLORS.roadLine, { at: [cx, top + 0.012, cz + 0.25], jitter: 0 });
  for (const sx of [-1, 1]) {
    s.add(box(0.06, 0.1, 2.0, 0.015), P.kerb, { at: [cx + sx * (hw - 0.03), top - 0.01, cz], jitter: 0 });
    s.add(box(0.03, 0.03, 1.2, 0.008), '#e25b4b', { at: [cx + sx * (hw - 0.03), top + 0.09, cz], jitter: 0 });
  }
  // Under-deck shadow strip on the lower road.
  s.add(box(0.05, top - 0.12, 0.1, 0.01), shade(P.stone, -0.15), { at: [cx - hw + 0.03, ROAD_TOP, cz - 0.45], jitter: 0 });
  s.add(box(0.05, top - 0.12, 0.1, 0.01), shade(P.stone, -0.15), { at: [cx + hw - 0.03, ROAD_TOP, cz - 0.45], jitter: 0 });
  s.add(box(0.05, top - 0.12, 0.1, 0.01), shade(P.stone, -0.15), { at: [cx - hw + 0.03, ROAD_TOP, cz + 0.45], jitter: 0 });
  s.add(box(0.05, top - 0.12, 0.1, 0.01), shade(P.stone, -0.15), { at: [cx + hw - 0.03, ROAD_TOP, cz + 0.45], jitter: 0 });
}

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
