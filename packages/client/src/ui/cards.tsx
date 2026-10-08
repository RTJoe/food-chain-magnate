/**
 * Employee cards in the printed layout (docs/art-bible.md §4 "Employee cards";
 * rb-base-p07-card-anatomy-employee-types.png, se-employee-card-tray-kitchen-cards.jpg,
 * se-ceo-cards.jpg): a family-colour title band with a slanted foot and a white script title, the
 * entry-level sparkle top left and the range chip top right, a portrait on a washed diner backdrop,
 * and a cream ability panel with a torn top edge carrying the ability, the work-slot glyph for
 * managers, the training list, the salary bundle and the 1x badge. Plus the card back.
 *
 * One component for every size: the card fills its container (min 96 px wide, ratio 2:3) and a
 * container query chooses how much it prints (sm < 118 px: title, chip, short ability line, icons;
 * md: the ability text; lg >= 168 px: the training list too). Portraits are our own drawings
 * (ui/portraits), with a flat silhouette for any not drawn yet; nothing is copied from the product.
 */
import type { ComponentChildren } from "preact";
import type { CardColour, EmployeeDef, EmployeeId } from "@fcm/engine";
import { catalog } from "../state/store.js";
import { employeeName, managerSlots } from "../state/catalog.js";
import { CARD_COLORS } from "../theme.js";
import { FoodIcon, Icon, Sparkle } from "./icons.js";
import { NoteBundle } from "./money.js";
import { employeeTermId } from "./glossary/index.js";
import { portraitFor, Silhouette } from "./portraits/index.js";
import { useWhatsThisPress, WhatsThis } from "./glossary/WhatsThis.js";

export const bandColor = (c: CardColour | undefined): string =>
  CARD_COLORS[c ?? "grey"] ?? CARD_COLORS.grey;

// --- Range chip ---------------------------------------------------------------------------------

export interface CardRange {
  /** Squares / tiles; null = unlimited. */
  n: number | null;
  /** Travels by air (blimp glyph) instead of along roads (route shield). */
  air: boolean;
}

/** The range printed top right (rulebook p.7 D): road range in a route shield, air range on a blimp. */
export function cardRange(d: EmployeeDef | undefined): CardRange | null {
  const a = d?.ability;
  if (!a) return null;
  switch (a.kind) {
    case "marketing":
    case "restaurant":
      return a.range === "unlimited"
        ? { n: null, air: true }
        : { n: a.range, air: false };
    case "buyDrinks":
      return a.mode === "errand" ? null : { n: a.range, air: a.mode === "air" };
    case "lobbyist":
      return { n: a.range, air: false };
    default:
      return null;
  }
}

function RangeChip({ range }: { range: CardRange }) {
  const label = range.air
    ? `Range ${range.n ?? "unlimited"}, by air`
    : `Range ${range.n}, by road`;
  return (
    <span
      class={`emp-range ${range.air ? "is-air" : ""}`}
      title={label}
      aria-label={label}
      role="img"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {range.air ? (
          <path d="M2.5 12c0-3 4.6-5 10-5 3.4 0 6 .8 7.4 2l2.6-2v10l-2.6-2c-1.4 1.2-4 2-7.4 2-5.4 0-10-2-10-5Z" />
        ) : (
          <path d="M4 3.5c2.6.8 5.4.8 8-.6 2.6 1.4 5.4 1.4 8 .6.6 1.4.8 3 .4 4.6-.6 2-1.6 2.6-1.6 4.8 0 3.6-2.4 6.6-6.8 8.6-4.4-2-6.8-5-6.8-8.6 0-2.2-1-2.8-1.6-4.8-.4-1.6-.2-3.2.4-4.6Z" />
        )}
      </svg>
      <b>{range.n ?? "∞"}</b>
    </span>
  );
}

// --- Ability --------------------------------------------------------------------------------------

/** Work-slot glyph (rulebook p.7 F): a bracket with numbered boxes, for managers and the CEO. */
export function SlotGlyph({ slots }: { slots: number }) {
  const labels =
    slots <= 5
      ? Array.from({ length: slots }, (_, i) => String(i + 1))
      : ["1", "2", "…", String(slots)];
  const n = labels.length;
  const w = n * 9 + (n - 1) * 2;
  return (
    <svg class="emp-slots" viewBox={`0 0 ${w + 2} 22`} aria-hidden="true">
      <rect
        x={w / 2 - 3}
        y="1"
        width="8"
        height="6"
        rx="1"
        fill="none"
        stroke="currentColor"
        stroke-width="1"
      />
      <path
        d={`M${w / 2 + 1} 7v3M${5.5} 13v-3h${w - 9}v3`}
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
      />
      {labels.map((l, i) => (
        <g key={i}>
          <rect
            x={1 + i * 11}
            y="13"
            width="9"
            height="8"
            rx="1"
            fill="#fff"
            stroke="currentColor"
            stroke-width="1"
          />
          {l !== "…" && (
            <text
              x={5.5 + i * 11}
              y="19.6"
              text-anchor="middle"
              font-size={l.length > 1 ? 5 : 6.4}
              font-family="'Barlow Condensed', sans-serif"
              font-weight="700"
              fill="currentColor"
            >
              {l}
            </text>
          )}
          {l === "…" && (
            <circle cx={5.5 + i * 11} cy="17" r="0.9" fill="currentColor" />
          )}
        </g>
      ))}
    </svg>
  );
}

