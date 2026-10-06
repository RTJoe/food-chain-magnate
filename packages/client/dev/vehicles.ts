/**
 * Playground "Vehicles" gallery (animation-plan WP-B): every vehicle / character actor parked in a
 * row on the longest straight road, aircraft overhead, every animation prop in the opposite lane, and
 * one van driving a road loop. `?vehicles=1` opens it on load; `?vehicles=studio` also zooms in.
 */
import * as THREE from 'three';
import type { GameView } from '@fcm/engine';
import type { SceneHandle } from '../src/three/index.js';
import { CHAIN_COLORS, PLAYER_COLORS } from '../src/theme.js';
import { chainMark } from '../src/three/layout.js';
import { releaseTree, type MiniCtx } from '../src/three/minis/ctx.js';
import { ACTOR_FACTORIES, CARGO_SLOTS, LANE, buildPlane, place, yawOf, type Actor, type ActorSpec, type VehicleKind } from '../src/three/minis/vehicles.js';
import { ActorPool, type ActorKind } from '../src/three/anim/pool.js';
import '../src/three/minis/vehiclesActors.js';
import {
  animateConfetti,
  animatePuff,
  animateRadioRings,
  buildCarryToken,
  buildCash,
  buildCoinStack,
  buildConfetti,
  buildCrate,
  buildEnvelope,
  buildGhostToken,
  buildLeaflet,
  buildPuff,
  buildRadioRings,
  flutterLeaflet,
} from '../src/three/minis/props.js';

type Cell = { x: number; y: number };

interface Gallery {
  root: THREE.Group;
  actors: Actor[];
  tick: (dt: number, t: number) => void;
  focus: { x0: number; z0: number; x1: number; z1: number };
  row: { x0: number; x1: number; z: number; px0: number };
}

/** Read at import time: the playground rewrites the query string when it loads a fixture. */
const AUTO = new URLSearchParams(location.search).get('vehicles');

const MARKS = Object.keys(CHAIN_COLORS).map((c) => chainMark(c, c));

function isRoad(v: GameView, x: number, y: number): boolean {
  return !!v.board.cells[y]?.[x]?.road;
}

/** Longest horizontal run of road squares in the south half (nearest the camera, least hidden). */
function longestRun(v: GameView): { y: number; x0: number; x1: number } {
  let best = { y: 0, x0: 0, x1: -1 };
  for (let y = 0; y < v.board.h; y++) {
    let x0 = -1;
    for (let x = 0; x <= v.board.w; x++) {
      if (x < v.board.w && isRoad(v, x, y)) {
        if (x0 < 0) x0 = x;
      } else if (x0 >= 0) {
        const score = (r: { y: number; x0: number; x1: number }) => (r.x1 - r.x0) * (r.y >= v.board.h / 2 ? 1 : 0.3);
        if (score({ y, x0, x1: x - 1 }) > score(best)) best = { y, x0, x1: x - 1 };
        x0 = -1;
      }
    }
  }
  return best;
}

/** A closed loop of road squares (at least 8 long), by bounded DFS; null if none. */
function roadLoop(v: GameView): Cell[] | null {
  const key = (c: Cell) => c.y * 1000 + c.x;
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const;
  let budget = 200000;
  for (let sy = 0; sy < v.board.h; sy++)
    for (let sx = 0; sx < v.board.w; sx++) {
      if (!isRoad(v, sx, sy)) continue;
      const start = { x: sx, y: sy };
      const path: Cell[] = [start];
      const seen = new Set([key(start)]);
      const dfs = (): boolean => {
        if (--budget < 0) return false;
        const last = path[path.length - 1]!;
        for (const [dx, dy] of dirs) {
          const n = { x: last.x + dx, y: last.y + dy };
          if (!isRoad(v, n.x, n.y)) continue;
          if (n.x === sx && n.y === sy && path.length >= 10) return true;
          if (seen.has(key(n)) || path.length > 26) continue;
          seen.add(key(n));
          path.push(n);
          if (dfs()) return true;
          path.pop();
          seen.delete(key(n));
        }
        return false;
      };
      if (dfs()) return path;
    }
  return null;
}

/** Closed rounded path through cell centres; position offset into the right-hand lane. */
function loopFollower(cells: Cell[]): { length: number; at: (s: number) => { x: number; z: number; yaw: number } } {
  // Only corners matter: keep turn cells, round them with a short arc via a centripetal spline.
  const pts = cells.map((c) => new THREE.Vector3(c.x + 0.5, 0, c.y + 0.5));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.1);
  const length = curve.getLength();
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  return {
    length,
    at(s: number) {
      const u = (((s / length) % 1) + 1) % 1;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, tan);
      return { x: p.x - tan.z * LANE, z: p.z + tan.x * LANE, yaw: yawOf(tan.x, tan.z) };
    },
  };
}

