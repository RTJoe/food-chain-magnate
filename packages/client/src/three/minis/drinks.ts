/**
 * Drink sources (1x1, printed on map tiles): the Special Edition sculpts (docs/art-bible.md §6.5)
 * painted on a base in the drink's component colour: an upright oak beer barrel with iron hoops on
 * a green crate, a lemonade stand of timber crates heaped with lemons, a red cola vending machine
 * with crates of glass bottles. Each reads by silhouette and base colour alone.
 */
import * as THREE from 'three';
import type { DrinkId } from '@fcm/engine';
import { blob, solid, type MiniCtx } from './ctx.js';
import { Shape, ball, box, cyl, lathe, miniGeo, shade, type Paint, type PartOpts } from './kit.js';
import { PAINT } from './paint.js';

const PLATE = 0.06;

type Add = (geo: THREE.BufferGeometry, paint: Paint, o?: PartOpts) => Shape;
const painter =
  (s: Shape): Add =>
  (geo, paint, o = {}) =>
    s.add(geo, paint, { jitter: 0.03, ...o });

/** Base plate painted in the drink's component colour. */
function plate(add: Add, base: string): void {
  add(box(0.86, PLATE, 0.86, 0.02), base, { jitter: 0 });
}

/** Lemon yellow (brighter and greener than the lemonade base). */
const LEMON = '#f4e04a';
/** Brown glass of cola bottles. */
const BOTTLE = '#5a2e1c';

/**
 * Upright barrel on a slatted crate, as the SE beer supplier: oak staves with two iron hoops and a
 * ringed lid, a brass tap, a small crate on the plate in front and a short ladder against the crate.
 */
function beerShape(): Shape {
  const s = new Shape();
  const add = painter(s);
  plate(add, PAINT.beer);
  // Green-painted crate the barrel stands on, darker slat grooves and a white label.
  const ch = 0.22;
  const cz = -0.06;
  add(box(0.58, ch, 0.56, 0.012), shade(PAINT.beer, 0.08), { at: [0, PLATE, cz] });
  for (const x of [-0.12, 0.12]) add(box(0.025, ch - 0.06, 0.01, 0), shade(PAINT.beer, -0.3), { at: [x, PLATE + 0.03, cz + 0.281] });
  add(box(0.16, 0.07, 0.012, 0), PAINT.signCream, { at: [0, PLATE + 0.075, cz + 0.282] });
  // Barrel: bulged oak staves, two iron hoops, a lid with a raised ring.
  const by = PLATE + ch;
  const bz = cz - 0.02;
  add(
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
    PAINT.wood,
    { at: [0, by, bz], rot: [0, Math.PI / 8, 0] },
  );
  for (const y of [0.07, 0.355]) add(cyl(0.236, 0.236, 0.035, 8), PAINT.metalDark, { at: [0, by + y, bz], rot: [0, Math.PI / 8, 0], mat: 'metal' });
  add(cyl(0.13, 0.13, 0.014, 8), PAINT.woodLight, { at: [0, by + 0.46, bz] });
  // Brass tap on the barrel front.
  add(box(0.04, 0.04, 0.07, 0), '#c9a24a', { at: [0.0, by + 0.1, bz + 0.25], mat: 'metal' });
  add(box(0.03, 0.06, 0.03, 0), '#c9a24a', { at: [0.0, by + 0.05, bz + 0.27], mat: 'metal' });
  // Small wooden crate of green bottles on the plate in front, right.
  add(box(0.26, 0.13, 0.17, 0), PAINT.woodLight, { at: [0.22, PLATE, 0.32] });
  add(box(0.27, 0.02, 0.18, 0), PAINT.woodDark, { at: [0.22, PLATE + 0.06, 0.32] });
  add(box(0.22, 0.03, 0.13, 0), '#2f6b34', { at: [0.22, PLATE + 0.12, 0.32], mat: 'glass' });
  // Short wooden ladder leaning on the crate front, left.
  const ladder = new Shape();
  for (const x of [-0.07, 0.07]) ladder.add(box(0.03, 0.34, 0.03, 0), PAINT.wood, { at: [x, 0, 0] });
  for (let i = 0; i < 2; i++) ladder.add(box(0.15, 0.022, 0.022, 0), PAINT.woodLight, { at: [0, 0.1 + i * 0.12, 0] });
  s.addShape(ladder, { at: [-0.2, PLATE, 0.34], rot: [-0.35, 0, 0] });
  return s;
}

