/**
 * Board marks keep 3:1 (WCAG non-text contrast) against the tile print and the asphalt
 * (docs/art-bible.md §5, WP3): tile seams, legal / illegal marks, range edges, route outlines.
 */
import { describe, expect, it } from 'vitest';
import { BOARD } from '../src/boardPalette.js';
import { COLORS, contrast } from '../src/theme.js';

const NON_TEXT = 3;

describe('board mark contrast', () => {
  it('tile seams: hairline on the print, near-ink across roads', () => {
    expect(contrast(BOARD.seam, BOARD.ground)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrast(BOARD.seamOnRoad, BOARD.road)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrast(BOARD.seamOnRoad, BOARD.ground)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it('illegal mark: red on the print, its white edge on the asphalt', () => {
    expect(contrast(BOARD.bad, BOARD.ground)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrast(BOARD.edge, BOARD.road)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it('legal tint on the print; ink rings and route outlines on both', () => {
    expect(contrast(BOARD.legal, BOARD.ground)).toBeGreaterThanOrEqual(NON_TEXT);
    for (const bg of [BOARD.ground, BOARD.road]) expect(contrast(COLORS.ink, bg)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it('range squares: white edge on the asphalt', () => {
    expect(contrast(BOARD.edge, BOARD.road)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it('road paint stands off the asphalt', () => {
    expect(contrast(BOARD.roadDash, BOARD.road)).toBeGreaterThanOrEqual(NON_TEXT);
  });
});
