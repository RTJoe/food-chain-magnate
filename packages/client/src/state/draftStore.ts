/**
 * Unsent Restructuring draft mirrored to sessionStorage, so a reload or a discarded phone tab does
 * not lose a half-built chart. Keyed by table (room id or mode), round and player; stale keys are
 * dropped on save. Storage failures are ignored (private mode, quota).
 */
import type { OrgDraft } from './orgChart.js';

const PREFIX = 'fcm.orgDraft:';

export const draftKey = (table: string, round: number, player: string): string => `${PREFIX}${table}:${round}:${player}`;

function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, d: OrgDraft | null): void {
  const s = store();
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX) && k !== key) s.removeItem(k);
    }
    if (d) s.setItem(key, JSON.stringify(d));
    else s.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadDraft(key: string): OrgDraft | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as OrgDraft;
    return Array.isArray(d?.ceoSubs) && d.managerSubs && typeof d.managerSubs === 'object' ? d : null;
  } catch {
    return null;
  }
}
