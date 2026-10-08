/**
 * The rules book and glossary browser. Controlled by a location (`RulesLoc`): the page (#/rules)
 * maps it to the hash, the in-game sheet keeps it locally. Searchable across both.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { PHASE_STEPS } from '../../state/selectors.js';
import { Icon, type IconName } from '../icons.js';
import { getTerm, GLOSSARY, GROUP_LABELS, searchGlossary, type GlossaryEntry, type GlossaryGroup } from '../glossary/index.js';
import type { RulesLoc } from '../glossary/api.js';
import { searchBook, type Book, type Chapter } from './book.js';
import { Markdown } from './RenderMarkdown.js';
import { rulesBook } from './sources.js';

const CHAPTER_ICON: Record<string, IconName> = {
  overview: 'info',
  setup: 'flag',
  milestones: 'star',
  bank: 'bank',
  employees: 'users',
  map: 'map',
  intro: 'sparkle',
  components: 'briefcase',
  ketchup: 'dinner',
};

function chapterIcon(c: Chapter): IconName {
  if (c.phase) return PHASE_STEPS.find((s) => s.kinds.includes(c.phase!))?.icon ?? 'info';
  return CHAPTER_ICON[c.id] ?? 'info';
}

/** The chapter a section id (or chapter id) belongs to. */
export function chapterFor(book: Book, id: string | null): Chapter {
  if (id) {
    const hit = book.byId.get(id);
    if (hit) return hit.chapter;
    const ch = book.chapters.find((c) => c.id === id);
    if (ch) return ch;
  }
  return book.chapters[0]!;
}

