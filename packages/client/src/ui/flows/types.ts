/**
 * Contract between the turn panel and the per-kind placement flows (ui/flows/*). The host
 * (`PlacementFlow` in ui/flows/index.ts) computes the legal placements once and mounts the flow
 * registered for `spec.kind`; the flow owns the board mode (via `boardBridge`) and commits.
 */
import type { ComponentType } from 'preact';
import type { LegalAction, Placement, PlacementSpec } from '@fcm/engine';

export type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

export interface FlowProps {
  /** Legal placements for `spec` (`placementsFor`), already computed by the host. May be empty. */
  placements: Placement[];
  /** The query that produced them (`legal.spec`). */
  spec: PlacementSpec;
  /** Called after the action was sent (the host closes the flow). */
  onDone: () => void;
  /** The `placement` legal action being fulfilled (label, actionType, cardUid). */
  legal: PlacementLegal;
  /** The player backed out (the host closes the flow without acting). */
  onCancel: () => void;
}

export type FlowComponent = ComponentType<FlowProps>;
