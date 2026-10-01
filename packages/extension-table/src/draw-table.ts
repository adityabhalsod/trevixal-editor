import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TableMap,
  TextSelection,
  type Transaction,
  nodeAtPath,
  replaceNodeAt,
} from '@trevixal/core'
import { hidesSide, showingSides, sidesOfColumnPart } from './cell-borders'
import { columnCount, cursorIn, emptyCell } from './commands'
import { sizedTable } from './resize'
import type { CellSide } from './schema'
import type { TableGeometry } from './table-geometry'
import { type Placed, caretAtGrid, placementsOf, tableFrom } from './table-grid'

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
    const placed = placementsOf(table)
    const parts: Placed[] = []
    for (const cell of placed) {
      if (cell.left > column) {
        cell.left += 1
      } else if (cell.left + cell.width > column) {
        // The cell stands in the column the line fell in: cut where the line
        // crossed it, widened across the new column where it missed.
        if (!crossesRows(cell, rows)) {
          cell.width += 1
          continue
        }
        const leftSpan = column - cell.left + 1
        const [first, second] = cutAt(cell.node, leftSpan, cell.width + 1)
        parts.push({
          node: second as EditorNode,
          top: cell.top,
          left: cell.left + leftSpan,
          width: cell.width + 1 - leftSpan,
          height: cell.height,
        })
        cell.node = first as EditorNode
        cell.width = leftSpan
      }
    }
    const built = tableFrom(table, table.content.children, [...placed, ...parts])
    const columnWidths = [...columns.slice(0, column), left, right, ...columns.slice(column + 1)]
    const sizing = { columnWidths, width: line.geometry.width }
    const sized = sizedTable(built.table, sizing, line.geometry.room)
    if (!sized) return null
    // The caret goes to the new cell right of the line, in the first row it crossed.
    const landing =
      caretAtGrid(line.tablePath, sized, rows.first, column + 1) ??
      cursorIn(line.tablePath, rows.first, 0)
    return replaced(state, line.tablePath, sized, landing)
  }
}

/** Whether a placed cell stands in any of the rows from `first` to `last`. */
function crossesRows(cell: Placed, rows: { first: number; last: number }): boolean {
  return cell.top <= rows.last && cell.top + cell.height - 1 >= rows.first
}

/** Whether a placed cell stands in any of the columns from `first` to `last`. */
function crossesColumns(cell: Placed, first: number, last: number): boolean {
  return cell.left <= last && cell.left + cell.width - 1 >= first
}

/**
 * Word's Draw Table, a line drawn across: every cell it crosses is split in
 * two where it was drawn, the text staying above, and in the columns it
 * misses the cell standing there spans both new rows, so they look as they
 * did. The new part below each crossed cell takes its formatting.
 *
 * A line drawn onto one already there lands on it instead: a merged cell it
 * crosses is split back along it, and a line the Eraser took out is drawn
 * again, under the columns the line crossed.
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
    if (onLine !== null) return alongRowLine(state, line, table, first, last, onLine)

    const index = bandAt(lines, line.y)
    const placed = placementsOf(table)
    const parts: Placed[] = []
    for (const cell of placed) {
      if (cell.top > index) {
        cell.top += 1
      } else if (cell.top + cell.height > index) {
        if (!crossesColumns(cell, first, last)) {
          cell.height += 1
          continue
        }
        const upperHeight = index - cell.top + 1
        parts.push({
          node: lowerPart(cell.node),
          top: index + 1,
          left: cell.left,
          width: cell.width,
          height: cell.height + 1 - upperHeight,
        })
        cell.node = withShown(cell.node, ['bottom'])
        cell.height = upperHeight
      }
    }
    const rowNodes = [...table.content.children]
    const split = rowNodes[index] as EditorNode
    rowNodes.splice(index + 1, 0, split.type.create(split.attrs))
    const built = tableFrom(table, rowNodes, [...placed, ...parts])
    const rowHeights: number[] = []
    rowHeights[index] = line.y - (lines[index] ?? 0)
    rowHeights[index + 1] = (lines[index + 1] ?? 0) - line.y
    const sized = sizedTable(built.table, { rowHeights }, line.geometry.room)
    if (!sized) return null
    const landing =
      caretAtGrid(line.tablePath, sized, index + 1, first) ?? cursorIn(line.tablePath, index + 1, 0)
    return replaced(state, line.tablePath, sized, landing)
  }
}

/** A line across onto one already there: split merged cells along it, draw it where erased. */
function alongRowLine(
  state: EditorState,
  line: RowLine,
  table: EditorNode,
  first: number,
  last: number,
  boundary: number,
): Transaction | null {
  let landing: { top: number; left: number } | null = null
  const placed = placementsOf(table)
  const parts: Placed[] = []
  for (const cell of placed) {
    if (!crossesColumns(cell, first, last)) continue
    if (cell.top < boundary && cell.top + cell.height > boundary) {
      const upperHeight = boundary - cell.top
      parts.push({
        node: lowerPart(cell.node),
        top: boundary,
        left: cell.left,
        width: cell.width,
        height: cell.height - upperHeight,
      })
      cell.node = withShown(cell.node, ['bottom'])
      cell.height = upperHeight
      if (!landing || cell.left < landing.left) landing = { top: boundary, left: cell.left }
    } else if (cell.top + cell.height === boundary) {
      // The rows above and below the line each own half of it.
      cell.node = withShown(cell.node, ['bottom'])
    } else if (cell.top === boundary) {
      cell.node = withShown(cell.node, ['top'])
    }
  }
  const built = tableFrom(table, table.content.children, [...placed, ...parts])
  const selection = landing
    ? (caretAtGrid(line.tablePath, built.table, landing.top, landing.left) ?? keptSelection(state))
    : keptSelection(state)
  return replaced(state, line.tablePath, built.table, selection)
}

