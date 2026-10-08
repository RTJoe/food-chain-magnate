/** Words on the Learn hub's lesson cards (pure, so tests need no component imports). */
import { entryById } from '../../tutorial/catalog.js';
import { getTerm } from '../glossary/index.js';

/** Chip text for a lesson concept: the glossary term, else the id made readable. */
export const conceptLabel = (c: string): string => getTerm(c)?.term ?? c.replace(/_/g, ' ');

/** "Needs …" for a locked card: several base lessons read as the base course, else the names. */
export function needsText(missing: readonly string[]): string {
  if (missing.length > 2 && missing.every((id) => id.startsWith('base.'))) return `Needs the base course (${missing.length} lessons left)`;
  return `Needs ${missing.map((id) => entryById(id)?.title ?? id).join(', ')}`;
}
