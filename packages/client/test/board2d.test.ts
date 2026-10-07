/** 2D board picking (P6): overlapping spots resolve to the tapped square, off-board placements get a place beside the map. */
import { describe, expect, it } from 'vitest';
import type { Board, Placement } from '@fcm/engine';
import { footprint, spotAt, spotsFor } from '../src/ui/Board2D.js';

const board = { w: 10, h: 10, rows: 2, cols: 2, tileSize: 5, tiles: [], cells: [], houses: {}, restaurants: {}, campaigns: {}, drinkSources: {}, entities: {} } as unknown as Board;
const resto = (x: number, y: number, entrance: 'NW' | 'NE' | 'SE' | 'SW'): Placement => ({ kind: 'restaurant', x, y, entrance }) as Placement;
const place = (placements: Placement[]) => ({ kind: 'place' as const, label: 'Place', color: '#f00', placementKind: 'restaurant' as const, placements });

describe('Board2D picking', () => {
  it('the tapped square becomes the door: a spot anchored on it wins a tie', () => {
    const spots = spotsFor(board, place([resto(2, 2, 'SE'), resto(2, 2, 'NW'), resto(3, 3, 'NW'), resto(3, 3, 'SE')]), null);
    expect(spots.size).toBe(2);
    const hit = spotAt(spots, 3.5, 3.5)!;
    expect(hit.spot.rect).toMatchObject({ x: 3, y: 3 });
    expect(hit.spot.variants[hit.idx]).toMatchObject({ entrance: 'NW' });
    // Only one spot under the point: its corner nearest the point.
    const other = spotAt(spots, 2.2, 2.2)!;
    expect(other.spot.rect).toMatchObject({ x: 2, y: 2 });
    expect(other.spot.variants[other.idx]).toMatchObject({ entrance: 'NW' });
    expect(spotAt(spots, 8.5, 8.5)).toBeNull();
  });

  it('prefers a spot whose door can sit on the tapped square', () => {
    // (2,2) only has a NW door; (3,3) can put its door on (3,3).
    const spots = spotsFor(board, place([resto(2, 2, 'NW'), resto(3, 3, 'NW')]), null);
    const hit = spotAt(spots, 3.4, 3.4)!;
    expect(hit.spot.rect).toMatchObject({ x: 3, y: 3 });
  });

  it('campaign ghosts show one orientation at a time', () => {
    const camp = (w: number, h: number): Placement => ({ kind: 'campaign', campaignKind: 'billboard', tileNumber: 12, placement: { kind: 'board', x: 1, y: 1, w, h } }) as Placement;
    const mode = { kind: 'campaign' as const, label: 'x', color: '#f00', tileNumber: 12, placements: [camp(2, 1), camp(1, 2)] as never };
    expect(spotsFor(board, mode, 'landscape').size).toBe(1);
    expect([...spotsFor(board, mode, 'portrait').values()][0]!.rect).toMatchObject({ w: 1, h: 2 });
  });

  it('off-board placements are drawn beside the map; guides and routes stay in the list', () => {
    const air = footprint({ kind: 'campaign', campaignKind: 'airplane', tileNumber: 1, placement: { kind: 'airplane', side: 'N', offset: 2, width: 3 } } as Placement, board)!;
    expect(air.y + air.h).toBeLessThan(0);
    expect(air).toMatchObject({ x: 2, w: 3 });
    const fw = footprint({ kind: 'freeway', side: 'E', offset: 4 } as Placement, board)!;
    expect(fw.x).toBeGreaterThanOrEqual(10);
    expect(footprint({ kind: 'mapTile', row: -1, col: 0, rotation: 0 } as Placement, board)).toMatchObject({ x: 0, y: -5, w: 5, h: 5 });
    expect(footprint({ kind: 'campaign', campaignKind: 'gourmetGuide', tileNumber: 17, placement: { kind: 'offBoard' } } as Placement, board)).toBeNull();
  });
});
