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
 * md: the ability text; lg >= 168 px: the training list too). Portraits are our own silhouettes
 * until painted art exists; nothing is copied from the product.
 */
import type { ComponentChildren } from "preact";
import type {
  CardColour,
  EmployeeCategory,
  EmployeeDef,
  EmployeeId,
} from "@fcm/engine";
import { catalog } from "../state/store.js";
import { employeeName, managerSlots } from "../state/catalog.js";
import { CARD_COLORS } from "../theme.js";
import { FoodIcon, Icon, Sparkle } from "./icons.js";
import { NoteBundle } from "./money.js";
import { employeeTermId } from "./glossary/index.js";
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

type Hat = "toque" | "cap" | "fedora" | "waitress" | "curls" | "none";
type Neck = "tie" | "bow" | "collar" | "scarf";

const LOOK: Record<
  EmployeeCategory,
  { hat: Hat; neck: Neck; glasses?: boolean }
> = {
  ceo: { hat: "none", neck: "tie" },
  manager: { hat: "none", neck: "tie" },
  recruiting: { hat: "curls", neck: "collar" },
  training: { hat: "none", neck: "bow", glasses: true },
  marketing: { hat: "fedora", neck: "tie" },
  kitchen: { hat: "toque", neck: "scarf" },
  coffee: { hat: "toque", neck: "bow" },
  buyer: { hat: "cap", neck: "collar" },
  pricing: { hat: "curls", neck: "collar", glasses: true },
  restaurant: { hat: "fedora", neck: "tie" },
  housing: { hat: "none", neck: "tie", glasses: true },
  service: { hat: "waitress", neck: "collar" },
  finance: { hat: "none", neck: "bow", glasses: true },
  lobbying: { hat: "fedora", neck: "bow" },
};

