/**
 * Building blocks shared by the placement flows: board-mode ownership, commit, the head row and
 * the list fallback (rows stay in sync with the board's active candidate).
 */
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { FoodId, Placement } from '@fcm/engine';
import { actionFromPlacement, describePlacement, type PlacementOptions } from '../../state/actions.js';
import { boardBridge, boardRenderer, interactionMode, isPickMode, type InteractionMode } from '../../state/boardBridge.js';
import { foodName } from '../../state/catalog.js';
import { realEngineReady } from '../../state/engine.js';
import { activeCandidate, setActiveCandidate, type SelectionKind } from '../../state/interaction.js';
import { catalog, me, myPlayer, settings, view } from '../../state/store.js';
import { act } from '../../net/session.js';
import { footprint } from '../Board2D.js';
import { Button, Empty } from '../common.js';
import { FoodIcon, Icon } from '../icons.js';
import type { PlacementLegal } from './types.js';

export const playerColor = (): string => myPlayer.value?.color ?? '#d94f3d';

/** Send the action for `p` and leave board mode. False when the placement does not fit (e.g. no good yet). */
export function commitPlacement(legal: PlacementLegal, p: Placement, opts: PlacementOptions = {}): boolean {
  const who = me.value;
  if (!who) return false;
  const a = actionFromPlacement(legal, p, who, opts);
  if (!a) return false;
  // Not sent (a lesson's action gate kept it back): stay in the pick so the learner can choose again.
  if (!act(a)) return false;
  boardBridge.setInteractionMode({ kind: 'idle' });
  return true;
}

export interface BoardHandlers {
  onPlacement?: (p: Placement) => void;
  onCancel?: () => void;
  /** Board object clicked (idle / inspect modes only). */
  onObject?: (id: string, kind: SelectionKind | 'garden' | undefined) => void;
}

/**
 * Own the board while mounted: enter `mode` (null = idle), route picks to the handlers, and go
 * back to idle on unmount. `mode` must be memoised by the caller (a new object re-enters the mode).
 */
export function useBoardMode(mode: InteractionMode | null, handlers: BoardHandlers): void {
  const h = useRef(handlers);
  h.current = handlers;
  useEffect(() => {
    boardBridge.setInteractionMode(mode ?? { kind: 'idle' });
    return () => boardBridge.setInteractionMode({ kind: 'idle' });
  }, [mode]);
  useEffect(
    () =>
      boardBridge.onPick((e) => {
        if (e.kind === 'placement') h.current.onPlacement?.(e.placement);
        else if (e.kind === 'cancel') h.current.onCancel?.();
        else h.current.onObject?.(e.id, e.objectKind);
      }),
    [],
  );
}

/** Index of `p` in the current pick mode's placements (-1 when not shown on the board). */
export function modeIndex(p: Placement): number {
  const m = interactionMode.value;
  return isPickMode(m) ? (m.placements as readonly Placement[]).indexOf(p) : -1;
}

export function FlowHead({ title, onCancel, label = 'Cancel' }: { title: ComponentChildren; onCancel: () => void; label?: string }) {
  return (
    <div class="flow-head">
      <h4>{title}</h4>
      <Button size="sm" variant="ghost" icon="x" onClick={onCancel}>
        {label}
      </Button>
    </div>
  );
}

export function NoSpots({ children }: { children?: ComponentChildren }) {
  return <Empty icon="map">{children ?? (realEngineReady() ? 'No legal spot for this right now.' : 'Board placements need the rules engine (still being built).')}</Empty>;
}

/** Placements the 3D board does not draw (off-board campaigns, errand fetches): picked from the list. */
export const listOnly = (p: Placement): boolean => (p.kind === 'buyerRoute' && p.route.mode === 'errand') || (p.kind === 'campaign' && p.placement.kind === 'offBoard');

