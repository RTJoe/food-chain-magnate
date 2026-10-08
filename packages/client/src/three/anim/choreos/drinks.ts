/**
 * Buyer hauls (animation-plan §2.5 `drinksBought`, WP-C).
 *
 * - Errand boy: the scooter leaves the restaurant entrance, rides to the nearest road square and
 *   back with a crate on the rack; the crate hops into the restaurant with a "+N" chip.
 * - Cart operator / truck driver: the vehicle follows the played road route in its lane. At every
 *   collected source it stops briefly, a crate of that drink hops from the source onto the bed and
 *   a "+N" chip pops; after the last pickup it drives to the end of its range and bows out.
 * - Zeppelin pilot: rises from the start, glides tile to tile on the air path, hovers over each
 *   collected source while a crate floats up into the gondola, then drifts off and fades.
 * - Milestone hauls (no route): a crate drops onto the player's restaurant roof with a chip.
 *
 * Reduced mode: static route ribbon and the "+N" chips at the sources, held for the beat.
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { ACTOR_SCALE, CARGO_SLOTS, type VehicleKind } from '../../minis/vehicles.js';
import { routeRibbon } from '../../overlays/feedback.js';
import { ease } from '../../tween.js';
import { beatEvent, followClip, registerChoreo, type BuyTrip, type ChoreoCtx } from '../choreo.js';
import { PACING } from '../compile.js';
import { tripEase, type P2 } from '../path.js';
import type { ActorKind } from '../pool.js';
import type { ClipSpec, Timeline } from '../timeline.js';
import { arcClip, chip, clamp, idTop, puff, type Ev } from './carriers.js';

/** Pause at a source while the crate hops on. */
const HOLD = 0.3;
/** Bow-out after the route ends. */
const FADE = 0.3;

function vehicleKind(ctx: ChoreoCtx, e: Ev<'drinksBought'>, trip: BuyTrip): VehicleKind & ActorKind {
  if (trip.mode === 'air') return 'zeppelin';
  if (trip.mode === 'errand') return 'scooter';
  const card = ctx.view?.players[e.player]?.employees?.[e.uid]?.employeeId ?? ctx.prevView?.players[e.player]?.employees?.[e.uid]?.employeeId ?? '';
  return card.includes('truck') ? 'truck' : 'cart';
}

/** Static or fading ribbon of the route (reduced mode; faint under a moving vehicle otherwise). */
function routeFlash(tl: Timeline, ctx: ChoreoCtx, pts: readonly P2[], color: string, at: number, dur: number, peak: number, y = 0): void {
  if (pts.length < 2) return;
  const g = routeRibbon(pts.map((q): [number, number] => [q[0], q[1]]), color, 0.2);
  g.position.y += y;
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
      const a = still ? 1 : raw < 0.1 ? raw / 0.1 : raw > 0.8 ? (1 - raw) / 0.2 : 1;
      for (const x of mats) {
        x.m.transparent = true;
        x.m.opacity = x.base * a * peak;
      }
    },
  });
}

/** Crate hops from `from` into slot `i` of the vehicle's cargo and rides there. */
function crateOnto(tl: Timeline, ctx: ChoreoCtx, v: THREE.Object3D, kind: VehicleKind, drink: string, i: number, from: THREE.Vector3, start: number, dur: number, height = 0.45): void {
  const cargo = v.getObjectByName('cargo') ?? v;
  const slots = CARGO_SLOTS[kind];
  const base = slots[Math.min(i, slots.length - 1)]!;
  const slot = new THREE.Vector3(base[0], base[1] + Math.max(0, i - slots.length + 1) * 0.105, base[2]);
  const crate = ctx.actor(tl, 'crate', null, drink);
  const to = new THREE.Vector3();
  const clip = arcClip(crate, from, to, dur, { height, keep: true, spin: 1, scale: ACTOR_SCALE[kind] });
  const up = clip.update!;
  tl.add({
    start,
    ...clip,
    onStart: () => {
      cargo.updateWorldMatrix(true, false);
      to.copy(slot).applyMatrix4(cargo.matrixWorld);
      crate.visible = true;
    },
    update: (k, raw) => {
      // Track the slot (the vehicle may still settle) and land in it.
      cargo.updateWorldMatrix(true, false);
      to.copy(slot).applyMatrix4(cargo.matrixWorld);
      up(k, raw);
      if (raw >= 1) {
        cargo.add(crate);
        crate.position.copy(slot);
        crate.rotation.set(0, 0, 0);
        crate.scale.setScalar(1);
        crate.visible = true;
      }
    },
  });
}

