/** Full-page rules book at #/rules (lazy chunk). */
import { useEffect } from 'preact/hooks';
import { route } from '../../state/router.js';
import { Icon, Logo } from '../icons.js';
import { RulesBook } from './RulesBook.js';
import { parseRulesHash, rulesHash } from './route.js';
import './rules.css';

export function RulesPage() {
  void route.value; // re-render on every hash change
  const loc = parseRulesHash(location.hash);
  useEffect(() => {
    document.body.dataset.screen = 'rules';
    document.title = 'Rules · Food Chain Magnate';
    return () => {
      delete document.body.dataset.screen;
    };
  }, []);
  const back = () => (location.hash = '#/');
  return (
    <main class="rules-page">
      <header class="rules-page-head">
        <button type="button" class="icon-btn" onClick={back} aria-label="Home" title="Home">
          {Icon.chevronLeft({ size: 20 })}
        </button>
        <Logo size={30} />
        <h1>Rules &amp; glossary</h1>
      </header>
      <RulesBook loc={loc} onLoc={(l) => (location.hash = rulesHash(l))} layout="page" />
    </main>
  );
}