/** Split placements into those the board shows and those the list must show (settings.placementList shows all). */
export function splitPlacements(placements: readonly Placement[]): { onBoard: Placement[]; list: Placement[] } {
  const onBoard = placements.filter((p) => (boardRenderer.value === '3d' ? !listOnly(p) : footprint(p) !== null));
  const list = settings.value.placementList ? [...placements] : placements.filter((p) => !onBoard.includes(p));
  return { onBoard, list };
}

const PAGE = 120;

/**
 * List fallback: one row per placement. Hovering a row makes it the board's active candidate (when
 * the board shows it); clicking picks it. Long lists page in chunks instead of being cut off.
 */
export function PlacementRows({ placements, onPick, describe }: { placements: readonly Placement[]; onPick: (p: Placement) => void; describe?: (p: Placement) => ComponentChildren }) {
  const shown = useSignal(PAGE);
  const v = view.value;
  const active = activeCandidate.value;
  if (!placements.length) return null;
  return (
    <>
      <ul class="placement-list">
        {placements.slice(0, shown.value).map((p, i) => {
          const idx = modeIndex(p);
          return (
            <li key={i}>
              <button type="button" class={`placement-btn ${idx >= 0 && idx === active ? 'is-active' : ''}`} onMouseEnter={idx >= 0 ? () => setActiveCandidate(idx) : undefined} onClick={() => onPick(p)}>
                {Icon.pin({ size: 16 })}
                {describe ? describe(p) : describePlacement(p, v)}
              </button>
            </li>
          );
        })}
      </ul>
      {placements.length > shown.value && (
        <button type="button" class="link-btn" onClick={() => (shown.value += PAGE)}>
          Show {Math.min(PAGE, placements.length - shown.value)} more of {placements.length - shown.value}
        </button>
      )}
    </>
  );
}

/** "Pick a highlighted spot" line with the count and the keyboard / touch hint. */
export function BoardHint({ count, children }: { count: number; children?: ComponentChildren }) {
  if (!count) return null;
  return (
    <p class="flow-hint">
      {Icon.pin({ size: 16 })}
      <span>
        {children ?? 'Pick a highlighted spot on the board.'} {count} option{count === 1 ? '' : 's'}.
      </span>
    </p>
  );
}

/** Food chips for campaign goods (also the free mailbox). */
/**
 * Good chips. `value` is one good, or the goods picked so far in order: with more than one allowed
 * (`ordered`), each chosen chip shows its place (A is marketed first, then B; KX p18).
 */
export function GoodChips({ foods, value, onChange, ordered = false }: { foods: readonly FoodId[]; value: FoodId | null | readonly FoodId[]; onChange: (f: FoodId) => void; ordered?: boolean }) {
  const c = catalog.value;
  const picked: readonly FoodId[] = Array.isArray(value) ? value : value ? [value as FoodId] : [];
  return (
    <div class="chip-row">
      {foods.map((f) => {
        const at = picked.indexOf(f);
        return (
          <button key={f} type="button" class={`chip chip-food ${at >= 0 ? 'is-on' : ''}`} data-tutorial={`good-${f}`} aria-pressed={at >= 0} onClick={() => onChange(f)}>
            {ordered && at >= 0 && <><strong>{String.fromCharCode(65 + at)}</strong> </>}<FoodIcon food={f} size={18} /> {foodName(c, f)}
          </button>
        );
      })}
    </div>
  );
}

/** Marketable goods of the game's modules. */
export function marketableFoods(): FoodId[] {
  const c = catalog.value;
  const mods = view.value?.config.modules ?? [];
  return (Object.values(c.foods).filter((f) => f && f.marketable && (f.module === 'base' || mods.includes(f.module))) as { id: FoodId }[]).map((f) => f.id);
}

/** Keep a value in sync with a mount-scoped effect (e.g. previewGood while a flow is open). */
export function useMirror<T>(value: T, write: (v: T) => void, reset: T): void {
  useEffect(() => {
    write(value);
  }, [value]);
  useEffect(() => () => write(reset), []);
}
