import {
  type Command,
  type EditorNode,
  Fragment,
  type Path,
  nodeAtPath,
  replaceNodeAt,
} from '@trevixal/core'
import { sidesOfColumnPart } from './cell-borders'
import {
  cellAtColumn,
  colspanOf,
  columnStart,
  cursorIn,
  emptyCell,
  scaleWidth,
  withCells,
} from './commands'
import { cellsInSelection } from './features'

/** Word's widest table, and so the most columns one split will make. */
export const MAX_SPLIT_COLUMNS = 63

export interface SplitCellsOptions {
  /**
   * A cell's share of its table's width on screen, from 0 to 1, as
   * `measureCellShare` reads it. With it, a cell that has no width set splits
   * into cells sized to cover the same share, so a table the browser lays out
   * keeps its look, as Word's does; without it, the new columns take whatever
   * room the browser gives them.
   */
  readonly measure?: (cellPath: Path) => number | null
}

/**
 * Word's Split Cells, by columns: every cell in the selection becomes
 * `columns` cells side by side.
 *
 * A merged cell shares out the columns it already spans. One that needs more
 * adds them to the grid, and in every other row the cell standing in those
 * columns widens across them, so the rest of the table looks as it did. Each
 * new cell keeps the split cell's formatting and its share of the width; the
 * content stays in the first.
 *
 * Rows are not offered: splitting one cell into rows needs the cells beside
 * it to span both, and the table model is columns only (ADR-0006). To split a
 * merged cell straight back into the cells it came from, `splitCell` does
 * that without asking how many.
 *
 * Declines outside a table, and for a count that is not a whole number from 2
 * to {@link MAX_SPLIT_COLUMNS}.
 */
export function splitCellInto(columns: number, options: SplitCellsOptions = {}): Command {
  return (state) => {
    if (!Number.isInteger(columns) || columns < 2 || columns > MAX_SPLIT_COLUMNS) return null
    const targets = cellsInSelection(state)
    const first = targets[0]
    if (!first) return null
    const tablePath = first.path.slice(0, -2)
    const table = nodeAtPath(state.doc, tablePath)
    if (!table) return null

    // Each target by its row and the grid column it starts at. A split only
    // moves the grid to its own right, so taking the rightmost first leaves
    // every target still to come where it was found.
    const spots = targets
      .map(({ path }) => {
        const rowIndex = path[path.length - 2] as number
        const cellIndex = path[path.length - 1] as number
        // Measured now, while the page still shows the table as it was.
        const share = options.measure?.(path) ?? null
        return { rowIndex, column: columnStart(table.child(rowIndex), cellIndex), share }
      })
      .sort((a, b) => b.column - a.column)

    let split = table
    for (const spot of spots) {
      split = splitAt(split, spot.rowIndex, spot.column, columns, spot.share)
    }

    // The caret goes to the first new cell of the top-left target.
    const corner = spots.reduce((best, spot) =>
      spot.rowIndex < best.rowIndex ||
      (spot.rowIndex === best.rowIndex && spot.column < best.column)
        ? spot
        : best,
    )
    const landing = cellAtColumn(split.child(corner.rowIndex), corner.column)
    const tr = state.tr
    tr.step(replaceNodeAt(tablePath, Fragment.of(split)))
    tr.setSelection(cursorIn(tablePath, corner.rowIndex, landing?.index ?? 0))
    return tr
  }
}

/**
 * The table with the cell starting at `column` in row `rowIndex` split `count`
 * ways. `share` is the cell's measured share of the table, for a cell with no
 * width of its own.
 */
function splitAt(
  table: EditorNode,
  rowIndex: number,
  column: number,
  count: number,
  share: number | null,
): EditorNode {
  const row = table.child(rowIndex)
  const at = cellAtColumn(row, column)
  if (!at || at.start !== column) return table

  const span = colspanOf(at.cell)
  // Grid columns the split needs beyond the ones the cell already covers.
  const added = Math.max(0, count - span)
  const covered = span + added
  const cells = Array.from({ length: count }, (_, index) => {
    // Shared as evenly as it goes, the first cells taking any remainder.
    const colspan = Math.floor(covered / count) + (index < covered % count ? 1 : 0)
    const attrs = {
      ...at.cell.attrs,
      colspan,
      width: widthFor(at.cell, share, colspan, covered),
      hiddenBorders: sidesOfColumnPart(at.cell, index, count),
    }
    return index === 0 ? at.cell.withAttrs(attrs) : emptyCell(table.type.schema, attrs)
  })

  const rows = table.content.children.map((other, index) => {
    if (index === rowIndex) return withCells(other, at.index, cells)
    if (added === 0) return other
    // The new columns open where the split cell ended; whichever cell covers
    // that column in this row widens across them, keeping its width, since it
    // still covers the same stretch of the table.
    const standing = cellAtColumn(other, column + span - 1)
    if (!standing) return other
    const widened = standing.cell.withAttrs({
      ...standing.cell.attrs,
      colspan: colspanOf(standing.cell) + added,
    })
    return withCells(other, standing.index, [widened])
  })
  return table.withContent(Fragment.from(rows))
}

/**
 * A new cell's width: its part of the split cell's own width, or of the share
 * it was measured at when it had none. Unsized columns beside it then share
 * the rest, as they did before.
 */
function widthFor(
  cell: EditorNode,
  share: number | null,
  colspan: number,
  covered: number,
): string | null {
  if (cell.attrs.width !== null && cell.attrs.width !== undefined) {
    return scaleWidth(cell.attrs.width, colspan, covered)
  }
  // The share as a percentage of the table: `100%` cut to this cell's part.
  return share === null ? null : scaleWidth('100%', share * colspan, covered)
}
