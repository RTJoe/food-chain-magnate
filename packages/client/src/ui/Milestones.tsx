/**
 * Milestones tab (architecture §5.4): the milestone board as the Special Edition's chrome tray
 * (docs/art-bible.md §4 "Milestone tiles"; rb-base-p35-milestone-list-tray.png,
 * se-milestone-tray-xango-tiles-closeup.jpg). Felt in the viewer's chain colour, tiles in rulebook
 * order with a family-colour band (condensed italic caps title), the key value in script, a short
 * line and a small illustration. Claimed by me: the green tick token over the band; gone: the red
 * X token; claimed by others this round: their chain marks.
 */
import type { ComponentChildren } from "preact";
import type {
  EmployeeId,
  FoodId,
  GameView,
  MilestoneDef,
  MilestoneId,
  PlayerId,
} from "@fcm/engine";
import {
  employeeName,
  foodName,
  milestoneName,
  type Catalog,
} from "../state/catalog.js";
import { milestoneRows, type MilestoneRow } from "../state/selectors.js";
import { catalog, me, view } from "../state/store.js";
import {
  CHAIN_NAMES,
  MILESTONE_BANDS,
  playerColorFor,
  type MilestoneBand,
} from "../theme.js";
import { Empty, PlayerBadge } from "./common.js";
import { FoodIcon, Icon, MarkToken } from "./icons.js";
import { NoteBundle } from "./money.js";
import { milestoneTermId } from "./glossary/index.js";
import { WhatsThis } from "./glossary/WhatsThis.js";

/** Base milestones in the tray's printed order (rulebook p.35): 3 rows of 6. */
const BASE_ORDER: readonly MilestoneId[] = [
  "first_train",
  "first_hire_3",
  "first_pay_20",
  "first_waitress",
  "first_20",
  "first_100",
  "first_errand_boy",
  "first_cart_operator",
  "first_burger_produced",
  "first_pizza_produced",
  "first_throw_away",
  "first_lower_prices",
  "first_burger_marketed",
  "first_pizza_marketed",
  "first_drink_marketed",
  "first_billboard",
  "first_airplane",
  "first_radio",
];

const BAND_BY_CARD: Record<string, MilestoneBand> = {
  black: "grey",
  grey: "grey",
  ceo: "grey",
  purple: "purple",
  red: "red",
  salmon: "salmon",
  blue: "blue",
  oliveGreen: "green",
  lightGreen: "lightGreen",
  teal: "green",
};

type Art =
  | { kind: "cash" }
  | { kind: "good"; good: FoodId }
  | { kind: "plane" }
  | { kind: "radio" }
  | { kind: "billboard" }
  | { kind: "people" };

export interface MilestoneFace {
  band: MilestoneBand;
  /** Key value in script (`+$5`, `$15`, `+2`), when the tile has one. */
  value?: string;
  text: string;
  art?: Art;
}

const goodLabel = (c: Catalog, g: string) =>
  g === "anyDrink" ? "drink" : foodName(c, g as FoodId).toLowerCase();
