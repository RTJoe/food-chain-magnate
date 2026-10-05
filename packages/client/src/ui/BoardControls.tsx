/**
 * Camera, animation-speed and pick controls for the 3D board. Talks to the board only through
 * state/interaction.ts signals (architecture §2: ui/ never imports three/).
 *
 * In any pick mode (place / campaign / route) the pick strip shows the instruction and Rotate /
 * Confirm / Cancel (on a phone it replaces the collapsed sheet); on desktop a small hint follows
 * the pointer with the spot under it or the engine's reason why the square is not legal.
 */
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { Placement } from '@fcm/engine';
import { boardRenderer, emitPick, interactionMode, isPickMode, type PickMode } from '../state/boardBridge.js';
import { describeHaul, describePlacement } from '../state/actions.js';
import type { RoutePlacementT } from '../state/guidance.js';
import {
  activeCandidate,
  animationSpeed,
  cameraCommand,
  confirmPlacement,
  cycleCandidate,
  finishAnimations,
  ghostOrientation,
  hoverPlacement,
  pendingPlacement,
  pendingVariants,
  placementReason,
  rotatePlacement,
  topView,
} from '../state/interaction.js';
import { view } from '../state/store.js';
import { Button, IconButton } from './common.js';
import { sheetOpen } from './uiState.js';

const SPEEDS = [0.5, 1, 2] as const;

export function BoardControls() {
  if (boardRenderer.value !== '3d') return null;
  const m = interactionMode.value;
  return (
    <>
      <div class="board-controls glass" role="toolbar" aria-label="Board camera">
        <IconButton icon="rotateLeft" label="Rotate view left" onClick={() => (cameraCommand.value = { kind: 'yaw', by: -Math.PI / 4 })} />
        <IconButton icon="rotateRight" label="Rotate view right" onClick={() => (cameraCommand.value = { kind: 'yaw', by: Math.PI / 4 })} />
        <IconButton icon="zoomIn" label="Zoom in" onClick={() => (cameraCommand.value = { kind: 'zoom', by: 0.8 })} />
        <IconButton icon="zoomOut" label="Zoom out" onClick={() => (cameraCommand.value = { kind: 'zoom', by: 1.25 })} />
        <IconButton
          icon="topView"
          label={topView.value ? 'Tilted view' : 'Top view'}
          class={topView.value ? 'is-on' : ''}
          aria-pressed={topView.value}
          onClick={() => (cameraCommand.value = { kind: 'top' })}
        />
        <IconButton icon="recenter" label="Reset camera" onClick={() => (cameraCommand.value = { kind: 'reset' })} />
        <span class="board-controls-sep" aria-hidden="true" />
        <button
          type="button"
          class="speed-btn"
          title="Animation speed"
          aria-label={`Animation speed ${animationSpeed.value}x`}
          onClick={() => (animationSpeed.value = SPEEDS[(SPEEDS.indexOf(animationSpeed.value as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1)}
        >
          {animationSpeed.value}×
        </button>
        <IconButton icon="forward" label="Skip animations" onClick={() => finishAnimations()} />
      </div>
      {isPickMode(m) && <PickStrip mode={m} />}
      {isPickMode(m) && <PointerHint mode={m} />}
    </>
  );
}

const ORIENT_LABEL = { landscape: 'landscape', portrait: 'portrait', square: '' } as const;

function pickText(mode: PickMode, staged: Placement | null): string {
  const v = view.value;
  if (mode.kind === 'route') {
    const n = mode.placements.length;
    const i = Math.max(0, activeCandidate.value);
    const p = mode.placements[i] as RoutePlacementT | undefined;
    return p ? `Haul ${i + 1} of ${n} · ${describeHaul(p, v)}` : mode.label;
  }
  if (staged) return describePlacement(staged, v);
  const o = mode.kind === 'campaign' && ghostOrientation.value ? ORIENT_LABEL[ghostOrientation.value] : '';
  return `${mode.label}${o ? ` (${o})` : ''}: pick a highlighted spot`;
}

/** Instruction + Rotate / Confirm / Cancel. Desktop: above the camera bar; phone: the bottom strip. */
function PickStrip({ mode }: { mode: PickMode }) {
  const staged = pendingPlacement.value;
  const route = mode.kind === 'route';
  const n = mode.placements.length;
  const orient = ghostOrientation.value;
  const canRotate = staged ? pendingVariants.value > 1 : mode.kind === 'campaign' && (orient === 'landscape' || orient === 'portrait');
  const canConfirm = Boolean(staged) || (route && activeCandidate.value >= 0);
  return (
    <div class={`pick-strip glass ${staged ? 'is-staged' : ''}`} role="group" aria-label="Board pick">
      <span class="pick-text" role="status">
        {pickText(mode, staged)}
      </span>
      <span class="pick-actions">
        {route && n > 1 && (
          <>
            <IconButton icon="chevronLeft" label="Previous haul" onClick={() => cycleCandidate(-1)} />
            <IconButton icon="chevronRight" label="Next haul" onClick={() => cycleCandidate(1)} />
          </>
        )}
        {canRotate && (
          <Button size="sm" variant="secondary" icon="rotateRight" onClick={() => rotatePlacement()}>
            Rotate
          </Button>
        )}
        <Button size="sm" variant="primary" icon="check" disabled={!canConfirm} onClick={() => confirmPlacement()}>
          {route ? (
            'Buy'
          ) : (
            <>
              Place<span class="lbl-long">&nbsp;here</span>
            </>
          )}
        </Button>
        <IconButton icon="x" label="Cancel" class="pick-cancel" onClick={() => emitPick({ kind: 'cancel' })} />
        <IconButton icon={sheetOpen.value ? 'chevronDown' : 'chevronUp'} label={sheetOpen.value ? 'Hide panel' : 'Show panel'} class="pick-panel" onClick={() => (sheetOpen.value = !sheetOpen.value)} />
      </span>
    </div>
  );
}

/** Desktop: the spot under the pointer, its variants, or why the square is not legal, next to the pointer. */
function PointerHint({ mode }: { mode: PickMode }) {
  const pos = useSignal<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const onBoard = e.target instanceof HTMLCanvasElement && Boolean((e.target as HTMLElement).closest('#board-root'));
      pos.value = onBoard ? { x: e.clientX, y: e.clientY } : null;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const p = pos.value;
  if (!p || mode.kind === 'route') return null;
  const reason = placementReason.value;
  const hovered = hoverPlacement.value;
  if (!reason && !hovered) return null;
  const left = Math.min(p.x + 18, window.innerWidth - 280);
  return (
    <div class={`pointer-hint ${reason && !hovered ? 'is-illegal' : ''}`} style={{ left: `${left}px`, top: `${p.y + 18}px` }} role="status">
      {hovered ? (
        <>
          {describePlacement(hovered.placement, view.value)}
          {hovered.variants > 1 && <span class="muted"> · R: {hovered.variants} options</span>}
        </>
      ) : (
        reason
      )}
    </div>
  );
}
