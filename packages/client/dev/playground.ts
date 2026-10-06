/**
 * Standalone 3D board viewer: loads engine fixtures (no server, no overlay) and fakes a few
 * interactions and event batches to exercise picking and animations.
 * Open http://localhost:5173/dev/three-playground.html?fixture=dinnertime
 */
import type { Cell, Corner, FoodId, GameEvent, GameState, GameView, HouseId, Placement, RouteStart, SourceId } from '@fcm/engine';
import { FIXTURES, type FixtureName } from '@fcm/engine/testing';
import { createScene, localCampaignReach, localRangeField, playerStarts, type Tier } from '../src/three/index.js';
import { topView } from '../src/state/interaction.js';
import { highContrastTiles, type RouteRibbon } from '../src/state/boardOverlays.js';
import { houseCapacity } from '../src/three/reconcile.js';
import { playerColor } from '../src/three/layout.js';
import { startRoads } from '../src/three/overlays/fallback.js';
import { mountVehicleGallery } from './vehicles.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

const scene = createScene($('board'), { register: false, tier: (params.get('tier') as Tier | null) ?? undefined });
(window as unknown as { scene: typeof scene }).scene = scene;

let view: GameView;
const info = $('info');
const say = (s: string) => {
  info.textContent = s;
};

function toView(s: GameState): GameView {
  const { rng: _r, seed: _s, secrets: _x, ...rest } = s as GameState & { rng: unknown; seed: unknown; secrets: unknown };
  return { ...(rest as unknown as Omit<GameView, 'viewer' | 'mine' | 'submitted' | 'visibleReserves'>), viewer: 'spectator', mine: null, submitted: {}, visibleReserves: {} };
}

const clone = <T>(x: T): T => structuredClone(x);

function load(name: FixtureName): void {
  view = toView(FIXTURES[name]());
  scene.clearOverlays('all');
  scene.setInteractionMode({ kind: 'idle' });
  scene.setView(view, null, []);
  const b = view.board;
  say(`${name}: ${b.w}x${b.h}, ${Object.keys(b.houses).length} houses, ${Object.keys(b.restaurants).length} restaurants, ${Object.keys(b.campaigns).length} campaigns`);
  history.replaceState(null, '', `?fixture=${name}`);
}

// --- Controls ------------------------------------------------------------------------

const sel = $<HTMLSelectElement>('fixture');
for (const k of Object.keys(FIXTURES)) sel.add(new Option(k, k));
const initial = (params.get('fixture') as FixtureName | null) ?? 'dinnertime';
sel.value = initial in FIXTURES ? initial : 'dinnertime';
sel.onchange = () => load(sel.value as FixtureName);

const tierSel = $<HTMLSelectElement>('tier');
tierSel.value = scene.tier;
tierSel.onchange = () => scene.setTier(tierSel.value as Tier);

let grid = false;
$('grid').onclick = () => {
  grid = !grid;
  scene.setGrid(grid);
  $('grid').classList.toggle('on', grid);
};
$('top').onclick = () => scene.setTop(!topView.value);
topView.subscribe((on) => $('top').classList.toggle('on', on));
$('skip').onclick = () => scene.skipAnimations();

scene.onHover((h) => {
  if (!h) return;
  const where = h.cell ? `(${h.cell.x}, ${h.cell.y})` : '';
  if (h.id || h.cell) say(`${h.id ?? ''} ${where}`.trim());
});

scene.onPick((p) => {
  if (p.kind === 'object') {
    say(`clicked ${p.id}`);
    scene.highlight([p.id]);
    return;
  }
  if (p.kind === 'cancel') {
    scene.setInteractionMode({ kind: 'idle' });
    $('place').classList.remove('on');
    say('placement cancelled');
    return;
  }
  const pl = p.placement;
  if (pl.kind !== 'restaurant') return;
  const owner = view.turnOrder[0] ?? Object.keys(view.players)[0]!;
  const next = clone(view);
  const id = `pg-r${Date.now() % 100000}`;
  next.board.restaurants[id] = { id, owner, x: pl.x, y: pl.y, entrance: pl.entrance, status: 'open', placedRound: next.round };
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const c = next.board.cells[pl.y + dy]?.[pl.x + dx];
    if (c) {
      c.kind = 'restaurant';
      c.occupant = id;
    }
  }
  view = next;
  scene.setInteractionMode({ kind: 'idle' });
  $('place').classList.remove('on');
  scene.setView(view, null, [{ type: 'restaurantPlaced', player: owner, restaurantId: id, x: pl.x, y: pl.y, entrance: pl.entrance, comingSoon: false }]);
  say(`placed restaurant at (${pl.x}, ${pl.y}) ${pl.entrance}`);
});

