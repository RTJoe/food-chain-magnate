/**
 * Camera, animation-speed and touch-confirm controls for the 3D board. Talks to the board only
 * through state/interaction.ts signals (architecture §2: ui/ never imports three/).
 */
import { boardRenderer, interactionMode } from '../state/boardBridge.js';
import { describePlacement } from '../state/actions.js';
import {
  animationSpeed,
  cameraCommand,
  confirmPlacement,
  finishAnimations,
  pendingPlacement,
  pendingVariants,
  rotatePlacement,
  topView,
} from '../state/interaction.js';
import { emitPick } from '../state/boardBridge.js';
import { Button, IconButton } from './common.js';

const SPEEDS = [0.5, 1, 2] as const;

export function BoardControls() {
  if (boardRenderer.value !== '3d') return null;
  const staged = pendingPlacement.value;
  const placing = interactionMode.value.kind === 'place';
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
      {placing && staged && (
        <div class="confirm-bar glass" role="group" aria-label="Confirm placement">
          <span class="small">{describePlacement(staged)}</span>
          {pendingVariants.value > 1 && (
            <Button size="sm" variant="secondary" icon="rotateRight" onClick={() => rotatePlacement()}>
              Rotate
            </Button>
          )}
          <Button size="sm" variant="primary" icon="check" onClick={() => confirmPlacement()}>
            Place here
          </Button>
          <Button size="sm" variant="ghost" icon="x" onClick={() => emitPick({ kind: 'cancel' })}>
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}
