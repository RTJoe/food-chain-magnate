/**
 * Event animations (architecture §5.3, visual-style "Motion"). The scene already shows the final
 * state; these are cosmetic overlays timed from the event list: pieces pop in, marketing pulses
 * and drops demand tokens, sales hop goods from restaurant to house and puff coins.
 *
 * Phase feedback (ux-plan §2.3, WP5): each sale flashes the winning route and captions the house
 * ("Bo sells to house 5: $9 + 1 = $10"), houses that stay home pop their "no seller" chip, each
 * campaign run captions "#11 (Bo): burgers → houses 5, 12", flashes its reach (rings, "+1" and
 * "full" chips) and ticks a duration pip off with the count left. A closing caption sums the phase
 * up. Captions go to `phaseCaption` (state/feedback.ts); the overlay shows them.
 *
 * The whole batch is compressed to fit 1.5 s and never blocks input. `prefers-reduced-motion`
 * (or speed 0) skips straight to the final state (the closing caption still shows).
 */
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { FoodId, GameEvent, GameView, HouseId } from '@fcm/engine';
import { boardView } from '../state/boardBridge.js';
import { campaignSteps, dinnerSteps, showCaption } from '../state/feedback.js';
import { campaignReachIds } from '../state/guidance.js';
import { coinGeo, buildToken } from './minis/tokens.js';
import { releaseTree, type MiniCtx } from './minis/ctx.js';
import { PIP_STEP, pipGeo } from './minis/marketing.js';
import { FeedbackLayer, pipCount } from './overlays/feedback.js';
import { playerColor } from './layout.js';
import type { Reconciler } from './reconcile.js';
import type { Stage } from './scene.js';
import { ease } from './tween.js';

const BUDGET = 1.5;
const STEP = 0.32;
const GROUP = 'anim';
/** How long the closing caption stays (it never blocks input). */
const CAPTION_HOLD_MS = 3800;

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

type Job = (delay: number, dur: number) => void;

export class Animator {
  private ctx: MiniCtx;
  readonly feedback: FeedbackLayer;
  /** The view before the latest one (expired campaigns are only there). */
  private prevView: GameView | null = null;
  private curView: GameView | null = null;
  private stopView: () => void;

  constructor(
    private readonly stage: Stage,
    private readonly rec: Reconciler,
  ) {
    this.ctx = { inst: stage.inst };
    this.feedback = new FeedbackLayer(stage, rec);
    this.stopView = effect(() => {
      const v = boardView.value.view;
      if (v === this.curView) return;
      this.prevView = this.curView;
      this.curView = v;
    });
  }

  dispose(): void {
    this.stopView();
    this.feedback.dispose();
  }

  /** Finish everything now. */
  skip(): void {
    // Chained tweens start a tick later; finish twice so follow-ups land too.
    this.stage.tweens.finish(GROUP);
    queueMicrotask(() => this.stage.tweens.finish(GROUP));
  }

