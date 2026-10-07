/** Screen-reader announcements (WCAG 4.1.3). ui/a11y.tsx renders them in two persistent live regions. */
import { signal } from '@preact/signals';

export interface Said {
  text: string;
  /** Bumps on every call so the same words are read again. */
  n: number;
}

export const politeSaid = signal<Said>({ text: '', n: 0 });
export const assertiveSaid = signal<Said>({ text: '', n: 0 });

/** Read `text` to screen readers (polite: after the current speech; assertive: errors). */
export function announce(text: string, assertive = false): void {
  const s = assertive ? assertiveSaid : politeSaid;
  s.value = { text: text.trim(), n: s.peek().n + 1 };
}

/** The parts of a phase summary the announcer reads (store.ts PhaseSummary). */
interface SummaryLike {
  round: number;
  phase: string;
  events: readonly { type: string }[];
}

interface EventFields {
  type: string;
  player?: string | null;
  total?: number;
  paid?: number;
}

const money = (n: number) => (n < 0 ? `minus $${-n}` : `$${n}`);
const houses = (n: number) => `${n} house${n === 1 ? '' : 's'}`;

/**
 * One sentence for a finished Dinnertime or Payday (null for other phases): the viewer first,
 * then the others in seat order. `name` maps a player id to a display name.
 */
export function summaryAnnouncement(s: SummaryLike, order: readonly string[], me: string | null, name: (id: string) => string): string | null {
  const who = (id: string) => (id === me ? 'you' : name(id));
  const ids = me && order.includes(me) ? [me, ...order.filter((p) => p !== me)] : [...order];
  if (s.phase === 'dinnertime') {
    const sold = new Map<string, { n: number; total: number }>();
    for (const e of s.events as readonly EventFields[]) {
      if (e.type !== 'sale' || !e.player) continue;
      const cur = sold.get(e.player) ?? { n: 0, total: 0 };
      sold.set(e.player, { n: cur.n + 1, total: cur.total + (e.total ?? 0) });
    }
    if (!sold.size) return `Dinnertime, round ${s.round}: no sales.`;
    const parts = ids.filter((p) => sold.has(p)).map((p) => {
      const x = sold.get(p)!;
      return `${who(p)} sold to ${houses(x.n)} for ${money(x.total)}`;
    });
    return `Dinnertime, round ${s.round}: ${parts.join('; ')}.`;
  }
  if (s.phase === 'payday') {
    const paid = new Map<string, number>();
    for (const e of s.events as readonly EventFields[]) if (e.type === 'salaryPaid' && e.player) paid.set(e.player, (paid.get(e.player) ?? 0) + (e.paid ?? 0));
    const parts = ids.filter((p) => (paid.get(p) ?? 0) > 0).map((p) => `${who(p)} paid ${money(paid.get(p)!)}`);
    return parts.length ? `Payday: ${parts.join('; ')} in salaries.` : null;
  }
  return null;
}

/** Turn start and phase change, in one sentence (null when neither happened). */
export function turnAnnouncement(o: { phaseChanged: boolean; phase: string; turnStarted: boolean; title: string | null }): string | null {
  const parts: string[] = [];
  if (o.phaseChanged) parts.push(`${o.phase}.`);
  if (o.turnStarted) parts.push(o.title && !/^your turn/i.test(o.title) ? `Your turn: ${o.title}.` : `${o.title ?? 'Your turn'}.`);
  return parts.length ? parts.join(' ') : null;
}
