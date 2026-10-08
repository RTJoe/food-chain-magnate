/**
 * Tabletop camera controller (architecture §5.3): tilted view orbiting a ground target, yaw,
 * pan/zoom inside board bounds, pinch zoom + twist on touch, and a straight-down "top" toggle.
 *
 * Mouse: left-drag pans, right-drag (or shift/ctrl + left) rotates and tilts, wheel zooms toward
 * the cursor. Touch: one finger pans, two fingers pinch-zoom and twist. Keyboard: arrows/WASD pan,
 * Q/E rotate, +/- zoom, T top view, Home reset.
 *
 * Taps (short press without travel) and mouse hover are reported to the interaction layer.
 */
import * as THREE from 'three';
import { effect } from '@preact/signals';
import { followFocus } from '../state/interaction.js';
import { RIM } from './coords.js';
import { BoardKeyScope } from './keyScope.js';

const DEG = Math.PI / 180;
export const DEFAULT_TILT = 50 * DEG;
const TOP_TILT = 89.5 * DEG;
const MIN_TILT = 28 * DEG;
const TAP_SLOP = 8;
const TAP_MS = 550;
/** Focus framing: smallest square side (world units) and the margin around the focused pieces. */
const FOCUS_MIN = 11;
const FOCUS_PAD = 2.5;
/** Follow the action: hands off the camera for this long after the player touched it (ms). */
const FOLLOW_IDLE_MS = 5000;

export interface PointerInfo {
  x: number;
  y: number;
  type: string;
}

/** Parts of the canvas covered by UI panels, in CSS px. */
export interface ContentInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const NO_INSET: ContentInset = { left: 0, right: 0, top: 0, bottom: 0 };

interface Pose {
  target: THREE.Vector3;
  dist: number;
  yaw: number;
  tilt: number;
}