function build(scene: SceneHandle, view: GameView): Gallery {
  const stage = scene.internals.stage;
  const ctx: MiniCtx = { inst: stage.inst };
  const lite = stage.tier === 'low';
  const root = new THREE.Group();
  root.name = 'vehicleGallery';
  stage.entities.add(root);
  const actors: Actor[] = [];
  const spec = (i: number, extra: Partial<ActorSpec> = {}): ActorSpec => ({ color: PLAYER_COLORS[i % PLAYER_COLORS.length]!.base, mark: MARKS[i % MARKS.length], lite, ...extra });
  const add = (kind: VehicleKind, i: number, extra: Partial<ActorSpec> = {}): Actor => {
    const a = ACTOR_FACTORIES[kind](ctx, spec(i, extra));
    root.add(a.root);
    actors.push(a);
    return a;
  };

  // Row of ground actors on the longest straight road, westbound in their right (north) lane.
  const run = longestRun(view);
  const row: [VehicleKind, number][] = [
    ['van', 0],
    ['scooter', 1],
    ['cart', 2],
    ['truck', 3],
    ['mailman', 4],
    ['van', 5],
    ['truck', 1],
    ['cart', 0],
  ];
  const z = run.y + 0.5 - LANE;
  const span = Math.max(1, run.x1 - run.x0);
  row.forEach(([kind, i], k) => {
    const a = add(kind, i);
    place(a, run.x0 + 0.5 + (k * span) / Math.max(1, row.length - 1), z, yawOf(-1, 0));
  });
  // Cargo examples.
  const van0 = actors[0]!;
  const load = (a: Actor, items: THREE.Object3D[]) =>
    items.forEach((o, j) => {
      o.position.set(...CARGO_SLOTS[a.kind][Math.min(j, CARGO_SLOTS[a.kind].length - 1)]!);
      a.cargo.add(o);
    });
  load(van0, (['burger', 'pizza', 'beer', 'lemonade'] as const).map((g) => buildCarryToken(ctx, g)));
  load(actors[1]!, [buildCrate(ctx, 'soft_drink')]);
  load(actors[2]!, (['beer', 'lemonade', 'soft_drink'] as const).map((g) => buildCrate(ctx, g)));
  load(actors[3]!, (['lemonade', 'soft_drink', 'beer'] as const).map((g) => buildCrate(ctx, g)));
  actors[4]!.cargo.add(buildEnvelope(ctx, spec(4).color));

  // Aircraft over the row.
  const zep = add('zeppelin', 2);
  const zepCx = (run.x0 + run.x1) / 2 + 0.5;
  const zepCz = run.y - 1.5;
  load(zep, [buildCrate(ctx, 'beer'), buildCrate(ctx, 'lemonade')]);
  const plane = buildPlane(ctx, { ...spec(5), goods: ['burger', 'beer'], bannerLength: 1.3 });
  root.add(plane.root);
  actors.push(plane);

  // Props (animated ones cycle).
  const props: THREE.Object3D[] = [];
  const animated: { o: THREE.Object3D; f: (k: number) => void }[] = [];
  const propRow: THREE.Object3D[] = [
    buildCrate(ctx, 'beer'),
    buildCrate(ctx, 'lemonade'),
    buildCrate(ctx, 'soft_drink'),
    buildEnvelope(ctx, spec(0).color),
    buildCoinStack(ctx, 4),
    buildCash(ctx),
    buildCarryToken(ctx, 'burger'),
    buildCarryToken(ctx, 'pizza'),
    buildGhostToken(ctx, 'lemonade'),
  ];
  const leaflet = buildLeaflet(ctx, spec(5).color);
  const steam = buildPuff(ctx, 'steam');
  const dust = buildPuff(ctx, 'dust');
  const confetti = buildConfetti(ctx, spec(1).color, 12);
  const rings = buildRadioRings(ctx, spec(2).color);
  propRow.push(leaflet, steam, dust, confetti, rings);
  animated.push(
    { o: leaflet, f: (k) => flutterLeaflet(leaflet, k, 1.2, 0.3) },
    { o: steam, f: (k) => animatePuff(steam, k) },
    { o: dust, f: (k) => animatePuff(dust, k) },
    { o: confetti, f: (k) => animateConfetti(confetti, k) },
    { o: rings, f: (k) => animateRadioRings(rings, k, 1.4) },
  );
  rings.position.y = 0.3;
  // Props in the near lane, in front of the parked row.
  const px0 = run.x0 + 0.5;
  const pstep = 0.5;
  propRow.forEach((o, i) => {
    o.position.x = px0 + i * pstep;
    o.position.z = run.y + 0.5 + LANE;
    o.position.y += 0.03;
    root.add(o);
    props.push(o);
  });

  // One van driving a road loop.
  const loop = roadLoop(view);
  const follow = loop ? loopFollower(loop) : null;
  const driver = add('van', 3);
  load(driver, [buildCarryToken(ctx, 'burger'), buildCarryToken(ctx, 'burger')]);
  let s = 0;

  const tick = (dt: number, t: number) => {
    if (follow) {
      s += dt * 1.3;
      const p = follow.at(s);
      place(driver, p.x, p.z, p.yaw);
    }
    // Zeppelin circles; the plane sweeps along the row and back.
    const a = t * 0.35;
    place(zep, zepCx + Math.cos(a) * 2.2, zepCz + Math.sin(a) * 1.0, yawOf(-Math.sin(a) * 2.2, Math.cos(a) * 1.0));
    const sweep = Math.sin(t * 0.3);
    place(plane, zepCx + sweep * 4, run.y - 3.2, yawOf(Math.cos(t * 0.3), 0));
    const k = (t % 1.8) / 1.8;
    for (const x of animated) x.f(k);
    for (const x of actors) x.tick(dt, t);
    stage.invalidate();
  };
  const xs = [run.x0, run.x1 + 1];
  return { root, actors, tick, row: { x0: run.x0, x1: run.x1 + 1, z, px0 }, focus: { x0: Math.min(...xs), z0: run.y - 3, x1: Math.max(...xs), z1: run.y + 1 } };
}

