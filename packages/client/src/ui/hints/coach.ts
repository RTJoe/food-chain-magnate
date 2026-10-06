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
    if (learn?.lessons?.['base.15']?.status === 'passed') return 'off';
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

/** sessionStorage flag: the current hot-seat game is L16 free play, launched from the Learn hub. */
const FREE_PLAY_KEY = 'fcm.coach.freePlay';

/** L16 "Free play with a coach": switch the coach on (full if it was off) and remember to return to the hub. */
export function startFreePlay(): void {
  if (coachLevel.value === 'off') setCoachLevel('full');
  try {
    globalThis.sessionStorage?.setItem(FREE_PLAY_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** Whether the table being left was L16 free play (clears the flag): leaving goes back to the Learn hub. */
export function takeFreePlayReturn(): boolean {
  try {
    const on = globalThis.sessionStorage?.getItem(FREE_PLAY_KEY) === '1';
    globalThis.sessionStorage?.removeItem(FREE_PLAY_KEY);
    return on;
  } catch {
    return false;
  }
}

export function resetHints(): void {
  dismissedHints.value = new Set();
  closedHints.value = new Set();
  write();
}
