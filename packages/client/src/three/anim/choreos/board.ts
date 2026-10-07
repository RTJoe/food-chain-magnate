/**
 * WP-D board-piece choreographies (animation-plan §2.2, §2.6, §2.11): restaurants placed, moved,
 * opened, drive-ins, houses and gardens built, campaigns placed, Ketchup entities placed / removed
 * (coffee shops, parks, lobbyist roads and roadworks, freeways), the extra map tile, and the
 * bankrupt chain's restaurants going derelict.
 *
 * The scene already shows the final state: each choreography hides what its beat reveals until the
 * beat starts and restores exact transforms at raw = 1. Pieces that changed signature or left the
 * board are taken from the reconciler's graveyard (`rec.claimGrave`) so they can animate out
 * (scaffold falling away, a sign tipping over, works packing up) instead of vanishing.
 * Reduced mode: no drops, slides or pops; pieces appear / disappear at their beat time.
 */
import * as THREE from 'three';
import type { Corner, FoodId, ModuleEntity, PlayerId } from '@fcm/engine';
import { campaignReachIds } from '../../../state/guidance.js';
import { COLORS } from '../../../theme.js';
import { cornerAngle, dirAngle } from '../../coords.js';
import { hasRural, ruralCenter, ruralSide } from '../../layout.js';
import type { Placed } from '../../reconcile.js';
import { ease } from '../../tween.js';
import { beatEvent, registerChoreo, type ChoreoCtx } from '../choreo.js';
import type { Beat } from '../compile.js';
import { chip, confetti, dropIn, dustLine, growY, isReduced, popIn, puff, revealAt, ringPulse, shrinkOut, worldOf } from './fx.js';
import type { Timeline } from '../timeline.js';

/** Time scale of a beat: its budget over its nominal length (compressed batches play faster). */
const fit = (beat: Beat) => Math.min(1, Math.max(0.5, beat.dur / Math.max(0.01, beat.nominal)));

const CORNER: Record<Corner, [number, number]> = { NW: [-1, -1], NE: [1, -1], SE: [1, 1], SW: [-1, 1] };
/** Clockwise as seen from above (x right, z towards the viewer). */
const CLOCKWISE: Corner[] = ['NW', 'NE', 'SE', 'SW'];

const live = (ctx: ChoreoCtx, key: string): Placed | undefined => ctx.rec.live.get(key);

/**
 * The first freeway sets the rural area's side (layout.ruralSide): the rural tile, its demand and
 * its giant billboards stay at the old spot until `at`, sink into the ground there and rise at
 * the new one. Returns the end (`at` when nothing moves).
 */
function moveRural(tl: Timeline, ctx: ChoreoCtx, at: number): number {
  const prev = ctx.prevView?.board;
  const b = ctx.view?.board;
  if (!prev || !b || !hasRural(prev) || !hasRural(b) || ruralSide(prev) === ruralSide(b)) return at;
  const [ox, oz] = ruralCenter(prev);
  const [nx, nz] = ruralCenter(b);
  const dx = ox - nx;
  const dz = oz - nz;
  const rural = Object.values(b.houses).filter((h) => h.kind === 'rural');
  const solids = [...rural.map((h) => `house:${h.id}`), ...Object.values(b.campaigns).filter((c) => c.placement.kind === 'rural').map((c) => `campaign:${c.id}`)];
  const marks = rural.flatMap((h) => [`demand:${h.id}`, `price:${h.id}`]);
  const half = 0.4;
  const swap = at + half;
  const end = at + half * 2.2;
  const pieces = [...solids.map((k) => [k, true] as const), ...marks.map((k) => [k, false] as const)];
  for (const [k, solid] of pieces) {
    const o = live(ctx, k)?.obj;
    if (!o) continue;
    const to = o.position.clone();
    const s = o.scale.clone();
    // Hold at the old spot until the beat.
    o.position.set(to.x + dx, to.y, to.z + dz);
    if (isReduced(ctx) || !solid) {
      tl.call(swap, () => void o.position.copy(to));
      continue;
    }
    tl.add({
      start: at,
      dur: end - at,
      update: (_k, raw) => {
        if (raw >= 1) {
          o.position.copy(to);
          o.scale.copy(s);
          return;
        }
        const t = raw * (end - at);
        // Sink at the old spot, then rise (with a little overshoot) at the new one.
        const q = t < half ? 1 - ease.inCubic(t / half) : ease.outBack(Math.min(1, (t - half) / (end - swap)));
        if (t < half) o.position.set(to.x + dx, to.y, to.z + dz);
        else o.position.copy(to);
        o.scale.set(s.x * (0.85 + 0.15 * q), s.y * Math.max(0.001, q), s.z * (0.85 + 0.15 * q));
      },
    });
  }
  puff(tl, ctx, 'dust', ox, 0.05, oz, at + half * 0.7, { scale: 2.4 });
  puff(tl, ctx, 'dust', nx, 0.05, nz, end - 0.15, { scale: 2.4 });
  return end;
}

