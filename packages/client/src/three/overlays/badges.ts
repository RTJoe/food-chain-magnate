/**
 * Overlay chips and markers: small camera-facing sprites with a minimum on-screen size (see
 * Stage.sized), and flat ground markers. Shared by the range, reach and route overlays.
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { BOARD } from '../../boardPalette.js';
import { COLORS } from '../../theme.js';
import { LABEL_MIN_PX, badgeTexture, chipTexture, makeSprite } from '../labels.js';

/** "+1 🍔"-style chip; `size` = world height at close zoom. */
export function makeChip(text: string, good: FoodId | null, bg: string, size = 0.42, fg = '#fffaf0'): THREE.Sprite {
  const s = makeSprite(chipTexture(text, good, bg, fg), size);
  s.userData.minPx = LABEL_MIN_PX;
  s.userData.maxK = 2.6;
  return s;
}

/** Round number badge drawn on top (seam tick counts, candidate numbers). */
export function makeCount(n: number | string, bg: string, size = 0.3): THREE.Sprite {
  const s = makeSprite(badgeTexture(String(n), { bg, fg: '#fffaf0', ring: '#fffaf0' }), size);
  s.userData.minPx = LABEL_MIN_PX;
  s.userData.maxK = 2.6;
  return s;
}

/** Flat disc with a light ring (route start / range start marker). Lies on the ground. */
export function startMarker(color: string, r = 0.3): THREE.Group {
  const g = new THREE.Group();
  g.name = 'startMarker';
  const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), flatMat(COLORS.surface, 1));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 24).rotateX(-Math.PI / 2), flatMat(color, 1));
  dot.position.y = 0.004;
  const pip = new THREE.Mesh(new THREE.CircleGeometry(r * 0.26, 16).rotateX(-Math.PI / 2), flatMat(COLORS.surface, 1));
  pip.position.y = 0.008;
  for (const m of [ring, dot, pip]) m.renderOrder = 6;
  g.add(ring, dot, pip);
  return g;
}

/** Unlit, transparent material for flat overlay geometry (no depth write; drawn over the ground). */
export function flatMat(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    side: THREE.DoubleSide,
  });
}

/** One instanced flat quad per rectangle (x0, z0, x1, z1) at height y, shrunk by `inset`. */
export function quads(rects: readonly { x0: number; z0: number; x1: number; z1: number }[], mat: THREE.Material, y: number, inset = 0): THREE.InstancedMesh | null {
  if (!rects.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, rects.length);
  const m = new THREE.Matrix4();
  rects.forEach((r, i) => {
    m.makeScale(Math.max(0.01, r.x1 - r.x0 - inset * 2), 1, Math.max(0.01, r.z1 - r.z0 - inset * 2)).setPosition((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    mesh.setMatrixAt(i, m);
  });
  mesh.frustumCulled = false;
  return mesh;
}

/** Dispose geometries and materials (not shared textures) under `root`. */
export function disposeOverlay(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.Sprite).isSprite) return; // sprite materials are cached by texture
    m.geometry?.dispose();
    const mat = m.material;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
  });
}

let blocked: THREE.CanvasTexture | null = null;
/**
 * The "can't go here" square under the cursor: planning red with a white edge and a white X, so it
 * keeps 3:1 against both the off-white print (red) and the asphalt (white edge).
 */
export function blockedTexture(): THREE.CanvasTexture {
  if (blocked) return blocked;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = BOARD.edge;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = BOARD.bad;
  g.fillRect(10, 10, 108, 108);
  g.strokeStyle = BOARD.edge;
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(44, 44);
  g.lineTo(84, 84);
  g.moveTo(84, 44);
  g.lineTo(44, 84);
  g.stroke();
  blocked = new THREE.CanvasTexture(c);
  blocked.colorSpace = THREE.SRGBColorSpace;
  return blocked;
}
