/**
 * Phase feedback on the board (ux-plan §2.3, WP5).
 *
 * - Dinnertime caption for one house (`boardFeedback` kind 'dinner'): the winning route drawn from
 *   the restaurant entrance to the house along the road, a "$9 + 1 = $10" chip over every competing
 *   restaurant (winner ticked, chains that cannot supply greyed), a result chip over the house.
 * - Campaign flash (`boardFeedback` kind 'campaign'): rings + "+1 good" on the houses that got demand,
 *   grey "full" chips on the houses in reach that took nothing.
 * - Persistent "stayed home" chips on houses that had demand and no seller in the last Dinnertime
 *   (`houseBoardInfo.noSeller`, cleared when Marketing runs).
 * - Transient pieces for the animator: route flash per sale, reach flash per campaign, pip tick.
 */
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { Board, Cell, Corner, Direction, FoodId, GameView, HouseId, RouteStart } from '@fcm/engine';
import { boardView } from '../../state/boardBridge.js';
import { houseBoardInfo } from '../../state/boardOverlays.js';
import { boardFeedback, type BoardFeedback, type DinnerOffer } from '../../state/feedback.js';
import { scoreMath } from '../../state/offers.js';
import { COLORS } from '../../theme.js';
import { DELTA, DIRS, OPPOSITE, ROAD_TOP } from '../coords.js';
import { playerColor, type Rect } from '../layout.js';
import type { Reconciler } from '../reconcile.js';
import type { Stage } from '../scene.js';
import { disposeOverlay, flatMat, makeChip } from './badges.js';
import { startOrigin, startRoads } from './fallback.js';
import { buildReach, type ReachTarget } from './reach.js';
import { ribbonGeometry, routePolyline } from './routes.js';

const GREY = '#8f8b88';
const ROUTE_Y = ROAD_TOP + 0.03;
const CORNERS: readonly Corner[] = ['NW', 'NE', 'SE', 'SW'];

type P2 = [number, number];

// ---------------------------------------------------------------------------
// Shortest road path (restaurant entrance → house), fewest tile borders first
// ---------------------------------------------------------------------------

const usable = (b: Board, c: Cell) => {
  const r = b.cells[c.y]?.[c.x]?.road;
  return r && !r.underConstruction ? r : null;
};
const tileKey = (b: Board, c: Cell) => `${Math.floor(c.x / b.tileSize)},${Math.floor(c.y / b.tileSize)}`;

/** Road squares orthogonally next to a house (and its garden). */
export function houseRoads(b: Board, houseId: HouseId): Set<string> {
  const h = b.houses[houseId];
  const out = new Set<string>();
  if (!h) return out;
  const cells = [...h.cells, ...(h.garden?.cells ?? [])];
  const own = new Set(cells.map((c) => `${c.x},${c.y}`));
  for (const c of cells)
    for (const d of DIRS) {
      const n = { x: c.x + DELTA[d][0], y: c.y + DELTA[d][1] };
      const k = `${n.x},${n.y}`;
      if (!own.has(k) && usable(b, n)) out.add(k);
    }
  return out;
}

/**
 * A shortest road route from any entrance of `restaurantId` to a road square next to `houseId`:
 * fewest tile borders (roadworks count), then fewest steps. Null when not connected (rural area).
 */