  /**
   * Animate one applied batch. `added` are reconciler keys that appeared; `prevDemand` the demand
   * stack sizes before the update.
   */
  play(events: readonly GameEvent[], added: readonly string[], prevDemand: Map<string, number>): void {
    const closing = this.closingCaption(events);
    if (reducedMotion() || this.stage.tweens.speed <= 0) {
      if (closing) showCaption(closing, CAPTION_HOLD_MS);
      return;
    }
    // Anything still running from the previous batch jumps to its end.
    this.stage.tweens.finish(GROUP);

    const jobs: Job[] = [];
    const popped = new Set<string>();
    const pop = (key: string) => {
      if (popped.has(key) || !added.includes(key)) return;
      popped.add(key);
      jobs.push((delay) => void this.rec.popIn(key, delay));
    };
    const dinner = new Map(dinnerSteps(events).map((s) => [s.houseId, s]));
    const runs = new Map(campaignSteps(events).map((s) => [s.campaignId, s]));

    for (const e of events) {
      switch (e.type) {
        case 'restaurantPlaced':
        case 'restaurantMoved':
          pop(`restaurant:${e.restaurantId}`);
          break;
        case 'houseBuilt':
          pop(`house:${e.houseId}`);
          pop(`garden:${e.houseId}`);
          break;
        case 'gardenAdded':
          pop(`garden:${e.houseId}`);
          break;
        case 'campaignPlaced':
          pop(`campaign:${e.campaign.id}`);
          break;
        case 'entityPlaced':
          pop(`entity:${e.entity.id}`);
          break;
        case 'campaignRan': {
          const run = runs.get(e.campaignId);
          jobs.push((delay, dur) => {
            this.pulse(`campaign:${e.campaignId}`, delay, dur);
            if (run) this.campaignRun(e.campaignId, run.drops, delay, dur);
          });
          break;
        }
        case 'demandPlaced':
          jobs.push((delay, dur) => this.dropDemand(e.houseId, e.tokens.length, prevDemand, delay, dur));
          break;
        case 'campaignTicked':
          jobs.push((delay, dur) => this.pipTick(e.campaignId, e.remaining, delay, dur));
          break;
        case 'sale': {
          const others = (dinner.get(e.houseId)?.offers ?? []).filter((o) => !o.won).map((o) => ({ player: o.player, score: o.score, canSupply: o.canSupply }));
          jobs.push((delay, dur) => {
            this.sale(e.restaurantId, e.houseId, e.lines, delay, dur);
            this.saleRoute(e.restaurantId, e.houseId, e.player, delay, dur);
            this.at(delay, () => showCaption({ kind: 'sale', houseId: e.houseId, player: e.player, unitPrice: e.unitPrice, distance: e.distance, total: e.total, others }));
          });
          break;
        }
        case 'houseStayedHome':
          jobs.push((delay, dur) => {
            this.stayedHome(e.houseId, delay, dur);
            this.at(delay, () => showCaption({ kind: 'stayedHome', houseId: e.houseId }));
          });
          break;
        case 'restaurantOpened':
        case 'driveInsOpened':
          for (const id of e.type === 'restaurantOpened' ? [e.restaurantId] : e.restaurantIds) jobs.push((delay, dur) => this.pulse(`restaurant:${id}`, delay, dur));
          break;
        default:
          break;
      }
    }
    // Pieces that appeared without a matching event (module pieces, snapshots mid-batch).
    for (const k of added) if (!popped.has(k) && !k.startsWith('demand:')) pop(k);
    if (!jobs.length) {
      if (closing) showCaption(closing, CAPTION_HOLD_MS);
      return;
    }
    const step = Math.min(STEP, BUDGET / (jobs.length + 1));
    const dur = Math.max(0.22, Math.min(0.4, step * 1.3));
    jobs.forEach((j, i) => j(i * step, dur));
    if (closing) this.at(jobs.length * step + dur * 0.5, () => showCaption(closing, CAPTION_HOLD_MS));
  }

  // ---------------------------------------------------------------------------

  /** The phase summary caption for a batch (Dinnertime / Marketing), or null. */
  private closingCaption(events: readonly GameEvent[]) {
    const steps = dinnerSteps(events);
    if (steps.length) {
      return { kind: 'done' as const, phase: 'dinnertime' as const, sales: steps.filter((s) => s.sale).length, stayedHome: steps.filter((s) => s.stayedHome && !s.sale).length, campaigns: 0 };
    }
    const runs = campaignSteps(events);
    if (runs.length) return { kind: 'done' as const, phase: 'marketing' as const, sales: 0, stayedHome: 0, campaigns: runs.length };
    return null;
  }

  /** Run `fn` once when `delay` has passed (finishing early runs it too). */
  private at(delay: number, fn: () => void): void {
    let done = false;
    void this.stage.tweens.add(
      0.01,
      (_k, raw) => {
        if (raw > 0 && !done) {
          done = true;
          fn();
        }
      },
      { delay, ease: ease.linear, group: GROUP },
    );
  }

  private pulse(key: string, delay: number, dur: number): void {
    const p = this.rec.live.get(key);
    if (!p) return;
    const o = p.obj;
    void this.stage.tweens.add(dur, (_k, raw) => o.scale.setScalar(1 + Math.sin(raw * Math.PI) * 0.14), { delay, ease: ease.linear, group: GROUP });
  }

