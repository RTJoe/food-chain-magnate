/**
 * Goods tokens: one chunky shape per good (docs/visual-style.md "Demand tokens"), all on a common
 * base disc so they stack. Used for demand stacks above houses and for flying goods in animations.
 */
import * as THREE from 'three';
import type { DemandToken, FoodId } from '@fcm/engine';
import { COLORS, FOOD_COLORS } from '../../theme.js';
import { makeBadge } from '../labels.js';
import { solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cyl, extrude, lathe, miniGeo, puck, shade } from './kit.js';

export const TOKEN_H = 0.2;
export const MAX_STACK = 5;

function wedge(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.2);
  s.lineTo(-0.16, -0.14);
  s.quadraticCurveTo(0, -0.2, 0.16, -0.14);
  s.closePath();
  return s;
}

function tokenShape(food: FoodId): Shape {
  const s = new Shape();
  const c = FOOD_COLORS[food];
  // Shared base disc in the good's colour, white rim so stacks read as separate tokens.
  s.add(puck(0.17, 0.035, 12, 0.012), P.white, { jitter: 0 });
  s.add(puck(0.155, 0.04, 12, 0.012), c, { at: [0, 0.004, 0], jitter: 0 });
  switch (food) {
    case 'burger':
      s.add(puck(0.13, 0.03, 10, 0.012), '#e09a45', { at: [0, 0.04, 0] });
      s.add(puck(0.135, 0.03, 10, 0.01), FOOD_COLORS.burger, { at: [0, 0.07, 0] });
      s.add(puck(0.14, 0.012, 10, 0.004), '#6fbf4a', { at: [0, 0.1, 0] });
      s.add(lathe([[0.13, 0], [0.13, 0.02], [0.1, 0.06], [0.05, 0.075], [0, 0.08]], 10), '#e09a45', { at: [0, 0.11, 0] });
      break;
    case 'pizza':
      s.add(extrude('wedge', wedge, 0.04, 0.01), '#f7c948', { at: [0, 0.06, 0], rot: [-Math.PI / 2, 0, 0] });
      s.add(box(0.3, 0.05, 0.06, 0.02), '#d98a3a', { at: [0, 0.04, 0.15], rot: [0, 0, 0] });
      for (const [x, z] of [
        [-0.04, 0.05],
        [0.04, -0.03],
        [0, 0.1],
      ] as const)
        s.add(cyl(0.025, 0.025, 0.012, 8), '#d2412b', { at: [x, 0.09, z] });
      break;
    case 'beer':
      s.add(cyl(0.08, 0.075, 0.14, 8), FOOD_COLORS.beer, { at: [0, 0.04, 0], mat: 'glass' });
      s.add(lathe([[0.085, 0], [0.09, 0.02], [0.06, 0.05], [0, 0.055]], 8), P.white, { at: [0, 0.17, 0] });
      s.add(box(0.05, 0.08, 0.02, 0.008), shade(FOOD_COLORS.beer, -0.2), { at: [0.1, 0.075, 0] });
      break;
    case 'lemonade':
      s.add(cyl(0.08, 0.06, 0.15, 8), FOOD_COLORS.lemonade, { at: [0, 0.04, 0], mat: 'glass' });
      s.add(cyl(0.012, 0.012, 0.16, 4), '#e25b8b', { at: [0.03, 0.12, 0], rot: [0, 0, -0.3] });
      s.add(cyl(0.05, 0.05, 0.015, 8), '#f2d130', { at: [-0.08, 0.17, 0], rot: [Math.PI / 2, 0, 0.2] });
      break;
    case 'soft_drink':
      s.add(cyl(0.065, 0.065, 0.16, 10), '#b8352c', { at: [0, 0.04, 0] });
      s.add(cyl(0.067, 0.067, 0.035, 10), P.white, { at: [0, 0.1, 0] });
      s.add(cyl(0.055, 0.065, 0.02, 10), P.steel, { at: [0, 0.2, 0], mat: 'metal' });
      break;
    case 'coffee':
      s.add(lathe([[0, 0], [0.06, 0], [0.085, 0.11], [0.08, 0.115], [0, 0.115]], 10), P.white, { at: [0, 0.045, 0] });
      s.add(cyl(0.078, 0.078, 0.01, 10), FOOD_COLORS.coffee, { at: [0, 0.15, 0] });
      s.add(box(0.04, 0.06, 0.02, 0.008), P.white, { at: [0.09, 0.08, 0] });
      break;
    case 'kimchi':
      s.add(lathe([[0, 0], [0.08, 0], [0.095, 0.04], [0.09, 0.12], [0.06, 0.135], [0, 0.135]], 10), FOOD_COLORS.kimchi, { at: [0, 0.04, 0], mat: 'glass' });
      s.add(puck(0.07, 0.04, 10, 0.01), '#4a7c4f', { at: [0, 0.17, 0] });
      break;
    case 'sushi':
      s.add(cyl(0.09, 0.09, 0.11, 10), '#26323a', { at: [0, 0.04, 0] });
      s.add(cyl(0.07, 0.07, 0.115, 10), P.white, { at: [0, 0.04, 0] });
      s.add(cyl(0.035, 0.035, 0.12, 8), FOOD_COLORS.sushi, { at: [0, 0.04, 0] });
      break;
    case 'noodles':
      s.add(lathe([[0, 0], [0.06, 0], [0.12, 0.08], [0.125, 0.1], [0, 0.1]], 10), '#e0e7ef', { at: [0, 0.04, 0] });
      s.add(cyl(0.11, 0.11, 0.01, 10), FOOD_COLORS.noodles, { at: [0, 0.13, 0] });
      s.add(cyl(0.008, 0.008, 0.22, 4), P.wood, { at: [0.02, 0.12, 0.02], rot: [0.3, 0, -0.9] });
      s.add(cyl(0.008, 0.008, 0.22, 4), P.wood, { at: [0.02, 0.12, -0.02], rot: [0.2, 0, -0.95] });
      break;
  }
  return s;
}

