/** Small shared building blocks. */
import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import type { EmployeeId, FoodCounts, GameView, PlayerId } from '@fcm/engine';
import { catalog } from '../state/store.js';
import { employeeName, managerSlots } from '../state/catalog.js';
import { foodList, initial, playerMark, seatIndex } from '../state/selectors.js';
import { inkOn } from '../theme.js';
import { FoodIcon, Icon, type IconName } from './icons.js';
import { employeeTermId } from './glossary/index.js';
import { useWhatsThisPress, WhatsThis } from './glossary/WhatsThis.js';

type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export function Button({ variant = 'secondary', size = 'md', icon, busy, children, class: cls, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} class={`btn btn-${variant} btn-${size} ${busy ? 'is-busy' : ''} ${cls ?? ''}`} {...rest}>
      {icon && Icon[icon]({ size: size === 'sm' ? 16 : 18 })}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, class: cls, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon'> & { icon: IconName; label: string; disabled?: boolean }) {
  return (
    <button type="button" class={`icon-btn ${cls ?? ''}`} aria-label={label} title={label} {...rest}>
      {Icon[icon]({ size: 20 })}
    </button>
  );
}

export function Cash({ amount, size = 'md' }: { amount: number; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span class={`cash cash-${size}`}>
      <span class="cash-sign">$</span>
      {amount.toLocaleString()}
    </span>
  );
}

/** Label colour on a seat colour: white or ink, whichever reads better (Mustard, Pickle, Grape take ink). */
const badgeInk = (color: string | undefined, idx: number): string => (color?.startsWith('#') && color.length === 7 ? inkOn(color) : `var(--player-${idx}-ink, #fff)`);

/**
 * Player colour disc with the seat's mark (colour is never the only cue): the same mark the board
 * paints on that player's restaurants, coffee shops and vans (playerMark).
 */
export function PlayerBadge({ view, id, size = 28, ring }: { view: GameView; id: PlayerId; size?: number; ring?: boolean }) {
  const p = view.players[id];
  const idx = seatIndex(view, id);
  const mark = playerMark(view, id);
  return (
    <span
      class={`pbadge ${ring ? 'is-ring' : ''}`}
      style={{ '--pc': p?.color ?? `var(--player-${idx})`, '--pcl': `var(--player-${idx}-light)`, '--pc-ink': badgeInk(p?.color, idx), width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * (mark.length > 1 ? 0.38 : 0.46))}px` }}
      title={p?.name}
    >
      {mark}
    </span>
  );
}

export function SeatBadge({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span class="pbadge" style={{ '--pc': color, '--pc-ink': badgeInk(color, 0), width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.46)}px` }}>
      {initial(name)}
    </span>
  );
}

export function FoodChips({ counts, empty = '—', size = 20 }: { counts: FoodCounts | undefined; empty?: string; size?: number }) {
  const list = foodList(counts);
  if (!list.length) return <span class="muted small">{empty}</span>;
  return (
    <span class="food-chips">
      {list.map(([f, n]) => (
        <span key={f} class="food-chip" title={`${n} ${catalog.value.foods[f]?.name ?? f}`}>
          <FoodIcon food={f} size={size} />
          <b>{n}</b>
        </span>
      ))}
    </span>
  );
}

export function Pill({ children, tone = 'neutral', icon }: { children: ComponentChildren; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'info'; icon?: IconName }) {
  return (
    <span class={`pill pill-${tone}`}>
      {icon && Icon[icon]({ size: 14 })}
      {children}
    </span>
  );
}

