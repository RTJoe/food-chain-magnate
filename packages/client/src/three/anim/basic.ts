/**
 * WP-A defaults: the old `animate.ts` behaviour ported onto the timeline, plus placeholder vehicles
 * on real roads for sales and buyer hauls. WP-C / WP-D modules registered after this one replace
 * these per beat kind.
 *
 * - Placements (restaurant, house, garden, campaign, entity, loose pieces): pop in at their beat.
 * - Opens / drive-ins: pulse.
 * - Sale: ghost demand stack masks the house; a placeholder van drives the road route from the
 *   entrance (lane, rounded corners), goods hop onto the house as the ghost pops, the van drives
 *   home as a tail and coins puff over the restaurant. The route ribbon flashes underneath.
 * - Stayed home: pulse and the "no seller" chip pops.
 * - Campaign: pulse, caption, reach flash ("+1" / "full"), fresh tokens drop, pip tick.
 * - Drinks: placeholder cart / truck / zeppelin / scooter follows the buyer route, stops at sources.
 * Reduced mode: no travel / drops / pops; ribbons and chips held for the beat, pieces appear.
 */
import * as THREE from 'three';
import type { FoodId, GameEvent, HouseId } from '@fcm/engine';
import { campaignReachIds } from '../../state/guidance.js';
import { campaignInfo } from '../../state/feedback.js';
import { releaseTree } from '../minis/ctx.js';
import { PIP_STEP, pipGeo } from '../minis/marketing.js';
import { buildToken, coinGeo } from '../minis/tokens.js';
import { pipCount, routeRibbon } from '../overlays/feedback.js';
import { ease } from '../tween.js';
import { beatEvent, beatEvents, followClip, registerChoreo, type ChoreoCtx } from './choreo.js';
import type { Beat } from './compile.js';
import { tripDuration, tripEase } from './path.js';
import type { ActorKind } from './pool.js';
import type { Timeline } from './timeline.js';

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

const POP = 0.38;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mount a one-off overlay object for the timeline's lifetime and release its instanced parts after. */
function transient(tl: Timeline, ctx: ChoreoCtx, o: THREE.Object3D): void {
  ctx.mount(tl, o);
  tl.own(() => releaseTree(o));
}

/** A reconciler piece pops in at `at` (hidden until then). Reduced: appears at `at`. */
function popKey(tl: Timeline, ctx: ChoreoCtx, key: string, at: number, force = false): number {
  const p = ctx.rec.live.get(key);
  if (!p || (!force && !ctx.added.has(key))) return at;
  const o = p.obj;
  if (ctx.mode === 'reduced') {
    o.visible = false;
    tl.call(at, () => void (o.visible = true));
    return at;
  }
  const y0 = o.position.y;
  const s0 = o.scale.x || 1;
  o.scale.setScalar(0.001);
  tl.add({
    start: at,
    dur: POP,
    ease: ease.outBack,
    update: (k, raw) => {
      if (raw >= 1) {
        o.scale.setScalar(s0);
        o.position.y = y0;
        return;
      }
      o.scale.setScalar(Math.max(0.001, k * s0));
      o.position.y = y0 + (1 - Math.min(1, k)) * 0.8;
    },
  });
  return at + POP;
}

function pulse(tl: Timeline, ctx: ChoreoCtx, key: string, at: number, dur = 0.35): number {
  const p = ctx.rec.live.get(key);
  if (!p || ctx.mode === 'reduced') return at;
  const o = p.obj;
  const s0 = o.scale.x || 1;
  tl.add({ start: at, dur, update: (_k, raw) => o.scale.setScalar(s0 * (1 + Math.sin(raw * Math.PI) * 0.14)) });
  return at + dur;
}

