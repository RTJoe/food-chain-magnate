/**
 * Picking and placement (architecture §5.2, ux-plan WP3): `setMode`, `onHover`, `onPick`,
 * `highlight`, `focus`.
 *
 * - Place mode: legal squares are tinted; the pointer snaps to the nearest legal spot and shows a
 *   translucent ghost. Placements sharing a spot (entrance corners, garden sides) are variants:
 *   R or the rotate button cycles. Mouse click picks. Touch: first tap stages, second tap (or
 *   confirm / Enter) picks.
 * - Campaign mode: spots are anchor square + tile number (three/spots.ts); variants are the
 *   orientations, and R / rotate / the handle on the ghost flips orientation only (sticky across
 *   spots, published as `ghostOrientation`). The ghost shows the footprint squares, the edges that
 *   touch a road (in range when a range overlay is up) and a rotate handle. Click stages, a second
 *   click / Enter / confirm commits (preview before commit). Tint only where a footprint touches an
 *   in-range road when a range overlay is drawn.
 * - Route mode: no tint; ribbons are drawn by the overlay layer from `routeOverlay`. Hovering a
 *   ribbon makes it the `activeCandidate`; click stages it, a second click / Enter / confirm
 *   commits the exact placement; `[` / `]` cycle.
 * - Idle: hovering a piece rings it; clicking reports `{ kind: 'object', id, objectKind }` (the
 *   bridge turns it into `selection`); clicking empty ground or Esc clears the selection.
 * - Rings: `highlight()` / inspect mode ids, the selection (solid) and its related pieces (faint),
 *   transient `inspectIds`.
 */
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { Board, CampaignOrientation, Placement } from '@fcm/engine';
import type { BoardPick, InteractionMode } from '../state/boardBridge.js';
import { rangeOverlay } from '../state/boardOverlays.js';
import {
  activeCandidate,
  boardHover,
  confirmRequest,
  cycleRequest,
  ghostOrientation,
  hoverPlacement,
  inspectIds,
  pendingPlacement,
  pendingVariants,
  rotateRequest,
  selection,
  selectionRelated,
  type SelectionKind,
} from '../state/interaction.js';
import { COLORS } from '../theme.js';
import type { CameraController, PointerInfo } from './camera.js';
import { DELTA, DIRS } from './coords.js';
import { campaignAnchor, freewayAnchor, gardenRect, placementCells, placementHitRect, rectCenter, rectOf, type Rect } from './layout.js';
import { buildGarden, buildHouse } from './minis/buildings.js';
import { owned, releaseTree, type MiniCtx } from './minis/ctx.js';
import { buildFreeway, buildLobbyistRoad, buildPark } from './minis/ketchup.js';
import { buildTileGhost, freewayLink, roadworksPreview, ruralTargets, tileDef } from './ketchupGhosts.js';
import { shade } from './minis/kit.js';
import { buildAirplane, buildBillboard, buildGiantBillboard, buildGourmetGuide, buildMailbox, buildRadio, type CampaignVisual } from './minis/marketing.js';
import { buildCoffeeShop, buildRestaurant } from './minis/restaurant.js';
import type { Placed, Reconciler } from './reconcile.js';
import type { Stage } from './scene.js';
import { groupSpots, orientationOf, rectContains, type Spot } from './spots.js';

export interface HoverInfo {
  id: string | null;
  cell: { x: number; y: number } | null;
  placement: Placement | null;
}

const HL_Y = 0.045;
/** Ground distance from the rotate handle centre that counts as a click on it. */
const HANDLE_R = 0.5;

type SpotMode = Extract<InteractionMode, { kind: 'place' | 'campaign' }>;
const isSpotMode = (m: InteractionMode): m is SpotMode => m.kind === 'place' || m.kind === 'campaign';
const isCampaignSpot = (s: Spot | null | undefined) => s?.variants[0]?.kind === 'campaign';
/** Spots whose variants are orientations of one piece (R turns it in place; sticky preference). */
const ORIENTED = new Set<Placement['kind']>(['campaign', 'lobbyistRoad', 'park']);
const isOrientedSpot = (s: Spot | null | undefined) => !!s?.variants[0] && ORIENTED.has(s.variants[0].kind);

