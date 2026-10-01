/**
 * Event animations (architecture §5.3, visual-style "Motion"). The scene already shows the final
 * state; these are cosmetic overlays timed from the event list: pieces pop in, marketing pulses
 * and drops demand tokens, sales hop goods from restaurant to house and puff coins.
 *
 * The whole batch is compressed to fit 1.5 s and never blocks input. `prefers-reduced-motion`
 * (or speed 0) skips straight to the final state.
 */
import * as THREE from 'three';
import type { GameEvent } from '@fcm/engine';
import { coinGeo, buildToken } from './minis/tokens.js';
import { releaseTree, type MiniCtx } from './minis/ctx.js';
import type { Reconciler } from './reconcile.js';
import type { Stage } from './scene.js';
import { ease } from './tween.js';

const BUDGET = 1.5;
const STEP = 0.32;
const GROUP = 'anim';

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

type Job = (delay: number, dur: number) => void;

export class Animator {
  private ctx: MiniCtx;

  constructor(
    private readonly stage: Stage,
    private readonly rec: Reconciler,
  ) {
    this.ctx = { inst: stage.inst };
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
    if (reducedMotion() || this.stage.tweens.speed <= 0) return;
    // Anything still running from the previous batch jumps to its end.
    this.stage.tweens.finish(GROUP);

    const jobs: Job[] = [];
    const popped = new Set<string>();
    const pop = (key: string) => {
      if (popped.has(key) || !added.includes(key)) return;
      popped.add(key);
      jobs.push((delay) => void this.rec.popIn(key, delay));
    };

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
        case 'campaignRan':
          jobs.push((delay, dur) => this.pulse(`campaign:${e.campaignId}`, delay, dur));
          break;
        case 'demandPlaced':
          jobs.push((delay, dur) => this.dropDemand(e.houseId, e.tokens.length, prevDemand, delay, dur));
          break;
        case 'sale':
          jobs.push((delay, dur) => this.sale(e.restaurantId, e.houseId, e.lines, delay, dur));
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
    if (!jobs.length) return;
    const step = Math.min(STEP, BUDGET / (jobs.length + 1));
    const dur = Math.max(0.22, Math.min(0.4, step * 1.3));
    jobs.forEach((j, i) => j(i * step, dur));
  }

  // ---------------------------------------------------------------------------

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