/** Fade a group's materials in, hold, fade out over [at, at + dur] (route ribbons, reach flashes). */
function flash(tl: Timeline, ctx: ChoreoCtx, g: THREE.Object3D, at: number, dur: number, tick?: () => void): void {
  const mats: { m: THREE.Material & { opacity: number }; base: number }[] = [];
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
    if (m && !Array.isArray(m) && !(o as THREE.Sprite).isSprite) mats.push({ m, base: m.opacity });
  });
  g.visible = false;
  ctx.mount(tl, g);
  const still = ctx.mode === 'reduced';
  tl.add({
    start: at,
    dur,
    lane: 'tail',
    update: (_k, raw) => {
      g.visible = raw > 0 && raw < 1;
      const a = still ? 1 : raw < 0.15 ? raw / 0.15 : raw > 0.75 ? (1 - raw) / 0.25 : 1;
      for (const x of mats) {
        x.m.transparent = true;
        x.m.opacity = x.base * a;
      }
      tick?.();
    },
  });
}

function coins(tl: Timeline, ctx: ChoreoCtx, at: THREE.Vector3, start: number, dur = 0.55): void {
  const geo = coinGeo();
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Group();
    c.add(ctx.stage.inst.proxy(geo, { castShadow: false }));
    c.visible = false;
    transient(tl, ctx, c);
    const ang = (i / 5) * Math.PI * 2;
    const dx = Math.cos(ang) * 0.5;
    const dz = Math.sin(ang) * 0.5;
    tl.add({
      start: start + i * 0.03,
      dur,
      ease: ease.outCubic,
      lane: 'tail',
      update: (k, raw) => {
        c.visible = raw > 0 && k < 0.98;
        c.position.set(at.x + dx * k, 1.6 + k * 0.9 - k * k * 0.6, at.z + dz * k);
        c.rotation.x = k * 6;
        c.scale.setScalar(1 - k * 0.6);
      },
    });
  }
}

/** Goods hop in arcs from `from` to `to` (staggered); returns the last landing. */
function hop(tl: Timeline, ctx: ChoreoCtx, goods: readonly string[], from: THREE.Vector3, to: THREE.Vector3, start: number, dur: number, gap = 0.08): number {
  let end = start;
  const arc = 0.6 + from.distanceTo(to) * 0.12;
  goods.forEach((good, i) => {
    const t = buildToken({ inst: ctx.stage.inst }, good as FoodId);
    t.visible = false;
    transient(tl, ctx, t);
    const s = start + i * gap;
    end = Math.max(end, s + dur);
    tl.add({
      start: s,
      dur,
      ease: ease.inOutCubic,
      update: (k, raw) => {
        t.visible = raw > 0 && raw < 1;
        t.position.lerpVectors(from, to, k);
        t.position.y += Math.sin(k * Math.PI) * arc;
        t.rotation.y = k * 4;
      },
    });
  });
  return end;
}

const goodsOf = (lines: readonly { good: string; count: number }[], max: number) => lines.flatMap((l) => Array.from({ length: Math.min(l.count, max) }, () => l.good)).slice(0, max);

// ---------------------------------------------------------------------------
// Placements and pulses
// ---------------------------------------------------------------------------

registerChoreo(['restaurantPlaced', 'houseBuilt', 'gardenAdded', 'campaignPlaced', 'entityPlaced', 'pop'], (beat, at, tl, ctx) => {
  let end = at;
  beat.keys.forEach((k, i) => (end = Math.max(end, popKey(tl, ctx, k, at + i * 0.06))));
  return end;
});

registerChoreo('restaurantMoved', (beat, at, tl, ctx) => {
  let end = at;
  for (const k of beat.keys) end = Math.max(end, popKey(tl, ctx, k, at, true));
  return end;
});

registerChoreo(['restaurantOpened', 'driveIns'], (beat, at, tl, ctx) => {
  let end = at;
  beat.focal.forEach((id, i) => (end = Math.max(end, pulse(tl, ctx, `restaurant:${id}`, at + i * 0.12, Math.min(0.4, beat.dur)))));
  return end;
});

// ---------------------------------------------------------------------------
// Dinnertime
// ---------------------------------------------------------------------------

function saleCaption(beat: Beat, e: Ev<'sale'>) {
  const considered = beatEvent(beat, 'houseConsidered');
  const offers = considered?.offers ?? e.candidates ?? [];
  const others = offers.filter((o) => o.player !== e.player).map((o) => ({ player: o.player, score: o.score, canSupply: o.canSupply }));
  return { kind: 'sale' as const, houseId: e.houseId, player: e.player, unitPrice: e.unitPrice, distance: e.distance, total: e.total, others };
}

