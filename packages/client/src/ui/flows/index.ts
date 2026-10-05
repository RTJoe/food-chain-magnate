/**
 * Placement flow registry and host. `PlacementFlow` computes the legal placements for a
 * `placement` LegalAction once and mounts the flow registered for its `spec.kind` (Ketchup flows
 * from ./ketchup.ts override the base ones); unknown kinds use the generic board pick.
 */
import { createElement } from 'preact';
import { useMemo } from 'preact/hooks';
import type { PlacementKind } from '@fcm/engine';
import { placementsFor } from '../../state/guidance.js';
import { catalog, manifest, me, view } from '../../state/store.js';
import { CampaignFlow } from './Campaign.js';
import { GenericFlow } from './Generic.js';
import { HouseFlow } from './House.js';
import { ketchupFlows } from './ketchup.js';
import { MapTileFlow } from './MapTile.js';
import { RestaurantFlow } from './Restaurant.js';
import { RouteFlow } from './Route.js';
import type { FlowComponent, PlacementLegal } from './types.js';

export type { FlowComponent, FlowProps, PlacementLegal } from './types.js';

const BASE_FLOWS: Partial<Record<PlacementKind, FlowComponent>> = {
  campaign: CampaignFlow,
  buyerRoute: RouteFlow,
  house: HouseFlow,
  restaurant: RestaurantFlow,
  moveRestaurant: RestaurantFlow,
  mapTile: MapTileFlow,
};

export const FLOWS: Record<string, FlowComponent> = { ...BASE_FLOWS, ...ketchupFlows } as Record<string, FlowComponent>;

export const flowFor = (kind: PlacementKind): FlowComponent => FLOWS[kind] ?? GenericFlow;

/** Board pick flow for one placement `LegalAction`. */
export function PlacementFlow({ legal, onDone, onCancel }: { legal: PlacementLegal; onDone: () => void; onCancel: () => void }) {
  const v = view.value;
  const placements = useMemo(() => (v ? placementsFor(v, me.value, legal.spec, manifest.value, catalog.value) : []), [v, legal]);
  return createElement(flowFor(legal.spec.kind), { legal, spec: legal.spec, placements, onDone, onCancel });
}