/** Claim a grave and bury it when the timeline ends. */
function grave(tl: Timeline, ctx: ChoreoCtx, key: string): Placed | null {
  const g = ctx.rec.claimGrave(key);
  if (g) tl.own(() => ctx.rec.bury(g));
  return g;
}

/** Puffs of dust at the four corners of a rect (landing thud). */
function cornerDust(tl: Timeline, ctx: ChoreoCtx, p: Placed, at: number, scale = 1): void {
  const { x0, z0, x1, z1 } = p.rect;
  const inset = 0.15;
  for (const [x, z] of [
    [x0 + inset, z0 + inset],
    [x1 - inset, z0 + inset],
    [x1 - inset, z1 - inset],
    [x0 + inset, z1 - inset],
  ] as const)
    puff(tl, ctx, 'dust', x, 0.04, z, at, { scale });
}

/** Fade a group in, hold, and out over [at, at + dur] (reach flashes). Reduced: held still. */
function flash(tl: Timeline, ctx: ChoreoCtx, g: THREE.Object3D, at: number, dur: number, tick?: () => void): void {
  const mats: { m: THREE.Material & { opacity: number }; base: number }[] = [];
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
    if (m && !Array.isArray(m) && !(o as THREE.Sprite).isSprite) mats.push({ m, base: m.opacity });
  });
  g.visible = false;
  ctx.mount(tl, g);
  const still = isReduced(ctx);
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

/** Flat arrow on the ground pointing out of a restaurant's entrance corner, flashed once. */
function entranceArrow(tl: Timeline, ctx: ChoreoCtx, p: Placed, entrance: Corner, color: string, at: number): void {
  if (isReduced(ctx)) return;
  const [dx, dz] = CORNER[entrance];
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.32);
  sh.lineTo(0.26, 0);
  sh.lineTo(0.1, 0);
  sh.lineTo(0.1, -0.26);
  sh.lineTo(-0.1, -0.26);
  sh.lineTo(-0.1, 0);
  sh.lineTo(-0.26, 0);
  sh.closePath();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), mat);
  m.renderOrder = 6;
  const cx = (p.rect.x0 + p.rect.x1) / 2;
  const cz = (p.rect.z0 + p.rect.z1) / 2;
  m.position.set(cx + dx * 1.3, 0.1, cz + dz * 1.3);
  m.rotation.y = Math.atan2(-dx, -dz);
  m.visible = false;
  ctx.mount(tl, m);
  tl.add({
    start: at,
    dur: 0.45,
    lane: 'tail',
    update: (_k, raw) => {
      m.visible = raw > 0 && raw < 1;
      const push = Math.sin(raw * Math.PI * 2) * 0.12;
      m.position.set(cx + dx * (1.3 + push), 0.1, cz + dz * (1.3 + push));
      mat.opacity = raw < 0.7 ? 1 : (1 - raw) / 0.3;
    },
  });
}

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

