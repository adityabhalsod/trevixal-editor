import {
  type Command,
  type EditorNode,
  Fragment,
  MoveNodeStep,
  TextSelection,
  pos,
  replaceNodeAt,
} from '@trevixal/core'
import { type CellContext, cellContextAt, columnCount, columnStart } from './commands'

/** Which way a row or column is being moved. */
export type MoveDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Swap the row holding the selection with the one above or below.
 *
 * Rows are swapped whole, so a row carries its cells, their spans and their
 * content with it. The alternative, moving content between fixed rows, would
 * lose per-cell attributes like alignment and header status.
 *
 * Declines at the ends of the table, and when the selection is outside one.
 */
export function moveRow(direction: 'up' | 'down'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const { table, tablePath, rowIndex } = context
    const target = direction === 'up' ? rowIndex - 1 : rowIndex + 1
    if (target < 0 || target >= table.childCount) return null

    // The row keeps its identity through a move, so every position inside it
    // maps with it. The caret stays in the cell the user was editing without
    // being put back by hand, and so does anything else anchored in there.
    return state.tr.step(new MoveNodeStep(tablePath, rowIndex, target))
  }
}

/**
 * Swap the column holding the selection with the one beside it.
 *
 * Column indices are counted in grid columns rather than child indices, so a
 * table containing merged cells still moves the right cells. A column whose
 * boundary is crossed by a colspan cannot be moved without splitting that
 * cell, so the command declines instead of silently rewriting the merge.
 */
export function moveColumn(direction: 'left' | 'right'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const { table, tablePath, row, cellIndex, rowIndex } = context
    const from = columnStart(row, cellIndex)
    const to = direction === 'left' ? from - 1 : from + 1
    if (to < 0 || to >= columnCount(table)) return null

    // Every row must have a cell starting at both columns, or the swap would
    // cut through a merged cell.
    const plan: { row: EditorNode; a: number; b: number }[] = []
    for (const candidate of table.content.children) {
      const a = childIndexAtColumn(candidate, from)
      const b = childIndexAtColumn(candidate, to)
      if (a === null || b === null) return null
      plan.push({ row: candidate, a, b })
    }

    const rows = plan.map(({ row: candidate, a, b }) => {
      const cells = [...candidate.content.children]
      const first = cells[a]
      const second = cells[b]
      if (!first || !second) return candidate
      cells[a] = second
      cells[b] = first
      return candidate.type.create(candidate.attrs, Fragment.from(cells), candidate.marks)
    })

    const next = table.type.create(table.attrs, Fragment.from(rows), table.marks)
    const tr = state.tr.step(replaceNodeAt(tablePath, Fragment.of(next)))
    const landed = childIndexAtColumn(rows[rowIndex] ?? row, to)
    return tr.setSelection(
      new TextSelection(pos([...tablePath, rowIndex, landed ?? cellIndex, 0], 0)),
    )
  }
}

/**
 * Swap the content of the selected cell with the next or previous one.
 *
 * Only the content moves: the destination keeps its own header flag,
 * alignment and colspan, because those describe the cell's place in the grid
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

/** The cell one step away in a direction, or null at the table's edge. */
function neighbourOf(
  context: CellContext,
  direction: MoveDirection,
): { rowIndex: number; cellIndex: number } | null {
  const { table, row, rowIndex, cellIndex } = context

  if (direction === 'left' || direction === 'right') {
    const next = direction === 'left' ? cellIndex - 1 : cellIndex + 1
    if (next < 0 || next >= row.childCount) return null
    return { rowIndex, cellIndex: next }
  }

  const nextRow = direction === 'up' ? rowIndex - 1 : rowIndex + 1
  if (nextRow < 0 || nextRow >= table.childCount) return null
  const candidate = table.content.maybeChild(nextRow)
  if (!candidate) return null
  // Grid columns, not child indices: with merged cells above or below, the
  // cell directly under this one may sit at a different child index.
  const column = columnStart(row, cellIndex)
  const index = childIndexAtColumn(candidate, column)
  if (index === null) return null
  return { rowIndex: nextRow, cellIndex: index }
}

/** Child index of the cell that *starts* at a grid column, else null. */
function childIndexAtColumn(row: EditorNode, column: number): number | null {
  let start = 0
  for (let index = 0; index < row.childCount; index++) {
    if (start === column) return index
    const cell = row.child(index)
    const span = cell.attrs.colspan
    start += typeof span === 'number' && span > 1 ? span : 1
    if (start > column) return null // a merged cell straddles this boundary
  }
  return null
}

/** A row with one cell replaced. */
function replaceChild(row: EditorNode, index: number, cell: EditorNode): EditorNode {
  const cells = [...row.content.children]
  cells[index] = cell
  return row.type.create(row.attrs, Fragment.from(cells), row.marks)
}
