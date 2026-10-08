/**
 * The in-app rules book: docs/rules/*.md split into sections, cleaned for players and arranged by
 * phase. Pure (takes the markdown strings), so tests can build it from the files directly.
 * Section ids are `<doc>-<slug of the cleaned heading>`, e.g. `base-phase-4-dinnertime`; glossary
 * entries link to them (`#/rules/<id>`).
 */
import type { PhaseKind } from '@fcm/engine';
import { cleanBlocks, cleanHeading } from './clean.js';
import { parseBlocks, plainBlocks, type Block } from './markdown.js';

export type DocKey = 'base' | 'employees' | 'milestones' | 'map' | 'ketchup';
export const DOC_KEYS: readonly DocKey[] = ['base', 'employees', 'milestones', 'map', 'ketchup'];

export interface RuleSection {
  id: string;
  doc: DocKey;
  /** 2 = chapter-level heading in its doc, 3+ = subsection. */
  level: number;
  title: string;
  /** Cleaned for players. */
  blocks: Block[];
  /** As written, with sources and confidence notes. */
  raw: Block[];
  /** Plain cleaned text for search. */
  text: string;
}

export interface Chapter {
  id: string;
  title: string;
  group: 'Start here' | 'The seven phases' | 'Reference' | 'Ketchup expansion';
  phase?: PhaseKind;
  /** One line under the title. */
  blurb: string;
  /** "Dinnertime in 6 lines": a quick card written for beginners. */
  quick?: string[];
  sections: RuleSection[];
}

