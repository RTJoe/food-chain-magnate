/** Employee market (architecture §5.4 EmployeeMarket): piles left and career paths of the cards in this game. */
import { useSignal } from '@preact/signals';
import type { EmployeeId } from '@fcm/engine';
import { employeeName } from '../state/catalog.js';
import { careerForest, type CareerNode } from '../state/selectors.js';
import { catalog, view } from '../state/store.js';
import { EmployeeCard, Empty, Toggle } from './common.js';

export function Market() {
  const v = view.value;
  const onlyEntry = useSignal(false);
  const picked = useSignal<EmployeeId | null>(null);
  if (!v) return null;
  const c = catalog.value;
  const inGame = Object.keys(v.supply) as EmployeeId[];
  if (!inGame.length) return <Empty icon="users">No employee piles in this game.</Empty>;
  const forest = careerForest(c, inGame);
  const detail = picked.value ? c.employees[picked.value] : undefined;

  const node = (n: CareerNode, depth: number) => (
    <li key={`${n.id}-${depth}`} class="career-node">
      <EmployeeCard
        id={n.id}
        compact
        selected={picked.value === n.id}
        dimmed={(v.supply[n.id] ?? 0) <= 0}
        onClick={() => (picked.value = picked.value === n.id ? null : n.id)}
        badge={<span class="supply">×{v.supply[n.id] ?? 0}</span>}
      />
      {!onlyEntry.value && n.children.length > 0 && <ul class="career-children">{n.children.map((ch) => node(ch, depth + 1))}</ul>}
    </li>
  );

  return (
    <div class="market">
      <Toggle checked={onlyEntry.value} onChange={(b) => (onlyEntry.value = b)} label="Entry level only" description="Cards you can hire directly." />
      {detail && (
        <div class="market-detail glass-inner" role="status">
          <b>{employeeName(c, detail.id)}</b>
          <p class="small">{detail.text}</p>
          <p class="muted small">
            {v.supply[detail.id] ?? 0} left{detail.salary ? ' · salary $5' : ' · no salary'}
            {detail.unique ? ' · 1x' : ''}
            {detail.trainsInto.length ? ` · trains into ${detail.trainsInto.map((t) => employeeName(c, t)).join(', ')}` : ''}
          </p>
        </div>
      )}
      <ul class="career-forest">{forest.map((n) => node(n, 0))}</ul>
    </div>
  );
}
