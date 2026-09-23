import type { Editor, Path } from '@trevixal/core'
import { cellElementAt } from './active-cell'

/**
 * How much of its table's width a cell takes on screen, from 0 to 1, or null
 * when it is not rendered.
 *
 * A table without set widths is laid out by the browser, from its content,
 * so the document alone cannot say what share a cell has. This reads it from
 * the page, for a split to keep the table looking as it did.
 */
export function measureCellShare(editor: Editor): (cellPath: Path) => number | null {
  return (cellPath) => {
    const view = editor.view
    const cell = view ? cellElementAt(view, cellPath) : null
    const table = cell?.closest('table')
    if (!cell || !table) return null
    const whole = table.getBoundingClientRect().width
    const part = cell.getBoundingClientRect().width
    return whole > 0 && part > 0 ? Math.min(1, part / whole) : null
  }
}
