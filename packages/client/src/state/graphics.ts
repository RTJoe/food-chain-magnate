/**
 * Graphics quality setting (board controls). The overlay writes `graphicsSetting`; the 3D layer
 * stores it with `setGraphicsPref` (three/scene.ts, key 'fcm.graphics') and applies it to the live
 * renderer, then mirrors the tier it runs at into `graphicsTier`. Neither side imports the other.
 */
import { signal } from '@preact/signals';

export type GraphicsSetting = 'auto' | 'high' | 'medium' | 'low';

/** Same key as three/scene.ts `graphicsPref`, read here only for the control's initial value. */
const KEY = 'fcm.graphics';

function load(): GraphicsSetting {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'high' || v === 'medium' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export const graphicsSetting = signal<GraphicsSetting>(load());
/** Tier the 3D board renders at right now (null while no 3D board runs). */
export const graphicsTier = signal<'high' | 'medium' | 'low' | null>(null);
