/**
 * Coach hint cards at the top of the Turn panel (at most two), plus the game-menu controls for the
 * coach level and the rules book. Hints are offers: small, dismissable, never blocking.
 */
import { useMemo } from 'preact/hooks';
import { interactionMode } from '../../state/boardBridge.js';
import { outlookFor, reachPreview } from '../../state/guidance.js';
import { hoverPlacement, pendingPlacement, previewGood } from '../../state/interaction.js';
import { catalog, draft, me, prompt, view } from '../../state/store.js';
import { ceoSlotsOf } from '../../state/orgChart.js';
import { Segmented } from '../common.js';
import { Icon } from '../icons.js';
import { openRules, whatsThis } from '../glossary/api.js';
import { closedHints, closeHint, coachLevel, dismissedHints, dismissHint, resetHints, setCoachLevel, type CoachLevel } from './coach.js';
import { coachHints } from './rules.js';
import './hints.css';

const MAX_SHOWN = 2;

export function CoachHints() {
  const v = view.value;
  const who = me.value;
  const level = coachLevel.value;
  const d = draft.value;
  const pr = prompt.value;
  const mode = interactionMode.value;
  const ghost = mode.kind === 'campaign' ? (pendingPlacement.value ?? hoverPlacement.value?.placement ?? null) : null;
  const good = previewGood.value;

  const ghostReach = useMemo(() => {
    if (!v || !ghost || ghost.kind !== 'campaign' || ghost.placement.kind !== 'board') return null;
    return reachPreview(v, who, ghost, good)?.houses.length ?? null;
  }, [v, who, ghost, good]);

  const hints = useMemo(() => {
    if (!v || level === 'off') return [];
    return coachHints(
      {
        view: v,
        me: who,
        catalog: catalog.value,
        draft: d,
        ceoSlots: pr?.kind === 'restructure' ? pr.ceoSlots : who ? ceoSlotsOf(v, who) : v.ceoSlots,
        ghostReach,
        outlook: (hid) => outlookFor(v, who, hid),
      },
      level,
    );
  }, [v, who, level, d, pr, ghostReach]);

  const shown = hints.filter((h) => !dismissedHints.value.has(h.id) && !closedHints.value.has(`${h.id}:${h.key}`)).slice(0, MAX_SHOWN);
  if (!shown.length) return null;
  return (
    <div class="coach-hints" role="status" aria-live="polite" aria-label="Coach hints">
      {shown.map((h) => (
        <div key={`${h.id}:${h.key}`} class={`coach-hint is-${h.level}`} data-hint={h.id}>
          <span class="coach-hint-icon" aria-hidden="true">
            {Icon.sparkle({ size: 14 })}
          </span>
          <p class="coach-hint-text">
            {h.text}{' '}
            <span class="coach-links">
              <button type="button" class="coach-link" onClick={(e) => whatsThis(h.term, e.currentTarget as Element)}>
                What’s this?
              </button>
              <button type="button" class="coach-never" onClick={() => dismissHint(h.id)}>
                Don’t show again
              </button>
            </span>
          </p>
          <button type="button" class="icon-btn coach-x" aria-label="Hide this hint" title="Hide" onClick={() => closeHint(`${h.id}:${h.key}`)}>
            {Icon.x({ size: 14 })}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Game-menu block: coach level and the rules book. */
export function GameMenuExtras() {
  return (
    <div class="field coach-setting">
      <span class="field-label">Coach hints</span>
      <Segmented<CoachLevel>
        label="Coach hints"
        value={coachLevel.value}
        onChange={setCoachLevel}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'light', label: 'Light' },
          { value: 'full', label: 'Full' },
        ]}
      />
      <span class="small muted">Light: what the rules let you do. Full: also what is probably wise.</span>
      {dismissedHints.value.size > 0 && (
        <button type="button" class="link-btn small" onClick={resetHints}>
          Show {dismissedHints.value.size} hidden hint{dismissedHints.value.size === 1 ? '' : 's'} again
        </button>
      )}
      <button type="button" class="btn btn-secondary btn-md coach-rules" onClick={() => openRules()}>
        {Icon.log({ size: 18 })}
        <span>Rules &amp; glossary</span>
      </button>
    </div>
  );
}