registerChoreo('sale', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'sale');
  if (!e) return at;
  ctx.caption(tl, at, saleCaption(beat, e));
  ctx.follow(tl, at, beat.focal);
  const color = ctx.color(e.player);
  const ghost = ctx.ghostDemand(tl, e.houseId);
  const trip = ctx.paths.sale(e);
  const r = ctx.rec.live.get(`restaurant:${e.restaurantId}`);
  const houseAt = ctx.feedback.anchors.house(e.houseId);
  const budget = Math.max(0.45, beat.dur);

  if (trip) flash(tl, ctx, routeRibbon(trip.pts.map((q): [number, number] => [q[0], q[1]]), color, 0.26), at, ctx.mode === 'reduced' ? budget : budget + 0.25);
  if (ctx.mode === 'reduced') {
    const land = at + budget * 0.5;
    ghost?.popAt(land);
    return land;
  }

  const goods = goodsOf(e.lines, 4);
  if (trip) {
    const drop = 0.3;
    const dur = Math.max(0.3, Math.min(tripDuration(trip.follow.length), budget - drop));
    const van = ctx.actor(tl, 'van', color);
    tl.add({ start: at, ...followClip(van, trip.follow, dur, { ease: tripEase(dur) }) });
    const land = at + dur;
    const stop = trip.follow.at(trip.follow.length);
    const from = new THREE.Vector3(stop.x, 0.45, stop.z);
    const to = houseAt && !trip.offBoard ? new THREE.Vector3(houseAt.x, houseAt.y, houseAt.z) : new THREE.Vector3(trip.house[0], 1.2, trip.house[1]);
    const hopped = trip.offBoard ? land : hop(tl, ctx, goods, from, to, land, Math.min(0.3, drop + 0.05));
    ghost?.popAt(Math.max(land, hopped - 0.1));
    // The van drives home as a tail (own lane on the way back), coins when it arrives.
    const back = Math.max(0.3, dur / 1.5);
    tl.add({ start: land + 0.15, ...followClip(van, trip.back, back, { ease: tripEase(back), lane: 'tail', hideAtEnd: true }) });
    if (r) coins(tl, ctx, r.obj.position, land + 0.15 + back * 0.9);
    return land;
  }

  // Not connected by road (old events, missing pieces): goods hop straight from the restaurant.
  if (!r || !houseAt) {
    ghost?.popAt(at + budget * 0.5);
    return at + budget * 0.5;
  }
  const from = new THREE.Vector3(r.obj.position.x, 1.2, r.obj.position.z);
  const to = new THREE.Vector3(houseAt.x, houseAt.y, houseAt.z);
  const land = hop(tl, ctx, goods, from, to, at, Math.min(0.55, budget * 0.8), 0.06);
  ghost?.popAt(land - 0.1);
  coins(tl, ctx, r.obj.position, land - 0.2);
  return land;
});

registerChoreo('stayedHome', (beat, at, tl, ctx) => {
  const houseId = beat.id as HouseId;
  ctx.caption(tl, at, { kind: 'stayedHome', houseId });
  pulse(tl, ctx, `house:${houseId}`, at, Math.min(0.4, beat.dur));
  const reduced = ctx.mode === 'reduced';
  let chip: THREE.Object3D | null = null;
  tl.add({
    start: at,
    dur: reduced ? 0.01 : Math.min(0.35, beat.dur),
    ease: reduced ? ease.linear : ease.outBack,
    update: (k, raw) => {
      if (raw <= 0) return;
      chip ??= ctx.feedback.stayedHomeChip(houseId);
      chip?.scale.setScalar(raw >= 1 ? 1 : Math.max(0.001, k));
    },
  });
  return at + Math.min(0.35, beat.dur);
});

registerChoreo('stayedHomeGroup', (beat, at, tl, ctx) => {
  // Every no-seller house at once; the persistent chips show them.
  const ids = beat.focal;
  ids.forEach((id) => pulse(tl, ctx, `house:${id}`, at, Math.min(0.4, beat.dur)));
  return at + Math.min(0.4, beat.dur);
});

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------

