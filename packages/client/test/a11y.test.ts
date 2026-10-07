/**
 * Accessibility guards: text contrast of the theme tokens (WCAG AA 4.5:1), the seat palette and
 * its shared mark, where board keyboard shortcuts may act (WCAG 2.1.1 / 2.1.4), and the
 * screen-reader announcements.
 */
import { describe, expect, it } from 'vitest';
import { COLORS, contrast, inkOn, PLAYER_COLORS, seatColor } from '../src/theme.js';
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
    ['surface on ink (toasts, active tab)', COLORS.surface, COLORS.ink],
  ];
  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('focus rings keep 3:1 against the surfaces (non-text contrast)', () => {
    for (const bg of [COLORS.surface, COLORS.paper, COLORS.surfaceSunk, WHITE]) expect(contrast(COLORS.focus, bg)).toBeGreaterThanOrEqual(3);
  });

  it('contrast() matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('seat palette', () => {
  it.each(PLAYER_COLORS.map((p) => [p.name, p] as const))('%s: dark text reads on light and on surface; badge label reads on base', (_n, p) => {
    expect(contrast(p.dark, p.light)).toBeGreaterThanOrEqual(AA);
    expect(contrast(p.dark, COLORS.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(p.dark, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(inkOn(p.base), p.base)).toBeGreaterThanOrEqual(AA);
  });

  it('maps the earlier palette (older servers, saved games) to the current seats', () => {
    expect(seatColor('#d94f3d')).toBe(PLAYER_COLORS[0]!.base);
    expect(seatColor('#9B5FC0')).toBe(PLAYER_COLORS[4]!.base);
    expect(seatColor('#123456')).toBe('#123456');
    expect(seatColor(undefined)).toBeUndefined();
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