  /** New tokens on top of a demand stack drop in from above. */
  private dropDemand(houseId: string, n: number, prevDemand: Map<string, number>, delay: number, dur: number): void {
    const key = `demand:${houseId}`;
    const p = this.rec.live.get(key);
    if (!p) return;
    const prev = prevDemand.get(key) ?? 0;
    const tokens = p.obj.children.filter((c) => c.name.startsWith('token:'));
    const fresh = tokens.filter((t) => Number(t.name.slice(6)) >= Math.min(prev, tokens.length - Math.min(n, tokens.length)));
    if (prev === 0) {
      const pl = p.obj.getObjectByName('plinth');
      if (pl) fresh.unshift(pl);
    }
    fresh.forEach((t, i) => {
      const y1 = t.position.y;
      t.visible = false;
      void this.stage.tweens.add(
        dur,
        (k) => {
          t.visible = true;
          t.position.y = y1 + (1 - k) * 1.6;
        },
        { delay: delay + i * 0.05, ease: ease.outBack, group: GROUP },
      );
    });
  }

  /** Goods hop from the restaurant to the house, then coins puff over the restaurant. */
  private sale(restaurantId: string, houseId: string, lines: readonly { good: string; count: number }[], delay: number, dur: number): void {
    const r = this.rec.live.get(`restaurant:${restaurantId}`);
    const h = this.rec.live.get(`house:${houseId}`);
    if (!r || !h) return;
    const from = new THREE.Vector3(r.obj.position.x, 1.2, r.obj.position.z);
    const to = new THREE.Vector3(h.obj.position.x, 1.5, h.obj.position.z);
    const goods = lines.flatMap((l) => Array.from({ length: Math.min(l.count, 5) }, () => l.good)).slice(0, 6);
    const hop = dur * 1.4;
    goods.forEach((good, i) => {
      const t = buildToken(this.ctx, good as Parameters<typeof buildToken>[1]);
      t.visible = false;
      this.stage.overlay.add(t);
      const arc = 1.2 + from.distanceTo(to) * 0.12;
      void this.stage.tweens
        .add(
          hop,
          (k) => {
            t.visible = true;
            t.position.lerpVectors(from, to, k);
            t.position.y += Math.sin(k * Math.PI) * arc;
            t.rotation.y = k * 4;
          },
          { delay: delay + i * 0.06, ease: ease.inOutCubic, group: GROUP },
        )
        .then(() => this.discard(t));
    });
    this.coins(r.obj.position, delay + hop * 0.6, dur);
  }