export class CameraController {
  private cur: Pose = { target: new THREE.Vector3(), dist: 30, yaw: 0, tilt: DEFAULT_TILT };
  private want: Pose = { target: new THREE.Vector3(), dist: 30, yaw: 0, tilt: DEFAULT_TILT };
  private bounds = { x0: 0, z0: 0, x1: 20, z1: 15, minD: 5, maxD: 60 };
  private home: Pose = { target: new THREE.Vector3(), dist: 30, yaw: 0, tilt: DEFAULT_TILT };
  private top = false;
  private content: { x0: number; z0: number; x1: number; z1: number } | null = null;
  /** What the home pose frames (the board squares, plus off-board areas that matter); pan bounds use `content`. */
  private frameRect: { x0: number; z0: number; x1: number; z1: number } | null = null;
  private tiltBeforeTop = DEFAULT_TILT;
  /** Target inset (framing maths) and the inset the lens shift currently uses (eased towards it). */
  private inset: ContentInset = { ...NO_INSET };
  private insetCur: ContentInset = { ...NO_INSET };
  private lensDirty = false;

  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; type: string; button: number; mods: boolean }>();
  private panAnchor: THREE.Vector3 | null = null;
  private pinch: { d: number; a: number; dist: number; yaw: number; mid: THREE.Vector3 | null } | null = null;
  private moved = false;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private cleanup: (() => void)[] = [];
  private readonly keys: BoardKeyScope;

  onTap: (p: PointerInfo) => void = () => {};
  onHover: (p: PointerInfo | null) => void = () => {};
  onChange: () => void = () => {};
  onTopChange: (top: boolean) => void = () => {};
  /** Last pointer / wheel / key input on the board (performance.now() ms); the follow camera waits on it. */
  lastUserInput = -Infinity;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      dom.addEventListener(t, f as EventListener, opts);
      this.cleanup.push(() => dom.removeEventListener(t, f as EventListener, opts));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.up(e, true));
    on('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pointers.size) this.onHover(null);
    });
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    // Camera keys act only while the board owns the keyboard (keyScope.ts, WCAG 2.1.4).
    this.keys = new BoardKeyScope(dom);
    const key = (e: KeyboardEvent) => this.key(e);
    window.addEventListener('keydown', key);
    this.cleanup.push(() => window.removeEventListener('keydown', key), () => this.keys.dispose());
    // Follow the action (animation-plan §1.6): the animator writes the next step's rectangle.
    let firstFollow = true;
    this.cleanup.push(
      effect(() => {
        const f = followFocus.value;
        if (firstFollow) return void (firstFollow = false);
        if (f) this.follow(f.x0, f.z0, f.x1, f.z1);
      }),
    );
    this.apply(this.cur);
  }

  // --- Public API -------------------------------------------------------------

  /**
   * Set pan bounds and the home framing from the world rectangle the content covers (board plus
   * rim and any off-board pieces); optionally jump there. `inset` (CSS px) is the part of the
   * canvas covered by panels: the home framing fits the content into the rest, and the camera's
   * optical centre moves to the middle of the visible area (lens shift), so orbit and zoom pivot
   * where the player looks.
   */
  setContent(r: { x0: number; z0: number; x1: number; z1: number }, frame: boolean, inset?: ContentInset, frameRect?: { x0: number; z0: number; x1: number; z1: number }): void {
    if (inset) {
      this.inset = sanitizeInset(inset);
      this.insetCur = { ...this.inset };
    }
    this.applyViewOffset();
    const size = Math.max(r.x1 - r.x0, r.z1 - r.z0);
    this.bounds = { x0: r.x0 - 1.5, z0: r.z0 - 1.5, x1: r.x1 + 1.5, z1: r.z1 + 1.5, minD: 5, maxD: Math.max(25, size * 2) };
    const w = this.want;
    const wasHome = Math.abs(w.dist - this.home.dist) < 0.01 && w.target.distanceTo(this.home.target) < 0.01 && Math.abs(w.yaw - this.home.yaw) < 1e-3;
    this.content = { ...r };
    this.frameRect = frameRect ? { ...frameRect } : { ...r };
    this.home = this.homePose(this.frameRect);
    this.bounds.maxD = Math.max(this.bounds.maxD, this.home.dist * 1.5);
    if (frame) this.reset(true);
    else if (wasHome) this.reset();
  }

  /**
   * The board re-based its coordinates by (dx, dz) (Ketchup extra map tile on the north or west):
   * move the current and wanted pose and the old home with it, so nothing moves on screen. Follow
   * with `setContent(…, false)`: it glides to the new home only if the camera was at home.
   */
  shift(dx: number, dz: number): void {
    if (!dx && !dz) return;
    const d = new THREE.Vector3(dx, 0, dz);
    this.cur.target.add(d);
    this.want.target.add(d);
    this.home.target.add(d);
    this.apply(this.cur);
    this.onChange();
  }

  /**
   * Change the covered-canvas inset (a panel opened or closed). The lens shift eases to the new
   * free area, and a camera at home glides to the new home framing; any other pose is kept.
   */
  setInset(inset: ContentInset): void {
    const next = sanitizeInset(inset);
    const cur = this.inset;
    if (next.left === cur.left && next.right === cur.right && next.top === cur.top && next.bottom === cur.bottom) return;
    this.inset = next;
    this.refit(false);
    this.onChange();
  }

  get contentInset(): ContentInset {
    return { ...this.inset };
  }

  /** Current yaw in radians (0 = north up). */
  get yaw(): number {
    return this.cur.yaw;
  }

  /** Current tilt in radians (for tilt-dependent styling, e.g. seam width in top view). */
  get tilt(): number {
    return this.cur.tilt;
  }

  reset(instant = false): void {
    this.want = clonePose(this.home);
    if (this.top) this.want.tilt = TOP_TILT;
    if (instant) this.cur = clonePose(this.want);
    this.onChange();
  }

  setTop(on: boolean): void {
    if (on === this.top) return;
    this.top = on;
    if (on) {
      this.tiltBeforeTop = this.want.tilt;
      this.want.tilt = TOP_TILT;
      // Straight down reads best north-up.
      this.want.yaw = Math.round(this.want.yaw / (Math.PI / 2)) * (Math.PI / 2);
    } else this.want.tilt = this.tiltBeforeTop;
    this.onTopChange(on);
    this.onChange();
  }

  get isTop(): boolean {
    return this.top;
  }

  zoomBy(f: number): void {
    this.want.dist = clamp(this.want.dist * f, this.bounds.minD, this.bounds.maxD);
    this.onChange();
  }

  yawBy(a: number): void {
    this.want.yaw += a;
    this.onChange();
  }

  /**
   * Glide to frame a world rectangle with comfortable context: the rectangle grows by a margin and
   * to at least FOCUS_MIN squares (about two map tiles, so neighbours stay in view), then the
   * distance is the one that fits it inside the free area at the current yaw and tilt (panels
   * excluded), never closer than ~0.4 of the home distance and never farther than home.
   */
  focusRect(x0: number, z0: number, x1: number, z1: number): void {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const hw = Math.max(FOCUS_MIN / 2, (x1 - x0) / 2 + FOCUS_PAD);
    const hh = Math.max(FOCUS_MIN / 2, (z1 - z0) / 2 + FOCUS_PAD);
    const r = { x0: cx - hw, z0: cz - hh, x1: cx + hw, z1: cz + hh };
    const target = new THREE.Vector3(cx, 0, cz);
    const tilt = this.top ? TOP_TILT : this.want.tilt;
    const d = this.fitDistance(r, this.want.yaw, target, tilt, 0.94, 0.9);
    const homeD = this.home.dist;
    this.want.target.copy(target);
    this.want.dist = clamp(clamp(d, homeD * 0.42, homeD), this.bounds.minD, this.bounds.maxD);
    this.clampWant();
    this.onChange();
  }

  /**
   * Follow-the-action glide to a step's pieces: nothing while the player touched the camera in the
   * last few seconds or while the pieces are already comfortably in view; a pan at the current
   * distance when they fit, else a `focusRect` framing.
   */
  follow(x0: number, z0: number, x1: number, z1: number): void {
    if (performance.now() - this.lastUserInput < FOLLOW_IDLE_MS) return;
    if (this.inView(x0, z0, x1, z1)) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const target = new THREE.Vector3(cx, 0, cz);
    const r = { x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z1 + 1 };
    const tilt = this.top ? TOP_TILT : this.want.tilt;
    if (this.fitDistance(r, this.want.yaw, target, tilt, 0.94, 0.9) <= this.want.dist) {
      this.want.target.copy(target);
      this.clampWant();
      this.onChange();
    } else this.focusRect(x0, z0, x1, z1);
  }

  /** Whether a ground rectangle is inside the free area (panels excluded) with a margin, from the camera's pose now. */
  private inView(x0: number, z0: number, x1: number, z1: number, margin = 0.12): boolean {
    const { w, h } = this.viewport();
    const i = this.effectiveInset();
    const lx = -1 + (2 * i.left) / w + margin;
    const hx = 1 - (2 * i.right) / w - margin;
    const ly = -1 + (2 * i.bottom) / h + margin;
    const hy = 1 - (2 * i.top) / h - margin;
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ] as const) {
      v.set(x, 0.5, z).project(this.camera);
      if (v.z > 1 || v.x < lx || v.x > hx || v.y < ly || v.y > hy) return false;
    }
    return true;
  }

  /** On-screen width / height of the home framing (for carving panels off the free area). */
  homeAspect(): number {
    const r = this.frameRect;
    if (!r) return 1.6;
    const h = this.home;
    const cam = this.camera.clone();
    cam.clearViewOffset();
    this.apply(h, cam);
    const { w, h: H } = this.viewport();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y, z] of [
      [r.x0, 0, r.z0],
      [r.x1, 0, r.z0],
      [r.x0, 0, r.z1],
      [r.x1, 0, r.z1],
      [r.x0, 1.5, r.z0],
      [r.x1, 1.5, r.z0],
    ] as const) {
      const p = new THREE.Vector3(x, y, z).project(cam);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const a = ((x1 - x0) * w) / Math.max(1e-6, (y1 - y0) * H);
    return Number.isFinite(a) && a > 0 ? a : 1.6;
  }

  /** The current (target) pose, for tests: target x/z, distance, yaw, tilt and the home distance. */
  get pose(): { x: number; z: number; dist: number; yaw: number; tilt: number; homeDist: number } {
    const w = this.want;
    return { x: w.target.x, z: w.target.z, dist: w.dist, yaw: w.yaw, tilt: w.tilt, homeDist: this.home.dist };
  }

  /** Whether the camera rests at its target pose and lens shift (no glide in progress). */
  get settled(): boolean {
    const c = this.cur;
    const w = this.want;
    const i = this.insetCur;
    const t = this.inset;
    return (
      c.target.distanceTo(w.target) < 1e-4 &&
      Math.abs(c.dist - w.dist) < 1e-4 &&
      Math.abs(c.yaw - w.yaw) < 1e-5 &&
      Math.abs(c.tilt - w.tilt) < 1e-5 &&
      i.left === t.left &&
      i.right === t.right &&
      i.top === t.top &&
      i.bottom === t.bottom
    );
  }

  /** Per-frame damping. Returns true while the camera is still moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 12);
    const c = this.cur;
    const w = this.want;
    const before = c.target.x + c.target.z * 7 + c.dist * 13 + c.yaw * 17 + c.tilt * 19;
    const insetMoving = this.easeInset(1 - Math.exp(-dt * 20));
    c.target.lerp(w.target, k);
    c.dist += (w.dist - c.dist) * k;
    c.yaw += (w.yaw - c.yaw) * k;
    c.tilt += (w.tilt - c.tilt) * k;
    const after = c.target.x + c.target.z * 7 + c.dist * 13 + c.yaw * 17 + c.tilt * 19;
    const moving = Math.abs(after - before) > 1e-5 || insetMoving;
    if (!moving) {
      // Snap to rest so renders stop.
      this.cur = clonePose(w);
    }
    this.apply(this.cur);
    return moving;
  }

  /** World point on the ground plane under a client-space position (null if the ray misses). */
  groundAt(clientX: number, clientY: number, y = 0): THREE.Vector3 | null {
    this.setRay(clientX, clientY);
    this.plane.constant = -y;
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out);
  }

  rayAt(clientX: number, clientY: number): THREE.Ray {
    this.setRay(clientX, clientY);
    return this.ray.ray;
  }

  get raycaster(): THREE.Raycaster {
    return this.ray;
  }

  dispose(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }

  // --- Internals --------------------------------------------------------------

  /** Ease the lens-shift inset towards the target inset. Returns true while it moves. */
  private easeInset(k: number): boolean {
    const a = this.insetCur;
    const b = this.inset;
    let moving = false;
    for (const key of ['left', 'right', 'top', 'bottom'] as const) {
      const d = b[key] - a[key];
      if (Math.abs(d) < 0.5) a[key] = b[key];
      else {
        a[key] += d * k;
        moving = true;
      }
    }
    if (moving || this.lensDirty) {
      this.lensDirty = false;
      this.applyViewOffset();
    }
    return moving;
  }

  /**
   * Home pose: north up, or turned a quarter on genuinely portrait screens (phones, portrait
   * tablets) so the long side runs down. The canvas itself must be portrait: a landscape desktop
   * whose free area is tall only because of side panels (1280×860 with rail + dock) keeps north up,
   * so the board reads the same way as the printed map and the fallback list coordinates.
   */
  private homePose(r: { x0: number; z0: number; x1: number; z1: number }): Pose {
    const { w, h } = this.viewport();
    const portrait = w / h < 0.85 && this.visibleAspect() < 1 && r.x1 - r.x0 > r.z1 - r.z0;
    const yaw = portrait ? Math.PI / 2 : 0;
    const target = new THREE.Vector3((r.x0 + r.x1) / 2 + Math.sin(yaw) * 0.6, 0, (r.z0 + r.z1) / 2 + Math.cos(yaw) * 0.6);
    return { target, dist: this.fitDistance(r, yaw, target, DEFAULT_TILT, 0.985, 0.97), yaw, tilt: DEFAULT_TILT };
  }

  /**
   * Smallest distance at which the rectangle fits the free area (canvas minus the target inset)
   * at the given yaw and tilt; `mx` / `my` are the share of the free width / height it may use.
   */
  private fitDistance(r: { x0: number; z0: number; x1: number; z1: number }, yaw: number, target: THREE.Vector3, tilt = DEFAULT_TILT, mx = 0.97, my = 0.9): number {
    const cam = this.camera.clone();
    // Lens shift for the target inset (the live camera may still be easing towards it).
    this.applyViewOffset(cam, this.inset);
    const corners = [
      new THREE.Vector3(r.x0, 0, r.z0),
      new THREE.Vector3(r.x1, 0, r.z0),
      new THREE.Vector3(r.x0, 0, r.z1),
      new THREE.Vector3(r.x1, 0, r.z1),
      new THREE.Vector3(r.x0, 1.5, r.z0),
      new THREE.Vector3(r.x1, 1.5, r.z0),
    ];
    // Visible region in NDC (the target projects to its centre thanks to the lens shift).
    const { w: W, h: H } = this.viewport();
    const ins = this.effectiveInset();
    const hx = (W - ins.left - ins.right) / W;
    const hy = (H - ins.top - ins.bottom) / H;
    const cx = (ins.left - ins.right) / W;
    const cy = (ins.bottom - ins.top) / H;
    const fits = (dist: number) => {
      const hd = Math.cos(tilt) * dist;
      cam.position.set(target.x + Math.sin(yaw) * hd, Math.sin(tilt) * dist, target.z + Math.cos(yaw) * hd);
      cam.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)).lerp(new THREE.Vector3(0, 1, 0), Math.cos(tilt) > 0.05 ? 1 : 0);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(cam);
        return Math.abs(p.x - cx) <= mx * hx && Math.abs(p.y - cy) <= my * hy && p.z < 1;
      });
    };
    let lo = 4;
    let hi = Math.max(40, Math.max(r.x1 - r.x0, r.z1 - r.z0) * 4);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /**
   * Re-frame after the viewport or the inset changes (keeps the user's pose unless at home).
   * `instant` (resize): jump; otherwise (a panel opened or closed) glide.
   */
  refit(instant = true): void {
    if (instant) this.insetCur = { ...this.inset };
    this.lensDirty = true;
    this.applyViewOffset();
    if (!this.content) return;
    const w = this.want;
    const h = this.home;
    const atHome = Math.abs(w.dist - h.dist) < 0.01 && w.target.distanceTo(h.target) < 0.01 && Math.abs(w.yaw - h.yaw) < 1e-3;
    this.home = this.homePose(this.frameRect ?? this.content);
    this.bounds.maxD = Math.max(this.bounds.maxD, this.home.dist * 1.5);
    if (atHome) this.reset(instant);
  }

  private viewport(): { w: number; h: number } {
    return { w: Math.max(1, this.dom.clientWidth), h: Math.max(1, this.dom.clientHeight) };
  }

  /** The inset, shrunk so at least 40% of each axis stays visible (tiny screens, huge panels). */
  private effectiveInset(i: ContentInset = this.inset): ContentInset {
    const { w, h } = this.viewport();
    const fx = Math.min(1, (w * 0.6) / Math.max(1, i.left + i.right));
    const fy = Math.min(1, (h * 0.6) / Math.max(1, i.top + i.bottom));
    return { left: i.left * fx, right: i.right * fx, top: i.top * fy, bottom: i.bottom * fy };
  }

  private visibleAspect(): number {
    const { w, h } = this.viewport();
    const i = this.effectiveInset();
    return Math.max(1, w - i.left - i.right) / Math.max(1, h - i.top - i.bottom);
  }

  /** Lens shift: put the optical centre in the middle of the uncovered part of the canvas. */
  private applyViewOffset(camera: THREE.PerspectiveCamera = this.camera, inset: ContentInset = this.insetCur): void {
    const { w, h } = this.viewport();
    const i = this.effectiveInset(inset);
    const sx = (i.left - i.right) / 2;
    const sy = (i.top - i.bottom) / 2;
    if (Math.abs(sx) < 0.5 && Math.abs(sy) < 0.5) {
      if (camera.view?.enabled) camera.clearViewOffset();
      return;
    }
    camera.setViewOffset(w, h, -sx, -sy, w, h);
  }

  private apply(p: Pose, camera: THREE.PerspectiveCamera = this.camera): void {
    const hd = Math.cos(p.tilt) * p.dist;
    camera.position.set(p.target.x + Math.sin(p.yaw) * hd, Math.sin(p.tilt) * p.dist, p.target.z + Math.cos(p.yaw) * hd);
    // Keep "up" stable in top view (lookAt degenerates straight down).
    camera.up.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).lerp(new THREE.Vector3(0, 1, 0), Math.cos(p.tilt) > 0.05 ? 1 : 0);
    camera.lookAt(p.target);
    camera.updateMatrixWorld();
  }

  private setRay(clientX: number, clientY: number): void {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
  }

  private clampWant(): void {
    const b = this.bounds;
    const t = this.want.target;
    t.x = clamp(t.x, b.x0, b.x1);
    t.z = clamp(t.z, b.z0, b.z1);
    this.want.dist = clamp(this.want.dist, b.minD, b.maxD);
    this.want.tilt = clamp(this.want.tilt, MIN_TILT, TOP_TILT);
  }

  private down(e: PointerEvent): void {
    this.lastUserInput = performance.now();
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), type: e.pointerType, button: e.button, mods: e.shiftKey || e.ctrlKey || e.metaKey });
    if (this.pointers.size === 1) {
      this.moved = false;
      this.panAnchor = this.groundAt(e.clientX, e.clientY);
    } else if (this.pointers.size === 2) {
      this.startPinch();
    }
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.moved = true;
    this.panAnchor = null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), dist: this.want.dist, yaw: this.want.yaw, mid: this.groundAt(mx, my) };
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.onHover({ x: e.clientX, y: e.clientY, type: e.pointerType });
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) this.moved = true;
    if (!this.moved) return;

    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      this.want.dist = clamp((this.pinch.dist * this.pinch.d) / Math.max(1, d), this.bounds.minD, this.bounds.maxD);
      if (!this.top) this.want.yaw = this.pinch.yaw - (ang - this.pinch.a);
      // Two-finger drag pans: keep the pinch midpoint's ground point under the fingers.
      if (this.pinch.mid) {
        this.cur = clonePose(this.want);
        this.apply(this.cur);
        const now = this.groundAt((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (now) {
          this.want.target.add(this.pinch.mid.clone().sub(now));
          this.want.target.y = 0;
        }
      }
      this.clampWant();
      this.cur = clonePose(this.want);
      this.onChange();
      return;
    }

    const rotate = p.type === 'mouse' && (p.button === 2 || p.mods);
    if (rotate) {
      const r = this.dom.getBoundingClientRect();
      this.want.yaw -= (dx / r.width) * Math.PI * 1.2;
      if (!this.top) this.want.tilt = clamp(this.want.tilt + (dy / r.height) * Math.PI * 0.6, MIN_TILT, TOP_TILT - 0.5 * DEG);
      this.onChange();
      return;
    }
    // Pan: keep the grabbed ground point under the pointer.
    if (this.panAnchor) {
      this.apply(this.cur);
      const now = this.groundAt(e.clientX, e.clientY);
      if (now) {
        const delta = this.panAnchor.clone().sub(now);
        delta.y = 0;
        this.want.target.add(delta);
        this.cur.target.add(delta);
        this.clampWant();
        this.cur.target.copy(this.want.target);
        this.onChange();
      }
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.dom.releasePointerCapture?.(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 1) {
      const [rest] = [...this.pointers.values()];
      if (rest) this.panAnchor = this.groundAt(rest.x, rest.y);
    }
    if (!p || cancelled) return;
    if (!this.moved && this.pointers.size === 0 && performance.now() - p.t < TAP_MS && p.button === 0) {
      this.onTap({ x: e.clientX, y: e.clientY, type: e.pointerType });
    }
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    this.lastUserInput = performance.now();
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * (e.ctrlKey ? 0.01 : 0.0018));
    const before = this.groundAt(e.clientX, e.clientY);
    const old = this.want.dist;
    this.want.dist = clamp(old * f, this.bounds.minD, this.bounds.maxD);
    // Zoom toward the cursor.
    if (before) {
      const k = 1 - this.want.dist / old;
      this.want.target.x += (before.x - this.want.target.x) * k;
      this.want.target.z += (before.z - this.want.target.z) * k;
    }
    this.clampWant();
    this.onChange();
  }

  private key(e: KeyboardEvent): void {
    if (!this.keys.owns(e)) return;
    const step = this.want.dist * 0.08;
    const fwd = new THREE.Vector3(-Math.sin(this.want.yaw), 0, -Math.cos(this.want.yaw));
    const right = new THREE.Vector3(Math.cos(this.want.yaw), 0, -Math.sin(this.want.yaw));
    let used = true;
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
        this.want.target.addScaledVector(fwd, step);
        break;
      case 'ArrowDown':
      case 's':
        this.want.target.addScaledVector(fwd, -step);
        break;
      case 'ArrowLeft':
      case 'a':
        this.want.target.addScaledVector(right, -step);
        break;
      case 'ArrowRight':
      case 'd':
        this.want.target.addScaledVector(right, step);
        break;
      case 'q':
        this.want.yaw += Math.PI / 8;
        break;
      case 'e':
        this.want.yaw -= Math.PI / 8;
        break;
      case '+':
      case '=':
        this.want.dist *= 0.85;
        break;
      case '-':
      case '_':
        this.want.dist /= 0.85;
        break;
      case 't':
        this.setTop(!this.top);
        break;
      case 'Home':
        this.reset();
        break;
      default:
        used = false;
    }
    if (!used) return;
    e.preventDefault();
    this.lastUserInput = performance.now();
    this.clampWant();
    this.onChange();
  }
}

function sanitizeInset(i: ContentInset): ContentInset {
  const f = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  return { left: f(i.left), right: f(i.right), top: f(i.top), bottom: f(i.bottom) };
}

function clonePose(p: Pose): Pose {
  return { target: p.target.clone(), dist: p.dist, yaw: p.yaw, tilt: p.tilt };
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
