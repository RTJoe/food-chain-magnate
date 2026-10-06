/** Hash router: #/ (home), #/room/:id, #/hotseat, #/dev[/:fixture[/:viewer]], #/learn[/:lessonId]. */
import { signal } from '@preact/signals';

export type Route =
  | { name: 'home' }
  | { name: 'room'; id: string }
  | { name: 'hotseat' }
  | { name: 'dev'; fixture: string | null; viewer: string | null }
  /** Learn hub (lesson null) or a lesson being played (docs/tutorial-plan.md §4.5). */
  | { name: 'learn'; lesson: string | null };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [head, a, b] = parts;
  if (head === 'room' && a) return { name: 'room', id: a.toUpperCase() };
  if (head === 'hotseat') return { name: 'hotseat' };
  if (head === 'dev') return { name: 'dev', fixture: a ?? null, viewer: b ?? null };
  if (head === 'learn') return { name: 'learn', lesson: a ?? null };
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'room':
      return `#/room/${r.id}`;
    case 'hotseat':
      return '#/hotseat';
    case 'dev':
      return ['#/dev', r.fixture, r.fixture ? r.viewer : null].filter(Boolean).join('/');
    case 'learn':
      return r.lesson ? `#/learn/${encodeURIComponent(r.lesson)}` : '#/learn';
  }
}

const read = (): Route => parseRoute(typeof location === 'undefined' ? '' : location.hash);

export const route = signal<Route>(read());

export function navigate(r: Route, replace = false): void {
  const hash = routeHash(r);
  if (typeof location === 'undefined') {
    route.value = r;
    return;
  }
  if (replace) history.replaceState(null, '', hash);
  else if (location.hash !== hash) location.hash = hash;
  route.value = parseRoute(hash);
}

export function startRouter(): void {
  window.addEventListener('hashchange', () => (route.value = read()));
}

export function joinUrl(roomId: string): string {
  return `${location.origin}${location.pathname}#/room/${roomId}`;
}