export interface Book {
  chapters: Chapter[];
  byId: Map<string, { section: RuleSection; chapter: Chapter }>;
}

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[`*"'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Code ids → card names from tables whose first two columns are `id | Name` (employees.md). */
function idNames(blocks: readonly Block[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of blocks) {
    if (b.t !== 'table' || b.head[0]?.toLowerCase() !== 'id') continue;
    for (const r of b.rows) {
      const id = /^[a-z][a-z0-9_]*$/.exec((r[0] ?? '').trim())?.[0];
      if (id && r[1] && !out.has(id)) out.set(id, r[1].replace(/\*\*/g, '').replace(/\s*"[^"]*"\s*/g, ' ').trim());
    }
  }
  return out;
}

function renameIds(blocks: Block[], names: Map<string, string>): Block[] {
  if (!names.size) return blocks;
  const sub = (t: string) => t.replace(/\b[a-z][a-z0-9_]*\b/g, (m) => names.get(m) ?? m);
  return blocks.map((b) => (b.t === 'table' ? { ...b, rows: b.rows.map((r) => r.map(sub)) } : b));
}

/** Split one doc into sections at `##`+ headings (the `#` title is dropped). */
export function splitSections(doc: DocKey, md: string): RuleSection[] {
  const blocks = parseBlocks(md);
  const names = idNames(blocks);
  const out: RuleSection[] = [];
  let cur: { level: number; title: string; body: Block[] } = { level: 2, title: doc === 'employees' ? 'Card legend' : 'Introduction', body: [] };
  const flush = () => {
    const title = cleanHeading(cur.title);
    const clean = renameIds(cleanBlocks(cur.body), names);
    let id = `${doc}-${slug(title)}`;
    for (let n = 2; out.some((s) => s.id === id); n++) id = `${doc}-${slug(title)}-${n}`;
    out.push({ id, doc, level: cur.level, title, blocks: clean, raw: cur.body, text: plainBlocks(clean) });
  };
  for (const b of blocks) {
    if (b.t === 'heading' && b.level === 1) continue;
    if (b.t === 'heading') {
      flush();
      cur = { level: b.level, title: b.text, body: [] };
    } else if (b.t !== 'hr') cur.body.push(b);
  }
  flush();
  return out;
}

interface ChapterSpec extends Omit<Chapter, 'sections'> {
  /** Section ids taken with their subsections, in order. `doc:*` takes a whole doc. */
  take: string[];
  /** Section ids left out (code notes, tile grids). */
  skip?: string[];
}

const CHAPTERS: ChapterSpec[] = [
  {
    id: 'overview',
    title: 'How a round works',
    group: 'Start here',
    blurb: 'Seven phases, always in the same order. Most cash when the bank breaks for the second time wins.',
    quick: [
      'You run a fast-food chain. Everyone starts with $0.',
      'Each round has 7 phases: Restructuring, Order of Business, Working 9–5, Dinnertime, Payday, Marketing, Cleanup.',
      'Employees do the work: hire them, train them, then put them to work in your company.',
      'Marketing creates demand on houses; at Dinnertime houses buy from the cheapest, closest restaurant.',
      'Money comes from the bank. When the bank runs out twice, the game ends after that Dinnertime.',
    ],
    take: ['base-turn-structure'],
  },
  {
    id: 'setup',
    title: 'Setup',
    group: 'Start here',
    blurb: 'Build the town, place your first restaurant, pick a secret reserve card.',
    quick: [
      'The map is a grid of random 5×5 tiles, rotated at random.',
      'In reverse turn order each player places a restaurant or passes; passers must place in a second round.',
      'A first restaurant needs 4 empty squares, its entrance next to a road, and not on a tile that already has an entrance.',
      'Everyone secretly picks one reserve card ($100, $200 or $300): it refills the bank later and votes on CEO slots.',
    ],
    take: ['base-setup'],
  },
  {
    id: 'restructuring',
    title: 'Phase 1 — Restructuring',
    group: 'The seven phases',
    phase: 'restructuring',
    blurb: 'Secretly choose who works this round; the rest go to the beach.',
    quick: [
      'Everyone builds their company at the same time, in secret, then all reveal.',
      'Your CEO has 3 slots. Any card can go in a CEO slot.',
      'A manager in a CEO slot adds its own slots, but only for non-managers.',
      'Cards you do not use go on the beach: they do nothing but can be trained and still cost salary.',
      'Too many cards for your slots? Everyone except the CEO goes to the beach this round.',
    ],
    take: ['base-phase-1-restructuring'],
  },
  {
    id: 'order',
    title: 'Phase 2 — Order of Business',
    group: 'The seven phases',
    phase: 'orderOfBusiness',
    blurb: 'Most open slots picks a turn-order position first.',
    quick: [
      'Count your open slots: empty slots on your CEO and managers.',
      'Most open slots chooses any free position first, then the next most.',
      'Ties go to whoever was earlier in last round’s order.',
    ],
    take: ['base-phase-2-order-of-business'],
  },
  {
    id: 'working',
    title: 'Phase 3 — Working 9–5',
    group: 'The seven phases',
    phase: 'working',
    blurb: 'In turn order, each player uses every card at work, in a fixed order of steps.',
    quick: [
      'Players take whole turns in turn order.',
      'Steps, always in this order: hire, train, drive-ins, campaigns, food & drinks, houses & gardens, restaurants.',
      'Each card at work does its job once. Almost everything is optional.',
      'New hires go to the beach: they work from next round but can be trained right away.',
    ],
    take: ['base-phase-3-working-9-5'],
  },
  {
    id: 'dinnertime',
    title: 'Phase 4 — Dinnertime',
    group: 'The seven phases',
    phase: 'dinnertime',
    blurb: 'Houses with demand buy from one chain. Pure arithmetic: you can predict it.',
    quick: [
      'Houses eat in number order. A house without demand stays home.',
      'Only chains with a road to the house and every item it wants can sell. No partial orders.',
      'Lowest unit price + distance wins (distance = tile borders crossed by road).',
      'Tie: most waitresses at work, then earlier in turn order.',
      'Each item pays the unit price, doubled if the house has a garden.',
      'Then waitresses pay $3 each and a CFO adds 50%.',
    ],
    take: ['base-phase-4-dinnertime'],
  },
  {
    id: 'payday',
    title: 'Phase 5 — Payday',
    group: 'The seven phases',
    phase: 'payday',
    blurb: 'Fire anyone you like, then pay $5 for every salaried card you own.',
    quick: [
      'First everyone may fire cards (at the same time).',
      'Then pay $5 for each card with a salary icon: at work, on the beach and busy marketeers.',
      'If you cannot pay, you must fire salaried cards until you can.',
    ],
    take: ['base-phase-5-payday'],
  },
  {
    id: 'marketing',
    title: 'Phase 6 — Marketing',
    group: 'The seven phases',
    phase: 'marketing',
    blurb: 'Every campaign runs in number order and puts demand on the houses it reaches.',
    quick: [
      'Campaigns run in number order, lowest first.',
      'Each puts 1 demand token of its good on every house it reaches.',
      'A house holds at most 3 demand (5 with a garden); a full house gets nothing.',
      'Then one duration token comes off. When none are left, the campaign ends and its marketeer returns.',
    ],
    take: ['base-phase-6-marketing'],
  },
  {
    id: 'cleanup',
    title: 'Phase 7 — Cleanup',
    group: 'The seven phases',
    phase: 'cleanup',
    blurb: 'Throw away unsold food, take everyone back to hand, open new restaurants.',
    quick: [
      'Unsold food and drinks are thrown away (a freezer keeps up to 10).',
      'Everyone at work and on the beach returns to your hand.',
      'Coming-soon restaurants open; drive-in signs come off.',
      'Milestones claimed this round are crossed out for everyone else.',
    ],
    take: ['base-phase-7-cleanup'],
  },
  {
    id: 'milestones',
    title: 'Milestones',
    group: 'Reference',
    blurb: 'Be first to do something and get a permanent bonus. Same-round ties all get it.',
    take: ['milestones:*'],
    skip: ['milestones-trigger-details-for-code', 'milestones-introduction'],
  },
  {
    id: 'bank',
    title: 'The bank and the end',
    group: 'Reference',
    blurb: 'The bank breaks when it hits $0 at Dinnertime. Break it twice and the game ends.',
    take: ['base-breaking-the-bank-game-end'],
  },
  {
    id: 'employees',
    title: 'Employees',
    group: 'Reference',
    blurb: 'Every card, what it does and what it trains into.',
    take: ['employees:*'],
  },
  {
    id: 'map',
    title: 'The map, roads and distance',
    group: 'Reference',
    blurb: 'Tiles, roads, houses, gardens and how distance is counted.',
    take: ['base-geometry-definitions', 'map-structure', 'map-road-connectivity-rules', 'map-placeable-house-tiles-8-new-business-developer', 'map-gardens-8-tiles', 'map-marketing-tiles-base'],
  },
  {
    id: 'intro',
    title: 'Intro game',
    group: 'Reference',
    blurb: 'A gentler first game: no reserve cards, no salaries, no milestones.',
    take: ['base-intro-game-variant'],
  },
  {
    id: 'components',
    title: 'Components',
    group: 'Reference',
    blurb: 'What is in the box, and what is limited.',
    take: ['base-components-base-game'],
  },
  {
    id: 'ketchup',
    title: 'The Ketchup Mechanism & Other Ideas',
    group: 'Ketchup expansion',
    blurb: 'Seventeen optional modules. Each can be used alone or combined.',
    take: ['ketchup:*'],
    skip: ['ketchup-introduction', 'ketchup-open-items'],
  },
];

/** Section ids that never appear (code-only notes, tile grids, source tables). */
const ALWAYS_SKIP = new Set(['base-sources', 'base-open-questions', 'map-notation', 'map-base-tiles-20', 'map-generation-constraints-if-not-using-official-tiles', 'map-ketchup-new-districts-tiles-u-z', 'base-milestones-summary-see-milestones-md']);

function takeWithChildren(all: RuleSection[], id: string): RuleSection[] {
  const i = all.findIndex((s) => s.id === id);
  if (i < 0) return [];
  const root = all[i]!;
  const out = [root];
  for (let j = i + 1; j < all.length && all[j]!.level > root.level; j++) out.push(all[j]!);
  return out;
}

export function buildBook(docs: Record<DocKey, string>): Book {
  const byDoc = Object.fromEntries(DOC_KEYS.map((k) => [k, splitSections(k, docs[k] ?? '')])) as Record<DocKey, RuleSection[]>;
  const chapters: Chapter[] = [];
  const byId = new Map<string, { section: RuleSection; chapter: Chapter }>();
  for (const spec of CHAPTERS) {
    const skip = new Set([...(spec.skip ?? []), ...ALWAYS_SKIP]);
    const picked: RuleSection[] = [];
    for (const t of spec.take) {
      if (t.endsWith(':*')) picked.push(...byDoc[t.slice(0, -2) as DocKey]);
      else picked.push(...takeWithChildren(byDoc[t.split('-')[0] as DocKey] ?? [], t));
    }
    // Skipping a section skips its subsections too.
    const sections: RuleSection[] = [];
    let skipLevel = Infinity;
    for (const s of picked) {
      if (s.level <= skipLevel) skipLevel = Infinity;
      if (skip.has(s.id)) {
        skipLevel = s.level;
        continue;
      }
      if (skipLevel !== Infinity) continue;
      if (s.blocks.length === 0 && s.id.endsWith('-introduction')) continue;
      sections.push(s);
    }
    const { take: _take, skip: _skip, ...rest } = spec;
    const chapter: Chapter = { ...rest, sections };
    chapters.push(chapter);
    for (const s of sections) if (!byId.has(s.id)) byId.set(s.id, { section: s, chapter });
  }
  return { chapters, byId };
}

export interface SearchHit {
  section: RuleSection;
  chapter: Chapter;
  score: number;
  snippet: string;
}

/** Sections containing every word of `query` (case-insensitive), best first. */
export function searchBook(book: Book, query: string, limit = 30): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const { section, chapter } of book.byId.values()) {
    const title = section.title.toLowerCase();
    const text = section.text.toLowerCase();
    if (!words.every((w) => title.includes(w) || text.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 10;
      score += Math.min(8, text.split(w).length - 1);
    }
    hits.push({ section, chapter, score, snippet: snippetAt(section.text, words[0]!) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function snippetAt(text: string, word: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const i = flat.toLowerCase().indexOf(word);
  if (i < 0) return flat.slice(0, 140);
  const start = Math.max(0, i - 60);
  return `${start > 0 ? '…' : ''}${flat.slice(start, i + 90).trim()}${i + 90 < flat.length ? '…' : ''}`;
}