export function Section({ title, icon, actions, children, class: cls }: { title: ComponentChildren; icon?: IconName; actions?: ComponentChildren; children: ComponentChildren; class?: string }) {
  return (
    <section class={`section ${cls ?? ''}`}>
      <header class="section-head">
        <h3>
          {icon && Icon[icon]({ size: 16 })}
          {title}
        </h3>
        {actions && <div class="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span class="stepper" role="group" aria-label={label}>
      <button type="button" class="icon-btn" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        {Icon.minus({ size: 16 })}
      </button>
      <output>{value}</output>
      <button type="button" class="icon-btn" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        {Icon.plus({ size: 16 })}
      </button>
    </span>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ComponentChildren; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? 'is-on' : ''}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (b: boolean) => void; label: ComponentChildren; description?: ComponentChildren; disabled?: boolean }) {
  return (
    <label class={`toggle ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span class="toggle-track" aria-hidden="true">
        <span class="toggle-thumb" />
      </span>
      <span class="toggle-text">
        <span class="toggle-label">{label}</span>
        {description && <span class="toggle-desc">{description}</span>}
      </span>
    </label>
  );
}

const CATEGORY_ICON: Record<string, IconName> = {
  ceo: 'crown',
  manager: 'restructure',
  recruiting: 'users',
  training: 'sparkle',
  marketing: 'marketing',
  kitchen: 'dinner',
  coffee: 'dinner',
  buyer: 'store',
  pricing: 'cash',
  restaurant: 'store',
  housing: 'home',
  service: 'star',
  finance: 'bank',
  lobbying: 'map',
};

export interface EmployeeCardProps {
  id: EmployeeId;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  badge?: ComponentChildren;
  footer?: ComponentChildren;
  onClick?: () => void;
  draggableUid?: string;
  title?: string;
  /** FLIP key for overlay motion (ui/motion.tsx), e.g. `card:<player>:<uid>`. */
  flip?: string;
  /** Lesson coach-mark target name (`data-tutorial`, docs/tutorial-plan.md §4.4). */
  tutorial?: string;
}

/** An employee card: colour strip by card group, icons for entry / salary / 1x, manager slots. */
export function EmployeeCard({ id, compact, selected, disabled, dimmed, highlight, badge, footer, onClick, draggableUid, title, flip, tutorial }: EmployeeCardProps) {
  const d = catalog.value.employees[id];
  const slots = managerSlots(d);
  const press = useWhatsThisPress(employeeTermId(id));
  const cls = `emp ${compact ? 'is-compact' : ''} ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''} ${highlight ? 'is-highlight' : ''} ${onClick ? 'is-clickable' : ''}`;
  const content = (
    <>
      <span class="emp-strip" aria-hidden="true">
        {Icon[CATEGORY_ICON[d?.category ?? ''] ?? 'briefcase']({ size: compact ? 14 : 16 })}
      </span>
      <span class="emp-body">
        <span class="emp-name">{employeeName(catalog.value, id)}</span>
        {!compact && d?.text && <span class="emp-text">{d.text}</span>}
        <span class="emp-tags">
          {d?.entry && <span class="tag tag-entry" title="Entry level: can be hired">{Icon.sparkle({ size: 12 })}</span>}
          {d?.salary && <span class="tag tag-salary" title="Costs $5 salary">$</span>}
          {d?.unique && <span class="tag tag-unique" title="1x: own at most one">1x</span>}
          {slots > 0 && <span class="tag tag-slots" title={`${slots} slots`}>{slots} slots</span>}
          {d?.mandatory && <span class="tag" title="Acts automatically">auto</span>}
          <WhatsThis id={employeeTermId(id)} label={employeeName(catalog.value, id)} />
        </span>
        {footer}
      </span>
      {badge && <span class="emp-badge">{badge}</span>}
    </>
  );
  const common = {
    ...press,
    class: cls,
    'data-colour': d?.colour ?? 'grey',
    'data-flip': flip,
    'data-tutorial': tutorial,
    title: title ?? d?.text,
  };
  if (onClick) {
    return (
      <button
        type="button"
        {...common}
        disabled={disabled}
        aria-pressed={selected}
        onClick={onClick}
        draggable={Boolean(draggableUid)}
        onDragStart={draggableUid ? (e) => e.dataTransfer?.setData('text/fcm-uid', draggableUid) : undefined}
      >
        {content}
      </button>
    );
  }
  return <div {...common}>{content}</div>;
}

export function Empty({ icon = 'info', children }: { icon?: IconName; children: ComponentChildren }) {
  return (
    <div class="empty">
      {Icon[icon]({ size: 22 })}
      <span>{children}</span>
    </div>
  );
}