/** Shrink the vehicle away (route done). */
function bowOut(v: THREE.Object3D, dur = FADE): ClipSpec {
  return {
    dur,
    lane: 'tail',
    update: (k, raw) => {
      v.scale.setScalar(Math.max(0.001, 1 - ease.inCubic(k)));
      if (raw >= 1) v.visible = false;
    },
  };
}

function pickupChip(tl: Timeline, ctx: ChoreoCtx, sourceId: string, drink: string, count: number, color: string, at: number): void {
  const top = idTop(ctx, sourceId, 0.25);
  if (top) chip(tl, ctx, `+${count}`, color, top, at, 1.0, { rise: 0.35, size: 0.38, good: drink as FoodId });
}

// ---------------------------------------------------------------------------

registerChoreo('drinks', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'drinksBought');
  if (!e) return at;
  const color = ctx.color(e.player);
  const budget = Math.max(PACING.minReadable, beat.dur);
  const reduced = ctx.mode === 'reduced';
  const trip = ctx.paths.buy(e);
  ctx.follow(tl, at, beat.focal);
  if (!trip) return milestoneHaul(tl, ctx, e, at, budget);

  if (reduced) {
    // Air hauls: the zeppelin's line over the visited tiles, held above the house roofs.
    routeFlash(tl, ctx, trip.pts, color, at, budget, 0.9, trip.mode === 'air' ? 1.6 : 0);
    for (const s of trip.stops) pickupChip(tl, ctx, s.sourceId, s.drink, s.count, color, at);
    if (trip.mode === 'errand') errandChip(tl, ctx, e, color, at);
    return at + budget;
  }

  const kind = vehicleKind(ctx, e, trip);
  const v = ctx.actor(tl, kind, color, ctx.tier === 'low' ? 'lite' : null);
  if (trip.mode === 'errand') return errand(tl, ctx, e, v, trip, color, at, budget);
  if (trip.mode === 'air') return zeppelin(tl, ctx, v, trip, color, at, budget);
  return roadHaul(tl, ctx, v, kind, trip, color, at, budget);
});

/** Cart / truck: drive, stop at each source for a crate, drive on, bow out. */
function roadHaul(tl: Timeline, ctx: ChoreoCtx, v: THREE.Object3D, kind: VehicleKind, trip: BuyTrip, color: string, at: number, budget: number): number {
  const f = trip.follow;
  const n = trip.stops.length;
  const hold = n ? clamp((budget * 0.45) / n, 0.18, HOLD) : 0;
  const travel = Math.max(PACING.minReadable, budget - n * hold);
  routeFlash(tl, ctx, trip.pts, color, at, budget + FADE, 0.45);
  // Leave the start (restaurant entrance / coffee shop) with a little pop.
  tl.add({ start: at, dur: 0.16, ease: ease.outBack, update: (k) => v.scale.setScalar(Math.max(0.001, 0.4 + 0.6 * k)) });
  let t = at;
  let s = 0;
  const leg = (to: number) => {
    const d = travel * ((to - s) / Math.max(1e-3, f.length));
    if (to - s > 1e-3 && d > 0.01) tl.add({ start: t, ...followClip(v, f, d, { from: s, to, ease: tripEase(d) }) });
    t += Math.max(0, d);
    s = to;
  };
  const body = v.getObjectByName('body') ?? v;
  trip.stops.forEach((stop, i) => {
    leg(stop.s);
    // Pickup: crate hops from the source onto the bed, the vehicle dips under the weight.
    const from = idTop(ctx, stop.sourceId, -0.2) ?? new THREE.Vector3(stop.at[0], 0.5, stop.at[1]);
    crateOnto(tl, ctx, v, kind, stop.drink, i, from, t + 0.02, hold * 0.85);
    tl.add({ start: t + hold * 0.7, dur: hold * 0.4, update: (_k, raw) => void (body.position.y = -Math.sin(raw * Math.PI) * 0.03) });
    pickupChip(tl, ctx, stop.sourceId, stop.drink, stop.count, color, t + hold * 0.6);
    t += hold;
  });
  leg(f.length);
  if (!n) t = Math.max(t, at + travel);
  const land = t;
  tl.add({ start: land, ...bowOut(v) });
  return land;
}