/** Mix `#rrggbb` toward white (t > 0) or black (t < 0). */
function tint(css: string, t: number): string {
  const n = Number.parseInt(css.slice(1), 16);
  const ch = (sh: number) => {
    const v = (n >> sh) & 255;
    return Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** Half-length figure in the family colour on a washed diner (or office) backdrop. */
function Portrait({
  category,
  color,
  dark,
}: {
  category: EmployeeCategory;
  color: string;
  dark: boolean;
}) {
  const look = LOOK[category] ?? LOOK.manager;
  const head = tint(color, 0.62);
  const hair = tint(color, -0.35);
  const wash = dark ? ["#5b5c57", "#43443f"] : ["#e3e7e4", "#c4ccc9"];
  const line = dark ? "#6c6d68" : "#d3d9d6";
  const prop = dark ? "#3a3b37" : "#b4bcb9";
  return (
    <svg
      class="emp-portrait"
      viewBox="0 0 100 70"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <rect width="100" height="70" fill={wash[1]} />
      <rect width="100" height="44" fill={wash[0]} opacity="0.85" />
      {/* Diner / office backdrop: window panes, a shelf, a counter. */}
      <path
        d="M6 6h22v24H6ZM31 6h22v24H31Z"
        fill="none"
        stroke={line}
        stroke-width="1.6"
      />
      <path
        d="M17 6v24M6 18h22M42 6v24M31 18h22"
        stroke={line}
        stroke-width="0.8"
      />
      <path d="M62 22h34M62 34h34" stroke={line} stroke-width="1.4" />
      <path
        d="M66 22v-6h5v6M76 22v-8h4v8M86 22v-5h6v5M68 34v-5h7v5M82 34v-7h4v7"
        fill={prop}
        opacity="0.55"
      />
      <path d="M0 56h100v14H0Z" fill={prop} opacity="0.45" />
      {/* Figure */}
      <g>
        <path d="M24 70c1-12 9-20 26-21 17 1 25 9 26 21Z" fill={color} />
        <path d="M45.5 41h9v8.5c-3 2.4-6 2.4-9 0Z" fill={tint(head, -0.12)} />
        {look.neck === "tie" && (
          <>
            <path d="M43 49.5l7 9 7-9-7 2Z" fill="#fdfcfa" />
            <path d="M48.6 51.6h2.8l1.2 10.4-2.6 3.4-2.6-3.4Z" fill="#c9303c" />
          </>
        )}
        {look.neck === "bow" && (
          <>
            <path d="M43 49.5l7 7 7-7-7 2Z" fill="#fdfcfa" />
            <path
              d="M44.6 51.4l5.4 2.4 5.4-2.4v4.4l-5.4-2-5.4 2Z"
              fill={tint(color, -0.45)}
            />
          </>
        )}
        {look.neck === "collar" && (
          <path d="M42 49.2l8 6 8-6-3 7-5-2.6-5 2.6Z" fill="#fdfcfa" />
        )}
        {look.neck === "scarf" && (
          <path
            d="M43 49.4c4 3 10 3 14 0l-2 5c-3 1.6-7 1.6-10 0Z"
            fill="#fdfcfa"
          />
        )}
        <ellipse cx="50" cy="31" rx="10.5" ry="12.5" fill={head} />
        {look.hat !== "toque" && look.hat !== "waitress" && (
          <path
            d="M39.4 30c-.6-9 4.4-13.6 10.6-13.6S61.2 21 60.6 30c-1.6-4.4-4.4-7-10.6-7.4-6.2.4-9 3-10.6 7.4Z"
            fill={hair}
          />
        )}
        {look.hat === "curls" && (
          <path
            d="M38.6 33c-2.6-3-2-8.6 1-11.6 2-6.4 15-7.4 19.6-1.4 3.4 2.6 4 8.6 1.6 12.6-.4-6-3.4-9.6-10.8-10-7.6.4-10.6 4.4-11.4 10.4Z"
            fill={hair}
          />
        )}
        {look.hat === "toque" && (
          <>
            <path
              d="M39.6 27.6c-.4-4 2.2-5.4 3.8-5.4-3.8-8.6 4.8-12.2 8.2-7.2 3.6-4.4 12-.4 7.8 7.2 1.8 0 4.2 1.6 3.6 5.4Z"
              fill="#fdfcfa"
            />
            <path d="M39.8 25h21v3.4h-21Z" fill="#ece7dc" />
          </>
        )}
        {look.hat === "waitress" && (
          <>
            <path
              d="M39.4 30c-.6-9 4.4-13.6 10.6-13.6S61.2 21 60.6 30c-1.6-4.4-4.4-7-10.6-7.4-6.2.4-9 3-10.6 7.4Z"
              fill={hair}
            />
            <path
              d="M42 19.6c4.6-2.6 11.4-2.6 16 0l-1.6 3c-4-1.6-8.8-1.6-12.8 0Z"
              fill="#fdfcfa"
            />
          </>
        )}
        {look.hat === "cap" && (
          <path
            d="M39.4 25.6c0-6.6 4.6-9.6 10.6-9.6s10.6 3 10.6 9.6l7 1.4c-.4 1.2-1.4 1.6-2.6 1.6H39.4Z"
            fill={tint(color, -0.3)}
          />
        )}
        {look.hat === "fedora" && (
          <>
            <path
              d="M35.4 24.4c4-1.8 25.2-1.8 29.2 0-.6 1.4-1.8 2-3.2 2H38.6c-1.4 0-2.6-.6-3.2-2Z"
              fill={tint(color, -0.5)}
            />
            <path
              d="M41 23.6c0-6.4 3.6-9.4 9-9.4s9 3 9 9.4Z"
              fill={tint(color, -0.5)}
            />
            <path d="M41.2 21.2h17.6v2H41.2Z" fill={tint(color, -0.15)} />
          </>
        )}
        {look.glasses && (
          <path
            d="M42.4 30.6a3.2 2.8 0 1 0 6.4 0a3.2 2.8 0 1 0-6.4 0ZM51.2 30.6a3.2 2.8 0 1 0 6.4 0a3.2 2.8 0 1 0-6.4 0ZM48.8 30.4h2.4"
            fill="none"
            stroke={tint(color, -0.6)}
            stroke-width="1"
          />
        )}
      </g>
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
}: {
  id: EmployeeId;
  plain?: boolean;
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
        <Portrait
          category={d?.category ?? "manager"}
          color={color}
          dark={d?.colour === "ceo"}
        />
        {!plain && (
          <WhatsThis id={employeeTermId(id)} label={name} class="emp-wt" />
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
      />
      {footer && <span class="emp-caption">{footer}</span>}
    </>
  );
  const common = {
    ...(plain ? {} : press),
    class: cls,
    "data-colour": d?.colour ?? "grey",
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