/** Tokens already dropped per house in this batch (several campaigns can hit one house). */
const dropped = new WeakMap<ChoreoCtx, Map<string, number>>();

/** Fresh tokens of one `demandPlaced` drop from above (hidden until then). Returns the landing. */
function dropDemand(tl: Timeline, ctx: ChoreoCtx, e: Ev<'demandPlaced'>, at: number, dur: number): number {
  const key = `demand:${e.houseId}`;
  const p = ctx.rec.live.get(key);
  if (!p) return at;
  let seen = dropped.get(ctx);
  if (!seen) dropped.set(ctx, (seen = new Map()));
  const before = (ctx.prevDemand.get(key) ?? 0) + (seen.get(key) ?? 0);
  seen.set(key, before - (ctx.prevDemand.get(key) ?? 0) + e.tokens.length);
  const fresh = p.obj.children.filter((c) => {
    if (!c.name.startsWith('token:')) return false;
    const i = Number(c.name.slice(6));
    return i >= before && i < before + e.tokens.length;
  });
  if (before === 0) {
    const pl = p.obj.getObjectByName('plinth');
    if (pl) fresh.unshift(pl);
  }
  const reduced = ctx.mode === 'reduced';
  let end = at;
  fresh.forEach((t, i) => {
    const y1 = t.position.y;
    t.visible = false;
    const s = at + i * 0.05;
    end = Math.max(end, s + dur);
    if (reduced) {
      tl.call(s, () => void (t.visible = true));
      return;
    }
    tl.add({
      start: s,
      dur,
      ease: ease.outBack,
      update: (k, raw) => {
        t.visible = raw > 0;
        t.position.y = raw >= 1 ? y1 : y1 + (1 - k) * 1.6;
      },
    });
  });
  return end;
}

/** A duration pip lifts off the campaign's stack and fades, with the count left. */
function pipTick(tl: Timeline, ctx: ChoreoCtx, campaignId: string, remaining: number, at: number, dur: number): void {
  const camp = ctx.view?.board.campaigns[campaignId] ?? ctx.prevView?.board.campaigns[campaignId];
  if (!camp || camp.eternal || ctx.mode === 'reduced') return;
  const color = ctx.color(camp.owner);
  const piece = ctx.rec.live.get(`campaign:${campaignId}`);
  const pips = piece?.obj.getObjectByName('pips');
  const pos = new THREE.Vector3();
  if (pips) {
    piece!.obj.updateMatrixWorld(true);
    pips.getWorldPosition(pos);
  } else if (piece) {
    pos.set((piece.rect.x0 + piece.rect.x1) / 2, 0.1, (piece.rect.z0 + piece.rect.z1) / 2);
  } else return;
  const y0 = pos.y + Math.min(remaining, 6) * PIP_STEP;
  const pip = new THREE.Group();
  pip.add(ctx.stage.inst.proxy(pipGeo(color), { castShadow: false }));
  pip.visible = false;
  transient(tl, ctx, pip);
  const count = pipCount(remaining, color);
  count.visible = false;
  ctx.mount(tl, count);
  tl.add({
    start: at,
    dur,
    ease: ease.outCubic,
    lane: 'tail',
    update: (k, raw) => {
      const on = raw > 0 && raw < 1;
      pip.visible = on && k < 0.85;
      pip.position.set(pos.x + k * 0.25, y0 + k * 0.9, pos.z);
      pip.rotation.z = k * 2.2;
      pip.scale.setScalar(Math.max(0.001, 1 - k * 0.8));
      count.visible = on;
      count.position.set(pos.x, y0 + 0.5 + k * 0.6, pos.z);
      count.scale.setScalar(Math.max(0.001, raw < 0.15 ? raw / 0.15 : raw > 0.8 ? (1 - raw) / 0.2 : 1));
    },
  });
}

