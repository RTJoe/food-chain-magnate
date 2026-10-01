/**
 * Bootstrap: theme, router, Preact overlay (#app) and the 3D board (#board-root, behind the overlay).
 * The 3D layer is loaded lazily from three/index.ts (`mountScene(el, store)`) the first time a game
 * view exists; ui/ and three/ never import each other (architecture §2).
 */
import { render } from 'preact';
import { effect } from '@preact/signals';
import { applyTheme } from './theme.js';
import { startRouter } from './state/router.js';
import * as store from './state/store.js';
import { App } from './ui/App.js';
import './styles/main.css';

export type StoreModule = typeof store;
type SceneModule = { mountScene?: (el: HTMLElement, s: StoreModule) => unknown };

applyTheme();
startRouter();

let boardRoot = document.getElementById('board-root');
if (!boardRoot) {
  boardRoot = document.createElement('div');
  boardRoot.id = 'board-root';
  document.body.prepend(boardRoot);
}

const root = document.getElementById('app');
if (root) render(<App />, root);

// Guarded: the glob is empty until three/index.ts exists, and the 2D board stays in charge.
const scenes = import.meta.glob<SceneModule>('./three/index.ts');
const loadScene = scenes['./three/index.ts'];
let sceneRequested = false;
effect(() => {
  if (sceneRequested || !store.view.value || !loadScene || !boardRoot) return;
  sceneRequested = true;
  const el = boardRoot;
  loadScene()
    .then((m) => m.mountScene?.(el, store))
    .catch((e: unknown) => {
      console.error('3D board failed to load; using the 2D board', e);
      store.pushToast('3D board failed to load; showing the 2D board', 'error');
    });
});
