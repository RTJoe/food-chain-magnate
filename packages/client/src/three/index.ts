/**
 * The 3D board (architecture §5.1–5.3). `mountScene(el, store)` builds the renderer inside `el`,
 * registers itself as the board renderer through state/boardBridge.ts, and returns an unmount
 * function. The overlay talks to it only through the bridge and state/interaction.ts signals.
 */
import * as THREE from 'three';
import { effect, type ReadonlySignal } from '@preact/signals';
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';
import { registerBoardBridge, type BoardBridge, type BoardPick, type InteractionMode } from '../state/boardBridge.js';
import { animationSpeed, cameraCommand, skipAnimations, skipBoardBuild, topView, tutorialHighlight } from '../state/interaction.js';
import { boardInset, highContrastTiles, houseBoardInfo, rangeOverlay, reachOverlay, routeOverlay, type BoardInset, type RouteRibbon } from '../state/boardOverlays.js';
import type { FoodId, HouseId } from '@fcm/engine';
import { OverlayLayer, type OverlayKind, type ReachOptions } from './overlays/index.js';
import { Animator, reducedMotion } from './animate.js';
import { CameraController } from './camera.js';
import { Interaction, type HoverInfo } from './interaction.js';
import { Reconciler } from './reconcile.js';
import { guessTier, Stage, type Tier } from './scene.js';
import { chainMark, contentRect, frameRect, hasRural, playerColor } from './layout.js';
import { setActorMarks } from './minis/vehiclesActors.js';

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
  /** World footprint of a board piece (house / restaurant / campaign / source / entity id), or null. Lesson spotlights. */
  boundsOf(id: string): { x0: number; z0: number; x1: number; z1: number } | null;
  dispose(): void;
  /** Dev/test access to internals (playground, e2e). */
  readonly internals: { stage: Stage; rec: Reconciler; cam: CameraController; inter: Interaction; overlays: OverlayLayer; anim: Animator; timeline: TimelineHandle };
}

/** The running animation timeline, for tests (`window.__fcmBoard.internals.timeline`). */
export interface TimelineHandle {
  readonly active: boolean;
  /** Planned length of the running timeline (s at 1×), 0 when idle. */
  readonly length: number;
  /** Current time of the running timeline (s at 1×). */
  readonly time: number;
  finish(): void;
  pause(): void;
  resume(): void;
}

