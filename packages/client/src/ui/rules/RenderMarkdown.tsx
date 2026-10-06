/** Renders parsed markdown blocks (ui/rules/markdown.ts) as Preact nodes. No innerHTML. */
import type { ComponentChildren } from 'preact';
import { parseInline, type Block, type Inline } from './markdown.js';

/** Source tags shown subtly in "Show sources" mode. */
const CITE = /(\((?:[^()]*\b(?:DLX|RB|JD|KX|BGG|CMP|INF)\b[^()]*)\)|\[DLX differs\]|\b(?:High|Medium-High|Medium|Low)\.(?=\s|$))/g;

function text(v: string, cite: boolean): ComponentChildren {
  if (!cite) return v;
  const parts = v.split(CITE);
  return parts.map((p, i) => (i % 2 === 1 ? <span key={i} class="rb-cite">{p}</span> : p));
}

function inline(xs: Inline[], cite: boolean): ComponentChildren {
  return xs.map((x, i) => {
    switch (x.t) {
      case 'text':
        return text(x.v, cite);
      case 'code':
        return <code key={i}>{x.v}</code>;
      case 'strong':
        return <strong key={i}>{inline(x.c, cite)}</strong>;
      case 'em':
        return <em key={i}>{inline(x.c, cite)}</em>;
      case 'link':
        return /^https?:/.test(x.href) ? (
          <a key={i} href={x.href} target="_blank" rel="noreferrer">
            {inline(x.c, cite)}
          </a>
        ) : (
          <span key={i}>{inline(x.c, cite)}</span>
        );
    }
  });
}

export function Inl({ src, cite = false }: { src: string; cite?: boolean }) {
  return <>{inline(parseInline(src), cite)}</>;
}

export function Markdown({ blocks, cite = false }: { blocks: readonly Block[]; cite?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'heading':
            return (
              <h4 key={i} class="rb-h4">
                <Inl src={b.text} cite={cite} />
              </h4>
            );
          case 'para':
            return (
              <p key={i}>
                <Inl src={b.text} cite={cite} />
              </p>
            );
          case 'list': {
            const items = b.items.map((it, k) => (
              <li key={k}>
                {it.text && <Inl src={it.text} cite={cite} />}
                {it.children.length > 0 && <Markdown blocks={it.children} cite={cite} />}
              </li>
            ));
            return b.ordered ? (
              <ol key={i} start={b.start}>
                {items}
              </ol>
            ) : (
              <ul key={i}>{items}</ul>
            );
          }
          case 'table':
            return (
              <div key={i} class="rb-table-wrap" tabIndex={0}>
                <table class="rb-table" data-cols={b.head.length > 4 ? 'many' : undefined}>
                  <thead>
                    <tr>
                      {b.head.map((h, k) => (
                        <th key={k}>
                          <Inl src={h} cite={cite} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, k) => (
                      <tr key={k}>
                        {r.map((c, j) => (
                          <td key={j}>
                            <Inl src={c} cite={cite} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'code':
            return (
              <pre key={i} class="rb-pre">
                {b.text}
              </pre>
            );
          case 'hr':
            return <hr key={i} />;
        }
      })}
    </>
  );
}