/** Acceptance check: 100 get / release round trips through the real pool grow nothing. */
function poolRoundTrip(scene: SceneHandle): string {
  const stage = scene.internals.stage;
  const pool = new ActorPool(stage);
  const kinds: ActorKind[] = ['van', 'scooter', 'cart', 'truck', 'zeppelin', 'airplane', 'crate', 'envelope', 'leaflet', 'puff', 'confetti', 'ghostToken'];
  const color = PLAYER_COLORS[0]!.base;
  const once = () => {
    const got = kinds.map((k) => pool.get(k, color, k === 'crate' ? 'beer' : k === 'puff' ? 'dust' : null));
    for (const o of got) pool.release(o);
  };
  once();
  const a = stage.inst.stats();
  for (let i = 0; i < 100; i++) once();
  const b = stage.inst.stats();
  const p = pool.stats();
  pool.releaseAll();
  releaseTree(pool.root);
  pool.dispose();
  return `pool x100: instances ${a.instances}→${b.instances}, pools ${a.pools}→${b.pools}, free ${p.free}, live ${p.live}`;
}

export function mountVehicleGallery(scene: SceneHandle, getView: () => GameView, button: HTMLElement, say: (s: string) => void): void {
  const stage = scene.internals.stage;
  let g: Gallery | null = null;
  const off = () => {
    if (!g) return;
    stage.onFrame.delete(g.tick);
    g.root.removeFromParent();
    releaseTree(g.root);
    g = null;
    button.classList.remove('on');
    stage.invalidate();
  };
  const on = (studio: 'board' | 'studio' | 'close' | 'props') => {
    off();
    g = build(scene, getView());
    stage.onFrame.add(g.tick);
    button.classList.add('on');
    if (studio !== 'board') {
      const f = g.focus;
      const cam = scene.internals.cam;
      if (studio === 'studio') cam.focusRect(f.x0, f.z0, f.x1, f.z1);
      else {
        // Close-up of the parked row (or the prop rim with `vehicles=props`).
        // Dev only: fly the camera closer than the game allows.
        const r = g.row;
        const want = (cam as unknown as { want: { target: THREE.Vector3; dist: number } }).want;
        if (studio === 'props') want.target.set(r.px0 + 3.2, 0, r.z + 2 * LANE);
        else want.target.set(r.x0 + 3, 0, r.z);
        want.dist = 4.2;
        stage.invalidate();
      }
    }
    const s = scene.stats();
    say(`vehicles: ${g.actors.length} actors · ${s.pools} pools / ${s.instances} instances · ${poolRoundTrip(scene)}`);
  };
  button.onclick = () => (g ? off() : on('board'));
  // Rebuild when the fixture or tier changes while open.
  (button as HTMLElement & { refresh?: () => void }).refresh = () => g && on('board');
  if (AUTO) setTimeout(() => on(AUTO === 'studio' || AUTO === 'close' || AUTO === 'props' ? AUTO : 'board'), 50);
}
