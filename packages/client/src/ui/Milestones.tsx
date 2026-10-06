/** Milestones tab (architecture §5.4): every milestone in play, who claimed it, and when it goes away. */
import { milestoneName } from '../state/catalog.js';
import { milestoneRows } from '../state/selectors.js';
import { catalog, me, view } from '../state/store.js';
import { Empty, PlayerBadge, Pill } from './common.js';
import { Icon } from './icons.js';
import { milestoneTermId } from './glossary/index.js';
import { WhatsThis } from './glossary/WhatsThis.js';

export function Milestones() {
  const v = view.value;
  if (!v) return null;
  const c = catalog.value;
  const rows = milestoneRows(v).sort((a, b) => Number(a.removed) - Number(b.removed) || Number(b.available) - Number(a.available));
  if (!rows.length) return <Empty icon="star">No milestones in this game.</Empty>;
  return (
    <ul class="milestones">
      {rows.map((r) => {
        const d = c.milestones[r.id];
        const mine = me.value ? r.claimedBy.includes(me.value) : false;
        return (
          <li key={r.id} data-flip={`milestone:${r.id}`} data-tutorial={`milestone-${r.id}`} class={`milestone ${r.removed ? 'is-removed' : ''} ${mine ? 'is-mine' : ''} ${r.claimedBy.length ? 'is-claimed' : ''}`}>
            <span class="milestone-icon">{Icon.star({ size: 18 })}</span>
            <span class="milestone-body">
              <b>
                {milestoneName(c, r.id)}
                <WhatsThis id={milestoneTermId(r.id)} label={milestoneName(c, r.id)} />
              </b>
              {d?.text && <span class="small">{d.text}</span>}
              <span class="milestone-meta">
                {r.claimedBy.map((id) => (
                  <PlayerBadge key={id} view={v} id={id} size={22} />
                ))}
                {r.removed ? (
                  <Pill>Gone</Pill>
                ) : r.claimedBy.length ? (
                  <Pill tone="warn">Removed at clean up</Pill>
                ) : (
                  <Pill tone="ok">Open</Pill>
                )}
                {r.removeAfterRound !== null && !r.removed && <Pill tone="danger">Until round {r.removeAfterRound}</Pill>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
