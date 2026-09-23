import {
  type Editor,
  type EditorView,
  type Path,
  domPointFromPosition,
  pathOfElement,
  pathsEqual,
  pos,
} from '@trevixal/core'
import { cellsInSelection } from './features'

/** Class marking the single cell that holds the caret. */
export const ACTIVE_CELL_CLASS = 'trevixal-cell--selected'

/** Class marking each cell of a selection that covers more than one. */
export const RANGE_CELL_CLASS = 'trevixal-cell--range'

/**
 * Mark the table cells the selection covers, so the user can see what a cell
 * command is about to act on. A table of empty cells is otherwise ambiguous,
 * and a multi-cell selection is invisible without this.
 *
 * The marked set is exactly what `cellsInSelection` reports, which is what
 * `setCellBackground` and the merge commands operate on: the highlight and the
 * commands cannot disagree about which cells are selected.
 *
 * This is a DOM affordance, not document state: the classes are applied
 * directly rather than through a transaction, so they never enter the document
 * or the history. Returns a disposer.
 */
export function highlightActiveCell(editor: Editor): () => void {
  let marked: HTMLElement[] = []

  const clear = (): void => {
    for (const cell of marked) cell.classList.remove(ACTIVE_CELL_CLASS, RANGE_CELL_CLASS)
    marked = []
  }

  const update = (): void => {
    const view = editor.view
    if (!view) {
      clear()
      return
    }

    const cells: HTMLElement[] = []
    for (const ref of cellsInSelection(editor.state)) {
      const element = cellElementAt(view, ref.path)
      if (element) cells.push(element)
    }

    // Re-rendering can replace a cell's element, so identity is the test: the
    // same elements need no DOM writes, different ones are re-marked.
    if (sameElements(cells, marked)) return
    clear()
    // One cell is the caret's column, which reads as a ring; several are a
    // range, which reads as a fill. Different shapes, different classes.
    const className = cells.length > 1 ? RANGE_CELL_CLASS : ACTIVE_CELL_CLASS
    for (const cell of cells) cell.classList.add(className)
    marked = cells
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

/**
 * The rendered `<td>`/`<th>` for a cell path.
 *
 * Found by climbing from a point inside the cell, checking each candidate's
 * own path rather than taking the first one: a table nested in a cell would
 * otherwise hand back the inner cell for the outer one's path.
 */
export function cellElementAt(view: EditorView, cellPath: Path): HTMLElement | null {
  const point = domPointFromPosition(view.dom, view.renderer, pos([...cellPath, 0], 0))
  if (!point) return null

  let node: globalThis.Node | null = point.node
  while (node && node !== view.dom) {
    if (node instanceof HTMLTableCellElement) {
      const path = pathOfElement(view.dom, view.renderer, node)
      if (path && pathsEqual(path, cellPath)) return node
    }
    node = node.parentNode
  }
  return null
}

function sameElements(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  return a.length === b.length && a.every((element, index) => element === b[index])
}
