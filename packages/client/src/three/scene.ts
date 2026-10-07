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
import { setSpriteTexture } from './labels.js';

/** Screen box in canvas px. */
interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Css px per square from which demand plaques show their full form (goods + capacity pips). */
const PLAQUE_FULL_PPU = 50;

export type Tier = 'high' | 'medium' | 'low';

/**
 * Light rig (art bible §5): warm key from the upper left, cool fill from the right, warm hemisphere
 * ambient, ACES at exposure 1.0. Intensities tuned against the SE photos (se-board-tiles-houses-
 * minis, se-full-board-3x3): the print renders off-white (~#e4e1db), the asphalt warm grey and
 * the burgundy / green plastics true. The room environment stays low (0.15): its white sheen is
 * what washed the plastics out to dusty pink.
 */
const LIGHT = {
  key: '#fff4e0',
  keyI: 2.4,
  fill: '#dfe9f0',
  fillI: 0.5,
  ambient: '#f3eee2',
  ambientGround: '#c9bfae',
  ambientI: 0.85,
  env: 0.15,
  exposure: 1.0,
} as const;

const TIER_ORDER: Tier[] = ['high', 'medium', 'low'];

/** Graphics preference: 'auto' guesses from the device and steps down on slow frames. */
export type GraphicsPref = 'auto' | Tier;
const GRAPHICS_KEY = 'fcm.graphics';

