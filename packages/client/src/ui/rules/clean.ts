/**
 * Strips the rules docs' internal notes for players: source citations (DLX p12, JD 1452841, BGG…),
 * confidence words and columns, "[DLX differs]" edition notes, type-impact tags and code-only
 * sections. Pure functions over parsed blocks; the raw text stays available ("Show sources").
 */
import type { Block, ListItem } from './markdown.js';

const TAG = String.raw`\b(?:DLX|RB|JD|KX|KX-DLX|DLX-B|BGG|CMP|INF)\b`;
const CONF = String.raw`(?:High|Medium|Low)(?:-(?:High|Medium))?`;
const PAREN_CITATION = new RegExp(String.raw`\s?\((?:(?=[^()]*(?:${TAG}|normative|\bp\d|\bQ-[A-Z]+\d))|(?=\s*${CONF}\b))[^()]*\)`, 'g');
const INNER_CITATION = new RegExp(String.raw`[,;]\s*${TAG}(?:\s+p\d+(?:[–-]\d+)?)+(?=\))`, 'g');
const QUOTED_CITATION = new RegExp(String.raw`\(${TAG}:\s*("[^"]*")\)`, 'g');
const COMMA_CONFIDENCE = new RegExp(String.raw`,\s*${CONF}(?=[.;])`, 'g');
const DASH_CONFIDENCE = new RegExp(String.raw`\s+[—–]\s+${CONF}\b(?:\s*\([^)]*\))?`, 'g');
const META_SENTENCE = new RegExp(
  String.raw`\[DLX differs\]|${TAG}|earlier spec|questions\.md|CHANGES\.md|community list|OnlineBoardGamers|boardgamehelpers|open-magnate|\bConfidence\b|^\W*${CONF}\b(?:\s*\([^)]*\))?(?:\s+for\b[^.]*)?[\s.;,]*$|\b(?:are|is) now ${CONF}\b|^\W*(?:Implement(?:ation)?\b|For code\b|Use simultaneous\b)`,
);
/**
 * Attribution wrapped around a rule ("From RB p5 card colours: …", "DLX rule of thumb: …", "DLX says
 * X, so …"): drop the wrapper and keep the rule, so the sentence is not lost with its citation.
 */
const ATTRIBUTION: [RegExp, string][] = [
  [new RegExp(String.raw`^(\*\*[^*]+\*\*\s*)?From ${TAG}[^:]*:\s*`), '$1'],
  [new RegExp(String.raw`^(\*\*[^*]+\*\*\s*)?${TAG} rule of thumb:\s*`), '$1'],
  [new RegExp(String.raw`^(\*\*[^*]+\*\*\s*)?${TAG} says [^,;]*?,\s*so\s+`), '$1'],
  [new RegExp(String.raw`^(\*\*[^*]+\*\*\s*)?${TAG} says "[^"]*";\s*`), '$1'],
  [new RegExp(String.raw`\bthe base ${TAG} rule\b`, 'g'), 'the base rule'],
  [new RegExp(String.raw`\b(The|the) ${TAG} box\b`, 'g'), '$1 box'],
  [new RegExp(String.raw`\bin ${TAG} box\b`, 'g'), 'in the box'],
  // The docs' "Recommended:" is the rule this app plays; "not stated — X" is the app's choice X.
  [/^(\*\*[^*]+\*\*\s*)?Recommended:\s*/, '$1'],
  [/:\s*not stated\s*[—–]\s*/, ': '],
];
/** Pointers into the spec files (`base.md` §14, see map.md, §2): meaningless to players. */
const FILE = '`?[\\w-]+\\.md`?';
const SECT = String.raw`§\s?\d+(?:\.\d+)?[a-z]?`;
const REFS: [RegExp, string][] = [
  // "See `ketchup.md` §16: some milestones…" → "Some milestones…"
  [new RegExp(String.raw`^(\*\*[^*]+\*\*\s*)?See\s+(?:${FILE}\s*)?(?:${SECT})?:\s*`, 'i'), '$1'],
  // "… — see §12", "see `base.md` §14", "— `ketchup.md`"
  [new RegExp(String.raw`\s*[—–]?\s*\bsee\s+(?:${FILE}\s*)?${SECT}(?:\s+table)?`, 'gi'), ''],
  [new RegExp(String.raw`\s*[—–]\s*${FILE}`, 'g'), ''],
  // "(U, V, W in `map.md`)" → "(U, V, W)"
  [new RegExp(String.raw`\s+in\s+${FILE}`, 'g'), ''],
  // Parentheses that hold nothing but a pointer: "(§9)", "(see `employees.md`)".
  [new RegExp(String.raw`\s?\(\s*(?:see\s+)?(?:${FILE}\s*)?(?:${SECT}(?:[,;–-]\s*${SECT})*)?(?:\s+table)?\s*\)`, 'gi'), ''],
];
/** A sentence that is only a pointer once the label is set aside: "Drive-ins: §6.3a.", "See `employees.md`." */
const POINTER_ONLY = new RegExp(String.raw`^(?:\*\*[^*]+\*\*\s*|[\w\s-]+:\s*)?(?:see\s+)?(?:${FILE}\s*)?(?:${SECT})?(?:\s+table)?[\s.]*$`, 'i');
const HAS_POINTER = /\.md\b|§/;

