/**
 * Builds the `ChoreoCtx` a batch's choreographies share (animation-plan §4.1, §4.2): actors from the
 * pool released with the timeline, transient overlay objects, captions, and the masking ghosts
 * for demand stacks consumed by a beat.
 */
import * as THREE from 'three';
import type { GameView, House, HouseId, PlayerId } from '@fcm/engine';
import { houseBoardInfo } from '../../state/boardOverlays.js';
import { showCaption } from '../../state/feedback.js';
import { followAction, followFocus } from '../../state/interaction.js';
import { APARTMENT_BADGE_Y, BADGE_SIZE, HOUSE_BADGE_Y, RURAL_BADGE_Y } from '../minis/buildings.js';
import { releaseTree } from '../minis/ctx.js';
import { buildDemandStack } from '../minis/tokens.js';
import type { FeedbackLayer } from '../overlays/feedback.js';
import { playerColor } from '../layout.js';
import { houseCapacity, type Reconciler } from '../reconcile.js';
import type { Stage } from '../scene.js';
import { ease } from '../tween.js';
import type { ChoreoCtx, GhostStack } from './choreo.js';
import type { Plan } from './compile.js';
import type { ActorPool } from './pool.js';
import { createRouteLookup } from './routes.js';
import type { Timeline } from './timeline.js';

const STACK_Y: Record<House['kind'], number> = { printed: HOUSE_BADGE_Y, placed: HOUSE_BADGE_Y, apartment: APARTMENT_BADGE_Y, rural: RURAL_BADGE_Y };
const BADGE_H: Record<House['kind'], number> = { printed: BADGE_SIZE.house, placed: BADGE_SIZE.house, apartment: BADGE_SIZE.apartment, rural: BADGE_SIZE.rural };

const CAPS: Record<ChoreoCtx['tier'], ChoreoCtx['caps']> = {
  high: { vehicles: 4, confetti: 12, flights: 6, shadows: true },
  medium: { vehicles: 3, confetti: 8, flights: 4, shadows: true },
  low: { vehicles: 2, confetti: 0, flights: 3, shadows: false },
};

/** Phases whose steps the follow camera may glide to. */
const FOLLOW_PHASES = new Set<string>(['dinnertime', 'marketing', 'setup', 'gameOver']);

/** How long a caption stays once shown (it never blocks input). */
const CAPTION_HOLD_MS = 3800;

export interface ChoreoDeps {
  stage: Stage;
  rec: Reconciler;
  feedback: FeedbackLayer;
  pool: ActorPool;
  view: GameView | null;
  prevView: GameView | null;
  me: PlayerId | null;
  plan: Plan;
  added: readonly string[];
  removed: readonly string[];
  prevDemand: ReadonlyMap<string, number>;
}

export function createChoreoCtx(d: ChoreoDeps): ChoreoCtx {
  const { stage, rec, feedback, pool } = d;
  const ctx: ChoreoCtx = {
    stage,
    rec,
    feedback,
    pool,
    view: d.view,
    prevView: d.prevView,
    me: d.me,
    mode: d.plan.mode,
    tier: stage.tier,
    plan: d.plan,
    added: new Set(d.added),
    removed: new Set(d.removed),
    prevDemand: d.prevDemand,
    paths: createRouteLookup(() => d.view?.board ?? rec.board),
    caps: CAPS[stage.tier],
    color: (player) => (d.view && player ? playerColor(d.view, player) : '#8f8b88'),
    caption(tl, at, c) {
      tl.call(at, () => showCaption(c, CAPTION_HOLD_MS));
    },
    follow(tl, at, ids) {
      // Follow the action (§1.6): automatic phases only, never a player's own working turn. The
      // camera skips it while the player has touched the camera recently.
      if (!ids.length || !FOLLOW_PHASES.has(d.plan.phase ?? '')) return;
      tl.call(
        at,
        () => {
          if (!followAction.peek()) return;
          const ps = ids.flatMap((id) => rec.byId(id));
          if (!ps.length) return;
          let x0 = Infinity;
          let z0 = Infinity;
          let x1 = -Infinity;
          let z1 = -Infinity;
          for (const p of ps) {
            x0 = Math.min(x0, p.rect.x0);
            z0 = Math.min(z0, p.rect.z0);
            x1 = Math.max(x1, p.rect.x1);
            z1 = Math.max(z1, p.rect.z1);
          }
          followFocus.value = { x0, z0, x1, z1, n: (followFocus.peek()?.n ?? 0) + 1 };
        },
        'tail',
      );
    },
    actor(tl, kind, color = null, variant = null) {
      const a = pool.get(kind, color, variant);
      a.visible = false;
      tl.own(() => pool.release(a));
      return a;
    },
    mount(tl, o) {
      const remove = feedback.mountTransient(o);
      tl.own(remove);
    },
    ghostDemand(tl, houseId) {
      return ghostDemand(ctx, tl, houseId);
    },
  };
  return ctx;
}

/** The demand stack a house had before the batch, drawn where the reconciler draws stacks. */
function ghostDemand(ctx: ChoreoCtx, tl: Timeline, houseId: HouseId): GhostStack | null {
  const h = ctx.prevView?.board.houses[houseId];
  const piece = ctx.rec.live.get(`house:${houseId}`);
  if (!h || !h.demand.length || !piece) return null;
  // The real stack is still there (part of it sold): no ghost stack, but its roof plaque keeps
  // the pre-batch counts until the beat lands (reconciler pendingPlaque).
  if (ctx.rec.live.has(`demand:${houseId}`)) {
    const release = ctx.rec.holdPlaque(houseId, h.demand);
    tl.own(release);
    const empty = new THREE.Group();
    return { obj: empty, popAt: (at: number) => void tl.call(at, release) };
  }
  const obj = buildDemandStack({ inst: ctx.stage.inst }, [...h.demand], { capacity: houseCapacity(h, houseBoardInfo.peek()[houseId]), badgeH: BADGE_H[h.kind] });
  obj.name = `ghost:demand:${houseId}`;
  // Pivot at the stack anchor so the pop shrinks in place.
  const y0 = STACK_Y[h.kind];
  const wrap = new THREE.Group();
  wrap.position.set(piece.obj.position.x, y0, piece.obj.position.z);
  wrap.add(obj);
  ctx.mount(tl, wrap);
  tl.own(() => releaseTree(wrap));
  return {
    obj: wrap,
    popAt(at: number) {
      if (ctx.mode === 'reduced') {
        tl.call(at, () => void (wrap.visible = false));
        return;
      }
      tl.add({
        start: at,
        dur: 0.22,
        ease: ease.inCubic,
        update: (k, raw) => {
          wrap.scale.setScalar(Math.max(0.001, 1 - k));
          wrap.position.y = y0 + k * 0.25;
          if (raw >= 1) wrap.visible = false;
        },
      });
    },
  };
}
