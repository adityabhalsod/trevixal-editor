import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  nodeAtPath,
  replaceNodeAt,
} from '@trevixal/core'
import { hidesSide, showingSides, sidesOfColumnPart } from './cell-borders'
import {
  cellAtColumn,
  colspanOf,
  columnCount,
  columnStart,
  cursorIn,
  emptyCell,
  withCells,
} from './commands'
import { sizedTable } from './resize'
import type { CellSide } from './schema'
import type { TableGeometry } from './table-geometry'

/** How near an existing line a drawn one has to fall to land on it, in px. */
export const SNAP_DISTANCE = 6

/** A line drawn down through a table, as the Draw table tool measured it. */
export interface ColumnLine {
  readonly tablePath: Path
  /** The table as the page showed it when the line was drawn. */
  readonly geometry: TableGeometry
  /** How far the line is from the table's left edge, in px. */
  readonly x: number
  /** The first and last row it crosses. */
  readonly fromRow: number
  readonly toRow: number
}

/** A line drawn across a table, as the Draw table tool measured it. */
export interface RowLine {
  readonly tablePath: Path
  /** The table as the page showed it when the line was drawn. */
  readonly geometry: TableGeometry
  /** How far the line is from the table's top edge, in px. */
  readonly y: number
  /** The first and last grid column it crosses. */
  readonly fromColumn: number
  readonly toColumn: number
}

/** A box drawn where there is no table, as the Draw table tool measured it. */
export interface DrawnTable {
  /**
   * The top-level block the box was started over. The table goes after it,
   * or in its place when it is an empty paragraph.
   */
  readonly block: number
  /** The box's size, in px. */
  readonly width: number
  readonly height: number
  /** Width of the space the table will sit in, to store its width as a share of it. */
  readonly room: number
}

/**
 * Word's Draw Table, a line drawn down: every cell it crosses is split where
 * it was drawn, and in the rows it misses the cell standing there widens
 * across the new column, so they look as they did.
 *
 * A line drawn onto one already there lands on it instead: a merged cell it
 * crosses is split back along it, and a line the Eraser took out is drawn
 * again. Columns keep the widths the page gave them, stored as shares of the
 * table, so the new line stays where it was drawn.
 */
export function drawColumnLine(line: ColumnLine): Command {
  return (state) => {
    const table = nodeAtPath(state.doc, line.tablePath)
    const { columns } = line.geometry
    if (table?.type.name !== 'table' || columns.length !== columnCount(table)) return null
    const rows = rowRange(table, line.fromRow, line.toRow)
    if (!rows) return null
    const lines = boundariesOf(columns)
    const onLine = boundaryNear(lines, line.x)
    if (onLine !== null) return alongColumnLine(state, line, table, rows, onLine)

    // A new grid column, cut out of the one the line fell in.
    const column = bandAt(lines, line.x)
    const left = line.x - (lines[column] ?? 0)
    const right = (lines[column + 1] ?? 0) - line.x
    const children = table.content.children.map((row, rowIndex) => {
      const at = cellAtColumn(row, column)
      if (!at) return row
      const span = colspanOf(at.cell)
      return rowIndex < rows.first || rowIndex > rows.last
        ? withCells(row, at.index, [at.cell.withAttrs({ ...at.cell.attrs, colspan: span + 1 })])
        : withCells(row, at.index, cutAt(at.cell, column - at.start + 1, span + 1))
    })
    const columnWidths = [...columns.slice(0, column), left, right, ...columns.slice(column + 1)]
    const sizing = { columnWidths, width: line.geometry.width }
    const sized = sizedTable(table.withContent(Fragment.from(children)), sizing, line.geometry.room)
    if (!sized) return null
    // The caret goes to the new cell right of the line, in the first row it crossed.
    const landing = cellAtColumn(sized.child(rows.first), column + 1)?.index ?? 0
    return replaced(state, line.tablePath, sized, cursorIn(line.tablePath, rows.first, landing))
  }
}