/** Two stacked timber crates heaped with lemons, and a painted sign post. */
function lemonadeShape(): Shape {
  const s = new Shape();
  const add = painter(s);
  plate(add, PAINT.lemonade);
  const x0 = -0.08;
  for (let i = 0; i < 2; i++) {
    const y = PLATE + i * 0.2;
    add(box(0.5, 0.2, 0.35, 0.015), PAINT.woodLight, { at: [x0, y, 0.02], jitter: 0.05 });
    // Slat grooves and a hand hole on the front.
    add(box(0.46, 0.02, 0.36, 0), PAINT.woodDark, { at: [x0, y + 0.09, 0.02] });
    add(box(0.12, 0.04, 0.36, 0), PAINT.trimDark, { at: [x0, y + 0.14, 0.02] });
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
  for (const [x, l, z] of lemons) add(ball(0.065, 0), LEMON, { at: [x0 + 0.08 + x, PLATE + 0.44 + l * 0.08, 0.02 + z], scale: [1.25, 0.95, 1], jitter: 0.06 });
  // Sign post: a timber post, a white board with a lemon-yellow stripe.
  add(box(0.04, 0.62, 0.04, 0), PAINT.wood, { at: [0.3, PLATE, 0.16] });
  add(box(0.26, 0.15, 0.03, 0.01), PAINT.signCream, { at: [0.3, PLATE + 0.52, 0.19] });
  add(box(0.2, 0.025, 0.02, 0), shade(PAINT.lemonade, -0.15), { at: [0.3, PLATE + 0.585, 0.21] });
  return s;
}

/** Red vending machine with a glass bottle window and coin slot, two crates of bottles beside it. */
function sodaShape(): Shape {
  const s = new Shape();
  const add = painter(s);
  plate(add, PAINT.cola);
  const mx = -0.12;
  const mz = -0.06;
  add(box(0.4, 0.75, 0.3, 0.025), shade(PAINT.cola, 0.06), { at: [mx, PLATE, mz] });
  add(box(0.42, 0.06, 0.32, 0.015), PAINT.trimWhite, { at: [mx, PLATE + 0.72, mz] });
  // Front: tall glass bottle window, white lettering band, chrome coin slot, dark delivery hatch.
  add(box(0.22, 0.4, 0.02, 0), PAINT.glassDark, { at: [mx - 0.05, PLATE + 0.28, mz + 0.15], mat: 'glass' });
  add(box(0.3, 0.05, 0.016, 0), PAINT.trimWhite, { at: [mx, PLATE + 0.2, mz + 0.152] });
  add(box(0.05, 0.1, 0.02, 0), PAINT.chrome, { at: [mx + 0.13, PLATE + 0.48, mz + 0.15], mat: 'metal' });
  add(box(0.025, 0.05, 0.03, 0), PAINT.rubber, { at: [mx + 0.13, PLATE + 0.5, mz + 0.155] });
  add(box(0.26, 0.08, 0.02, 0), PAINT.rubber, { at: [mx, PLATE + 0.1, mz + 0.15] });
  // Two red bottle crates: one on the plate, one on top of it; brown bottles poke out of the top one.
  const cx = 0.25;
  add(box(0.26, 0.14, 0.34, 0.012), shade(PAINT.cola, -0.12), { at: [cx, PLATE, 0.02] });
  add(box(0.26, 0.14, 0.34, 0.012), shade(PAINT.cola, -0.04), { at: [cx, PLATE + 0.14, 0.02] });
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 3; j++) add(cyl(0.022, 0.035, 0.12, 5), BOTTLE, { at: [cx - 0.06 + i * 0.12, PLATE + 0.28, -0.08 + j * 0.1], mat: 'glass' });
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
