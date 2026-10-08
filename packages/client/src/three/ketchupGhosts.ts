/**
 * Ketchup placement previews (ux-plan §2.4, WP5). Used by the ghost builder in interaction.ts.
 *
 * - `buildTileGhost`: the extra map tile as it will look (grass, its roads with centre lines,
 *   houses with their numbers, drink sources, parks), turned by the placement's rotation, on a
 *   lifted slab framed in the player colour.
 * - `roadworksPreview`: the road squares a lobbyist road's arrows point at get a roadworks cone
 *   and a "+1" chip (every road route through them gets one border longer).
 * - `freewayLink`: dotted link from the freeway ramp to the rural area, with its demand.
 * - `ruralTargets`: the four sides of the rural area as targets (free sides lit, taken ones grey).
 */
import * as THREE from 'three';
import { listModules } from '@fcm/engine';
import type { Board, Cell, Direction, Rotation, TileDef, TileTemplateId } from '@fcm/engine';
import { COLORS } from '../theme.js';
import { DELTA, DIRS, RIM, ROAD_TOP, edgeStrip } from './coords.js';
import { campaignAnchor, freewayAnchor, ruralCenter, RURAL_SIZE } from './layout.js';
import { bridgeMesh } from './board/roads.js';
import { buildApartment, buildGarden, buildHouse } from './minis/buildings.js';
import { owned, type MiniCtx } from './minis/ctx.js';
import { buildDrinkSource } from './minis/drinks.js';
import { buildPark, buildRoadworks } from './minis/ketchup.js';
import { shade } from './minis/kit.js';
import { makeChip } from './overlays/badges.js';

let tiles: Map<string, TileDef> | null = null;

/** Tile template by id, from every module's content (cached). */
export function tileDef(id: TileTemplateId | string | undefined): TileDef | null {
  if (!id) return null;
  if (!tiles) {
    tiles = new Map();
    try {
      for (const m of listModules()) for (const t of m.content.tiles ?? []) tiles.set(t.id, t);
    } catch {
      /* no engine content: plain slab */
    }
  }
  return tiles.get(id) ?? null;
}

/** One clockwise rotation maps canonical (r, c) to (c, 4 − r) (map.md §3). */
export function rotateTileCell(r: number, c: number, rotation: number): [number, number] {
  let rr = r;
  let cc = c;
  for (let i = 0; i < rotation; i++) [rr, cc] = [cc, 4 - rr];
  return [rr, cc];
}

const mat = (color: THREE.ColorRepresentation, opacity = 1) =>
  owned(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, transparent: opacity < 1, opacity, flatShading: true }));

/**
 * The tile `def` turned by `rotation`, centred on the origin (5 × 5 units), lifted a little.
 * Real minis for houses / drinks / parks; roads and grass drawn here.
 */
