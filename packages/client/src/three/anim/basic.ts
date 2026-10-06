/**
 * WP-A defaults: the old `animate.ts` behaviour ported onto the timeline. WP-C / WP-D modules
 * registered after this one replace these per beat kind (dinnertime, drinks and marketing live in
 * choreos/dinner.ts, drinks.ts, marketing.ts).
 *
 * - Placements (restaurant, house, garden, campaign, entity, loose pieces): pop in at their beat.
 * - Opens / drive-ins: pulse.
 * Reduced mode: no pops; pieces appear at their beat.
 */
import { ease } from '../tween.js';
import { registerChoreo, type ChoreoCtx } from './choreo.js';
import type { Timeline } from './timeline.js';

const POP = 0.38;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
