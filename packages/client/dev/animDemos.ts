/**
 * Playground animation demos (animation-plan WP-C): real engine Dinnertime / Marketing batches,
 * synthetic buyer hauls (cart, truck, zeppelin, errand, milestone) and one campaign of every kind,
 * a speed select (0 = reduced) and "Watch again". Also exposed as `window.animDemo` for Playwright.
 */
import type { EmployeeId, BoardCell, Campaign, CampaignKind, CampaignPlacement, Cell, FoodId, GameEvent, GameState, GameView, HouseId, RouteStart, SourceId } from '@fcm/engine';
import { engine } from '@fcm/engine';
import { FIXTURES, type FixtureName } from '@fcm/engine/testing';
import { makeCtx } from '../../engine/src/core/context.js';
import { runUntilInput } from '../../engine/src/core/phase.js';
import { animationSpeed } from '../src/state/interaction.js';
import { localCampaignReach, playerStarts, type SceneHandle } from '../src/three/index.js';
import { startRoads } from '../src/three/overlays/fallback.js';
import { houseCapacity } from '../src/three/reconcile.js';

interface Deps {
  scene: SceneHandle;
  view(): GameView;
  setView(v: GameView, events: GameEvent[]): void;
  fixture(): FixtureName;
  toView(s: GameState): GameView;
  say(s: string): void;
}

const clone = <T>(x: T): T => structuredClone(x);
const DELTAS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

