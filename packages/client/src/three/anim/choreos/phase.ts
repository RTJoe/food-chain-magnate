/**
 * WP-D phase choreographies (animation-plan §2.1, §2.5, §2.7, §2.8, §2.10): the setup board build,
 * turn-start rings, the Dinnertime light, food production (kitchen steam, tokens stacking on the
 * roof), clean-up spoilage, tips, payday coins, milestone sparks, the bank break flicker and the
 * game-over confetti.
 *
 * Money: tips and salaries are claimed when the batch is published (state/motion.ts); the beat
 * settles its delta when its coins land (`settleCash`, run by finish / Skip too), so the rail
 * counters roll at the landing. Goods / stars pulse the rail the same way.
 */
import * as THREE from 'three';
import type { FoodId, PlayerId } from '@fcm/engine';
import { pulseRail, settleCash } from '../../../state/motion.js';
import { COLORS } from '../../../theme.js';
import { buildToken } from '../../minis/tokens.js';
import type { Placed } from '../../reconcile.js';
import type { Stage } from '../../scene.js';
import { ease } from '../../tween.js';
import { restaurantsOf, piecesOnTile, tileDrop } from './board.js';
import { beatEvent, registerChoreo, type ChoreoCtx } from '../choreo.js';
import type { Beat } from '../compile.js';
import { chip, coin, confetti, isReduced, puff, ringPulse, sparks, transient, worldOf } from './fx.js';
import type { Timeline } from '../timeline.js';

const fit = (beat: Beat) => Math.min(1, Math.max(0.5, beat.dur / Math.max(0.01, beat.nominal)));
const centre = (p: Placed) => new THREE.Vector3((p.rect.x0 + p.rect.x1) / 2, 0, (p.rect.z0 + p.rect.z1) / 2);

/** The cash delta (claimed when the batch was published, state/motion.ts) settles at `at` (or on finish / Skip). */
function moneyAt(tl: Timeline, player: PlayerId, delta: number, at: number): void {
  if (delta) tl.call(at, () => settleCash(player, delta), 'tail');
}

// ---------------------------------------------------------------------------
// Setup board build (gameStarted)
// ---------------------------------------------------------------------------

registerChoreo('gameStarted', (beat, at, tl, ctx) => {
  const b = ctx.view?.board;
  if (!b) return at;
  const tiles = [...b.tiles].sort((x, y) => x.row - y.row || x.col - y.col);
  const n = tiles.length;
  const drop = 0.5;
  const gap = Math.min(0.12, Math.max(0.05, (beat.dur - drop - 0.4) / Math.max(1, n - 1)));
  let end = at;
  tiles.forEach((t, i) => {
    const pieces = piecesOnTile(ctx, t.col, t.row, () => true);
    end = Math.max(end, tileDrop(tl, ctx, t.col, t.row, at + i * gap, { from: [0, 1.5, 0], dur: drop, pieces }) + 0.35);
  });
  return Math.min(end, at + beat.dur);
});

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

registerChoreo('turn', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'turnStarted');
  if (!e) return at;
  const color = ctx.color(e.player);
  for (const p of restaurantsOf(ctx, e.player, true)) {
    const c = centre(p);
    ringPulse(tl, ctx, color, c.x, c.z, 1.45, at, Math.max(0.4, beat.dur));
  }
  return at;
});

/** Hemisphere light tint per stage: warm during Dinnertime, base otherwise. */
const lightBase = new WeakMap<Stage, { sky: THREE.Color; ground: THREE.Color; warm: boolean }>();
const WARM_SKY = new THREE.Color('#ffc98a');
const WARM_GROUND = new THREE.Color('#c08a5a');

registerChoreo('phase', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'phaseChanged');
  if (!e) return at;
  const hemi = ctx.stage.hemi;
  if (!hemi) return at; // stages without lighting (tests, minimal hosts)
  let st = lightBase.get(ctx.stage);
  if (!st) lightBase.set(ctx.stage, (st = { sky: hemi.color.clone(), ground: hemi.groundColor.clone(), warm: false }));
  const warm = e.to.kind === 'dinnertime';
  if (warm === st.warm) return at;
  const s = st;
  s.warm = warm;
  const sky0 = hemi.color.clone();
  const gr0 = hemi.groundColor.clone();
  const sky1 = warm ? s.sky.clone().lerp(WARM_SKY, 0.12) : s.sky;
  const gr1 = warm ? s.ground.clone().lerp(WARM_GROUND, 0.1) : s.ground;
  // A cross-fade is not "motion": reduced mode keeps it.
  tl.add({
    start: at,
    dur: Math.max(0.3, beat.dur),
    lane: 'tail',
    update: (k) => {
      hemi.color.copy(sky0).lerp(sky1, k);
      hemi.groundColor.copy(gr0).lerp(gr1, k);
    },
  });
  return at;
});