/** The stored graphics preference (a settings control writes it with `setGraphicsPref`). */
export function graphicsPref(): GraphicsPref {
  try {
    const v = globalThis.localStorage?.getItem(GRAPHICS_KEY);
    return v === 'high' || v === 'medium' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setGraphicsPref(p: GraphicsPref): void {
  try {
    if (p === 'auto') globalThis.localStorage?.removeItem(GRAPHICS_KEY);
    else globalThis.localStorage?.setItem(GRAPHICS_KEY, p);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}

/** A tier forced by `?tier=` or the stored preference; null = automatic. */
export function forcedTier(): Tier | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('tier');
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  const p = graphicsPref();
  return p === 'auto' ? null : p;
}

/**
 * Starting tier. Phones and tablets start on medium: browsers clamp `hardwareConcurrency` (every
 * iPhone reports few cores), so core counts cannot tell a capable phone from a weak one. Only a
 * reported low memory starts on low; otherwise the runtime step-down (`watchPerf`) finds it.
 */
export function guessTier(): Tier {
  if (typeof window === 'undefined') return 'medium';
  const forced = forcedTier();
  if (forced) return forced;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem < 3) return 'low';
  if (coarse) return 'medium';
  return cores >= 4 ? 'high' : 'medium';
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly board = new THREE.Group();
  readonly entities = new THREE.Group();
  readonly overlay = new THREE.Group();
  /** Overlay sub-groups (ux-plan WP2): range below reach below routes; ghosts/rings stay in `overlay`. */
  readonly overlays = { range: new THREE.Group(), reach: new THREE.Group(), routes: new THREE.Group() };
  /**
   * Labels with a minimum on-screen size (sprites with `userData.minPx` = minimum css px per world
   * unit). Scaled before each render so plaques stay readable on phones at the default zoom.
   */
  readonly sized = new Set<THREE.Sprite>();
  /** Objects kept "behind" their group origin on screen (`userData.screenBehind` = distance). */
  readonly behind = new Set<THREE.Object3D>();
  readonly inst = new Instancer();
  readonly tweens = new Tweens();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Cool fill from the right (no shadows). */
  readonly fill: THREE.DirectionalLight;
  tier: Tier;

  /** Called every frame before rendering with (dt, time) in seconds. */
  readonly onFrame = new Set<(dt: number, t: number) => void>();
  readonly onResize = new Set<() => void>();
  /** Objects with `userData.ambient` animate every frame. */
  readonly ambient = new Set<THREE.Object3D>();
  /** Tier changes (settings, runtime step-down). */
  readonly onTier = new Set<(t: Tier) => void>();
  /** WebGL context lost (true) / restored (false). three/index.ts falls back to the 2D board. */
  readonly onContext = new Set<(lost: boolean) => void>();
  /** The WebGL context is lost and not restored yet. */
  contextLost = false;

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
    // Art bible §5: ACES at exposure 1.0 so the single-colour plastics do not blow out.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHT.exposure;
    this.renderer.setClearColor(COLORS.paper);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Game board. Arrow keys pan, Q and E turn, plus and minus zoom; while placing, [ and ] step through spots, R rotates, Enter places.');
    el.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.3, 400);

    this.scene.background = new THREE.Color(COLORS.paper);
    this.scene.fog = new THREE.Fog(COLORS.paper, 70, 160);
    this.board.name = 'board';
    this.entities.name = 'entities';
    this.overlay.name = 'overlay';
    this.scene.add(this.board, this.entities, this.overlay, this.inst.root);
    for (const [k, g] of Object.entries(this.overlays)) {
      g.name = `overlay:${k}`;
      this.overlay.add(g);
    }

    // Art bible §5 light rig: warm key from the upper left (the sun, casts shadows), cool fill from
    // the right, warm ambient.
    this.hemi = new THREE.HemisphereLight(LIGHT.ambient, LIGHT.ambientGround, LIGHT.ambientI);
    this.scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight(LIGHT.fill, LIGHT.fillI);
    this.scene.add(this.fill, this.fill.target);
    this.sun = new THREE.DirectionalLight(LIGHT.key, LIGHT.keyI);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.buildEnvironment();
    this.scene.environmentIntensity = LIGHT.env;
    // Phones drop the context of a backgrounded tab; GPU resets do too. preventDefault lets the
    // browser restore it.
    canvas.addEventListener('webglcontextlost', this.contextLostHandler, false);
    canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);

    this.applyTier();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Image-based lighting: a one-off PMREM render. GPU-made, so it must be rebuilt after a context restore. */
  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
  }

  private contextLostHandler = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    for (const f of this.onContext) f(true);
  };

  /**
   * three.js re-uploads geometry and plain textures by itself, but the environment map (rendered on
   * the GPU) comes back black, which darkens every material, and nothing redraws until something
   * marks the frame dirty. Rebuild the environment and the shadow map, then draw.
   */
  private contextRestoredHandler = (): void => {
    this.contextLost = false;
    this.buildEnvironment();
    this.sun.shadow.needsUpdate = true;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
    this.resize();
    this.invalidate();
    for (const f of this.onContext) f(false);
  };

  /** Fit the sun's shadow camera to the board (plus rim and off-board pieces). */
  fitLight(w: number, h: number, extra = 0): void {
    const cx = w / 2;
    const cz = h / 2;
    const r = Math.hypot(w, h) / 2 + RIM + extra;
    this.sun.position.set(cx - r * 0.55, r * 1.6, cz - r * 0.9);
    this.sun.target.position.set(cx, 0, cz);
    this.fill.position.set(cx + r * 1.2, r * 0.9, cz + r * 0.2);
    this.fill.target.position.set(cx, 0, cz);
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
    for (const f of this.onTier) f(t);
  }

  private applyTier(): void {
    const r = this.renderer;
    const shadows = this.tier !== 'low';
    r.shadowMap.enabled = shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = shadows;
    const size = this.tier === 'high' ? 2048 : 1024;
    if (!shadows) {
      // Free the shadow render target when shadows turn off (a runtime step-down to low).
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    } else if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.inst.setShadows(shadows);
    // Without shadow maps the contact blobs carry the grounding; lift the fill a little.
    this.hemi.intensity = shadows ? LIGHT.ambientI : LIGHT.ambientI * 1.25;
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
    const cap = this.tier === 'high' ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const f of this.onResize) f();
    this.invalidate();
  }

  /** Register / unregister screen-sized sprites under `root`. */
  trackSized(root: THREE.Object3D): void {
    root.traverse((o) => {
      if ((o as THREE.Sprite).isSprite && o.userData.minPx) this.sized.add(o as THREE.Sprite);
      if (o.userData.screenBehind) this.behind.add(o);
    });
  }

  untrackSized(root: THREE.Object3D): void {
    root.traverse((o) => {
      if ((o as THREE.Sprite).isSprite) this.sized.delete(o as THREE.Sprite);
      this.behind.delete(o);
    });
  }

  private v = new THREE.Vector3();
  private updateSized(): void {
    const cam = this.camera;
    if (this.behind.size) {
      // Screen "up" projected on the ground: away from the viewer when tilted, north-up from above.
      const e = cam.matrixWorld.elements;
      let ux = e[4]!;
      let uz = e[6]!;
      const l = Math.hypot(ux, uz) || 1;
      ux /= l;
      uz /= l;
      for (const o of this.behind) {
        const d = o.userData.screenBehind as number;
        o.position.x = ux * d;
        o.position.z = uz * d;
      }
    }
    if (!this.sized.size) return;
    const hPx = Math.max(1, this.el.clientHeight);
    const k0 = (2 * Math.tan((cam.fov * Math.PI) / 360)) / hPx / cam.zoom;
    const plaques: { s: THREE.Sprite; wpp: number }[] = [];
    const obstacles: Box[] = [];
    for (const s of this.sized) {
      const base = s.userData.baseH as number;
      s.getWorldPosition(this.v).applyMatrix4(cam.matrixWorldInverse);
      const depth = Math.max(0.1, -this.v.z);
      const wpp = depth * k0;
      if (s.userData.plaque) {
        if (s.visible && s.parent?.visible !== false) plaques.push({ s, wpp });
        continue;
      }
      // Parent scale (pop-in tweens) multiplies through; only the minimum is screen-based.
      const k = Math.min(s.userData.maxK ?? 3, Math.max(1, (s.userData.minPx as number) * wpp));
      const h = base * k;
      s.scale.set(h * (s.userData.aspect as number), h, 1);
      // Stacked above another screen-sized label at the same anchor (plaque over number badge).
      const above = s.userData.above as { baseH: number; minPx: number; gap: number } | undefined;
      if (above) {
        const kb = Math.min(3, Math.max(1, above.minPx * wpp));
        s.center.y = -((above.baseH * kb) / 2 + above.gap * k) / h;
      }
      if (s.userData.obstacle && s.visible) {
        const p = this.toScreen(s);
        if (p) obstacles.push({ l: p.x - (h * (s.userData.aspect as number)) / wpp / 2, r: p.x + (h * (s.userData.aspect as number)) / wpp / 2, t: p.y - h / wpp / 2, b: p.y + h / wpp / 2 });
      }
    }
    if (plaques.length) this.layoutPlaques(plaques, obstacles);
  }

  /** Client px (canvas space) of a sprite's anchor, or null when behind the camera. */
  private toScreen(o: THREE.Object3D): { x: number; y: number } | null {
    const p = o.getWorldPosition(this.v).project(this.camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * this.el.clientWidth, y: ((1 - p.y) / 2) * this.el.clientHeight };
  }

  /**
   * Demand plaques (ux-plan §3.3): full plaque when zoomed in (>= PLAQUE_FULL_PPU css px per
   * square), else the compact one-row form sized to ~22-28 px. Then a greedy pass keeps them
   * apart: busiest houses first, each takes the nearest free slot (in place, beside, above);
   * a plaque with no free slot shrinks to the mini form ("🍔 5") and tries again.
   */
  private layoutPlaques(list: { s: THREE.Sprite; wpp: number }[], obstacles: Box[]): void {
    type Item = { s: THREE.Sprite; wpp: number; x: number; y: number; cy: number; count: number };
    const items: Item[] = [];
    for (const { s, wpp } of list) {
      const pq = s.userData.plaque as { full: THREE.Texture; compact: THREE.Texture; mini: THREE.Texture; count: number };
      const ppu = 1 / wpp;
      const full = ppu >= PLAQUE_FULL_PPU;
      setSpriteTexture(s, full ? pq.full : pq.compact);
      const h = full ? (s.userData.baseH as number) * Math.min(s.userData.maxK ?? 3, Math.max(1, (s.userData.minPx as number) * wpp)) : Math.min(28, Math.max(22, ppu * 1.0)) * wpp;
      s.scale.set(h * (s.userData.aspect as number), h, 1);
      const above = s.userData.above as { baseH: number; minPx: number; gap: number } | undefined;
      const kb = above ? Math.min(3, Math.max(1, above.minPx * wpp)) : 1;
      const cy = above ? -((above.baseH * kb) / 2 + 3 * wpp) / h : s.center.y;
      const p = this.toScreen(s);
      if (!p) continue;
      items.push({ s, wpp, x: p.x, y: p.y, cy, count: pq.count });
    }
    items.sort((a, b) => b.count - a.count || b.y - a.y);
    const placed: Box[] = [...obstacles];
    const hits = (bx: Box) => placed.some((o) => bx.l < o.r + 2 && bx.r > o.l - 2 && bx.t < o.b + 2 && bx.b > o.t - 2);
    for (const it of items) {
      const tryPlace = (): boolean => {
        const s = it.s;
        const hPx = s.scale.y / it.wpp;
        const wPx = hPx * (s.userData.aspect as number);
        const bottom0 = it.y + it.cy * hPx;
        for (const up of [0, hPx * 0.6, hPx * 1.15])
          for (const ox of [0, -wPx * 0.55, wPx * 0.55, -wPx * 1.05, wPx * 1.05]) {
            const bx = { l: it.x + ox - wPx / 2, r: it.x + ox + wPx / 2, b: bottom0 - up, t: bottom0 - up - hPx };
            if (hits(bx)) continue;
            s.center.set(0.5 - ox / wPx, it.cy - up / hPx);
            placed.push(bx);
            return true;
          }
        return false;
      };
      if (tryPlace()) continue;
      const pq = it.s.userData.plaque as { mini: THREE.Texture };
      const h0 = it.s.scale.y;
      setSpriteTexture(it.s, pq.mini);
      const h = Math.min(h0, 20 * it.wpp);
      it.cy *= h0 / h;
      it.s.scale.set(h * (it.s.userData.aspect as number), h, 1);
      if (tryPlace()) continue;
      it.s.center.set(0.5, it.cy);
    }
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
    if (!(this.dirty || tweening || ambientDue) || this.contextLost) return;
    this.dirty = false;
    this.updateSized();
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.watchPerf(performance.now() - t0, dt);
  };

  /** Step the tier down after ~2 s of consistently slow frames. */
  private watchPerf(renderMs: number, dt: number): void {
    const slow = renderMs > 22 || dt > 0.045;
    this.slowFrames = slow ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && !forcedTier()) {
      this.slowFrames = 0;
      const i = TIER_ORDER.indexOf(this.tier);
      if (i < TIER_ORDER.length - 1) this.setTier(TIER_ORDER[i + 1]!);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler, false);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestoredHandler, false);
    this.tweens.finish();
    this.inst.dispose();
    this.env?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
