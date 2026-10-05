/**
 * Extra map tile (Ketchup first lobbyist): pick the leftover template (mini preview from the
 * catalog's tile grids), then the spot on the board; R / Rotate turns it, and the preview turns
 * with the ghost. WP5 may register a richer flow for `mapTile` in ui/flows/ketchup.ts.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { Placement, TileDef, TileTemplateId } from '@fcm/engine';
import { boardModeFor } from '../../state/guidance.js';
import { hoverPlacement, pendingPlacement } from '../../state/interaction.js';
import { catalog, settings } from '../../state/store.js';
import { BoardHint, commitPlacement, FlowHead, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

const CELL_CLASS: Record<string, string> = { '#': 'road', H: 'house', A: 'apartment', '.': 'grass' };

/** 5×5 mini map of a tile template, turned `rotation` quarter turns clockwise. */
export function TilePreview({ tile, rotation = 0, size = 60 }: { tile: TileDef | undefined; rotation?: number; size?: number }) {
  const cell = size / 5;
  if (!tile) return <span class="tile-preview is-blank" style={{ width: size, height: size }} />;
  return (
    <svg class="tile-preview" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: `rotate(${rotation * 90}deg)` }} aria-hidden="true">
      {tile.grid.flatMap((row, y) =>
        [...row].map((g, x) => <rect key={`${x},${y}`} x={x * cell} y={y * cell} width={cell} height={cell} class={`tp-${CELL_CLASS[g] ?? 'drink'}`} />),
      )}
    </svg>
  );
}

export function MapTileFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const c = catalog.value;
  const templates = useMemo(() => [...new Set(placements.flatMap((p) => (p.kind === 'mapTile' ? [p.templateId ?? ''] : [])))], [placements]);
  const chosen = useSignal<string | null>(templates.length === 1 ? (templates[0] ?? null) : null);
  const forTemplate = useMemo(() => (chosen.value === null ? [] : placements.filter((p) => p.kind === 'mapTile' && (p.templateId ?? '') === chosen.value)), [placements, chosen.value]);
  const { onBoard, list } = splitPlacements(forTemplate);
  const mode = useMemo(() => (onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor(), label: chosen.value ? `Tile ${chosen.value}` : legal.label }) : null), [forTemplate]);
  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel: () => (templates.length > 1 && chosen.value !== null ? (chosen.value = null) : onCancel()) });
  const shown = pendingPlacement.value ?? hoverPlacement.value?.placement;
  const rotation = shown?.kind === 'mapTile' ? shown.rotation : 0;

  return (
    <div class="flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      {placements.length === 0 ? (
        <NoSpots />
      ) : (
        <>
          <div class="flow-step">
            <span class="field-label">1 · Tile</span>
            <div class="token-row" role="radiogroup" aria-label="Map tile">
              {templates.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={chosen.value === t} class={`token-card chip-lg ${chosen.value === t ? 'is-on' : ''}`} onClick={() => (chosen.value = chosen.value === t ? null : t)}>
                  <TilePreview tile={c.tiles[t as TileTemplateId]} rotation={chosen.value === t ? rotation : 0} />
                  <span class="token-kind">Tile {t || '?'}</span>
                </button>
              ))}
            </div>
          </div>
          {chosen.value !== null && (
            <>
              <BoardHint count={onBoard.length}>2 · Pick a spot beside the map; R or Rotate turns the tile.</BoardHint>
              <PlacementRows placements={list} onPick={pick} />
            </>
          )}
          {chosen.value === null && settings.value.placementList && <PlacementRows placements={placements} onPick={pick} />}
        </>
      )}
    </div>
  );
}