/** Fake legal placements: every empty 2x2 next to a road, all four entrances. */
function restaurantSpots(v: GameView): Placement[] {
  const b = v.board;
  const empty = (x: number, y: number) => b.cells[y]?.[x]?.kind === 'empty';
  const road = (x: number, y: number) => !!b.cells[y]?.[x]?.road;
  const out: Placement[] = [];
  for (let y = 0; y < b.h - 1; y++)
    for (let x = 0; x < b.w - 1; x++) {
      if (!(empty(x, y) && empty(x + 1, y) && empty(x, y + 1) && empty(x + 1, y + 1))) continue;
      const touches = [-1, 2].some((d) => road(x + d, y) || road(x + d, y + 1) || road(x, y + d) || road(x + 1, y + d));
      if (!touches) continue;
      for (const entrance of ['NW', 'NE', 'SE', 'SW'] as Corner[]) out.push({ kind: 'restaurant', x, y, entrance });
    }
  return out;
}

$('place').onclick = () => {
  const on = !$('place').classList.contains('on');
  $('place').classList.toggle('on', on);
  if (!on) return scene.setInteractionMode({ kind: 'idle' });
  const owner = view.turnOrder[0] ?? Object.keys(view.players)[0]!;
  const placements = restaurantSpots(view);
  scene.setInteractionMode({ kind: 'place', placementKind: 'restaurant', placements, label: 'Place your restaurant', color: view.players[owner]?.color ?? '#d94f3d' });
  say(`${placements.length} legal placements (R rotates, Esc cancels)`);
};

/** Fake marketing: each board campaign runs and drops one token on the nearest houses. */
$('market').onclick = () => {
  const next = clone(view);
  const events: GameEvent[] = [];
  const houses = Object.values(next.board.houses).filter((h) => h.cells.length);
  for (const c of Object.values(next.board.campaigns)) {
    events.push({ type: 'campaignRan', campaignId: c.id, pass: 1 });
    const good = (c.goods[0] ?? 'burger') as FoodId;
    const target = houses[(c.number ?? 0) % Math.max(1, houses.length)];
    if (!target) continue;
    const tokens = [{ good, by: c.owner, campaign: c.id }];
    target.demand.push(...tokens);
    events.push({ type: 'demandPlaced', campaignId: c.id, houseId: target.id, tokens });
  }
  view = next;
  scene.setView(view, null, events);
  say(`marketing: ${events.length} events`);
};

/** Fake dinnertime: each house with demand buys from the first restaurant. */
$('dinner').onclick = () => {
  const next = clone(view);
  const events: GameEvent[] = [];
  const rs = Object.values(next.board.restaurants).filter((r) => r.status === 'open');
  let i = 0;
  for (const h of Object.values(next.board.houses)) {
    if (!h.demand.length || !rs.length) continue;
    const r = rs[i++ % rs.length]!;
    const counts = new Map<FoodId, number>();
    for (const d of h.demand) counts.set(d.good, (counts.get(d.good) ?? 0) + 1);
    const lines = [...counts].map(([good, count]) => ({ good, count, each: 10 }));
    const total = lines.reduce((s, l) => s + l.count * l.each, 0);
    events.push({ type: 'sale', houseId: h.id, player: r.owner, restaurantId: r.id, distance: 3, unitPrice: 10, lines, bonuses: [], total });
    h.demand = [];
  }
  view = next;
  scene.setView(view, null, events);
  say(`dinnertime: ${events.length} sales`);
};

// --- Overlay primitives (ux-plan WP2) ---------------------------------------------------

/** First player with an open restaurant (overlay demos start there). */
function demoPlayer(v: GameView): string | null {
  for (const p of v.turnOrder) if (Object.values(v.board.restaurants).some((r) => r.owner === p && r.status === 'open')) return p;
  return Object.values(v.board.restaurants)[0]?.owner ?? null;
}

$('range').onclick = () => {
  const p = demoPlayer(view);
  if (!p) return say('no restaurant to range from');
  const starts = playerStarts(view.board, p);
  const roads = localRangeField(view.board, starts, 3);
  scene.drawRangeOverlay({ roads, starts, range: 3, color: playerColor(view, p) });
  say(`range 3 from ${p}: ${roads.length} road squares, ${starts.length} starts`);
};