export function buildTileGhost(ctx: MiniCtx, def: TileDef | null, rotation: Rotation, color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tileGhost';
  const lift = new THREE.Group();
  lift.position.y = 0.16;
  g.add(lift);
  const real: MiniCtx = { inst: ctx.inst };
  // Slab + player-colour frame.
  const slab = new THREE.Mesh(owned(new THREE.BoxGeometry(4.92, 0.1, 4.92)), mat(COLORS.grass, def ? 0.92 : 0.6));
  slab.position.y = -0.05;
  lift.add(slab);
  const frame = new THREE.Mesh(owned(new THREE.BoxGeometry(5.12, 0.06, 5.12)), owned(new THREE.MeshBasicMaterial({ color, toneMapped: false })));
  frame.position.y = -0.08;
  lift.add(frame);
  if (!def) return g;
  const at = (r: number, c: number): [number, number] => {
    const [rr, cc] = rotateTileCell(r, c, rotation);
    return [cc + 0.5 - 2.5, rr + 0.5 - 2.5];
  };
  // Roads (asphalt squares + centre dashes towards linked neighbours / tile exits).
  const road = new Set<string>();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (def.grid[r]?.[c] === '#') road.add(`${r},${c}`);
  const asphaltGeo = owned(new THREE.BoxGeometry(1, 0.03, 1));
  const asphalt = mat(COLORS.road);
  const dashGeoNS = owned(new THREE.BoxGeometry(0.06, 0.01, 0.3));
  const dashGeoEW = owned(new THREE.BoxGeometry(0.3, 0.01, 0.06));
  const line = owned(new THREE.MeshBasicMaterial({ color: COLORS.roadLine, toneMapped: false }));
  const RC: Record<Direction, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  for (const k of road) {
    const [r, c] = k.split(',').map(Number) as [number, number];
    const [x, z] = at(r, c);
    const a = new THREE.Mesh(asphaltGeo, asphalt);
    a.position.set(x, 0.015, z);
    lift.add(a);
    for (const d of DIRS) {
      const nr = r + RC[d][0];
      const nc = c + RC[d][1];
      const outside = nr < 0 || nr > 4 || nc < 0 || nc > 4;
      if (!outside && !road.has(`${nr},${nc}`)) continue;
      if (outside && !((d === 'N' && r === 0 && c === 2) || (d === 'S' && r === 4 && c === 2) || (d === 'W' && c === 0 && r === 2) || (d === 'E' && c === 4 && r === 2))) continue;
      const [nx, nz] = at(nr, nc);
      const dx = Math.sign(nx - x);
      const dz = Math.sign(nz - z);
      const dash = new THREE.Mesh(dx !== 0 ? dashGeoEW : dashGeoNS, line);
      dash.position.set(x + dx * 0.25, 0.035, z + dz * 0.25);
      lift.add(dash);
    }
  }
  // Houses and apartments (numbers as on the printed tile).
  for (const h of def.houses) {
    const pts = h.cells.map(([r, c]) => at(r, c));
    const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
    const cz = pts.reduce((n, p) => n + p[1], 0) / pts.length;
    const mini = h.kind === 'apartment' ? buildApartment(real, { label: h.label, facing: 'S' }) : buildHouse(real, { label: h.label, facing: 'S', placed: false, variant: h.order % 6 });
    mini.position.set(cx, 0, cz);
    lift.add(mini);
  }
  // Printed gardens (tile W) and the overpass (tiles G, P), as on the board.
  for (const h of def.houses) {
    if (!h.garden?.length) continue;
    const pts = h.garden.map(([r, c]) => at(r, c));
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    const hp = h.cells.map(([r, c]) => at(r, c));
    const hx = hp.reduce((n, p) => n + p[0], 0) / hp.length;
    const hz = hp.reduce((n, p) => n + p[1], 0) / hp.length;
    const gx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const gz = (Math.max(...zs) + Math.min(...zs)) / 2;
    const vertical = Math.max(...zs) - Math.min(...zs) > Math.max(...xs) - Math.min(...xs);
    const house: Direction = vertical ? (hx < gx ? 'W' : 'E') : hz < gz ? 'N' : 'S';
    const mini = buildGarden(real, { vertical, house });
    mini.position.set(gx, 0, gz);
    lift.add(mini);
  }
  if (def.bridge) {
    const [x, z] = at(def.bridge[0], def.bridge[1]);
    const br = bridgeMesh();
    br.position.set(x, 0, z);
    lift.add(br);
  }
  for (const d of def.drinks) {
    const [x, z] = at(d.cell[0], d.cell[1]);
    const mini = buildDrinkSource(real, { drink: d.drink });
    mini.position.set(x, 0, z);
    lift.add(mini);
  }
  for (const p of def.parks ?? []) {
    const pts = p.map(([r, c]) => at(r, c));
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...zs) - Math.min(...zs) + 1;
    const mini = buildPark(real, { w, h });
    mini.position.set((Math.max(...xs) + Math.min(...xs)) / 2, 0, (Math.max(...zs) + Math.min(...zs)) / 2);
    lift.add(mini);
  }
  return g;
}

/** Road squares a lobbyist road's arrows point at (they get roadworks). World coordinates. */
export function roadworksTargets(b: Board, arrows: readonly { from: Cell; dir: Direction }[]): Cell[] {
  const out: Cell[] = [];
  for (const a of arrows) {
    const t = { x: a.from.x + DELTA[a.dir][0], y: a.from.y + DELTA[a.dir][1] };
    if (b.cells[t.y]?.[t.x]?.road) out.push(t);
  }
  return out;
}

function arrowGlyph(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.36);
  s.lineTo(0.3, 0.02);
  s.lineTo(0.12, 0.02);
  s.lineTo(0.12, 0.3);
  s.lineTo(-0.12, 0.3);
  s.lineTo(-0.12, 0.02);
  s.lineTo(-0.3, 0.02);
  s.closePath();
  return s;
}

/**
 * Lobbyist road preview: a bold arrow on each end square pointing where the road connects, and on
 * the road squares the arrows point at a tinted square, a roadworks cone and a "+1" chip.
 */
