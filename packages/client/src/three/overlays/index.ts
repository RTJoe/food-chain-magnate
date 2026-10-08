/**
 * Reusable board overlays (ux-plan WP2): range, reach and route ribbons, each in its own
 * sub-group of the stage overlay (Stage.overlays). Drawing a kind replaces what that kind showed.
 *
 *   drawRangeOverlay(data)                       road range by distance + starts + dimmed tiles
 *   drawReach(houseIds, good, full?, opts?)      rings + "+1 good" / "full" chips (+ cells / band)
 *   drawRouteRibbons(candidates, activeIdx, o?)  faint candidates, active ribbon with chevrons
 *   clearOverlays(kind?)                         one kind, or all
 */
import * as THREE from 'three';
import type { FoodId, HouseId } from '@fcm/engine';
import type { RangeOverlayData, ReachOverlayData, RouteRibbon } from '../../state/boardOverlays.js';
import type { Reconciler } from '../reconcile.js';
import type { Stage } from '../scene.js';
import { disposeOverlay } from './badges.js';
import { buildRange } from './ranges.js';
import { buildReach, type ReachTarget } from './reach.js';
import { buildRoutes } from './routes.js';

export type OverlayKind = 'range' | 'reach' | 'routes';

export interface ReachOptions {
  color?: string;
  cells?: ReachOverlayData['cells'];
  band?: ReachOverlayData['band'];
}

export class OverlayLayer {
  private ticks = new Map<OverlayKind, (dt: number, t: number) => boolean>();
  private frame = (dt: number, t: number) => {
    let moving = false;
    for (const f of this.ticks.values()) moving = f(dt, t) || moving;
    if (moving) this.stage.invalidateDecor();
  };

  constructor(
    private readonly stage: Stage,
    private readonly rec: Reconciler,
  ) {
    stage.onFrame.add(this.frame);
  }

  drawRangeOverlay(data: RangeOverlayData): void {
    const b = this.rec.board;
    this.clearOverlays('range');
    if (!b) return;
    this.mount('range', buildRange(b, data));
  }

  drawReach(houseIds: readonly HouseId[], good: FoodId, full: readonly HouseId[] = [], opts: ReachOptions = {}): void {
    const b = this.rec.board;
    this.clearOverlays('reach');
    if (!b) return;
    const layer = buildReach(b, { houseIds, good, full, ...opts }, (id) => this.houseTarget(id));
    this.mount('reach', layer.group);
    this.ticks.set('reach', (_dt, t) => layer.tick(t));
  }

  drawRouteRibbons(candidates: readonly RouteRibbon[], activeIdx: number, opts: { color?: string } = {}): void {
    const b = this.rec.board;
    this.clearOverlays('routes');
    if (!b || !candidates.length) return;
    const layer = buildRoutes(b, { candidates, active: activeIdx, color: opts.color });
    this.mount('routes', layer.group);
    this.ticks.set('routes', (dt) => layer.tick(dt));
  }

  clearOverlays(kind: OverlayKind | 'all' = 'all'): void {
    const kinds: OverlayKind[] = kind === 'all' ? ['range', 'reach', 'routes'] : [kind];
    for (const k of kinds) {
      const g = this.stage.overlays[k];
      for (const c of [...g.children]) {
        this.stage.untrackSized(c);
        disposeOverlay(c);
        c.removeFromParent();
      }
      this.ticks.delete(k);
    }
    this.stage.invalidate();
  }

  /** Index of the route ribbon under a ray (nearest first), or null. For hover / tap selection. */
  pickRoute(ray: THREE.Ray): number | null {
    const rc = new THREE.Raycaster(ray.origin, ray.direction);
    const meshes: THREE.Object3D[] = [];
    this.stage.overlays.routes.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && typeof o.userData.candidate === 'number') meshes.push(o);
    });
    const hit = rc.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.userData.candidate as number) : null;
  }

  dispose(): void {
    this.clearOverlays('all');
    this.stage.onFrame.delete(this.frame);
  }

  private mount(kind: OverlayKind, obj: THREE.Object3D): void {
    this.stage.overlays[kind].add(obj);
    this.stage.trackSized(obj);
    this.stage.invalidate();
  }

  private houseTarget(id: string): ReachTarget | null {
    const p = this.rec.live.get(`house:${id}`);
    if (!p) return null;
    const badge = p.obj.getObjectByName('badge');
    return { rect: p.rect, y: badge ? badge.position.y : p.height };
  }
}
