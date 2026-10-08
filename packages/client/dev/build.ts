/**
 * Playground "Build" panel (animation-plan WP-D): fake event batches for every board-piece and
 * phase choreography of board.ts / phase.ts, so they can be reviewed (and screenshotted) without a
 * game. Pick a scenario, press Build; the batch is applied to the current fixture's view.
 * `?build=<scenario>` runs one on load (frame captures).
 */
import type { Campaign, CampaignKind, Cell, Corner, Direction, FoodId, GameEvent, GameView, ModuleEntity, PlayerId } from '@fcm/engine';
import type { SceneHandle } from '../src/three/index.js';

type Batch = { next: GameView; events: GameEvent[]; prev?: GameView };
type Scenario = (v: GameView) => Batch | string;

const clone = <T>(x: T): T => structuredClone(x);

function firstPlayer(v: GameView): PlayerId {
  return v.turnOrder[0] ?? Object.keys(v.players)[0]!;
}

function isEmpty(v: GameView, x: number, y: number): boolean {
  return v.board.cells[y]?.[x]?.kind === 'empty';
}
function isRoad(v: GameView, x: number, y: number): boolean {
  return !!v.board.cells[y]?.[x]?.road;
}

/** First empty w x h rect, optionally touching a road. */
function emptyRect(v: GameView, w: number, h: number, nearRoad = true, skip = 0): { x: number; y: number } | null {
  let n = 0;
  for (let y = 0; y + h <= v.board.h; y++)
    for (let x = 0; x + w <= v.board.w; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w && ok; dx++) ok = isEmpty(v, x + dx, y + dy);
      if (!ok) continue;
      if (nearRoad) {
        let road = false;
        for (let dy = -1; dy <= h && !road; dy++) for (let dx = -1; dx <= w && !road; dx++) road = isRoad(v, x + dx, y + dy);
        if (!road) continue;
      }
      if (n++ < skip) continue;
      return { x, y };
    }
  return null;
}

function occupy(v: GameView, x: number, y: number, w: number, h: number, kind: string, id: string): Cell[] {
  const cells: Cell[] = [];
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const c = v.board.cells[y + dy]?.[x + dx];
      if (c) {
        c.kind = kind as never;
        c.occupant = id;
      }
      cells.push({ x: x + dx, y: y + dy });
    }
  return cells;
}

function anyRestaurant(v: GameView, status?: string) {
  return Object.values(v.board.restaurants).find((r) => !status || r.status === status);
}

function placeRestaurant(v: GameView, comingSoon: boolean): Batch | string {
  const next = clone(v);
  const at = emptyRect(next, 2, 2);
  if (!at) return 'no free 2x2 by a road';
  const owner = firstPlayer(next);
  const id = `pg-r${Date.now() % 100000}`;
  occupy(next, at.x, at.y, 2, 2, 'restaurant', id);
  next.board.restaurants[id] = { id, owner, x: at.x, y: at.y, entrance: 'SE', status: comingSoon ? 'comingSoon' : 'open', placedRound: next.round };
  return { next, events: [{ type: 'restaurantPlaced', player: owner, restaurantId: id, x: at.x, y: at.y, entrance: 'SE', comingSoon }] };
}

function campaign(v: GameView, kind: CampaignKind, w: number, h: number): Batch | string {
  const next = clone(v);
  const owner = firstPlayer(next);
  const id = `pg-c${kind}${Date.now() % 10000}`;
  let placement: Campaign['placement'];
  if (kind === 'airplane') {
    const used = new Set(Object.values(next.board.campaigns).flatMap((c) => (c.placement.kind === 'airplane' ? [c.placement.side] : [])));
    const side = (['N', 'S', 'E', 'W'] as Direction[]).find((d) => !used.has(d)) ?? 'N';
    placement = { kind: 'airplane', side, offset: 2, width: 3 };
  } else {
    const at = emptyRect(next, w, h, false);
    if (!at) return `no free ${w}x${h}`;
    occupy(next, at.x, at.y, w, h, 'campaign', id);
    placement = { kind: 'board', x: at.x, y: at.y, w, h };
  }
  const c: Campaign = { id, owner, number: 7, kind, goods: ['burger' as FoodId], placement, remaining: 3, eternal: false, marketeer: null, source: 'marketeer', linked: [], placedRound: next.round };
  next.board.campaigns[id] = c;
  return { next, events: [{ type: 'campaignPlaced', player: owner, campaign: clone(c) }] };
}