$('reach').onclick = () => {
  const b = view.board;
  const camp = Object.values(b.campaigns).find((c) => c.placement.kind === 'board' || c.placement.kind === 'airplane');
  const kind = camp?.kind ?? 'billboard';
  const placement = camp?.placement ?? { kind: 'board' as const, x: 9, y: 6, w: 2, h: 1 };
  const reach = localCampaignReach(b, kind, placement);
  const good = (camp?.goods[0] ?? 'burger') as FoodId;
  // Make the demo show both kinds of chip: every house in reach, full ones grey.
  const ids = reach.houseIds.length ? reach.houseIds : (Object.keys(b.houses).slice(0, 3) as HouseId[]);
  const full = ids.filter((id) => {
    const h = b.houses[id];
    const cap = h ? houseCapacity(h) : null;
    return !!h && cap !== null && h.demand.length >= cap;
  });
  scene.drawReach(ids, good, full, { color: camp ? playerColor(view, camp.owner) : undefined, cells: reach.cells, band: reach.band });
  say(`reach of ${camp ? `#${camp.number} ${kind}` : 'demo billboard'}: ${ids.length} houses (${full.length} full)`);
};

/** Fake buyer routes: depth-first walks from the player's start roads, distinct by sources collected. */
function demoRoutes(v: GameView, player: string, steps = 9): RouteRibbon[] {
  const b = v.board;
  const isRoad = (c: Cell) => !!b.cells[c.y]?.[c.x]?.road;
  const sourceAt = new Map<string, SourceId>();
  for (const s of Object.values(b.drinkSources)) sourceAt.set(`${s.x},${s.y}`, s.id);
  const near = (c: Cell) =>
    ([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      .map(([dx, dy]) => sourceAt.get(`${c.x + dx},${c.y + dy}`))
      .filter((x): x is SourceId => !!x);
  const out = new Map<string, RouteRibbon>();
  const walk = (from: RouteStart, path: Cell[]) => {
    const last = path[path.length - 1]!;
    if (path.length >= steps) {
      const got = [...new Set(path.flatMap(near))];
      const key = got.sort().join(',') || `none:${out.size}`;
      if (!out.has(key) && (got.length || out.size < 2)) out.set(key, { route: { mode: 'road', from, path: [...path] }, collects: got.map((sourceId) => ({ sourceId, count: 2 })) });
      return;
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const n = { x: last.x + dx, y: last.y + dy };
      if (!isRoad(n) || path.some((c) => c.x === n.x && c.y === n.y)) continue;
      path.push(n);
      walk(from, path);
      path.pop();
      if (out.size >= 6) return;
    }
  };
  for (const from of playerStarts(b, player)) for (const c of startRoads(b, from)) walk(from, [c]);
  return [...out.values()].sort((a, c) => c.collects.length - a.collects.length).slice(0, 5);
}

let routeIdx = 0;
let routes: RouteRibbon[] = [];
$('routes').onclick = () => {
  const p = demoPlayer(view);
  if (!p) return say('no restaurant to route from');
  if (!routes.length || $('routes').dataset.fixture !== sel.value) {
    routes = demoRoutes(view, p);
    routeIdx = 0;
    $('routes').dataset.fixture = sel.value;
  } else routeIdx = (routeIdx + 1) % Math.max(1, routes.length);
  scene.drawRouteRibbons(routes, routeIdx, { color: playerColor(view, p) });
  const r = routes[routeIdx];
  say(r ? `route ${routeIdx + 1} of ${routes.length}: ${r.collects.length} sources (click again to cycle)` : 'no routes');
};

$('clear').onclick = () => {
  scene.clearOverlays('all');
  routes = [];
  say('overlays cleared');
};

$('hc').onclick = () => {
  highContrastTiles.value = !highContrastTiles.value;
  $('hc').classList.toggle('on', highContrastTiles.value);
};

/** Fake table panels: the camera fits the board into the uncovered area. */
let panels = false;
$('panels').onclick = () => {
  panels = !panels;
  $('panels').classList.toggle('on', panels);
  const phone = innerWidth < 700;
  const inset = !panels ? { left: 0, right: 0, top: 0, bottom: 0 } : phone ? { left: 0, right: 0, top: 120, bottom: 104 } : { left: 236, right: 392, top: 64, bottom: 0 };
  for (const [id, on, css] of [
    ['fake-rail', panels && !phone, `left:0;top:${inset.top}px;bottom:0;width:${inset.left}px`],
    ['fake-dock', panels && !phone, `right:0;top:${inset.top}px;bottom:0;width:${inset.right}px`],
    ['fake-sheet', panels && phone, `left:0;right:0;bottom:0;height:${inset.bottom}px`],
  ] as const) {
    const el = $(id);
    el.style.cssText = css;
    el.hidden = !on;
  }
  scene.setInset(inset);
  scene.internals.cam.reset();
};

load(sel.value as FixtureName);
mountVehicleGallery(scene, () => view, $('vehicles'), say);
setInterval(() => {
  const s = scene.stats();
  info.dataset.stats = JSON.stringify(s);
  info.title = `tier ${scene.tier} · ${s.pieces} pieces · ${s.pools} pools / ${s.instances} instances · ${s.calls} calls · ${s.triangles} tris`;
}, 1000);