const goodArt = (g: string): Art => ({
  kind: "good",
  good: g === "anyDrink" ? "soft_drink" : (g as FoodId),
});
const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n)}`;

/** Band, value, line and illustration of a milestone tile, from its trigger and first effect. */
export function milestoneFace(
  c: Catalog,
  d: MilestoneDef | undefined,
): MilestoneFace {
  if (!d) return { band: "grey", text: "" };
  const t = d.trigger;
  const firstEmp =
    "employees" in t ? (t.employees[0] as EmployeeId | undefined) : undefined;
  const band: MilestoneBand =
    t.kind === "campaignPlaced" || t.kind === "demandSoldByOther"
      ? "blue"
      : t.kind === "produced" || t.kind === "discarded" || t.kind === "sold"
        ? "green"
        : t.kind === "startOfDinnertime"
          ? "salmon"
          : t.kind === "cash" || t.kind === "houseBuilt"
            ? "purple"
            : t.kind === "restaurantPlaced"
              ? "red"
              : firstEmp
                ? (BAND_BY_CARD[c.employees[firstEmp]?.colour ?? "grey"] ??
                  "grey")
                : "grey";
  const e = d.effects[0];
  const art: Art | undefined =
    t.kind === "campaignPlaced" && t.good
      ? goodArt(t.good)
      : t.kind === "produced"
        ? goodArt(t.food)
        : t.kind === "sold"
          ? goodArt(t.good)
          : t.kind === "campaignPlaced" && t.campaignKind === "airplane"
            ? { kind: "plane" }
            : t.kind === "campaignPlaced" && t.campaignKind === "radio"
              ? { kind: "radio" }
              : t.kind === "campaignPlaced" && t.campaignKind === "billboard"
                ? { kind: "billboard" }
                : t.kind === "cash" || t.kind === "salaryPaid"
                  ? { kind: "cash" }
                  : undefined;
  const face = (
    value: string | undefined,
    text: string,
    a: Art | undefined = art,
  ): MilestoneFace => ({ band, value, text, art: a });
  switch (e?.kind) {
    case "salaryDiscount":
      return face(`$${e.amount}`, "salary discount", { kind: "cash" });
    case "gainEmployees": {
      const n = e.employees.reduce((s, x) => s + x.count, 0);
      const names = [...new Set(e.employees.map((x) => employeeName(c, x.id)))];
      return face(
        `+${n}`,
        `${names.join(", ")}${n > 1 && names.length === 1 ? "s" : ""}`,
        art ?? { kind: "people" },
      );
    }
    case "saleBonus":
      return face(
        money(e.amount),
        `for every ${goodLabel(c, e.good)} sold`,
        goodArt(e.good),
      );
    case "buyerPerSourceBonus":
      return face(
        `+${e.amount}`,
        "drink from each Errand Boy and drink supplier",
        goodArt("lemonade"),
      );
    case "buyerRangeBonus":
      return face(`+${e.amount}`, "range on drink routes", goodArt("beer"));
    case "waitressTip":
      return face(money(e.amount), "for each Waitress played", {
        kind: "cash",
      });
    case "unitPrice":
      return face(money(e.delta), "item price", { kind: "cash" });
    case "orderSlots":
      return face(`+${e.amount}`, "open slots when determining turn order", {
        kind: "plane",
      });
    case "radioTokens":
      return face(undefined, "Double demand from radio campaigns", {
        kind: "radio",
      });
    case "freezer":
      return face(
        undefined,
        `Get a freezer that stores ${e.capacity} food or drink items`,
        goodArt("pizza"),
      );
    case "peekReserves":
      return face(undefined, "May see Bank Reserve cards", { kind: "cash" });
    case "ceoIsCfo":
      return face(
        undefined,
        "CEO counts as CFO (earn +50% cash). May not have a CFO",
        { kind: "cash" },
      );
    case "noMarketeerSalary":
    case "eternalCampaigns":
      return face(
        undefined,
        "No salaries for marketeers. All campaigns are eternal",
        { kind: "billboard" },
      );
    case "stackTraining":
      return face(
        undefined,
        "May use multiple Train actions on the same employee",
        { kind: "cash" },
      );
    default:
      return face(undefined, d.text);
  }
}

function TileArt({ art }: { art: Art }) {
  switch (art.kind) {
    case "cash":
      return <NoteBundle size={30} />;
    case "good":
      return <FoodIcon food={art.good} size={26} />;
    case "people":
      return Icon.users({ size: 22 });
    case "plane":
      return (
        <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
          <path
            d="M3 9.5c4-1.4 13-2 20-1.4 3 .2 5.4 1.2 6.4 2.4-1 1.2-3.4 2-6.4 2.2-7 .4-16-.2-20-1.6Z"
            fill="#e8c43a"
            stroke="#3a2c22"
            stroke-width="0.8"
          />
          <path
            d="M12 9l5-7h2.6l-2.4 7ZM12 11.4l5 6.8h2.6l-2.4-6.8ZM3.6 9.6 1.4 5.4h2.4l3 4Z"
            fill="#4a6fba"
            stroke="#3a2c22"
            stroke-width="0.7"
          />
          <circle cx="29.6" cy="10.5" r="1.2" fill="#3a2c22" />
        </svg>
      );
    case "radio":
      return (
        <svg width="18" height="28" viewBox="0 0 18 28" aria-hidden="true">
          <path
            d="M9 4 3 27h12Z"
            fill="none"
            stroke="#aa3839"
            stroke-width="1.6"
          />
          <path
            d="M7.6 10h2.8M6.4 15h5.2M5 21h8M7.6 10l3.6 5M10.4 10l-3.6 5M6.4 15l6.4 6M11.6 15l-6.4 6"
            stroke="#aa3839"
            stroke-width="1"
          />
          <circle
            cx="9"
            cy="3.4"
            r="2.4"
            fill="#e53d49"
            stroke="#3a2c22"
            stroke-width="0.6"
          />
        </svg>
      );
    case "billboard":
      return (
        <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
          <rect
            x="1.5"
            y="1.5"
            width="29"
            height="10"
            rx="2"
            fill="#2deedd"
            stroke="#4d6b68"
            stroke-width="1.6"
          />
          <path
            d="M5 12v6M27 12v6M5 15h22M5 12l5 6M10 12l-5 6M27 12l-5 6M22 12l5 6M13 12l3 6M19 12l-3 6"
            stroke="#4d6b68"
            stroke-width="0.9"
          />
        </svg>
      );
  }
}

/** Rulebook order first, then the rest (Ketchup, New Milestones) by band and name. */
function trayOrder(c: Catalog, rows: MilestoneRow[]): MilestoneRow[] {
  const bandRank: MilestoneBand[] = [
    "grey",
    "purple",
    "red",
    "lightGreen",
    "green",
    "salmon",
    "blue",
  ];
  const rank = (r: MilestoneRow) => {
    const i = BASE_ORDER.indexOf(r.id);
    return i >= 0
      ? i
      : 100 + bandRank.indexOf(milestoneFace(c, c.milestones[r.id]).band) * 100;
  };
  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      milestoneName(c, a.id).localeCompare(milestoneName(c, b.id)),
  );
}

function statusText(r: MilestoneRow, mine: boolean, names: string): string {
  if (mine) return "Claimed by you";
  if (r.removed)
    return r.claimedBy.length ? `Gone, claimed by ${names}` : "Gone";
  if (r.claimedBy.length) return `Claimed by ${names}: closes at Clean up`;
  return r.removeAfterRound !== null
    ? `Open until round ${r.removeAfterRound}`
    : "Open";
}

function Tile({
  v,
  r,
  me: viewer,
}: {
  v: GameView;
  r: MilestoneRow;
  me: PlayerId | null;
}) {
  const c = catalog.value;
  const d = c.milestones[r.id];
  const name = milestoneName(c, r.id);
  const f = milestoneFace(c, d);
  const b = MILESTONE_BANDS[f.band];
  const mine = viewer ? r.claimedBy.includes(viewer) : false;
  const others = r.claimedBy.filter((id) => id !== viewer);
  const names = r.claimedBy
    .map((id) => (id === viewer ? "you" : (v.players[id]?.name ?? id)))
    .join(", ");
  const status = statusText(r, mine, names);
  const token: ComponentChildren = mine ? (
    <span class="ms-token is-tick" aria-hidden="true">
      <MarkToken kind="tick" size={34} />
    </span>
  ) : r.removed ? (
    <span class="ms-token is-x" aria-hidden="true">
      <MarkToken kind="x" size={30} />
    </span>
  ) : null;
  return (
    <li
      data-flip={`milestone:${r.id}`}
      data-tutorial={`milestone-${r.id}`}
      class={`milestone ms-tile ${r.removed ? "is-removed" : ""} ${mine ? "is-mine" : ""} ${r.claimedBy.length ? "is-claimed" : ""}`}
      style={{ "--mb": b.band, "--mi": b.ink }}
      title={`${name}: ${d?.text ?? ""} (${status})`}
    >
      <span class="ms-band">
        <b class="ms-title">{name}</b>
      </span>
      <span class="ms-body">
        {f.value && <span class="ms-value">{f.value}</span>}
        <span class="ms-text">{f.text}</span>
        {f.art && (
          <span class="ms-art">
            <TileArt art={f.art} />
          </span>
        )}
      </span>
      {token}
      {others.length > 0 && (
        <span class="ms-claims">
          {others.map((id) => (
            <PlayerBadge key={id} view={v} id={id} size={20} />
          ))}
        </span>
      )}
      {r.removeAfterRound !== null && !r.removed && !mine && (
        <span class="ms-until">Until round {r.removeAfterRound}</span>
      )}
      <span class="sr-only">{status}.</span>
      <WhatsThis id={milestoneTermId(r.id)} label={name} class="ms-wt" />
    </li>
  );
}

export function Milestones() {
  const v = view.value;
  if (!v) return null;
  const c = catalog.value;
  const rows = trayOrder(c, milestoneRows(v));
  if (!rows.length)
    return <Empty icon="star">No milestones in this game.</Empty>;
  const viewer = me.value;
  const p = viewer ? v.players[viewer] : undefined;
  const felt = playerColorFor(p?.color)?.felt;
  const chain = p?.chain ? CHAIN_NAMES[p.chain] : null;
  return (
    <div class="ms-tray" style={felt ? { "--felt": felt } : undefined}>
      <ul class="milestones ms-felt" aria-label="Milestones">
        {rows.map((r) => (
          <Tile key={r.id} v={v} r={r} me={viewer} />
        ))}
      </ul>
      <span class="ms-plate" aria-hidden="true">
        {chain ?? "Food Chain Magnate"}
      </span>
    </div>
  );
}
