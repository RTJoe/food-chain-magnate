/**
 * Registers the WP-B minis with the actor pool (`anim/pool.ts`). Import once for its side effect
 * from `anim/index.ts`: `import '../minis/vehiclesActors.js';`
 *
 * Variants (the pool's `variant` string, part of the pool key):
 * - van / scooter / cart / truck / zeppelin: the chain mark for the side decal (e.g. 'FG'),
 *   optionally suffixed `:lite` for the phone build (wheels baked in, no decal, no shadow).
 *   Without a mark the decal uses `setActorMarks` (colour → mark), else none.
 * - airplane: banner goods joined by '+', e.g. 'burger+beer' (plain banner when null).
 * - crate: drink / good id. ghostToken: good id. puff: 'steam' | 'dust'.
 * - envelope / leaflet / confetti: none (colour only).
 */
import type { FoodId } from '@fcm/engine';
import { registerActor, type ActorBuilder, type ActorKind } from '../anim/pool.js';
import { buildCarryToken, buildCash, buildCoin, buildCoinStack, buildConfetti, buildCrate, buildEnvelope, buildGhostToken, buildLeaflet, buildPuff, buildRadioRings } from './props.js';
import { ACTOR_FACTORIES, type ActorSpec as VehicleSpec, type VehicleKind } from './vehicles.js';

const NEUTRAL = '#8f8b88';
const marks = new Map<string, string>();

/** Chain marks by player colour, for vehicle decals when the caller passes no variant. */
export function setActorMarks(byColor: ReadonlyMap<string, string> | Record<string, string>): void {
  marks.clear();
  for (const [c, m] of byColor instanceof Map ? byColor : Object.entries(byColor)) marks.set(c.toLowerCase(), m);
}

function vehicleSpec(color: string | null, variant: string | null): VehicleSpec {
  const c = color ?? NEUTRAL;
  const [m, flag] = (variant ?? '').split(':');
  const lite = flag === 'lite' || m === 'lite';
  const mark = m && m !== 'lite' ? m : marks.get(c.toLowerCase());
  return { color: c, mark, lite };
}

const vehicle =
  (kind: VehicleKind): ActorBuilder =>
  (ctx, spec) =>
    ACTOR_FACTORIES[kind](ctx, vehicleSpec(spec.color, spec.variant)).root;

for (const k of ['van', 'scooter', 'cart', 'truck', 'zeppelin', 'mailman'] as const satisfies readonly (VehicleKind & ActorKind)[]) registerActor(k, vehicle(k));

registerActor('airplane', (ctx, spec) =>
  ACTOR_FACTORIES.airplane(ctx, { color: spec.color ?? NEUTRAL, goods: spec.variant ? (spec.variant.split('+') as FoodId[]) : undefined }).root,
);
registerActor('crate', (ctx, spec) => buildCrate(ctx, (spec.variant ?? 'beer') as FoodId));
registerActor('envelope', (ctx, spec) => buildEnvelope(ctx, spec.color ?? NEUTRAL));
registerActor('leaflet', (ctx, spec) => buildLeaflet(ctx, spec.color ?? NEUTRAL));
registerActor('puff', (ctx, spec) => buildPuff(ctx, spec.variant === 'dust' ? 'dust' : 'steam'));
registerActor('confetti', (ctx, spec) => buildConfetti(ctx, spec.color ?? NEUTRAL));
registerActor('ghostToken', (ctx, spec) => buildGhostToken(ctx, (spec.variant ?? 'burger') as FoodId));
// Added by WP-A: the remaining poolable props.
registerActor('coin', (ctx, spec) => (spec.variant ? buildCoinStack(ctx, Number(spec.variant) || 3) : buildCoin(ctx)));
registerActor('cash', (ctx) => buildCash(ctx));
registerActor('carryToken', (ctx, spec) => buildCarryToken(ctx, (spec.variant ?? 'burger') as FoodId));
registerActor('radioRings', (ctx, spec) => buildRadioRings(ctx, spec.color ?? NEUTRAL));
