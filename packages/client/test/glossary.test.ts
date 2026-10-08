/**
 * Glossary, "What's this?" ids and the rules book: every link resolves, every card / milestone /
 * food / campaign kind / phase has an entry, and the player-facing rules text has no source notes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engine, FOODS, type CampaignKind, type EmployeeId, type MilestoneId } from '@fcm/engine';
import { buildBook, DOC_KEYS, searchBook, type DocKey } from '../src/ui/rules/book.js';
import { cleanText } from '../src/ui/rules/clean.js';
import { parseBlocks, parseInline } from '../src/ui/rules/markdown.js';
import { parseRulesHash, rulesHash } from '../src/ui/rules/route.js';
import { campaignTermId, employeeTermId, entityTermId, foodTermId, getTerm, GLOSSARY, houseTermId, milestoneTermId, phaseTermId, searchGlossary } from '../src/ui/glossary/index.js';
import { PHASE_STEPS } from '../src/state/selectors.js';

const docs = Object.fromEntries(DOC_KEYS.map((k) => [k, readFileSync(new URL(`../../../docs/rules/${k}.md`, import.meta.url), 'utf8')])) as Record<DocKey, string>;
const book = buildBook(docs);
const modules = engine.listModules();

describe('glossary data', () => {
  it('has unique ids and terms, short plain definitions and an example each', () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(GLOSSARY.map((e) => e.term.toLowerCase())).size).toBe(GLOSSARY.length);
    for (const e of GLOSSARY) {
      expect(e.id, e.id).toMatch(/^[a-z0-9_]+$/);
      expect(e.short.length, e.id).toBeLessThanOrEqual(260);
      // One or two sentences, after an optional card-facts lead-in ("Salary $5, 1x.", "Phase 4.").
      const body = e.short.replace(/^(?:(?:Entry level|Salary \$5|No salary|Phase \d|You)[^.]*\.\s*)+/, '');
      expect(body.split(/(?<=[.!?])\s+(?=[A-Z])/).length, `${e.id}: 1-2 sentences`).toBeLessThanOrEqual(2);
      expect(e.example.length, e.id).toBeGreaterThan(10);
    }
  });

  it('links only to existing terms and rules-book sections', () => {
    for (const e of GLOSSARY) {
      for (const r of e.related) expect(getTerm(r), `${e.id} → ${r}`).toBeDefined();
      expect(e.related, e.id).not.toContain(e.id);
      if (e.rule) expect(book.byId.has(e.rule), `${e.id} → #/rules/${e.rule}`).toBe(true);
    }
    expect(GLOSSARY.filter((e) => !e.rule).map((e) => e.id)).toEqual([]);
  });

  it('covers every employee, milestone, food and campaign kind of base and Ketchup', () => {
    const employees = new Set<EmployeeId>();
    const milestones = new Set<MilestoneId>();
    const kinds = new Set<CampaignKind>();
    for (const m of modules) {
      for (const e of m.content.employees ?? []) employees.add(e.id);
      for (const x of m.content.milestones ?? []) milestones.add(x.id);
      for (const t of m.content.marketingTiles ?? []) kinds.add(t.kind);
    }
    expect(employees.size).toBeGreaterThanOrEqual(50);
    expect(milestones.size).toBeGreaterThanOrEqual(39);
    for (const id of employees) expect(getTerm(employeeTermId(id))?.employee, id).toBe(id);
    for (const id of milestones) expect(getTerm(milestoneTermId(id))?.milestone, id).toBe(id);
    for (const f of FOODS) expect(getTerm(foodTermId(f.id))?.food, f.id).toBe(f.id);
    for (const k of [...kinds, 'giantBillboard', 'gourmetGuide'] as CampaignKind[]) expect(getTerm(campaignTermId(k)), k).toBeDefined();
    for (const s of PHASE_STEPS) for (const k of s.kinds) expect(getTerm(phaseTermId(k)), k).toBeDefined();
    for (const k of ['setup.restaurants', 'setup.reserve', 'gameOver'] as const) expect(getTerm(phaseTermId(k)), k).toBeDefined();
    for (const k of ['printed', 'placed', 'apartment', 'rural']) expect(getTerm(houseTermId(k)), k).toBeDefined();
    for (const k of ['coffeeShop', 'park', 'lobbyistRoad', 'roadworks', 'freeway']) expect(getTerm(entityTermId(k) ?? ''), k).toBeDefined();
  });

  it('covers the beginner vocabulary', () => {
    for (const id of ['ceo', 'ceo_slots', 'manager', 'trainee', 'beach', 'unit_price', 'distance', 'tile_border', 'demand', 'demand_cap', 'garden', 'billboard', 'mailbox', 'airplane', 'radio', 'milestone', 'bank_break', 'reserve_card', 'open_slots', 'overfill', 'salary', 'one_x', 'entry_level', 'tie_break', 'drive_in', 'freezer']) {
      expect(getTerm(id), id).toBeDefined();
    }
  });

  it('searches terms, aliases and text', () => {
    expect(searchGlossary('cap')[0]?.id).toBe('demand_cap');
    expect(searchGlossary('org chart')[0]?.id).toBe('structure');
    expect(searchGlossary('waitress').map((e) => e.id)).toContain('tie_break');
  });
});

describe('rules book', () => {
  it('arranges the docs by phase with quick cards', () => {
    const ids = book.chapters.map((c) => c.id);
    expect(ids.slice(0, 9)).toEqual(['overview', 'setup', 'restructuring', 'order', 'working', 'dinnertime', 'payday', 'marketing', 'cleanup']);
    for (const c of book.chapters) {
      expect(c.sections.length, c.id).toBeGreaterThan(0);
      if (c.phase) expect(c.quick?.length, c.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('hides source citations, confidence notes and edition notes', () => {
    const all = [...book.byId.values()].map(({ section }) => `${section.title}\n${section.text}`).join('\n');
    for (const bad of [/\bDLX p\d/, /\bJD \d{6,}/, /\bBGG \d{6,}/, /\[DLX differs\]/, /TYPE-IMPACT/, /\bConfidence\b/, /questions\.md/, /— High\b/]) expect(all, String(bad)).not.toMatch(bad);
    // ...but keeps the rules themselves.
    const dinner = book.byId.get('base-phase-4-dinnertime')!.section.text;
    expect(dinner).toMatch(/lowest \(unit price \+ distance\) wins/);
    expect(book.byId.get('base-phase-6-marketing')!.section.text).toMatch(/at most 3 demand tokens/);
    expect(cleanText('Players start with $0. (DLX p4) High.')).toBe('Players start with $0.');
    expect(cleanText('**[DLX differs]** the earlier spec said X. Salaries go to the bank.')).toBe('Salaries go to the bank.');
  });

  it('keeps rules that carry a citation, and drops spec-writing notes', () => {
    const text = (id: string) => book.byId.get(id)?.section.text ?? '';
    const all = [...book.byId.values()].map(({ section }) => `${section.title}\n${section.text}`).join('\n');
    for (const bad of [/§/, /\.md\b/, /\bImplement/, /Recommended:/, /\bFor code\b/, /not stated/]) expect(all, String(bad)).not.toMatch(bad);
    expect(all).toMatch(/Pizza radios and the free mailbox \(not linked to a marketeer\) do not count/);
    expect(text('ketchup-lobbyists')).toMatch(/Roadworks cost \+1 for every road route/);
    expect(all).toMatch(/claimed even if nothing is sold/);
    expect(all).toMatch(/Black = managers/);
    expect(cleanText('From RB p5 card colours: black = managers.')).toBe('Black = managers.');
    expect(cleanText('Drive-ins: §6.3a. Numbers set run order (§9).')).toBe('Numbers set run order.');
    expect(parseInline(String.raw`a \* b`)).toEqual([{ t: 'text', v: 'a * b' }]);
  });

  it('drops confidence columns from tables', () => {
    const marketing = book.byId.get('base-phase-6-marketing')!.section;
    const table = marketing.blocks.find((b) => b.t === 'table');
    expect(table && table.t === 'table' ? table.head : []).toEqual(['#', 'Type', 'Footprint (squares)']);
  });

  it('searches section text', () => {
    const hits = searchBook(book, 'waitress tie');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.chapter.id === 'dinnertime')).toBe(true);
  });

  it('round-trips #/rules hashes', () => {
    for (const l of [{ tab: 'rules', section: null }, { tab: 'rules', section: 'base-recruit' }, { tab: 'glossary', term: null }, { tab: 'glossary', term: 'demand_cap' }] as const) {
      expect(parseRulesHash(rulesHash(l))).toEqual(l);
    }
  });
});

describe('markdown parser', () => {
  it('parses headings, nested lists, tables and inline marks', () => {
    const b = parseBlocks('## Title\n\n1. One\n   - nested **bold**\n2. Two\n\n| a | b |\n|---|---|\n| `x|y` | 2 |\n\nPara *em* text.');
    expect(b.map((x) => x.t)).toEqual(['heading', 'list', 'table', 'para']);
    const list = b[1]!;
    expect(list.t === 'list' && list.items.length).toBe(2);
    expect(list.t === 'list' && list.items[0]!.children[0]?.t).toBe('list');
    const table = b[2]!;
    expect(table.t === 'table' && table.rows[0]).toEqual(['`x|y`', '2']);
    expect(parseInline('a **b** `c` *d*').map((x) => x.t)).toEqual(['text', 'strong', 'text', 'code', 'text', 'em']);
  });
});
