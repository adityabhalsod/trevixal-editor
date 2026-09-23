import type { Editor, EditorView, Path } from '@trevixal/core'
import { cellElementAt } from './active-cell'

/**
 * Where a rendered table's lines fall, in px, as the page lays it out.
 *
 * The document stores sizes as shares of the table, or not at all when the
 * browser sizes a table from its content. The commands that act on what a
 * table looks like, pinning its columns where they are or drawing a line
 * where the pointer went, need the lengths the page actually gave it.
 */
export interface TableGeometry {
  /** Width of every grid column, left to right. */
  readonly columns: readonly number[]
  /** Height of every row, top to bottom. */
  readonly rows: readonly number[]
  /** The table's own width, borders included. */
  readonly width: number
  /**
   * Width of the space the table sits in, the widest it may be. Infinite
   * when there is nothing laid out to measure.
   */
  readonly room: number
}

/** Reads the geometry of the table at a path, or null when it is not on the page. */
export type MeasureTable = (tablePath: Path) => TableGeometry | null

/** A rendered cell, with the grid column it starts at and how many it spans. */
export interface GridCell {
  readonly element: HTMLTableCellElement
  readonly start: number
  readonly span: number
}

/** Every cell of a rendered table placed on the grid, and how wide the grid is. */
export function gridOf(table: HTMLTableElement): { cells: GridCell[]; columnCount: number } {
  const cells: GridCell[] = []
  let columnCount = 0
  for (const row of [...table.rows]) {
    let start = 0
    for (const element of [...row.cells]) {
      const span = Math.max(1, element.colSpan)
      cells.push({ element, start, span })
      start += span
    }
    columnCount = Math.max(columnCount, start)
  }
  return { cells, columnCount }
}

/**
 * Width of every grid column. Columns come from unmerged cells where there are
 * any; a column only ever covered by merged cells takes an equal share of
 * what its neighbours leave.
 */
export function columnWidthsOf(cells: readonly GridCell[], columnCount: number): number[] {
  const columns: number[] = new Array<number>(columnCount).fill(0)
  const known: boolean[] = new Array<boolean>(columnCount).fill(false)
  for (const cell of cells) {
    if (cell.span === 1 && !known[cell.start]) {
      columns[cell.start] = cell.element.getBoundingClientRect().width
      known[cell.start] = true
    }
  }
  for (const cell of cells) {
    if (cell.span === 1) continue
    const unknown: number[] = []
    let settled = 0
    for (let column = cell.start; column < cell.start + cell.span; column++) {
      if (known[column]) settled += columns[column] ?? 0
      else unknown.push(column)
    }
    if (unknown.length === 0) continue
    const share = Math.max(0, cell.element.getBoundingClientRect().width - settled) / unknown.length
    for (const column of unknown) {
      columns[column] = share
      known[column] = true
    }
  }
  return columns
}

/**
 * The content-box width of the block a table sits in. The widest it may be
 * without spilling out of the editor. Infinite when there is nothing to
 * measure, so a table in an unlaid-out document is left alone.
 */
export function availableWidth(table: HTMLTableElement): number {
  return table.parentElement ? contentWidth(table.parentElement) : Number.POSITIVE_INFINITY
}

/** An element's width inside its padding: the room a block placed in it has. */
export function contentWidth(element: HTMLElement): number {
  const style = (element.ownerDocument.defaultView ?? globalThis.window).getComputedStyle(element)
  const width =
    element.clientWidth -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight)
  return Number.isFinite(width) && width > 0 ? width : Number.POSITIVE_INFINITY
}

/** A rendered table's geometry. */
export function geometryOf(table: HTMLTableElement): TableGeometry {
  const { cells, columnCount } = gridOf(table)
  return {
    columns: columnWidthsOf(cells, columnCount),
    rows: [...table.rows].map((row) => row.getBoundingClientRect().height),
    width: table.getBoundingClientRect().width,
    room: availableWidth(table),
  }
}

/** The rendered `<table>` for a table path, found through its first cell. */
export function tableElementAt(view: EditorView, tablePath: Path): HTMLTableElement | null {
  const cell = cellElementAt(view, [...tablePath, 0, 0])
  return cell?.closest('table') ?? null
}

/**
 * Measure tables on `editor`'s page, for the commands that size a table by
 * how it looks rather than by what it stores: `fixColumnWidths`,
 * `distributeRowsEvenly`, and `distributeColumnsEvenly` over a selection.
 */
export function measureTableGeometry(editor: Editor): MeasureTable {
  return (tablePath) => {
    const view = editor.view
    const table = view ? tableElementAt(view, tablePath) : null
    return table ? geometryOf(table) : null
  }
}
