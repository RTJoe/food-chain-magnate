/** Small shared building blocks. */
import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import type { FoodCounts, GameView, PlayerId } from '@fcm/engine';
import { catalog } from '../state/store.js';
import { foodList, initial, playerMark, seatIndex } from '../state/selectors.js';
import { inkOn } from '../theme.js';
import { FoodIcon, Icon, type IconName } from './icons.js';

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

/** Label colour on a seat colour: white or ink, whichever reads better (white on Fried Geese, ink on the lighter chains). */
const badgeInk = (color: string | undefined, idx: number): string => (color?.startsWith('#') && color.length === 7 ? inkOn(color) : `var(--player-${idx}-ink, #fff)`);

/**
 * Player colour disc with the seat's mark (colour is never the only cue): the same mark the board
 * paints on that player's restaurants, coffee shops and vans (playerMark).
 */
/** `hidden`: the player's name is already beside the badge, so assistive tech skips it; otherwise it reads the name, not the initial. */
export function PlayerBadge({ view, id, size = 28, ring, hidden }: { view: GameView; id: PlayerId; size?: number; ring?: boolean; hidden?: boolean }) {
  const p = view.players[id];
  const idx = seatIndex(view, id);
  const mark = playerMark(view, id);
  return (
    <span
      class={`pbadge ${ring ? 'is-ring' : ''}`}
      style={{ '--pc': p?.color ?? `var(--player-${idx})`, '--pcl': `var(--player-${idx}-light)`, '--pc-ink': badgeInk(p?.color, idx), width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * (mark.length > 1 ? 0.38 : 0.46))}px` }}
      title={p?.name}
      role={hidden ? undefined : 'img'}
      aria-label={hidden ? undefined : (p?.name ?? mark)}
      aria-hidden={hidden ? 'true' : undefined}
    >
      {mark}
    </span>
  );
}

export function SeatBadge({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span class="pbadge" style={{ '--pc': color, '--pc-ink': badgeInk(color, 0), width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.46)}px` }} aria-hidden="true">
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
      <button type="button" class="icon-btn" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        {Icon.minus({ size: 16 })}
      </button>
      <output>{value}</output>
      <button type="button" class="icon-btn" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        {Icon.plus({ size: 16 })}
      </button>
    </span>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ComponentChildren; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div
      class="segmented"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        // APG radio group: arrows move and select; one Tab stop for the group.
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        const live = options.filter((o) => !o.disabled);
        const i = live.findIndex((o) => o.value === value);
        const next = live[(i + step + live.length) % live.length];
        if (!next) return;
        e.preventDefault();
        onChange(next.value);
        const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=radio]')];
        btns[options.indexOf(next)]?.focus();
      }}
    >
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          tabIndex={o.value === value || (!options.some((x) => x.value === value) && o === options[0]) ? 0 : -1}
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

export { CardBack, EmployeeCard, type EmployeeCardProps } from './cards.js';

export function Empty({ icon = 'info', children }: { icon?: IconName; children: ComponentChildren }) {
  return (
    <div class="empty">
      {Icon[icon]({ size: 22 })}
      <span>{children}</span>
    </div>
  );
}
