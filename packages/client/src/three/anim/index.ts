/**
 * Animation layer (animation-plan §4). The only shared file between work packages: one import line
 * per choreography / actor module. Later imports replace earlier registrations for the same beat
 * kind or actor kind, so keep `basic.js` (WP-A defaults) first.
 */
import './basic.js';
// WP-B: actor builders (registerActor).
import '../minis/vehiclesActors.js';
// WP-C: import './dinner.js'; import './drinks.js'; import './marketing.js';
// WP-D: import './board.js'; import './phase.js';

export { Timeline, type Clip, type ClipSpec } from './timeline.js';
export { compile, closingCaption, PACING, type Beat, type BeatKind, type Plan, type Segment } from './compile.js';
export { registry, registerChoreo, beatEvent, beatEvents, followClip, type Choreography, type ChoreoCtx, type RouteLookup, type SaleTrip, type BuyTrip, type GhostStack } from './choreo.js';
export { ActorPool, registerActor, hasActor, type ActorKind, type ActorSpec, type ActorBuilder } from './pool.js';
export { roadPath, airPath, tripDuration, tripEase, LANE, CORNER, ROAD_Y, AIR_Y, type Follow, type Pose, type P2 } from './path.js';
export { createChoreoCtx } from './context.js';