registerChoreo('restaurantPlaced', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'restaurantPlaced');
  const p = e && live(ctx, `restaurant:${e.restaurantId}`);
  if (!e || !p) return at;
  const f = fit(beat);
  ctx.follow(tl, at, beat.focal);
  const drop = 0.45 * f;
  const land = dropIn(tl, ctx, p.obj, at, { dur: drop, height: 1.2, squash: true });
  cornerDust(tl, ctx, p, land - 0.06);
  entranceArrow(tl, ctx, p, e.entrance, ctx.color(e.player), land - 0.05);
  if (e.comingSoon) {
    // The scaffold lands first; the translucent sign pops a beat later.
    const sign = p.obj.getObjectByName('sign');
    if (sign) popIn(tl, ctx, sign, land, 0.25 * f, 0.15);
  }
  return Math.min(at + beat.dur, land + 0.15 * f);
});

registerChoreo('restaurantMoved', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'restaurantMoved');
  const key = e ? `restaurant:${e.restaurantId}` : '';
  const p = e && live(ctx, key);
  const old = grave(tl, ctx, key);
  // The new piece does the move; the old one goes at once.
  if (old) old.obj.visible = false;
  if (!e || !p) return at;
  const prev = ctx.prevView?.board.restaurants[e.restaurantId];
  const from = e.from ?? (prev ? { x: prev.x, y: prev.y, entrance: prev.entrance } : null);
  if (!from) return popIn(tl, ctx, p.obj, at);
  ctx.follow(tl, at, beat.focal);
  const o = p.obj;
  const body = o.getObjectByName('body') ?? o;
  const to = o.position.clone();
  const fx = from.x + 1;
  const fz = from.y + 1;
  const yaw1 = body.rotation.y;
  const yaw0 = cornerAngle(from.entrance);
  let dyaw = yaw1 - yaw0;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const dur = Math.max(0.45, Math.min(0.9, beat.dur));
  // Footprint left behind at the old spot, fading.
  const foot = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 1.86).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#2a2018', transparent: true, opacity: 0.28, depthWrite: false }),
  );
  foot.position.set(fx, 0.08, fz);
  foot.renderOrder = 4;
  foot.visible = false;
  ctx.mount(tl, foot);
  const fm = foot.material as THREE.MeshBasicMaterial;
  tl.add({
    start: at,
    dur: isReduced(ctx) ? dur : 0.6 + dur * 0.3,
    lane: 'tail',
    update: (_k, raw) => {
      foot.visible = raw > 0 && raw < 1;
      fm.opacity = 0.28 * (isReduced(ctx) ? 1 : 1 - raw);
    },
  });
  if (isReduced(ctx)) {
    revealAt(tl, o, at + dur * 0.5);
    return at + dur * 0.5;
  }
  o.visible = false;
  tl.add({
    start: at,
    dur,
    onStart: () => void (o.visible = true),
    update: (_k, raw) => {
      if (raw >= 1) {
        o.position.copy(to);
        body.rotation.y = yaw1;
        return;
      }
      let x = fx;
      let z = fz;
      let y = to.y;
      let yaw = yaw0;
      if (raw < 0.28) {
        y += 0.6 * ease.outCubic(raw / 0.28);
      } else if (raw < 0.72) {
        const u = ease.inOutCubic((raw - 0.28) / 0.44);
        x = fx + (to.x - fx) * u;
        z = fz + (to.z - fz) * u;
        y += 0.6 + Math.sin(u * Math.PI) * 0.35;
        yaw = yaw0 + dyaw * u;
      } else {
        const u = ease.outBack((raw - 0.72) / 0.28);
        x = to.x;
        z = to.z;
        y += 0.6 * (1 - u);
        yaw = yaw1;
      }
      o.position.set(x, y, z);
      body.rotation.y = yaw;
    },
  });
  cornerDust(tl, ctx, p, at + dur * 0.93);
  return at + dur;
});

