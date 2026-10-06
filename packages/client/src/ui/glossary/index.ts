/** Glossary lookups: id → entry, game ids → glossary ids, and search. Pure. */
import type { CampaignKind, EmployeeId, FoodId, MilestoneId, PhaseKind } from '@fcm/engine';
import { GLOSSARY, type GlossaryEntry } from './data.js';

export { GLOSSARY, GROUP_LABELS, type GlossaryEntry, type GlossaryGroup } from './data.js';

const BY_ID = new Map<string, GlossaryEntry>(GLOSSARY.map((e) => [e.id, e]));

export const getTerm = (id: string): GlossaryEntry | undefined => BY_ID.get(id);
export const hasTerm = (id: string): boolean => BY_ID.has(id);

const bare = (id: string) => (id.startsWith('ketchup:') ? id.slice('ketchup:'.length) : id);

export const employeeTermId = (id: EmployeeId): string => bare(id);
export const milestoneTermId = (id: MilestoneId): string => (id === 'ketchup:ketchup' ? 'ketchup_milestone' : bare(id));
export const foodTermId = (id: FoodId): string => id;

const CAMPAIGN: Record<CampaignKind, string> = { billboard: 'billboard', mailbox: 'mailbox', airplane: 'airplane', radio: 'radio', giantBillboard: 'giant_billboard', gourmetGuide: 'gourmet_guide' };
export const campaignTermId = (k: CampaignKind): string => CAMPAIGN[k];

const PHASE: Partial<Record<PhaseKind, string>> = {
  'setup.restaurants': 'setup',
  'setup.reserve': 'reserve_card',
  restructuring: 'restructuring',
  orderOfBusiness: 'order_of_business',
  working: 'working',
  dinnertime: 'dinnertime',
  payday: 'payday',
  marketing: 'marketing_phase',
  cleanup: 'cleanup',
  gameOver: 'game_end',
};
export const phaseTermId = (k: PhaseKind): string => PHASE[k] ?? 'phase';

const HOUSE: Record<string, string> = { printed: 'house', placed: 'new_house', apartment: 'apartment', rural: 'rural_area' };
export const houseTermId = (kind: string): string => HOUSE[kind] ?? 'house';

const ENTITY: Record<string, string> = { coffeeShop: 'coffee_shop', park: 'park', lobbyistRoad: 'lobbyist_road', roadworks: 'roadworks', freeway: 'freeway' };
export const entityTermId = (kind: string): string | null => ENTITY[kind] ?? null;

/** Entries matching every word of `q` in term, aliases or text; term matches first. */
export function searchGlossary(q: string): GlossaryEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...GLOSSARY];
  const scored: { e: GlossaryEntry; s: number }[] = [];
  for (const e of GLOSSARY) {
    const head = [e.term, ...(e.aliases ?? [])].join(' ').toLowerCase();
    const body = `${e.short} ${e.example}`.toLowerCase();
    if (!words.every((w) => head.includes(w) || body.includes(w))) continue;
    let s = 0;
    for (const w of words) s += head.includes(w) ? (head.startsWith(w) ? 20 : 10) : 1;
    scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.term.localeCompare(b.e.term)).map((x) => x.e);
}
