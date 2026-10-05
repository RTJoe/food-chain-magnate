/** Inline SVG icons (original line art, 24x24 grid, currentColor). */
import type { FoodId } from '@fcm/engine';
import type { JSX } from 'preact';

type P = { size?: number; class?: string; title?: string };

const svg = (paths: JSX.Element, { size = 20, class: cls, title }: P, fill = false) => (
  <svg
    class={`icon ${cls ?? ''}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden={title ? undefined : 'true'}
    role={title ? 'img' : undefined}
  >
    {title && <title>{title}</title>}
    {paths}
  </svg>
);

export const Icon = {
  restructure: (p: P = {}) => svg(<><rect x="9" y="3" width="6" height="5" rx="1.5" /><rect x="3" y="16" width="6" height="5" rx="1.5" /><rect x="15" y="16" width="6" height="5" rx="1.5" /><path d="M12 8v4M6 16v-2h12v2" /></>, p),
  order: (p: P = {}) => svg(<><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5l1.5-1V9M3.5 13.5c0-1 .8-1.5 1.5-1.5s1.5.5 1.5 1.3c0 1.2-3 2.2-3 3.7h3" /></>, p),
  work: (p: P = {}) => svg(<><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" /></>, p),
  dinner: (p: P = {}) => svg(<><path d="M5 3v7a2 2 0 0 0 2 2v9M9 3v7a2 2 0 0 1-2 2M7 3v5" /><path d="M17 21V3c-2 1.5-3 4-3 7 0 1.7 1.3 3 3 3" /></>, p),
  payday: (p: P = {}) => svg(<><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>, p),
  marketing: (p: P = {}) => svg(<><path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" /></>, p),
  cleanup: (p: P = {}) => svg(<><path d="M14 3l-4 9M6.5 12h9l1.5 9H5z" /><path d="M9 16v5M12.5 16v5" /></>, p),
  bank: (p: P = {}) => svg(<><path d="M3 9.5L12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" /></>, p),
  cash: (p: P = {}) => svg(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>, p),
  store: (p: P = {}) => svg(<><path d="M4 10v10h16V10" /><path d="M3 10l1.5-6h15L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M10 20v-5h4v5" /></>, p),
  crown: (p: P = {}) => svg(<><path d="M4 18h16l1-10-5 4-4-6-4 6-5-4z" /></>, p),
  check: (p: P = {}) => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, p),
  x: (p: P = {}) => svg(<path d="M6 6l12 12M18 6L6 18" />, p),
  plus: (p: P = {}) => svg(<path d="M12 5v14M5 12h14" />, p),
  robot: (p: P = {}) => svg(<><rect x="4.5" y="8" width="15" height="11" rx="3" /><path d="M12 8V4.5M10 4.5h4M2.5 12.5v3M21.5 12.5v3M9.5 16h5" /><circle cx="9.5" cy="12.5" r="1" /><circle cx="14.5" cy="12.5" r="1" /></>, p),
  minus: (p: P = {}) => svg(<path d="M5 12h14" />, p),
  undo: (p: P = {}) => svg(<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>, p),
  chat: (p: P = {}) => svg(<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.3A2.5 2.5 0 0 1 4 13.5z" />, p),
  log: (p: P = {}) => svg(<><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h3" /></>, p),
  users: (p: P = {}) => svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>, p),
  copy: (p: P = {}) => svg(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>, p),
  link: (p: P = {}) => svg(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, p),
  wifi: (p: P = {}) => svg(<><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /></>, p),
  wifiOff: (p: P = {}) => svg(<><path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5.5 12.5a9.5 9.5 0 0 1 4-2.3M2.5 9a14 14 0 0 1 4.3-2.7M14 10.3a9.5 9.5 0 0 1 4.5 2.2M12 5a14 14 0 0 1 9.5 4" /></>, p),
  chevronDown: (p: P = {}) => svg(<path d="M6 9l6 6 6-6" />, p),
  chevronUp: (p: P = {}) => svg(<path d="M6 15l6-6 6 6" />, p),
  chevronRight: (p: P = {}) => svg(<path d="M9 6l6 6-6 6" />, p),
  chevronLeft: (p: P = {}) => svg(<path d="M15 6l-6 6 6 6" />, p),
  arrowRight: (p: P = {}) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, p),
  star: (p: P = {}) => svg(<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" />, p),
  trophy: (p: P = {}) => svg(<><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1A3.5 3.5 0 0 0 8 10.5M16 6h3.5v1a3.5 3.5 0 0 1-3.5 3.5M12 13v4M8 21h8M9.5 17h5v4h-5z" /></>, p),
  home: (p: P = {}) => svg(<><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /></>, p),
  hand: (p: P = {}) => svg(<><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4.4-2.7 8-7 8-3 0-4.5-1.5-6-4l-1.5-2.7a1.6 1.6 0 0 1 2.7-1.6L8 15" /></>, p),
  eye: (p: P = {}) => svg(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>, p),
  eyeOff: (p: P = {}) => svg(<><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>, p),
  play: (p: P = {}) => svg(<path d="M7 4.5v15l12-7.5z" />, p, true),
  flag: (p: P = {}) => svg(<><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>, p),
  info: (p: P = {}) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>, p),
  map: (p: P = {}) => svg(<><path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>, p),
  device: (p: P = {}) => svg(<><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>, p),
  sparkle: (p: P = {}) => svg(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />, p),
  beach: (p: P = {}) => svg(<><path d="M4 20h16" /><path d="M12 20l2.5-11" /><path d="M5 9.5a9.5 6 0 0 1 17 0z" /></>, p),
  briefcase: (p: P = {}) => svg(<><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /></>, p),
  snow: (p: P = {}) => svg(<path d="M12 2.5v19M4 7l16 10M20 7L4 17M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />, p),
  pin: (p: P = {}) => svg(<><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>, p),
  settings: (p: P = {}) => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 6l2.2 1.7M17.6 16.3L19.8 18M2.5 12h3M18.5 12h3M4.2 18l2.2-1.7M17.6 7.7L19.8 6" /></>, p),
  logout: (p: P = {}) => svg(<><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" /></>, p),
  rotateLeft: (p: P = {}) => svg(<><path d="M4 4v5h5" /><path d="M5.5 15a7.5 7.5 0 1 0 1.2-8.2L4 9" /></>, p),
  rotateRight: (p: P = {}) => svg(<><path d="M20 4v5h-5" /><path d="M18.5 15a7.5 7.5 0 1 1-1.2-8.2L20 9" /></>, p),
  zoomIn: (p: P = {}) => svg(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6" /></>, p),
  zoomOut: (p: P = {}) => svg(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20M7.5 10.5h6" /></>, p),
  topView: (p: P = {}) => svg(<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>, p),
  recenter: (p: P = {}) => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>, p),
  forward: (p: P = {}) => svg(<path d="M4 5.5v13l8-6.5zM12 5.5v13l8-6.5z" />, p, true),
  qr: (p: P = {}) => svg(<><rect x="3.5" y="3.5" width="6" height="6" rx="1" /><rect x="14.5" y="3.5" width="6" height="6" rx="1" /><rect x="3.5" y="14.5" width="6" height="6" rx="1" /><path d="M14.5 14.5h2.5v2.5M20.5 14.5v6h-3M14.5 20.5v-2" /></>, p),
};

export type IconName = keyof typeof Icon;

/** Good tokens: each good has its own silhouette (docs/visual-style.md: never colour alone). */
export function FoodIcon({ food, size = 22 }: { food: FoodId; size?: number }) {
  const c = `var(--food-${food.replace(/_/g, '-')})`;
  const stroke = 'rgba(43,42,51,.55)';
  const body = (() => {
    switch (food) {
      case 'burger':
        return (
          <>
            <path d="M4 11a8 6 0 0 1 16 0z" fill={c} stroke={stroke} />
            <rect x="3.5" y="12" width="17" height="2.6" rx="1.3" fill="#5a8f3a" stroke={stroke} />
            <path d="M4.5 15.5h15a0 0 0 0 1 0 0 3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" fill={c} stroke={stroke} />
          </>
        );
      case 'pizza':
        return (
          <>
            <path d="M12 21L3.5 6.5a14 9 0 0 1 17 0z" fill={c} stroke={stroke} />
            <circle cx="10" cy="10" r="1.4" fill="#b8321f" />
            <circle cx="14" cy="9.5" r="1.2" fill="#b8321f" />
            <circle cx="12" cy="14" r="1.2" fill="#b8321f" />
          </>
        );
      case 'beer':
        return (
          <>
            <rect x="5" y="7" width="10" height="13" rx="2" fill={c} stroke={stroke} />
            <path d="M15 10h2.5a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2H15" fill="none" stroke={stroke} stroke-width="1.8" />
            <path d="M4.5 7.5a2.6 2.6 0 0 1 3-3 3 3 0 0 1 5 0 2.6 2.6 0 0 1 3 3z" fill="#fffaf0" stroke={stroke} />
          </>
        );
      case 'lemonade':
        return (
          <>
            <path d="M6 7h12l-1.6 13H7.6z" fill={c} stroke={stroke} />
            <path d="M13 7l3-5" stroke={stroke} stroke-width="1.6" />
            <circle cx="17.5" cy="7.5" r="2.6" fill="#f2df4a" stroke={stroke} />
          </>
        );
      case 'soft_drink':
        return (
          <>
            <rect x="7" y="4" width="10" height="16.5" rx="2.4" fill={c} stroke={stroke} />
            <rect x="8.5" y="2.5" width="7" height="2.4" rx="1" fill="#c9c4cf" stroke={stroke} />
            <path d="M7.5 11h9" stroke="#fffaf0" stroke-width="2" />
          </>
        );
      case 'coffee':
        return (
          <>
            <path d="M5 9h11v6a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15z" fill={c} stroke={stroke} />
            <path d="M16 11h1.5a2 2 0 0 1 0 4H16" fill="none" stroke={stroke} stroke-width="1.8" />
            <path d="M8.5 6.5c0-1 1-1.2 1-2.2M12 6.5c0-1 1-1.2 1-2.2" stroke={stroke} stroke-width="1.5" fill="none" />
          </>
        );
      case 'kimchi':
        return (
          <>
            <rect x="6" y="5" width="12" height="3" rx="1" fill="#e6dccb" stroke={stroke} />
            <path d="M6.5 8h11v10a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 18z" fill={c} stroke={stroke} />
            <path d="M9 12l2 2 2-3 2 2" stroke="#fffaf0" stroke-width="1.4" fill="none" />
          </>
        );
      case 'sushi':
        return (
          <>
            <ellipse cx="12" cy="16" rx="8" ry="4" fill="#2f3b2f" stroke={stroke} />
            <ellipse cx="12" cy="11" rx="8" ry="4" fill="#fffaf0" stroke={stroke} />
            <rect x="4" y="11" width="16" height="5" fill="#2f3b2f" />
            <ellipse cx="12" cy="11" rx="4" ry="2" fill={c} />
          </>
        );
      case 'noodles':
        return (
          <>
            <path d="M8 3l1.5 8M12.5 3L12 11" stroke={stroke} stroke-width="1.6" />
            <path d="M3 11h18a9 7 0 0 1-18 0z" fill={c} stroke={stroke} />
            <path d="M7 14c2 1.5 3-1 5 0s3 1.5 5 0" stroke="#d7a94f" stroke-width="1.4" fill="none" />
          </>
        );
    }
  })();
  return (
    <svg class="food-icon" width={size} height={size} viewBox="0 0 24 24" stroke-width="1.2" aria-hidden="true">
      {body}
    </svg>
  );
}

/** Original wordmark badge: a diner sign with a tray. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" class="logo-mark">
      <defs>
        <linearGradient id="lg-sign" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ef6a55" />
          <stop offset="1" stop-color="#c8402f" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lg-sign)" />
      <path d="M14 38h36a18 14 0 0 0-36 0z" fill="#f8ebc2" />
      <rect x="11" y="39" width="42" height="4.5" rx="2.25" fill="#fffaf0" />
      <circle cx="32" cy="22" r="2.6" fill="#fffaf0" />
      <path d="M20 49h24" stroke="#f8ebc2" stroke-width="3" stroke-linecap="round" />
      <path d="M22 31c3-3 6-4 10-4" stroke="#e8b730" stroke-width="2.4" stroke-linecap="round" fill="none" />
    </svg>
  );
}
