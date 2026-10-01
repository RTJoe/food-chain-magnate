/**
 * The 3D board (architecture §5.1–5.3). `mountScene(el, store)` builds the renderer inside `el`,
 * registers itself as the board renderer through state/boardBridge.ts, and returns an unmount
 * function. The overlay talks to it only through the bridge and state/interaction.ts signals.
 */
import { effect, type ReadonlySignal } from '@preact/signals';
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';
import { registerBoardBridge, type BoardBridge, type BoardPick, type InteractionMode } from '../state/boardBridge.js';
import { animationSpeed, cameraCommand, skipAnimations, topView } from '../state/interaction.js';
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
  dispose(): void;
  /** Dev/test access to internals (playground, e2e). */
  readonly internals: { stage: Stage; rec: Reconciler; cam: CameraController; inter: Interaction };
}

export function createScene(el: HTMLElement, opts: SceneOptions = {}): SceneHandle {
  const stage = new Stage(el, opts.tier ?? guessTier());
  const cam = new CameraController(stage.camera, stage.renderer.domElement);
  const rec = new Reconciler(stage);
  if (opts.grid) rec.setGrid(true);
  const anim = new Animator(stage, rec);
  const inter = new Interaction(stage, cam, rec);
  let boardKey = '';

  cam.onChange = () => stage.invalidate();
  cam.onTopChange = (on) => {
    topView.value = on;
  };
  const camTick = (dt: number) => {
    if (cam.update(dt)) stage.invalidate();
  };
  stage.onFrame.add(camTick);
  const refit = () => cam.refit();
  stage.onResize.add(refit);

  const disposers: (() => void)[] = [];
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
      const key = b ? `${b.w}x${b.h}:${b.tiles.map((t) => t.id).join(',')}:${hasRural(b)}` : '';
      const res = rec.sync(view, events.length > 0);
      if (key !== boardKey) {
        const first = boardKey === '';
        boardKey = key;
        if (b) cam.setContent(contentRect(b), first || res.boardChanged);
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
    internals: { stage, rec, cam, inter },
    dispose() {
      for (const d of disposers) d();
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
  return () => handle.dispose();
}

export type { HoverInfo } from './interaction.js';
export type { Tier } from './scene.js';
