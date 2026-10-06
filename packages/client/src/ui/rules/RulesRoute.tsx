/** App entry for #/rules: loads the rules book chunk on demand. */
import type { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export { isRulesHash } from './route.js';

let Page: FunctionComponent | null = null;

export function RulesRoute() {
  const [C, setC] = useState<FunctionComponent | null>(() => Page);
  useEffect(() => {
    if (C) return;
    void import('./RulesPage.js').then((m) => {
      Page = m.RulesPage;
      setC(() => m.RulesPage);
    });
  }, []);
  return C ? <C /> : <main class="center-page"><div class="spinner" /></main>;
}