/** Errand boy: out to the road and back, crate on the rack, crate into the restaurant. */
function errand(tl: Timeline, ctx: ChoreoCtx, e: Ev<'drinksBought'>, v: THREE.Object3D, trip: BuyTrip, color: string, at: number, budget: number): number {
  const f = trip.follow;
  const half = f.nearest(trip.pts[1]![0], trip.pts[1]![1]);
  const pause = 0.2;
  const ride = Math.max(0.3, (budget - pause - 0.3) / 2);
  tl.add({ start: at, ...followClip(v, f, ride, { to: half, ease: tripEase(ride) }) });
  tl.add({ start: at, dur: 0.14, ease: ease.outBack, update: (k) => v.scale.setScalar(Math.max(0.001, 0.4 + 0.6 * k)) });
  const turn = at + ride;
  // The crate pops onto the rack at the turnaround.
  const c = e.collected[0];
  const drink = (c?.drink ?? (e.route?.mode === 'errand' ? e.route.drink : 'soft_drink')) as string;
  const cargo = v.getObjectByName('cargo') ?? v;
  const crate = ctx.actor(tl, 'crate', null, drink);
  tl.add({
    start: turn,
    dur: pause,
    ease: ease.outBack,
    update: (k, raw) => {
      if (crate.parent !== cargo) cargo.add(crate);
      crate.position.set(0, 0, 0);
      crate.rotation.set(0, 0, 0);
      crate.visible = raw > 0;
      crate.scale.setScalar(Math.max(0.001, k));
    },
  });
  tl.add({ start: turn + pause, ...followClip(v, f, ride, { from: half, ease: tripEase(ride) }) });
  const back = turn + pause + ride;
  // Into the restaurant: crate hops to the roof, the scooter tucks in.
  const roof = idTop(ctx, restaurantOf(ctx, e) ?? '', 0.05);
  if (roof) {
    const fly = ctx.actor(tl, 'crate', null, drink);
    const from = new THREE.Vector3();
    const clip = arcClip(fly, from, roof, 0.3, { height: 0.4, shrink: true, scale: ACTOR_SCALE.scooter });
    const os = clip.onStart;
    tl.add({
      start: back - 0.1,
      ...clip,
      onStart: () => {
        crate.updateWorldMatrix(true, false);
        crate.getWorldPosition(from);
        crate.visible = false;
        os?.();
      },
    });
  }
  tl.add({ start: back - 0.12, ...bowOut(v, 0.2) });
  errandChip(tl, ctx, e, color, back);
  return back;
}

function restaurantOf(ctx: ChoreoCtx, e: Ev<'drinksBought'>): string | null {
  const b = ctx.view?.board;
  if (!b) return null;
  const r = Object.values(b.restaurants)
    .filter((x) => x.owner === e.player && x.status === 'open')
    .sort((a, c) => (a.id < c.id ? -1 : 1))[0];
  return r?.id ?? null;
}

function errandChip(tl: Timeline, ctx: ChoreoCtx, e: Ev<'drinksBought'>, color: string, at: number): void {
  const top = idTop(ctx, restaurantOf(ctx, e) ?? '', 0.4);
  const n = e.collected.reduce((s, c) => s + c.count, 0);
  const drink = e.collected[0]?.drink ?? null;
  if (top && n) chip(tl, ctx, `+${n}`, color, top, at, 1.0, { rise: 0.35, size: 0.4, good: drink });
}

