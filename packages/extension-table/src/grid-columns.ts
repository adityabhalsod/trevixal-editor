import { type Editor, type EditorNode, TableMap } from '@trevixal/core'

/** The grid column a rendered cell starts in, on tables with a vertical merge. */
export const GRID_COLUMN_ATTRIBUTE = 'data-grid-column'
/** Present on a cell reaching the table's last column. */
export const GRID_LAST_ATTRIBUTE = 'data-grid-last'
/** Present on a cell starting in an odd column, counting from one: a banded column's. */
export const GRID_BAND_ATTRIBUTE = 'data-grid-band'

const ATTRIBUTES = [GRID_COLUMN_ATTRIBUTE, GRID_LAST_ATTRIBUTE, GRID_BAND_ATTRIBUTE]

/**
 * Tell the stylesheet which grid column each cell stands in, on tables with
 * a cell spanning rows.
 *
 * The table styles pick a table's first column, last column and banded
 * columns out by the cells' places in their rows, which is right until a
 * cell spans down: the rows below it then start in the second column. On
 * those tables each cell is marked with where it really stands, and the
 * stylesheet reads the marks instead. A table with no vertical merge is left
 * unmarked, as its rows already say.
 *
 * A DOM affordance, not document state, like the cell highlight: the marks
 * never reach the document or its HTML. Returns a disposer.
 */
export function markGridColumns(editor: Editor): () => void {
  const update = (): void => {
    const view = editor.view
    if (!view) return
    for (const element of view.dom.querySelectorAll('table')) {
      const node = view.renderer.modelOf.get(element)
      if (node?.type.name === 'table') mark(element, node)
    }
  }
  const off = editor.on('transaction', update)
  update()
  return () => {
    off()
    const view = editor.view
    if (!view) return
    for (const cell of view.dom.querySelectorAll(`[${GRID_COLUMN_ATTRIBUTE}]`)) {
      for (const name of ATTRIBUTES) cell.removeAttribute(name)
    }
  }
}

function mark(element: HTMLTableElement, table: EditorNode): void {
  const map = TableMap.of(table)
  const spansRows = map.cells.some((cell) => cell.height > 1)
  const rows = [...element.rows]
  for (const [rowIndex, row] of rows.entries()) {
    for (const [index, cell] of [...row.cells].entries()) {
      const placed = spansRows ? map.cellAt(rowIndex, index) : null
      if (!placed) {
        for (const name of ATTRIBUTES) cell.removeAttribute(name)
        continue
      }
      setMark(cell, GRID_COLUMN_ATTRIBUTE, String(placed.left))
      setMark(cell, GRID_LAST_ATTRIBUTE, placed.left + placed.width === map.width ? '' : null)
      setMark(cell, GRID_BAND_ATTRIBUTE, placed.left % 2 === 0 ? '' : null)
    }
  }
}

/** Set an attribute, or remove it for null, touching the DOM only when it changes. */
function setMark(element: Element, name: string, value: string | null): void {
  if (value === null) {
    if (element.hasAttribute(name)) element.removeAttribute(name)
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value)
  }
}