export function mountAnimDemos(d: Deps, bar: HTMLElement): void {
  let last: GameEvent[] = [];
  const history: GameEvent[][] = [];
  let engineState: GameState | null = null;

  const play = (next: GameView, events: GameEvent[], label: string) => {
    last = events;
    history.push(events);
    d.setView(next, events);
    d.say(`${label}: ${events.length} events`);
  };

  /** Fixture state at Dinnertime (the dinnertime / ketchup fixtures are; others fall back to dinnertime). */
  const dinnerState = (busy: boolean): GameState => {
    const name = d.fixture();
    const s = name === 'ketchup' || name === 'dinnertime' ? FIXTURES[name]() : FIXTURES.dinnertime();
    s.bank.cash = 2000;
    if (busy) {
      // Demand on every house and plenty of stock: a long dinner with several chains.
      const goods: FoodId[] = ['burger', 'pizza', 'soft_drink', 'beer', 'lemonade'];
      Object.values(s.board.houses).forEach((h, i) => {
        if (h.demand.length) return;
        const n = 1 + (i % 3);
        for (let k = 0; k < n; k++) h.demand.push({ good: goods[(i + k) % goods.length]!, by: null, campaign: null });
      });
      for (const p of Object.values(s.players)) for (const g of goods) p.inventory[g] = (p.inventory[g] ?? 0) + 20;
    }
    return s;
  };

  const dinner = (busy = false) => {
    const s = dinnerState(busy);
    // Show the pre-dinner board first (no events), then resolve.
    d.setView(d.toView(s), []);
    const next = clone(s);
    const ctx = makeCtx(next);
    runUntilInput(ctx);
    engineState = next;
    play(d.toView(next), ctx.events, busy ? 'busy dinnertime' : 'dinnertime');
  };

  const marketing = () => {
    if (!engineState || engineState.phase.kind !== 'payday') {
      const s = dinnerState(false);
      const next = clone(s);
      runUntilInput(makeCtx(next));
      engineState = next;
      d.setView(d.toView(next), []);
    }
    let state = engineState;
    const all: GameEvent[] = [];
    for (const p of state.turnOrder) {
      const r = engine.applyAction(state, { type: 'payday.confirm', playerId: p });
      if (!r.ok) continue;
      state = r.state;
      all.push(...r.events);
    }
    engineState = state;
    play(d.toView(state), all, 'marketing');
  };

  // --- Buyer hauls ---------------------------------------------------------------------------

  const firstOwner = (v: GameView) => {
    for (const p of v.turnOrder) if (Object.values(v.board.restaurants).some((r) => r.owner === p && r.status === 'open')) return p;
    return null;
  };

  /** Road route from the player's starts collecting the most sources in `steps` squares. */
  const roadRoute = (v: GameView, player: string, steps: number): { from: RouteStart; path: Cell[]; sources: SourceId[] } | null => {
    const b = v.board;
    const isRoad = (c: Cell) => !!b.cells[c.y]?.[c.x]?.road && !b.cells[c.y]?.[c.x]?.road?.underConstruction;
    const at = new Map<string, SourceId>();
    for (const s of Object.values(b.drinkSources)) at.set(`${s.x},${s.y}`, s.id);
    const near = (c: Cell) => DELTAS.map(([dx, dy]) => at.get(`${c.x + dx},${c.y + dy}`)).filter((x): x is SourceId => !!x);
    let best: { from: RouteStart; path: Cell[]; sources: SourceId[] } | null = null;
    let budget = 20000;
    const walk = (from: RouteStart, path: Cell[]) => {
      if (--budget < 0) return;
      const got = [...new Set(path.flatMap(near))];
      if (!best || got.length > best.sources.length || (got.length === best.sources.length && path.length > best.path.length)) best = { from, path: [...path], sources: got };
      if (path.length >= steps) return;
      const lastC = path[path.length - 1]!;
      for (const [dx, dy] of DELTAS) {
        const n = { x: lastC.x + dx, y: lastC.y + dy };
        if (!isRoad(n) || path.some((c) => c.x === n.x && c.y === n.y)) continue;
        path.push(n);
        walk(from, path);
        path.pop();
      }
    };
    for (const from of playerStarts(b, player)) for (const c of startRoads(b, from)) walk(from, [c]);
    return best;
  };

  const withCard = (v: GameView, player: string, uid: string, employeeId: string): GameView => {
    const next = clone(v);
    const p = next.players[player];
    if (p) p.employees = { ...p.employees, [uid]: { uid, employeeId: employeeId as EmployeeId, acquiredRound: next.round } };
    return next;
  };

  const drinks = (kind: 'cart' | 'truck' | 'zeppelin' | 'errand' | 'milestone') => {
    const v = d.view();
    const player = firstOwner(v);
    if (!player) return d.say('no open restaurant');
    const b = v.board;
    const uid = `demo-${kind}`;
    const card = kind === 'truck' ? 'truck_driver' : kind === 'zeppelin' ? 'zeppelin_pilot' : kind === 'errand' ? 'errand_boy' : 'cart_operator';
    const next = withCard(v, player, uid, card);
    let e: GameEvent;
    if (kind === 'cart' || kind === 'truck') {
      const r = roadRoute(v, player, kind === 'truck' ? 14 : 10);
      if (!r) return d.say('no road route');
      const per = kind === 'truck' ? 3 : 2;
      e = { type: 'drinksBought', player, uid, path: r.path, collected: r.sources.map((id) => ({ sourceId: id, drink: b.drinkSources[id]!.drink, count: per })), route: { mode: 'road', from: r.from, path: r.path } };
    } else if (kind === 'zeppelin') {
      const from = playerStarts(b, player)[0];
      const rest = Object.values(b.restaurants).find((r) => r.owner === player && r.status === 'open')!;
      if (!from) return d.say('no start');
      const ts = b.tileSize;
      let row = Math.floor(rest.y / ts);
      let col = Math.floor(rest.x / ts);
      const seen = new Set([`${row},${col}`]);
      const tiles = [{ row, col }];
      const srcIn = (r: number, c: number) => Object.values(b.drinkSources).filter((s) => Math.floor(s.y / ts) === r && Math.floor(s.x / ts) === c);
      for (let i = 0; i < 4; i++) {
        const opts = DELTAS.map(([dc, dr]) => ({ row: row + dr, col: col + dc })).filter((t) => t.row >= 0 && t.col >= 0 && t.row < b.rows && t.col < b.cols && !seen.has(`${t.row},${t.col}`));
        if (!opts.length) break;
        opts.sort((a, c) => srcIn(c.row, c.col).length - srcIn(a.row, a.col).length);
        const t = opts[0]!;
        seen.add(`${t.row},${t.col}`);
        tiles.push(t);
        row = t.row;
        col = t.col;
      }
      const sources = tiles.flatMap((t) => srcIn(t.row, t.col));
      e = { type: 'drinksBought', player, uid, path: [], collected: sources.map((s) => ({ sourceId: s.id, drink: s.drink, count: 2 })), route: { mode: 'air', from, tiles } };
    } else if (kind === 'errand') {
      e = { type: 'drinksBought', player, uid, path: [], collected: [{ sourceId: null, drink: 'soft_drink', count: 1 }], route: { mode: 'errand', drink: 'soft_drink' } };
    } else {
      e = { type: 'drinksBought', player, uid, path: [], collected: [{ sourceId: null, drink: 'beer', count: 2 }], reason: 'first_cart_operator' };
    }
    play(next, [e], `drinks (${kind})`);
  };

  // --- Campaigns -----------------------------------------------------------------------------

  const SIZE: Partial<Record<CampaignKind, [number, number]>> = { billboard: [2, 1], mailbox: [1, 1], radio: [1, 1], giantBillboard: [3, 1] };

  const emptyCell = (c: BoardCell | undefined) => !!c && c.kind === 'empty' && !c.road;

  const bestPlacement = (v: GameView, kind: CampaignKind): CampaignPlacement | null => {
    const b = v.board;
    if (kind === 'gourmetGuide') return { kind: 'offBoard' };
    if (kind === 'airplane') {
      let best: CampaignPlacement | null = null;
      let n = -1;
      for (const side of ['N', 'W'] as const)
        for (let off = 0; off + 3 <= (side === 'N' ? b.w : b.h); off++) {
          const p: CampaignPlacement = { kind: 'airplane', side, offset: off, width: 3 };
          const k = localCampaignReach(b, 'airplane', p).houseIds.length;
          if (k > n) [best, n] = [p, k];
        }
      return best;
    }
    const [w, h] = SIZE[kind] ?? [1, 1];
    let best: CampaignPlacement | null = null;
    let n = -1;
    for (let y = 0; y + h <= b.h; y++)
      for (let x = 0; x + w <= b.w; x++) {
        let ok = true;
        for (let j = 0; j < h && ok; j++) for (let i = 0; i < w && ok; i++) ok = emptyCell(b.cells[y + j]?.[x + i]);
        if (!ok) continue;
        const p: CampaignPlacement = { kind: 'board', x, y, w, h };
        const k = Math.min(4, localCampaignReach(b, kind === 'giantBillboard' ? 'billboard' : kind, p).houseIds.length);
        if (k > n) [best, n] = [p, k];
      }
    return best;
  };

  const campaign = (kind: CampaignKind) => {
    const v = d.view();
    const owner = firstOwner(v) ?? v.turnOrder[0]!;
    const b = v.board;
    // Ketchup fixture: run the existing rural giant billboard / gourmet guide.
    const existing = Object.values(b.campaigns).find((c) => c.kind === kind);
    const placement = existing?.placement ?? bestPlacement(v, kind);
    if (!placement) return d.say(`no spot for a ${kind}`);
    const id = existing?.id ?? `demo-${kind}`;
    const good: FoodId = (existing?.goods[0] as FoodId | undefined) ?? (kind === 'radio' ? 'pizza' : kind === 'mailbox' ? 'beer' : 'burger');
    const camp: Campaign = existing
      ? clone(existing)
      : { id, owner, number: 40 + Object.keys(b.campaigns).length, kind, goods: kind === 'airplane' ? [good, 'soft_drink'] : [good], placement, remaining: 3, eternal: false, marketeer: null, source: 'marketeer', linked: [], placedRound: v.round };
    const placed = clone(v);
    placed.board.campaigns[id] = camp;
    if (placement.kind === 'board')
      for (let j = 0; j < placement.h; j++)
        for (let i = 0; i < placement.w; i++) {
          const c = placed.board.cells[placement.y + j]?.[placement.x + i];
          if (c) c.kind = 'campaign' as BoardCell['kind'];
        }
    d.setView(placed, []);
    // Reach: engine-like local reach; the gourmet guide / rural pick a few houses.
    let reach: HouseId[] =
      placement.kind === 'offBoard' || placement.kind === 'rural'
        ? (Object.keys(b.houses) as HouseId[]).filter((h) => placement.kind !== 'rural' || b.houses[h]?.kind === 'rural').slice(0, 4)
        : [...localCampaignReach(b, kind === 'giantBillboard' ? 'billboard' : kind, placement).houseIds];
    reach = reach.slice(0, 6);
    const next = clone(placed);
    // The last house in reach is full (shows the grey chip).
    const fullId = reach.length > 1 ? reach[reach.length - 1]! : null;
    if (fullId) {
      const h = next.board.houses[fullId]!;
      const cap = houseCapacity(h) ?? 3;
      while (h.demand.length < cap) h.demand.push({ good: 'lemonade', by: null, campaign: null });
      placed.board.houses[fullId] = clone(h);
      d.setView(placed, []);
    }
    const events: GameEvent[] = [{ type: 'campaignRan', campaignId: id, pass: 1, reached: reach, full: fullId ? [fullId] : [] }];
    for (const h of reach) {
      if (h === fullId) continue;
      const tokens = [{ good, by: owner, campaign: id }];
      next.board.houses[h]!.demand.push(...tokens);
      events.push({ type: 'demandPlaced', campaignId: id, houseId: h, tokens });
    }
    events.push({ type: 'marketingIncome', player: owner, campaignId: id, amount: 5 });
    next.board.campaigns[id] = { ...camp, remaining: camp.eternal ? camp.remaining : camp.remaining - 1 };
    events.push({ type: 'campaignTicked', campaignId: id, remaining: next.board.campaigns[id]!.remaining });
    setTimeout(() => play(next, events, `campaign (${kind})`), 60);
  };

  /** Replay the last batch, or `back` batches earlier (e.g. the dinner after marketing ran). */
  const again = (fromId: string | null = null, back = 0) => {
    const events = history[history.length - 1 - back] ?? last;
    if (!events.length) return d.say('nothing to replay');
    d.scene.internals.anim.replay(events, fromId, d.view(), null);
    d.say(`watch again${fromId ? ` from ${fromId}` : ''}`);
  };

  const speed = (n: number) => {
    animationSpeed.value = n;
  };

  // --- Bar -----------------------------------------------------------------------------------

  const row = document.createElement('div');
  row.id = 'anim-bar';
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;width:100%';
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    row.append(b);
    return b;
  };
  const select = (opts: string[], label: string) => {
    const s = document.createElement('select');
    s.setAttribute('aria-label', label);
    for (const o of opts) s.add(new Option(o, o));
    row.append(s);
    return s;
  };
  btn('Dinner (engine)', () => dinner(false));
  btn('Busy dinner', () => dinner(true));
  btn('Marketing (engine)', marketing);
  const dk = select(['cart', 'truck', 'zeppelin', 'errand', 'milestone'], 'Haul');
  btn('Drinks', () => drinks(dk.value as Parameters<typeof drinks>[0]));
  const ck = select(['billboard', 'mailbox', 'airplane', 'radio', 'giantBillboard', 'gourmetGuide'], 'Campaign kind');
  btn('Campaign', () => campaign(ck.value as CampaignKind));
  btn('Watch again', () => again());
  const sp = select(['1', '2', '4', '0.5', '0'], 'Speed');
  sp.onchange = () => speed(Number(sp.value));
  bar.append(row);

  (window as unknown as { animDemo: unknown }).animDemo = { dinner, marketing, drinks, campaign, again, speed, events: () => last };
}