const CAMPAIGN_SHORT: Record<string, string> = {
  billboard: "Billboard",
  mailbox: "Mailbox",
  airplane: "Airplane",
  radio: "Radio",
  giantBillboard: "Giant billboard",
  gourmetGuide: "Gourmet guide",
};

/** One short line for the smallest cards (the full text is in the title and the What's this popover). */
function abilityShort(d: EmployeeDef): ComponentChildren {
  const a = d.ability;
  switch (a.kind) {
    case "ceo":
      return "Hire 1";
    case "manager":
      return a.slots ? null : "No slots";
    case "recruit":
      return `Hire ${a.actions}`;
    case "train":
      return `Train ${a.actions}`;
    case "produce":
      return (
        <>
          {a.amount}
          {a.foods.map((f, i) => (
            <span key={f} class="emp-short-good">
              {i > 0 && "/"}
              <FoodIcon food={f} size={13} />
            </span>
          ))}
        </>
      );
    case "buyDrinks":
      return a.mode === "errand" ? "1 drink" : `${a.perSource} per source`;
    case "marketing":
      return a.campaigns.length > 2
        ? `${a.campaigns.length} kinds, ${a.maxDuration} rds`
        : `${a.campaigns.map((k) => CAMPAIGN_SHORT[k] ?? k).join(" / ")}`;
    case "price":
      return `${a.delta < 0 ? "−" : "+"}$${Math.abs(a.delta)} price`;
    case "waitress":
      return `+$${a.tip} tips`;
    case "cfo":
      return `+${a.percent}% cash`;
    case "newBusiness":
      return "New house";
    case "restaurant":
      return a.mode === "local" ? "New restaurant" : "Restaurant";
    case "lobbyist":
      return "Road / park";
    case "fryChef":
      return `+$${a.bonusPerSale} a house`;
    case "nightShift":
      return "Twice";
    case "movieStar":
      return `${a.rank} star`;
    case "massMarketing":
      return "Extra pass";
    default:
      return null;
  }
}

// --- Portrait -------------------------------------------------------------------------------------

/** The employee's own portrait (ui/portraits), or the flat silhouette until one is drawn. */
function Portrait({ id, color, dark }: { id: EmployeeId; color: string; dark: boolean }) {
  const draw = portraitFor(id);
  return (
    <svg
      class="emp-portrait"
      viewBox="0 0 100 70"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {draw ? draw() : <Silhouette color={color} dark={dark} />}
    </svg>
  );
}

// --- The card -------------------------------------------------------------------------------------

export interface EmployeeCardProps {
  id: EmployeeId;
  /** Kept for callers; every card now prints at the size its container gives it. */
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Cannot be used now: 60 % opacity plus a grey X stamp (never opacity alone). */
  dimmed?: boolean;
  /** Can act now: a green ring. */
  highlight?: boolean;
  /** On the beach (sand plate) or busy on a campaign (teal ribbon). */
  tone?: "beach" | "busy";
  /** Counter sticker on the portrait (uses left, supply). */
  badge?: ComponentChildren;
  /** Caption under the card (status, reason). */
  footer?: ComponentChildren;
  onClick?: () => void;
  draggableUid?: string;
  title?: string;
  /** FLIP key for overlay motion (ui/motion.tsx), e.g. `card:<player>:<uid>`. */
  flip?: string;
  /** Lesson coach-mark target name (`data-tutorial`, docs/tutorial-plan.md §4.4). */
  tutorial?: string;
  /** Fixed width in px (otherwise the container's width). */
  width?: number;
  /** No "What's this?" button (inside the glossary popover itself). */
  plain?: boolean;
}

