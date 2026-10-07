/**
 * Marketing choreographies (animation-plan §2.9, WP-C). One beat per campaign run: the campaign
 * nods, its carrier brings the demand to each house in run order, the fresh tokens (hidden until
 * then) land on the stacks, houses in reach that were full get a grey "full" chip, then income
 * coins, the duration pip ticks off, and an expired campaign leaves a dust puff.
 *
 * Carriers per kind:
 * - Billboard / giant billboard / gourmet guide: a token per house arcs off the piece (80 ms apart).
 * - Mailbox: the mailman pops up by the box and tosses an envelope to each house; it flips into
 *   the token on arrival.
 * - Airplane: the plane leaves its hover spot, sweeps across its band and drops a leaflet over each
 *   house as it passes; leaflets flutter down into tokens; the plane flies back into its spot.
 * - Radio: three rings expand from the mast; each house's token drops when the ring front reaches it.
 * - `demandPlaced` without a campaign (module sources): the token drops from above with a puff.
 *
 * Reduced mode: "full" chips, caption and the tokens appear at their beat; no flights.
 */
import * as THREE from 'three';
import type { Campaign, FoodId } from '@fcm/engine';
import { campaignInfo } from '../../../state/feedback.js';
import { campaignReachIds } from '../../../state/guidance.js';
import { DELTA } from '../../coords.js';
import { campaignAnchor } from '../../layout.js';
import type { Placed } from '../../reconcile.js';
import { PIP_STEP, pipGeo } from '../../minis/marketing.js';
import { animateRadioRings, flutterLeaflet, ringFront } from '../../minis/props.js';
import { pipCount } from '../../overlays/feedback.js';
import { releaseTree } from '../../minis/ctx.js';
import { ease } from '../../tween.js';
import { beatEvent, beatEvents, followClip, registerChoreo, type ChoreoCtx } from '../choreo.js';
import { PACING } from '../compile.js';
import { AIR_Y, airPath, type P2 } from '../path.js';
import type { Timeline } from '../timeline.js';
import { arcClip, cashAt, chip, clamp, coins, demandLanding, houseAnchor, puff, pulse, worldOf, type DemandLanding, type Ev } from './carriers.js';

const GREY = '#8f8b88';
/** Gap between houses of one campaign (they still read as separate). */
const STAGGER = 0.08;

interface Run {
  id: string;
  camp: Campaign | undefined;
  color: string;
  good: FoodId;
  drops: Ev<'demandPlaced'>[];
  lands: (DemandLanding | null)[];
  /** Carrier start point (piece face / mast top / plane). */
  src: THREE.Vector3;
  budget: number;
  expired: boolean;
  /** The piece on the board (live, or the claimed grave of an expiring campaign). */
  piece: Placed | undefined;
}

/**
 * An expiring campaign left the live set in this batch's sync; claim its grave so it stands
 * through its last run and leaves with `expireOut` (buried when the timeline ends).
 */
function claimExpired(tl: Timeline, ctx: ChoreoCtx, id: string): Placed | undefined {
  const key = `campaign:${id}`;
  if (ctx.rec.graveRemoved(key) !== true) return undefined;
  const g = ctx.rec.claimGrave(key);
  if (!g) return undefined;
  tl.own(() => ctx.rec.bury(g));
  return g;
}

/**
 * Expired campaign piece leaves (animation-plan §2.9 campaignExpired): it shrinks to the ground
 * with a dust puff; a radio mast telescopes down. Airplanes fly off the edge in their sweep, so
 * only their strip folds away. Returns the end.
 */
function expireOut(tl: Timeline, ctx: ChoreoCtx, piece: Placed, kind: string, airplane: boolean, at: number): number {
  const o = piece.obj;
  if (ctx.mode === 'reduced') {
    tl.call(at, () => void (o.visible = false), 'tail');
    return at;
  }
  const radio = kind === 'radio';
  const rings = o.getObjectByName('radioRings');
  const dur = radio ? 0.5 : 0.4;
  const s0 = o.scale.clone();
  const y0 = o.position.y;
  if (!airplane) puff(tl, ctx, 'dust', new THREE.Vector3(o.position.x, 0.05, o.position.z), at + dur * 0.55, 0.6, 1.6);
  tl.add({
    start: at,
    dur,
    ease: ease.inCubic,
    lane: 'tail',
    update: (k, raw) => {
      if (raw >= 1) {
        o.visible = false;
        return;
      }
      if (rings) rings.visible = false;
      const s = Math.max(0.001, 1 - k);
      // Mast telescopes (height only); other pieces shrink to the ground.
      if (radio || airplane) o.scale.set(s0.x * (1 - k * 0.15), s0.y * s, s0.z * (1 - k * 0.15));
      else o.scale.set(s0.x * s, s0.y * s, s0.z * s);
      o.position.y = y0 - k * 0.06;
    },
  });
  return at + dur;
}

