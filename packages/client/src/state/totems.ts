/**
 * Turn-order totem pictures for the 2D track (ui/TopBar.tsx), rendered by the 3D layer.
 *
 * ui/ never imports three/ (architecture §2): the 3D scene registers its snapshot renderer here
 * (three/index.ts → three/minis/chains.ts totemSnapshots) and the track asks for the chains it
 * shows. Pictures are PNG data URLs keyed `${chain}:${color}`; without WebGL nothing registers and
 * the track keeps its 2D badges.
 */
import { signal } from "@preact/signals";
import type { ChainId } from "@fcm/engine";

export interface TotemEntry {
  chain: ChainId;
  color: string;
}
export type TotemRenderer = (
  entries: TotemEntry[],
  px?: number,
) => Record<string, string>;

export const totemKey = (e: TotemEntry): string => `${e.chain}:${e.color}`;

/** Rendered totems by `totemKey`. */
export const totemImages = signal<Record<string, string>>({});

const PX = 96;
let renderer: TotemRenderer | null = null;
const wanted = new Map<string, TotemEntry>();
let scheduled = false;

function flush(): void {
  scheduled = false;
  if (!renderer || !wanted.size) return;
  const list = [...wanted.values()];
  wanted.clear();
  try {
    const out = renderer(list, PX);
    if (Object.keys(out).length)
      totemImages.value = { ...totemImages.value, ...out };
  } catch {
    // No pictures: the track keeps its badges.
  }
}

function schedule(): void {
  if (scheduled || !renderer || !wanted.size) return;
  scheduled = true;
  // After the first frames of the board, off the critical path.
  setTimeout(flush, 400);
}

/** The 3D layer offers its renderer; returns the unregister function. */
export function registerTotemRenderer(fn: TotemRenderer): () => void {
  renderer = fn;
  schedule();
  return () => {
    if (renderer === fn) renderer = null;
  };
}

/** Ask for pictures of these totems (cached; rendered once each). */
export function requestTotems(entries: readonly TotemEntry[]): void {
  const have = totemImages.peek();
  for (const e of entries) {
    const k = totemKey(e);
    if (!(k in have)) wanted.set(k, e);
  }
  schedule();
}
