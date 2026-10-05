/**
 * View → scene diffing (architecture §5.1). Every board piece becomes a keyed item with a content
 * signature; only items whose signature changed are rebuilt. Static layers (ground, roads, tufts)
 * rebuild on their own signatures. Minis use the instancer, so 40 houses cost a few draw calls.
 */
import * as THREE from 'three';
import type { Board, GameView, House } from '@fcm/engine';
import { cellsRect, hashStr } from './coords.js';
import { buildGround, buildTufts, groundSignature, type GroundLayer } from './board/ground.js';
import { buildRoads, roadSignature, type RoadLayer } from './board/roads.js';
import { APARTMENT_BADGE_Y, BADGE_SIZE, HOUSE_BADGE_Y, RURAL_BADGE_Y, buildApartment, buildGarden, buildHouse, buildRural } from './minis/buildings.js';
import type { HouseBoardInfo } from '../state/boardOverlays.js';
import { releaseTree, type MiniCtx } from './minis/ctx.js';
import { buildDrinkSource } from './minis/drinks.js';
import { buildFreeway, buildGeneric, buildLobbyistRoad, buildPark, buildRoadworks } from './minis/ketchup.js';
import {
  animatePlane,
  animateRadio,
  buildAirplane,
  buildBillboard,
  buildGiantBillboard,
  buildGourmetGuide,
  buildMailbox,
  buildRadio,
  type CampaignVisual,
} from './minis/marketing.js';
import { buildCoffeeShop, buildRestaurant } from './minis/restaurant.js';
import { buildDemandStack, demandKey } from './minis/tokens.js';
import { campaignAnchor, cellsToRect, chainMark, freewayAnchor, houseFacing, playerColor, rectCenter, rectOf, ruralCenter, RURAL_SIZE, type Rect } from './layout.js';
import type { Stage } from './scene.js';
import { ease } from './tween.js';

/** What the picker and animations need to know about a placed piece. */
export interface Placed {
  key: string;
  /** Engine id reported on click (house / restaurant / campaign / entity / source id). */
  id: string | null;
  kind: string;
  obj: THREE.Group;
  rect: Rect;
  height: number;
  sig: string;
}

interface Item {
  key: string;
  id: string | null;
  kind: string;
  sig: string;
  rect: Rect;
  height: number;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  build: (ctx: MiniCtx) => THREE.Group;
}

/** Demand group anchor = the number badge (the plaque sits just above it). */
const STACK_Y: Record<House['kind'], number> = { printed: HOUSE_BADGE_Y, placed: HOUSE_BADGE_Y, apartment: APARTMENT_BADGE_Y, rural: RURAL_BADGE_Y };
const BADGE_H: Record<House['kind'], number> = { printed: BADGE_SIZE.house, placed: BADGE_SIZE.house, apartment: BADGE_SIZE.apartment, rural: BADGE_SIZE.rural };

/** Demand capacity: engine `houseOutlook` when given, else base.md §9 (3, 5 with a garden, ∞). */
export function houseCapacity(h: House, info?: HouseBoardInfo): number | null {
  if (info && info.capacity !== undefined) return info.capacity;
  if (h.kind === 'apartment' || h.kind === 'rural') return null;
  return h.garden ? 5 : 3;
}

export class Reconciler {
  readonly live = new Map<string, Placed>();
  private ground: GroundLayer | null = null;
  private groundSig = '';
  private roads: RoadLayer | null = null;
  private roadSig = '';
  private tufts: THREE.InstancedMesh | null = null;
  private tuftSig = '';
  private ctx: MiniCtx;
  board: Board | null = null;
  showGrid = false;
  private houseInfo: Record<string, HouseBoardInfo> = {};
  private seamTop = 0;
  private highContrast = false;
  private labelYaw = 0;

  constructor(private readonly stage: Stage) {
    this.ctx = { inst: stage.inst };
  }

