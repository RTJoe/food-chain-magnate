/**
 * Static board: table, rim with edge markers, one grass slab per 5x5 tile (thin seams between
 * tiles), per-square colour variation, optional square grid and small grass tufts on empty squares.
 */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { RIM, hash2 } from '../coords.js';
import { Shape, box, color, cone, mats, shade } from '../minis/kit.js';

export interface GroundLayer {
  group: THREE.Group;
  grid: THREE.LineSegments;
  dispose(): void;
}

export function groundSignature(b: Board): string {
  return `${b.w}x${b.h}|${b.tiles.map((t) => `${t.row},${t.col}`).join(';')}`;
}

export function buildGround(b: Board): GroundLayer {
  const group = new THREE.Group();
  group.name = 'ground';
  const disposables: { dispose(): void }[] = [];
  const W = b.w;
  const H = b.h;

  // Table under the board.
  const tableGeo = new THREE.CircleGeometry(Math.max(W, H) * 2.4 + 20, 48).rotateX(-Math.PI / 2);
  const tableMat = new THREE.MeshStandardMaterial({ color: color('#e3d6b8'), roughness: 0.95, metalness: 0 });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.set(W / 2, -0.42, H / 2);
  table.receiveShadow = true;
  table.name = 'table';
  group.add(table);
  disposables.push(tableGeo, tableMat);

  // Board body: base + raised rim frame.
  const s = new Shape();
  const OW = W + RIM * 2;
  const OH = H + RIM * 2;
  s.add(box(OW, 0.36, OH, 0.14), shade(COLORS.lot, -0.18), { at: [W / 2, -0.42, H / 2], jitter: 0 });
  s.add(box(W + 0.3, 0.08, H + 0.3, 0.02), COLORS.tileEdge, { at: [W / 2, -0.13, H / 2], jitter: 0 });
  const rimC = COLORS.lot;
  const rw = RIM - 0.1;
  // Four frame pieces (top at y = 0.06).
  s.add(box(OW - 0.06, 0.42, rw, 0.07), rimC, { at: [W / 2, -0.36, -0.1 - rw / 2], jitter: 0 });
  s.add(box(OW - 0.06, 0.42, rw, 0.07), rimC, { at: [W / 2, -0.36, H + 0.1 + rw / 2], jitter: 0 });
  s.add(box(rw, 0.42, H + 0.2, 0.07), rimC, { at: [-0.1 - rw / 2, -0.36, H / 2], jitter: 0 });
  s.add(box(rw, 0.42, H + 0.2, 0.07), rimC, { at: [W + 0.1 + rw / 2, -0.36, H / 2], jitter: 0 });
  // Inner lip (darker band hugging the play area).
  const lip = shade(COLORS.tileEdge, -0.1);
  s.add(box(W + 0.36, 0.05, 0.12, 0.02), lip, { at: [W / 2, 0.02, -0.12], jitter: 0 });
  s.add(box(W + 0.36, 0.05, 0.12, 0.02), lip, { at: [W / 2, 0.02, H + 0.12], jitter: 0 });
  s.add(box(0.12, 0.05, H + 0.36, 0.02), lip, { at: [-0.12, 0.02, H / 2], jitter: 0 });
  s.add(box(0.12, 0.05, H + 0.36, 0.02), lip, { at: [W + 0.12, 0.02, H / 2], jitter: 0 });
  // Edge markers: a tick per square along each side, a bigger peg at tile boundaries.
  const tick = shade(COLORS.lot, -0.22);
  const peg = shade(COLORS.tileEdge, -0.3);
  for (let x = 0; x < W; x++) {
    for (const z of [-0.45, H + 0.45]) s.add(box(0.1, 0.02, 0.22, 0.01), tick, { at: [x + 0.5, 0.06, z], jitter: 0 });
  }
  for (let y = 0; y < H; y++) {
    for (const x of [-0.45, W + 0.45]) s.add(box(0.22, 0.02, 0.1, 0.01), tick, { at: [x, 0.06, y + 0.5], jitter: 0 });
  }
  for (let x = 0; x <= W; x += b.tileSize) for (const z of [-0.45, H + 0.45]) s.add(box(0.12, 0.05, 0.12, 0.02), peg, { at: [x, 0.06, z], jitter: 0 });
  for (let y = 0; y <= H; y += b.tileSize) for (const x of [-0.45, W + 0.45]) s.add(box(0.12, 0.05, 0.12, 0.02), peg, { at: [x, 0.06, y], jitter: 0 });

  // Tiles: slab + per-square tops.
  const grass = color(COLORS.grass);
  const side = shade(COLORS.grass, -0.25);
  for (const t of b.tiles) {
    const x0 = t.col * b.tileSize;
    const y0 = t.row * b.tileSize;
    s.add(box(b.tileSize - 0.05, 0.11, b.tileSize - 0.05, 0.035), side, { at: [x0 + 2.5, -0.12, y0 + 2.5], jitter: 0 });
    for (let dy = 0; dy < b.tileSize; dy++)
      for (let dx = 0; dx < b.tileSize; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        const j = (hash2(x, y, 7) - 0.5) * 0.07 + ((x + y) % 2 ? 0.012 : -0.012);
        const c = grass.clone().multiplyScalar(1 + j);
        const inset = (edge: boolean) => (edge ? 0.025 : 0);
        const wx = 1 - inset(dx === 0) - inset(dx === b.tileSize - 1);
        const wz = 1 - inset(dy === 0) - inset(dy === b.tileSize - 1);
        s.add(box(wx, 0.02, wz, 0), c, {
          at: [x + 0.5 + (inset(dx === 0) - inset(dx === b.tileSize - 1)) / 2, -0.02, y + 0.5 + (inset(dy === 0) - inset(dy === b.tileSize - 1)) / 2],
          jitter: 0,
        });
      }
  }
  const geo = s.build();
  disposables.push(geo);
  const mesh = new THREE.Mesh(geo, mats().body);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'board';
  group.add(mesh);

  // Optional square grid.
  const pts: number[] = [];
  for (let x = 0; x <= W; x++) pts.push(x, 0.004, 0, x, 0.004, H);
  for (let y = 0; y <= H; y++) pts.push(0, 0.004, y, W, 0.004, y);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: shade(COLORS.grass, -0.45), transparent: true, opacity: 0.35, depthWrite: false });
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  grid.visible = false;
  grid.name = 'grid';
  grid.renderOrder = 1;
  group.add(grid);
  disposables.push(gridGeo, gridMat);

  return {
    group,
    grid,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Grass tufts on some empty squares (instanced, rebuilt when occupancy changes). */
export function buildTufts(b: Board): THREE.InstancedMesh | null {
  const spots: [number, number, number][] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const c = b.cells[y]?.[x];
      if (!c || c.kind !== 'empty') continue;
      const r = hash2(x, y, 3);
      if (r < 0.32) spots.push([x + 0.2 + hash2(x, y, 4) * 0.6, y + 0.2 + hash2(x, y, 5) * 0.6, r]);
    }
  if (!spots.length) return null;
  const s = new Shape();
  s.add(cone(0.05, 0.13, 4), shade(COLORS.grass, -0.2), { at: [0, -0.01, 0], rot: [0, 0, 0.2] });
  s.add(cone(0.04, 0.1, 4), shade(COLORS.grass, -0.12), { at: [0.06, -0.01, 0.03], rot: [0, 0, -0.3] });
  s.add(cone(0.035, 0.09, 4), shade(COLORS.grass, -0.28), { at: [-0.04, -0.01, 0.05], rot: [0.3, 0, 0] });
  const geo = s.build();
  const mesh = new THREE.InstancedMesh(geo, mats().body, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach(([x, z, r], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 40);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 0.8 + r, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.name = 'tufts';
  mesh.receiveShadow = true;
  return mesh;
}
