/** Drink sources (1x1, printed on map tiles): brewery barrels, lemonade stand, soda vending kiosk. */
import * as THREE from 'three';
import type { DrinkId } from '@fcm/engine';
import { FOOD_COLORS } from '../../theme.js';
import { blob, solid, type MiniCtx } from './ctx.js';
import { P, Shape, ball, box, cyl, gable, lathe, miniGeo, shade } from './kit.js';

function barrel(s: Shape, x: number, z: number, y = 0.06, lying = false): void {
  const prof: [number, number][] = [
    [0.1, 0],
    [0.125, 0.06],
    [0.13, 0.13],
    [0.125, 0.2],
    [0.1, 0.26],
  ];
  const rot: [number, number, number] = lying ? [Math.PI / 2, 0.4, 0] : [0, 0, 0];
  const yy = lying ? y + 0.13 : y;
  s.add(lathe([[0, 0], ...prof, [0, 0.26]], 10), '#a8743f', { at: [x, yy, z + (lying ? -0.13 : 0)], rot });
  if (!lying) {
    s.add(cyl(0.128, 0.128, 0.02, 10), P.steelDark, { at: [x, y + 0.05, z], mat: 'metal' });
    s.add(cyl(0.128, 0.128, 0.02, 10), P.steelDark, { at: [x, y + 0.19, z], mat: 'metal' });
  }
}

function breweryShape(): Shape {
  const s = new Shape();
  s.add(box(0.88, 0.06, 0.88, 0.03), '#c9b48c', { jitter: 0 });
  s.add(box(0.7, 0.04, 0.56, 0.01), P.wood, { at: [0, 0.06, -0.06] });
  // Copper tank.
  s.add(cyl(0.17, 0.17, 0.5, 10), '#c98b4a', { at: [-0.18, 0.1, -0.12], mat: 'metal' });
  s.add(lathe([[0.18, 0], [0.15, 0.08], [0.06, 0.14], [0.03, 0.2]], 10), '#b07436', { at: [-0.18, 0.6, -0.12], mat: 'metal' });
  s.add(cyl(0.02, 0.02, 0.3, 5), P.steel, { at: [-0.18, 0.72, -0.12], rot: [0, 0, 1.3] });
  barrel(s, 0.2, -0.16, 0.1);
  barrel(s, 0.2, 0.18, 0.06, true);
  barrel(s, -0.15, 0.28, 0.06);
  // Foam mug sign.
  s.add(cyl(0.07, 0.07, 0.12, 8), FOOD_COLORS.beer, { at: [0.2, 0.36, -0.16] });
  s.add(ball(0.07, 0), P.white, { at: [0.2, 0.49, -0.16], scale: [1, 0.6, 1] });
  return s;
}

function lemonadeShape(): Shape {
  const s = new Shape();
  s.add(box(0.88, 0.06, 0.88, 0.03), '#c9b48c', { jitter: 0 });
  // Counter.
  s.add(box(0.62, 0.32, 0.3, 0.03), P.white, { at: [0, 0.06, 0.05] });
  for (let i = 0; i < 4; i++) s.add(box(0.1, 0.33, 0.31, 0.01), '#f2d130', { at: [-0.23 + i * 0.155, 0.055, 0.05], jitter: 0 });
  s.add(box(0.68, 0.04, 0.36, 0.015), P.wood, { at: [0, 0.38, 0.05] });
  // Posts + striped canopy.
  for (const x of [-0.3, 0.3]) s.add(cyl(0.02, 0.02, 0.5, 5), P.white, { at: [x, 0.42, -0.08] });
  s.add(gable(0.46, 0.14, 0.76), '#f2d130', { at: [0, 0.9, 0.0], rot: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 4; i++) s.add(box(0.08, 0.15, 0.48, 0.005), P.white, { at: [-0.27 + i * 0.18, 0.88, 0], jitter: 0 });
  // Jug and lemons.
  s.add(lathe([[0, 0], [0.07, 0], [0.08, 0.1], [0.05, 0.16], [0, 0.16]], 8), FOOD_COLORS.lemonade, { at: [-0.12, 0.42, 0.05], mat: 'glass' });
  for (const [x, z] of [
    [0.1, 0.02],
    [0.18, 0.1],
    [0.14, -0.04],
  ] as const)
    s.add(ball(0.045, 0), '#f2d130', { at: [x, 0.46, z], scale: [1.2, 1, 1] });
  return s;
}

function sodaShape(): Shape {
  const s = new Shape();
  s.add(box(0.88, 0.06, 0.88, 0.03), '#c9b48c', { jitter: 0 });
  // Small factory block with a giant can on top.
  s.add(box(0.6, 0.34, 0.5, 0.03), '#d9d2c3', { at: [0, 0.06, -0.08] });
  s.add(box(0.62, 0.05, 0.52, 0.02), shade(FOOD_COLORS.soft_drink, 0.1), { at: [0, 0.4, -0.08] });
  s.add(box(0.2, 0.22, 0.03, 0.01), P.windowDark, { at: [-0.14, 0.12, 0.18], mat: 'glass' });
  // Vending machine at the front.
  s.add(box(0.2, 0.36, 0.14, 0.02), '#b8352c', { at: [0.18, 0.06, 0.26] });
  s.add(box(0.12, 0.18, 0.02, 0.005), P.window, { at: [0.15, 0.2, 0.33], mat: 'glass' });
  // Giant can.
  s.add(cyl(0.13, 0.13, 0.36, 12), '#b8352c', { at: [0, 0.45, -0.08] });
  s.add(cyl(0.132, 0.132, 0.08, 12), P.white, { at: [0, 0.58, -0.08] });
  s.add(cyl(0.11, 0.13, 0.04, 12), P.steel, { at: [0, 0.81, -0.08], mat: 'metal' });
  // Chimney.
  s.add(cyl(0.05, 0.06, 0.4, 6), '#9a8f86', { at: [-0.22, 0.4, -0.24] });
  return s;
}

export function buildDrinkSource(ctx: MiniCtx, p: { drink: DrinkId }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 1.05, 1.05, true, 0.6);
  const geo =
    p.drink === 'beer'
      ? miniGeo('src:beer', breweryShape)
      : p.drink === 'lemonade'
        ? miniGeo('src:lemonade', lemonadeShape)
        : miniGeo('src:soft_drink', sodaShape);
  solid(ctx, g, geo);
  return g;
}
