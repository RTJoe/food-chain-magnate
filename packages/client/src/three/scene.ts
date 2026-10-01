/**
 * Renderer, lights and render loop (architecture §5.1). Groups: board (ground, roads), entities
 * (minis, all instanced through `inst`), overlay (highlights, ghosts, effects).
 *
 * Quality tiers: `high` (soft 2048 shadows, DPR up to 2), `medium` (PCF 1024, DPR 1.5), `low`
 * (no shadow maps, DPR 1, ambient animation throttled). The tier is guessed from the device and
 * stepped down at runtime when frames stay slow.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COLORS } from '../theme.js';
import { Instancer } from './instancer.js';
import { RIM } from './coords.js';
import { Tweens } from './tween.js';

export type Tier = 'high' | 'medium' | 'low';

const TIER_ORDER: Tier[] = ['high', 'medium', 'low'];

export function guessTier(): Tier {
  if (typeof window === 'undefined') return 'medium';
  const q = new URLSearchParams(window.location.search).get('tier');
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (coarse) return cores >= 8 && mem >= 4 ? 'medium' : 'low';
  return cores >= 4 ? 'high' : 'medium';
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly board = new THREE.Group();
  readonly entities = new THREE.Group();
  readonly overlay = new THREE.Group();
  readonly inst = new Instancer();
  readonly tweens = new Tweens();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  tier: Tier;

  /** Called every frame before rendering with (dt, time) in seconds. */
  readonly onFrame = new Set<(dt: number, t: number) => void>();
  readonly onResize = new Set<() => void>();
  /** Objects with `userData.ambient` animate every frame. */
  readonly ambient = new Set<THREE.Object3D>();

  private dirty = true;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private slowFrames = 0;
  private ro: ResizeObserver;
  private env: THREE.Texture | null = null;
  private lastAmbient = 0;

  constructor(readonly el: HTMLElement, tier: Tier = guessTier()) {
    this.tier = tier;
    this.renderer = new THREE.WebGLRenderer({ antialias: tier !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(COLORS.paper);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.outline = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Game board');
    el.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.3, 400);

    this.scene.background = new THREE.Color(COLORS.paper);
    this.scene.fog = new THREE.Fog(COLORS.paper, 70, 160);
    this.board.name = 'board';
    this.entities.name = 'entities';
    this.overlay.name = 'overlay';
    this.scene.add(this.board, this.entities, this.overlay, this.inst.root);

    this.hemi = new THREE.HemisphereLight('#fff3dc', '#b49b78', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.3);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.35;

    this.applyTier();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Fit the sun's shadow camera to the board (plus rim and off-board pieces). */
  fitLight(w: number, h: number, extra = 0): void {
    const cx = w / 2;
    const cz = h / 2;
    const r = Math.hypot(w, h) / 2 + RIM + extra;
    this.sun.position.set(cx - r * 0.55, r * 1.6, cz - r * 0.9);
    this.sun.target.position.set(cx, 0, cz);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.5;
    cam.far = r * 4;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
    this.invalidate();
  }

  setTier(t: Tier): void {
    if (t === this.tier) return;
    this.tier = t;
    this.applyTier();
    this.resize();
  }

  private applyTier(): void {
    const r = this.renderer;
    const shadows = this.tier !== 'low';
    r.shadowMap.enabled = shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = shadows;
    const size = this.tier === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.inst.setShadows(shadows);
    // Without shadow maps the contact blobs carry the grounding; lift the fill a little.
    this.hemi.intensity = shadows ? 1.25 : 1.55;
    // Materials must recompile when the shadow setup changes.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
    this.invalidate();
  }

  private resize(): void {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    const cap = this.tier === 'high' ? 2 : this.tier === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const f of this.onResize) f();
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.clock += dt;
    for (const f of this.onFrame) f(dt, this.clock);
    const tweening = this.tweens.active;
    this.tweens.tick(dt);
    let ambientDue = false;
    if (this.ambient.size) {
      const step = this.tier === 'low' ? 1 / 20 : 0;
      if (this.clock - this.lastAmbient >= step) {
        ambientDue = true;
        this.lastAmbient = this.clock;
        for (const o of this.ambient) (o.userData.animate as ((t: number) => void) | undefined)?.(this.clock);
      }
    }
    if (!(this.dirty || tweening || ambientDue)) return;
    this.dirty = false;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.watchPerf(performance.now() - t0, dt);
  };

  /** Step the tier down after ~2 s of consistently slow frames. */
  private watchPerf(renderMs: number, dt: number): void {
    const slow = renderMs > 22 || dt > 0.045;
    this.slowFrames = slow ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90) {
      this.slowFrames = 0;
      const i = TIER_ORDER.indexOf(this.tier);
      if (i < TIER_ORDER.length - 1) this.setTier(TIER_ORDER[i + 1]!);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.tweens.finish();
    this.inst.dispose();
    this.env?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