// ---------------------------------------------------------------------------
// Goods
// ---------------------------------------------------------------------------

registerChoreo('produce', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'foodProduced');
  if (!e) return at;
  const f = fit(beat);
  const rs = restaurantsOf(ctx, e.player);
  const land = at + 0.62 * f;
  tl.call(land, () => pulseRail('goods', e.player), 'tail');
  if (!rs.length) return land;
  ctx.follow(tl, at, rs.map((r) => r.id ?? ''));
  // Steam from every open kitchen's roof vent.
  rs.forEach((r, i) => {
    const vent = worldOf(r.obj, 'body', new THREE.Vector3(-0.05, 1.05, -0.5));
    puff(tl, ctx, 'steam', vent.x, vent.y, vent.z, at + i * 0.04, { dur: 0.5, scale: 1.1 });
  });
  const first = rs[0]!;
  const c = centre(first);
  if (e.uid === null) chip(tl, ctx, '☾ night shift', null, '#3b4a7a', c.x, 2.3, c.z, at, Math.max(0.8, beat.dur), { rise: 0.2, size: 0.3 });
  if (isReduced(ctx)) {
    chip(tl, ctx, `+${e.count}`, e.food as FoodId, ctx.color(e.player), c.x, 1.6, c.z, at, Math.max(0.6, beat.dur), { rise: 0 });
    return land;
  }
  // Tokens pop out of the roof in a short fountain and stack on it, then leave for the stock.
  const shown = Math.min(e.count, ctx.caps.flights);
  const roof = new THREE.Vector3(c.x + 0.35, 1.0, c.z + 0.35);
  for (let i = 0; i < shown; i++) {
    const t = buildToken({ inst: ctx.stage.inst }, e.food as FoodId);
    t.visible = false;
    transient(tl, ctx, t);
    const s = at + 0.08 + i * 0.06 * f;
    const ang = i * 2.2 + 0.5;
    const peakX = Math.cos(ang) * 0.4;
    const peakZ = Math.sin(ang) * 0.4;
    const stackY = roof.y + i * 0.14;
    const fly = 0.45 * f;
    tl.add({
      start: s,
      dur: fly,
      ease: ease.outCubic,
      update: (k, raw) => {
        t.visible = raw > 0;
        const u = k;
        t.position.set(c.x + peakX * Math.sin(u * Math.PI) + (roof.x - c.x) * u, 1.0 + Math.sin(u * Math.PI) * 0.9 + (stackY - 1.0) * u, c.z + peakZ * Math.sin(u * Math.PI) + (roof.z - c.z) * u);
        t.rotation.y = u * 5;
      },
    });
    // Tail: the stack lifts off towards the player's stock and shrinks away.
    tl.add({
      start: land + 0.2,
      dur: 0.35,
      ease: ease.inCubic,
      lane: 'tail',
      update: (k, raw) => {
        t.position.y = stackY + k * 1.2;
        t.scale.setScalar(Math.max(0.001, 1 - k));
        if (raw >= 1) t.visible = false;
      },
    });
  }
  if (e.count > shown) chip(tl, ctx, `×${e.count}`, e.food as FoodId, ctx.color(e.player), roof.x, roof.y + shown * 0.14 + 0.25, roof.z, land - 0.1, 0.6, { rise: 0.15, size: 0.3 });
  return land;
});

registerChoreo('discard', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'foodDiscarded');
  if (!e) return at;
  const f = fit(beat);
  const goods = (Object.entries(e.goods) as [FoodId, number][]).filter(([, n]) => (n ?? 0) > 0).map(([g]) => g);
  const rs = restaurantsOf(ctx, e.player);
  rs.forEach((r, i) => {
    const bin = worldOf(r.obj, 'body', new THREE.Vector3(-0.7, 0.3, -0.88));
    const t0 = at + i * 0.05;
    puff(tl, ctx, 'dust', bin.x, 0.25, bin.z, t0 + 0.35 * f, { scale: 0.8 });
    if (i > 0 || isReduced(ctx)) return;
    // One token per spoiled good drops into the bin and shrinks.
    goods.slice(0, ctx.caps.flights).forEach((g, j) => {
      const t = buildToken({ inst: ctx.stage.inst }, g);
      t.visible = false;
      transient(tl, ctx, t);
      tl.add({
        start: t0 + j * 0.06,
        dur: 0.4 * f,
        ease: ease.inCubic,
        update: (k, raw) => {
          t.visible = raw > 0 && raw < 1;
          t.position.set(bin.x + (1 - k) * 0.3, bin.y + (1 - k) * 1.1, bin.z);
          t.scale.setScalar(Math.max(0.001, 1 - k * 0.7));
        },
      });
    });
  });
  return at + Math.min(beat.dur, 0.8 * f);
});

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

