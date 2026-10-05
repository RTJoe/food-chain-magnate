/**
 * Tile seams (ux-plan §3.4 layer 2): a shader line on every map tile edge, drawn just above the
 * grass (roads and minis cover it). The line has a world width (0.05, 0.09 in top view) and a
 * minimum width in pixels, so it stays visible at any zoom and on phones. High contrast doubles the
 * width and tints every other tile 4%.
 *
 * Also: tile coordinate labels on the rim (columns A, B, ...; rows 1, 2, ...).
 */
import * as THREE from 'three';
import type { Board } from '@fcm/engine';
import { COLORS } from '../../theme.js';
import { RIM } from '../coords.js';
import { shade } from '../minis/kit.js';

/** Seam line colour: tileEdge darkened (≥ 3:1 against grass). */
export const SEAM_COLOR = shade(COLORS.tileEdge, -0.58);
const SEAM_Y = 0.016;
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
  vec3 c = mix(uTint, uColor, a / max(a + t, 1e-5));
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
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uColor: { value: SEAM_COLOR.clone() },
      uTint: { value: shade(COLORS.ink, 0) },
      uSize: { value: ts },
      uHalf: { value: 0.03 },
      uHalfTop: { value: 0.05 },
      uTop: { value: 0 },
      uHC: { value: 0 },
      uMinPx: { value: 1.25 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'seams';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    setTop(t) {
      mat.uniforms.uTop!.value = Math.min(1, Math.max(0, t));
    },
    setHighContrast(on) {
      mat.uniforms.uHC!.value = on ? 1 : 0;
    },
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
  let t = labelTex.get(text);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `#${shade(COLORS.lot, -0.42).getHexString()}`;
  ctx.font = '800 92px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  labelTex.set(text, t);
  return t;
}

export function buildRimLabels(b: Board): { group: THREE.Group; setYaw(yaw: number): void; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'rimLabels';
  const ts = b.tileSize;
  const geo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
  const mats: THREE.Material[] = [];
  const add = (text: string, x: number, z: number) => {
    const mat = new THREE.MeshBasicMaterial({ map: rimLabelTexture(text), transparent: true, depthWrite: false, toneMapped: false });
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.065, z);
    m.renderOrder = 1;
    group.add(m);
  };
  const cols = Math.round(b.w / ts);
  const rows = Math.round(b.h / ts);
  const off = RIM * 0.5;
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
