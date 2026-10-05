/**
 * The 3D board (architecture §5.1–5.3). `mountScene(el, store)` builds the renderer inside `el`,
 * registers itself as the board renderer through state/boardBridge.ts, and returns an unmount
 * function. The overlay talks to it only through the bridge and state/interaction.ts signals.
 */
import * as THREE from 'three';
import { effect, type ReadonlySignal } from '@preact/signals';
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';
import { registerBoardBridge, type BoardBridge, type BoardPick, type InteractionMode } from '../state/boardBridge.js';
import { animationSpeed, cameraCommand, skipAnimations, topView } from '../state/interaction.js';
import { boardInset, highContrastTiles, houseBoardInfo, rangeOverlay, reachOverlay, routeOverlay, type BoardInset, type RouteRibbon } from '../state/boardOverlays.js';
import type { FoodId, HouseId } from '@fcm/engine';
import { OverlayLayer, type OverlayKind, type ReachOptions } from './overlays/index.js';
import { Animator, reducedMotion } from './animate.js';
import { CameraController } from './camera.js';
import { Interaction, type HoverInfo } from './interaction.js';
import { Reconciler } from './reconcile.js';
import { guessTier, Stage, type Tier } from './scene.js';
import { contentRect, hasRural } from './layout.js';

/** The parts of the client store the scene reads. The store module satisfies this. */
export interface SceneStore {
  view?: ReadonlySignal<GameView | null>;
  me?: ReadonlySignal<PlayerId | null>;
}

export interface SceneOptions {
  tier?: Tier;
  /** Register with state/boardBridge.ts (default true). The playground drives the handle directly. */
  register?: boolean;
  /** Show the square grid. */
  grid?: boolean;
}

/** Imperative handle (used by the playground and tests; the app uses the bridge). */
export interface SceneHandle extends BoardBridge {
  onHover(l: (h: HoverInfo | null) => void): () => void;
  highlight(ids: string[]): void;
  focus(ids: string[]): void;
  setTop(on: boolean): void;
  setGrid(on: boolean): void;
  setTier(t: Tier): void;
  readonly tier: Tier;
  skipAnimations(): void;
  stats(): { pools: number; instances: number; pieces: number; calls: number; triangles: number };
  /** Canvas area covered by panels (CSS px); the home framing fits the board into the rest. */
  setInset(inset: BoardInset): void;
  /** Overlay primitives (ux-plan WP2). Each kind replaces its previous drawing. */
  drawRangeOverlay(data: Parameters<OverlayLayer['drawRangeOverlay']>[0]): void;
  drawReach(houseIds: readonly HouseId[], good: FoodId, full?: readonly HouseId[], opts?: ReachOptions): void;
  drawRouteRibbons(candidates: readonly RouteRibbon[], activeIdx: number, opts?: { color?: string }): void;
  clearOverlays(kind?: OverlayKind | 'all'): void;
  /** Route candidate under a client-space point (nearest ribbon), or null. */
  routeAt(clientX: number, clientY: number): number | null;
  /** Client-space position (CSS px) of a world point (board x, height y, board z). For tests and tooltips. */
  project(x: number, z: number, y?: number): { x: number; y: number };
  dispose(): void;
  /** Dev/test access to internals (playground, e2e). */
  readonly internals: { stage: Stage; rec: Reconciler; cam: CameraController; inter: Interaction; overlays: OverlayLayer };
}

