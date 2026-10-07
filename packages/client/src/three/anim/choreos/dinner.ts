/**
 * Dinnertime choreographies (animation-plan §2.7, WP-C).
 *
 * Sale (one house beat): the house's pre-sale demand shows as a ghost stack. The winning chain's
 * delivery van leaves its restaurant's entrance corner with the goods on its roof, follows the
 * engine route in its lane (rounded corners), stops on the road square next to the house and hops
 * the goods onto it one by one while the matching ghost tokens pop; a "+$total" chip floats up
 * (bonus chips beside it). The van drives home as a tail (or bows out at the house when the road is
 * busy: at most 4 vans on the road, fewer on low tiers) and coins land at the restaurant, pulsing
 * the cash counter. Competing chains get their score chips over their restaurants while the van is
 * out. Coffee sold en route (Ketchup) hops from the coffee shop to the house before the van
 * arrives. Rural houses: the van takes the freeway off the board to the rural area.
 *
 * Stayed home: the house nods, the "no seller" chip pops with a "?" bob; chains that were
 * connected but could not supply get a shaking "no stock" chip.
 *
 * Reduced mode: static route ribbon, chips and captions held for the beat; no travel.
 */
import * as THREE from 'three';
import type { DemandToken, FoodId, HouseId } from '@fcm/engine';
import { houseBoardInfo } from '../../../state/boardOverlays.js';
import { COLORS } from '../../../theme.js';
import { BADGE_SIZE } from '../../minis/buildings.js';
import { releaseTree } from '../../minis/ctx.js';
import { buildDemandStack } from '../../minis/tokens.js';
import { CARGO_SLOTS } from '../../minis/vehicles.js';
import { makeChip, disposeOverlay } from '../../overlays/badges.js';
import { collapseOffers } from '../../../state/offers.js';
import { offerText, routeRibbon } from '../../overlays/feedback.js';
import { houseCapacity } from '../../reconcile.js';
import { ease } from '../../tween.js';
import { beatEvent, beatEvents, followClip, registerChoreo, type ChoreoCtx, type GhostStack } from '../choreo.js';
import { deliveryTrip, PACING, type Beat } from '../compile.js';
import { tripEase, withHeight, type Follow, type P2 } from '../path.js';
import type { Timeline } from '../timeline.js';
import { arcClip, cashAt, chip, clamp, coins, ghostTokens, goodsOf, houseAnchor, idTop, isReplay, popClip, pulse, worldOf, type Ev } from './carriers.js';

const GREY = '#8f8b88';
/** Goods riding on the van roof; more show as a "×N" tag. */
const MAX_CARGO = 4;
const HOP = 0.24;
const HOP_GAP = 0.08;

export function saleCaption(beat: Beat, e: Ev<'sale'>) {
  const considered = beatEvent(beat, 'houseConsidered');
  const offers = collapseOffers(considered?.offers ?? e.candidates ?? []);
  const others = offers.filter((o) => o.player !== e.player).map((o) => ({ player: o.player, score: o.score, canSupply: o.canSupply }));
  // The sale event has no score; the winner's offer carries it (modifiers included).
  const score = offers.find((o) => o.player === e.player)?.score ?? e.unitPrice + e.distance;
  return { kind: 'sale' as const, houseId: e.houseId, player: e.player, unitPrice: e.unitPrice, distance: e.distance, score, total: e.total, others };
}

const vehicleVariant = (ctx: ChoreoCtx) => (ctx.tier === 'low' ? 'lite' : null);

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** Route ribbon faded in under the trip and out after it (reduced: static for the beat). */
function ribbon(tl: Timeline, ctx: ChoreoCtx, pts: readonly P2[], color: string, at: number, dur: number, peak: number): void {
  const g = routeRibbon(pts.map((q): [number, number] => [q[0], q[1]]), color, 0.2);
  const mats: { m: THREE.Material & { opacity: number }; base: number }[] = [];
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
    if (m && !Array.isArray(m)) mats.push({ m, base: m.opacity });
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
      const a = still ? 1 : raw < 0.12 ? raw / 0.12 : raw > 0.8 ? (1 - raw) / 0.2 : 1;
      for (const x of mats) {
        x.m.transparent = true;
        x.m.opacity = x.base * a * peak;
      }
    },
  });
}

