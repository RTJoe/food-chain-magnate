/** Every glossary link a lesson shows (step "What's this?" and lesson concept chips) must resolve. */
import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../src/tutorial/catalog.js';
import { hasTerm } from '../../src/ui/glossary/index.js';

describe('lesson glossary links', () => {
  it('every step glossary id and lesson concept is a glossary term', () => {
    const missing: string[] = [];
    for (const lesson of LESSONS.values()) {
      for (const c of lesson.concepts ?? []) if (!hasTerm(c)) missing.push(`${lesson.id} concept ${c}`);
      for (const s of lesson.steps) if (s.glossary && !hasTerm(s.glossary)) missing.push(`${lesson.id}/${s.id} ${s.glossary}`);
    }
    expect(missing).toEqual([]);
  });
});