/**
 * Word's Draw Table, a line drawn across: the row it crosses is split in two
 * where it was drawn. Cells here span columns only (ADR-0006), so the whole
 * row splits, not just the cells under the line; the new row repeats the
 * row's cells, empty, and the text stays above.
 *
 * A line drawn onto one already there draws it again wherever the Eraser took
 * it out, under the columns the line crossed.
 */
export function drawRowLine(line: RowLine): Command {
  return (state) => {
    const table = nodeAtPath(state.doc, line.tablePath)
    const { rows } = line.geometry
    if (table?.type.name !== 'table' || rows.length !== table.childCount) return null
    const lines = boundariesOf(rows)
    const first = Math.min(line.fromColumn, line.toColumn)
    const last = Math.max(line.fromColumn, line.toColumn)
    const onLine = boundaryNear(lines, line.y)
    if (onLine !== null) {
      // The rows above and below the line each own half of it.
      const next = table.withContent(
        Fragment.from(
          table.content.children.map((row, rowIndex) => {
            if (rowIndex === onLine - 1) return showingUnder(row, first, last, 'bottom')
            if (rowIndex === onLine) return showingUnder(row, first, last, 'top')
            return row
          }),
        ),
      )
      return replaced(state, line.tablePath, next, keptSelection(state))
    }

    const index = bandAt(lines, line.y)
    const row = table.child(index)
    const upper = row.withContent(
      Fragment.from(row.content.children.map((cell) => withShown(cell, ['bottom']))),
    )
    const lower = row.withContent(
      Fragment.from(
        row.content.children.map((cell) =>
          emptyCell(state.schema, { ...cell.attrs, hiddenBorders: showingSides(cell, ['top']) }),
        ),
      ),
    )
    const children = [...table.content.children]
    children.splice(index, 1, upper, lower)
    const rowHeights: number[] = []
    rowHeights[index] = line.y - (lines[index] ?? 0)
    rowHeights[index + 1] = (lines[index + 1] ?? 0) - line.y
    const sized = sizedTable(
      table.withContent(Fragment.from(children)),
      { rowHeights },
      line.geometry.room,
    )
    if (!sized) return null
    const landing = cellAtColumn(lower, first)?.index ?? 0
    return replaced(state, line.tablePath, sized, cursorIn(line.tablePath, index + 1, landing))
  }
}

/**
 * Word's Draw Table, a box drawn where there is no table: a table of one cell,
 * as wide and as tall as the box, for the rows and columns to be drawn into.
 */
export function insertDrawnTable(box: DrawnTable): Command {
  return (state) => {
    const { doc, schema } = state
    const index = Math.max(0, Math.min(box.block, doc.childCount - 1))
    const block = doc.content.maybeChild(index)
    if (!block || !(box.width > 0) || !(box.height > 0)) return null
    const cell = emptyCell(schema, { header: false, colspan: 1, align: null })
    const row = schema.nodeType('tableRow').create(undefined, Fragment.of(cell))
    const plain = schema.nodeType('table').create(undefined, Fragment.of(row))
    const table = sizedTable(plain, { width: box.width, rowHeights: [box.height] }, box.room)
    if (!table) return null
    // In place of an empty paragraph, as the grid picker does; after anything else.
    const replacing = block.isTextblock && block.textContent.length === 0
    const at = replacing ? index : index + 1
    const tr = state.tr
    tr.step(new ReplaceNodesStep([], at, replacing ? at + 1 : at, Fragment.of(table)))
    tr.setSelection(cursorIn([at], 0, 0))
    return tr
  }
}

/**
 * Word's Border Painter: draw one of a cell's lines again. A shared line is
 * hidden while either cell has it erased, so this clears the cell's side and
 * the side facing it on every neighbour across the line.
 *
 * Declines for a path that is not a cell, and for a line nothing hides.
 */