registerChoreo('restaurantOpened', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'restaurantOpened');
  const key = e ? `restaurant:${e.restaurantId}` : '';
  const p = e && live(ctx, key);
  const old = grave(tl, ctx, key);
  if (!e || !p) {
    if (old) old.obj.visible = false;
    return at;
  }
  const f = fit(beat);
  ctx.follow(tl, at, beat.focal);
  const owner = ctx.view?.board.restaurants[e.restaurantId]?.owner ?? null;
  if (old) {
    // Scaffold falls away (flattens into the ground) while the diner rises in its place.
    shrinkOut(tl, ctx, old.obj, at, 0.32 * f, { flat: true, sink: 0.04 });
    cornerDust(tl, ctx, p, at + 0.12 * f, 0.9);
  }
  growY(tl, ctx, p.obj, at + 0.18 * f, 0.4 * f, { xz0: 0.96 });
  const sign = p.obj.getObjectByName('sign');
  if (sign) popIn(tl, ctx, sign, at + 0.5 * f, 0.22 * f, 0.1);
  const top = worldOf(p.obj, 'sign', new THREE.Vector3(0, 1.55, 0));
  confetti(tl, ctx, ctx.color(owner), top.x, top.y, top.z, at + 0.55 * f, 0.9, 1.6);
  return at + Math.min(beat.dur, 0.8 * f);
});

registerChoreo('driveIns', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'driveInsOpened');
  if (!e) return at;
  const per = beat.dur / Math.max(1, e.restaurantIds.length);
  let end = at;
  e.restaurantIds.forEach((id, i) => {
    const key = `restaurant:${id}`;
    const old = grave(tl, ctx, key);
    if (old) old.obj.visible = false;
    const p = live(ctx, key);
    if (!p) return;
    const t0 = at + i * per;
    CLOCKWISE.forEach((c, j) => {
      const arrow = p.obj.getObjectByName(`driveIn:${c}`);
      if (arrow) end = Math.max(end, popIn(tl, ctx, arrow, t0 + j * per * 0.16, Math.min(0.3, per * 0.5), 0.2));
    });
  });
  return end;
});

registerChoreo('bankrupt', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'bankrupt');
  if (!e) return at;
  const f = fit(beat);
  let end = at;
  const ids = Object.values(ctx.view?.board.restaurants ?? {}).filter((r) => r.owner === e.player).map((r) => r.id);
  ids.forEach((id, i) => {
    const key = `restaurant:${id}`;
    const p = live(ctx, key);
    const old = grave(tl, ctx, key);
    if (!old || !p) return;
    const t0 = at + i * 0.08;
    // The old (lit) restaurant stays until its sign tips over and falls; then the derelict one.
    revealAt(tl, p.obj, t0 + 0.62 * f);
    tl.call(t0 + 0.62 * f, () => void (old.obj.visible = false));
    const sign = old.obj.getObjectByName('sign');
    if (sign && !isReduced(ctx)) {
      const r0 = sign.rotation.clone();
      tl.add({
        start: t0,
        dur: 0.6 * f,
        ease: ease.inCubic,
        update: (k) => {
          sign.rotation.set(r0.x + k * 1.45, r0.y, r0.z);
        },
      });
      const s = worldOf(old.obj, 'sign');
      puff(tl, ctx, 'dust', s.x, 0.05, s.z, t0 + 0.58 * f, { scale: 1.2 });
    }
    end = Math.max(end, t0 + 0.62 * f);
  });
  return end;
});

// ---------------------------------------------------------------------------
// Houses and gardens
// ---------------------------------------------------------------------------

registerChoreo('houseBuilt', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'houseBuilt');
  const p = e && live(ctx, `house:${e.houseId}`);
  if (!e || !p) return at;
  const f = fit(beat);
  ctx.follow(tl, at, beat.focal);
  const cx = (p.rect.x0 + p.rect.x1) / 2;
  const cz = (p.rect.z0 + p.rect.z1) / 2;
  puff(tl, ctx, 'dust', cx, 0.05, cz, at, { scale: 1.6 });
  growY(tl, ctx, p.obj, at + 0.05 * f, 0.4 * f, { xz0: 0.88 });
  const badge = p.obj.getObjectByName('badge');
  if (badge) revealAt(tl, badge, at + 0.46 * f);
  const garden = live(ctx, `garden:${e.houseId}`);
  if (garden) growY(tl, ctx, garden.obj, at + 0.5 * f, 0.3 * f, { xz0: 0.35, e: ease.outCubic });
  return at + Math.min(beat.dur, 0.8 * f);
});

