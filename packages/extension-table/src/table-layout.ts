import {
  type Command,
  type EditorNode,
  type EditorState,
  SetNodeAttrsStep,
  TextSelection,
} from '@trevixal/core'
import { cellContextAt } from './commands'
import { cellsInSelection } from './features'
import { type CellVerticalAlign, cellPadding, cellVerticalAlign } from './schema'

/**
 * How a table sits on the page and in its cells: its header row and first
 * column frozen in view, cell margins and vertical alignment.
 */

/** Whether the first row of a table is its header row: every cell in it a header cell. */
function hasHeaderRow(table: EditorNode): boolean {
  const first = table.content.maybeChild(0)
  return first?.content.children.every((cell) => cell.attrs.header === true) ?? false
}

/**
 * Keep the header row of the table at the selection at the top of the
 * window while the table scrolls by, or stop. A table without a header row
 * is given one, since there is nothing else to hold; turning the option off
 * leaves the header row as it is.
 */
export const toggleFreezeHeaderRow: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const freeze = context.table.attrs.freezeHeader !== true
  const tr = state.tr
  tr.step(new SetNodeAttrsStep(context.tablePath, { ...context.table.attrs, freezeHeader: freeze }))
  if (freeze && !hasHeaderRow(context.table)) {
    context.table.child(0).content.children.forEach((cell, cellIndex) => {
      if (cell.attrs.header === true) return
      tr.step(
        new SetNodeAttrsStep([...context.tablePath, 0, cellIndex], { ...cell.attrs, header: true }),
      )
    })
  }
  return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
}

/** Keep the first column of the table at the selection in view while it scrolls sideways, or stop. */
export const toggleFreezeFirstColumn: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const freeze = context.table.attrs.freezeColumn !== true
  return state.tr
    .step(new SetNodeAttrsStep(context.tablePath, { ...context.table.attrs, freezeColumn: freeze }))
    .setSelection(new TextSelection(state.selection.from, state.selection.to))
}

/**
 * Set the room inside every cell of the table at the selection, as Word's
 * cell margins: a length (`4px`, `0`), or null for the stylesheet's own.
 * Declines a length the schema would not write.
 */
export function setCellPadding(padding: string | null): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const next = padding === null ? null : cellPadding(padding)
    if (padding !== null && next === null) return null
    if (context.table.attrs.cellPadding === next) return null
    return state.tr
      .step(new SetNodeAttrsStep(context.tablePath, { ...context.table.attrs, cellPadding: next }))
      .setSelection(new TextSelection(state.selection.from, state.selection.to))
  }
}

/**
 * Sit the content of every cell the selection covers at the top, middle or
 * bottom of its row, as Word's cell alignment does; top is stored as none.
 */
export function setCellVerticalAlign(align: CellVerticalAlign | null): Command {
  return (state) => {
    const next = cellVerticalAlign(align)
    const cells = cellsInSelection(state)
    if (cells.length === 0) return null
    const tr = state.tr
    for (const { path, cell } of cells) {
      if ((cell.attrs.verticalAlign ?? null) === next) continue
      tr.step(new SetNodeAttrsStep(path, { ...cell.attrs, verticalAlign: next }))
    }
    if (!tr.docChanged) return null
    return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
  }
}

/** How the table and cell at the selection are laid out, for the Table menu's ticks. */
export interface TableLayout {
  readonly freezeHeader: boolean
  readonly freezeColumn: boolean
  readonly cellPadding: string | null
  /** The caret's cell's; top reads as null. */
  readonly verticalAlign: CellVerticalAlign | null
}

/** The layout of the table at the selection, or null outside one; a reader, not a command. */
export function tableLayoutAt(state: EditorState): TableLayout | null {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  return {
    freezeHeader: context.table.attrs.freezeHeader === true,
    freezeColumn: context.table.attrs.freezeColumn === true,
    cellPadding: cellPadding(context.table.attrs.cellPadding),
    verticalAlign: cellVerticalAlign(context.cell.attrs.verticalAlign),
  }
}
