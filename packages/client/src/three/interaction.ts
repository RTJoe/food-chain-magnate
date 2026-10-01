/**
 * Picking and placement (architecture §5.2): `setMode`, `onHover`, `onPick`, `highlight`, `focus`.
 *
 * - Place mode: every square covered by an engine-supplied legal placement is tinted; the pointer
 *   snaps to the nearest legal spot and shows a translucent ghost of the piece. Placements that
 *   share a spot (entrance corners, garden sides) are variants: R or the rotate button cycles.
 *   Mouse click picks. Touch: first tap stages the spot, second tap (or confirm) picks.
 * - Idle: hovering a piece rings it; clicking reports `{ kind: 'object', id }`.
 * - Inspect: rings the given ids.
 */
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { Board, Placement } from '@fcm/engine';
import type { BoardPick, InteractionMode } from '../state/boardBridge.js';
import { boardHover, confirmRequest, pendingPlacement, pendingVariants, rotateRequest } from '../state/interaction.js';
import { COLORS } from '../theme.js';
import type { CameraController, PointerInfo } from './camera.js';
import { campaignAnchor, freewayAnchor, gardenRect, placementCells, placementHitRect, rectCenter, rectOf, spotKey, type Rect } from './layout.js';
import { buildGarden, buildHouse } from './minis/buildings.js';
import { owned, releaseTree, type MiniCtx } from './minis/ctx.js';
import { buildFreeway, buildLobbyistRoad, buildPark } from './minis/ketchup.js';
import { shade } from './minis/kit.js';
import { buildAirplane, buildBillboard, buildGiantBillboard, buildGourmetGuide, buildMailbox, buildRadio, type CampaignVisual } from './minis/marketing.js';
import { buildCoffeeShop, buildRestaurant } from './minis/restaurant.js';
import type { Placed, Reconciler } from './reconcile.js';
import type { Stage } from './scene.js';

interface Spot {
  key: string;
  rect: Rect;
  variants: Placement[];
}

export interface HoverInfo {
  id: string | null;
  cell: { x: number; y: number } | null;
  placement: Placement | null;
}

const HL_Y = 0.045;

export class Interaction {
  private mode: InteractionMode = { kind: 'idle' };
  private spots: Spot[] = [];
  private hoverSpot: Spot | null = null;
  private variantIdx = new Map<string, number>();
  private pinnedVariant = new Set<string>();
  private staged: { spot: Spot; idx: number } | null = null;
  private lastPointer: PointerInfo | null = null;

  private cellsMesh: THREE.InstancedMesh | null = null;
  private cursorMesh: THREE.Mesh;
  private rings = new THREE.Group();
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private ghostMats = new Map<string, THREE.Material>();
  private hlMat: THREE.MeshBasicMaterial;
  private pickListeners = new Set<(p: BoardPick) => void>();
  private hoverListeners = new Set<(h: HoverInfo | null) => void>();
  private highlighted: string[] = [];
  private hoverObj: Placed | null = null;
  private disposers: (() => void)[] = [];
  private pulseT = 0;