registerChoreo('campaign', (beat, at, tl, ctx) => {
  const run = beatEvent(beat, 'campaignRan');
  if (!run) return at;
  const id = run.campaignId;
  const camp = ctx.prevView?.board.campaigns[id] ?? ctx.view?.board.campaigns[id] ?? campaignInfo(ctx.view, id);
  const drops = beatEvents(beat, 'demandPlaced');
  const got = drops.map((d) => d.houseId);
  const reach = run.reached ?? (camp && (ctx.prevView ?? ctx.view) ? campaignReachIds((ctx.prevView ?? ctx.view)!, ctx.me, id) : []);
  const full = run.full ?? reach.filter((h) => !got.includes(h));
  const good = (drops[0]?.tokens[0]?.good ?? camp?.goods[0] ?? 'burger') as FoodId;
  const owner = camp?.owner ?? null;
  ctx.caption(tl, at, { kind: 'campaign', campaignId: id, number: camp?.number ?? null, owner, goods: camp?.goods ?? (drops[0] ? [good] : []), houses: got, full });
  ctx.follow(tl, at, beat.focal);
  pulse(tl, ctx, `campaign:${id}`, at, Math.min(0.4, beat.dur));
  const layer = ctx.feedback.reachFlash(got, good, full, ctx.color(owner));
  if (layer) flash(tl, ctx, layer.group, at, Math.max(beat.dur, 0.6) * (ctx.mode === 'reduced' ? 1 : 1.6), () => layer.tick(performance.now() / 1000));
  let land = at;
  const dropDur = Math.min(0.3, beat.dur * 0.5);
  drops.forEach((d, i) => (land = Math.max(land, dropDemand(tl, ctx, d, at + 0.15 + i * 0.08, dropDur))));
  const tick = beatEvent(beat, 'campaignTicked');
  if (tick) pipTick(tl, ctx, id, tick.remaining, at + beat.dur * 0.4, Math.max(0.5, beat.dur * 1.2));
  return land;
});

registerChoreo('demand', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'demandPlaced');
  return e ? dropDemand(tl, ctx, e, at, Math.min(0.3, beat.dur)) : at;
});

// ---------------------------------------------------------------------------
// Drinks (placeholder vehicles until WP-C)
// ---------------------------------------------------------------------------

registerChoreo('drinks', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'drinksBought');
  if (!e || ctx.mode === 'reduced') return at;
  const trip = ctx.paths.buy(e);
  if (!trip) return at;
  const card = ctx.view?.players[e.player]?.employees?.[e.uid]?.employeeId ?? '';
  const kind: ActorKind = trip.mode === 'air' ? 'zeppelin' : trip.mode === 'errand' ? 'scooter' : card.includes('truck') ? 'truck' : 'cart';
  const v = ctx.actor(tl, kind, ctx.color(e.player));
  const f = trip.follow;
  const hold = 0.25;
  const fade = 0.3;
  const travel = Math.max(0.45, beat.dur - trip.stops.length * hold - fade);
  const ease1 = tripEase(travel);
  let t = at;
  let s = 0;
  const body = v.getObjectByName('body') ?? v;
  for (const stop of trip.stops) {
    const d = travel * ((stop.s - s) / Math.max(1e-3, f.length));
    if (d > 0.01) tl.add({ start: t, ...followClip(v, f, d, { from: s, to: stop.s }) });
    t += Math.max(0, d);
    // Pickup: the vehicle stops and bounces once.
    tl.add({ start: t, dur: hold, update: (_k, raw) => void (body.position.y = Math.sin(raw * Math.PI) * 0.08) });
    t += hold;
    s = stop.s;
  }
  const rest = travel * ((f.length - s) / Math.max(1e-3, f.length));
  if (f.length - s > 1e-3) tl.add({ start: t, ...followClip(v, f, Math.max(0.05, rest), { from: s, ...(trip.stops.length ? {} : { ease: ease1 }) }) });
  t += Math.max(0, rest);
  const land = t;
  tl.add({
    start: t,
    dur: fade,
    lane: 'tail',
    update: (k, raw) => {
      v.scale.setScalar(Math.max(0.001, 1 - k));
      if (raw >= 1) v.visible = false;
    },
  });
  return land;
});