registerChoreo('gardenAdded', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'gardenAdded');
  const g = e && live(ctx, `garden:${e.houseId}`);
  if (!e || !g) return at;
  const f = fit(beat);
  ctx.follow(tl, at, beat.focal);
  growY(tl, ctx, g.obj, at, 0.35 * f, { xz0: 0.25 });
  const { x0, z0, x1, z1 } = g.rect;
  dustLine(tl, ctx, x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, at + 0.05, 2, 0.9);
  const house = live(ctx, `house:${e.houseId}`);
  if (house) {
    const b = house.obj.getObjectByName('badge');
    const y = (b?.position.y ?? house.height) + 0.55;
    chip(tl, ctx, '×2', null, COLORS.ok, (house.rect.x0 + house.rect.x1) / 2, y, (house.rect.z0 + house.rect.z1) / 2, at + 0.2 * f, Math.max(0.6, beat.dur), { flip: true, rise: 0.25 });
  }
  return at + Math.min(beat.dur, 0.6 * f);
});

// ---------------------------------------------------------------------------
// Campaigns placed
// ---------------------------------------------------------------------------

registerChoreo('campaignPlaced', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'campaignPlaced');
  const c = e?.campaign;
  const p = c && live(ctx, `campaign:${c.id}`);
  if (!e || !c || !p) return at;
  const f = fit(beat);
  ctx.follow(tl, at, beat.focal);
  const color = ctx.color(c.owner);
  const good = (c.goods[0] ?? 'burger') as FoodId;
  const o = p.obj;
  const cx = (p.rect.x0 + p.rect.x1) / 2;
  const cz = (p.rect.z0 + p.rect.z1) / 2;
  let land: number;
  if (c.placement.kind === 'airplane') {
    // Flies in from off the board along its side to the hover spot.
    const fly = o.getObjectByName('fly');
    const strip = o.getObjectByName('strip');
    const width = c.placement.width;
    const dur = Math.max(0.6, Math.min(1.0, beat.dur));
    if (fly && !isReduced(ctx)) {
      const x1 = fly.position.x;
      const x0 = x1 - (width + 6);
      tl.add({
        start: at,
        dur,
        ease: ease.outCubic,
        update: (k, raw) => {
          fly.position.x = raw >= 1 ? x1 : x0 + (x1 - x0) * k;
        },
      });
      // The strip, number badge and duration pips arrive with the plane.
      for (const part of [strip, o.getObjectByName('badge'), o.getObjectByName('pips'), o.getObjectByName('eternal')]) if (part) revealAt(tl, part, at + dur * 0.75);
    } else revealAt(tl, o, at);
    land = at + dur;
  } else if (c.kind === 'radio') {
    // Mast rises, one ring pulse.
    land = growY(tl, ctx, o, at, 0.45 * f, { xz0: 1 });
    ringPulse(tl, ctx, color, cx, cz, 1.6, land - 0.05, 0.55);
    ringPulse(tl, ctx, color, cx, cz, 2.6, land + 0.1, 0.55);
  } else if (c.kind === 'mailbox') {
    land = popIn(tl, ctx, o, at, 0.4 * f, 0.6);
    puff(tl, ctx, 'dust', cx, 0.05, cz, land - 0.1, { scale: 0.8 });
  } else {
    // Billboard / giant billboard / gourmet guide: drops onto its posts with a thud.
    const big = c.kind !== 'billboard' || c.placement.kind !== 'board';
    land = dropIn(tl, ctx, o, at, { dur: (big ? 0.55 : 0.45) * f, height: big ? 1.6 : 1.3 });
    cornerDust(tl, ctx, p, land - 0.08, big ? 1.2 : 0.8);
    chip(tl, ctx, c.number !== null ? `#${c.number}` : '+', good, color, cx, p.height + 0.35, cz, land, 0.6, { rise: 0.3 });
  }
  // Reach rings flash once so the player sees what it will hit.
  const v = ctx.view;
  if (v) {
    const reach = campaignReachIds(v, ctx.me, c.id);
    const layer = reach.length ? ctx.feedback.reachFlash(reach, good, [], color) : null;
    if (layer) flash(tl, ctx, layer.group, land - 0.05, 0.75, () => layer.tick(performance.now() / 1000));
  }
  return Math.min(at + Math.max(beat.dur, 0.45), land);
});

