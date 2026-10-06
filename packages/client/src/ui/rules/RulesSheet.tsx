/** The rules book in a sheet over the current screen (opened from "What's this?"), so a game is never left. */
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../icons.js';
import type { RulesLoc } from '../glossary/api.js';
import { RulesBook } from './RulesBook.js';
import { rulesHash } from './route.js';
import './rules.css';

export function RulesSheet({ loc: initial, onClose }: { loc: RulesLoc; onClose: () => void }) {
  const [loc, setLoc] = useState<RulesLoc>(initial);
  useEffect(() => setLoc(initial), [initial]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="rules-sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="rules-sheet glass" role="dialog" aria-modal="true" aria-label="Rules and glossary">
        <header class="rules-sheet-head">
          <h2>{Icon.log({ size: 20 })} Rules &amp; glossary</h2>
          <a class="icon-btn" href={rulesHash(loc)} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab">
            {Icon.link({ size: 18 })}
          </a>
          <button type="button" class="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
            {Icon.x({ size: 20 })}
          </button>
        </header>
        <RulesBook loc={loc} onLoc={setLoc} layout="sheet" />
      </div>
    </div>
  );
}