/** Score chips over every competing restaurant while the house resolves (winner ticked, out-of-stock grey). */
function offerChips(tl: Timeline, ctx: ChoreoCtx, beat: Beat, winner: string | null, at: number, life: number): void {
  const considered = beatEvent(beat, 'houseConsidered');
  const sale = beatEvent(beat, 'sale');
  const offers = collapseOffers(considered?.offers ?? sale?.candidates ?? []);
  if (offers.length < 2 && !(offers.length === 1 && !winner)) return;
  const seen = new Set<string>();
  for (const o of offers) {
    if (seen.has(o.restaurantId)) continue;
    seen.add(o.restaurantId);
    const top = idTop(ctx, o.restaurantId, 0.35);
    if (!top) continue;
    const won = o.player === winner;
    const text = winner ? offerText({ ...o, won }) : 'no stock';
    chip(tl, ctx, text, o.canSupply ? ctx.color(o.player) : GREY, top, at, life, { size: won ? 0.44 : 0.36, shake: !o.canSupply });
  }
}

/** A ghost of the stack a replayed house had, built from the goods it bought (the view has moved on). */
function replayGhost(tl: Timeline, ctx: ChoreoCtx, e: Ev<'sale'>): GhostStack | null {
  const h = ctx.view?.board.houses[e.houseId];
  const a = houseAnchor(ctx, e.houseId);
  if (!h || !a) return null;
  // The real stack (whatever demand the house has now) waits until the replay is over.
  const real = ctx.rec.live.get(`demand:${e.houseId}`)?.obj;
  if (real) {
    real.visible = false;
    tl.own(() => void (real.visible = true));
  }
  const demand: DemandToken[] = goodsOf(e.lines, 99).map((good) => ({ good: good as FoodId, by: null, campaign: null }));
  const obj = buildDemandStack({ inst: ctx.stage.inst }, demand, { capacity: houseCapacity(h, houseBoardInfo.peek()[e.houseId]), badgeH: BADGE_SIZE[h.kind === 'apartment' ? 'apartment' : h.kind === 'rural' ? 'rural' : 'house'] });
  const wrap = new THREE.Group();
  wrap.position.copy(a);
  wrap.add(obj);
  ctx.mount(tl, wrap);
  tl.own(() => releaseTree(wrap));
  return {
    obj: wrap,
    popAt(at: number) {
      if (ctx.mode === 'reduced') return void tl.call(at, () => void (wrap.visible = false));
      tl.add({ start: at, ...popClip(wrap, 0.22) });
    },
  };
}

/** Van leg to a rural house: on from the freeway run to the rural area. */
function ruralLeg(ctx: ChoreoCtx, pts: readonly P2[], house: THREE.Vector3, ground?: (x: number, z: number) => number): { follow: Follow; back: Follow; pts: P2[] } {
  const last = pts[pts.length - 1]!;
  const dx = house.x - last[0];
  const dz = house.z - last[1];
  const d = Math.hypot(dx, dz) || 1;
  const stop: P2 = [house.x - (dx / d) * 1.1, house.z - (dz / d) * 1.1];
  const all = [...pts, stop];
  const follow = ctx.paths.road(all);
  const back = ctx.paths.road([...all].reverse());
  return ground ? { follow: withHeight(follow, ground), back: withHeight(back, ground), pts: all } : { follow, back, pts: all };
}