// ---------------------------------------------------------------------------
// Ketchup entities
// ---------------------------------------------------------------------------

function worksOf(o: THREE.Object3D): THREE.Object3D[] {
  return o.children.filter((c) => c.name.startsWith('works:')).sort((a, b) => Number(a.name.slice(6)) - Number(b.name.slice(6)));
}

registerChoreo('entityPlaced', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'entityPlaced');
  if (!e) return at;
  const ent = e.entity;
  const key = `entity:${ent.id}`;
  const p = live(ctx, key);
  const before = ctx.prevView?.board.entities[ent.id];
  const old = grave(tl, ctx, key);
  const f = fit(beat);
  if (!p) {
    if (old) old.obj.visible = false;
    return at;
  }
  ctx.follow(tl, at, beat.focal);
  const o = p.obj;
  const cx = (p.rect.x0 + p.rect.x1) / 2;
  const cz = (p.rect.z0 + p.rect.z1) / 2;

  // A lobbyist road finished (clean up): barriers and cones pack away, arrows switch colour.
  if (before && old && ent.kind === 'lobbyistRoad' && before.kind === 'lobbyistRoad' && before.underConstruction && !ent.underConstruction) {
    const works = worksOf(old.obj);
    const step = Math.min(0.06, (0.3 * f) / Math.max(1, works.length));
    works.forEach((w, i) => shrinkOut(tl, ctx, w, at + i * step, 0.22 * f, { sink: 0.05 }));
    const badge = old.obj.getObjectByName('badge');
    if (badge) tl.call(at, () => void (badge.visible = false));
    const done = at + works.length * step + 0.22 * f;
    tl.call(done, () => void (old.obj.visible = false));
    revealAt(tl, o, done);
    for (const a of o.children.filter((c) => c.name === 'arrow')) popIn(tl, ctx, a, done, 0.2, 0);
    return Math.min(at + beat.dur, done + 0.1);
  }
  if (old) old.obj.visible = false;

  switch (ent.kind) {
    case 'coffeeShop': {
      const end = popIn(tl, ctx, o, at, 0.38 * f, 0.5);
      puff(tl, ctx, 'steam', cx, 0.95, cz, end - 0.1, { scale: 1.1 });
      return end;
    }
    case 'park': {
      const end = growY(tl, ctx, o, at, 0.45 * f, { xz0: 0.7 });
      dustLine(tl, ctx, p.rect.x0 + 0.4, cz, p.rect.x1 - 0.4, cz, at + 0.1, 3, 1);
      return end;
    }
    case 'lobbyistRoad': {
      // Cones and barriers pop in a row along the squares; arrows first.
      revealAt(tl, o, at);
      const arrows = o.children.filter((c) => c.name === 'arrow');
      arrows.forEach((a) => popIn(tl, ctx, a, at, 0.22, 0));
      const works = worksOf(o);
      const step = Math.min(0.08, (0.35 * f) / Math.max(1, works.length));
      let end = at;
      works.forEach((w, i) => (end = Math.max(end, dropIn(tl, ctx, w, at + 0.05 + i * step, { dur: 0.25 * f, height: 0.6 }))));
      const badge = o.getObjectByName('badge');
      if (badge) revealAt(tl, badge, end);
      return Math.min(at + beat.dur, end);
    }
    case 'roadworks': {
      const end = dropIn(tl, ctx, o, at, { dur: 0.4 * f, height: 1.5, squash: true });
      puff(tl, ctx, 'dust', cx, 0.05, cz, end - 0.06, { scale: 0.9 });
      return end;
    }
    case 'freeway': {
      // The ramp slides in from beyond the board edge.
      const dur = Math.max(0.45, Math.min(0.8, beat.dur));
      if (isReduced(ctx)) {
        revealAt(tl, o, at);
        return at;
      }
      const a = dirAngle(ent.side);
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const to = o.position.clone();
      o.visible = false;
      tl.add({
        start: at,
        dur,
        ease: ease.outCubic,
        onStart: () => void (o.visible = true),
        update: (k, raw) => {
          if (raw >= 1) return void o.position.copy(to);
          o.position.copy(to).addScaledVector(dir, (1 - k) * 4.5);
        },
      });
      puff(tl, ctx, 'dust', to.x, 0.05, to.z, at + dur * 0.85, { scale: 1.3 });
      return Math.max(at + dur, moveRural(tl, ctx, at + dur * 0.6));
    }
    default:
      return popIn(tl, ctx, o, at, 0.38 * f);
  }
});