/** The empty part below a cell split across: its formatting, and its erased sides bar the top. */
function lowerPart(cell: EditorNode): EditorNode {
  return emptyCell(cell.type.schema, { ...cell.attrs, hiddenBorders: showingSides(cell, ['top']) })
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
  const table = nodeAtPath(doc, tablePath)
  if (table?.type.name !== 'table') return []
  const map = TableMap.of(table)
  const cell = map.cellAt(
    cellPath[cellPath.length - 2] as number,
    cellPath[cellPath.length - 1] as number,
  )
  if (!cell) return []
  const opposite = OPPOSITE[side]
  // Every cell across the line along that whole side, each once.
  const spots: [number, number][] =
    side === 'left' || side === 'right'
      ? Array.from({ length: cell.height }, (_, offset) => [
          cell.top + offset,
          side === 'left' ? cell.left - 1 : cell.left + cell.width,
        ])
      : Array.from({ length: cell.width }, (_, offset) => [
          side === 'top' ? cell.top - 1 : cell.top + cell.height,
          cell.left + offset,
        ])
  const found: { path: Path; side: CellSide }[] = []
  const seen = new Set<unknown>()
  for (const [row, column] of spots) {
    const across = map.at(row, column)
    if (!across || seen.has(across)) continue
    seen.add(across)
    found.push({ path: [...tablePath, across.row, across.index], side: opposite })
  }
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
  let landing: { top: number; left: number } | null = null
  const placed = placementsOf(table)
  const parts: Placed[] = []
  for (const cell of placed) {
    if (!crossesRows(cell, rows)) continue
    if (cell.left < boundary && cell.left + cell.width > boundary) {
      const leftSpan = boundary - cell.left
      const [first, second] = cutAt(cell.node, leftSpan, cell.width)
      parts.push({
        node: second as EditorNode,
        top: cell.top,
        left: boundary,
        width: cell.width - leftSpan,
        height: cell.height,
      })
      cell.node = first as EditorNode
      cell.width = leftSpan
      if (!landing || cell.top < landing.top) landing = { top: cell.top, left: boundary }
    } else if (cell.left + cell.width === boundary) {
      cell.node = withShown(cell.node, ['right'])
    } else if (cell.left === boundary) {
      cell.node = withShown(cell.node, ['left'])
    }
  }
  const built = tableFrom(table, table.content.children, [...placed, ...parts])
  if (landing === null) return replaced(state, line.tablePath, built.table, keptSelection(state))
  // A merged cell split along the line: its parts take the widths of the
  // columns they now cover, as the page drew them.
  const sizing = { columnWidths: line.geometry.columns, width: line.geometry.width }
  const sized = sizedTable(built.table, sizing, line.geometry.room)
  const caret = sized ? caretAtGrid(line.tablePath, sized, landing.top, landing.left) : null
  return sized && caret ? replaced(state, line.tablePath, sized, caret) : null
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
