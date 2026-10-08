/**
 * Gourmet guide (ux-plan §2.4, WP5): a campaign with nowhere to aim. Pick the guide number, the
 * good and the duration (KX p27: 1-3 item counters); once the good is chosen the board stages the
 * guide stand on the rim (one spot) and Launch confirms. A pick made before the good is chosen is
 * held until the player launches it: choosing the good never launches by itself. Other campaign
 * kinds use the base campaign flow.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { FoodId, Placement } from '@fcm/engine';
import { describePlacement } from '../../state/actions.js';
import { onPick, pickStep } from '../../state/campaignRules.js';
import { boardModeFor, type CampaignPlacementT } from '../../state/guidance.js';
import { confirmPlacement, pendingPlacement, previewGood } from '../../state/interaction.js';
import { catalog, myPlayer, view } from '../../state/store.js';
import { Button, Stepper } from '../common.js';
import { Icon } from '../icons.js';
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
  const step = pickStep(Boolean(good.value), held.value);
  // The board (and its reach ghost) opens only once the good is chosen: no preview of a good the player has not picked.
  const mode = useMemo(
    () => (step === 'pickSpot' && chosen.length ? boardModeFor(legal, chosen, { color: playerColor(), tileNumber: token.value, label: `Gourmet guide #${token.value}` }) : null),
    [token.value, placements, step],
  );
  const commit = (p: Placement) => {
    const g = good.value;
    if (onPick(Boolean(g)) === 'hold' || !g) {
      held.value = p;
      return;
    }
    if (commitPlacement(legal, p, { goods: [g], duration: duration.value })) onDone();
  };
  useBoardMode(mode, { onPlacement: commit, onCancel });
  const setGood = (f: FoodId) => {
    good.value = f;
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
                <Stepper label="rounds" value={duration.value} min={1} max={maxDuration} onChange={(n) => (duration.value = n)} />
              </label>
            )}
          </div>
          {held.value ? (
            <div class="held-pick">
              <span>
                {Icon.pin({ size: 16 })} {describePlacement(held.value, view.value)}
              </span>
              {!good.value && <span class="org-warn small">Choose what to advertise.</span>}
              <div class="row gap">
                <Button size="sm" variant="ghost" onClick={() => (held.value = null)}>
                  Pick again
                </Button>
                <Button size="sm" variant="primary" icon="check" disabled={!good.value} onClick={() => held.value && commit(held.value)}>
                  Launch #{(held.value as CampaignPlacementT).tileNumber}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {pendingPlacement.value && good.value && (
                <div class="row">
                  <Button size="sm" variant="primary" icon="check" onClick={confirmPlacement}>
                    Launch #{token.value}
                  </Button>
                </div>
              )}
              <PlacementRows placements={chosen} onPick={commit} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Campaigns: gourmet guides get their own flow; every other kind keeps the base campaign flow. */
export const KetchupCampaignFlow: FlowComponent = (props) => (props.spec.campaignKind === 'gourmetGuide' ? <KetchupGuideFlow {...props} /> : <CampaignFlow {...props} />);