export function RulesBook({ loc, onLoc, layout }: { loc: RulesLoc; onLoc: (l: RulesLoc) => void; layout: 'page' | 'sheet' }) {
  const book = rulesBook();
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim();

  const go = (l: RulesLoc) => {
    setQuery('');
    onLoc(l);
  };
  // Navigation from outside (hash change, a new "Read the rule") ends a search.
  const locKey = loc.tab === 'rules' ? `r:${loc.section}` : `g:${loc.term}`;
  useEffect(() => setQuery(''), [locKey]);

  return (
    <div class={`rb rb-${layout}`}>
      <div class="rb-toolbar">
        <div class="segmented rb-tabs" role="tablist" aria-label="Rules or glossary">
          <button type="button" role="tab" aria-selected={loc.tab === 'rules'} class={loc.tab === 'rules' ? 'is-on' : ''} onClick={() => go({ tab: 'rules', section: null })}>
            Rules
          </button>
          <button type="button" role="tab" aria-selected={loc.tab === 'glossary'} class={loc.tab === 'glossary' ? 'is-on' : ''} onClick={() => go({ tab: 'glossary', term: null })}>
            Glossary
          </button>
        </div>
        <label class="rb-search">
          {Icon.zoomIn({ size: 16 })}
          <input type="search" placeholder="Search rules and terms" value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} aria-label="Search rules and terms" />
        </label>
        {loc.tab === 'rules' && !q && (
          <label class="rb-sources" title="Show where each rule comes from and how sure we are">
            <input type="checkbox" checked={sources} onChange={(e) => setSources((e.currentTarget as HTMLInputElement).checked)} />
            <span>Sources</span>
          </label>
        )}
      </div>
      <div class="rb-scroll" ref={scroller}>
        {q ? <SearchResults book={book} query={q} go={go} /> : loc.tab === 'rules' ? <RulesView book={book} section={loc.section} sources={sources} go={go} scroller={scroller} /> : <GlossaryView term={loc.term} go={go} scroller={scroller} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function RulesView({ book, section, sources, go, scroller }: { book: Book; section: string | null; sources: boolean; go: (l: RulesLoc) => void; scroller: { current: HTMLDivElement | null } }) {
  const chapter = chapterFor(book, section);
  const idx = book.chapters.indexOf(chapter);
  const prev = book.chapters[idx - 1];
  const next = book.chapters[idx + 1];
  const groups = useMemo(() => [...new Set(book.chapters.map((c) => c.group))], [book]);

  useEffect(() => {
    const el = section && section !== chapter.id ? document.getElementById(`rule-${section}`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else scroller.current?.scrollTo({ top: 0 });
  }, [section, chapter.id]);

  return (
    <div class="rb-layout">
      <nav class="rb-toc" aria-label="Rules contents">
        <select
          class="rb-toc-select"
          aria-label="Chapter"
          value={chapter.id}
          onChange={(e) => go({ tab: 'rules', section: (e.currentTarget as HTMLSelectElement).value })}
        >
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {book.chapters
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div class="rb-toc-list">
          {groups.map((g) => (
            <div key={g} class="rb-toc-group">
              <span class="eyebrow">{g}</span>
              <ul>
                {book.chapters
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <li key={c.id}>
                      <button type="button" class={`rb-toc-item ${c === chapter ? 'is-on' : ''}`} aria-current={c === chapter ? 'page' : undefined} onClick={() => (section === c.id ? scroller.current?.scrollTo({ top: 0 }) : go({ tab: 'rules', section: c.id }))}>
                        {Icon[chapterIcon(c)]({ size: 16 })}
                        <span>{c.title}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <article class="rb-chapter" id={`rule-${chapter.id}`}>
        <header class="rb-chapter-head">
          <span class="eyebrow">{chapter.group}</span>
          <h2>
            {Icon[chapterIcon(chapter)]({ size: 22 })} {chapter.title}
          </h2>
          <p class="lede">{chapter.blurb}</p>
        </header>
        {chapter.quick && (
          <aside class="rb-quick" aria-label="Quick card">
            <span class="eyebrow">
              {chapter.phase ? PHASE_STEPS.find((s) => s.kinds.includes(chapter.phase!))?.label : chapter.title} in {chapter.quick.length} lines
            </span>
            <ol>
              {chapter.quick.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          </aside>
        )}
        {chapter.sections.map((s, i) => {
          const H = s.level <= 2 ? 'h3' : 'h4';
          const showTitle = !(i === 0 && s.level === 2 && chapter.sections.length > 0 && sameTitle(s.title, chapter.title));
          const blocks = sources ? s.raw : s.blocks;
          return (
            <section key={s.id} id={`rule-${s.id}`} class={`rb-section rb-l${s.level}`}>
              {showTitle && (
                <H class="rb-section-title">
                  {s.title}
                  <a class="rb-anchor" href={`#/rules/${s.id}`} aria-label={`Link to ${s.title}`} onClick={(e) => {
                      e.preventDefault();
                      // Same hash again: go() changes nothing, so scroll back to the section here.
                      if (section === s.id) document.getElementById(`rule-${s.id}`)?.scrollIntoView({ block: 'start' });
                      else go({ tab: 'rules', section: s.id });
                    }}>
                    #
                  </a>
                </H>
              )}
              <Markdown blocks={blocks} cite={sources} />
            </section>
          );
        })}
        <TermsHere chapter={chapter} go={go} />
        <nav class="rb-pager">
          {prev ? (
            <button type="button" class="btn btn-ghost btn-sm" onClick={() => go({ tab: 'rules', section: prev.id })}>
              {Icon.chevronLeft({ size: 16 })} {prev.title}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => go({ tab: 'rules', section: next.id })}>
              {next.title} {Icon.chevronRight({ size: 16 })}
            </button>
          )}
        </nav>
      </article>
    </div>
  );
}

const sameTitle = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(b.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12));

/** Glossary terms whose rule lives in this chapter: a quick way into plain-English definitions. */
function TermsHere({ chapter, go }: { chapter: Chapter; go: (l: RulesLoc) => void }) {
  const ids = new Set(chapter.sections.map((s) => s.id));
  const terms = GLOSSARY.filter((e) => e.rule && ids.has(e.rule) && !e.employee && !e.milestone);
  if (!terms.length) return null;
  return (
    <aside class="rb-terms">
      <span class="eyebrow">Terms in this chapter</span>
      <div class="chip-row">
        {terms.map((t) => (
          <button key={t.id} type="button" class="chip" onClick={() => go({ tab: 'glossary', term: t.id })}>
            {t.term}
          </button>
        ))}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

const GROUP_ORDER: GlossaryGroup[] = ['basics', 'phases', 'company', 'board', 'dinner', 'marketing', 'money', 'food', 'employee', 'milestone', 'ketchup'];

function GlossaryView({ term, go, scroller }: { term: string | null; go: (l: RulesLoc) => void; scroller: { current: HTMLDivElement | null } }) {
  const [group, setGroup] = useState<GlossaryGroup | 'all'>('all');
  const sel = term ? getTerm(term) : undefined;
  const shownGroup = sel && group !== 'all' && sel.group !== group ? 'all' : group;
  useEffect(() => {
    if (term) document.getElementById(`term-${term}`)?.scrollIntoView({ block: 'center' });
    else scroller.current?.scrollTo({ top: 0 });
  }, [term]);
  const groups = GROUP_ORDER.filter((g) => shownGroup === 'all' || g === shownGroup);
  return (
    <div class="gl">
      <div class="chip-row gl-groups" role="group" aria-label="Filter terms">
        <button type="button" class={`chip ${shownGroup === 'all' ? 'is-on' : ''}`} onClick={() => setGroup('all')}>
          All ({GLOSSARY.length})
        </button>
        {GROUP_ORDER.map((g) => (
          <button key={g} type="button" class={`chip ${shownGroup === g ? 'is-on' : ''}`} onClick={() => setGroup(g)}>
            {GROUP_LABELS[g]}
          </button>
        ))}
      </div>
      {groups.map((g) => {
        const list = GLOSSARY.filter((e) => e.group === g);
        return (
          <section key={g} class="gl-group">
            <h3>{GROUP_LABELS[g]}</h3>
            <dl class="gl-list">
              {list.map((e) => (
                <TermRow key={e.id} e={e} open={e.id === term} go={go} />
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

function TermRow({ e, open, go }: { e: GlossaryEntry; open: boolean; go: (l: RulesLoc) => void }) {
  return (
    <div id={`term-${e.id}`} class={`gl-term ${open ? 'is-open' : ''}`}>
      <dt>
        <button type="button" class="gl-term-btn" aria-expanded={open} onClick={() => go({ tab: 'glossary', term: open ? null : e.id })}>
          <b>{e.term}</b>
          {e.module && <span class="pill pill-info">Ketchup</span>}
        </button>
      </dt>
      <dd>
        <p>{e.short}</p>
        {open && (
          <>
            <p class="wt-example">
              <span class="wt-example-label">For example</span>
              {e.example}
            </p>
            {e.related.length > 0 && (
              <div class="chip-row">
                {e.related.map((r) => {
                  const t = getTerm(r);
                  return t ? (
                    <button key={r} type="button" class="chip" onClick={() => go({ tab: 'glossary', term: r })}>
                      {t.term}
                    </button>
                  ) : null;
                })}
              </div>
            )}
            {e.rule && (
              <button type="button" class="link-btn" onClick={() => go({ tab: 'rules', section: e.rule ?? null })}>
                {Icon.log({ size: 16 })} Read the rule
              </button>
            )}
          </>
        )}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function Mark({ text, words }: { text: string; words: string[] }): ComponentChildren {
  if (!words.length) return text;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
}

function SearchResults({ book, query, go }: { book: Book; query: string; go: (l: RulesLoc) => void }) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const terms = searchGlossary(query).slice(0, 8);
  const hits = searchBook(book, query);
  return (
    <div class="rb-results" aria-live="polite">
      {terms.length > 0 && (
        <section>
          <h3>Terms</h3>
          <ul class="rb-hit-list">
            {terms.map((t) => (
              <li key={t.id}>
                <button type="button" class="rb-hit" onClick={() => go({ tab: 'glossary', term: t.id })}>
                  <b>
                    <Mark text={t.term} words={words} />
                  </b>
                  <span class="small muted">
                    <Mark text={t.short} words={words} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>Rules</h3>
        {hits.length === 0 ? (
          <p class="muted">No rule mentions “{query}”.</p>
        ) : (
          <ul class="rb-hit-list">
            {hits.map((h) => (
              <li key={h.section.id}>
                <button type="button" class="rb-hit" onClick={() => go({ tab: 'rules', section: h.section.id })}>
                  <span class="eyebrow">{h.chapter.title}</span>
                  <b>
                    <Mark text={h.section.title} words={words} />
                  </b>
                  <span class="small muted">
                    <Mark text={h.snippet} words={words} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