/** Where a campaign stands (live piece, else its anchor: expired campaigns are gone from the board). */
function campaignSpot(ctx: ChoreoCtx, id: string, camp: Campaign | undefined, piece?: Placed): { x: number; z: number; h: number } | null {
  const p = piece ?? ctx.rec.live.get(`campaign:${id}`);
  if (p) return { x: (p.rect.x0 + p.rect.x1) / 2, z: (p.rect.z0 + p.rect.z1) / 2, h: p.height };
  const b = ctx.view?.board ?? ctx.prevView?.board;
  if (!b || !camp) return null;
  const a = campaignAnchor(b, camp.placement);
  return { x: a.x, z: a.z, h: a.height };
}

registerChoreo('campaign', (beat, at, tl, ctx) => {
  const run = beatEvent(beat, 'campaignRan');
  if (!run) return at;
  const id = run.campaignId;
  const camp = ctx.prevView?.board.campaigns[id] ?? ctx.view?.board.campaigns[id] ?? campaignInfo(ctx.view, id);
  const drops = beatEvents(beat, 'demandPlaced');
  const got = drops.map((d) => d.houseId);
  const base = ctx.prevView ?? ctx.view;
  const reach = run.reached ?? (camp && base ? campaignReachIds(base, ctx.me, id) : []);
  const full = run.full ?? reach.filter((h) => !got.includes(h));
  const good = (drops[0]?.tokens[0]?.good ?? camp?.goods[0] ?? 'burger') as FoodId;
  const owner = camp?.owner ?? null;
  const color = ctx.color(owner);
  ctx.caption(tl, at, { kind: 'campaign', campaignId: id, number: camp?.number ?? null, owner, goods: camp?.goods ?? (drops[0] ? [good] : []), houses: got, full });
  ctx.follow(tl, at, beat.focal);
  const budget = Math.max(PACING.minReadable, beat.dur);
  const expired = beat.events.some((e) => e.type === 'campaignExpired');
  const piece = ctx.rec.live.get(`campaign:${id}`) ?? (expired ? claimExpired(tl, ctx, id) : undefined);
  pulse(tl, ctx, piece?.obj, at, Math.min(0.4, budget), 0.12);
  const spot = campaignSpot(ctx, id, camp, piece);
  const src = spot ? new THREE.Vector3(spot.x, Math.max(0.6, spot.h * 0.6), spot.z) : null;
  const lands = drops.map((d) => demandLanding(tl, ctx, d));

  // Houses in reach with no room: grey "full" chip.
  full.forEach((h, i) => {
    const a = houseAnchor(ctx, h);
    if (a) chip(tl, ctx, 'full', GREY, a, at + 0.1 + i * 0.05, budget + 0.5, { size: 0.32, center: [1.2, 0.5] });
  });

  let land = at;
  if (!src || ctx.mode === 'reduced') {
    // No travel: tokens appear in run order inside the beat.
    lands.forEach((l, i) => (land = Math.max(land, l?.reveal(at + Math.min(budget * 0.6, 0.15 + i * STAGGER)) ?? at)));
  } else {
    const r: Run = { id, camp, color, good, drops, lands, src, budget, expired, piece };
    const kind = camp?.kind ?? 'billboard';
    land =
      camp?.placement.kind === 'airplane'
        ? airplane(tl, ctx, r, at)
        : kind === 'mailbox'
          ? mailbox(tl, ctx, r, at)
          : kind === 'radio'
            ? radio(tl, ctx, r, at)
            : tossTokens(tl, ctx, r, at);
  }

  // Income, pip, expiry (tails).
  const tail = Math.max(land, at + budget * 0.6);
  for (const inc of beatEvents(beat, 'marketingIncome')) {
    if (src) {
      coins(tl, ctx, src, tail);
      chip(tl, ctx, `+$${inc.amount}`, ctx.color(inc.player), src.clone().setY(src.y + 0.5), tail, 1.0, { rise: 0.35, size: 0.4 });
    }
    cashAt(tl, tail + 0.4, inc.player, inc.amount);
  }
  const tick = beatEvent(beat, 'campaignTicked');
  if (tick && !expired) pipTick(tl, ctx, id, tick.remaining, at + budget * 0.5, Math.max(0.6, budget));
  if (expired && piece) expireOut(tl, ctx, piece, camp?.kind ?? 'billboard', camp?.placement.kind === 'airplane', tail);
  else if (expired && spot) puff(tl, ctx, 'dust', new THREE.Vector3(spot.x, 0.05, spot.z), tail, 0.6, 1.6);
  if (expired && spot) {
    chip(tl, ctx, 'done', color, new THREE.Vector3(spot.x, spot.h * 0.7, spot.z), tail, 1.0, { rise: 0.3, size: 0.34 });
  }
  return land;
});

