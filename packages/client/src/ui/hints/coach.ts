/**
 * Coach level and dismissed hints, stored in `localStorage['fcm.coach']` (kept apart from
 * `fcm.settings` so the tutorial work can add its own settings without clashing).
 * Default: `light`, or `off` once the guided game (L15) is passed in `fcm.learn`.
 */
import { signal } from '@preact/signals';

export type CoachLevel = 'off' | 'light' | 'full';
export const COACH_KEY = 'fcm.coach';

interface Stored {
  level?: CoachLevel;
  dismissed?: string[];
}

function read(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(COACH_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function defaultLevel(): CoachLevel {
  try {
    const learn = JSON.parse(globalThis.localStorage?.getItem('fcm.learn') ?? 'null') as { lessons?: Record<string, { status?: string }> } | null;
    if (learn?.lessons?.['L15']?.status === 'passed') return 'off';
  } catch {
    /* no progress stored */
  }
  return 'light';
}

const initial = read();
export const coachLevel = signal<CoachLevel>(initial.level ?? defaultLevel());
/** Hint ids the player asked never to see again. */
export const dismissedHints = signal<ReadonlySet<string>>(new Set(initial.dismissed ?? []));
/** Hint instances closed for this session (`id:key`), so a closed card stays closed until its situation changes. */
export const closedHints = signal<ReadonlySet<string>>(new Set());

function write(): void {
  try {
    globalThis.localStorage?.setItem(COACH_KEY, JSON.stringify({ level: coachLevel.value, dismissed: [...dismissedHints.value] }));
  } catch {
    /* storage unavailable */
  }
}

export function setCoachLevel(level: CoachLevel): void {
  coachLevel.value = level;
  write();
}

export function dismissHint(id: string): void {
  dismissedHints.value = new Set([...dismissedHints.value, id]);
  write();
}

export function closeHint(instance: string): void {
  closedHints.value = new Set([...closedHints.value, instance]);
}

export function resetHints(): void {
  dismissedHints.value = new Set();
  closedHints.value = new Set();
  write();
}