export function createScene(el: HTMLElement, opts: SceneOptions = {}): SceneHandle {
  const stage = new Stage(el, opts.tier ?? guessTier());
  const cam = new CameraController(stage.camera, stage.renderer.domElement);
  const rec = new Reconciler(stage);
  if (opts.grid) rec.setGrid(true);
  const anim = new Animator(stage, rec);
  // e2e waits on data-anim="idle" before asserting.
  const canvas = stage.renderer.domElement;
  canvas.dataset.anim = 'idle';
  anim.onActive = (on) => {
    canvas.dataset.anim = on ? 'playing' : 'idle';
  };
  const timeline: TimelineHandle = {
    get active() {
      return anim.active;
    },
    get length() {
      return anim.timeline?.length ?? 0;
    },
    get time() {
      return anim.timeline?.time ?? 0;
    },
    finish: () => anim.finish(),
    pause: () => anim.timeline?.pause(),
    resume: () => anim.timeline?.resume(),
  };
  const inter = new Interaction(stage, cam, rec);
  const overlays = new OverlayLayer(stage, rec);
  inter.routeAt = (p) => overlays.pickRoute(cam.rayAt(p.x, p.y));
  let boardKey = '';
  let lastView: GameView | null = null;
  let lastMe: PlayerId | null = null;
  let vanColors = '';
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
      // Reduced motion (or speed 0) still runs the clock at 1×: reduced plans hold captions per step.
      const s = animationSpeed.value;
      stage.tweens.speed = reducedMotion() || s <= 0 ? 1 : s;
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
        case 'frame':
          cam.focusRect(c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1);
          break;
      }
    }),
    // Lesson coach marks: ring the step's board targets.
    effect(() => inter.highlight([...tutorialHighlight.value])),
  );

  const handle: SceneHandle = {
    setView(view: GameView | null, me: PlayerId | null, events: readonly GameEvent[]) {
      const b = view?.board;
      const prevView = lastView;
      const prevMe = lastMe;
      lastView = view;
      lastMe = me;
      // Handoff / reconnect snapshot: nothing to animate; whatever runs jumps to its end first. An
      // applied action with no visible events (another player's hidden submission) is not one: it
      // must not cut a running Dinnertime short.
      const jumped = !prevView || !view || prevView.round !== view.round || prevView.phase.kind !== view.phase.kind;
      if (!events.length && view !== prevView && (me !== prevMe || jumped)) anim.finish();
      const air = b ? [...new Set(Object.values(b.campaigns).flatMap((c) => (c.placement.kind === 'airplane' ? [c.placement.side] : [])))].sort().join('') : '';
      const key = b ? `${b.w}x${b.h}:${b.tiles.map((t) => t.id).join(',')}:${hasRural(b)}:${air}` : '';
      const res = rec.sync(view, events.length > 0);
      if (key !== boardKey) {
        const first = boardKey === '';
        boardKey = key;
        if (b) cam.setContent(contentRect(b), first || res.boardChanged, inset, frameRect(b));
        seamStyle();
      }
      if (view && view.players) {
        const colors = Object.keys(view.players).map((id) => playerColor(view, id));
        if (colors.join() !== vanColors) {
          vanColors = colors.join();
          // Vehicle decals: chain mark by colour (vans built later pick it up; variant stays null).
          setActorMarks(Object.fromEntries(Object.keys(view.players).map((id) => [playerColor(view, id), chainMark(view.players[id]?.chain, id)])));
          anim.pool.prewarm('van', colors, 2);
        }
      }
      if (events.length) anim.play(events, { view, prevView, me, added: res.added, removed: res.removed, prevDemand: res.prevDemand });
      else if (!prevView && view && view.phase.kind === 'setup.restaurants' && !Object.keys(view.board.restaurants).length && !skipBoardBuild.peek()) {
        // Games start from a snapshot (`gameStarted` is never a live batch): the first look at a
        // fresh board plays the setup board build (animation-plan §2.1).
        anim.play([{ type: 'gameStarted', players: Object.keys(view.players), turnOrder: [...view.turnOrder] }], { view, prevView: null, me, added: [], removed: [], prevDemand: res.prevDemand });
      }
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
    boundsOf(id) {
      const ps = rec.byId(id).filter((p) => p.kind !== 'demand');
      if (!ps.length) return null;
      return {
        x0: Math.min(...ps.map((p) => p.rect.x0)),
        z0: Math.min(...ps.map((p) => p.rect.z0)),
        x1: Math.max(...ps.map((p) => p.rect.x1)),
        z1: Math.max(...ps.map((p) => p.rect.z1)),
      };
    },
    internals: { stage, rec, cam, inter, overlays, anim, timeline },
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
  const stopInset = watchTableInset(el, (i) => handle.setInset(i), () => handle.internals.cam.homeAspect());
  // Test hook (e2e, Playwright checks): board pieces → screen points, route hit tests, internals.
  const w = window as unknown as { __fcmBoard?: SceneHandle };
  w.__fcmBoard = handle;
  return () => {
    stopInset();
    if (w.__fcmBoard === handle) delete w.__fcmBoard;
    handle.dispose();
  };
}

/** Panels floating over the board area that the home framing keeps clear of (camera bar, pick strip, results strip, Inspect card). */
const FLOATING = ['.board-controls', '.pick-strip', '.summary-strip', '.inspect'];

/**
 * Measure the canvas area the table layout leaves free for the board: `.table-board` (the grid
 * cell between rail, dock and top bar), on phones the collapsed bottom sheet (`.dock` when it is
 * `position: fixed`; while the sheet is open the last value is kept so the camera does not jump),
 * then every visible floating panel over that area (FLOATING). Each panel is carved off the side
 * that leaves the board the most room: a bottom strip trims the bottom, a tall side card the side;
 * a panel that would cost more than 65% of the board's size is left floating over it.
 * `aspect` is the board's on-screen width / height at the home pose. Skipped while `boardInset`
 * holds an explicit value.
 */
export function measureTableInset(el: HTMLElement, prev: BoardInset, aspect = 1.6): BoardInset | null {
  const area = document.querySelector<HTMLElement>('.table-board');
  if (!area) return null;
  const e = el.getBoundingClientRect();
  const a = area.getBoundingClientRect();
  if (a.width < 1 || a.height < 1) return null;
  const dock = document.querySelector<HTMLElement>('.dock');
  const fixedDock = !!dock && getComputedStyle(dock).position === 'fixed';
  if (fixedDock && dock!.classList.contains('is-open')) return prev;
  // Free rectangle in client px.
  const f = { l: Math.max(e.left, a.left), r: Math.min(e.right, a.right), t: Math.max(e.top, a.top), b: Math.min(e.bottom, a.bottom) };
  if (fixedDock) f.b = Math.min(f.b, dock!.getBoundingClientRect().top);
  const score = (x: typeof f) => Math.min(Math.max(0, x.r - x.l) / aspect, Math.max(0, x.b - x.t));
  for (const sel of FLOATING)
    for (const p of document.querySelectorAll<HTMLElement>(sel)) {
      const r = p.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || getComputedStyle(p).visibility === 'hidden') continue;
      if (r.right <= f.l || r.left >= f.r || r.bottom <= f.t || r.top >= f.b) continue;
      const options = [
        { ...f, b: Math.min(f.b, r.top) },
        { ...f, t: Math.max(f.t, r.bottom) },
        { ...f, l: Math.max(f.l, r.right) },
        { ...f, r: Math.min(f.r, r.left) },
      ];
      let best = options[0]!;
      for (const o of options) if (score(o) > score(best)) best = o;
      // A panel that would leave the board too little room (an Inspect card beside the results
      // strip) floats over the board instead.
      if (score(best) >= 0.35 * score(f)) Object.assign(f, best);
    }
  return { left: f.l - e.left, right: e.right - f.r, top: f.t - e.top, bottom: e.bottom - f.b };
}

function watchTableInset(el: HTMLElement, apply: (i: BoardInset) => void, aspect: () => number): () => void {
  let last: BoardInset = { left: 0, right: 0, top: 0, bottom: 0 };
  const tick = () => {
    if (boardInset.peek()) return;
    const i = measureTableInset(el, last, aspect());
    if (!i) return;
    last = i;
    apply(i);
  };
  tick();
  // Panels appear / disappear through DOM changes: measure on the next frame so the camera starts
  // moving at once; the interval catches CSS transitions and anything the observer misses.
  let raf = 0;
  const soon = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), tick()));
  };
  const mo = new MutationObserver(soon);
  const root = document.querySelector('#app') ?? document.body;
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const id = window.setInterval(tick, 250);
  window.addEventListener('resize', tick);
  return () => {
    mo.disconnect();
    cancelAnimationFrame(raf);
    window.clearInterval(id);
    window.removeEventListener('resize', tick);
  };
}

export type { HoverInfo } from './interaction.js';
export type { OverlayKind, ReachOptions } from './overlays/index.js';
export { localCampaignReach, localRangeField, playerStarts } from './overlays/fallback.js';
export type { Tier } from './scene.js';
