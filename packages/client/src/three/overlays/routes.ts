/**
 * Buyer route ribbons (ux-plan §3.1). Every candidate is drawn faintly on the road centre; the
 * active one is drawn solid, twice as wide and on top, with chevrons running in the travel
 * direction, a start marker, a "+N drink" chip on each collected source and a tick with the
 * running count on every tile border it crosses. Air routes tint their tiles in order and join
 * the tile centres with a dashed arc.
 */
import * as THREE from 'three';
import type { Board, Cell, DrinkId, FoodId } from '@fcm/engine';
import type { RouteOverlayData, RouteRibbon } from '../../state/boardOverlays.js';
import { COLORS } from '../../theme.js';
import { ROAD_TOP } from '../coords.js';
import { flatMat, makeChip, makeCount, quads, startMarker } from './badges.js';
import { startOrigin } from './fallback.js';

const FAINT_W = 0.24;
const ACTIVE_W = 0.56;
/** Faint candidates sit just above the asphalt; the active haul is raised above the kerbs (0.07). */
const Y = ROAD_TOP + 0.02;
const YA = 0.11;
/** Hit strips: as wide as the asphalt; never drawn (material.visible = false), still raycast. */
const HIT_W = 0.78;

type P2 = [number, number];

/** World polyline (x, z) of a road route: from the start square's edge through the path centres. */
export function routePolyline(b: Board, r: RouteRibbon): P2[] {
  if (r.route.mode !== 'road') return [];
  const path = r.route.path;
  const pts: P2[] = path.map((c) => [c.x + 0.5, c.y + 0.5]);
  const o = startOrigin(b, r.route.from);
  const first = path[0];
  if (o && first && Math.abs(o.x - first.x) + Math.abs(o.y - first.y) === 1) pts.unshift([(o.x + first.x) / 2 + 0.5, (o.y + first.y) / 2 + 0.5]);
  return pts;
}

/** Flat strip along a polyline with mitred joints; uv.x = distance along / width. */
export function ribbonGeometry(pts: readonly P2[], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const hw = width / 2;
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const a = pts[i - 1];
    const c = pts[i + 1];
    const dir = (from: P2, to: P2): P2 => {
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      const l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    };
    const d0 = a ? dir(a, p) : dir(p, c!);
    const d1 = c ? dir(p, c) : d0;
    let nx = -(d0[1] + d1[1]);
    let nz = d0[0] + d1[0];
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    // Miter length: hw / cos(half angle), capped.
    const dot = nx * -d0[1] + nz * d0[0];
    const m = hw / Math.max(0.35, dot);
    if (a) along += Math.hypot(p[0] - a[0], p[1] - a[1]);
    pos.push(p[0] + nx * m, y, p[1] + nz * m, p[0] - nx * m, y, p[1] - nz * m);
    uv.push(along / width, 1, along / width, 0);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

let chevronTex: THREE.CanvasTexture | null = null;
/** Repeating white chevrons pointing along +u on transparent. */
function chevrons(): THREE.CanvasTexture {
  if (chevronTex) return chevronTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 12);
  ctx.lineTo(42, 32);
  ctx.lineTo(20, 52);
  ctx.stroke();
  chevronTex = new THREE.CanvasTexture(c);
  chevronTex.wrapS = THREE.RepeatWrapping;
  // One chevron per ~1.3 ribbon widths.
  chevronTex.repeat.set(0.75, 1);
  chevronTex.wrapT = THREE.ClampToEdgeWrapping;
  chevronTex.colorSpace = THREE.SRGBColorSpace;
  chevronTex.anisotropy = 4;
  return chevronTex;
}

export interface RouteLayer {
  group: THREE.Group;
  tick(dt: number): boolean;
}