/** A campaign expiring without a run in this batch: its piece shrinks away with a dust puff. */
registerChoreo('campaignExpired', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'campaignExpired');
  if (!e) return at;
  const camp = ctx.prevView?.board.campaigns[e.campaignId] ?? campaignInfo(ctx.view, e.campaignId);
  const piece = claimExpired(tl, ctx, e.campaignId);
  if (!piece) return at;
  ctx.follow(tl, at, beat.focal);
  return expireOut(tl, ctx, piece, camp?.kind ?? 'billboard', camp?.placement.kind === 'airplane', at);
});

// ---------------------------------------------------------------------------
// Carriers
// ---------------------------------------------------------------------------

/** How many flights a beat may show; the rest just land with the last one. */
const flightsOf = (ctx: ChoreoCtx, n: number) => Math.min(n, Math.max(1, ctx.caps.flights));

/** Billboard / giant billboard / gourmet guide: a token per house arcs off the piece. */
function tossTokens(tl: Timeline, ctx: ChoreoCtx, r: Run, at: number): number {
  const n = r.drops.length;
  if (!n) return at;
  const gap = Math.min(STAGGER, (r.budget * 0.35) / Math.max(1, n - 1));
  const fly = clamp(r.budget - 0.15 - gap * (n - 1), 0.35, 0.6);
  const cap = flightsOf(ctx, n);
  let land = at;
  r.drops.forEach((d, i) => {
    const l = r.lands[i];
    if (!l) return;
    const start = at + 0.15 + Math.min(i, cap - 1) * gap;
    if (i < cap) {
      const t = ctx.actor(tl, 'carryToken', null, d.tokens[0]?.good ?? r.good);
      tl.add({ start, ...arcClip(t, r.src, l.target, fly, { height: Math.min(1.6, 0.5 + r.src.distanceTo(l.target) * 0.1), scale: 1.8 }) });
    }
    land = Math.max(land, l.reveal(start + fly));
  });
  return land;
}

