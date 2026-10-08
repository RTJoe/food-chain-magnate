/**
 * Tile seams (ux-plan §3.4 layer 2, art bible §5): a hairline on every map tile edge, drawn just
 * above the tile print (roads and minis cover it; `buildRoadSeams` draws the same line across the
 * roads, in ink). The line has a world width (0.03 tilted, 0.05 in top view) and a minimum width
 * of 1.25 css px, so tile borders stay countable at any zoom and on phones. High contrast doubles
 * the width, draws it in ink and tints every other tile 6%.
 *
 * Also: tile coordinate labels printed on the table beside the map (columns A, B, ...; rows 1, 2, ...).
 */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import { BOARD } from '../../boardPalette.js';
import { COLORS } from '../../theme.js';
import { ROAD_TOP } from '../coords.js';
import { color } from '../minis/kit.js';

/** Seam line colour (3:1 or better against the tile print). */
export const SEAM_COLOR = color(BOARD.seam);
const SEAM_Y = 0.016;
/** Shared by every seam material, so the road seams follow the ground seams' style. */
const shared = { uTop: { value: 0 }, uHC: { value: 0 } };
const EXT = 0.2;

export interface SeamLayer {
  mesh: THREE.Mesh;
  /** 0 = tilted, 1 = straight down (blend). */
  setTop(t: number): void;
  setHighContrast(on: boolean): void;
  dispose(): void;
}