  /**
   * Bring the scene in line with `view`. With `animate`, new pieces pop in and removed ones
   * shrink away; otherwise changes are instant (snapshots, undo).
   * Returns keys added and removed (and the demand counts before the change, for animations).
   */
  sync(view: GameView | null, animate: boolean): { added: string[]; removed: string[]; boardChanged: boolean; prevDemand: Map<string, number> } {
    const prevDemand = new Map<string, number>();
    for (const [k, p] of this.live) if (p.kind === 'demand') prevDemand.set(k, (p.obj.userData.count as number) ?? 0);
    const b = view?.board ?? null;
    this.board = b;
    const boardChanged = this.syncStatic(b);
    const items = view && b ? collect(view, b, this.houseInfo) : [];
    const want = new Map(items.map((i) => [i.key, i]));
    const added: string[] = [];
    const removed: string[] = [];
    const before = new Set(this.live.keys());

    for (const [k, p] of this.live) {
      const it = want.get(k);
      if (it && it.sig === p.sig) continue;
      this.live.delete(k);
      if (!it) removed.push(k);
      this.drop(p, animate && !it && !boardChanged);
    }
    for (const it of items) {
      if (this.live.has(it.key)) {
        // Same signature: keep, but refresh pick data (ids are stable; rects may not be).
        const p = this.live.get(it.key)!;
        p.rect = it.rect;
        continue;
      }
      const obj = it.build(this.ctx);
      obj.name = it.key;
      obj.position.set(it.x, it.y ?? 0, it.z);
      if (it.rotY) obj.rotation.y = it.rotY;
      obj.userData.key = it.key;
      this.stage.entities.add(obj);
      this.stage.trackSized(obj);
      this.watchAmbient(obj);
      this.live.set(it.key, { key: it.key, id: it.id, kind: it.kind, obj, rect: it.rect, height: it.height, sig: it.sig });
      if (animate && !boardChanged && !before.has(it.key)) added.push(it.key);
    }
    this.stage.invalidate();
    return { added, removed, boardChanged, prevDemand };
  }

  /** Pop-in tween for a freshly added piece. */
  popIn(key: string, delay = 0): Promise<void> {
    const p = this.live.get(key);
    if (!p) return Promise.resolve();
    const o = p.obj;
    const y0 = o.position.y;
    o.scale.setScalar(0.001);
    return this.stage.tweens.add(
      0.38,
      (k) => {
        o.scale.setScalar(Math.max(0.001, k));
        o.position.y = y0 + (1 - Math.min(1, k)) * 0.8;
      },
      { delay, ease: ease.outBack, group: 'anim' },
    );
  }

  /** Engine/house data for plaques (capacity, no-seller). Takes effect on the next `sync`. */
  setHouseInfo(info: Record<string, HouseBoardInfo>): void {
    this.houseInfo = info ?? {};
  }

  /** Tile seam style: `top` 0..1 (tilted → straight down), high contrast, camera yaw for rim labels. */
  setTileStyle(top: number, highContrast: boolean, yaw = this.labelYaw): void {
    if (Math.abs(top - this.seamTop) < 0.01 && highContrast === this.highContrast && Math.abs(yaw - this.labelYaw) < 0.01) return;
    this.seamTop = top;
    this.highContrast = highContrast;
    this.labelYaw = yaw;
    this.ground?.seams.setTop(top);
    this.ground?.seams.setHighContrast(highContrast);
    this.ground?.setLabelYaw(yaw);
    this.stage.invalidate();
  }

  setGrid(on: boolean): void {
    this.showGrid = on;
    if (this.ground) this.ground.grid.visible = on;
    this.stage.invalidate();
  }

  /** Pieces whose engine id matches. */
  byId(id: string): Placed[] {
    const out: Placed[] = [];
    for (const p of this.live.values()) if (p.id === id) out.push(p);
    return out;
  }

  dispose(): void {
    for (const p of this.live.values()) this.drop(p, false);
    this.live.clear();
    this.ground?.dispose();
    this.roads?.dispose();
    this.tufts?.dispose();
  }

  // ---------------------------------------------------------------------------

