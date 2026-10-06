/**
 * "What's this?" API. `whatsThis(termId, anchor?)` opens the glossary popover for a term next to
 * the element that asked (a bottom sheet on phones). `openRules(section)` opens the rules book in
 * a sheet over whatever is on screen, so a game is never left. Both render in WhatsThisLayer.
 */
import { signal } from '@preact/signals';
import { hasTerm } from './index.js';

export interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WhatsThisState {
  id: string;
  anchor: AnchorRect | null;
  /** Terms visited through "related" links, for Back. */
  trail: string[];
}

export const whatsThisState = signal<WhatsThisState | null>(null);

function rectOf(a: Element | DOMRect | AnchorRect | null | undefined): AnchorRect | null {
  if (!a) return null;
  const r = 'getBoundingClientRect' in a ? a.getBoundingClientRect() : a;
  const x = 'left' in r ? r.left : r.x;
  const y = 'top' in r ? r.top : r.y;
  const w = 'width' in r ? r.width : r.w;
  const h = 'height' in r ? r.height : r.h;
  return { x, y, w, h };
}

/** Open the glossary popover for `termId`. Unknown ids are ignored (returns false). */
export function whatsThis(termId: string, anchor?: Element | DOMRect | AnchorRect | null): boolean {
  if (!hasTerm(termId)) return false;
  whatsThisState.value = { id: termId, anchor: rectOf(anchor), trail: [] };
  return true;
}

/** Follow a related link inside the open popover. */
export function whatsThisGo(termId: string): void {
  const cur = whatsThisState.value;
  if (!cur || !hasTerm(termId)) return;
  whatsThisState.value = { ...cur, id: termId, trail: [...cur.trail, cur.id] };
}

export function whatsThisBack(): void {
  const cur = whatsThisState.value;
  if (!cur || !cur.trail.length) return;
  whatsThisState.value = { ...cur, id: cur.trail[cur.trail.length - 1]!, trail: cur.trail.slice(0, -1) };
}

export function closeWhatsThis(): void {
  whatsThisState.value = null;
}

/** Where the rules sheet is open: a rules section or a glossary term. */
export type RulesLoc = { tab: 'rules'; section: string | null } | { tab: 'glossary'; term: string | null };

export const rulesSheet = signal<RulesLoc | null>(null);

export function openRules(section: string | null = null): void {
  whatsThisState.value = null;
  rulesSheet.value = { tab: 'rules', section };
}

export function openGlossary(term: string | null = null): void {
  whatsThisState.value = null;
  rulesSheet.value = { tab: 'glossary', term };
}

export function closeRules(): void {
  rulesSheet.value = null;
}
