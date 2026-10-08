/**
 * Camera, animation-speed, graphics and pick controls for the board. Talks to the board only
 * through state/ signals (architecture §2: ui/ never imports three/).
 *
 * The camera bar and the graphics menu belong to the 3D board. The pick strip serves both boards:
 * in any pick mode (place / campaign / route) it shows the instruction and Rotate / Confirm /
 * Cancel (on a phone it replaces the collapsed sheet). On desktop a small hint follows the pointer
 * with the spot under it or the engine's reason why the square is not legal; on touch, a tap on a
 * square with no legal spot shows that reason in the strip for a moment.
 */
import { effect, useSignal } from '@preact/signals';
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
  followAction,
  ghostOrientation,
  hoverPlacement,
  pendingPlacement,
  pendingVariants,
  placementReason,
  rotatePlacement,
  setFollowAction,
  topView,
} from '../state/interaction.js';
import { graphicsSetting, graphicsTier, type GraphicsSetting } from '../state/graphics.js';
import { view } from '../state/store.js';
import { Button, IconButton } from './common.js';
import { keyboardUser, sheetOpen } from './uiState.js';

/** Animation speed cycle (animation-plan §1.4). */
const SPEEDS = [1, 2, 4] as const;

export function BoardControls() {
  const is3d = boardRenderer.value === '3d';
  const m = interactionMode.value;
  return (
    <>
      {is3d && <CameraBar />}
      {isPickMode(m) && <PickStrip mode={m} is3d={is3d} />}
      {isPickMode(m) && <PointerHint mode={m} />}
    </>
  );
}