function unwrapAttribution(sentence: string): string {
  let out = sentence;
  for (const [re, by] of ATTRIBUTION) out = out.replace(re, by);
  if (HAS_POINTER.test(out) && !POINTER_ONLY.test(out)) for (const [re, by] of REFS) out = out.replace(re, by);
  if (out !== sentence) out = out.replace(/^[a-z]/, (c) => c.toUpperCase());
  return out;
}

const META_PARA = /^(?:\*\*)?(?:Sources?\b|Primary source|Deluxe cross-check|Authoritative spec|Count check|Evidence:|Confidence\b|Each module can be used)/i;
/** Spec-writing notes: open questions, recommendations and pointers to other spec files. */
const META_NOTE = /^\W*(?:.*\bnot stated\b|Not explicitly confirmed|Timing conflict unresolved|.*\b(?:grids|orientation|per tile) below\b)/;
const DROP_COLUMN = /^(?:conf\.?|confidence|sources?|pages|id)$/i;
const headCell = (h: string) => stripCitations(h).replace(/^DLX\s+(\w)/, (_, c: string) => c.toUpperCase());
const CONFIDENCE_SUFFIX = /\s+[—–-]\s+(?:High|Medium|Low|informational)\b.*$/;

/** Remove citations in parentheses and inline tags, without dropping whole sentences (table cells, headings). */
export function stripCitations(s: string): string {
  // Keep the rule inside a parenthesis and drop only its citation tail: "(claimed even if…, DLX p28)".
  let out = s.replace(INNER_CITATION, '').replace(QUOTED_CITATION, '($1)').replace(/\[TYPE-IMPACT:[^\]]*\]/g, '').replace(DASH_CONFIDENCE, '').replace(COMMA_CONFIDENCE, '');
  for (let i = 0; i < 3; i++) out = out.replace(PAREN_CITATION, '');
  return tidy(out.replace(COMMA_CONFIDENCE, ''));
}

function tidy(s: string): string {
  return s
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/([.,;:])\s+\1/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Split into sentences, keeping bold spans intact. */
function sentences(s: string): string[] {
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z*`"(\[])/);
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    // Re-join a split that landed inside **bold**.
    if (prev !== undefined && (prev.match(/\*\*/g)?.length ?? 0) % 2 === 1) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out;
}

/** Clean running text: drop citations and sentences that are only about sources or confidence. */
export function cleanText(s: string): string {
  const base = stripCitations(s);
  // "X: not stated (…). Recommended: Y." → "X: Y."
  const kept = sentences(base.replace(/:\s*not stated(?:\s*\([^)]*\))?\.\s*Recommended:\s*/g, ': '))
    .map(unwrapAttribution)
    .filter((x) => !META_SENTENCE.test(x) && !META_NOTE.test(x) && !(HAS_POINTER.test(x) && POINTER_ONLY.test(x)));
  return tidy(kept.join(' '));
}

/** Display title of a heading: no numbering, citations or confidence suffix. */
export function cleanHeading(s: string): string {
  return stripCitations(s.replace(CONFIDENCE_SUFFIX, ''))
    .replace(/^\d+(?:\.\d+)?[a-z]?\.?\s+/, '')
    .replace(/\s*\(\s*\)\s*$/, '')
    .trim();
}

function cleanItems(items: ListItem[]): ListItem[] {
  const out: ListItem[] = [];
  for (const it of items) {
    const text = META_PARA.test(it.text) ? '' : cleanText(it.text);
    const children = cleanBlocks(it.children);
    if (!text && !children.length) continue;
    out.push({ text, children });
  }
  return out;
}

export function cleanBlocks(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    switch (b.t) {
      case 'para': {
        if (META_PARA.test(b.text)) {
          // "Sources:" introducing a list of sources: drop the list too.
          if (/^Sources?:\s*$/i.test(b.text) && blocks[i + 1]?.t === 'list') i++;
          break;
        }
        const text = cleanText(b.text);
        if (text) out.push({ t: 'para', text });
        break;
      }
      case 'list': {
        const items = cleanItems(b.items);
        if (items.length) out.push({ ...b, items });
        break;
      }
      case 'table': {
        const keep = b.head.map((h, k) => (DROP_COLUMN.test(stripCitations(h).replace(/\*/g, '')) ? -1 : k)).filter((k) => k >= 0);
        const cell = (c: string) => cleanText(c) || stripCitations(c);
        out.push({ t: 'table', head: keep.map((k) => headCell(b.head[k] ?? '')), rows: b.rows.map((r) => keep.map((k) => cell(r[k] ?? ''))) });
        break;
      }
      case 'heading':
        out.push({ ...b, text: cleanHeading(b.text) });
        break;
      default:
        out.push(b);
    }
  }
  return out;
}
