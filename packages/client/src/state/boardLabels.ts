/**
 * Board position words players can find on the table: the rim names map tiles by column letter and
 * row number ("B3"); squares are named by the tile they sit on. Off-board spots (an extra Ketchup
 * map tile) are named by the tile they touch. Pure.
 */
export const tileName = (row: number, col: number): string => `${String.fromCharCode(65 + col)}${row + 1}`;

/** Map tile of a square ("B1" for 8,3). */
export const tileOf = (x: number, y: number): string => tileName(Math.floor(y / 5), Math.floor(x / 5));

/** A map-tile slot that may lie beside the current map: "above A1", "right of D2", or "B2". */
export function tileSlotName(row: number, col: number, rows: number, cols: number): string {
  const r = Math.min(Math.max(row, 0), Math.max(rows - 1, 0));
  const c = Math.min(Math.max(col, 0), Math.max(cols - 1, 0));
  if (row < 0) return `above ${tileName(r, c)}`;
  if (row >= rows) return `below ${tileName(r, c)}`;
  if (col < 0) return `left of ${tileName(r, c)}`;
  if (col >= cols) return `right of ${tileName(r, c)}`;
  return tileName(row, col);
}