function CameraBar() {
  const gfx = useSignal(false);
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
          data-tutorial="camera-top"
          onClick={() => (cameraCommand.value = { kind: 'top' })}
        />
        <IconButton icon="recenter" label="Reset camera" data-tutorial="camera-reset" onClick={() => (cameraCommand.value = { kind: 'reset' })} />
        <span class="board-controls-sep" aria-hidden="true" />
        <button
          type="button"
          class="speed-btn"
          data-tutorial="speed"
          title="Animation speed"
          aria-label={`Animation speed ${animationSpeed.value}x`}
          onClick={() => (animationSpeed.value = SPEEDS[(SPEEDS.indexOf(animationSpeed.value as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1)}
        >
          {animationSpeed.value}×
        </button>
        <IconButton icon="forward" label="Skip animations" onClick={() => finishAnimations()} />
        <IconButton
          icon="eye"
          label={followAction.value ? 'Stop following the action' : 'Follow the action'}
          class={followAction.value ? 'is-on' : ''}
          aria-pressed={followAction.value}
          data-tutorial="follow"
          onClick={() => setFollowAction(!followAction.value)}
        />
        <IconButton icon="settings" label="Graphics quality" class={gfx.value ? 'is-on' : ''} aria-expanded={gfx.value} data-tutorial="graphics" onClick={() => (gfx.value = !gfx.value)} />
      </div>
      {gfx.value && <GraphicsMenu onClose={() => (gfx.value = false)} />}
    </>
  );
}

const GRAPHICS: { id: GraphicsSetting; label: string; note: string }[] = [
  { id: 'auto', label: 'Auto', note: 'Picks for this device, lowers itself if frames get slow' },
  { id: 'high', label: 'High', note: 'Soft shadows, sharpest picture' },
  { id: 'medium', label: 'Medium', note: 'Shadows, lighter on the battery' },
  { id: 'low', label: 'Low', note: 'No shadows: for older phones' },
];

/** Graphics quality: the 3D layer stores the choice (setGraphicsPref) and applies it at once. */
function GraphicsMenu({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest('.gfx-menu') && !t.closest('[aria-label="Graphics quality"]')) onClose();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down, true);
    };
  }, []);
  const cur = graphicsSetting.value;
  const tier = graphicsTier.value;
  return (
    <div class="gfx-menu glass" role="radiogroup" aria-label="Graphics quality">
      <span class="field-label">Graphics</span>
      {GRAPHICS.map((g) => (
        <label key={g.id} class={`gfx-opt ${cur === g.id ? 'is-on' : ''}`}>
          <input type="radio" name="gfx" checked={cur === g.id} onChange={() => (graphicsSetting.value = g.id)} />
          <span>
            <b>
              {g.label}
              {g.id === 'auto' && cur === 'auto' && tier ? ` (now ${tier})` : ''}
            </b>
            <span class="muted small">{g.note}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

const ORIENT_LABEL = { landscape: 'landscape', portrait: 'portrait', square: '' } as const;

/** Campaign picks with an oblong board footprint can turn; off-board ones (giant billboard, gourmet guide) cannot. */
export function campaignTurns(mode: PickMode): boolean {
  if (mode.kind !== 'campaign') return false;
  return mode.placements.some((p) => {
    const pl = (p as Placement).kind === 'campaign' ? (p as Extract<Placement, { kind: 'campaign' }>).placement : null;
    return pl?.kind === 'board' && pl.w !== pl.h;
  });
}

function pickText(mode: PickMode, staged: Placement | null): string {
  const v = view.value;
  if (mode.kind === 'route') {
    const n = mode.placements.length;
    const i = Math.max(0, activeCandidate.value);
    const p = mode.placements[i] as RoutePlacementT | undefined;
    return p ? `Haul ${i + 1} of ${n} · ${describeHaul(p, v)}` : mode.label;
  }
  if (staged) return describePlacement(staged, v);
  // Keyboard players stepping with [ / ]: say which spot the ghost is on (read by the status role).
  const i = activeCandidate.value;
  const at = keyboardUser.value && i >= 0 ? mode.placements[i] : undefined;
  if (at) return `Spot ${i + 1} of ${mode.placements.length} · ${describePlacement(at as Placement, v)}. Enter places it.`;
  const o = campaignTurns(mode) && ghostOrientation.value ? ORIENT_LABEL[ghostOrientation.value] : '';
  return `${mode.label}${o ? ` (${o})` : ''}: pick a highlighted spot`;
}

/** On touch, the board square just tapped has no legal spot: the engine's reason, for a moment. */
function useIllegalTap(): string | null {
  const flash = useSignal<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let check: ReturnType<typeof setTimeout> | null = null;
    const show = (r: string) => {
      flash.value = r;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (flash.value = null), 2600);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const t = e.target as Element | null;
      const onBoard = (t instanceof HTMLCanvasElement && Boolean(t.closest('#board-root'))) || Boolean(t?.closest?.('.board2d svg'));
      if (!onBoard) return;
      // The board publishes the tapped square; the controller answers with the reason.
      if (check) clearTimeout(check);
      check = setTimeout(() => {
        const r = placementReason.peek();
        if (r && !pendingPlacement.peek()) show(r);
      }, 60);
    };
    window.addEventListener('pointerup', up, true);
    // A legal spot staged: the instruction takes over again.
    const off = effect(() => {
      if (pendingPlacement.value) flash.value = null;
    });
    return () => {
      window.removeEventListener('pointerup', up, true);
      off();
      if (timer) clearTimeout(timer);
      if (check) clearTimeout(check);
    };
  }, []);
  return flash.value;
}

/** Instruction + Rotate / Confirm / Cancel. Desktop: above the camera bar; phone: the bottom strip. */
function PickStrip({ mode, is3d }: { mode: PickMode; is3d: boolean }) {
  const notHere = useIllegalTap();
  const staged = pendingPlacement.value;
  const route = mode.kind === 'route';
  const n = mode.placements.length;
  const orient = ghostOrientation.value;
  const canRotate = staged ? pendingVariants.value > 1 : campaignTurns(mode) && (orient === 'landscape' || orient === 'portrait');
  const canConfirm = Boolean(staged) || (route && activeCandidate.value >= 0);
  return (
    <div class={`pick-strip glass ${staged ? 'is-staged' : ''} ${notHere && !staged ? 'is-illegal' : ''} ${is3d ? '' : 'is-2d'}`} role="group" aria-label="Board pick" data-tutorial="pick-strip">
      <span class="pick-text" role="status">
        {notHere && !staged ? `Not here: ${notHere}` : pickText(mode, staged)}
      </span>
      <span class="pick-actions">
        {route && n > 1 && (
          <>
            <IconButton icon="chevronLeft" label="Previous haul" onClick={() => cycleCandidate(-1)} />
            <IconButton icon="chevronRight" label="Next haul" onClick={() => cycleCandidate(1)} />
          </>
        )}
        {canRotate && (
          <Button size="sm" variant="secondary" icon="rotateRight" data-tutorial="rotate" onClick={() => rotatePlacement()}>
            Rotate
          </Button>
        )}
        <Button size="sm" variant="primary" icon="check" data-tutorial="confirm" disabled={!canConfirm} onClick={() => confirmPlacement()}>
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
      const t = e.target as Element | null;
      const onBoard = (t instanceof HTMLCanvasElement && Boolean(t.closest('#board-root'))) || Boolean(t?.closest?.('.board2d svg'));
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