export function roadworksPreview(ctx: MiniCtx, b: Board, arrows: readonly { from: Cell; dir: Direction }[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roadworksPreview';
  const glyph = owned(new THREE.ShapeGeometry(arrowGlyph()).rotateX(Math.PI / 2));
  const edge = owned(new THREE.ShapeGeometry(arrowGlyph()).rotateX(Math.PI / 2).scale(1.3, 1, 1.3));
  const ink = owned(new THREE.MeshBasicMaterial({ color: COLORS.ink, toneMapped: false, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
  const rim = owned(new THREE.MeshBasicMaterial({ color: COLORS.surface, toneMapped: false, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
  const ANG: Record<Direction, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };
  for (const a of arrows) {
    const o = new THREE.Group();
    // Shape points to -z (north) after the rotation; turn it to the arrow direction, nudge outwards.
    o.position.set(a.from.x + 0.5 + DELTA[a.dir][0] * 0.18, 0.2, a.from.y + 0.5 + DELTA[a.dir][1] * 0.18);
    o.rotation.y = ANG[a.dir];
    const e = new THREE.Mesh(edge, rim);
    e.renderOrder = 8;
    const m = new THREE.Mesh(glyph, ink);
    m.position.y = 0.004;
    m.renderOrder = 9;
    o.add(e, m);
    g.add(o);
  }
  const sq = owned(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2));
  const tint = owned(new THREE.MeshBasicMaterial({ color: '#f08a3c', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  for (const c of roadworksTargets(b, arrows)) {
    const m = new THREE.Mesh(sq, tint);
    m.position.set(c.x + 0.5, ROAD_TOP + 0.02, c.y + 0.5);
    m.renderOrder = 6;
    g.add(m);
    const cone = buildRoadworks(ctx);
    cone.position.set(c.x + 0.5, ROAD_TOP, c.y + 0.5);
    g.add(cone);
    const chip = makeChip('+1', null, '#c25e1c', 0.34);
    chip.center.set(0.5, 0);
    chip.position.set(c.x + 0.5, 0.95, c.y + 0.5);
    g.add(chip);
  }
  return g;
}

/** Where the rural area sits (or will sit once a first freeway goes on `side`). */
export function ruralCentreFor(b: Board, side: Direction): [number, number] {
  if (Object.values(b.entities).some((e) => e.kind === 'freeway')) return ruralCenter(b);
  const len = side === 'N' || side === 'S' ? b.w : b.h;
  const s = edgeStrip(side, 0, len, b.w, b.h, RIM + RURAL_SIZE / 2 + 0.8);
  return [s.x, s.z];
}

/** Dotted link from the freeway ramp end to the rural area, and a chip with the rural demand. */
export function freewayLink(b: Board, side: Direction, offset: number, color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'freewayLink';
  const a = freewayAnchor(b, side, offset);
  const [dx, dz] = DELTA[side];
  // From the ramp's raised end (3.6 out from the edge) to the rural area.
  const p0 = new THREE.Vector3(a.x + dx * 4.2, 0.12, a.z + dz * 4.2);
  const [rx, rz] = ruralCentreFor(b, side);
  const p1 = new THREE.Vector3(rx, 0.12, rz);
  const n = Math.max(2, Math.round(p0.distanceTo(p1) / 0.55));
  const dot = owned(new THREE.CircleGeometry(0.2, 14).rotateX(-Math.PI / 2));
  const m = owned(new THREE.MeshBasicMaterial({ color, toneMapped: false, depthWrite: false, transparent: true, opacity: 0.95 }));
  for (let i = 0; i <= n; i++) {
    const d = new THREE.Mesh(dot, m);
    d.position.lerpVectors(p0, p1, i / n);
    d.renderOrder = 6;
    g.add(d);
  }
  const rural = Object.values(b.houses).find((h) => h.kind === 'rural');
  const chip = makeChip(rural ? `Rural · ${rural.demand.length} wanted` : 'Rural area', null, color, 0.4);
  chip.center.set(0.5, 0);
  chip.position.set(rx, 2.6, rz);
  g.add(chip);
  return g;
}

/** The four sides of the rural area as targets: legal sides in the player colour, the rest grey. */
export function ruralTargets(b: Board, legal: ReadonlySet<Direction>, color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ruralTargets';
  const disc = owned(new THREE.CircleGeometry(0.62, 32).rotateX(-Math.PI / 2));
  const ringGeo = owned(new THREE.RingGeometry(0.62, 0.78, 32).rotateX(-Math.PI / 2));
  const on = owned(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  const off = owned(new THREE.MeshBasicMaterial({ color: '#8f8b88', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  const rim = owned(new THREE.MeshBasicMaterial({ color: COLORS.surface, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  for (const side of DIRS) {
    const a = campaignAnchor(b, { kind: 'rural', side });
    const ok = legal.has(side);
    const d = new THREE.Mesh(disc, ok ? on : off);
    d.position.set(a.x, 0.1, a.z);
    d.renderOrder = 6;
    const r = new THREE.Mesh(ringGeo, rim);
    r.position.set(a.x, 0.102, a.z);
    r.renderOrder = 6;
    g.add(d, r);
    const chip = makeChip(ok ? `${side} side` : `${side} taken`, null, ok ? shade(color, -0.25).getStyle() : '#8f8b88', 0.34);
    chip.center.set(0.5, 0);
    chip.position.set(a.x, 0.45, a.z);
    g.add(chip);
  }
  return g;
}