/** Mailbox: the mailman pops up by the box and tosses an envelope to each house. */
function mailbox(tl: Timeline, ctx: ChoreoCtx, r: Run, at: number): number {
  const n = r.drops.length;
  if (!n) return at;
  // Stand between the box and the houses.
  const targets = r.lands.filter((l): l is DemandLanding => !!l).map((l) => l.target);
  const cx = targets.reduce((s, p) => s + p.x, 0) / Math.max(1, targets.length);
  const cz = targets.reduce((s, p) => s + p.z, 0) / Math.max(1, targets.length);
  const dx = cx - r.src.x;
  const dz = cz - r.src.z;
  const dl = Math.hypot(dx, dz) || 1;
  const man = ctx.actor(tl, 'mailman', r.color, ctx.tier === 'low' ? 'lite' : null);
  const body = man.getObjectByName('body') ?? man;
  const standX = r.src.x + (dx / dl) * 0.8;
  const standZ = r.src.z + (dz / dl) * 0.8;
  const pop = 0.18;
  tl.add({
    start: at,
    dur: pop,
    ease: ease.outBack,
    onStart: () => void (man.visible = true),
    update: (k) => {
      man.position.set(standX, 0.06, standZ);
      man.scale.setScalar(Math.max(0.001, k) * 1.5);
    },
  });
  const gap = Math.min(0.14, (r.budget * 0.4) / Math.max(1, n - 1));
  const fly = clamp(r.budget - pop - gap * (n - 1), 0.35, 0.55);
  const drop = man.getObjectByName('drop') ?? man;
  const cap = flightsOf(ctx, n);
  let land = at;
  let yaw = Math.atan2(-dz, dx);
  body.rotation.y = yaw;
  r.drops.forEach((_d, i) => {
    const l = r.lands[i];
    if (!l) return;
    const start = at + pop + Math.min(i, cap - 1) * gap;
    // Turn to face the house, then toss.
    const toYaw = Math.atan2(-(l.target.z - standZ), l.target.x - standX);
    const from = yaw;
    yaw = toYaw;
    tl.add({
      start: start - 0.08,
      dur: 0.1,
      update: (k) => {
        let d = toYaw - from;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        body.rotation.y = from + d * k;
      },
    });
    if (i < cap) {
      const env = ctx.actor(tl, 'envelope', r.color);
      const p0 = new THREE.Vector3();
      const clip = arcClip(env, p0, l.target, fly, { height: 0.7, spin: 0, scale: 2.2 });
      const up = clip.update!;
      tl.add({
        start,
        ...clip,
        onStart: () => {
          worldOf(drop, p0);
          env.visible = true;
        },
        update: (k, raw) => {
          up(k, raw);
          // Tumbles end over end and shrinks into the token.
          env.rotation.x = k * Math.PI * 2;
          env.rotation.y = toYaw;
          if (k > 0.8) env.scale.setScalar(Math.max(0.001, 2.2 * (1 - (k - 0.8) / 0.2)));
        },
      });
    }
    land = Math.max(land, l.reveal(start + fly));
  });
  // Off he goes.
  tl.add({
    start: land + 0.1,
    dur: 0.2,
    lane: 'tail',
    update: (k, raw) => {
      man.scale.setScalar(Math.max(0.001, 1 - k) * 1.5);
      if (raw >= 1) man.visible = false;
    },
  });
  return land;
}

/** Airplane: sweep across the band, leaflets over each house, fly back into the hover spot. */
function airplane(tl: Timeline, ctx: ChoreoCtx, r: Run, at: number): number {
  const b = ctx.view?.board ?? ctx.prevView?.board;
  const p = r.camp?.placement;
  if (!b || !p || p.kind !== 'airplane') return tossTokens(tl, ctx, r, at);
  const fly = r.piece?.obj.getObjectByName('fly') ?? null;
  const [ox, oz] = DELTA[p.side];
  const mid = p.offset + p.width / 2;
  const span = p.side === 'N' || p.side === 'S' ? b.h : b.w;
  const out = 2.2;
  // Start at the hover spot, cross the board along the band, leave on the far side.
  const start: P2 = p.side === 'N' ? [mid, -out] : p.side === 'S' ? [mid, b.h + out] : p.side === 'W' ? [-out, mid] : [b.w + out, mid];
  const end: P2 = [start[0] - ox * (span + out * 2), start[1] - oz * (span + out * 2)];
  const f = airPath([start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], end], AIR_Y.airplane);
  const sweep = clamp(r.budget - 0.35, 0.8, 1.1);
  const plane = ctx.actor(tl, 'airplane', r.color, r.camp?.goods.join('+') || null);
  tl.add({ start: at, ...followClip(plane, f, sweep, { ease: ease.linear, hideAtEnd: true }) });
  // The hover plane is the one sweeping: hide it, and fly it back in afterwards.
  if (fly) {
    fly.visible = false;
    // Expired: the sweep is its last flight, off the far edge.
    if (!r.expired) {
      const x0 = fly.position.x;
      tl.add({
        start: at + sweep,
        dur: 0.6,
        ease: ease.outCubic,
        lane: 'tail',
        update: (k, raw) => {
          fly.visible = true;
          fly.position.x = raw >= 1 ? x0 : x0 - (1 - k) * 3;
        },
      });
    }
  }
  const flutter = 0.35;
  let land = at;
  const cap = flightsOf(ctx, r.drops.length);
  r.drops.forEach((_d, i) => {
    const l = r.lands[i];
    if (!l) return;
    const s = f.nearest(l.target.x, l.target.z);
    const t = at + sweep * (s / Math.max(1e-3, f.length));
    if (i < cap) {
      const leaf = ctx.actor(tl, 'leaflet', r.color);
      const fromY = AIR_Y.airplane - 0.25 - l.target.y;
      tl.add({
        start: t,
        dur: flutter,
        onStart: () => void (leaf.visible = true),
        update: (k, raw) => {
          leaf.position.copy(l.target);
          leaf.scale.setScalar(1.6);
          flutterLeaflet(leaf, k, fromY, i * 1.7);
          if (raw >= 1) leaf.visible = false;
        },
      });
    }
    land = Math.max(land, l.reveal(t + flutter));
  });
  return Math.max(land, at + Math.min(sweep, r.budget));
}

