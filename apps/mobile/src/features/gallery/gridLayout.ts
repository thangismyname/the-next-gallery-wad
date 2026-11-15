/** Gap between grid tiles (pt). */
export const GRID_GAP = 2;
/** Target cell size: 3 columns on every phone in portrait, more on wider windows. */
const TARGET_CELL = 130;

/**
 * Columns by available width, keeping cells ≈ phone size (Library, Favorites,
 * search results). Pinch-to-change columns comes later, together with the web.
 */
export const gridColumns = (width: number) => Math.max(3, Math.floor(width / TARGET_CELL));

/** Square cell size for `columns` across `width`. */
export const gridCell = (width: number, columns: number) => (width - GRID_GAP * (columns - 1)) / columns;

/** Split items into rows of `columns` (virtualized grids render rows). */
export function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}