registerChoreo('entityRemoved', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'entityRemoved');
  if (!e) return at;
  const key = `entity:${e.entityId}`;
  const old = grave(tl, ctx, key);
  if (!old) return at;
  const kind: ModuleEntity['kind'] | undefined = e.kind ?? ctx.prevView?.board.entities[e.entityId]?.kind;
  const f = fit(beat);
  const cx = (old.rect.x0 + old.rect.x1) / 2;
  const cz = (old.rect.z0 + old.rect.z1) / 2;
  if (kind === 'roadworks') {
    puff(tl, ctx, 'dust', cx, 0.05, cz, at + 0.2 * f, { scale: 0.9 });
    return shrinkOut(tl, ctx, old.obj, at, 0.3 * f, { sink: 0.05 });
  }
  if (kind === 'lobbyistRoad') {
    const works = worksOf(old.obj);
    works.forEach((w, i) => shrinkOut(tl, ctx, w, at + i * 0.04, 0.22 * f));
    return shrinkOut(tl, ctx, old.obj, at + works.length * 0.04, 0.2 * f, { flat: true });
  }
  puff(tl, ctx, 'dust', cx, 0.05, cz, at + 0.25 * f, { scale: 1.2 });
  return shrinkOut(tl, ctx, old.obj, at, 0.35 * f, { flat: kind === 'park' || kind === 'freeway', sink: 0.08 });
});

// ---------------------------------------------------------------------------
// Map tiles (Ketchup lobbyists' extra tile / new districts) and the setup board build
// ---------------------------------------------------------------------------

const SLAB_GEO = () => new THREE.BoxGeometry(4.88, 0.14, 4.88);
/** Above roads, bridges and tufts so the empty slot hides them. */
const COVER_Y = 0.26;

/**
 * Mask one 5x5 tile with an empty-slot cover, drop a grass slab onto it from `from` (offset and
 * height), and at the landing take both away (the real tile shows) with a dust line along the
 * seams. Pieces on the tile stay hidden until then and pop in after. Returns the landing time.
 */
export function tileDrop(tl: Timeline, ctx: ChoreoCtx, col: number, row: number, at: number, opts: { from: [number, number, number]; dur: number; pieces?: Placed[] }): number {
  const x0 = col * 5;
  const z0 = row * 5;
  const cx = x0 + 2.5;
  const cz = z0 + 2.5;
  const land = at + opts.dur;
  const pieces = opts.pieces ?? [];
  if (isReduced(ctx)) {
    for (const p of pieces) revealAt(tl, p.obj, at);
    return at;
  }
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(5.02, 5.02).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7f7461', roughness: 1 }));
  cover.position.set(cx, COVER_Y, cz);
  cover.renderOrder = 1;
  cover.receiveShadow = true;
  ctx.mount(tl, cover);
  const slab = new THREE.Group();
  const top = new THREE.Mesh(SLAB_GEO(), new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 0.9, flatShading: true }));
  top.castShadow = true;
  slab.add(top);
  slab.visible = false;
  ctx.mount(tl, slab);
  const [ox, oy, oz] = opts.from;
  const y1 = COVER_Y - 0.06;
  // Slide in at height (if offset), then fall onto the slot; the thud is the dust line.
  const slide = ox || oz ? 0.62 : 0;
  tl.add({
    start: at,
    dur: opts.dur,
    update: (_k, raw) => {
      slab.visible = raw > 0 && raw < 1;
      cover.visible = raw < 1;
      const u = slide ? ease.outCubic(Math.min(1, raw / slide)) : 1;
      const f = ease.inCubic(Math.max(0, (raw - slide) / (1 - slide)));
      slab.position.set(cx + ox * (1 - u), y1 + oy * (1 - f), cz + oz * (1 - u));
    },
  });
  // Dust line along the seams, 2 puffs a side.
  dustLine(tl, ctx, x0 + 0.6, z0 + 0.1, x0 + 4.4, z0 + 0.1, land - 0.05, 2, 1);
  dustLine(tl, ctx, x0 + 0.6, z0 + 4.9, x0 + 4.4, z0 + 4.9, land - 0.05, 2, 1);
  dustLine(tl, ctx, x0 + 0.1, z0 + 1.2, x0 + 0.1, z0 + 3.8, land - 0.04, 2, 1);
  dustLine(tl, ctx, x0 + 4.9, z0 + 1.2, x0 + 4.9, z0 + 3.8, land - 0.04, 2, 1);
  pieces.forEach((p, i) => popIn(tl, ctx, p.obj, land + 0.04 + i * 0.03, 0.3, 0.4));
  return land;
}