export function createScene(el: HTMLElement, opts: SceneOptions = {}): SceneHandle {
  const stage = new Stage(el, opts.tier ?? guessTier());
  const cam = new CameraController(stage.camera, stage.renderer.domElement);
  const rec = new Reconciler(stage);
  if (opts.grid) rec.setGrid(true);
  const anim = new Animator(stage, rec);
  const inter = new Interaction(stage, cam, rec);
  const overlays = new OverlayLayer(stage, rec);
  inter.routeAt = (p) => overlays.pickRoute(cam.rayAt(p.x, p.y));
  let boardKey = '';
  let lastView: GameView | null = null;
  let inset: BoardInset = boardInset.peek() ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const TOP_FROM = 70 * (Math.PI / 180);
  const seamStyle = () => {
    const t = Math.min(1, Math.max(0, (cam.tilt - TOP_FROM) / (Math.PI / 2 - TOP_FROM)));
    rec.setTileStyle(t, highContrastTiles.peek(), cam.yaw);
  };

  cam.onChange = () => stage.invalidate();
  cam.onTopChange = (on) => {
    topView.value = on;
  };
  const camTick = (dt: number) => {
    if (cam.update(dt)) {
      seamStyle();
      stage.invalidate();
    }
  };
  stage.onFrame.add(camTick);
  const refit = () => cam.refit();
  stage.onResize.add(refit);

  const disposers: (() => void)[] = [];
  // Overlay signals (state/boardOverlays.ts).
  disposers.push(
    effect(() => {
      void highContrastTiles.value;
      seamStyle();
    }),
    effect(() => {
      rec.setHouseInfo(houseBoardInfo.value);
      if (lastView) {
        rec.sync(lastView, false);
        inter.refresh();
      }
    }),
    effect(() => {
      const i = boardInset.value;
      if (!i) return;
      inset = { ...i };
      cam.setInset(i);
    }),
    effect(() => {
      const d = rangeOverlay.value;
      if (d) overlays.drawRangeOverlay(d);
      else overlays.clearOverlays('range');
    }),
    effect(() => {
      const d = reachOverlay.value;
      if (d) overlays.drawReach(d.houseIds, d.good, d.full, { color: d.color, cells: d.cells, band: d.band });
      else overlays.clearOverlays('reach');
    }),
    effect(() => {
      const d = routeOverlay.value;
      if (d) overlays.drawRouteRibbons(d.candidates, d.active, { color: d.color });
      else overlays.clearOverlays('routes');
    }),
  );
  disposers.push(
    effect(() => {
      stage.tweens.speed = reducedMotion() ? 0 : Math.max(0, animationSpeed.value);
    }),
  );
  let firstSkip = true;
  disposers.push(
    effect(() => {
      void skipAnimations.value;
      if (firstSkip) return void (firstSkip = false);
      anim.skip();
    }),
  );
  disposers.push(
    effect(() => {
      const c = cameraCommand.value;
      if (!c) return;
      cameraCommand.value = null;
      switch (c.kind) {
        case 'reset':
          cam.reset();
          break;
        case 'top':
          cam.setTop(c.on ?? !cam.isTop);
          break;
        case 'zoom':
          cam.zoomBy(c.by);
          break;
        case 'yaw':
          cam.yawBy(c.by);
          break;
        case 'focus':
          inter.focus(c.ids);
          break;
      }
    }),
  );

  const handle: SceneHandle = {
    setView(view: GameView | null, _me: PlayerId | null, events: readonly GameEvent[]) {
      const b = view?.board;
      lastView = view;
      const key = b ? `${b.w}x${b.h}:${b.tiles.map((t) => t.id).join(',')}:${hasRural(b)}` : '';
      const res = rec.sync(view, events.length > 0);
      if (key !== boardKey) {
        const first = boardKey === '';
        boardKey = key;
        if (b) cam.setContent(contentRect(b), first || res.boardChanged, inset);
        seamStyle();
      }
      if (events.length) anim.play(events, res.added, res.prevDemand);
      inter.refresh();
    },
    setInteractionMode(mode: InteractionMode) {
      inter.setMode(mode);
    },
    onPick(l: (p: BoardPick) => void) {
      return inter.onPick(l);
    },
    onHover: (l) => inter.onHover(l),
    highlight: (ids) => inter.highlight(ids),
    focus: (ids) => inter.focus(ids),
    setTop: (on) => cam.setTop(on),
    setGrid: (on) => rec.setGrid(on),
    setTier: (t) => stage.setTier(t),
    get tier() {
      return stage.tier;
    },
    skipAnimations: () => anim.skip(),
    stats() {
      const info = stage.renderer.info.render;
      return { ...stage.inst.stats(), pieces: rec.live.size, calls: info.calls, triangles: info.triangles };
    },
    setInset(i: BoardInset) {
      inset = { ...i };
      cam.setInset(i);
    },
    drawRangeOverlay: (d) => overlays.drawRangeOverlay(d),
    drawReach: (ids, good, full, opts) => overlays.drawReach(ids, good, full, opts),
    drawRouteRibbons: (c, i, o) => overlays.drawRouteRibbons(c, i, o),
    clearOverlays: (k) => overlays.clearOverlays(k),
    routeAt: (x, y) => overlays.pickRoute(cam.rayAt(x, y)),
    project(x, z, y = 0) {
      const v = new THREE.Vector3(x, y, z).project(stage.camera);
      const r = stage.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    internals: { stage, rec, cam, inter, overlays },
    dispose() {
      for (const d of disposers) d();
      anim.dispose();
      overlays.dispose();
      stage.onFrame.delete(camTick);
      stage.onResize.delete(refit);
      inter.dispose();
      cam.dispose();
      rec.dispose();
      stage.dispose();
    },
  };

  if (opts.register !== false) {
    const unregister = registerBoardBridge(handle, '3d');
    disposers.push(unregister);
  }
  return handle;
}

/**
 * Mount the 3D board into `el`. The scene registers with the board bridge (which replays the
 * latest view); `store` is a fallback for the first frame when the bridge has not seen a view.
 */
export function mountScene(el: HTMLElement, store?: SceneStore): () => void {
  let handle: SceneHandle;
  try {
    handle = createScene(el);
  } catch (err) {
    // No WebGL: leave the overlay's 2D board in place.
    console.warn('3D board unavailable', err);
    return () => {};
  }
  const v = store?.view?.value;
  if (v) handle.setView(v, store?.me?.value ?? null, []);
  const stopInset = watchTableInset(el, (i) => handle.setInset(i));
  // Test hook (e2e, Playwright checks): board pieces → screen points, route hit tests, internals.
  const w = window as unknown as { __fcmBoard?: SceneHandle };
  w.__fcmBoard = handle;
  return () => {
    stopInset();
    if (w.__fcmBoard === handle) delete w.__fcmBoard;
    handle.dispose();
  };
}

/**
 * Measure the canvas area the table layout leaves free for the board: `.table-board` (the grid
 * cell between rail, dock and top bar) and, on phones, the collapsed bottom sheet (`.dock` when it
 * is `position: fixed`; while the sheet is open the last value is kept so the camera does not jump).
 * Skipped while `boardInset` holds an explicit value.
 */
export function measureTableInset(el: HTMLElement, prev: BoardInset): BoardInset | null {
  const area = document.querySelector<HTMLElement>('.table-board');
  if (!area) return null;
  const e = el.getBoundingClientRect();
  const a = area.getBoundingClientRect();
  if (a.width < 1 || a.height < 1) return null;
  const out: BoardInset = { left: a.left - e.left, right: e.right - a.right, top: a.top - e.top, bottom: e.bottom - a.bottom };
  const dock = document.querySelector<HTMLElement>('.dock');
  if (dock && getComputedStyle(dock).position === 'fixed') {
    if (dock.classList.contains('is-open')) out.bottom = prev.bottom;
    else out.bottom = Math.max(out.bottom, e.bottom - dock.getBoundingClientRect().top);
  }
  return out;
}

function watchTableInset(el: HTMLElement, apply: (i: BoardInset) => void): () => void {
  let last: BoardInset = { left: 0, right: 0, top: 0, bottom: 0 };
  const tick = () => {
    if (boardInset.peek()) return;
    const i = measureTableInset(el, last);
    if (!i) return;
    last = i;
    apply(i);
  };
  tick();
  const id = window.setInterval(tick, 400);
  window.addEventListener('resize', tick);
  return () => {
    window.clearInterval(id);
    window.removeEventListener('resize', tick);
  };
}

export type { HoverInfo } from './interaction.js';
export type { OverlayKind, ReachOptions } from './overlays/index.js';
export { localCampaignReach, localRangeField, playerStarts } from './overlays/fallback.js';
export type { Tier } from './scene.js';