export function buildRoutes(b: Board, data: RouteOverlayData): RouteLayer {
  const g = new THREE.Group();
  g.name = 'routes';
  const active = data.candidates.length ? ((data.active % data.candidates.length) + data.candidates.length) % data.candidates.length : -1;
  let chevronMat: THREE.MeshBasicMaterial | null = null;
  // Faint candidates first, the active one last (drawn on top).
  const order = data.candidates.map((_, i) => i).filter((i) => i !== active);
  if (active >= 0) order.push(active);
  for (const i of order) {
    const r = data.candidates[i]!;
    const color = r.color ?? data.color ?? COLORS.focus;
    const isActive = i === active;
    if (r.route.mode === 'air') {
      drawAir(g, b, r, color, isActive, i);
      continue;
    }
    const pts = routePolyline(b, r);
    if (pts.length < 2) continue;
    if (!isActive) {
      // Dim but visible: a thin player-colour line with a dark hairline so it reads on asphalt.
      const under = new THREE.Mesh(ribbonGeometry(pts, FAINT_W + 0.06, Y), flatMat(COLORS.ink, 0.28));
      under.renderOrder = 6;
      under.userData.candidate = i;
      const base = new THREE.Mesh(ribbonGeometry(pts, FAINT_W, Y + 0.002), flatMat(color, 0.5));
      base.renderOrder = 7;
      base.userData.candidate = i;
      base.name = `route:${i}`;
      // Invisible, road-wide hit strip so hovering a dim candidate is easy (pickRoute).
      const hit = new THREE.Mesh(ribbonGeometry(pts, HIT_W, Y), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.candidate = i;
      g.add(under, base, hit);
      continue;
    }
    // Active haul: ink outline, light edge, solid player colour, raised above roads and kerbs.
    const layers: [number, string, number, number][] = [
      [ACTIVE_W + 0.22, COLORS.ink, 0.92, 0],
      [ACTIVE_W + 0.12, COLORS.surface, 0.98, 0.003],
      [ACTIVE_W, color, 0.99, 0.006],
    ];
    // Drawn without depth test so buildings in front of the road never hide the active haul.
    const xray = (m: THREE.Material) => ((m.depthTest = false), m);
    layers.forEach(([w, c, o, dy], k) => {
      const m = new THREE.Mesh(ribbonGeometry(pts, w, YA + dy), xray(flatMat(c, o)));
      m.renderOrder = 11 + k;
      m.userData.candidate = i;
      if (k === 2) m.name = `route:${i}`;
      g.add(m);
    });
    const tex = chevrons();
    const chevColor = luminance(color) > 0.45 ? COLORS.ink : COLORS.surface;
    chevronMat = new THREE.MeshBasicMaterial({ map: tex, color: chevColor, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const chev = new THREE.Mesh(ribbonGeometry(pts, ACTIVE_W * 0.85, YA + 0.01), chevronMat);
    chev.renderOrder = 14;
    g.add(chev);
    const first = r.route.path[0];
    if (first) {
      const mk = startMarker(color, 0.46);
      mk.traverse((o) => {
        o.renderOrder = 15;
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.depthTest = false;
      });
      const o = pts[0]!;
      mk.position.set(o[0], YA + 0.014, o[1]);
      g.add(mk);
    }
    endCap(g, pts, color);
    seamTicks(g, b, r.route.path, color);
    sourceChips(g, b, r, color);
  }
  return {
    group: g,
    tick(dt) {
      if (!chevronMat?.map) return false;
      chevronMat.map.offset.x -= dt * 1.6;
      return true;
    },
  };
}

/** Relative luminance of a CSS hex colour (0 dark … 1 light). */
function luminance(css: string): number {
  const c = new THREE.Color(css);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Arrow head at the end of the active haul, in the player colour with an ink outline. */
function endCap(g: THREE.Group, pts: readonly P2[], color: string): void {
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  if (!a || !b) return;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const tri = (s: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(0.42 * s, 0);
    sh.lineTo(-0.24 * s, 0.38 * s);
    sh.lineTo(-0.24 * s, -0.38 * s);
    sh.closePath();
    return new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2);
  };
  const out = new THREE.Mesh(tri(1.35), flatMat(COLORS.ink, 0.95));
  const fill = new THREE.Mesh(tri(1), flatMat(color, 0.99));
  (out.material as THREE.Material).depthTest = false;
  (fill.material as THREE.Material).depthTest = false;
  out.renderOrder = 15;
  fill.renderOrder = 16;
  for (const [m, dy] of [
    [out, 0.016],
    [fill, 0.02],
  ] as const) {
    m.position.set(b[0], YA + dy, b[1]);
    m.rotation.y = -ang;
    g.add(m);
  }
}

/** Tick across the ribbon on every tile border the path crosses, with the running count. */
function seamTicks(g: THREE.Group, b: Board, path: readonly Cell[], color: string): void {
  const ts = b.tileSize;
  const tile = (c: Cell) => `${Math.floor(c.x / ts)},${Math.floor(c.y / ts)}`;
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const c = path[i]!;
    if (tile(a) === tile(c)) continue;
    n++;
    const x = (a.x + c.x) / 2 + 0.5;
    const z = (a.y + c.y) / 2 + 0.5;
    const horiz = a.y === c.y;
    const tickMat = flatMat(COLORS.ink, 0.99);
    tickMat.depthTest = false;
    const bar = quads([horiz ? { x0: x - 0.05, z0: z - 0.42, x1: x + 0.05, z1: z + 0.42 } : { x0: x - 0.42, z0: z - 0.05, x1: x + 0.42, z1: z + 0.05 }], tickMat, YA + 0.012);
    if (bar) {
      bar.renderOrder = 15;
      g.add(bar);
    }
    const count = makeCount(n, COLORS.ink, 0.3);
    count.position.set(x, 0.35, z);
    count.center.set(0.5, 0);
    g.add(count);
  }
  void color;
}

/** "+N drink" chips over collected sources. */
function sourceChips(g: THREE.Group, b: Board, r: RouteRibbon, color: string): void {
  for (const c of r.collects) {
    const s = b.drinkSources[c.sourceId];
    if (!s) continue;
    const chip = makeChip(`+${c.count}`, s.drink as DrinkId as FoodId, color, 0.5);
    chip.position.set(s.x + 0.5, 1.15, s.y + 0.5);
    chip.center.set(0.5, 0);
    g.add(chip);
  }
}

function drawAir(g: THREE.Group, b: Board, r: RouteRibbon, color: string, active: boolean, i: number): void {
  if (r.route.mode !== 'air') return;
  const ts = b.tileSize;
  const tiles = r.route.tiles;
  const tint = quads(
    tiles.map((t) => ({ x0: t.col * ts, z0: t.row * ts, x1: t.col * ts + ts, z1: t.row * ts + ts })),
    flatMat(color, active ? 0.2 : 0.08),
    0.076,
    0.1,
  );
  if (tint) {
    tint.renderOrder = 4;
    tint.userData.candidate = i;
    g.add(tint);
  }
  if (!active) return;
  // Dashed arc between tile centres.
  const dash = new THREE.BoxGeometry(0.22, 0.05, 0.05);
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  for (let k = 1; k < tiles.length; k++) {
    const a = tiles[k - 1]!;
    const c = tiles[k]!;
    const p0 = new THREE.Vector3(a.col * ts + ts / 2, 0.3, a.row * ts + ts / 2);
    const p1 = new THREE.Vector3(c.col * ts + ts / 2, 0.3, c.row * ts + ts / 2);
    const mid = p0.clone().add(p1).multiplyScalar(0.5).setY(2.2);
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
    const n = 14;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      const m = new THREE.Mesh(dash, mat);
      m.position.copy(curve.getPoint(t));
      m.lookAt(curve.getPoint(Math.min(1, t + 0.02)));
      m.rotateY(Math.PI / 2);
      g.add(m);
    }
  }
  const last = tiles[tiles.length - 1];
  if (last) {
    const mk = startMarker(color, 0.4);
    mk.position.set(last.col * ts + ts / 2, 0.09, last.row * ts + ts / 2);
    g.add(mk);
  }
  sourceChips(g, b, r, color);
}