  constructor(
    private readonly stage: Stage,
    private readonly cam: CameraController,
    private readonly rec: Reconciler,
  ) {
    this.hlMat = new THREE.MeshBasicMaterial({ color: COLORS.highlightOk, transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.cursorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.highlightBad, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
    );
    this.cursorMesh.visible = false;
    this.cursorMesh.renderOrder = 3;
    this.rings.name = 'rings';
    stage.overlay.add(this.cursorMesh, this.rings);

    cam.onHover = (p) => this.hover(p);
    cam.onTap = (p) => this.tap(p);
    const key = (e: KeyboardEvent) => this.key(e);
    window.addEventListener('keydown', key);
    this.disposers.push(() => window.removeEventListener('keydown', key));

    // Overlay buttons (state/interaction.ts).
    let firstC = true;
    this.disposers.push(
      effect(() => {
        void confirmRequest.value;
        if (firstC) return void (firstC = false);
        this.confirmStaged();
      }),
    );
    let firstR = true;
    this.disposers.push(
      effect(() => {
        void rotateRequest.value;
        if (firstR) return void (firstR = false);
        this.rotate();
      }),
    );
    const pulse = (dt: number) => {
      if (this.mode.kind !== 'place' || !this.cellsMesh) return;
      this.pulseT += dt;
      this.hlMat.opacity = 0.44 + Math.sin(this.pulseT * 3.2) * 0.1;
      this.stage.invalidate();
    };
    stage.onFrame.add(pulse);
    this.disposers.push(() => stage.onFrame.delete(pulse));
  }

  // --- Public API (§5.2) --------------------------------------------------------

  setMode(mode: InteractionMode): void {
    this.mode = mode;
    this.staged = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
    this.variantIdx.clear();
    this.pinnedVariant.clear();
    this.hoverSpot = null;
    this.clearGhost();
    this.buildSpots();
    this.highlighted = mode.kind === 'inspect' ? mode.ids : [];
    this.refreshRings();
    if (this.lastPointer) this.hover(this.lastPointer);
    this.stage.invalidate();
  }

  /** Re-run after the board changes (view update) so spots and rings follow. */
  refresh(): void {
    this.buildSpots();
    this.refreshRings();
    if (this.lastPointer) this.hover(this.lastPointer);
  }

  onPick(l: (p: BoardPick) => void): () => void {
    this.pickListeners.add(l);
    return () => this.pickListeners.delete(l);
  }

  onHover(l: (h: HoverInfo | null) => void): () => void {
    this.hoverListeners.add(l);
    return () => this.hoverListeners.delete(l);
  }

  /** Ring pieces by engine id (in any mode). */
  highlight(ids: string[]): void {
    this.highlighted = ids;
    this.refreshRings();
  }

  /** Glide the camera to the given pieces. */
  focus(ids: string[]): void {
    const ps = ids.flatMap((id) => this.rec.byId(id));
    if (!ps.length) return;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const p of ps) {
      x0 = Math.min(x0, p.rect.x0);
      z0 = Math.min(z0, p.rect.z0);
      x1 = Math.max(x1, p.rect.x1);
      z1 = Math.max(z1, p.rect.z1);
    }
    this.cam.focusRect(x0, z0, x1, z1);
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.clearGhost();
    this.clearCells();
    this.clearRings();
    this.cursorMesh.geometry.dispose();
    (this.cursorMesh.material as THREE.Material).dispose();
    this.hlMat.dispose();
    for (const m of this.ghostMats.values()) m.dispose();
  }

  // --- Spots & highlights -----------------------------------------------------------