export function showCellBorder(cellPath: Path, side: CellSide): Command {
  return (state) => {
    const cell = nodeAtPath(state.doc, cellPath)
    if (cell?.type.name !== 'tableCell') return null
    const tr = state.tr
    for (const target of [{ path: cellPath, side }, ...facing(state.doc, cellPath, side)]) {
      const node = nodeAtPath(state.doc, target.path)
      if (!node || !hidesSide(node, target.side)) continue
      const hiddenBorders = showingSides(node, [target.side])
      tr.step(new SetNodeAttrsStep(target.path, { ...node.attrs, hiddenBorders }))
    }
    return tr.docChanged ? tr : null
  }
}

/** Whether one of a cell's lines is hidden, by the cell or by a neighbour across it. */
export function cellSideHidden(doc: EditorNode, cellPath: Path, side: CellSide): boolean {
  const cell = nodeAtPath(doc, cellPath)
  if (!cell) return false
  if (hidesSide(cell, side)) return true
  return facing(doc, cellPath, side).some((target) => {
    const node = nodeAtPath(doc, target.path)
    return node !== null && hidesSide(node, target.side)
  })
}

const OPPOSITE: Readonly<Record<CellSide, CellSide>> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

/** The cells across one side of a cell, each with its side that faces it. */
function facing(doc: EditorNode, cellPath: Path, side: CellSide): { path: Path; side: CellSide }[] {
  const tablePath = cellPath.slice(0, -2)
  const rowIndex = cellPath[cellPath.length - 2] as number
  const cellIndex = cellPath[cellPath.length - 1] as number
  const table = nodeAtPath(doc, tablePath)
  const row = table?.content.maybeChild(rowIndex)
  const cell = row?.content.maybeChild(cellIndex)
  if (!table || !row || !cell) return []
  const opposite = OPPOSITE[side]
  if (side === 'left' || side === 'right') {
    const index = cellIndex + (side === 'left' ? -1 : 1)
    return row.content.maybeChild(index)
      ? [{ path: [...tablePath, rowIndex, index], side: opposite }]
      : []
  }
  // Across a row line, every cell of the next row that shares a column with this one.
  const otherIndex = rowIndex + (side === 'top' ? -1 : 1)
  const other = table.content.maybeChild(otherIndex)
  if (!other) return []
  const start = columnStart(row, cellIndex)
  const end = start + colspanOf(cell)
  const found: { path: Path; side: CellSide }[] = []
  other.content.children.forEach((candidate, index) => {
    const from = columnStart(other, index)
    if (from < end && from + colspanOf(candidate) > start) {
      found.push({ path: [...tablePath, otherIndex, index], side: opposite })
    }
  })
  return found
}

/**
 * Where the lines between cells fall: 0, then the running total of `sizes`.
 * `[40, 60]` gives `[0, 40, 100]`.
 */
export function boundariesOf(sizes: readonly number[]): number[] {
  const lines = [0]
  for (const size of sizes) lines.push((lines[lines.length - 1] ?? 0) + size)
  return lines
}

/** The line within {@link SNAP_DISTANCE} of `at`, nearest first, or null. */
export function boundaryNear(lines: readonly number[], at: number): number | null {
  let best: number | null = null
  lines.forEach((line, index) => {
    const distance = Math.abs(line - at)
    if (distance > SNAP_DISTANCE) return
    if (best === null || distance < Math.abs((lines[best] ?? 0) - at)) best = index
  })
  return best
}

/** The column or row `at` falls in, clamped to the first and last. */
export function bandAt(lines: readonly number[], at: number): number {
  for (let index = 1; index < lines.length - 1; index++) {
    if (at < (lines[index] ?? 0)) return index - 1
  }
  return Math.max(0, lines.length - 2)
}

