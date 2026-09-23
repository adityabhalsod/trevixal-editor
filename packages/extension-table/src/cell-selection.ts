import {
  type Editor,
  type EditorNode,
  type EditorView,
  type Path,
  type Position,
  TextSelection,
  inlineLength,
  nodeAtPath,
  pathOfElement,
  pathsEqual,
  pos,
  textblocks,
} from '@trevixal/core'

/** A second click is what turns a text cursor into a cell selection. */
const DOUBLE_CLICK_DETAIL = 2

/**
 * Select table cells with the mouse.
 *
 * A single click puts a text cursor in the cell, as it always has: a cell is
 * prose, and editing it is the common case. A **double click** selects the
 * whole cell, and **dragging** from there extends the selection across cells.
 * Clicking anywhere else drops it, because the selection moves with the click.
 *
 * The selection is an ordinary `TextSelection` spanning from the first cell's
 * first textblock to the last cell's last one, not a new selection class. That
 * is what `mergeCells`, `splitCell` and `setCellBackground` already read, so
 * this gesture drives them without touching a command, and a cell selection
 * survives undo, redo and position mapping like any other.
 *
 * Returns a disposer. Does nothing without a view.
 */
export function enableCellSelection(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => {}

  const surface = view.dom
  const ownerDocument = surface.ownerDocument
  /** The cell the drag started in; null when no cell selection is in progress. */
  let anchor: Path | null = null

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return

    // A plain click is a text cursor, wherever it lands, and it ends whatever
    // cell selection was in progress.
    if (event.detail < DOUBLE_CLICK_DETAIL) {
      anchor = null
      return
    }

    const cell = cellPathAt(editor, view, event.target)
    if (!cell) return

    // Take the gesture off the browser: without this it word-selects on the
    // second click and then extends by word as the pointer moves, neither of
    // which can express a cell.
    event.preventDefault()
    anchor = cell
    selectCells(editor, cell, cell)
    ownerDocument.addEventListener('mousemove', onMouseMove)
    ownerDocument.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!anchor) return
    const head = cellPathAt(editor, view, event.target)
    // Outside a cell, or in another table: keep the last valid range rather
    // than collapsing it, so a pointer that strays mid-drag is forgiving.
    if (!head || !sameTable(anchor, head)) return
    event.preventDefault()
    selectCells(editor, anchor, head)
  }

  const onMouseUp = (): void => {
    // The anchor stays: the selection is still there to merge or split, and
    // the next plain click is what clears it.
    ownerDocument.removeEventListener('mousemove', onMouseMove)
    ownerDocument.removeEventListener('mouseup', onMouseUp)
  }

  surface.addEventListener('mousedown', onMouseDown)

  return () => {
    surface.removeEventListener('mousedown', onMouseDown)
    ownerDocument.removeEventListener('mousemove', onMouseMove)
    ownerDocument.removeEventListener('mouseup', onMouseUp)
    anchor = null
  }
}

/** The path of the cell an event landed in, or null for anywhere else. */
function cellPathAt(editor: Editor, view: EditorView, target: EventTarget | null): Path | null {
  let node: globalThis.Node | null = target instanceof globalThis.Node ? target : null
  while (node && node !== view.dom) {
    if (node instanceof HTMLTableCellElement) {
      const path = pathOfElement(view.dom, view.renderer, node)
      // A node view could render a cell-like element that is not a cell, and
      // a stale path could point at nothing: trust the document, not the DOM.
      if (path && nodeAtPath(editor.state.doc, path)?.type.name === 'tableCell') return path
      return null
    }
    node = node.parentNode
  }
  return null
}

/**
 * Two cells of the same row set. Cells in different tables, or at different
 * nesting depths, have no rectangle between them.
 */
function sameTable(a: Path, b: Path): boolean {
  return a.length === b.length && pathsEqual(a.slice(0, -2), b.slice(0, -2))
}

/** Select from the start of one cell to the end of another. */
function selectCells(editor: Editor, anchorCell: Path, headCell: Path): void {
  const doc = editor.state.doc
  const anchor = cellEdge(doc, anchorCell, headCell, 'anchor')
  const head = cellEdge(doc, headCell, anchorCell, 'head')
  if (!anchor || !head) return

  const selection = new TextSelection(anchor, head)
  if (editor.state.selection.eq(selection)) return
  editor.exec((state) => state.tr.setSelection(selection))
}

/**
 * The edge of `cell` that faces away from `other`, so the selection covers
 * both cells whichever way the drag went.
 */
function cellEdge(
  doc: EditorNode,
  cell: Path,
  other: Path,
  end: 'anchor' | 'head',
): Position | null {
  const node = nodeAtPath(doc, cell)
  if (!node) return null
  const blocks = textblocks(node)
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  if (!first || !last) return null

  // Each cell is covered from its outer edge: the one facing away from the
  // other cell. Which end that is depends only on document order, not on
  // which way the pointer travelled -- so a backwards drag covers the same
  // cells as a forwards one. Only a single cell needs the anchor/head split,
  // to span itself rather than collapse.
  const atStart = pathsEqual(cell, other) ? end === 'anchor' : comesBefore(cell, other)
  return atStart
    ? pos([...cell, ...first.path], 0)
    : pos([...cell, ...last.path], inlineLength(last.node.content))
}

/** Whether `a` sits before `b` in the document, by row then column. */
function comesBefore(a: Path, b: Path): boolean {
  for (let depth = 0; depth < a.length; depth++) {
    const left = a[depth] as number
    const right = b[depth] as number
    if (left !== right) return left < right
  }
  return false
}
