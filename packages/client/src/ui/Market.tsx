/** Employee market (architecture §5.4 EmployeeMarket): piles left and career paths of the cards in this game. */
import { useSignal } from "@preact/signals";
import type { EmployeeId } from "@fcm/engine";
import { employeeName } from "../state/catalog.js";
import { careerForest, type CareerNode } from "../state/selectors.js";
import { catalog, view } from "../state/store.js";
import { EmployeeCard, Empty, Toggle } from "./common.js";
import { employeeTermId } from "./glossary/index.js";
import { WhatsThis } from "./glossary/WhatsThis.js";

export function Market() {
  const v = view.value;
  const onlyEntry = useSignal(false);
  const picked = useSignal<EmployeeId | null>(null);
  if (!v) return null;
  const c = catalog.value;
  const inGame = Object.keys(v.supply) as EmployeeId[];
  if (!inGame.length)
    return <Empty icon="users">No employee piles in this game.</Empty>;
  const forest = careerForest(c, inGame);
  const detail = picked.value ? c.employees[picked.value] : undefined;

  // One block per career tree, its cards in training order (each card prints where it trains to).
  const flat = (n: CareerNode, seen: Set<EmployeeId>): EmployeeId[] => {
    if (seen.has(n.id)) return [];
    seen.add(n.id);
    return [n.id, ...n.children.flatMap((ch) => flat(ch, seen))];
  };
  const card = (id: EmployeeId) => {
    const left = v.supply[id] ?? 0;
    return (
      <EmployeeCard
        key={id}
        id={id}
        selected={picked.value === id}
        dimmed={left <= 0}
        onClick={() => (picked.value = picked.value === id ? null : id)}
        footer={
          <span class={`supply-tag ${left <= 0 ? "is-out" : ""}`}>
            ×{left} left
          </span>
        }
      />
    );
  };

  return (
    <div class="market">
      <Toggle
        checked={onlyEntry.value}
        onChange={(b) => (onlyEntry.value = b)}
        label={
          <>
            Entry level only <WhatsThis id="entry_level" />
          </>
        }
        description={
          <>
            Cards you can hire directly. Piles are limited{" "}
            <WhatsThis id="supply" label="Supply piles" />
          </>
        }
      />
      {detail && (
        <div class="market-detail glass-inner" role="status">
          <b>
            {employeeName(c, detail.id)}
            <WhatsThis
              id={employeeTermId(detail.id)}
              label={employeeName(c, detail.id)}
            />
          </b>
          <p class="small">{detail.text}</p>
          <p class="muted small">
            {v.supply[detail.id] ?? 0} left
            {detail.salary ? " · salary $5" : " · no salary"}
            {detail.unique ? " · 1x" : ""}
            {detail.trainsInto.length
              ? ` · trains into ${detail.trainsInto.map((t) => employeeName(c, t)).join(", ")}`
              : ""}
          </p>
        </div>
      )}
      {onlyEntry.value ? (
        <div class="card-grid career-forest">
          {forest.map((n) => card(n.id))}
        </div>
      ) : (
        <ul class="career-forest">
          {forest.map((n) => (
            <li key={n.id} class="career-tree">
              {n.children.length > 0 && <h4>{employeeName(c, n.id)} career</h4>}
              <div class="card-grid">{flat(n, new Set()).map(card)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
