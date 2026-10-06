/** Badges shelf (docs/tutorial-plan.md §4.5): course badges and one per passed lesson. */
import { COURSE_BADGES, LESSONS, lessonBadgeId, lessonBadgeLabel } from '../../tutorial/catalog.js';
import { learnProgress } from '../../tutorial/progress.js';
import { Icon } from '../icons.js';

export function Badges() {
  const earned = new Set(learnProgress.value.badges);
  const lessonBadges = [...LESSONS.values()].filter((l) => l.course !== 'dev' && earned.has(lessonBadgeId(l)));
  return (
    <section class="learn-badges glass" aria-label="Badges">
      <h2>Badges</h2>
      <ul class="badge-list">
        {COURSE_BADGES.map((b) => (
          <li key={b.id} class={`badge ${earned.has(b.id) ? 'is-earned' : 'is-locked'}`} title={b.description} data-badge={b.id}>
            {earned.has(b.id) ? Icon.trophy({ size: 16 }) : Icon.star({ size: 16 })} {b.label}
          </li>
        ))}
        {lessonBadges.map((l) => (
          <li key={l.id} class="badge is-earned" data-badge={lessonBadgeId(l)}>
            {Icon.check({ size: 16 })} {lessonBadgeLabel(l)}
          </li>
        ))}
      </ul>
    </section>
  );
}