/** Live pieces whose centre lies on tile (col, row) and that are new since `prevView` (no prev = all). */
export function piecesOnTile(ctx: ChoreoCtx, col: number, row: number, isNew: (p: Placed) => boolean): Placed[] {
  const out: Placed[] = [];
  for (const p of ctx.rec.live.values()) {
    const cx = (p.rect.x0 + p.rect.x1) / 2;
    const cz = (p.rect.z0 + p.rect.z1) / 2;
    if (cx >= col * 5 && cx < col * 5 + 5 && cz >= row * 5 && cz < row * 5 + 5 && isNew(p)) out.push(p);
  }
  return out;
}

registerChoreo('mapTile', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'mapTileAdded');
  const b = ctx.view?.board;
  if (!e || !b) return at;
  const prevIds = new Set((ctx.prevView?.board.tiles ?? []).map((t) => t.id));
  const tile = b.tiles.find((t) => !prevIds.has(t.id)) ?? b.tiles.find((t) => t.row === e.row && t.col === e.col);
  if (!tile) return at;
  ctx.follow(tl, at, beat.focal);
  // Slide in from the nearest board edge at y 0.4, then drop with a thud.
  const dl = tile.col;
  const dr = b.cols - 1 - tile.col;
  const dt = tile.row;
  const db = b.rows - 1 - tile.row;
  const m = Math.min(dl, dr, dt, db);
  const off = 7;
  const from: [number, number, number] = m === dl ? [-off, 0.4, 0] : m === dr ? [off, 0.4, 0] : m === dt ? [0, 0.4, -off] : [0, 0.4, off];
  const prev = ctx.prevView?.board;
  const isNew = (p: Placed) => {
    if (!prev) return true;
    const id = p.id;
    if (!id) return p.kind === 'price';
    return !(prev.houses[id] || prev.drinkSources[id] || prev.entities[id] || prev.restaurants[id] || prev.campaigns[id]);
  };
  const pieces = piecesOnTile(ctx, tile.col, tile.row, isNew);
  const dur = Math.max(0.6, Math.min(1.0, beat.dur - 0.2));
  // Slide (linear-ish) then drop: one clip with a two-part profile inside tileDrop's ease.
  return tileDrop(tl, ctx, tile.col, tile.row, at, { from, dur, pieces });
});

// ---------------------------------------------------------------------------
// Helpers reused by phase.ts
// ---------------------------------------------------------------------------

/** Restaurants of a player that are open (or every status with `all`). */
export function restaurantsOf(ctx: ChoreoCtx, player: PlayerId, all = false): Placed[] {
  const out: Placed[] = [];
  for (const r of Object.values(ctx.view?.board.restaurants ?? {})) {
    if (r.owner !== player || (!all && r.status !== 'open')) continue;
    const p = live(ctx, `restaurant:${r.id}`);
    if (p) out.push(p);
  }
  return out;
}