const vert = /* glsl */ `
attribute vec2 aLocal;
attribute float aParity;
varying vec2 vLocal;
varying float vParity;
void main() {
  vLocal = aLocal;
  vParity = aParity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uTint;
uniform float uSize;
uniform float uHalf;
uniform float uHalfTop;
uniform float uTop;
uniform float uHC;
uniform float uMinPx;
varying vec2 vLocal;
varying float vParity;
void main() {
  vec2 l = vLocal;
  float d = min(min(abs(l.x), abs(uSize - l.x)), min(abs(l.y), abs(uSize - l.y)));
  float px = max(length(fwidth(l)) * 0.7071, 1e-5);
  float k = 1.0 + uHC;
  float hw = max(mix(uHalf, uHalfTop, uTop) * k, uMinPx * k * px);
  float a = 1.0 - smoothstep(hw - px, hw + px, d);
  float inside = step(0.0, l.x) * step(l.x, uSize) * step(0.0, l.y) * step(l.y, uSize);
  float t = uHC * 0.06 * vParity * inside;
  float alpha = max(a * 0.92, t);
  if (alpha < 0.002) discard;
  vec3 line = mix(uColor, uTint, uHC);
  vec3 c = mix(uTint, line, a / max(a + t, 1e-5));
  gl_FragColor = vec4(c, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildSeams(b: Board): SeamLayer {
  const ts = b.tileSize;
  const pos: number[] = [];
  const local: number[] = [];
  const parity: number[] = [];
  const idx: number[] = [];
  for (const t of b.tiles) {
    const x0 = t.col * ts;
    const z0 = t.row * ts;
    const base = pos.length / 3;
    const p = (t.row + t.col) % 2;
    for (const [lx, lz] of [
      [-EXT, -EXT],
      [ts + EXT, -EXT],
      [ts + EXT, ts + EXT],
      [-EXT, ts + EXT],
    ] as const) {
      pos.push(x0 + lx, SEAM_Y, z0 + lz);
      local.push(lx, lz);
      parity.push(p);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
  geo.setAttribute('aParity', new THREE.Float32BufferAttribute(parity, 1));
  geo.setIndex(idx);
  const mat = seamMaterial(ts, SEAM_COLOR, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'seams';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    setTop(t) {
      shared.uTop.value = Math.min(1, Math.max(0, t));
    },
    setHighContrast(on) {
      shared.uHC.value = on ? 1 : 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function seamMaterial(ts: number, c: THREE.Color, tint: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uColor: { value: c.clone() },
      uTint: { value: color(COLORS.ink).multiplyScalar(tint) },
      uSize: { value: ts },
      uHalf: { value: 0.03 },
      uHalfTop: { value: 0.05 },
      uTop: shared.uTop,
      uHC: shared.uHC,
      uMinPx: { value: 1.25 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** A road crossing a tile border: the border square pair's shared edge. */
export interface SeamCrossing {
  /** World point on the seam, at the road's centre line. */
  x: number;
  z: number;
  /** Seam runs along z (a vertical border, road E-W) or along x. */
  alongZ: boolean;
}

/**
 * The seam line across roads (ink on asphalt, 3:1 or better), same width rules as on the print.
 * Drawn just above the road surface; zebras and dashes keep clear of it.
 */
export function buildRoadSeams(ts: number, crossings: readonly SeamCrossing[]): { mesh: THREE.Mesh; dispose(): void } | null {
  if (!crossings.length) return null;
  const pos: number[] = [];
  const local: number[] = [];
  const parity: number[] = [];
  const idx: number[] = [];
  const E = 0.25;
  for (const c of crossings) {
    const base = pos.length / 3;
    // Local coordinates of a tile whose west (or north) edge is the seam: d = |l.x| (or |l.y|).
    const quad: [number, number, number, number][] = c.alongZ
      ? [
          [c.x - E, c.z - 0.5, -E, 2],
          [c.x + E, c.z - 0.5, E, 2],
          [c.x + E, c.z + 0.5, E, 3],
          [c.x - E, c.z + 0.5, -E, 3],
        ]
      : [
          [c.x - 0.5, c.z - E, 2, -E],
          [c.x + 0.5, c.z - E, 3, -E],
          [c.x + 0.5, c.z + E, 3, E],
          [c.x - 0.5, c.z + E, 2, E],
        ];
    for (const [x, z, lx, lz] of quad) {
      pos.push(x, ROAD_TOP + 0.004, z);
      local.push(lx, lz);
      parity.push(0);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
  geo.setAttribute('aParity', new THREE.Float32BufferAttribute(parity, 1));
  geo.setIndex(idx);
  const mat = seamMaterial(ts, color(BOARD.seamOnRoad), 0.6);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'roadSeams';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Rim labels
// ---------------------------------------------------------------------------

export const tileColName = (col: number): string => String.fromCharCode(65 + col);
/** Tile name for table talk and list fallbacks ("B3" = column B, row 3). */
export const tileName = (row: number, col: number): string => `${tileColName(col)}${row + 1}`;

const labelTex = new Map<string, THREE.Texture>();
function rimLabelTexture(text: string): THREE.Texture {
  const hit = labelTex.get(text);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const draw = () => {
    ctx.clearRect(0, 0, 128, 128);
    // Printed on the wood (no frame): cream ink, 6:1 on the table.
    ctx.fillStyle = BOARD.rim;
    ctx.font = `700 104px ${LABEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 70);
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  labelTex.set(text, tex);
  // Barlow Condensed may still be loading: redraw once it is there (next frame picks it up).
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (fonts && !fonts.check(`700 104px ${LABEL_FONT}`))
    void fonts
      .load(`700 104px ${LABEL_FONT}`)
      .then(() => {
        draw();
        tex.needsUpdate = true;
      })
      .catch(() => undefined);
  return tex;
}

const LABEL_FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

/** `off`: distance of the label centres from the map edge; `y`: height to print them at (the table). */
export function buildRimLabels(b: Board, off: number, y: number): { group: THREE.Group; setYaw(yaw: number): void; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'rimLabels';
  const ts = b.tileSize;
  const geo = new THREE.PlaneGeometry(0.72, 0.72).rotateX(-Math.PI / 2);
  const mats: THREE.Material[] = [];
  const add = (text: string, x: number, z: number) => {
    const mat = new THREE.MeshBasicMaterial({ map: rimLabelTexture(text), transparent: true, depthWrite: false, toneMapped: false });
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.renderOrder = 1;
    group.add(m);
  };
  const cols = Math.round(b.w / ts);
  const rows = Math.round(b.h / ts);
  for (let c = 0; c < cols; c++) {
    add(tileColName(c), c * ts + ts / 2, -off);
    add(tileColName(c), c * ts + ts / 2, b.h + off);
  }
  for (let r = 0; r < rows; r++) {
    add(String(r + 1), -off, r * ts + ts / 2);
    add(String(r + 1), b.w + off, r * ts + ts / 2);
  }
  return {
    group,
    /** Turn the letters to read upright for the camera's yaw (quarter turns). */
    setYaw(yaw: number) {
      const q = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
      for (const m of group.children) m.rotation.y = q;
    },
    dispose() {
      geo.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
