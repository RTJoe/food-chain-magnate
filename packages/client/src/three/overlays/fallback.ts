/**
 * Board geometry for route starts (restaurant corners, coffee shops), used by the route animation
 * (three/anim/routes.ts). Range fields and campaign reach come from the engine (`rangeOverlay`,
 * `campaignReach`).
 */
import type { Board, Cell, Corner, RouteStart } from '@fcm/engine';
import { DELTA, DIRS } from '../coords.js';

/** Corner square of a 2x2 footprint at (x, y). */
export function cornerCell(x: number, y: number, c: Corner): Cell {
  return { x: x + (c === 'NE' || c === 'SE' ? 1 : 0), y: y + (c === 'SW' || c === 'SE' ? 1 : 0) };
}

/** The two squares outside a 2x2 footprint touching corner `c`. */
export function entranceOutside(x: number, y: number, c: Corner): Cell[] {
  const cc = cornerCell(x, y, c);
  const dx = c === 'NE' || c === 'SE' ? 1 : -1;
  const dy = c === 'SW' || c === 'SE' ? 1 : -1;
  return [
    { x: cc.x + dx, y: cc.y },
    { x: cc.x, y: cc.y + dy },
  ];
}

/** The square a route start sits on (restaurant corner square / coffee shop square). */
export function startOrigin(b: Board, s: RouteStart): Cell | null {
  if (s.kind === 'restaurant') {
    const r = b.restaurants[s.restaurantId];
    return r ? cornerCell(r.x, r.y, s.corner) : null;
  }
  const e = b.entities[s.entityId];
  return e && e.kind === 'coffeeShop' ? { x: e.x, y: e.y } : null;
}

const usable = (b: Board, c: Cell) => {
  const r = b.cells[c.y]?.[c.x]?.road;
  return r && !r.underConstruction ? r : null;
};

/** Road squares a route from `s` may begin on. */
export function startRoads(b: Board, s: RouteStart): Cell[] {
  let cand: Cell[] = [];
  if (s.kind === 'restaurant') {
    const r = b.restaurants[s.restaurantId];
    if (r) cand = entranceOutside(r.x, r.y, s.corner);
  } else {
    const o = startOrigin(b, s);
    if (o) cand = DIRS.map((d) => ({ x: o.x + DELTA[d][0], y: o.y + DELTA[d][1] }));
  }
  return cand.filter((c) => usable(b, c));
}
