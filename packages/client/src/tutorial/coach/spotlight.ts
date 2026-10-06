/**
 * Spotlight geometry (docs/tutorial-plan.md §4.3): client-px cutouts for the step's targets, kept
 * in step with the camera by a requestAnimationFrame loop (board targets are re-projected through
 * `window.__fcmBoard.project` every frame; the loop only re-renders when a rect moved).
 */
import { useEffect, useState } from 'preact/hooks';
import type { Target } from '../dsl.js';
import { targetClientRect } from '../runner.js';
import { isBoardTarget } from '../targets.js';

export interface Cutout {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  board: boolean;
  /** Fully off-screen board target: edge arrow position and angle (radians) instead of a cutout. */
  arrow: { x: number; y: number; angle: number } | null;
}

const PAD = 6;
const MIN = 44;

/** Cutouts for `targets` in the current viewport. */
export function computeCutouts(targets: readonly Target[]): Cutout[] {
  if (typeof window === 'undefined') return [];
  const W = window.innerWidth;
  const H = window.innerHeight;
  const out: Cutout[] = [];
  targets.forEach((t, i) => {
    if ('overlay' in t) return;
    const r = targetClientRect(t);
    if (!r) return;
    const board = isBoardTarget(t);
    let w = r.w + PAD * 2;
    let h = r.h + PAD * 2;
    let x = r.x - PAD;
    let y = r.y - PAD;
    if (w < MIN) {
      x -= (MIN - w) / 2;
      w = MIN;
    }
    if (h < MIN) {
      y -= (MIN - h) / 2;
      h = MIN;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const off = board && (x + w < 0 || y + h < 0 || x > W || y > H);
    const arrow = off
      ? (() => {
          const ax = Math.min(W - 28, Math.max(28, cx));
          const ay = Math.min(H - 28, Math.max(72, cy));
          return { x: ax, y: ay, angle: Math.atan2(cy - ay, cx - ax) };
        })()
      : null;
    out.push({ key: `${i}`, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), board, arrow });
  });
  return out;
}

/** Live cutouts for `targets` (re-measured every animation frame while mounted). */
export function useCutouts(targets: readonly Target[], key: string): Cutout[] {
  const [cuts, setCuts] = useState<Cutout[]>(() => computeCutouts(targets));
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const next = computeCutouts(targets);
      const sig = JSON.stringify(next);
      if (sig !== last) {
        last = sig;
        setCuts(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return cuts;
}
