/**
 * Animation layer (animation-plan §4). The only shared file between work packages: one import line
 * per choreography / actor module. Later imports replace earlier registrations for the same beat
 * kind or actor kind, so keep `basic.js` (WP-A defaults) first.
 */
import './basic.js';
// WP-B: actor builders (registerActor).
import '../minis/vehiclesActors.js';
// WP-C: dinnertime, buyer hauls, marketing carriers.
import './choreos/dinner.js';
import './choreos/drinks.js';
import './choreos/marketing.js';
// WP-D: board pieces, Ketchup entities, map tiles (choreos/board.ts); setup build, turns, goods, money, milestones, game over (choreos/phase.ts).
import './choreos/board.js';
import './choreos/phase.js';

export { Timeline, type Clip, type ClipSpec } from './timeline.js';
export { compile, closingCaption, PACING, type Beat, type BeatKind, type Plan, type Segment } from './compile.js';
export { registry, registerChoreo, beatEvent, beatEvents, followClip, type Choreography, type ChoreoCtx, type RouteLookup, type SaleTrip, type BuyTrip, type GhostStack } from './choreo.js';
export { ActorPool, registerActor, hasActor, type ActorKind, type ActorSpec, type ActorBuilder } from './pool.js';
export { roadPath, airPath, tripDuration, tripEase, LANE, CORNER, ROAD_Y, AIR_Y, type Follow, type Pose, type P2 } from './path.js';
export { createChoreoCtx } from './context.js';
