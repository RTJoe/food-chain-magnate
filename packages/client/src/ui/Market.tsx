/** Employee market (architecture §5.4 EmployeeMarket): piles left and career paths of the cards in this game. */
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { EmployeeId } from "@fcm/engine";
import { employeeName } from "../state/catalog.js";
import { careerForest, type CareerNode } from "../state/selectors.js";
import { paydayFigures } from "../state/payday.js";
import { catalog, me, view } from "../state/store.js";
import { EmployeeCard, Empty, Toggle } from "./common.js";
import { employeeTermId } from "./glossary/index.js";
import { WhatsThis } from "./glossary/WhatsThis.js";

export function Market() {
  const v = view.value;
  const onlyEntry = useSignal(false);
  const picked = useSignal<EmployeeId | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // The detail opens under the picked card's career block: keep it in view in long lists.
  useEffect(() => {
    detailRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [picked.value]);
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

  // The first career block that shows the picked card hosts its detail (a card can sit in two trees).
  const home = detail ? forest.find((n) => flat(n, new Set()).includes(detail.id))?.id : undefined;
  const mine = me.value;
  const rate = mine && v.players[mine] ? attempt(() => paydayFigures(v, mine).rate) ?? 5 : 5;
  const detailBox = detail && (
        <div class="market-detail glass-inner" role="status" ref={detailRef}>
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
            {detail.salary ? ` · salary $${rate}` : " · no salary"}
            {detail.unique ? " · 1x" : ""}
            {detail.trainsInto.length
              ? ` · trains into ${detail.trainsInto.map((t) => employeeName(c, t)).join(", ")}`
              : ""}
          </p>
        </div>
  );

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
      {onlyEntry.value ? (
        <>
          <div class="card-grid career-forest">
            {forest.map((n) => card(n.id))}
          </div>
          {detailBox}
        </>
      ) : (
        <ul class="career-forest">
          {forest.map((n) => {
            const ids = flat(n, new Set());
            return (
              <li key={n.id} class="career-tree">
                {n.children.length > 0 && <h4>{employeeName(c, n.id)} career</h4>}
                <div class="card-grid">{ids.map(card)}</div>
                {detail && n.id === home && detailBox}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
