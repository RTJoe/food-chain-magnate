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
import { RIM } from './coords.js';

const DEG = Math.PI / 180;
export const DEFAULT_TILT = 50 * DEG;
const TOP_TILT = 89.5 * DEG;
const MIN_TILT = 28 * DEG;
const TAP_SLOP = 8;
const TAP_MS = 550;

export interface PointerInfo {
  x: number;
  y: number;
  type: string;
}

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
  private tiltBeforeTop = DEFAULT_TILT;

  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; type: string; button: number; mods: boolean }>();
  private panAnchor: THREE.Vector3 | null = null;
  private pinch: { d: number; a: number; dist: number; yaw: number; mid: THREE.Vector3 | null } | null = null;
  private moved = false;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private cleanup: (() => void)[] = [];

  onTap: (p: PointerInfo) => void = () => {};
  onHover: (p: PointerInfo | null) => void = () => {};
  onChange: () => void = () => {};
  onTopChange: (top: boolean) => void = () => {};

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
    const key = (e: KeyboardEvent) => this.key(e);
    window.addEventListener('keydown', key);
    this.cleanup.push(() => window.removeEventListener('keydown', key));
    this.apply(this.cur);
  }

  // --- Public API -------------------------------------------------------------

  /**
   * Set pan bounds and the home framing from the world rectangle the content covers (board plus
   * rim and any off-board pieces); optionally jump there.
   */
  setContent(r: { x0: number; z0: number; x1: number; z1: number }, frame: boolean): void {
    const size = Math.max(r.x1 - r.x0, r.z1 - r.z0);
    this.bounds = { x0: r.x0 - 1.5, z0: r.z0 - 1.5, x1: r.x1 + 1.5, z1: r.z1 + 1.5, minD: 5, maxD: Math.max(25, size * 2) };
    this.content = { ...r };
    this.home = this.homePose(r);
    this.bounds.maxD = Math.max(this.bounds.maxD, this.home.dist * 1.5);
    if (frame) this.reset(true);
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

  /** Glide to centre a world rectangle. */
  focusRect(x0: number, z0: number, x1: number, z1: number): void {
    this.want.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const span = Math.max(x1 - x0, z1 - z0);
    this.want.dist = clamp(Math.max(8, span * 2.2), this.bounds.minD, this.bounds.maxD);
    this.clampWant();
    this.onChange();
  }

  /** Per-frame damping. Returns true while the camera is still moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 12);
    const c = this.cur;
    const w = this.want;
    const before = c.target.x + c.target.z * 7 + c.dist * 13 + c.yaw * 17 + c.tilt * 19;
    c.target.lerp(w.target, k);
    c.dist += (w.dist - c.dist) * k;
    c.yaw += (w.yaw - c.yaw) * k;
    c.tilt += (w.tilt - c.tilt) * k;
    const after = c.target.x + c.target.z * 7 + c.dist * 13 + c.yaw * 17 + c.tilt * 19;
    const moving = Math.abs(after - before) > 1e-5;
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

  /** Smallest distance at which the board (plus rim) fits the viewport at the home pose. */
  /** Home pose: north up, or turned a quarter on portrait screens so the long side runs down. */
  private homePose(r: { x0: number; z0: number; x1: number; z1: number }): Pose {
    const portrait = (this.camera.aspect || 1) < 0.85 && r.x1 - r.x0 > r.z1 - r.z0;
    const yaw = portrait ? Math.PI / 2 : 0;
    const target = new THREE.Vector3((r.x0 + r.x1) / 2 + Math.sin(yaw) * 0.6, 0, (r.z0 + r.z1) / 2 + Math.cos(yaw) * 0.6);
    return { target, dist: this.fitDistance(r, yaw, target), yaw, tilt: DEFAULT_TILT };
  }

  private fitDistance(r: { x0: number; z0: number; x1: number; z1: number }, yaw: number, target: THREE.Vector3): number {
    const cam = this.camera.clone();
    const corners = [
      new THREE.Vector3(r.x0, 0, r.z0),
      new THREE.Vector3(r.x1, 0, r.z0),
      new THREE.Vector3(r.x0, 0, r.z1),
      new THREE.Vector3(r.x1, 0, r.z1),
      new THREE.Vector3(r.x0, 1.5, r.z0),
      new THREE.Vector3(r.x1, 1.5, r.z0),
    ];
    const fits = (dist: number) => {
      const hd = Math.cos(DEFAULT_TILT) * dist;
      cam.position.set(target.x + Math.sin(yaw) * hd, Math.sin(DEFAULT_TILT) * dist, target.z + Math.cos(yaw) * hd);
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(cam);
        return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.9 && p.z < 1;
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

  /** Re-frame after the viewport changes shape (keeps the user's pose unless at home). */
  refit(): void {
    if (!this.content) return;
    const w = this.want;
    const h = this.home;
    const atHome = Math.abs(w.dist - h.dist) < 0.01 && w.target.distanceTo(h.target) < 0.01 && Math.abs(w.yaw - h.yaw) < 1e-3;
    this.home = this.homePose(this.content);
    this.bounds.maxD = Math.max(this.bounds.maxD, this.home.dist * 1.5);
    if (atHome) this.reset(true);
  }

  private apply(p: Pose): void {
    const hd = Math.cos(p.tilt) * p.dist;
    this.camera.position.set(p.target.x + Math.sin(p.yaw) * hd, Math.sin(p.tilt) * p.dist, p.target.z + Math.cos(p.yaw) * hd);
    // Keep "up" stable in top view (lookAt degenerates straight down).
    this.camera.up.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).lerp(new THREE.Vector3(0, 1, 0), Math.cos(p.tilt) > 0.05 ? 1 : 0);
    this.camera.lookAt(p.target);
    this.camera.updateMatrixWorld();
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
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
    this.clampWant();
    this.onChange();
  }
}

function clonePose(p: Pose): Pose {
  return { target: p.target.clone(), dist: p.dist, yaw: p.yaw, tilt: p.tilt };
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
