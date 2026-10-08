/**
 * Minimal markdown parser for the in-app rules book (docs/rules/*.md). Pure, no DOM, no
 * dependency. Covers what the rules docs use: headings, paragraphs, nested lists, pipe tables,
 * fenced code, rules (---), and inline `code`, **bold**, *em* and [links](url).
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export interface ListItem {
  text: string;
  children: Block[];
}

export type Block =
  | { t: 'heading'; level: number; text: string }
  | { t: 'para'; text: string }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'code'; text: string }
  | { t: 'hr' };

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const isTableSep = (s: string | undefined) => !!s && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(s);

export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '`') {
      code = !code;
      cur += ch;
    } else if (ch === '|' && !code) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse markdown into blocks. */
export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) body.push(lines[i++] ?? '');
      i++;
      blocks.push({ t: 'code', text: body.join('\n') });
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ t: 'heading', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) rows.push(splitRow(lines[i++] ?? ''));
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      const start = i;
      i++;
      // A list runs until a blank line followed by a non-indented, non-list line, or a heading/table.
      while (i < lines.length) {
        const l = lines[i] ?? '';
        if (!l.trim()) {
          const next = lines[i + 1] ?? '';
          if (LIST_RE.test(next) || /^\s{2,}\S/.test(next)) {
            i++;
            continue;
          }
          break;
        }
        if (HEADING_RE.test(l) || (l.trim().startsWith('|') && isTableSep(lines[i + 1])) || /^\s*```/.test(l)) break;
        if (LIST_RE.test(l) || /^\s+\S/.test(l)) {
          i++;
          continue;
        }
        // Lazy continuation of the previous item's paragraph.
        i++;
      }
      blocks.push(parseList(lines.slice(start, i)));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (!l.trim() || HEADING_RE.test(l) || LIST_RE.test(l) || /^\s*```/.test(l) || (l.trim().startsWith('|') && isTableSep(lines[i + 1]))) break;
      para.push(l.trim());
      i++;
    }
    blocks.push({ t: 'para', text: para.join(' ') });
  }
  return blocks;
}

function parseList(lines: string[]): Block {
  const first = LIST_RE.exec(lines[0] ?? '')!;
  const baseIndent = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: ListItem[] = [];
  let cur: { text: string[]; sub: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    items.push({ text: cur.text.join(' '), children: cur.sub.length ? parseBlocks(cur.sub.join('\n')) : [] });
  };
  for (const l of lines) {
    const m = LIST_RE.exec(l);
    if (m && m[1]!.length <= baseIndent) {
      flush();
      cur = { text: [m[3]!.trim()], sub: [] };
    } else if (cur) {
      if (!l.trim()) cur.sub.push('');
      else if (cur.sub.length || LIST_RE.test(l)) cur.sub.push(l.slice(Math.min(baseIndent + 2, l.length - l.trimStart().length)));
      else cur.text.push(l.trim());
    }
  }
  flush();
  return { t: 'list', ordered, start: ordered ? Number.parseInt(first[2]!, 10) : 1, items };
}

/** Parse inline markdown into tokens. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const push = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    // Backslash escapes (\*, \_, \|, \`): the next character is plain text.
    if (ch === '\\' && i + 1 < src.length && /[\\`*_|[\]#-]/.test(src[i + 1]!)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        push();
        out.push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        push();
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] !== ' ' && (i === 0 || /[\s(]/.test(src[i - 1]!))) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && src[end - 1] !== ' ' && (end + 1 >= src.length || /[\s.,;:!?)]/.test(src[end + 1]!))) {
        push();
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        push();
        out.push({ t: 'link', href: m[2]!, c: parseInline(m[1]!) });
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  push();
  return out;
}

/** Plain text of inline markdown (search index, snippets). */
export function plainInline(src: string): string {
  const walk = (xs: Inline[]): string => xs.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : walk(x.c))).join('');
  return walk(parseInline(src));
}

export function plainBlocks(blocks: readonly Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.t === 'heading' || b.t === 'para') parts.push(plainInline(b.text));
    else if (b.t === 'list') for (const it of b.items) parts.push(plainInline(it.text), plainBlocks(it.children));
    else if (b.t === 'table') parts.push(b.head.map(plainInline).join(' '), ...b.rows.map((r) => r.map(plainInline).join(' ')));
    else if (b.t === 'code') parts.push(b.text);
  }
  return parts.filter(Boolean).join('\n');
}
