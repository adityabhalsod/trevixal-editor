import { type Editor, TextSelection, domPointFromPosition } from '@trevixal/core'

/** Class marking the cell that holds the selection. */
export const ACTIVE_CELL_CLASS = 'trevixal-cell--selected'

/**
 * Mark the table cell holding the selection, so the user can see which column
 * the caret is in. A table of empty cells is otherwise ambiguous.
 *
 * This is a DOM affordance, not document state: the class is applied directly
 * rather than through a transaction, so it never enters the document or the
 * history. Returns a disposer.
 */
export function highlightActiveCell(editor: Editor): () => void {
  let marked: HTMLElement | null = null

  const clear = (): void => {
    marked?.classList.remove(ACTIVE_CELL_CLASS)
    marked = null
  }

  const update = (): void => {
    const view = editor.view
    const selection = editor.state.selection
    if (!view || !(selection instanceof TextSelection)) {
      clear()
      return
    }

    const point = domPointFromPosition(view.dom, view.renderer, selection.head)
    if (!point) {
      clear()
      return
    }

    // Walk up to the enclosing cell, stopping at the editor surface so a
    // selection outside any table clears the highlight.
    let node: Node | null = point.node
    let cell: HTMLElement | null = null
    while (node && node !== view.dom) {
      if (node instanceof HTMLTableCellElement) {
        cell = node
        break
      }
      node = node.parentNode
    }

    if (cell === marked) return
    clear()
    if (cell) {
      cell.classList.add(ACTIVE_CELL_CLASS)
      marked = cell
    }
  }

  const offTransaction = editor.on('transaction', update)
  const offSelection = editor.on('selectionUpdate', update)
  update()

  return () => {
    offTransaction()
    offSelection()
    clear()
  }
}
