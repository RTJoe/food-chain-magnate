/**
 * Gourmet guide (ux-plan §2.4, WP5): a campaign with nowhere to aim. Pick the guide number, the
 * good and the duration; the board stages the guide stand on the rim at once (one spot), so
 * Confirm is the only step left. Other campaign kinds use the base campaign flow.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { FoodId, Placement } from '@fcm/engine';
import { boardModeFor, type CampaignPlacementT } from '../../state/guidance.js';
import { confirmPlacement, pendingPlacement, previewGood } from '../../state/interaction.js';
import { catalog, myPlayer } from '../../state/store.js';
import { Button, Stepper } from '../common.js';
import { CampaignFlow } from './Campaign.js';
import { commitPlacement, FlowHead, GoodChips, marketableFoods, NoSpots, PlacementRows, playerColor, useBoardMode, useMirror } from './shared.js';
import type { FlowComponent, FlowProps } from './types.js';

export function KetchupGuideFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const c = catalog.value;
  const guides = placements.filter((p): p is CampaignPlacementT => p.kind === 'campaign' && p.placement.kind === 'offBoard');
  const numbers = useMemo(() => [...new Set(guides.map((g) => g.tileNumber))].sort((a, b) => a - b), [placements]);
  const token = useSignal<number | null>(numbers[0] ?? null);
  const good = useSignal<FoodId | null>(null);
  useMirror(good.value, (g) => (previewGood.value = g), null);
  const card = legal.cardUid ? myPlayer.value?.employees[legal.cardUid] : undefined;
  const ability = card ? c.employees[card.employeeId]?.ability : undefined;
  const maxDuration = ability?.kind === 'marketing' ? ability.maxDuration : 1;
  const duration = useSignal(maxDuration);
  const held = useSignal<Placement | null>(null);
  const chosen = guides.filter((g) => g.tileNumber === token.value);
  const mode = useMemo(() => (chosen.length ? boardModeFor(legal, chosen, { color: playerColor(), tileNumber: token.value, label: `Gourmet guide #${token.value}` }) : null), [token.value, placements]);
  const commit = (p: Placement, g = good.value) => {
    if (!g) {
      held.value = p;
      return;
    }
    if (commitPlacement(legal, p, { goods: [g], duration: duration.value })) onDone();
  };
  useBoardMode(mode, { onPlacement: (p) => commit(p), onCancel });
  const setGood = (f: FoodId) => {
    good.value = f;
    if (held.value) commit(held.value, f);
  };

  return (
    <div class="flow kf-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      <p class="muted small">A gourmet guide sits beside the board and markets to every house with a garden.</p>
      {guides.length === 0 ? (
        <NoSpots />
      ) : (
        <>
          {numbers.length > 1 && (
            <div class="kf-step">
              <span class="field-label">Guide</span>
              <div class="kf-pieces" role="radiogroup" aria-label="Gourmet guide">
                {numbers.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={token.value === n} class={`kf-piece ${token.value === n ? 'is-on' : ''}`} onClick={() => (token.value = n)}>
                    <span class="kf-piece-label">#{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div class="flow-options">
            <span class="field-label">Advertise</span>
            <GoodChips foods={marketableFoods()} value={good.value} onChange={setGood} />
            {maxDuration > 1 && (
              <label class="field-inline">
                <span class="field-label">Duration</span>
                <Stepper label="turns" value={duration.value} min={1} max={maxDuration} onChange={(n) => (duration.value = n)} />
              </label>
            )}
          </div>
          {pendingPlacement.value && (
            <div class="row">
              <Button size="sm" variant="primary" icon="check" disabled={!good.value} onClick={confirmPlacement}>
                {good.value ? `Place guide #${token.value}` : 'Choose a good first'}
              </Button>
            </div>
          )}
          <PlacementRows placements={chosen} onPick={(p) => commit(p)} />
        </>
      )}
    </div>
  );
}

/** Campaigns: gourmet guides get their own flow; every other kind keeps the base campaign flow. */
export const KetchupCampaignFlow: FlowComponent = (props) => (props.spec.campaignKind === 'gourmetGuide' ? <KetchupGuideFlow {...props} /> : <CampaignFlow {...props} />);