/** Radio: rings from the mast; each token drops when the ring front reaches its house. */
function radio(tl: Timeline, ctx: ChoreoCtx, r: Run, at: number): number {
  const mast = r.piece?.obj.getObjectByName('radioRings');
  const top = mast ? worldOf(mast) : r.src.clone().setY(1.92);
  const dist = (v: THREE.Vector3) => Math.hypot(v.x - top.x, v.z - top.z);
  const targets = r.lands.map((l) => (l ? dist(l.target) : 0));
  const maxR = Math.max(2.5, ...targets.map((d) => d + 0.6));
  const ringDur = clamp(r.budget * 0.85, 0.6, 0.95);
  const rings = ctx.actor(tl, 'radioRings', r.color);
  tl.add({
    start: at,
    dur: ringDur,
    lane: 'tail',
    onStart: () => {
      rings.visible = true;
      rings.position.copy(top);
    },
    update: (k, raw) => {
      animateRadioRings(rings, k, maxR);
      if (raw >= 1) rings.visible = false;
    },
  });
  const drop = 0.24;
  let land = at;
  r.drops.forEach((d, i) => {
    const l = r.lands[i];
    if (!l) return;
    // First k at which the leading ring passes the house.
    let k = 0;
    while (k < 1 && ringFront(k, maxR) < targets[i]!) k += 0.01;
    const t = at + Math.min(1, k) * ringDur;
    const tok = ctx.actor(tl, 'carryToken', null, d.tokens[0]?.good ?? r.good);
    tl.add({
      start: t,
      dur: drop,
      ease: ease.inCubic,
      onStart: () => void (tok.visible = true),
      update: (kk, raw) => {
        tok.position.set(l.target.x, l.target.y + (1 - kk) * 0.9, l.target.z);
        tok.scale.setScalar(1.8);
        if (raw >= 1) tok.visible = false;
      },
    });
    land = Math.max(land, l.reveal(t + drop));
  });
  return Math.max(land, at + Math.min(ringDur, r.budget));
}

// ---------------------------------------------------------------------------
// Pip tick (duration token lifts off) and module demand
// ---------------------------------------------------------------------------

function pipTick(tl: Timeline, ctx: ChoreoCtx, campaignId: string, remaining: number, at: number, dur: number): void {
  const camp = ctx.view?.board.campaigns[campaignId] ?? ctx.prevView?.board.campaigns[campaignId];
  if (!camp || camp.eternal || ctx.mode === 'reduced') return;
  const color = ctx.color(camp.owner);
  const piece = ctx.rec.live.get(`campaign:${campaignId}`);
  const pips = piece?.obj.getObjectByName('pips');
  const pos = new THREE.Vector3();
  if (pips) worldOf(pips, pos);
  else if (piece) pos.set((piece.rect.x0 + piece.rect.x1) / 2, 0.1, (piece.rect.z0 + piece.rect.z1) / 2);
  else return;
  const y0 = pos.y + Math.min(remaining, 6) * PIP_STEP;
  const pip = new THREE.Group();
  pip.add(ctx.stage.inst.proxy(pipGeo(color), { castShadow: false }));
  pip.visible = false;
  ctx.mount(tl, pip);
  tl.own(() => releaseTree(pip));
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

registerChoreo('demand', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'demandPlaced');
  if (!e) return at;
  const l = demandLanding(tl, ctx, e);
  if (!l) return at;
  const dur = Math.min(0.35, Math.max(0.25, beat.dur));
  if (ctx.mode !== 'reduced') {
    const tok = ctx.actor(tl, 'carryToken', null, e.tokens[0]?.good ?? 'burger');
    tl.add({
      start: at,
      dur,
      ease: ease.inCubic,
      onStart: () => void (tok.visible = true),
      update: (k, raw) => {
        tok.position.set(l.target.x, l.target.y + (1 - k) * 1.4, l.target.z);
        tok.scale.setScalar(1.8);
        if (raw >= 1) tok.visible = false;
      },
    });
    puff(tl, ctx, 'steam', l.target, at + dur * 0.8, 0.45, 0.8);
  }
  return l.reveal(at + dur);
});