/** "×N" tag riding on the van when it carries more goods than fit on the roof. */
function cargoTag(tl: Timeline, ctx: ChoreoCtx, cargo: THREE.Object3D, n: number, color: string): void {
  const w = new THREE.Group();
  let s: THREE.Sprite;
  try {
    s = makeChip(`×${n}`, null, color, 0.3);
  } catch {
    return;
  }
  s.center.set(0.5, 0);
  w.add(s);
  w.position.set(0, 0.28, 0);
  cargo.add(w);
  ctx.stage.trackSized(w);
  tl.own(() => {
    ctx.stage.untrackSized(w);
    disposeOverlay(w);
    w.removeFromParent();
  });
}

// ---------------------------------------------------------------------------
// Sale
// ---------------------------------------------------------------------------

registerChoreo('sale', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'sale');
  if (!e) return at;
  ctx.caption(tl, at, saleCaption(beat, e));
  ctx.follow(tl, at, beat.focal);
  const color = ctx.color(e.player);
  const reduced = ctx.mode === 'reduced';
  const budget = Math.max(PACING.minReadable, beat.dur);
  const replay = isReplay(ctx);
  const ghost = replay ? replayGhost(tl, ctx, e) : ctx.ghostDemand(tl, e.houseId);
  const house = houseAnchor(ctx, e.houseId);
  const rest = idTop(ctx, e.restaurantId, 0.15);
  const goods = goodsOf(e.lines, 99);
  const coffee = beatEvents(beat, 'coffeeSold');
  let trip = ctx.paths.sale(e);
  let tripPts: readonly P2[] | null = trip?.pts ?? null;
  if (trip?.offBoard && house) {
    const leg = ruralLeg(ctx, trip.pts, house, trip.ground);
    trip = { ...trip, follow: leg.follow, back: leg.back };
    tripPts = leg.pts;
  }
  const gap = ctx.plan.gap || budget;
  const relaxed = gap >= 0.6;

  // --- Reduced: route, chips and caption held in place ---------------------------------------
  if (reduced) {
    const mid = at + budget * 0.5;
    if (tripPts) ribbon(tl, ctx, tripPts, color, at, budget, 0.9);
    offerChips(tl, ctx, beat, e.player, at, budget);
    ghost?.popAt(mid);
    if (house) chip(tl, ctx, `+$${e.total}`, color, house.clone().setY(house.y + 0.35), mid, Math.max(0.6, budget * 0.5), { size: 0.44 });
    for (const c of coffee) {
      const src = idTop(ctx, c.at, 0.3);
      if (src) chip(tl, ctx, `+$${c.amount}`, ctx.color(c.player), src, at, budget, { size: 0.34 });
      cashAt(tl, mid, c.player, c.amount);
    }
    cashAt(tl, mid, e.player, e.total);
    return mid;
  }

  if (relaxed) offerChips(tl, ctx, beat, e.player, at, budget - 0.05);
  const shown = goods.slice(0, MAX_CARGO);
  const span = shown.length ? HOP + HOP_GAP * (shown.length - 1) : 0;

  // --- Not connected by road (old events, missing pieces): goods arc straight over ------------
  if (!trip) {
    const land = at + clamp(budget * 0.7, PACING.minReadable, 0.6);
    if (rest && house) {
      shown.forEach((g, i) => {
        const t = ctx.actor(tl, 'carryToken', null, g);
        tl.add({ start: at + i * 0.06, ...arcClip(t, rest, house, land - at, { shrink: true }) });
      });
    }
    ghost?.popAt(land - 0.05);
    if (house) chip(tl, ctx, `+$${e.total}`, color, house.clone().setY(house.y + 0.35), land, 1.0, { rise: 0.4, size: 0.44 });
    if (rest) coins(tl, ctx, rest, land);
    cashAt(tl, land + 0.3, e.player, e.total);
    return land;
  }

  // --- The delivery van ------------------------------------------------------------------------
  const target = house ?? new THREE.Vector3(trip.house[0], 1.4, trip.house[1]);
  const tripDur = clamp(deliveryTrip(trip.follow.length), 0.35, Math.max(0.35, budget - span - 0.04));
  const land = at + tripDur;
  if (relaxed && tripPts) ribbon(tl, ctx, tripPts, color, at, tripDur + span + 0.3, 0.5);
  const van = ctx.actor(tl, 'van', color, vehicleVariant(ctx));
  tl.add({ start: at, ...followClip(van, trip.follow, tripDur, { ease: tripEase(tripDur) }) });
  // Pop the van out of the entrance (it starts inside the restaurant's corner square).
  tl.add({ start: at, dur: 0.16, ease: ease.outBack, update: (k) => van.scale.setScalar(Math.max(0.001, 0.4 + 0.6 * k)) });

  // Goods ride on the roof rack.
  const cargo = van.getObjectByName('cargo') ?? van;
  const slots = CARGO_SLOTS.van;
  const riding = shown.map((g, i) => {
    const t = ctx.actor(tl, 'carryToken', null, g);
    cargo.add(t);
    const [x, y, z] = slots[i % slots.length]!;
    t.position.set(x, y, z);
    t.rotation.y = i * 0.8;
    t.visible = true;
    tl.own(() => void (t.visible = false));
    return t;
  });
  if (goods.length > MAX_CARGO) cargoTag(tl, ctx, cargo, goods.length, color);

  // Coffee sold en route: a cup hops from the coffee shop (or restaurant) before the van arrives.
  coffee.forEach((c, i) => {
    const src = idTop(ctx, c.at, 0.25);
    const fly = Math.max(PACING.minReadable, Math.min(0.55, tripDur * 0.8));
    const start = Math.max(at, land - fly - 0.05) + i * 0.06;
    if (src) {
      const cup = ctx.actor(tl, 'carryToken', null, 'coffee');
      tl.add({ start, ...arcClip(cup, src, target.clone().setY(target.y + 0.1), fly, { shrink: true, scale: 1.9, height: 0.9 }) });
      chip(tl, ctx, `+$${c.amount}`, ctx.color(c.player), src.clone().setY(src.y + 0.2), start, 0.9, { rise: 0.35, size: 0.34 });
    }
    cashAt(tl, start + fly, c.player, c.amount);
  });

  // Arrival: goods hop off one by one onto the house while the matching ghost tokens pop.
  const gtok = ghost ? ghostTokens(ghost.obj) : [];
  let lastLand = land;
  riding.forEach((t, i) => {
    const fly = ctx.actor(tl, 'carryToken', null, shown[i]!);
    const from = new THREE.Vector3();
    const to = target.clone();
    const g = gtok[i];
    const clip = arcClip(fly, from, to, HOP, { height: 0.35, shrink: true, spin: 2 });
    const start = land + i * HOP_GAP;
    const os = clip.onStart;
    clip.onStart = () => {
      worldOf(t, from);
      t.visible = false;
      if (g) worldOf(g, to);
      os?.();
    };
    tl.add({ start, ...clip });
    if (g) tl.add({ start: start + HOP * 0.85, ...popClip(g) });
    lastLand = start + HOP;
  });
  ghost?.popAt(Math.max(land, lastLand - 0.04));
  // Van nods as it unloads.
  const body = van.getObjectByName('body');
  if (body) tl.add({ start: land, dur: Math.max(0.2, span), update: (_k, raw) => void (body.position.y = Math.sin(raw * Math.PI) * 0.035) });

  // Money: "+$total" over the house, bonus chips beside it.
  // Beside the plaque (right), so the ghost tokens popping stay visible.
  const chipAt = target.clone().setY(target.y + 0.2);
  chip(tl, ctx, `+$${e.total}`, color, chipAt, land + 0.05, 1.1, { rise: 0.45, size: 0.46, center: [-0.3, 0] });
  // Bonus chips stack above the total (screen-space offset: chips are screen-sized).
  e.bonuses.forEach((b, i) => chip(tl, ctx, `+$${b.amount}`, color, chipAt, land + 0.2 + i * 0.12, 0.95, { rise: 0.45, size: 0.3, center: [-0.45, -1.25 - i * 1.15] }));

  // The van goes home as a tail, unless the road is full (at most N vans out at once).
  const vans = Math.max(1, Math.min(PACING.maxVans, ctx.caps.vehicles));
  const leave = lastLand + 0.06;
  const room = at + vans * gap - leave;
  const want = Math.max(0.35, tripDur / 1.5);
  let home = leave;
  if (room >= 0.35) {
    const back = Math.min(want, room);
    tl.add({ start: leave, ...followClip(van, trip.back, back, { ease: tripEase(back), lane: 'tail', hideAtEnd: true }) });
    tl.add({ start: leave + back - 0.14, dur: 0.14, lane: 'tail', update: (k) => van.scale.setScalar(Math.max(0.001, 1 - k)) });
    home = leave + back;
  } else {
    // Busy road: the van bows out where it is.
    tl.add({
      start: leave,
      dur: 0.22,
      lane: 'tail',
      update: (k, raw) => {
        van.scale.setScalar(Math.max(0.001, 1 - k));
        if (raw >= 1) van.visible = false;
      },
    });
  }
  if (rest) coins(tl, ctx, rest, home - 0.05);
  cashAt(tl, home + 0.35, e.player, e.total);
  return Math.min(lastLand, at + budget);
});

