import {
  type Command,
  type EditorNode,
  Fragment,
  MoveNodeStep,
  ReplaceNodesStep,
  TableMap,
  TextSelection,
  pos,
  replaceNodeAt,
} from '@trevixal/core'
import { type CellContext, cellContextAt, gridCellOf } from './commands'
import { rowGroups } from './features'
import { placementsOf, tableFrom } from './table-grid'

/** Which way a row or column is being moved. */
export type MoveDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Swap the row holding the selection with the one above or below.
 *
 * Rows are swapped whole, so a row carries its cells, their spans and their
 * content with it. The alternative, moving content between fixed rows, would
 * lose per-cell attributes like alignment and header status. Rows a merged
 * cell spans move together, past the next row or rows tied the same way, so
 * a move never cuts a merged cell apart.
 *
 * Declines at the ends of the table, and when the selection is outside one.
 */
export function moveRow(direction: 'up' | 'down'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const { table, tablePath, rowIndex } = context
    const groups = rowGroups(table)
    const at = groups.findIndex((group) => group.first <= rowIndex && rowIndex <= group.last)
    const moving = groups[at]
    const other = groups[direction === 'up' ? at - 1 : at + 1]
    if (!moving || !other) return null

    if (moving.first === moving.last && other.first === other.last) {
      // The row keeps its identity through a move, so every position inside
      // it maps with it. The caret stays in the cell the user was editing
      // without being put back by hand, and so does anything else anchored in
      // there.
      return state.tr.step(new MoveNodeStep(tablePath, rowIndex, other.first))
    }

    const upper = direction === 'up' ? other : moving
    const lower = direction === 'up' ? moving : other
    const rows = table.content.children
    const order = [
      ...rows.slice(lower.first, lower.last + 1),
      ...rows.slice(upper.first, upper.last + 1),
    ]
    const shift =
      direction === 'up' ? -(other.last - other.first + 1) : other.last - other.first + 1
    const tr = state.tr.step(
      new ReplaceNodesStep(tablePath, upper.first, lower.last + 1, Fragment.from(order)),
    )
    const moved = (path: readonly number[]): readonly number[] => {
      const next = [...path]
      next[tablePath.length] = (path[tablePath.length] as number) + shift
      return next
    }
    const { from, to } = state.selection
    return tr.setSelection(
      new TextSelection(pos(moved(from.path), from.offset), pos(moved(to.path), to.offset)),
    )
  }
}

/**
 * The table's columns in blocks no cell spans out of: each column on its
 * own, or the columns a merged cell ties together.
 */
function columnGroups(table: EditorNode): { first: number; last: number }[] {
  const map = TableMap.of(table)
  const groups: { first: number; last: number }[] = []
  let first = 0
  let last = 0
  for (let column = 0; column < map.width; column++) {
    for (const cell of map.cells) {
      if (cell.left === column) last = Math.max(last, cell.left + cell.width - 1)
    }
    if (column === last) {
      groups.push({ first, last })
      first = column + 1
      last = first
    }
  }
  return groups
}

/**
 * Swap the column holding the selection with the one beside it.
 *
 * Columns are counted in grid columns rather than child indices, so a table
 * containing merged cells still moves the right cells. Columns a merged cell
 * spans move together, as rows do; with nothing beside them to swap with,
 * the command declines rather than cutting the merge apart.
 */
export function moveColumn(direction: 'left' | 'right'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const { table, tablePath } = context
    const current = gridCellOf(context)
    const groups = columnGroups(table)
    const at = groups.findIndex(
      (group) => group.first <= current.left && current.left <= group.last,
    )
    const moving = groups[at]
    const other = groups[direction === 'left' ? at - 1 : at + 1]
    if (!moving || !other) return null

    const left = direction === 'left' ? other : moving
    const right = direction === 'left' ? moving : other
    const leftWidth = left.last - left.first + 1
    const rightWidth = right.last - right.first + 1
    const placed = placementsOf(table)
    for (const cell of placed) {
      if (cell.left >= left.first && cell.left <= left.last) cell.left += rightWidth
      else if (cell.left >= right.first && cell.left <= right.last) cell.left -= leftWidth
    }
    const built = tableFrom(table, table.content.children, placed)
    // The moving columns' cells went past the others: back by their width, or on by it.
    const shift = direction === 'left' ? -leftWidth : rightWidth
    const landed = TableMap.of(built.table).at(current.top, current.left + shift)
    const tr = state.tr.step(replaceNodeAt(tablePath, Fragment.of(built.table)))
    return tr.setSelection(
      new TextSelection(
        pos([...tablePath, landed?.row ?? context.rowIndex, landed?.index ?? 0, 0], 0),
      ),
    )
  }
}

/**
 * Swap the content of the selected cell with the next or previous one.
 *
 * Only the content moves: the destination keeps its own header flag,
 * alignment and spans, because those describe the cell's place in the grid
 * rather than the value sitting in it.
 */
export function swapCellContent(direction: MoveDirection): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const partner = neighbourOf(context, direction)
    if (!partner) return null

    const { table, tablePath, rowIndex, cellIndex } = context
    const rows = [...table.content.children]

    const sourceRow = rows[rowIndex]
    const targetRow = rows[partner.rowIndex]
    if (!sourceRow || !targetRow) return null

    const sourceCell = sourceRow.content.maybeChild(cellIndex)
    const targetCell = targetRow.content.maybeChild(partner.cellIndex)
    if (!sourceCell || !targetCell) return null

    // Content swaps, attributes stay: a header cell that receives a body
    // cell's text is still a header.
    const newSource = sourceCell.type.create(sourceCell.attrs, targetCell.content, sourceCell.marks)
    const newTarget = targetCell.type.create(targetCell.attrs, sourceCell.content, targetCell.marks)

    const withSource = replaceChild(sourceRow, cellIndex, newSource)
    rows[rowIndex] = withSource
    // Re-read the row: when both cells share a row the first replacement has
    // already produced a new node, and writing into the stale one would drop
    // that edit.
    const rowForTarget = rows[partner.rowIndex]
    if (!rowForTarget) return null
    rows[partner.rowIndex] = replaceChild(rowForTarget, partner.cellIndex, newTarget)

    const next = table.type.create(table.attrs, Fragment.from(rows), table.marks)
    const tr = state.tr.step(replaceNodeAt(tablePath, Fragment.of(next)))
    // The caret follows the content it was sitting in.
    return tr.setSelection(
      new TextSelection(pos([...tablePath, partner.rowIndex, partner.cellIndex, 0], 0)),
    )
  }
}

/**
 * The cell one step away in a direction, on the grid, or null at the
 * table's edge. Grid columns, not child indices: with merged cells above,
 * below or beside, the neighbour may sit in another row or at another index.
 */
function neighbourOf(
  context: CellContext,
  direction: MoveDirection,
): { rowIndex: number; cellIndex: number } | null {
  const map = TableMap.of(context.table)
  const cell = gridCellOf(context)
  const [row, column] =
    direction === 'left'
      ? [cell.top, cell.left - 1]
      : direction === 'right'
        ? [cell.top, cell.left + cell.width]
        : direction === 'up'
          ? [cell.top - 1, cell.left]
          : [cell.top + cell.height, cell.left]
  const found = map.at(row, column)
  return found ? { rowIndex: found.row, cellIndex: found.index } : null
}

/** A row with one cell replaced. */
function replaceChild(row: EditorNode, index: number, cell: EditorNode): EditorNode {
  const cells = [...row.content.children]
  cells[index] = cell
  return row.type.create(row.attrs, Fragment.from(cells), row.marks)
}
