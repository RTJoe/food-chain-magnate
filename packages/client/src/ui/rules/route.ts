/**
 * #/rules routes, kept out of state/router.ts (which other work owns): App checks `isRulesHash()`
 * first. #/rules, #/rules/<section-or-chapter>, #/rules/glossary, #/rules/glossary/<term>.
 */
import type { RulesLoc } from '../glossary/api.js';

export const isRulesHash = (hash: string = typeof location === 'undefined' ? '' : location.hash): boolean => /^#\/rules(\/|$)/.test(hash);

export function parseRulesHash(hash: string): RulesLoc {
  const [, a, b] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (a === 'glossary') return { tab: 'glossary', term: b ?? null };
  return { tab: 'rules', section: a ?? null };
}

export function rulesHash(l: RulesLoc): string {
  if (l.tab === 'glossary') return l.term ? `#/rules/glossary/${encodeURIComponent(l.term)}` : '#/rules/glossary';
  return l.section ? `#/rules/${encodeURIComponent(l.section)}` : '#/rules';
}