  /** The winning route fades in along the road, holds, and fades out. */
  private saleRoute(restaurantId: string, houseId: HouseId, player: string, delay: number, dur: number): void {
    const g = this.feedback.saleRoute(restaurantId, houseId, player);
    if (!g) return;
    g.visible = false;
    const mats: { m: THREE.Material & { opacity: number }; base: number }[] = [];
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
      if (m && !Array.isArray(m)) mats.push({ m, base: m.opacity });
    });
    const remove = this.feedback.mountTransient(g);
    void this.stage.tweens
      .add(
        dur * 2.4,
        (_k, raw) => {
          g.visible = raw > 0 && raw < 1;
          const a = raw < 0.2 ? raw / 0.2 : raw > 0.7 ? (1 - raw) / 0.3 : 1;
          for (const x of mats) {
            x.m.transparent = true;
            x.m.opacity = x.base * a;
          }
        },
        { delay, ease: ease.linear, group: GROUP },
      )
      .then(remove);
  }

  /** The persistent "no seller" chip pops in at its turn. */
  private stayedHome(houseId: HouseId, delay: number, dur: number): void {
    this.pulse(`house:${houseId}`, delay, dur);
    let chip: THREE.Object3D | null = null;
    void this.stage.tweens.add(
      dur,
      (k, raw) => {
        if (raw <= 0) return;
        chip ??= this.feedback.stayedHomeChip(houseId);
        chip?.scale.setScalar(Math.max(0.001, k));
      },
      { delay, ease: ease.outBack, group: GROUP },
    );
  }

  /** Campaign run: caption + reach flash (houses that got demand, "full" on the ones that took nothing). */
  private campaignRun(campaignId: string, drops: readonly { houseId: HouseId; goods: FoodId[] }[], delay: number, dur: number): void {
    const { me } = boardView.peek();
    const view = this.curView ?? boardView.peek().view;
    const camp = this.prevView?.board.campaigns[campaignId] ?? view?.board.campaigns[campaignId];
    const got = drops.map((d) => d.houseId);
    const reach = camp ? campaignReachIds(this.prevView ?? view!, me, campaignId) : [];
    const full = reach.filter((h) => !got.includes(h));
    const good = (drops[0]?.goods[0] ?? camp?.goods[0] ?? 'burger') as FoodId;
    const owner = camp?.owner ?? null;
    this.at(delay, () =>
      showCaption({ kind: 'campaign', campaignId, number: camp?.number ?? null, owner, goods: camp?.goods ?? (drops[0] ? [good] : []), houses: got, full }),
    );
    const layer = this.feedback.reachFlash(got, good, full, view && owner ? playerColor(view, owner) : '#8f8b88');
    if (!layer) return;
    const g = layer.group;
    g.visible = false;
    const remove = this.feedback.mountTransient(g);
    void this.stage.tweens
      .add(
        dur * 2.6,
        (_k, raw) => {
          g.visible = raw > 0 && raw < 1;
          layer.tick(performance.now() / 1000);
        },
        { delay, ease: ease.linear, group: GROUP },
      )
      .then(remove);
  }

  /** A duration pip lifts off the campaign's stack and fades, with the count left. */
  private pipTick(campaignId: string, remaining: number, delay: number, dur: number): void {
    const view = this.curView;
    const camp = view?.board.campaigns[campaignId] ?? this.prevView?.board.campaigns[campaignId];
    if (!camp || camp.eternal) return;
    const color = view ? playerColor(view, camp.owner) : '#8f8b88';
    const piece = this.rec.live.get(`campaign:${campaignId}`);
    const pips = piece?.obj.getObjectByName('pips');
    const at = new THREE.Vector3();
    if (pips) {
      piece!.obj.updateMatrixWorld(true);
      pips.getWorldPosition(at);
    } else if (piece) {
      at.set((piece.rect.x0 + piece.rect.x1) / 2, 0.1, (piece.rect.z0 + piece.rect.z1) / 2);
    } else return;
    const y0 = at.y + Math.min(remaining, 6) * PIP_STEP;
    const pip = new THREE.Group();
    pip.add(this.stage.inst.proxy(pipGeo(color), { castShadow: false }));
    pip.visible = false;
    this.stage.overlay.add(pip);
    const count = pipCount(remaining, color);
    count.visible = false;
    const removeCount = this.feedback.mountTransient(count);
    const T = dur * 2.4;
    void this.stage.tweens
      .add(
        T,
        (k, raw) => {
          const on = raw > 0 && raw < 1;
          pip.visible = on && k < 0.85;
          pip.position.set(at.x + k * 0.25, y0 + k * 0.9, at.z);
          pip.rotation.z = k * 2.2;
          pip.scale.setScalar(Math.max(0.001, 1 - k * 0.8));
          count.visible = on;
          count.position.set(at.x, y0 + 0.5 + k * 0.6, at.z);
          count.scale.setScalar(Math.max(0.001, raw < 0.15 ? raw / 0.15 : raw > 0.8 ? (1 - raw) / 0.2 : 1));
        },
        { delay: delay + dur * 0.4, ease: ease.outCubic, group: GROUP },
      )
      .then(() => {
        this.discard(pip);
        removeCount();
      });
  }

  private coins(at: THREE.Vector3, delay: number, dur: number): void {
    const geo = coinGeo();
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      const proxy = this.stage.inst.proxy(geo, { castShadow: false });
      c.add(proxy);
      c.visible = false;
      this.stage.overlay.add(c);
      const ang = (i / 5) * Math.PI * 2;
      const dx = Math.cos(ang) * 0.5;
      const dz = Math.sin(ang) * 0.5;
      void this.stage.tweens
        .add(
          dur * 1.6,
          (k) => {
            c.visible = k < 0.98;
            c.position.set(at.x + dx * k, 1.6 + k * 0.9 - k * k * 0.6, at.z + dz * k);
            c.rotation.x = k * 6;
            c.scale.setScalar(1 - k * 0.6);
          },
          { delay: delay + i * 0.03, ease: ease.outCubic, group: GROUP },
        )
        .then(() => this.discard(c));
    }
  }

  private discard(o: THREE.Object3D): void {
    o.removeFromParent();
    releaseTree(o);
    this.stage.invalidate();
  }
}