function entity(v: GameView, make: (next: GameView, id: string) => ModuleEntity | string): Batch | string {
  const next = clone(v);
  const id = `pg-e${Date.now() % 100000}`;
  const ent = make(next, id);
  if (typeof ent === 'string') return ent;
  next.board.entities[id] = ent;
  return { next, events: [{ type: 'entityPlaced', player: 'owner' in ent ? ent.owner : null, entity: clone(ent) }] };
}

/** Straight run of empty squares (lobbyist road). */
function emptyRun(v: GameView, len: number): Cell[] | null {
  for (let y = 0; y < v.board.h; y++)
    for (let x = 0; x + len <= v.board.w; x++) {
      const run = Array.from({ length: len }, (_, i) => ({ x: x + i, y }));
      if (run.every((c) => isEmpty(v, c.x, c.y)) && (isRoad(v, x - 1, y) || isRoad(v, x + len, y))) return run;
    }
  return null;
}

const SCENARIOS: Record<string, Scenario> = {
  'Board build (setup)': (v) => ({ next: clone(v), events: [{ type: 'gameStarted', players: Object.keys(v.players), turnOrder: [...v.turnOrder] }], prev: v }),
  'Restaurant placed': (v) => placeRestaurant(v, false),
  'Restaurant placed (coming soon)': (v) => placeRestaurant(v, true),
  'Restaurant opened': (v) => {
    let base = v;
    let r = anyRestaurant(v, 'comingSoon');
    if (!r) {
      const b = placeRestaurant(v, true);
      if (typeof b === 'string') return b;
      base = b.next;
      r = anyRestaurant(base, 'comingSoon')!;
    }
    const next = clone(base);
    next.board.restaurants[r.id]!.status = 'open';
    return { next, events: [{ type: 'restaurantOpened', restaurantId: r.id }], prev: base };
  },
  'Restaurant moved': (v) => {
    const r = anyRestaurant(v, 'open');
    const next = clone(v);
    const at = emptyRect(next, 2, 2);
    if (!r || !at) return 'needs an open restaurant and a free 2x2';
    const from = { x: r.x, y: r.y, entrance: r.entrance };
    const nr = next.board.restaurants[r.id]!;
    for (const c of occupy(next, r.x, r.y, 2, 2, 'empty', '')) next.board.cells[c.y]![c.x]!.occupant = null;
    occupy(next, at.x, at.y, 2, 2, 'restaurant', r.id);
    const entrance: Corner = r.entrance === 'SE' ? 'NW' : 'SE';
    Object.assign(nr, { x: at.x, y: at.y, entrance });
    return { next, events: [{ type: 'restaurantMoved', player: r.owner, restaurantId: r.id, x: at.x, y: at.y, entrance, from }] };
  },
  'Drive-ins opened': (v) => {
    const rs = Object.values(v.board.restaurants).filter((r) => r.status === 'open' && !r.driveIn).slice(0, 2);
    if (!rs.length) return 'no open restaurant without a drive-in';
    const next = clone(v);
    for (const r of rs) next.board.restaurants[r.id]!.driveIn = true;
    return { next, events: [{ type: 'driveInsOpened', player: rs[0]!.owner, restaurantIds: rs.map((r) => r.id) }] };
  },
  'House built (with garden)': (v) => {
    const next = clone(v);
    const at = emptyRect(next, 2, 3);
    if (!at) return 'no free 2x3';
    const id = `pg-h${Date.now() % 10000}`;
    const cells = occupy(next, at.x, at.y, 2, 2, 'house', id);
    const garden = occupy(next, at.x, at.y + 2, 2, 1, 'garden', id);
    next.board.houses[id] = { id, kind: 'placed', order: 50, label: '50', cells, garden: { cells: garden, source: 'withHouse' }, demand: [] };
    return { next, events: [{ type: 'houseBuilt', player: firstPlayer(v), houseId: id, cells, garden }] };
  },
  'Garden added': (v) => {
    const next = clone(v);
    for (const h of Object.values(next.board.houses)) {
      if (h.garden || h.kind !== 'printed' || !h.cells.length) continue;
      const ys = h.cells.map((c) => c.y);
      const xs = h.cells.map((c) => c.x);
      const y = Math.max(...ys) + 1;
      const x0 = Math.min(...xs);
      if (![x0, x0 + 1].every((x) => isEmpty(next, x, y))) continue;
      const cells = occupy(next, x0, y, 2, 1, 'garden', h.id);
      h.garden = { cells, source: 'gardenTile' };
      return { next, events: [{ type: 'gardenAdded', player: firstPlayer(v), houseId: h.id, cells }] };
    }
    return 'no house with a free strip below';
  },
  'Billboard placed': (v) => campaign(v, 'billboard', 2, 1),
  'Mailbox placed': (v) => campaign(v, 'mailbox', 1, 1),
  'Radio placed': (v) => campaign(v, 'radio', 1, 1),
  'Airplane placed': (v) => campaign(v, 'airplane', 1, 1),
  'Coffee shop placed': (v) =>
    entity(v, (next, id) => {
      const at = emptyRect(next, 1, 1);
      if (!at) return 'no free square';
      occupy(next, at.x, at.y, 1, 1, 'coffeeShop', id);
      return { kind: 'coffeeShop', id, owner: firstPlayer(next), x: at.x, y: at.y };
    }),
  'Park placed': (v) =>
    entity(v, (next, id) => {
      const at = emptyRect(next, 2, 2, false, 1);
      if (!at) return 'no free 2x2';
      occupy(next, at.x, at.y, 2, 2, 'park', id);
      return { kind: 'park', id, x: at.x, y: at.y, w: 2, h: 2, printed: false };
    }),
  'Lobbyist road (works)': (v) =>
    entity(v, (next, id) => {
      const cells = emptyRun(next, 3);
      if (!cells) return 'no free 3-square run by a road';
      for (const c of cells) next.board.cells[c.y]![c.x]!.road = { links: [], bridge: false, underConstruction: true, roadworks: 0, lobbyistRoad: id } as never;
      return { kind: 'lobbyistRoad', id, owner: firstPlayer(next), cells, underConstruction: true, arrows: [{ from: cells[0]!, dir: 'W' }] };
    }),
  'Lobbyist road finished': (v) => {
    const road = Object.values(v.board.entities).find((e) => e.kind === 'lobbyistRoad' && e.underConstruction);
    if (!road || road.kind !== 'lobbyistRoad') return 'place a lobbyist road (works) first';
    const next = clone(v);
    const e = next.board.entities[road.id] as Extract<ModuleEntity, { kind: 'lobbyistRoad' }>;
    e.underConstruction = false;
    for (const c of e.cells) {
      const r = next.board.cells[c.y]?.[c.x]?.road as { underConstruction?: boolean } | null;
      if (r) r.underConstruction = false;
    }
    return { next, events: [{ type: 'entityPlaced', player: e.owner, entity: clone(e) }] };
  },
  'Roadworks placed': (v) =>
    entity(v, (next, id) => {
      for (let y = 0; y < next.board.h; y++) for (let x = 0; x < next.board.w; x++) if (isRoad(next, x, y)) return { kind: 'roadworks', id, x, y, road: 'pg' };
      return 'no road';
    }),
  'Entity removed': (v) => {
    const e = Object.values(v.board.entities).find((x) => x.kind === 'roadworks') ?? Object.values(v.board.entities)[0];
    if (!e) return 'no entity on the board';
    const next = clone(v);
    delete next.board.entities[e.id];
    return { next, events: [{ type: 'entityRemoved', entityId: e.id, kind: e.kind }] };
  },
  'Freeway placed': (v) => entity(v, (next, id) => ({ kind: 'freeway', id, owner: firstPlayer(next), side: 'E', offset: 2, tile: next.board.tiles[0]!.id })),
  'Map tile added': (v) => {
    // Pretend the bottom-right tile was just added: prev = the view without it.
    const t = [...v.board.tiles].sort((a, b) => b.row - a.row || b.col - a.col)[0];
    if (!t) return 'no tiles';
    const prev = clone(v);
    prev.board.tiles = prev.board.tiles.filter((x) => x.id !== t.id);
    const inTile = (c: Cell) => c.x >= t.col * 5 && c.x < t.col * 5 + 5 && c.y >= t.row * 5 && c.y < t.row * 5 + 5;
    for (const h of Object.values(prev.board.houses)) if (h.cells.some(inTile)) delete prev.board.houses[h.id];
    for (const s of Object.values(prev.board.drinkSources)) if (inTile(s)) delete prev.board.drinkSources[s.id];
    for (const r of Object.values(prev.board.restaurants)) if (inTile(r)) delete prev.board.restaurants[r.id];
    return { next: clone(v), events: [{ type: 'mapTileAdded', player: firstPlayer(v), templateId: t.templateId, row: t.row, col: t.col, rotation: t.rotation }], prev };
  },
  'Food produced': (v) => {
    const r = anyRestaurant(v, 'open');
    if (!r) return 'no open restaurant';
    return { next: clone(v), events: [{ type: 'foodProduced', player: r.owner, uid: 'u1', food: 'burger' as FoodId, count: 3 }] };
  },
  'Night shift produced': (v) => {
    const r = anyRestaurant(v, 'open');
    if (!r) return 'no open restaurant';
    return { next: clone(v), events: [{ type: 'foodProduced', player: r.owner, uid: null, food: 'pizza' as FoodId, count: 2 }] };
  },
  'Food spoiled (Cleanup)': (v) => {
    const r = anyRestaurant(v, 'open');
    if (!r) return 'no open restaurant';
    return { next: clone(v), events: [{ type: 'foodDiscarded', player: r.owner, goods: { burger: 2, beer: 1 } }] };
  },
  'Tips + payday': (v) => {
    const r = anyRestaurant(v, 'open');
    if (!r) return 'no open restaurant';
    const p = r.owner;
    return {
      next: clone(v),
      events: [
        { type: 'tipsPaid', player: p, waitresses: 2, amount: 6 },
        { type: 'cashChanged', player: p, delta: 6, reason: 'waitress tips', bank: v.bank.cash - 6 },
        { type: 'salaryPaid', player: p, gross: 15, discounts: 0, paid: 15 },
        { type: 'cashChanged', player: p, delta: -15, reason: 'salaries', bank: v.bank.cash + 9 },
      ],
    };
  },
  'Milestone claimed': (v) => {
    const r = anyRestaurant(v);
    if (!r) return 'no restaurant';
    return { next: clone(v), events: [{ type: 'milestoneClaimed', player: r.owner, milestoneId: 'first_burger_marketed' as never }] };
  },
  'Turn started + phase light': (v) => {
    const r = anyRestaurant(v);
    if (!r) return 'no restaurant';
    return { next: clone(v), events: [{ type: 'phaseChanged', from: 'working', to: { kind: 'dinnertime', houses: [], idx: 0 } }, { type: 'turnStarted', player: r.owner }] };
  },
  'Phase light off': () => 'use after "Turn started + phase light"',
  'Bank break': (v) => ({ next: clone(v), events: [{ type: 'bankBroke', breakNo: 1, added: 200, ceoSlots: 3, basePrice: 10 }] }),
  Bankrupt: (v) => {
    const r = anyRestaurant(v, 'open');
    if (!r) return 'no open restaurant';
    const next = clone(v);
    for (const x of Object.values(next.board.restaurants)) if (x.owner === r.owner) x.status = 'derelict';
    return { next, events: [{ type: 'bankrupt', player: r.owner }] };
  },
  'Game over': (v) => {
    const r = anyRestaurant(v, 'open');
    if (!r) return 'no open restaurant';
    const ranking = [r.owner, ...v.turnOrder.filter((p) => p !== r.owner)];
    return { next: clone(v), events: [{ type: 'gameEnded', ranking, cash: Object.fromEntries(ranking.map((p) => [p, v.players[p]?.cash ?? 0])) }] };
  },
};
SCENARIOS['Phase light off'] = (v) => ({ next: clone(v), events: [{ type: 'phaseChanged', from: 'dinnertime', to: { kind: 'payday', queue: [], idx: 0 } }] });

export function mountBuildPanel(scene: SceneHandle, get: () => GameView, set: (v: GameView) => void, button: HTMLElement, select: HTMLSelectElement, say: (s: string) => void): void {
  for (const k of Object.keys(SCENARIOS)) select.add(new Option(k, k));
  const run = (name: string) => {
    const s = SCENARIOS[name];
    if (!s) return say(`unknown scenario ${name}`);
    const b = s(get());
    if (typeof b === 'string') return say(`${name}: ${b}`);
    if (b.prev) scene.setView(b.prev, null, []);
    set(b.next);
    (window as unknown as { lastBatch: GameEvent[] }).lastBatch = b.events;
    scene.setView(b.next, null, b.events);
    say(`${name}: ${b.events.map((e) => e.type).join(', ')}`);
  };
  button.onclick = () => run(select.value);
  const q = new URLSearchParams(location.search).get('build');
  if (q && SCENARIOS[q]) {
    select.value = q;
    setTimeout(() => run(q), 600);
  }
  (window as unknown as { buildScenario: (n: string) => void }).buildScenario = run;
}