/** The printed face of an employee card. */
export function CardFace({
  id,
  plain,
  badge,
  tone,
  dimmed,
  nested,
}: {
  id: EmployeeId;
  plain?: boolean;
  /** Inside a clickable card button: the "?" is a pointer target only (see WhatsThis). */
  nested?: boolean;
  badge?: ComponentChildren;
  tone?: "beach" | "busy";
  dimmed?: boolean;
}) {
  const c = catalog.value;
  const d = c.employees[id];
  const name = employeeName(c, id);
  const color = bandColor(d?.colour);
  const range = cardRange(d);
  const slots = d?.ability.kind === "ceo" ? d.ability.slots : managerSlots(d);
  const short = d ? abilityShort(d) : null;
  const trains = (d?.trainsInto ?? []).filter((t) => c.employees[t]);
  return (
    <span class="emp-card" style={{ "--band": color }}>
      <span class="emp-band">
        {d?.entry && (
          <span class="emp-entry" title="Entry level: can be hired directly">
            <Sparkle />
          </span>
        )}
        <span class="emp-name">{name}</span>
        {range && <RangeChip range={range} />}
      </span>
      <span class="emp-art">
        <Portrait id={id} color={color} dark={d?.colour === "ceo"} />
        {!plain && (
          <WhatsThis id={employeeTermId(id)} label={name} class="emp-wt" nested={nested} />
        )}
      </span>
      <span class="emp-panel">
        {slots > 0 && <SlotGlyph slots={slots} />}
        {d?.text && <span class="emp-text">{d.text}</span>}
        {short && <span class="emp-short">{short}</span>}
        <span class="emp-foot">
          {trains.length > 0 && (
            <span
              class="emp-train"
              aria-label={`Trains into ${trains.map((t) => employeeName(c, t)).join(", ")}`}
            >
              {trains.slice(0, 4).map((t) => (
                <span
                  key={t}
                  style={{ color: bandColor(c.employees[t]?.colour) }}
                >
                  ▸ {employeeName(c, t)}
                </span>
              ))}
            </span>
          )}
          <span class="emp-icons">
            {d?.mandatory && (
              <span class="emp-auto" title="Acts automatically">
                auto
              </span>
            )}
            {d?.unique && (
              <span class="emp-unique" title="1x: own at most one">
                1x
              </span>
            )}
            {d?.salary && (
              <span class="emp-salary" title="Costs $5 salary each Payday">
                <NoteBundle />
              </span>
            )}
          </span>
        </span>
      </span>
      {tone === "busy" && <span class="emp-ribbon">Busy</span>}
      {dimmed && (
        <span class="emp-stamp" aria-hidden="true">
          {Icon.x({ size: 18 })}
        </span>
      )}
      {badge && <span class="emp-badge">{badge}</span>}
    </span>
  );
}

/** An employee card (clickable when `onClick` is set; draggable onto org-chart slots). */
export function EmployeeCard({
  id,
  selected,
  disabled,
  dimmed,
  highlight,
  tone,
  badge,
  footer,
  onClick,
  draggableUid,
  title,
  flip,
  tutorial,
  width,
  plain,
}: EmployeeCardProps) {
  const d = catalog.value.employees[id];
  const press = useWhatsThisPress(employeeTermId(id));
  const cls = `emp ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""} ${highlight ? "is-highlight" : ""} ${onClick ? "is-clickable" : ""} ${tone ? `is-${tone}` : ""}`;
  const content = (
    <>
      <CardFace
        id={id}
        plain={plain}
        badge={badge}
        tone={tone}
        dimmed={dimmed}
        nested={Boolean(onClick)}
      />
      {footer && <span class="emp-caption">{footer}</span>}
    </>
  );
  const common = {
    ...(plain ? {} : press),
    class: cls,
    "data-colour": d?.colour ?? "grey",
    "data-emp": id,
    "data-flip": flip,
    "data-tutorial": tutorial,
    title: title ?? d?.text,
    style: width ? { width: `${width}px` } : undefined,
  };
  if (onClick) {
    return (
      <button
        type="button"
        {...common}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`${employeeName(catalog.value, id)}${d?.text ? `: ${d.text}` : ""}`}
        aria-keyshortcuts={plain ? undefined : "?"}
        onClick={onClick}
        draggable={Boolean(draggableUid)}
        onDragStart={
          draggableUid
            ? (e) => e.dataTransfer?.setData("text/fcm-uid", draggableUid)
            : undefined
        }
      >
        {content}
      </button>
    );
  }
  return <div {...common}>{content}</div>;
}

/** The card back: light blue with diagonal cream stripes and our logo badge. */
export function CardBack({ width, label }: { width?: number; label?: string }) {
  return (
    <span
      class="emp-back"
      style={width ? { width: `${width}px` } : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <span class="emp-back-badge">
        <span class="emp-back-top">Food Chain</span>
        <span class="emp-back-script">Magnate</span>
      </span>
    </span>
  );
}
