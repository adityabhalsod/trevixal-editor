import { type Command, type EditorNode, type Path, TableMap, nodeAtPath } from '@trevixal/core'
import { sidesOfPart } from './cell-borders'
import { emptyCell, replaceTable, scaleWidth } from './commands'
import { cellsInSelection } from './features'
import { type Placed, caretAtGrid, placedFor, placementsOf, tableFrom } from './table-grid'

/** Word's widest table, and so the most columns one split will make. */
export const MAX_SPLIT_COLUMNS = 63

/** The most rows one split will make. */
export const MAX_SPLIT_ROWS = 100

export interface SplitCellsOptions {
  /**
   * A cell's share of its table's width on screen, from 0 to 1, as
   * `measureCellShare` reads it. With it, a cell that has no width set splits
   * into cells sized to cover the same share, so a table the browser lays out
   * keeps its look, as Word's does; without it, the new columns take whatever
   * room the browser gives them.
   */
  readonly measure?: (cellPath: Path) => number | null
  /** How many rows each cell splits into; 1, the default, splits by columns only. */
  readonly rows?: number
}

/**
 * Word's Split Cells: every cell in the selection becomes `columns` cells
 * side by side, and each of those `options.rows` high.
 *
 * A merged cell shares out the columns and rows it already spans. One that
 * needs more adds them to the grid, and the cells standing beside it in
 * those columns or rows span them, so the rest of the table looks as it did.
 * Each new cell keeps the split cell's formatting and its share of the width;
 * the content stays in the first. To split a merged cell straight back into
 * the cells it came from, `splitCell` does that without asking how many.
 *
 * Declines outside a table, and for counts that are not whole numbers, at
 * most {@link MAX_SPLIT_COLUMNS} columns and {@link MAX_SPLIT_ROWS} rows,
 * making at least two cells.
 */
export function splitCellInto(columns: number, options: SplitCellsOptions = {}): Command {
  return (state) => {
    const rows = options.rows ?? 1
    const fits = (count: number, most: number): boolean =>
      Number.isInteger(count) && count >= 1 && count <= most
    if (!fits(columns, MAX_SPLIT_COLUMNS) || !fits(rows, MAX_SPLIT_ROWS) || columns * rows < 2) {
      return null
    }
    const targets = cellsInSelection(state)
    const first = targets[0]
    if (!first) return null
    const tablePath = first.path.slice(0, -2)
    const table = nodeAtPath(state.doc, tablePath)
    if (!table) return null

    const map = TableMap.of(table)
    const placed = placementsOf(table)
    const rowNodes = [...table.content.children]
    // Measured now, while the page still shows the table as it was.
    const spots = targets.map(({ path }) => {
      const cell = map.cellAt(path[path.length - 2] as number, path[path.length - 1] as number)
      if (!cell) return null
      return { target: placedFor(map, placed, cell), share: options.measure?.(path) ?? null }
    })

    let corner: Placed | null = null
    for (const spot of spots) {
      if (!spot) continue
      const parts = splitPlaced(placed, rowNodes, spot.target, columns, rows, spot.share)
      const lead = parts[0] as Placed
      if (
        !corner ||
        lead.top < corner.top ||
        (lead.top === corner.top && lead.left < corner.left)
      ) {
        corner = lead
      }
    }
    if (!corner) return null

    const built = tableFrom(table, rowNodes, placed)
    // The caret goes to the first new cell of the top-left target.
    const row = built.rowIndex[corner.top] ?? corner.top
    return replaceTable(
      state,
      tablePath,
      built.table,
      caretAtGrid(tablePath, built.table, row, corner.left),
    )
  }
}

/**
 * Split one placed cell in `placed`, in place: it is replaced by its parts,
 * the grid grows where it needs more columns or rows than the cell covers,
 * and every other placement moves or widens to match. Returns the parts,
 * the one keeping the content first.
 */
function splitPlaced(
  placed: Placed[],
  rowNodes: EditorNode[],
  target: Placed,
  columns: number,
  rows: number,
  share: number | null,
): Placed[] {
  const schema = target.node.type.schema
  const others = placed.filter((cell) => cell !== target)

  const addedColumns = Math.max(0, columns - target.width)
  if (addedColumns > 0) {
    // The new columns open where the cell ended; whatever covers that column
    // in the rows beside it widens across them, keeping its width, since it
    // still covers the same stretch of the table.
    const edge = target.left + target.width
    for (const cell of others) {
      if (cell.left >= edge) cell.left += addedColumns
      else if (cell.left + cell.width >= edge) cell.width += addedColumns
    }
  }
  const addedRows = Math.max(0, rows - target.height)
  if (addedRows > 0) {
    const edge = target.top + target.height
    for (const cell of others) {
      if (cell.top >= edge) cell.top += addedRows
      else if (cell.top + cell.height >= edge) cell.height += addedRows
    }
    const rowType = schema.nodeType('tableRow')
    rowNodes.splice(edge, 0, ...Array.from({ length: addedRows }, () => rowType.create()))
  }

  const coveredColumns = target.width + addedColumns
  const coveredRows = target.height + addedRows
  const parts: Placed[] = []
  let top = target.top
  for (let row = 0; row < rows; row++) {
    const height = shareOf(coveredRows, rows, row)
    let left = target.left
    for (let column = 0; column < columns; column++) {
      const width = shareOf(coveredColumns, columns, column)
      const attrs = {
        ...target.node.attrs,
        width: widthFor(target.node, share, width, coveredColumns),
        hiddenBorders: sidesOfPart(target.node, row, column, rows, columns),
      }
      const node =
        row === 0 && column === 0 ? target.node.withAttrs(attrs) : emptyCell(schema, attrs)
      parts.push({ node, top, left, width, height })
      left += width
    }
    top += height
  }
  placed.splice(placed.indexOf(target), 1, ...parts)
  return parts
}

/** Part `index` of `whole` shared `count` ways, as evenly as it goes, the first parts taking any remainder. */
function shareOf(whole: number, count: number, index: number): number {
  return Math.floor(whole / count) + (index < whole % count ? 1 : 0)
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