  private syncStatic(b: Board | null): boolean {
    let changed = false;
    const gs = b ? groundSignature(b) : '';
    if (gs !== this.groundSig) {
      changed = true;
      this.groundSig = gs;
      if (this.ground) {
        this.stage.board.remove(this.ground.group);
        this.ground.dispose();
        this.ground = null;
      }
      if (b) {
        this.ground = buildGround(b);
        this.ground.grid.visible = this.showGrid;
        this.ground.seams.setTop(this.seamTop);
        this.ground.seams.setHighContrast(this.highContrast);
        this.ground.setLabelYaw(this.labelYaw);
        this.stage.board.add(this.ground.group);
        this.stage.fitLight(b.w, b.h, hasOffBoard(b) ? RURAL_SIZE + 2 : 0);
      }
    }
    const rs = b ? roadSignature(b) : '';
    if (rs !== this.roadSig) {
      this.roadSig = rs;
      if (this.roads) {
        this.stage.board.remove(this.roads.group);
        this.roads.dispose();
        this.roads = null;
      }
      if (b) {
        this.roads = buildRoads(b);
        this.stage.board.add(this.roads.group);
      }
    }
    const ts = b ? occupancySignature(b) : '';
    if (ts !== this.tuftSig) {
      this.tuftSig = ts;
      if (this.tufts) {
        this.stage.board.remove(this.tufts);
        this.tufts.dispose();
        this.tufts = null;
      }
      if (b) {
        this.tufts = buildTufts(b);
        if (this.tufts) this.stage.board.add(this.tufts);
      }
    }
    return changed;
  }

  private watchAmbient(obj: THREE.Object3D): void {
    const kind = obj.userData.ambient as string | undefined;
    if (!kind) {
      obj.traverse((c) => {
        if (c !== obj && c.userData.ambient) this.watchAmbient(c);
      });
      return;
    }
    obj.userData.animate = kind === 'plane' ? (t: number) => animatePlane(obj, t) : kind === 'radio' ? (t: number) => animateRadio(obj, t) : undefined;
    if (obj.userData.animate) this.stage.ambient.add(obj);
  }

  private drop(p: Placed, animate: boolean): void {
    const o = p.obj;
    this.stage.untrackSized(o);
    const finish = () => {
      o.traverse((c) => this.stage.ambient.delete(c));
      releaseTree(o);
      o.removeFromParent();
      this.stage.invalidate();
    };
    if (!animate) return finish();
    const s0 = o.scale.x;
    void this.stage.tweens.add(0.28, (k) => o.scale.setScalar(Math.max(0.001, s0 * (1 - k))), { ease: ease.inCubic, group: 'anim' }).then(finish);
  }
}

function hasOffBoard(b: Board): boolean {
  return Object.values(b.houses).some((h) => h.kind === 'rural');
}

function occupancySignature(b: Board): string {
  let s = `${b.w}x${b.h}:`;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) s += b.cells[y]?.[x]?.kind === 'empty' ? '.' : '#';
  return s;
}

// ---------------------------------------------------------------------------
// View → items
// ---------------------------------------------------------------------------