export function dinnerRoute(b: Board, restaurantId: string, houseId: HouseId): { from: RouteStart; path: Cell[] } | null {
  const r = b.restaurants[restaurantId];
  if (!r) return null;
  const targets = houseRoads(b, houseId);
  if (!targets.size) return null;
  type Node = { c: Cell; h: Direction | null; cost: number; prev: Node | null; from: RouteStart };
  const best = new Map<string, number>();
  const key = (c: Cell, h: Direction | null) => `${c.x},${c.y},${h ?? '-'}`;
  const open: Node[] = [];
  for (const corner of r.driveIn ? CORNERS : [r.entrance]) {
    const from: RouteStart = { kind: 'restaurant', restaurantId, corner };
    const o = startOrigin(b, from);
    for (const c of startRoads(b, from)) {
      const cost = ((o && tileKey(b, o) !== tileKey(b, c) ? 1 : 0) + (usable(b, c)?.roadworks ?? 0)) * 1000;
      open.push({ c, h: null, cost, prev: null, from });
    }
  }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.cost < open[bi]!.cost) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    const k = key(cur.c, cur.h);
    if ((best.get(k) ?? Infinity) <= cur.cost) continue;
    best.set(k, cur.cost);
    if (targets.has(`${cur.c.x},${cur.c.y}`)) {
      const path: Cell[] = [];
      for (let n: Node | null = cur; n; n = n.prev) path.unshift(n.c);
      return { from: cur.from, path };
    }
    const here = usable(b, cur.c);
    if (!here) continue;
    for (const d of DIRS) {
      if (here.bridge && cur.h !== null && d !== cur.h) continue;
      if (here.capped?.includes(d)) continue;
      const to = { x: cur.c.x + DELTA[d][0], y: cur.c.y + DELTA[d][1] };
      const there = usable(b, to);
      if (!there || there.capped?.includes(OPPOSITE[d])) continue;
      const cost = cur.cost + 1 + ((tileKey(b, cur.c) !== tileKey(b, to) ? 1 : 0) + (there.roadworks ?? 0)) * 1000;
      if ((best.get(key(to, d)) ?? Infinity) <= cost) continue;
      open.push({ c: to, h: d, cost, prev: cur, from: cur.from });
    }
  }
  return null;
}

/** World polyline of a dinner route, ending half a square into the house. */
export function dinnerPolyline(b: Board, route: { from: RouteStart; path: Cell[] }, houseId: HouseId): P2[] {
  const pts = routePolyline(b, { route: { mode: 'road', from: route.from, path: route.path }, collects: [] });
  const last = route.path[route.path.length - 1];
  const h = b.houses[houseId];
  if (last && h) {
    const into = [...h.cells, ...(h.garden?.cells ?? [])].find((c) => Math.abs(c.x - last.x) + Math.abs(c.y - last.y) === 1);
    if (into) pts.push([(last.x + into.x) / 2 + 0.5, (last.y + into.y) / 2 + 0.5]);
  }
  if (pts.length === 1) pts.push([pts[0]![0] + 0.01, pts[0]![1]]);
  return pts;
}

/** Solid ribbon with an ink outline along `pts` (owner colour): 3:1 or better on print and asphalt. */
export function routeRibbon(pts: readonly P2[], color: string, width = 0.34): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dinnerRoute';
  if (pts.length < 2) return g;
  const edge = new THREE.Mesh(ribbonGeometry(pts, width + 0.12, ROUTE_Y), flatMat(COLORS.ink, 0.9));
  edge.renderOrder = 7;
  const body = new THREE.Mesh(ribbonGeometry(pts, width, ROUTE_Y + 0.004), flatMat(color, 0.95));
  body.renderOrder = 8;
  g.add(edge, body);
  // Arrow head at the house end.
  const [x1, z1] = pts[pts.length - 1]!;
  const [x0, z0] = pts[pts.length - 2]!;
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.32);
  tri.lineTo(0.3, -0.12);
  tri.lineTo(-0.3, -0.12);
  tri.closePath();
  const head = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(Math.PI / 2), flatMat(color, 1));
  head.position.set(x1, ROUTE_Y + 0.008, z1);
  head.rotation.y = ang + Math.PI;
  head.renderOrder = 9;
  g.add(head);
  return g;
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** A chip in a scalable wrapper (sprites are screen-sized each frame; animate the wrapper). */
function chipAt(text: string, good: FoodId | null, bg: string, x: number, y: number, z: number, center: [number, number] = [0.5, 0], size = 0.4): THREE.Group {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  const s = makeChip(text, good, bg, size);
  s.center.set(center[0], center[1]);
  w.add(s);
  return w;
}

