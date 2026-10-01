/**
 * Standalone 3D board viewer: loads engine fixtures (no server, no overlay) and fakes a few
 * interactions and event batches to exercise picking and animations.
 * Open http://localhost:5173/dev/three-playground.html?fixture=dinnertime
 */
import type { Corner, FoodId, GameEvent, GameState, GameView, Placement } from '@fcm/engine';
import { FIXTURES, type FixtureName } from '@fcm/engine/testing';
import { createScene, type Tier } from '../src/three/index.js';
import { topView } from '../src/state/interaction.js';

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

load(sel.value as FixtureName);
setInterval(() => {
  const s = scene.stats();
  info.dataset.stats = JSON.stringify(s);
  info.title = `tier ${scene.tier} · ${s.pieces} pieces · ${s.pools} pools / ${s.instances} instances · ${s.calls} calls · ${s.triangles} tris`;
}, 1000);