// ---------------------------------------------------------------------------
// Stayed home
// ---------------------------------------------------------------------------

function stayedHome(tl: Timeline, ctx: ChoreoCtx, beat: Beat, houseId: HouseId, at: number, caption: boolean): number {
  const budget = Math.max(PACING.minReadable, beat.dur);
  if (caption) {
    ctx.caption(tl, at, { kind: 'stayedHome', houseId });
    ctx.follow(tl, at, [houseId]);
  }
  const reduced = ctx.mode === 'reduced';
  pulse(tl, ctx, ctx.rec.live.get(`house:${houseId}`)?.obj, at, Math.min(0.4, budget), 0.08);
  const a = houseAnchor(ctx, houseId);
  // The persistent "no seller" chip pops (or a transient one in replays, once it is gone).
  const persist = ctx.feedback.stayedHomeChip(houseId);
  if (persist && !isReplay(ctx)) {
    persist.scale.setScalar(reduced ? 1 : 0.001);
    if (!reduced) {
      persist.visible = false;
      tl.add({
        start: at + 0.08,
        dur: 0.32,
        ease: ease.outBack,
        update: (k, raw) => {
          persist.visible = true;
          persist.scale.setScalar(raw >= 1 ? 1 : Math.max(0.001, k));
        },
      });
      tl.own(() => {
        persist.visible = true;
        persist.scale.setScalar(1);
      });
    }
  } else if (a) {
    chip(tl, ctx, 'no seller', GREY, a, at + 0.08, Math.max(0.9, budget + 0.4), { size: 0.34, center: [1.2, 0.5] });
  }
  if (a) chip(tl, ctx, '?', COLORS.ink, a.clone().setY(a.y + 0.3), at, Math.max(0.7, budget + 0.2), { size: 0.36, rise: 0.25 });
  // Connected chains that could not supply the order: "no stock", shaking once.
  offerChips(tl, ctx, beat, null, at, budget + 0.3);
  return at + Math.min(0.4, budget);
}

registerChoreo('stayedHome', (beat, at, tl, ctx) => stayedHome(tl, ctx, beat, beat.id as HouseId, at, true));

registerChoreo('stayedHomeGroup', (beat, at, tl, ctx) => {
  // Beyond 30 houses every no-seller house nods at once; the persistent chips name them.
  beat.focal.forEach((id, i) => pulse(tl, ctx, ctx.rec.live.get(`house:${id}`)?.obj, at + Math.min(0.4, i * 0.02), 0.35, 0.08));
  return at + Math.min(0.8, beat.dur);
});