/** Zeppelin: rise, glide the air path, hover over each source as a crate floats up, drift off. */
function zeppelin(tl: Timeline, ctx: ChoreoCtx, v: THREE.Object3D, trip: BuyTrip, color: string, at: number, budget: number): number {
  const f = trip.follow;
  const n = trip.stops.length;
  const hold = n ? clamp((budget * 0.4) / n, 0.2, HOLD + 0.05) : 0;
  const rise = 0.3;
  const travel = Math.max(PACING.minReadable, budget - n * hold - rise * 0.5);
  const y0 = 0.35;
  // Rise from the start square while gliding off.
  let t = at;
  let s = 0;
  const leg = (to: number, first: boolean) => {
    const d = travel * ((to - s) / Math.max(1e-3, f.length));
    if (to - s > 1e-3 && d > 0.01) {
      const clip = followClip(v, f, d, { from: s, to, ease: tripEase(d) });
      const up = clip.update!;
      const t0 = t;
      tl.add({
        start: t,
        ...clip,
        update: (k, raw) => {
          up(k, raw);
          if (first) {
            const u = clamp(((t0 + raw * d) - at) / rise, 0, 1);
            v.position.y = y0 + (f.y - y0) * ease.outCubic(u);
          }
        },
      });
    }
    t += Math.max(0, d);
    s = to;
  };
  trip.stops.forEach((stop, i) => {
    leg(stop.s, i === 0);
    const from = idTop(ctx, stop.sourceId, -0.3) ?? new THREE.Vector3(stop.at[0], 0.4, stop.at[1]);
    crateOnto(tl, ctx, v, 'zeppelin', stop.drink, i, from, t, hold, 0.2);
    pickupChip(tl, ctx, stop.sourceId, stop.drink, stop.count, color, t + hold * 0.5);
    t += hold;
  });
  leg(f.length, !n);
  const land = t;
  // Drift on past the last tile and fade.
  const end = f.at(f.length);
  const prev = f.at(Math.max(0, f.length - 0.3));
  const dx = end.x - prev.x;
  const dz = end.z - prev.z;
  const d = Math.hypot(dx, dz) || 1;
  tl.add({
    start: land,
    dur: 0.6,
    lane: 'tail',
    update: (k, raw) => {
      v.position.set(end.x + (dx / d) * 1.6 * k, f.y + k * 0.3, end.z + (dz / d) * 1.6 * k);
      v.scale.setScalar(Math.max(0.001, 1 - ease.inCubic(k)));
      if (raw >= 1) v.visible = false;
    },
  });
  return land;
}

/** Milestone haul: a crate drops onto the player's restaurant roof with a chip. */
function milestoneHaul(tl: Timeline, ctx: ChoreoCtx, e: Ev<'drinksBought'>, at: number, budget: number): number {
  const roof = idTop(ctx, restaurantOf(ctx, e) ?? '', 0.02);
  if (!roof) return at;
  const color = ctx.color(e.player);
  const drink = e.collected[0]?.drink ?? 'soft_drink';
  const n = e.collected.reduce((s, c) => s + c.count, 0);
  const dur = Math.min(0.5, budget);
  if (ctx.mode !== 'reduced') {
    const crate = ctx.actor(tl, 'crate', null, drink);
    tl.add({
      start: at,
      dur,
      ease: ease.outBack,
      onStart: () => void (crate.visible = true),
      update: (k, raw) => {
        crate.position.set(roof.x, roof.y + (1 - k) * 1.5, roof.z);
        crate.scale.setScalar(1.4);
        if (raw >= 1) crate.visible = false;
      },
    });
    puff(tl, ctx, 'dust', roof, at + dur * 0.7, 0.45, 0.8);
  }
  chip(tl, ctx, `+${n}`, color, roof.clone().setY(roof.y + 0.4), at + dur * 0.6, 1.1, { rise: 0.3, size: 0.4, good: drink });
  return at + dur;
}