export function tokenGeo(food: FoodId): THREE.BufferGeometry {
  return miniGeo(`token:${food}`, () => tokenShape(food));
}

export function buildToken(ctx: MiniCtx, food: FoodId): THREE.Group {
  const g = new THREE.Group();
  solid(ctx, g, tokenGeo(food), { castShadow: true });
  return g;
}

/**
 * Demand stack floating above a house: up to MAX_STACK tokens, then a "×N" badge. Each token is
 * its own child (name `token:i`) so animations can pop or fly single tokens.
 */
export function buildDemandStack(ctx: MiniCtx, demand: DemandToken[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'demand';
  const n = demand.length;
  const shown = Math.min(n, MAX_STACK);
  // Plinth disc so the stack reads as one floating piece.
  if (n > 0) {
    const plinth = new THREE.Group();
    plinth.name = 'plinth';
    g.add(plinth);
    solid(ctx, plinth, miniGeo('stackPlinth', () => new Shape().add(puck(0.2, 0.03, 14, 0.01), shade(COLORS.ink, 0.15), { jitter: 0 })), { castShadow: true });
  }
  for (let i = 0; i < shown; i++) {
    const t = buildToken(ctx, demand[i]!.good);
    t.name = `token:${i}`;
    t.position.y = 0.03 + i * TOKEN_H;
    t.rotation.y = (i * 0.9) % (Math.PI * 2);
    g.add(t);
  }
  if (n > MAX_STACK) {
    const b = makeBadge(`×${n}`, { bg: COLORS.ink, fg: '#fffaf0', ring: '#fffaf0', pill: true }, 0.3);
    b.position.set(0.32, 0.03 + shown * TOKEN_H, 0);
    b.name = 'count';
    g.add(b);
  }
  g.userData.count = n;
  return g;
}

export function demandKey(demand: DemandToken[]): string {
  return demand.map((d) => d.good).join(',');
}

/** Little cash coin used by sale / salary animations. */
export function coinGeo(): THREE.BufferGeometry {
  return miniGeo('coin', () => {
    const s = new Shape();
    s.add(puck(0.13, 0.04, 12, 0.012), '#e8b730', { mat: 'metal', jitter: 0 });
    s.add(puck(0.08, 0.045, 12, 0.008), '#f8d24a', { mat: 'metal', jitter: 0 });
    return s;
  });
}

/** Ball for generic effects. */
export function sparkGeo(): THREE.BufferGeometry {
  return miniGeo('spark', () => new Shape().add(ball(0.06, 0), '#fff3a8', { mat: 'glow', jitter: 0 }));
}