registerChoreo('tips', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'tipsPaid');
  if (!e) return at;
  const f = fit(beat);
  const land = at + 0.35 * f;
  moneyAt(tl, e.player, e.amount, land);
  const color = ctx.color(e.player);
  restaurantsOf(ctx, e.player).forEach((r, i) => {
    const c = centre(r);
    if (i === 0) chip(tl, ctx, `+$${e.amount} tips`, null, color, c.x, 2.1, c.z, at, Math.max(0.6, beat.dur), { rise: 0.35, size: 0.32 });
    for (let j = 0; j < 3; j++) coin(tl, ctx, c.x, c.z, at + 0.05 + j * 0.05, 'burst', 0.5 * f, j + i);
  });
  return land;
});

registerChoreo('salary', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'salaryPaid');
  if (!e) return at;
  const f = fit(beat);
  const land = at + 0.6 * f;
  // The rail cash rolls down when the coins hit the ground.
  moneyAt(tl, e.player, -e.paid, land);
  tl.call(land, () => pulseRail('cash', e.player), 'tail');
  if (e.paid <= 0) return land;
  restaurantsOf(ctx, e.player).forEach((r, i) => {
    const c = centre(r);
    coin(tl, ctx, c.x + 0.5, c.z + 0.5, at + i * 0.08, 'drop', 0.6 * f, i);
    puff(tl, ctx, 'dust', c.x + 0.5, 0.05, c.z + 0.5, at + i * 0.08 + 0.55 * f, { scale: 0.6 });
  });
  if (isReduced(ctx)) {
    const r = restaurantsOf(ctx, e.player)[0];
    if (r) {
      const c = centre(r);
      chip(tl, ctx, `-$${e.paid}`, null, COLORS.danger, c.x, 2.1, c.z, at, Math.max(0.6, beat.dur));
    }
  }
  return land;
});

registerChoreo('milestone', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'milestoneClaimed');
  if (!e) return at;
  tl.call(at + 0.2, () => pulseRail('star', e.player), 'tail');
  restaurantsOf(ctx, e.player, true).forEach((r, i) => {
    const s = worldOf(r.obj, 'sign', new THREE.Vector3(0, 1.5, 0));
    sparks(tl, ctx, s.x, s.y, s.z, at + i * 0.06, 4, Math.max(0.5, beat.dur * 0.8));
  });
  return at + Math.min(beat.dur, 0.5);
});

registerChoreo('bankBroke', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'bankBroke');
  if (!e) return at;
  const dur = Math.max(0.6, beat.dur);
  // Every restaurant sign flickers once.
  for (const r of Object.values(ctx.view?.board.restaurants ?? {})) {
    const p = ctx.rec.live.get(`restaurant:${r.id}`);
    const sign = p?.obj.getObjectByName('sign');
    if (!sign) continue;
    if (isReduced(ctx)) continue;
    tl.add({
      start: at,
      dur: dur * 0.6,
      update: (_k, raw) => {
        sign.visible = raw >= 1 || !((raw > 0.15 && raw < 0.3) || (raw > 0.45 && raw < 0.52) || (raw > 0.7 && raw < 0.8));
      },
    });
  }
  return at + dur * 0.6;
});

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

registerChoreo('gameEnded', (beat, at, tl, ctx) => {
  const e = beatEvent(beat, 'gameEnded');
  if (!e) return at;
  const winner = e.ranking[0];
  if (!winner) return at;
  const color = ctx.color(winner);
  const rs = restaurantsOf(ctx, winner, true).filter((r) => ctx.view?.board.restaurants[r.id ?? '']?.status !== 'derelict');
  ctx.follow(tl, at, rs.map((r) => r.id ?? ''));
  const dur = Math.max(1.5, beat.dur);
  const bursts = ctx.caps.confetti >= 12 ? 3 : 2;
  rs.forEach((r, i) => {
    const s = worldOf(r.obj, 'sign', new THREE.Vector3(0, 1.6, 0));
    for (let b = 0; b < bursts; b++) confetti(tl, ctx, color, s.x, s.y, s.z, at + i * 0.1 + b * (dur / (bursts + 0.5)), 1.1, 2);
    sparks(tl, ctx, s.x, s.y, s.z, at + i * 0.1, 6, 0.9);
    ringPulse(tl, ctx, color, (r.rect.x0 + r.rect.x1) / 2, (r.rect.z0 + r.rect.z1) / 2, 1.6, at + i * 0.1, 0.8);
    // Sign glow: a slow pulse of the sign.
    const sign = r.obj.getObjectByName('sign');
    if (sign && !isReduced(ctx)) {
      const s0 = sign.scale.clone();
      tl.add({ start: at + i * 0.1, dur: 0.9, lane: 'tail', update: (_k, raw) => sign.scale.copy(s0).multiplyScalar(1 + Math.sin(raw * Math.PI) * 0.18) });
    }
  });
  return at + Math.min(dur, 1.2);
});