function collect(view: GameView, b: Board, info: Record<string, HouseBoardInfo>): Item[] {
  const items: Item[] = [];

  // Houses, apartments, rural area; demand stacks; gardens.
  for (const h of Object.values(b.houses)) {
    let x: number;
    let z: number;
    let rect: Rect;
    if (h.kind === 'rural') {
      [x, z] = ruralCenter(b);
      rect = { x0: x - RURAL_SIZE / 2, z0: z - RURAL_SIZE / 2, x1: x + RURAL_SIZE / 2, z1: z + RURAL_SIZE / 2 };
      items.push({ key: `house:${h.id}`, id: h.id, kind: 'house', sig: 'rural', rect, height: 2.4, x, z, build: (c) => buildRural(c) });
    } else {
      if (!h.cells.length) continue;
      rect = cellsToRect(h.cells);
      [x, z] = rectCenter(rect);
      const facing = houseFacing(b, h.cells);
      if (h.kind === 'apartment') {
        items.push({ key: `house:${h.id}`, id: h.id, kind: 'house', sig: `apt:${h.label}:${facing}`, rect, height: 2.4, x, z, build: (c) => buildApartment(c, { label: h.label, facing }) });
      } else {
        const variant = Math.floor(hashStr(h.id) * 6);
        const placed = h.kind === 'placed';
        items.push({
          key: `house:${h.id}`,
          id: h.id,
          kind: 'house',
          sig: `house:${h.label}:${facing}:${placed}:${variant}`,
          rect,
          height: 1.4,
          x,
          z,
          build: (c) => buildHouse(c, { label: h.label, facing, placed, variant }),
        });
      }
      if (h.garden?.cells.length) {
        const gr = cellsToRect(h.garden.cells);
        const [gx, gz] = rectCenter(gr);
        const vertical = gr.z1 - gr.z0 > gr.x1 - gr.x0;
        items.push({ key: `garden:${h.id}`, id: h.id, kind: 'garden', sig: `garden:${vertical}`, rect: gr, height: 0.5, x: gx, z: gz, build: (c) => buildGarden(c, { vertical }) });
      }
    }
    if (h.demand.length) {
      const capacity = houseCapacity(h, info[h.id]);
      const noSeller = !!info[h.id]?.noSeller;
      const sig = `${demandKey(h.demand)}|${capacity ?? 'inf'}|${noSeller}`;
      const demand = h.demand;
      const badgeH = BADGE_H[h.kind];
      items.push({ key: `demand:${h.id}`, id: h.id, kind: 'demand', sig, rect, height: 0, x, z, y: STACK_Y[h.kind], build: (c) => buildDemandStack(c, demand, { capacity, noSeller, badgeH }) });
    }
  }

  // Restaurants.
  for (const r of Object.values(b.restaurants)) {
    const color = playerColor(view, r.owner);
    const mark = chainMark(view.players[r.owner]?.chain, r.owner);
    const driveIn = !!r.driveIn;
    const rect = rectOf(r.x, r.y, 2, 2);
    items.push({
      key: `restaurant:${r.id}`,
      id: r.id,
      kind: 'restaurant',
      sig: `${color}:${r.status}:${r.entrance}:${driveIn}:${mark}:${r.x},${r.y}`,
      rect,
      height: 1.6,
      x: r.x + 1,
      z: r.y + 1,
      build: (c) => buildRestaurant(c, { color, status: r.status, entrance: r.entrance, driveIn, mark }),
    });
  }

  // Drink sources.
  for (const s of Object.values(b.drinkSources)) {
    items.push({ key: `source:${s.id}`, id: s.id, kind: 'source', sig: s.drink, rect: rectOf(s.x, s.y, 1, 1), height: 0.9, x: s.x + 0.5, z: s.y + 0.5, build: (c) => buildDrinkSource(c, { drink: s.drink }) });
  }

  // Campaigns.
  let guide = 0;
  const campaigns = Object.values(b.campaigns).sort((a, c) => (a.number ?? 999) - (c.number ?? 999) || a.id.localeCompare(c.id));
  for (const cmp of campaigns) {
    const color = playerColor(view, cmp.owner);
    const v: CampaignVisual = { color, goods: cmp.goods, number: cmp.number ?? 0, remaining: cmp.remaining, eternal: cmp.eternal };
    const a = campaignAnchor(b, cmp.placement, cmp.placement.kind === 'offBoard' ? guide++ : 0);
    const sig = `${cmp.kind}:${color}:${cmp.goods.join('+')}:${cmp.number}:${cmp.remaining}:${cmp.eternal}:${JSON.stringify(cmp.placement)}`;
    const p = cmp.placement;
    let build: (c: MiniCtx) => THREE.Group;
    if (p.kind === 'airplane') build = (c) => buildAirplane(c, { ...v, width: p.width });
    else if (p.kind === 'rural' || cmp.kind === 'giantBillboard') build = (c) => buildGiantBillboard(c, v);
    else if (p.kind === 'offBoard' || cmp.kind === 'gourmetGuide') build = (c) => buildGourmetGuide(c, v);
    else {
      const w = p.w;
      const h = p.h;
      build =
        cmp.kind === 'mailbox'
          ? (c) => buildMailbox(c, { ...v, w, h })
          : cmp.kind === 'radio'
            ? (c) => buildRadio(c, { ...v, w, h })
            : (c) => buildBillboard(c, { ...v, w, h });
    }
    items.push({ key: `campaign:${cmp.id}`, id: cmp.id, kind: 'campaign', sig, rect: a.rect, height: a.height, x: a.x, z: a.z, y: a.y, rotY: a.rotY, build });
  }

  // Module entities.
  for (const e of Object.values(b.entities)) {
    switch (e.kind) {
      case 'coffeeShop': {
        const color = playerColor(view, e.owner);
        items.push({ key: `entity:${e.id}`, id: e.id, kind: 'entity', sig: `cs:${color}`, rect: rectOf(e.x, e.y, 1, 1), height: 1, x: e.x + 0.5, z: e.y + 0.5, build: (c) => buildCoffeeShop(c, { color }) });
        break;
      }
      case 'park': {
        const rect = rectOf(e.x, e.y, e.w, e.h);
        const [x, z] = rectCenter(rect);
        items.push({ key: `entity:${e.id}`, id: e.id, kind: 'entity', sig: `park:${e.w}x${e.h}`, rect, height: 0.8, x, z, build: (c) => buildPark(c, { w: e.w, h: e.h }) });
        break;
      }
      case 'lobbyistRoad': {
        const r = cellsRect(e.cells);
        const rect = rectOf(r.x, r.y, r.w, r.h);
        const [x, z] = rectCenter(rect);
        const color = playerColor(view, e.owner);
        items.push({
          key: `entity:${e.id}`,
          id: e.id,
          kind: 'entity',
          sig: `lr:${color}:${e.underConstruction}:${JSON.stringify(e.cells)}:${JSON.stringify(e.arrows)}`,
          rect,
          height: 0.6,
          x,
          z,
          build: (c) => buildLobbyistRoad(c, { color, cells: e.cells, underConstruction: e.underConstruction, arrows: e.arrows, origin: [x, z] }),
        });
        break;
      }
      case 'roadworks':
        items.push({ key: `entity:${e.id}`, id: e.id, kind: 'entity', sig: 'rw', rect: rectOf(e.x, e.y, 1, 1), height: 0.8, x: e.x + 0.5, z: e.y + 0.5, build: (c) => buildRoadworks(c) });
        break;
      case 'freeway': {
        const color = playerColor(view, e.owner);
        const a = freewayAnchor(b, e.side, e.offset);
        items.push({ key: `entity:${e.id}`, id: e.id, kind: 'entity', sig: `fw:${color}:${e.side}:${e.offset}`, rect: a.rect, height: a.height, x: a.x, z: a.z, build: (c) => buildFreeway(c, { color, side: e.side }) });
        break;
      }
      default: {
        // Unknown module kinds render as a labelled plinth wherever they say they are.
        const u = e as { kind: string; id: string; x?: number; y?: number; w?: number; h?: number; owner?: string };
        if (typeof u.x !== 'number' || typeof u.y !== 'number') break;
        const w = u.w ?? 1;
        const h = u.h ?? 1;
        const rect = rectOf(u.x, u.y, w, h);
        const [x, z] = rectCenter(rect);
        const color = u.owner ? playerColor(view, u.owner) : undefined;
        items.push({ key: `entity:${u.id}`, id: u.id, kind: 'entity', sig: `gen:${u.kind}:${w}x${h}:${color}`, rect, height: 0.8, x, z, build: (c) => buildGeneric(c, { label: u.kind, color, w, h }) });
      }
    }
  }
  return items;
}