  private buildSpots(): void {
    this.clearCells();
    this.spots = [];
    const b = this.rec.board;
    if (this.mode.kind !== 'place' || !b) return;
    const byKey = new Map<string, Spot>();
    for (const p of this.mode.placements) {
      const rect = placementHitRect(b, p);
      if (!rect) continue;
      const k = spotKey(b, p);
      let s = byKey.get(k);
      if (!s) {
        s = { key: k, rect, variants: [] };
        byKey.set(k, s);
      }
      s.variants.push(p);
    }
    this.spots = [...byKey.values()];
    // Tint: union of covered squares, plus off-board strips as whole rectangles.
    const quads = new Map<string, Rect>();
    for (const p of this.mode.placements) {
      const cells = placementCells(p);
      if (cells.length) for (const c of cells) quads.set(`${c.x},${c.y}`, rectOf(c.x, c.y, 1, 1));
      else {
        const r = placementHitRect(b, p);
        if (r) quads.set(`r:${r.x0},${r.z0},${r.x1},${r.z1}`, r);
      }
    }
    if (!quads.size) return;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, this.hlMat, quads.size);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const r of quads.values()) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      m.makeScale(w - 0.08, 1, d - 0.08).setPosition((r.x0 + r.x1) / 2, HL_Y, (r.z0 + r.z1) / 2);
      mesh.setMatrixAt(i++, m);
    }
    mesh.renderOrder = 2;
    mesh.name = 'legal';
    this.cellsMesh = mesh;
    this.stage.overlay.add(mesh);
  }

  private clearCells(): void {
    if (!this.cellsMesh) return;
    this.cellsMesh.removeFromParent();
    this.cellsMesh.geometry.dispose();
    this.cellsMesh.dispose();
    this.cellsMesh = null;
  }

  private spotAt(ground: THREE.Vector3): Spot | null {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const s of this.spots) {
      const r = s.rect;
      const pad = 0.05;
      if (ground.x < r.x0 - pad || ground.x > r.x1 + pad || ground.z < r.z0 - pad || ground.z > r.z1 + pad) continue;
      const [cx, cz] = rectCenter(r);
      const d = (ground.x - cx) ** 2 + (ground.z - cz) ** 2;
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  /** Default variant: for restaurants, the entrance corner nearest the pointer. */
  private variantFor(s: Spot, ground: THREE.Vector3 | null): number {
    if (this.pinnedVariant.has(s.key)) return this.variantIdx.get(s.key) ?? 0;
    const first = s.variants[0];
    if (ground && first && (first.kind === 'restaurant' || first.kind === 'moveRestaurant') && s.variants.length > 1) {
      const [cx, cz] = rectCenter(s.rect);
      const want = `${ground.z < cz ? 'N' : 'S'}${ground.x < cx ? 'W' : 'E'}`;
      const i = s.variants.findIndex((v) => 'entrance' in v && v.entrance === want);
      if (i >= 0) return i;
    }
    if (ground && first?.kind === 'house' && s.variants.length > 1) {
      const [cx, cz] = rectCenter(s.rect);
      const dx = ground.x - cx;
      const dz = ground.z - cz;
      const want = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N';
      const i = s.variants.findIndex((v) => v.kind === 'house' && v.gardenSide === want);
      if (i >= 0) return i;
    }
    return this.variantIdx.get(s.key) ?? 0;
  }

  // --- Pointer --------------------------------------------------------------------

  private hover(p: PointerInfo | null): void {
    this.lastPointer = p;
    const canvas = this.stage.renderer.domElement;
    if (!p) {
      this.cursorMesh.visible = false;
      if (!this.staged) this.showGhost(null, 0);
      this.setHoverObj(null);
      this.emitHover(null);
      canvas.style.cursor = '';
      this.stage.invalidate();
      return;
    }
    const ground = this.cam.groundAt(p.x, p.y);
    const b = this.rec.board;
    const cell = ground && b && ground.x >= 0 && ground.z >= 0 && ground.x < b.w && ground.z < b.h ? { x: Math.floor(ground.x), y: Math.floor(ground.z) } : null;

    if (this.mode.kind === 'place') {
      const s = ground ? this.spotAt(ground) : null;
      this.hoverSpot = s;
      if (s) {
        const idx = this.variantFor(s, ground);
        this.variantIdx.set(s.key, idx);
        if (!this.staged) this.showGhost(s, idx);
        this.cursorMesh.visible = false;
      } else {
        if (!this.staged) this.showGhost(null, 0);
        this.cursorMesh.visible = !!cell && p.type === 'mouse';
        if (cell) this.cursorMesh.position.set(cell.x + 0.5, HL_Y + 0.002, cell.y + 0.5);
      }
      canvas.style.cursor = s ? 'pointer' : cell ? 'not-allowed' : '';
      this.emitHover({ id: null, cell, placement: s ? (s.variants[this.variantIdx.get(s.key) ?? 0] ?? null) : null });
    } else {
      this.cursorMesh.visible = false;
      const obj = this.objectAt(p);
      this.setHoverObj(obj);
      canvas.style.cursor = obj?.id ? 'pointer' : '';
      this.emitHover({ id: obj?.id ?? null, cell, placement: null });
    }
    this.stage.invalidate();
  }

  private tap(p: PointerInfo): void {
    this.hover(p);
    if (this.mode.kind === 'place') {
      const s = this.hoverSpot;
      if (!s) {
        if (this.staged) this.unstage();
        return;
      }
      const idx = this.variantIdx.get(s.key) ?? 0;
      if (p.type === 'mouse') return this.pick(s.variants[idx]!);
      // Touch / pen: stage, then confirm on a second tap of the same spot.
      if (this.staged && this.staged.spot.key === s.key) return this.confirmStaged();
      this.staged = { spot: s, idx };
      this.showGhost(s, idx);
      pendingPlacement.value = s.variants[idx] ?? null;
      pendingVariants.value = s.variants.length;
      this.stage.invalidate();
      return;
    }
    const obj = this.objectAt(p);
    if (obj?.id) this.emit({ kind: 'object', id: obj.id });
  }

  private key(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (this.mode.kind !== 'place') return;
    if (e.key === 'Escape') {
      if (this.staged) this.unstage();
      else this.emit({ kind: 'cancel' });
    } else if (e.key === 'r' || e.key === 'R') {
      this.rotate();
    } else if (e.key === 'Enter') {
      if (this.staged) this.confirmStaged();
      else if (this.hoverSpot) this.pick(this.hoverSpot.variants[this.variantIdx.get(this.hoverSpot.key) ?? 0]!);
    } else return;
    e.preventDefault();
  }

  private rotate(): void {
    const s = this.staged?.spot ?? this.hoverSpot;
    if (!s || s.variants.length < 2) return;
    const idx = ((this.staged?.idx ?? this.variantIdx.get(s.key) ?? 0) + 1) % s.variants.length;
    this.variantIdx.set(s.key, idx);
    this.pinnedVariant.add(s.key);
    if (this.staged) {
      this.staged.idx = idx;
      pendingPlacement.value = s.variants[idx] ?? null;
    }
    this.showGhost(s, idx);
    this.stage.invalidate();
  }

  private confirmStaged(): void {
    if (!this.staged) return;
    const p = this.staged.spot.variants[this.staged.idx];
    if (p) this.pick(p);
  }

  private unstage(): void {
    this.staged = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
    this.showGhost(this.hoverSpot, this.hoverSpot ? (this.variantIdx.get(this.hoverSpot.key) ?? 0) : 0);
  }

  private pick(p: Placement): void {
    this.staged = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
    this.emit({ kind: 'placement', placement: p });
  }

  private emit(p: BoardPick): void {
    for (const l of [...this.pickListeners]) l(p);
  }

  private emitHover(h: HoverInfo | null): void {
    boardHover.value = h ? { id: h.id, cell: h.cell } : null;
    for (const l of [...this.hoverListeners]) l(h);
  }

  /** Nearest piece under the pointer (by footprint box). */
  private objectAt(p: PointerInfo): Placed | null {
    const ray = this.cam.rayAt(p.x, p.y);
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    let best: Placed | null = null;
    let bestD = Infinity;
    for (const it of this.rec.live.values()) {
      if (!it.id || it.kind === 'demand' || it.height <= 0) continue;
      box.min.set(it.rect.x0 + 0.05, 0, it.rect.z0 + 0.05);
      box.max.set(it.rect.x1 - 0.05, it.height, it.rect.z1 - 0.05);
      if (!ray.intersectBox(box, hit)) continue;
      const d = hit.distanceToSquared(ray.origin);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  private setHoverObj(p: Placed | null): void {
    if (p === this.hoverObj) return;
    this.hoverObj = p;
    this.refreshRings();
  }

  // --- Rings ------------------------------------------------------------------------

  private refreshRings(): void {
    this.clearRings();
    const rects: { r: Rect; color: string; y: number }[] = [];
    for (const id of this.highlighted) for (const p of this.rec.byId(id)) if (p.kind !== 'demand') rects.push({ r: p.rect, color: COLORS.focus, y: 0.05 });
    if (this.hoverObj && this.mode.kind !== 'place') rects.push({ r: this.hoverObj.rect, color: COLORS.surface, y: 0.055 });
    const s = this.staged?.spot ?? (this.mode.kind === 'place' ? this.hoverSpot : null);
    if (s) rects.push({ r: s.rect, color: COLORS.highlightOk, y: 0.06 });
    for (const { r, color, y } of rects) this.rings.add(ring(r, color, y));
    this.stage.invalidate();
  }

  private clearRings(): void {
    for (const c of [...this.rings.children]) {
      c.removeFromParent();
      releaseTree(c);
    }
  }

  // --- Ghost ------------------------------------------------------------------------

  private showGhost(s: Spot | null, idx: number): void {
    const p = s?.variants[idx] ?? null;
    const key = p ? JSON.stringify(p) : '';
    if (key === this.ghostKey) return;
    this.clearGhost();
    this.ghostKey = key;
    this.refreshRings();
    const b = this.rec.board;
    if (!p || !b || this.mode.kind !== 'place') return;
    const color = this.mode.color || COLORS.highlightOk;
    const g = buildGhost({ inst: this.stage.inst, ghost: this.ghostMat(color) }, b, p, color);
    if (!g) return;
    g.traverse((o) => {
      o.renderOrder = 4;
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
    this.ghost = g;
    this.stage.overlay.add(g);
    this.stage.invalidate();
  }

  private clearGhost(): void {
    this.ghostKey = '';
    if (!this.ghost) return;
    this.ghost.removeFromParent();
    releaseTree(this.ghost);
    this.ghost = null;
    this.stage.invalidate();
  }

  private ghostMat(color: string): THREE.Material {
    let m = this.ghostMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: shade(color, 0.35), emissive: shade(color, -0.2), emissiveIntensity: 0.35, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.6, flatShading: true });
      this.ghostMats.set(color, m);
    }
    return m;
  }
}

/** Rounded outline ring around a rectangle. */
function ring(r: Rect, color: string, y: number): THREE.Mesh {
  const pad = 0.06;
  const w = r.x1 - r.x0 + pad * 2;
  const d = r.z1 - r.z0 + pad * 2;
  const t = 0.09;
  const rad = 0.22;
  const outer = roundedRect(-w / 2, -d / 2, w, d, rad);
  const inner = roundedRect(-w / 2 + t, -d / 2 + t, w - t * 2, d - t * 2, Math.max(0.02, rad - t));
  outer.holes.push(inner);
  const geo = owned(new THREE.ShapeGeometry(outer, 4).rotateX(Math.PI / 2));
  const mat = owned(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  const m = new THREE.Mesh(geo, mat);
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  m.renderOrder = 5;
  return m;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Translucent preview of the piece a placement would put down. */
export function buildGhost(ctx: MiniCtx, b: Board, p: Placement, color: string): THREE.Group | null {
  const at = (g: THREE.Group, x: number, z: number, y = 0.02): THREE.Group => {
    g.position.set(x, y, z);
    return g;
  };
  switch (p.kind) {
    case 'restaurant':
    case 'moveRestaurant':
      return at(buildRestaurant(ctx, { color, status: 'open', entrance: p.entrance, driveIn: false, mark: '' }), p.x + 1, p.y + 1);
    case 'house': {
      const g = new THREE.Group();
      g.add(at(buildHouse(ctx, { label: String(p.houseOrder), facing: 'S', placed: true, variant: 0 }), p.x + 1, p.y + 1));
      const [gx, gy, gw, gh] = gardenRect(p.x, p.y, p.gardenSide);
      g.add(at(buildGarden(ctx, { vertical: gh > gw }), gx + gw / 2, gy + gh / 2));
      return g;
    }
    case 'garden': {
      const r = placementHitRect(b, p)!;
      const [x, z] = rectCenter(r);
      return at(buildGarden(ctx, { vertical: r.z1 - r.z0 > r.x1 - r.x0 }), x, z);
    }
    case 'campaign': {
      const v: CampaignVisual = { color, goods: [], number: p.tileNumber, remaining: 0, eternal: false };
      const a = campaignAnchor(b, p.placement);
      const pl = p.placement;
      let g: THREE.Group;
      if (pl.kind === 'airplane') g = buildAirplane(ctx, { ...v, width: pl.width });
      else if (pl.kind === 'rural') g = buildGiantBillboard(ctx, v);
      else if (pl.kind === 'offBoard') g = buildGourmetGuide(ctx, v);
      else if (p.campaignKind === 'mailbox') g = buildMailbox(ctx, { ...v, w: pl.w, h: pl.h });
      else if (p.campaignKind === 'radio') g = buildRadio(ctx, { ...v, w: pl.w, h: pl.h });
      else g = buildBillboard(ctx, { ...v, w: pl.w, h: pl.h });
      g.rotation.y = a.rotY;
      return at(g, a.x, a.z, a.y + 0.02);
    }
    case 'coffeeShop':
      return at(buildCoffeeShop(ctx, { color }), p.x + 0.5, p.y + 0.5);
    case 'pizzaRadio':
      return at(buildRadio(ctx, { color, goods: ['pizza'], number: 0, remaining: 0, eternal: false, w: 1, h: 1 }), p.x + 0.5, p.y + 0.5);
    case 'freeMailbox':
      return at(buildMailbox(ctx, { color, goods: [], number: 0, remaining: 0, eternal: false, w: 1, h: 1 }), p.x + 0.5, p.y + 0.5);
    case 'park':
      return at(buildPark(ctx, { w: p.w, h: p.h }), p.x + p.w / 2, p.y + p.h / 2);
    case 'lobbyistRoad': {
      const r = placementHitRect(b, p)!;
      const [x, z] = rectCenter(r);
      return at(buildLobbyistRoad(ctx, { color, cells: p.cells, underConstruction: true, arrows: p.arrows, origin: [x, z] }), x, z);
    }
    case 'freeway': {
      const a = freewayAnchor(b, p.side, p.offset);
      return at(buildFreeway(ctx, { color, side: p.side }), a.x, a.z);
    }
    case 'mapTile': {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(owned(new THREE.BoxGeometry(4.9, 0.1, 4.9)), ctx.ghost);
      slab.position.y = 0.05;
      g.add(slab);
      return at(g, p.col * 5 + 2.5, p.row * 5 + 2.5);
    }
    case 'buyerRoute':
      return null;
  }
}