export class Interaction {
  private mode: InteractionMode = { kind: 'idle' };
  private spots: Spot[] = [];
  private spotOf = new Map<Placement, { spot: Spot; idx: number }>();
  private hoverSpot: Spot | null = null;
  private variantIdx = new Map<string, number>();
  private pinnedVariant = new Set<string>();
  private staged: { spot: Spot; idx: number } | null = null;
  /** Route mode: the staged candidate index. */
  private stagedRoute: number | null = null;
  /** Campaign spots: preferred orientation (sticky; R flips it). */
  private orient: CampaignOrientation = 'landscape';
  private lastPointer: PointerInfo | null = null;
  /** Route candidate under a pointer (wired by the scene to the overlay layer). */
  routeAt: ((p: PointerInfo) => number | null) | null = null;

  private cellsMesh: THREE.InstancedMesh | null = null;
  /** Extra spot markers (rural giant billboard side targets). */
  private extras: THREE.Group | null = null;
  private cursorMesh: THREE.Mesh;
  private rings = new THREE.Group();
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private ghostPlacement: Placement | null = null;
  private handleAt: { x: number; z: number } | null = null;
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
    this.hlMat = new THREE.MeshBasicMaterial({ color: COLORS.highlightLegal, transparent: true, opacity: 0.58, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
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

    // Overlay buttons and panel rows (state/interaction.ts). Skip each effect's first run.
    const onBump = <T>(read: () => T, run: (v: T) => void) => {
      let first = true;
      this.disposers.push(
        effect(() => {
          const v = read();
          if (first) return void (first = false);
          run(v);
        }),
      );
    };
    onBump(() => confirmRequest.value, () => this.confirm());
    onBump(() => rotateRequest.value, () => this.rotate());
    onBump(() => cycleRequest.value, (c) => this.cycle(c.by));
    onBump(() => activeCandidate.value, (i) => this.followCandidate(i));
    onBump(
      () => [selection.value, selectionRelated.value, inspectIds.value] as const,
      () => this.refreshRings(),
    );
    onBump(() => rangeOverlay.value, () => {
      if (this.mode.kind === 'campaign' || (this.mode.kind === 'place' && this.mode.placementKind === 'campaign')) this.buildSpots();
    });

    const pulse = (dt: number) => {
      if (!isSpotMode(this.mode) || !this.cellsMesh) return;
      this.pulseT += dt;
      this.hlMat.opacity = 0.58 + Math.sin(this.pulseT * 3.2) * 0.1;
      this.stage.invalidate();
    };
    stage.onFrame.add(pulse);
    this.disposers.push(() => stage.onFrame.delete(pulse));
  }

  // --- Public API (§5.2) --------------------------------------------------------

  setMode(mode: InteractionMode): void {
    this.mode = mode;
    this.staged = null;
    this.stagedRoute = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
    hoverPlacement.value = null;
    this.variantIdx.clear();
    this.pinnedVariant.clear();
    this.hoverSpot = null;
    ghostOrientation.value = mode.kind === 'campaign' || (mode.kind === 'place' && mode.placementKind === 'campaign') ? this.orient : null;
    this.clearGhost();
    this.buildSpots();
    this.highlighted = mode.kind === 'inspect' ? mode.ids : [];
    this.refreshRings();
    if (this.lastPointer) this.hover(this.lastPointer);
    this.autoStage();
    this.stage.invalidate();
  }

  /** A single off-board spot (gourmet guide) has nothing to aim at: stage it so Confirm is all that is left. */
  private autoStage(): void {
    const only = this.spots.length === 1 ? this.spots[0]! : null;
    const p = only?.variants[0];
    if (only && p?.kind === 'campaign' && p.placement.kind === 'offBoard') this.stageSpot(only, 0);
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

  /** Test / playground access: the current spots. */
  get spotList(): readonly Spot[] {
    return this.spots;
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

  /** Exposes the number of legal spots (route mode: candidates) on the canvas (`data-legal-spots`) for e2e tests and debugging. */
  private publishSpots(): void {
    const n = this.mode.kind === 'route' ? this.mode.placements.length : this.spots.length;
    this.stage.renderer.domElement.dataset.legalSpots = String(n);
  }

  private buildSpots(): void {
    this.clearCells();
    this.spots = [];
    this.spotOf = new Map();
    const b = this.rec.board;
    if (!isSpotMode(this.mode) || !b) return this.publishSpots();
    const placements: readonly Placement[] = this.mode.kind === 'campaign' && this.mode.tileNumber !== null ? this.mode.placements.filter((p) => p.tileNumber === (this.mode as { tileNumber: number }).tileNumber) : this.mode.placements;
    const idx = groupSpots(b, placements);
    this.spots = idx.spots;
    this.spotOf = idx.of;
    // Gourmet guides go beside the ones already out (layout.guideSpot order), not on top of them.
    const guides = Object.values(b.campaigns).filter((c) => c.placement.kind === 'offBoard').length;
    for (const sp of this.spots) {
      const v = sp.variants[0];
      if (v?.kind !== 'campaign' || v.placement.kind !== 'offBoard') continue;
      const r = campaignAnchor(b, v.placement, guides).rect;
      sp.rects = sp.rects.map(() => r);
      sp.hit = { ...r };
    }
    // Rural giant billboards: all four sides as targets (taken / out-of-reach sides grey).
    const ruralSides = new Set(placements.flatMap((p) => (p.kind === 'campaign' && p.placement.kind === 'rural' ? [p.placement.side] : [])));
    if (ruralSides.size) {
      this.extras = ruralTargets(b, ruralSides, this.mode.color || COLORS.focus);
      this.stage.overlay.add(this.extras);
      this.stage.trackSized(this.extras);
    }
    // Keep hover / staged spots pointing at the rebuilt objects.
    if (this.hoverSpot) this.hoverSpot = this.spots.find((s) => s.key === this.hoverSpot!.key) ?? null;
    if (this.staged) {
      const s = this.spots.find((x) => x.key === this.staged!.spot.key);
      this.staged = s && s.variants[this.staged.idx] ? { spot: s, idx: this.staged.idx } : null;
      if (!this.staged) {
        pendingPlacement.value = null;
        pendingVariants.value = 0;
      }
    }
    this.publishSpots();
    // Tint: union of covered squares (campaigns with a range overlay: only squares touching an
    // in-range road), plus off-board strips as whole rectangles.
    const near = this.inRangeRoadNeighbours(b, placements);
    const quads = new Map<string, Rect>();
    for (const p of placements) {
      const cells = placementCells(p);
      if (cells.length) {
        for (const c of cells) if (!near || near.has(`${c.x},${c.y}`)) quads.set(`${c.x},${c.y}`, rectOf(c.x, c.y, 1, 1));
      } else {
        const r = placementHitRect(b, p);
        if (r) quads.set(`r:${r.x0},${r.z0},${r.x1},${r.z1}`, r);
      }
    }
    if (!quads.size) return;
    // With a range overlay (player colour) the legal tint switches to a neutral light wash so the
    // two layers stay distinct whatever the player's colour.
    this.hlMat.color.set(near ? COLORS.surface : COLORS.highlightLegal);
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

  /** Squares orthogonally next to an in-range road (campaign tint filter), or null when no range overlay applies. */
  private inRangeRoadNeighbours(b: Board, placements: readonly Placement[]): Set<string> | null {
    const r = rangeOverlay.peek();
    if (!r || !placements.some((p) => p.kind === 'campaign')) return null;
    const out = new Set<string>();
    for (const road of r.roads) {
      if (road.distance > r.range) continue;
      for (const d of DIRS) {
        const x = road.x + DELTA[d][0];
        const y = road.y + DELTA[d][1];
        if (x >= 0 && y >= 0 && x < b.w && y < b.h) out.add(`${x},${y}`);
      }
    }
    return out;
  }

  private clearCells(): void {
    if (this.extras) {
      this.stage.untrackSized(this.extras);
      this.extras.removeFromParent();
      releaseTree(this.extras);
      this.extras = null;
    }
    if (!this.cellsMesh) return;
    this.cellsMesh.removeFromParent();
    this.cellsMesh.geometry.dispose();
    this.cellsMesh.dispose();
    this.cellsMesh = null;
  }

  private rectFor(s: Spot, idx = this.variantIdx.get(s.key) ?? 0): Rect {
    return s.rects[idx] ?? s.hit;
  }

  private spotAt(ground: THREE.Vector3): Spot | null {
    // After a rotate, keep the same anchor while the pointer stays over any of its orientations.
    const h = this.hoverSpot;
    if (h && this.pinnedVariant.has(h.key) && rectContains(h.hit, ground.x, ground.z, 0.05)) return h;
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const s of this.spots) {
      if (!rectContains(s.hit, ground.x, ground.z, 0.05)) continue;
      const idx = this.variantFor(s, ground);
      const r = this.rectFor(s, idx);
      const [cx, cz] = rectCenter(r);
      let d = (ground.x - cx) ** 2 + (ground.z - cz) ** 2;
      if (!rectContains(r, ground.x, ground.z, 0.05)) d += 100;
      const o = orientationOf(s.variants[idx]!);
      if (o && o !== 'square' && o !== this.orient) d += 50;
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  /** Default variant: entrance corner / garden side nearest the pointer; campaigns: the preferred orientation. */
  private variantFor(s: Spot, ground: THREE.Vector3 | null): number {
    if (this.pinnedVariant.has(s.key)) return this.variantIdx.get(s.key) ?? 0;
    const first = s.variants[0];
    if (first && ORIENTED.has(first.kind) && s.variants.length > 1) {
      const i = s.variants.findIndex((v) => orientationOf(v) === this.orient);
      if (i >= 0) return i;
      if (ground) {
        const j = s.rects.findIndex((r) => rectContains(r, ground.x, ground.z));
        if (j >= 0) return j;
      }
      return 0;
    }
    if (ground && first && (first.kind === 'restaurant' || first.kind === 'moveRestaurant') && s.variants.length > 1) {
      const [cx, cz] = rectCenter(s.hit);
      const want = `${ground.z < cz ? 'N' : 'S'}${ground.x < cx ? 'W' : 'E'}`;
      const i = s.variants.findIndex((v) => 'entrance' in v && v.entrance === want);
      if (i >= 0) return i;
    }
    if (ground && first?.kind === 'house' && s.variants.length > 1) {
      const [cx, cz] = rectCenter(s.hit);
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

    if (this.mode.kind === 'route') {
      const idx = this.routeAt?.(p) ?? null;
      this.cursorMesh.visible = false;
      if (idx !== null && this.stagedRoute === null && idx !== activeCandidate.peek()) activeCandidate.value = idx;
      canvas.style.cursor = idx !== null ? 'pointer' : '';
      const shown = this.stagedRoute ?? activeCandidate.peek();
      this.emitHover({ id: null, cell, placement: this.mode.placements[shown] ?? null });
    } else if (isSpotMode(this.mode)) {
      const onHandle = !!ground && this.overHandle(ground);
      const s = onHandle ? this.hoverSpot : ground ? this.spotAt(ground) : null;
      this.hoverSpot = s;
      if (s) {
        const idx = onHandle ? (this.variantIdx.get(s.key) ?? 0) : this.variantFor(s, ground);
        this.variantIdx.set(s.key, idx);
        if (!this.staged) {
          this.showGhost(s, idx);
          this.setActive(s.variants[idx] ?? null);
        }
        this.cursorMesh.visible = false;
      } else {
        if (!this.staged) this.showGhost(null, 0);
        this.cursorMesh.visible = !!cell && p.type === 'mouse';
        if (cell) this.cursorMesh.position.set(cell.x + 0.5, HL_Y + 0.002, cell.y + 0.5);
      }
      canvas.style.cursor = s || onHandle ? 'pointer' : cell ? 'not-allowed' : '';
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
    const m = this.mode;
    if (m.kind === 'route') {
      const idx = this.routeAt?.(p) ?? null;
      if (idx === null) {
        if (this.stagedRoute !== null) this.unstage();
        return;
      }
      if (this.stagedRoute === idx) return this.pickRoute(idx);
      this.stageRoute(idx);
      return;
    }
    if (isSpotMode(m)) {
      const ground = this.cam.groundAt(p.x, p.y);
      if (ground && this.overHandle(ground)) return this.rotate();
      const s = this.hoverSpot;
      if (!s) {
        if (this.staged) this.unstage();
        return;
      }
      const idx = this.variantIdx.get(s.key) ?? 0;
      // Place mode with a mouse picks at once; campaigns and touch stage first (preview before commit).
      if (p.type === 'mouse' && m.kind === 'place' && !isCampaignSpot(s)) return this.pick(s.variants[idx]!);
      if (this.staged && this.staged.spot.key === s.key) return this.confirm();
      this.stageSpot(s, idx);
      return;
    }
    const obj = this.objectAt(p);
    if (obj?.id) this.emit({ kind: 'object', id: obj.id, objectKind: obj.kind as SelectionKind | 'garden' });
    else if (selection.peek()) selection.value = null;
  }

  private key(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const m = this.mode;
    if (m.kind === 'idle' || m.kind === 'inspect') {
      if (e.key === 'Escape' && selection.peek()) {
        selection.value = null;
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (this.staged || this.stagedRoute !== null) this.unstage();
      else this.emit({ kind: 'cancel' });
    } else if ((e.key === 'r' || e.key === 'R') && m.kind !== 'route') {
      this.rotate();
    } else if (e.key === '[' || e.key === ']') {
      this.cycle(e.key === ']' ? 1 : -1);
    } else if (e.key === 'Enter') {
      if (m.kind === 'route') this.confirm();
      else if (this.staged) this.confirm();
      else if (this.hoverSpot) this.pick(this.hoverSpot.variants[this.variantIdx.get(this.hoverSpot.key) ?? 0]!);
      else this.confirm();
    } else return;
    e.preventDefault();
  }

  /** R / rotate: next variant of the staged or hovered spot (campaigns: flip orientation, sticky). */
  private rotate(): void {
    if (!isSpotMode(this.mode)) return;
    const s = this.staged?.spot ?? this.hoverSpot;
    const campaignMode = this.mode.kind === 'campaign' || ORIENTED.has(this.mode.placementKind);
    if (!s || s.variants.length < 2) {
      if (campaignMode && (!s || isOrientedSpot(s))) {
        // No second orientation here: flip the preference for the next spot.
        this.orient = this.orient === 'landscape' ? 'portrait' : 'landscape';
        ghostOrientation.value = this.orient;
      }
      return;
    }
    const idx = ((this.staged?.idx ?? this.variantIdx.get(s.key) ?? 0) + 1) % s.variants.length;
    this.variantIdx.set(s.key, idx);
    this.pinnedVariant.add(s.key);
    const v = s.variants[idx]!;
    const o = orientationOf(v);
    if (o && o !== 'square') {
      this.orient = o;
      ghostOrientation.value = o;
    }
    if (this.staged) {
      this.staged.idx = idx;
      pendingPlacement.value = v;
    } else if (s === this.hoverSpot) {
      hoverPlacement.value = { placement: v, variants: s.variants.length };
    }
    this.setActive(v);
    this.showGhost(s, idx);
    this.stage.invalidate();
  }

  /** `[` / `]`: step the active candidate (route ribbons; campaign spots in list order). */
  private cycle(by: number): void {
    const m = this.mode;
    if (m.kind === 'route') {
      const n = m.placements.length;
      if (!n) return;
      const cur = this.stagedRoute ?? Math.max(0, activeCandidate.peek());
      const next = (((cur + by) % n) + n) % n;
      if (this.stagedRoute !== null) this.stageRoute(next);
      else activeCandidate.value = next;
      this.emitHover({ id: null, cell: null, placement: m.placements[next] ?? null });
      return;
    }
    if (m.kind === 'campaign') {
      const n = m.placements.length;
      if (!n) return;
      const cur = activeCandidate.peek();
      activeCandidate.value = cur < 0 ? (by > 0 ? 0 : n - 1) : (((cur + by) % n) + n) % n;
    }
  }

  /** The panel (or `[` / `]`) changed `activeCandidate`: show that candidate on the board. */
  private followCandidate(i: number): void {
    const m = this.mode;
    if (m.kind === 'route') {
      if (this.stagedRoute !== null && i >= 0 && i !== this.stagedRoute) this.stageRoute(i);
      return;
    }
    if (!isSpotMode(m) || i < 0) return;
    const p = m.placements[i];
    if (!p || p === this.ghostPlacement) return;
    const at = this.spotOf.get(p);
    if (!at) return;
    this.variantIdx.set(at.spot.key, at.idx);
    this.pinnedVariant.add(at.spot.key);
    if (this.staged) return this.stageSpot(at.spot, at.idx);
    this.hoverSpot = at.spot;
    this.showGhost(at.spot, at.idx);
    hoverPlacement.value = { placement: at.spot.variants[at.idx]!, variants: at.spot.variants.length };
  }

  /** Mirror the ghost's placement into `activeCandidate` (campaign / place modes). */
  private setActive(p: Placement | null): void {
    if (!isSpotMode(this.mode) || !p) return;
    const i = (this.mode.placements as readonly Placement[]).indexOf(p);
    if (i >= 0 && i !== activeCandidate.peek()) {
      this.ghostPlacement = p;
      activeCandidate.value = i;
    }
  }

  private stageSpot(s: Spot, idx: number): void {
    this.staged = { spot: s, idx };
    this.showGhost(s, idx);
    pendingPlacement.value = s.variants[idx] ?? null;
    pendingVariants.value = s.variants.length;
    this.setActive(s.variants[idx] ?? null);
    this.stage.invalidate();
  }

  private stageRoute(idx: number): void {
    if (this.mode.kind !== 'route') return;
    this.stagedRoute = idx;
    activeCandidate.value = idx;
    pendingPlacement.value = this.mode.placements[idx] ?? null;
    pendingVariants.value = 0;
  }

  /** Confirm button / Enter: commit the staged placement (route mode: the active candidate). */
  private confirm(): void {
    const m = this.mode;
    if (m.kind === 'route') {
      const i = this.stagedRoute ?? activeCandidate.peek();
      if (i >= 0 && m.placements[i]) this.pickRoute(i);
      return;
    }
    if (this.staged) {
      const p = this.staged.spot.variants[this.staged.idx];
      if (p) this.pick(p);
      return;
    }
    if (m.kind === 'campaign') {
      const p = m.placements[activeCandidate.peek()];
      if (p) this.pick(p);
    }
  }

  private unstage(): void {
    this.staged = null;
    this.stagedRoute = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
    if (isSpotMode(this.mode)) this.showGhost(this.hoverSpot, this.hoverSpot ? (this.variantIdx.get(this.hoverSpot.key) ?? 0) : 0);
  }

  private pickRoute(i: number): void {
    if (this.mode.kind !== 'route') return;
    const p = this.mode.placements[i];
    if (p) this.pick(p);
  }

  private pick(p: Placement): void {
    this.staged = null;
    this.stagedRoute = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
    this.emit({ kind: 'placement', placement: p });
  }

  private emit(p: BoardPick): void {
    for (const l of [...this.pickListeners]) l(p);
  }

  private emitHover(h: HoverInfo | null): void {
    boardHover.value = h ? { id: h.id, cell: h.cell } : null;
    const m = this.mode;
    const variants = isSpotMode(m) ? (this.hoverSpot?.variants.length ?? 0) : m.kind === 'route' ? 1 : 0;
    hoverPlacement.value = h?.placement && variants ? { placement: h.placement, variants } : null;
    for (const l of [...this.hoverListeners]) l(h);
  }

  private overHandle(ground: THREE.Vector3): boolean {
    const h = this.handleAt;
    return !!h && (ground.x - h.x) ** 2 + (ground.z - h.z) ** 2 <= HANDLE_R * HANDLE_R;
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

  /** Rings sit above the tile slabs and lot surface (≈ 0.06) so the ground never hides them. */
  private refreshRings(): void {
    this.clearRings();
    const rects: { r: Rect; color: string; y: number; opacity?: number }[] = [];
    const add = (id: string, color: string, y: number, opacity?: number) => {
      for (const p of this.rec.byId(id)) if (p.kind !== 'demand') rects.push({ r: p.rect, color, y, ...(opacity !== undefined ? { opacity } : {}) });
    };
    for (const id of this.highlighted) add(id, COLORS.focus, 0.08);
    const pickMode = this.mode.kind === 'place' || this.mode.kind === 'campaign' || this.mode.kind === 'route';
    if (!pickMode) {
      const sel = selection.peek();
      if (sel) add(sel.id, COLORS.focus, 0.086);
      for (const id of selectionRelated.peek()) if (id !== sel?.id) add(id, COLORS.focus, 0.076, 0.45);
      for (const id of inspectIds.peek()) add(id, COLORS.ink, 0.078, 0.6);
    }
    if (this.hoverObj && !pickMode && this.hoverObj.id !== selection.peek()?.id) rects.push({ r: this.hoverObj.rect, color: COLORS.surface, y: 0.088 });
    const s = this.staged?.spot ?? (isSpotMode(this.mode) ? this.hoverSpot : null);
    if (s) rects.push({ r: this.rectFor(s, this.staged?.idx), color: COLORS.focus, y: 0.09 });
    for (const { r, color, y, opacity } of rects) this.rings.add(ring(r, color, y, opacity));
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
    const key = p ? `${JSON.stringify(p)}|${s?.variants.length ?? 0}` : '';
    if (key === this.ghostKey) return;
    this.clearGhost();
    this.ghostKey = key;
    this.ghostPlacement = p;
    this.refreshRings();
    const b = this.rec.board;
    if (!p || !b || !s || !isSpotMode(this.mode)) return;
    const color = this.mode.color || COLORS.highlightOk;
    const g = buildGhost({ inst: this.stage.inst, ghost: this.ghostMat(color) }, b, p, color);
    if (!g) return;
    g.traverse((o) => {
      o.renderOrder = 4;
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
    // Wrapper in world space: the mini plus (campaigns) footprint squares and the rotate handle.
    const wrap = new THREE.Group();
    wrap.name = 'ghost';
    wrap.add(g);
    if (p.kind === 'campaign' && p.placement.kind === 'board') {
      const pl = p.placement;
      wrap.add(buildFootprint(b, pl.x, pl.y, pl.w, pl.h, color, this.inRangeRoads()));
    }
    // Ketchup previews (WP5): roadworks on the squares the arrows point at; the rural link.
    if (p.kind === 'lobbyistRoad') wrap.add(roadworksPreview({ inst: this.stage.inst }, b, p.arrows));
    if (p.kind === 'freeway') wrap.add(freewayLink(b, p.side, p.offset, color));
    if (p.kind === 'campaign' && p.placement.kind === 'offBoard') {
      const r = this.rectFor(s, idx);
      g.position.set((r.x0 + r.x1) / 2, g.position.y, (r.z0 + r.z1) / 2);
    }
    if (s.variants.length > 1 && (p.kind === 'campaign' || p.kind === 'lobbyistRoad' || p.kind === 'park' || p.kind === 'mapTile')) {
      const r = this.rectFor(s, idx);
      const hx = r.x1 + 0.45;
      const hz = r.z0 - 0.45;
      const handle = buildRotateHandle();
      handle.position.set(hx, 0.14, hz);
      wrap.add(handle);
      this.handleAt = { x: hx, z: hz };
    }
    this.ghost = wrap;
    this.stage.overlay.add(wrap);
    this.stage.trackSized(wrap);
    this.stage.invalidate();
  }

  /** In-range road squares from the range overlay (door-side markers), or null. */
  private inRangeRoads(): Set<string> | null {
    const r = rangeOverlay.peek();
    if (!r) return null;
    return new Set(r.roads.filter((x) => x.distance <= r.range).map((x) => `${x.x},${x.y}`));
  }

  private clearGhost(): void {
    this.ghostKey = '';
    this.ghostPlacement = null;
    this.handleAt = null;
    if (!this.ghost) return;
    this.stage.untrackSized(this.ghost);
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

/**
 * Campaign footprint on the ground: one outlined square per covered square, and a bright bar on
 * every footprint edge that touches a road (an in-range road when `inRange` is given and any edge
 * touches one). World coordinates; the caller adds it beside the ghost mini.
 */
export function buildFootprint(b: Board, x: number, y: number, w: number, h: number, color: string, inRange: Set<string> | null): THREE.Group {
  const g = new THREE.Group();
  g.name = 'footprint';
  const frameMat = owned(new THREE.MeshBasicMaterial({ color: COLORS.surface, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const fillMat = owned(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const frame = new THREE.Shape();
  const t = 0.05;
  const s = 0.92;
  frame.moveTo(-s / 2, -s / 2);
  frame.lineTo(s / 2, -s / 2);
  frame.lineTo(s / 2, s / 2);
  frame.lineTo(-s / 2, s / 2);
  frame.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-s / 2 + t, -s / 2 + t);
  hole.lineTo(-s / 2 + t, s / 2 - t);
  hole.lineTo(s / 2 - t, s / 2 - t);
  hole.lineTo(s / 2 - t, -s / 2 + t);
  hole.closePath();
  frame.holes.push(hole);
  const frameGeo = owned(new THREE.ShapeGeometry(frame).rotateX(Math.PI / 2));
  const fillGeo = owned(new THREE.PlaneGeometry(s - t * 2, s - t * 2).rotateX(-Math.PI / 2));
  const Y = 0.07;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const f = new THREE.Mesh(frameGeo, frameMat);
      f.position.set(x + i + 0.5, Y, y + j + 0.5);
      f.renderOrder = 6;
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.position.set(x + i + 0.5, Y - 0.002, y + j + 0.5);
      fill.renderOrder = 5;
      g.add(fill, f);
    }
  // Road edges.
  const edges: { cx: number; cz: number; horiz: boolean; inRange: boolean }[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const cx = x + i;
      const cy = y + j;
      for (const d of DIRS) {
        const nx = cx + DELTA[d][0];
        const ny = cy + DELTA[d][1];
        if (nx >= x && nx < x + w && ny >= y && ny < y + h) continue;
        if (!b.cells[ny]?.[nx]?.road) continue;
        edges.push({ cx: cx + 0.5 + DELTA[d][0] * 0.5, cz: cy + 0.5 + DELTA[d][1] * 0.5, horiz: d === 'N' || d === 'S', inRange: !inRange || inRange.has(`${nx},${ny}`) });
      }
    }
  const anyIn = edges.some((e) => e.inRange);
  const barMat = owned(new THREE.MeshBasicMaterial({ color: COLORS.ink, toneMapped: false }));
  const barGeoH = owned(new THREE.BoxGeometry(0.8, 0.06, 0.14));
  const barGeoV = owned(new THREE.BoxGeometry(0.14, 0.06, 0.8));
  for (const e of edges) {
    if (anyIn && !e.inRange) continue;
    const bar = new THREE.Mesh(e.horiz ? barGeoH : barGeoV, barMat);
    bar.position.set(e.cx, Y + 0.03, e.cz);
    bar.renderOrder = 7;
    g.add(bar);
  }
  return g;
}

/** Flat curved-arrow button beside a campaign ghost; clicking it rotates (touch-friendly). */
export function buildRotateHandle(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'rotate-handle';
  const disc = new THREE.Mesh(owned(new THREE.CircleGeometry(0.4, 28).rotateX(-Math.PI / 2)), owned(new THREE.MeshBasicMaterial({ color: COLORS.surface, toneMapped: false, depthWrite: false, transparent: true, opacity: 0.95 })));
  disc.renderOrder = 8;
  const ink = owned(new THREE.MeshBasicMaterial({ color: COLORS.ink, toneMapped: false, depthWrite: false, transparent: true }));
  const arc = new THREE.Mesh(owned(new THREE.RingGeometry(0.2, 0.28, 24, 1, 0.3, Math.PI * 1.45).rotateX(-Math.PI / 2)), ink);
  arc.position.y = 0.005;
  arc.renderOrder = 9;
  const tip = new THREE.Shape();
  // Arrow head at the arc's end angle (0.3 + 1.45π), pointing along the turn.
  const a = 0.3 + Math.PI * 1.45;
  const cx = Math.cos(a) * 0.24;
  const cy = Math.sin(a) * 0.24;
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  tip.moveTo(cx + Math.cos(a) * 0.12, cy + Math.sin(a) * 0.12);
  tip.lineTo(cx - Math.cos(a) * 0.12, cy - Math.sin(a) * 0.12);
  tip.lineTo(cx + tx * 0.14, cy + ty * 0.14);
  tip.closePath();
  const head = new THREE.Mesh(owned(new THREE.ShapeGeometry(tip).rotateX(-Math.PI / 2)), ink);
  head.position.y = 0.005;
  head.renderOrder = 9;
  g.add(disc, arc, head);
  return g;
}

/** Rounded outline ring around a rectangle. */
function ring(r: Rect, color: string, y: number, opacity = 0.95): THREE.Mesh {
  const pad = 0.06;
  const w = r.x1 - r.x0 + pad * 2;
  const d = r.z1 - r.z0 + pad * 2;
  const t = 0.09;
  const rad = 0.22;
  const outer = roundedRect(-w / 2, -d / 2, w, d, rad);
  const inner = roundedRect(-w / 2 + t, -d / 2 + t, w - t * 2, d - t * 2, Math.max(0.02, rad - t));
  outer.holes.push(inner);
  const geo = owned(new THREE.ShapeGeometry(outer, 4).rotateX(Math.PI / 2));
  const mat = owned(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
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
      // The real tile (roads, houses, drinks) turned as it will be placed (WP5).
      return at(buildTileGhost(ctx, tileDef(p.templateId), p.rotation, color), p.col * 5 + 2.5, p.row * 5 + 2.5, 0);
    }
    case 'buyerRoute':
      return null;
  }
}
