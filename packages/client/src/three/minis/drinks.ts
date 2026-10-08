/**
 * Drink sources (1x1, printed on map tiles) as Special Edition green plastic minis (docs/art-bible.md
 * §6.5): an upright beer barrel on a crate with a ladder, a lemonade crate stack with a sign post, a soda
 * vending machine with bottle crates. Each reads by silhouette alone.
 */
import * as THREE from 'three';
import type { DrinkId } from '@fcm/engine';
import { PLASTIC, plasticPen, type Pen } from './buildings.js';
import { blob, solid, type MiniCtx } from './ctx.js';
import { Shape, ball, box, cyl, lathe, miniGeo } from './kit.js';

const PLATE = 0.06;
const RECESS = -0.1;

function plate(pen: Pen): void {
  pen(box(0.86, PLATE, 0.86, 0.02), -0.02, { jitter: 0 });
}

/**
 * Upright barrel on a slatted crate, as the SE beer supplier: bulged staves with two hoops and a
 * ringed lid, a tap, a small crate on the plate in front and a short ladder against the crate.
 */
function beerShape(): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.drink);
  plate(pen);
  // Crate the barrel stands on, slat grooves on the front.
  const ch = 0.22;
  const cz = -0.06;
  pen(box(0.58, ch, 0.56, 0.012), 0, { at: [0, PLATE, cz] });
  for (const x of [-0.12, 0.12]) pen(box(0.025, ch - 0.06, 0.01, 0), RECESS, { at: [x, PLATE + 0.03, cz + 0.281] });
  // Barrel: bulged staves, two hoops, a lid with a raised ring.
  const by = PLATE + ch;
  const bz = cz - 0.02;
  pen(
    lathe(
      [
        [0, 0],
        [0.19, 0],
        [0.225, 0.09],
        [0.24, 0.23],
        [0.225, 0.37],
        [0.19, 0.46],
        [0, 0.46],
      ],
      8,
    ),
    0.02,
    { at: [0, by, bz], rot: [0, Math.PI / 8, 0] },
  );
  for (const y of [0.07, 0.355]) pen(cyl(0.236, 0.236, 0.035, 8), -0.06, { at: [0, by + y, bz], rot: [0, Math.PI / 8, 0] });
  pen(cyl(0.13, 0.13, 0.014, 8), 0.06, { at: [0, by + 0.46, bz] });
  // Tap on the barrel front.
  pen(box(0.04, 0.04, 0.07, 0), 0.04, { at: [0.0, by + 0.1, bz + 0.25] });
  pen(box(0.03, 0.06, 0.03, 0), 0.04, { at: [0.0, by + 0.05, bz + 0.27] });
  // Small crate on the plate in front, right.
  pen(box(0.26, 0.13, 0.17, 0), -0.02, { at: [0.22, PLATE, 0.32] });
  pen(box(0.27, 0.02, 0.18, 0), RECESS, { at: [0.22, PLATE + 0.06, 0.32] });
  // Short ladder leaning on the crate front, left.
  const ladder = new Shape();
  const lp = plasticPen(ladder, PLASTIC.drink);
  for (const x of [-0.07, 0.07]) lp(box(0.03, 0.34, 0.03, 0), 0, { at: [x, 0, 0] });
  for (let i = 0; i < 2; i++) lp(box(0.15, 0.022, 0.022, 0), 0.04, { at: [0, 0.1 + i * 0.12, 0] });
  s.addShape(ladder, { at: [-0.2, PLATE, 0.34], rot: [-0.35, 0, 0] });
  return s;
}

/** Two stacked crates heaped with lemons, and a sign post. */
function lemonadeShape(): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.drink);
  plate(pen);
  const x0 = -0.08;
  for (let i = 0; i < 2; i++) {
    const y = PLATE + i * 0.2;
    pen(box(0.5, 0.2, 0.35, 0.015), 0, { at: [x0, y, 0.02] });
    // Slat grooves and a hand hole on the front.
    pen(box(0.46, 0.02, 0.36, 0), RECESS, { at: [x0, y + 0.09, 0.02] });
    pen(box(0.12, 0.04, 0.36, 0), RECESS - 0.05, { at: [x0, y + 0.14, 0.02] });
  }
  // Lemons heaped on top.
  const lemons: [number, number, number][] = [
    [-0.26, 0, -0.08],
    [-0.08, 0, -0.1],
    [0.1, 0, -0.06],
    [-0.24, 0, 0.06],
    [-0.06, 0, 0.08],
    [-0.18, 1, -0.01],
    [-0.06, 1, 0.0],
    [0.04, 1, 0.02],
    [-0.12, 2, 0.0],
  ];
  for (const [x, l, z] of lemons) pen(ball(0.065, 0), 0.04, { at: [x0 + 0.08 + x, PLATE + 0.44 + l * 0.08, 0.02 + z], scale: [1.25, 0.95, 1] });
  // Sign post (the board stands above the crates for a clear silhouette).
  pen(box(0.04, 0.62, 0.04, 0), RECESS, { at: [0.3, PLATE, 0.16] });
  pen(box(0.26, 0.15, 0.03, 0.01), 0.02, { at: [0.3, PLATE + 0.52, 0.19] });
  pen(box(0.2, 0.025, 0.02, 0), 0.1, { at: [0.3, PLATE + 0.585, 0.21] });
  return s;
}

/** Vending machine with a recessed front panel and coin slot, two bottle crates beside it. */
function sodaShape(): Shape {
  const s = new Shape();
  const pen = plasticPen(s, PLASTIC.drink);
  plate(pen);
  const mx = -0.12;
  const mz = -0.06;
  pen(box(0.4, 0.75, 0.3, 0.025), 0, { at: [mx, PLATE, mz] });
  pen(box(0.42, 0.06, 0.32, 0.015), 0.03, { at: [mx, PLATE + 0.72, mz] });
  // Front: tall recessed bottle window, coin slot, delivery hatch.
  pen(box(0.22, 0.4, 0.02, 0), RECESS - 0.04, { at: [mx - 0.05, PLATE + 0.28, mz + 0.15] });
  pen(box(0.05, 0.1, 0.02, 0), 0.06, { at: [mx + 0.13, PLATE + 0.48, mz + 0.15] });
  pen(box(0.025, 0.05, 0.03, 0), RECESS - 0.1, { at: [mx + 0.13, PLATE + 0.5, mz + 0.155] });
  pen(box(0.26, 0.08, 0.02, 0), RECESS - 0.08, { at: [mx, PLATE + 0.1, mz + 0.15] });
  // Two bottle crates: one on the plate, one on top of it; bottles poke out of the top one.
  const cx = 0.25;
  pen(box(0.26, 0.14, 0.34, 0.012), -0.02, { at: [cx, PLATE, 0.02] });
  pen(box(0.26, 0.14, 0.34, 0.012), 0, { at: [cx, PLATE + 0.14, 0.02] });
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 3; j++) pen(cyl(0.022, 0.035, 0.12, 5), 0.04, { at: [cx - 0.06 + i * 0.12, PLATE + 0.28, -0.08 + j * 0.1] });
  return s;
}

export function buildDrinkSource(ctx: MiniCtx, p: { drink: DrinkId }): THREE.Group {
  const g = new THREE.Group();
  blob(ctx, g, 1.05, 1.05, true, 0.6);
  const geo =
    p.drink === 'beer'
      ? miniGeo('src:se:beer', beerShape)
      : p.drink === 'lemonade'
        ? miniGeo('src:se:lemonade', lemonadeShape)
        : miniGeo('src:se:soft_drink', sodaShape);
  solid(ctx, g, geo);
  return g;
}