/** A line onto one already there: split merged cells along it, draw it where erased. */
function alongColumnLine(
  state: EditorState,
  line: ColumnLine,
  table: EditorNode,
  rows: { first: number; last: number },
  boundary: number,
): Transaction | null {
  let landing: { row: number; cell: number } | null = null
  const children: EditorNode[] = []
  for (const [rowIndex, row] of table.content.children.entries()) {
    const across = cellAtColumn(row, boundary)
    if (rowIndex < rows.first || rowIndex > rows.last) {
      children.push(row)
    } else if (across && across.start < boundary) {
      landing ??= { row: rowIndex, cell: across.index + 1 }
      const span = colspanOf(across.cell)
      children.push(withCells(row, across.index, cutAt(across.cell, boundary - across.start, span)))
    } else {
      children.push(showingAt(row, boundary))
    }
  }
  const next = table.withContent(Fragment.from(children))
  if (landing === null) return replaced(state, line.tablePath, next, keptSelection(state))
  // A merged cell split along the line: its parts take the widths of the
  // columns they now cover, as the page drew them.
  const sizing = { columnWidths: line.geometry.columns, width: line.geometry.width }
  const sized = sizedTable(next, sizing, line.geometry.room)
  const { row, cell } = landing
  return sized ? replaced(state, line.tablePath, sized, cursorIn(line.tablePath, row, cell)) : null
}

/**
 * A cell cut in two side by side, the first part `leftSpan` of `span` grid
 * columns wide. The text stays in the first part; the new line between them
 * is drawn, and each keeps the erased sides on its own outside.
 */
function cutAt(cell: EditorNode, leftSpan: number, span: number): EditorNode[] {
  return [leftSpan, span - leftSpan].map((colspan, index) => {
    const attrs = { ...cell.attrs, colspan, hiddenBorders: sidesOfColumnPart(cell, index, 2) }
    return index === 0 ? cell.withAttrs(attrs) : emptyCell(cell.type.schema, attrs)
  })
}

/** The row with the line at grid `boundary` drawn again on both sides of it. */
function showingAt(row: EditorNode, boundary: number): EditorNode {
  return row.withContent(
    Fragment.from(
      row.content.children.map((cell, index) => {
        const start = columnStart(row, index)
        if (start + colspanOf(cell) === boundary) return withShown(cell, ['right'])
        return start === boundary ? withShown(cell, ['left']) : cell
      }),
    ),
  )
}

/** The row with `side` drawn again on every cell overlapping the columns `first`..`last`. */
function showingUnder(row: EditorNode, first: number, last: number, side: CellSide): EditorNode {
  return row.withContent(
    Fragment.from(
      row.content.children.map((cell, index) => {
        const start = columnStart(row, index)
        const end = start + colspanOf(cell) - 1
        return end >= first && start <= last ? withShown(cell, [side]) : cell
      }),
    ),
  )
}

/** The cell with these sides drawn again, or the same cell when they already were. */
function withShown(cell: EditorNode, sides: readonly CellSide[]): EditorNode {
  const hiddenBorders = showingSides(cell, sides)
  return hiddenBorders === (cell.attrs.hiddenBorders ?? null)
    ? cell
    : cell.withAttrs({ ...cell.attrs, hiddenBorders })
}

/** The rows from `from` to `to`, either way round, kept inside the table. */
function rowRange(
  table: EditorNode,
  from: number,
  to: number,
): { first: number; last: number } | null {
  const first = Math.max(0, Math.min(from, to))
  const last = Math.min(table.childCount - 1, Math.max(from, to))
  return first <= last ? { first, last } : null
}

/** The same selection again, for a change that leaves every cell where it was. */
function keptSelection(state: EditorState): TextSelection {
  return new TextSelection(state.selection.from, state.selection.to)
}

/** Swap in the redrawn table, or decline when drawing changed nothing. */
function replaced(
  state: EditorState,
  tablePath: Path,
  next: EditorNode,
  selection: TextSelection,
): Transaction | null {
  const table = nodeAtPath(state.doc, tablePath)
  if (!table || next.eq(table)) return null
  return state.tr.step(replaceNodeAt(tablePath, Fragment.of(next))).setSelection(selection)
}
