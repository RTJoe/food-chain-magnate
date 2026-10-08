/**
 * Accessibility guards: text contrast of the theme tokens (WCAG AA 4.5:1), the seat palette and
 * its shared mark, where board keyboard shortcuts may act (WCAG 2.1.1 / 2.1.4), and the
 * screen-reader announcements.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_COLORS, COLORS, contrast, inkOn, MILESTONE_BANDS, MONEY_COLORS, PLAYER_COLORS, playerColorFor, seatColor } from '../src/theme.js';
import { boardOwnsEscape, boardOwnsKey, type BoardKeyEnv, type KeyLike } from '../src/three/keyScope.js';
import { summaryAnnouncement, turnAnnouncement } from '../src/state/announce.js';
import { playerMark } from '../src/state/selectors.js';

const AA = 4.5;
const WHITE = '#ffffff';

describe('theme token contrast (WCAG AA text)', () => {
  const pairs: [string, string, string][] = [
    ['ink on paper', COLORS.ink, COLORS.paper],
    ['muted on paper', COLORS.inkMuted, COLORS.paper],
    ['muted on surface', COLORS.inkMuted, COLORS.surface],
    ['muted on sunk (.hint, .empty, stage chips)', COLORS.inkMuted, COLORS.surfaceSunk],
    ['muted on white (cards)', COLORS.inkMuted, WHITE],
    ['white on accent (.btn-primary, .tab-count, thinking badge)', COLORS.accentInk, COLORS.accent],
    ['white on accent hover', COLORS.accentInk, COLORS.accentHover],
    ['accent as text on surface (.ppanel-turn)', COLORS.accent, COLORS.surface],
    ['white on ok (.btn-ok, current stage chip)', WHITE, COLORS.ok],
    ['surface on ok (toast-ok)', COLORS.surface, COLORS.ok],
    ['ok as text on surface (Can act, done)', COLORS.ok, COLORS.surface],
    ['ok as text on white (.token-note, .inspect-win)', COLORS.ok, WHITE],
    ['ok on its tint #eef8f1 (.slot.is-target)', COLORS.ok, '#eef8f1'],
    ['link on surface', COLORS.link, COLORS.surface],
    ['link on white', COLORS.link, WHITE],
    ['link on sunk', COLORS.link, COLORS.surfaceSunk],
    ['white on danger (.btn-danger)', WHITE, COLORS.danger],
    ['surface on danger (toast-error)', COLORS.surface, COLORS.danger],
    ['surface on ink (toasts, pointer hints)', COLORS.surface, COLORS.ink],
    ['ink on panelTeal (dock, dialogs, home cards)', COLORS.ink, COLORS.panelTeal],
    ['muted on panelTeal', COLORS.inkMuted, COLORS.panelTeal],
    ['tealInk on panelTeal (.pill-info, home card titles)', COLORS.tealInk, COLORS.panelTeal],
    ['tealInk on surface (.btn-secondary, eyebrows)', COLORS.tealInk, COLORS.surface],
    ['tealInk on paper (.home-strap)', COLORS.tealInk, COLORS.paper],
    ['accent on panelTeal (.prompt.is-mine h2)', COLORS.accent, COLORS.panelTeal],
    ['ok on panelTeal', COLORS.ok, COLORS.panelTeal],
    ['ink on chrome strip bottom (.dock-tab)', COLORS.ink, COLORS.chromeMid],
    ['white on accent (.dock-tab.is-on, .chip.is-on)', WHITE, COLORS.accent],
  ];
  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('focus rings keep 3:1 against the surfaces (non-text contrast)', () => {
    for (const bg of [COLORS.surface, COLORS.paper, COLORS.surfaceSunk, COLORS.panelTeal, WHITE]) expect(contrast(COLORS.focus, bg)).toBeGreaterThanOrEqual(3);
  });

  it('coral and teal (large-text colours) never colour .btn, .chip or body text', () => {
    const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!] as const);
    const bad = rules.filter(([sel, body]) => /(^|[\s,])(\.btn|\.chip|body|:root)\b/.test(sel) && /(^|;|\s)color:\s*var\(--c-(coral|teal)\)/.test(body));
    expect(bad.map(([sel]) => sel)).toEqual([]);
  });

  it('contrast() matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('printed pieces (cards, milestone tiles, money)', () => {
  it.each(Object.entries(CARD_COLORS))('white card title on the %s band', (_k, band) => {
    expect(contrast(WHITE, band)).toBeGreaterThanOrEqual(AA);
  });
  it.each(Object.entries(CARD_COLORS))('%s training-list text on the cream ability panel', (_k, band) => {
    expect(contrast(band, '#fcfbef')).toBeGreaterThanOrEqual(AA);
  });
  it.each(Object.entries(MILESTONE_BANDS))('milestone %s band title', (_k, b) => {
    expect(contrast(b.ink, b.band)).toBeGreaterThanOrEqual(AA);
  });
  it('1x badge, card text and milestone values', () => {
    expect(contrast(WHITE, COLORS.tealInk)).toBeGreaterThanOrEqual(AA);
    expect(contrast(COLORS.ink, '#fcfbef')).toBeGreaterThanOrEqual(AA);
    expect(contrast(COLORS.inkMuted, '#ece8db')).toBeGreaterThanOrEqual(AA);
    expect(contrast('#4b3f8f', '#ece8db')).toBeGreaterThanOrEqual(AA);
  });
  it('banknote engraving reads on every note', () => {
    for (const v of [1, 5, 10, 20, 50, 100] as const) expect(contrast(MONEY_COLORS.ink, MONEY_COLORS[v])).toBeGreaterThanOrEqual(AA);
  });
});

describe('seat palette', () => {
  it.each(PLAYER_COLORS.map((p) => [p.name, p] as const))('%s: dark text reads on light and on surface; badge label reads on base', (_n, p) => {
    expect(contrast(p.dark, p.light)).toBeGreaterThanOrEqual(AA);
    expect(contrast(p.dark, COLORS.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(p.dark, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(inkOn(p.base), p.base)).toBeGreaterThanOrEqual(AA);
  });

  it('felt (rail cards) carries ink text', () => {
    for (const p of PLAYER_COLORS) expect(contrast(COLORS.ink, p.felt)).toBeGreaterThanOrEqual(AA);
  });

  it('maps the earlier palettes (older servers, saved games) to the current seats', () => {
    expect(seatColor('#d94f3d')).toBe(PLAYER_COLORS[0]!.base);
    expect(seatColor('#9B5FC0')).toBe(PLAYER_COLORS[4]!.base);
    expect(seatColor('#b8352a')).toBe(PLAYER_COLORS[0]!.base);
    expect(seatColor('#EF8A2F')).toBe(PLAYER_COLORS[5]!.base);
    expect(playerColorFor('#5cc7b2')?.id).toBe('xango_blues_bar');
    expect(playerColorFor(PLAYER_COLORS[2]!.base)?.id).toBe('santa_maria_pizza');
    expect(seatColor('#123456')).toBe('#123456');
    expect(seatColor(undefined)).toBeUndefined();
  });

  it('seats stay apart under protanopia, deuteranopia and tritanopia (CIEDE2000, Machado 2009)', () => {
    const bases = PLAYER_COLORS.map((p) => p.base);
    expect(minCvdDistance(bases)).toBeGreaterThanOrEqual(12.5);
    expect(minCvdDistance(bases.slice(0, 5))).toBeGreaterThanOrEqual(12.5);
  });

  it('one mark per seat: initial, two letters on a clash, then the seat number', () => {
    const view = (names: string[]) => ({
      players: Object.fromEntries(names.map((name, i) => [`p${i + 1}`, { name }])),
      config: { players: names.map((_, i) => ({ id: `p${i + 1}` })) },
    });
    const v = view(['Ada', 'Bo', 'al', 'Player 1', 'Player 2']);
    expect(playerMark(v as never, 'p2')).toBe('B');
    expect(playerMark(v as never, 'p1')).toBe('Ad');
    expect(playerMark(v as never, 'p3')).toBe('Al');
    expect(playerMark(v as never, 'p4')).toBe('P4');
    expect(playerMark(v as never, 'p5')).toBe('P5');
  });
});

describe('board key scope', () => {
  const canvas = { id: 'canvas' } as unknown as EventTarget;
  const body = { id: 'body' } as unknown as EventTarget;
  const root = { id: 'html' } as unknown as EventTarget;
  const button = { tagName: 'BUTTON', closest: () => null } as unknown as EventTarget;
  const input = { tagName: 'INPUT', closest: () => null } as unknown as EventTarget;
  const inDialog = { tagName: 'BUTTON', closest: (s: string) => (s.includes('dialog') ? {} : null) } as unknown as EventTarget;
  const env = (o: Partial<BoardKeyEnv> = {}): BoardKeyEnv => ({ canvas, body, root, pointerOver: false, visible: true, modalOpen: false, ...o });
  const key = (k: string, target: EventTarget | null, o: Partial<KeyLike> = {}): KeyLike => ({ key: k, target, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, ...o });

  it('acts when the board canvas has focus', () => {
    for (const k of ['ArrowDown', 'Home', 't', 'Enter', ']']) expect(boardOwnsKey(key(k, canvas), env())).toBe(true);
  });

  it('never takes keys from a focused button or field (Enter stays the button’s)', () => {
    for (const t of [button, input]) {
      for (const k of ['Enter', 'ArrowDown', 't', 'Home', '[']) expect(boardOwnsKey(key(k, t), env({ pointerOver: true }))).toBe(false);
    }
  });

  it('with nothing focused, acts only while the pointer is over the board', () => {
    expect(boardOwnsKey(key('ArrowUp', body), env())).toBe(false);
    expect(boardOwnsKey(key('ArrowUp', body), env({ pointerOver: true }))).toBe(true);
    expect(boardOwnsKey(key('ArrowUp', root), env({ pointerOver: true }))).toBe(true);
  });

  it('stays out while the board is hidden (another screen) or a modal is open', () => {
    expect(boardOwnsKey(key('ArrowDown', canvas), env({ visible: false }))).toBe(false);
    expect(boardOwnsKey(key('ArrowDown', canvas), env({ modalOpen: true }))).toBe(false);
  });

  it('ignores modified and already-handled keys', () => {
    expect(boardOwnsKey(key('z', canvas, { ctrlKey: true }), env())).toBe(false);
    expect(boardOwnsKey(key('w', canvas, { defaultPrevented: true }), env())).toBe(false);
  });

  it('Escape cancels a pick from the panels, but not from a field or a dialog', () => {
    expect(boardOwnsEscape(key('Escape', button), env())).toBe(true);
    expect(boardOwnsEscape(key('Escape', input), env())).toBe(false);
    expect(boardOwnsEscape(key('Escape', inDialog), env())).toBe(false);
    expect(boardOwnsEscape(key('Escape', canvas), env({ modalOpen: true }))).toBe(false);
  });
});

describe('announcements', () => {
  const name = (id: string) => ({ p1: 'Ada', p2: 'Bo', p3: 'Cy' })[id] ?? id;
  const order = ['p1', 'p2', 'p3'];

  it('Dinnertime: the viewer first, then the others', () => {
    const s = {
      round: 3,
      phase: 'dinnertime',
      events: [
        { type: 'sale', player: 'p2', total: 20 },
        { type: 'sale', player: 'p1', total: 30 },
        { type: 'sale', player: 'p1', total: 17 },
        { type: 'houseStayedHome' },
      ],
    };
    expect(summaryAnnouncement(s, order, 'p1', name)).toBe('Dinnertime, round 3: you sold to 2 houses for $47; Bo sold to 1 house for $20.');
    expect(summaryAnnouncement({ ...s, events: [] }, order, 'p1', name)).toBe('Dinnertime, round 3: no sales.');
  });

  it('Payday: salaries paid', () => {
    const s = { round: 2, phase: 'payday', events: [{ type: 'salaryPaid', player: 'p3', paid: 10 }, { type: 'salaryPaid', player: 'p1', paid: 0 }] };
    expect(summaryAnnouncement(s, order, 'p1', name)).toBe('Payday: Cy paid $10 in salaries.');
    expect(summaryAnnouncement({ ...s, phase: 'marketing' }, order, 'p1', name)).toBeNull();
  });

  it('turn start and phase change', () => {
    expect(turnAnnouncement({ phaseChanged: true, phase: 'Working 9–5', turnStarted: true, title: 'Your turn: Hire' })).toBe('Working 9–5. Your turn: Hire.');
    expect(turnAnnouncement({ phaseChanged: false, phase: 'x', turnStarted: true, title: 'Choose your reserve card (secret)' })).toBe('Your turn: Choose your reserve card (secret).');
    expect(turnAnnouncement({ phaseChanged: false, phase: 'x', turnStarted: false, title: null })).toBeNull();
  });
});

// --- Colour-vision deficiency helper: Machado et al. 2009 (severity 1) in linear RGB, CIEDE2000 ---------------

const CVD: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

function simulatedLab(hexColor: string, m: number[][]): [number, number, number] {
  const lin = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hexColor.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = m.map((row) => Math.min(1, Math.max(0, row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!))) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function ciede2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1!, b1!) + Math.hypot(a2!, b2!)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1!, a2p = (1 + G) * a2!;
  const C1 = Math.hypot(a1p, b1!), C2 = Math.hypot(a2p, b2!);
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = hue(b1!, a1p), h2 = hue(b2!, a2p);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lb = (L1! + L2!) / 2, Cbp = (C1 + C2) / 2;
  const hb = C1 * C2 === 0 ? h1 + h2 : Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const [dl, dc, dhh] = [(L2! - L1!) / Sl, (C2 - C1) / Sc, dH / Sh];
  return Math.sqrt(dl ** 2 + dc ** 2 + dhh ** 2 + Rt * dc * dhh);
}

/** Smallest CIEDE2000 distance between any two colours under simulated protanopia, deuteranopia and tritanopia. */
export function minCvdDistance(colors: string[]): number {
  let min = Infinity;
  for (const m of Object.values(CVD)) {
    const labs = colors.map((c) => simulatedLab(c, m));
    for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) min = Math.min(min, ciede2000(labs[i]!, labs[j]!));
  }
  return min;
}