export const offerText = (o: Pick<DinnerOffer, 'unitPrice' | 'distance' | 'score' | 'canSupply' | 'won'>): string =>
  `${o.won ? '✓ ' : ''}${scoreMath(o, { compact: true })}${o.canSupply ? '' : ' ✕'}`;

interface Anchors {
  house(id: string): { x: number; z: number; y: number } | null;
  restaurant(id: string): { x: number; z: number; y: number } | null;
}

function colorOf(view: GameView | null, id: string | null | undefined): string {
  return view ? playerColor(view, id) : GREY;
}

/** Dinner caption for one house: winning route, offer chips over restaurants, result chip over the house. */
export function buildDinner(b: Board, view: GameView | null, f: Extract<BoardFeedback, { kind: 'dinner' }>, at: Anchors): THREE.Group {
  const g = new THREE.Group();
  g.name = 'feedback:dinner';
  if (f.winner) {
    const route = dinnerRoute(b, f.winner.restaurantId, f.houseId);
    if (route) g.add(routeRibbon(dinnerPolyline(b, route, f.houseId), colorOf(view, f.winner.player)));
  }
  const seen = new Set<string>();
  for (const o of f.offers) {
    if (seen.has(o.restaurantId)) continue;
    seen.add(o.restaurantId);
    const a = at.restaurant(o.restaurantId);
    if (!a) continue;
    const bg = !o.canSupply ? GREY : colorOf(view, o.player);
    const chip = chipAt(offerText(o), null, bg, a.x, a.y, a.z, [0.5, 0], o.won ? 0.46 : 0.36);
    g.add(chip);
  }
  const h = at.house(f.houseId);
  if (h) {
    const w = f.offers.find((o) => o.won);
    if (w) g.add(chipAt(`✓ $${w.score}`, null, colorOf(view, w.player), h.x, h.y, h.z, [1.45, 0.5], 0.42));
    else if (f.stayedHome) g.add(chipAt('stayed home', null, GREY, h.x, h.y, h.z, [1.2, 0.5], 0.38));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export class FeedbackLayer {
  readonly root = new THREE.Group();
  private focus = new THREE.Group();
  private persist = new THREE.Group();
  private reachTick: ((t: number) => boolean) | null = null;
  private disposers: (() => void)[] = [];
  private frame = (_dt: number, t: number) => {
    if (this.reachTick?.(t)) this.stage.invalidate();
  };

  constructor(
    private readonly stage: Stage,
    private readonly rec: Reconciler,
  ) {
    this.root.name = 'feedback';
    this.focus.name = 'feedback:focus';
    this.persist.name = 'feedback:persist';
    this.root.add(this.persist, this.focus);
    stage.overlay.add(this.root);
    stage.onFrame.add(this.frame);
    this.disposers.push(
      // Deferred: the view signal changes before the reconciler syncs the new pieces.
      effect(() => {
        const f = boardFeedback.value;
        void boardView.value;
        this.later('focus', () => this.drawFocus(f));
      }),
      effect(() => {
        const info = houseBoardInfo.value;
        void boardView.value;
        this.later('persist', () => this.drawStayedHome(Object.keys(info).filter((id) => info[id]?.noSeller)));
      }),
    );
  }

  private queued = new Map<string, () => void>();
  private later(k: string, run: () => void): void {
    const had = this.queued.size > 0;
    this.queued.set(k, run);
    if (had) return;
    queueMicrotask(() => {
      const jobs = [...this.queued.values()];
      this.queued.clear();
      for (const j of jobs) j();
    });
  }

  get view(): GameView | null {
    return boardView.peek().view;
  }

  /** Anchors from the live pieces (house number badge, restaurant roof). */
  readonly anchors: Anchors = {
    house: (id) => {
      const p = this.rec.live.get(`house:${id}`);
      if (!p) return null;
      const badge = p.obj.getObjectByName('badge');
      return { x: (p.rect.x0 + p.rect.x1) / 2, z: (p.rect.z0 + p.rect.z1) / 2, y: badge ? badge.position.y : p.height };
    },
    restaurant: (id) => {
      const p = this.rec.live.get(`restaurant:${id}`);
      if (!p) return null;
      return { x: (p.rect.x0 + p.rect.x1) / 2, z: (p.rect.z0 + p.rect.z1) / 2, y: p.height + 0.35 };
    },
  };

  houseTarget = (id: string): ReachTarget | null => {
    const p = this.rec.live.get(`house:${id}`);
    if (!p) return null;
    const badge = p.obj.getObjectByName('badge');
    return { rect: p.rect, y: badge ? badge.position.y : p.height };
  };

  /** Mount a transient object (animator); returns a remover. */
  mountTransient(o: THREE.Object3D): () => void {
    this.root.add(o);
    this.stage.trackSized(o);
    this.stage.invalidate();
    return () => this.drop(o);
  }

  /** The route a sale used (transient flash during the animation). */
  saleRoute(restaurantId: string, houseId: HouseId, player: string): THREE.Group | null {
    const b = this.rec.board;
    if (!b) return null;
    const route = dinnerRoute(b, restaurantId, houseId);
    if (!route) return null;
    return routeRibbon(dinnerPolyline(b, route, houseId), colorOf(this.view, player), 0.26);
  }

  /** Reach flash for one campaign run (rings + chips). */
  reachFlash(houseIds: readonly HouseId[], good: FoodId, full: readonly HouseId[], color: string): { group: THREE.Group; tick(t: number): boolean } | null {
    const b = this.rec.board;
    if (!b) return null;
    return buildReach(b, { houseIds: [...houseIds, ...full.filter((h) => !houseIds.includes(h))], good, full, color }, this.houseTarget);
  }

  /** "stayed home" chip in a scalable wrapper over a house (for the pop animation). */
  stayedHomeChip(houseId: HouseId): THREE.Group | null {
    return this.persist.getObjectByName(`stayed:${houseId}`) as THREE.Group | null;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.stage.onFrame.delete(this.frame);
    this.clear(this.focus);
    this.clear(this.persist);
    this.root.removeFromParent();
  }

  // ---------------------------------------------------------------------------

  private drawFocus(f: BoardFeedback | null): void {
    this.clear(this.focus);
    this.reachTick = null;
    const b = this.rec.board;
    if (!f || !b) return;
    if (f.kind === 'dinner') {
      this.focus.add(buildDinner(b, this.view, f, this.anchors));
    } else {
      const color = colorOf(this.view, f.owner);
      const layer = buildReach(b, { houseIds: [...f.houses, ...f.full], good: f.good ?? 'burger', full: f.full, color }, this.houseTarget);
      this.focus.add(layer.group);
      this.reachTick = (t) => layer.tick(t);
    }
    this.stage.trackSized(this.focus);
    this.stage.invalidate();
  }

  private drawStayedHome(ids: string[]): void {
    this.clear(this.persist);
    for (const id of ids) {
      const a = this.anchors.house(id);
      if (!a) continue;
      const chip = chipAt('no seller', null, GREY, a.x, a.y, a.z, [1.2, 0.5], 0.34);
      chip.name = `stayed:${id}`;
      this.persist.add(chip);
    }
    this.stage.trackSized(this.persist);
    this.stage.invalidate();
  }

  private clear(g: THREE.Group): void {
    for (const c of [...g.children]) this.drop(c);
  }

  private drop(o: THREE.Object3D): void {
    this.stage.untrackSized(o);
    disposeOverlay(o);
    o.removeFromParent();
    this.stage.invalidate();
  }
}

/** Floating "N left" chip for a pip tick ("done" when the campaign ran its last turn). */
export function pipCount(n: number, color: string): THREE.Group {
  const w = new THREE.Group();
  const s = makeChip(n > 0 ? `${n} left` : 'done', null, color, 0.32);
  s.center.set(0.5, 0);
  w.add(s);
  return w;
}

export type { Rect };
