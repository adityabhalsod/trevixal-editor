import { type Editor, pathOfElement } from '@trevixal/core'
import { type TableSizing, setTableSizing } from './resize'
import { availableWidth, columnWidthsOf, gridOf } from './table-geometry'

export interface ResizeHandlesOptions {
  /**
   * Where the drag guide and the corner handle are appended. Must be a
   * positioned ancestor of the editor surface. Both are placed absolutely
   * within it.
   */
  readonly container?: HTMLElement
  /** Narrowest a column may be dragged, in px. Defaults to 40. */
  readonly minColumnWidth?: number
  /** Shortest a row may be dragged, in px. Defaults to 24. */
  readonly minRowHeight?: number
  /**
   * A handle at the table's bottom-right corner while the caret is inside it;
   * dragging it scales the whole table. On unless set to false.
   */
  readonly cornerHandle?: boolean
}

export interface ResizeHandles {
  destroy(): void
}

/** How close to an edge counts as grabbing it. */
const GRAB = 5
/** Travel below this is a click on the edge, not a resize. */
const DEAD_ZONE = 2

type Axis = 'column' | 'row'

interface Edge {
  readonly kind: Axis
  readonly table: HTMLTableElement
  /** The grid column whose right boundary, or the row whose bottom boundary, is under the pointer. */
  readonly index: number
  /** Where that boundary is, in viewport px. */
  readonly at: number
}

interface CellInfo {
  readonly element: HTMLTableCellElement
  readonly start: number
  readonly span: number
  /** Inline style before the drag, restored if it is abandoned. */
  readonly style: string | null
}

/** A table's geometry the moment a drag starts. */
interface Layout {
  readonly table: HTMLTableElement
  readonly style: string | null
  /** Width of every grid column. */
  readonly columns: readonly number[]
  /** Height of every row. */
  readonly rows: readonly number[]
  readonly rowElements: readonly { element: HTMLTableRowElement; style: string | null }[]
  readonly cells: readonly CellInfo[]
  readonly width: number
  readonly height: number
  /** Narrowest a column can render: the stylesheet's min-width or the option, whichever is larger. */
  readonly minColumn: number
  /**
   * Widest the table may be: the content box of whatever it sits in. A table
   * already wider than that can shrink but not grow.
   */
  readonly cap: number
  /**
   * What the table adds around its cells: the outer half-borders in the
   * collapsed model, spacing and borders otherwise. The table's `width` has
   * to include it, or fixed layout renders the table that much wider than
   * asked to fit the cells.
   */
  readonly chrome: number
}

interface Drag {
  readonly kind: Axis | 'table'
  readonly index: number
  /**
   * How a column border moves: between its two columns, the table keeping its
   * width (`boundary`), or on its own, the table growing or shrinking (`edge`).
   */
  readonly mode: 'boundary' | 'edge'
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  readonly layout: Layout
  /** Column widths as currently previewed. */
  columns: number[]
  /** Row heights as currently previewed; sparse, so untouched rows stay undefined. */
  rowHeights: (number | undefined)[]
  width: number
}

/**
 * Drag the edge of a table cell to resize its column or row, or the handle at
 * the table's corner to scale the whole table.
 *
 * Borders move the way they do in Word: a border between two columns moves on
 * its own, the neighbour giving or taking the space, so the table keeps its
 * width. The table's outer edge and the corner handle change its width, and
 * stop at the editor's edge. A table never grows out of the box it sits in.
 * Shift-drag moves any border alone, also within that limit.
 *
 * The drag previews live, straight in the DOM, and nothing enters the document
 * until the pointer is released, so a resize is one history entry rather
 * than one per pixel, and Escape puts everything back. On release every
 * column is committed at once (see {@link setTableSizing}), which is what
 * keeps the columns that were not dragged exactly where they were.
 *
 * Returns a disposer.
 */
export function createTableResizeHandles(
  editor: Editor,
  options: ResizeHandlesOptions = {},
): ResizeHandles {
  const view = editor.view
  const surface = view?.dom
  if (!view || !surface) return { destroy: () => undefined }

  const doc = surface.ownerDocument
  const win = doc.defaultView
  const container = options.container ?? (surface.parentElement as HTMLElement) ?? surface
  const minColumnOption = options.minColumnWidth ?? 40
  const minRow = options.minRowHeight ?? 24

  const guide = doc.createElement('div')
  guide.className = 'trevixal-resize-guide'
  guide.hidden = true
  container.appendChild(guide)

  // Pointer-only: a shortcut for dragging every column at once. The table
  // menu's distribute and reset entries cover the keyboard.
  const corner = doc.createElement('div')
  corner.className = 'trevixal-table-resize-handle'
  corner.title = 'Drag to resize the table'
  corner.setAttribute('aria-hidden', 'true')
  corner.hidden = true
  container.appendChild(corner)

  let drag: Drag | null = null
  let cornerTable: HTMLTableElement | null = null

  // ---- geometry --------------------------------------------------------------

  /** The boundary under the pointer, if any. */
  const edgeAt = (event: PointerEvent): Edge | null => {
    const target = event.target as Element | null
    const cell = target?.closest?.('td, th') as HTMLTableCellElement | null
    const table = cell?.closest('table') as HTMLTableElement | null
    if (!cell || !table || !surface.contains(table)) return null
    const box = cell.getBoundingClientRect()

    // A boundary belongs to the column on its left (or the row above): dragging
    // it right makes that column wider. So a grab on a cell's *left* edge
    // targets the previous column, people reach for whichever side of the
    // line is nearest, and a dead left edge just reads as broken.
    const start = columnStartOf(cell)
    if (box.right - event.clientX <= GRAB) {
      return { kind: 'column', table, index: start + cell.colSpan - 1, at: box.right }
    }
    if (event.clientX - box.left <= GRAB) {
      // The table's outer edge governs no column of its own.
      return start > 0 ? { kind: 'column', table, index: start - 1, at: box.left } : null
    }
    const rowIndex = rowIndexOf(table, cell.parentElement as HTMLTableRowElement)
    if (box.bottom - event.clientY <= GRAB) {
      return { kind: 'row', table, index: rowIndex, at: box.bottom }
    }
    if (event.clientY - box.top <= GRAB) {
      return rowIndex > 0 ? { kind: 'row', table, index: rowIndex - 1, at: box.top } : null
    }
    return null
  }

  const measure = (table: HTMLTableElement): Layout => {
    const rowElements = [...table.rows].map((element) => ({
      element,
      style: element.getAttribute('style'),
    }))
    const grid = gridOf(table)
    const cells: CellInfo[] = grid.cells.map((cell) => ({
      ...cell,
      style: cell.element.getAttribute('style'),
    }))
    const columns = columnWidthsOf(grid.cells, grid.columnCount)

    const box = table.getBoundingClientRect()
    const first = cells[0]?.element
    const styledMin = first ? Number.parseFloat(computedStyle(first).minWidth) : Number.NaN
    return {
      table,
      style: table.getAttribute('style'),
      columns,
      rows: rowElements.map(({ element }) => element.getBoundingClientRect().height),
      rowElements,
      cells,
      width: box.width,
      height: box.height,
      minColumn: Math.max(minColumnOption, Number.isFinite(styledMin) ? styledMin : 0),
      cap: Math.max(availableWidth(table), box.width),
      chrome: Math.max(0, box.width - columns.reduce((sum, width) => sum + width, 0)),
    }
  }

  // ---- preview -----------------------------------------------------------------

  const preview = (current: Drag): void => {
    const { layout } = current
    if (current.kind !== 'row') {
      for (const info of layout.cells) {
        let width = 0
        for (let column = info.start; column < info.start + info.span; column++) {
          width += current.columns[column] ?? 0
        }
        info.element.style.width = `${width}px`
      }
      layout.table.style.tableLayout = 'fixed'
      layout.table.style.width = `${current.width}px`
    }
    for (let index = 0; index < current.rowHeights.length; index++) {
      const height = current.rowHeights[index]
      const row = layout.rowElements[index]
      if (row && height !== undefined) row.element.style.height = `${height}px`
    }
    positionCorner()
  }

  const restore = (layout: Layout): void => {
    for (const info of layout.cells) setInlineStyle(info.element, info.style)
    for (const row of layout.rowElements) setInlineStyle(row.element, row.style)
    setInlineStyle(layout.table, layout.style)
    positionCorner()
  }

  // ---- guide ---------------------------------------------------------------------

  const showGuide = (
    kind: Axis,
    table: HTMLTableElement,
    at: number,
    state: 'hover' | 'active',
  ): void => {
    const box = table.getBoundingClientRect()
    const origin = container.getBoundingClientRect()
    if (kind === 'column') {
      guide.style.left = `${at - origin.left - 1}px`
      guide.style.top = `${box.top - origin.top}px`
      guide.style.height = `${box.height}px`
      guide.style.width = ''
    } else {
      guide.style.top = `${at - origin.top - 1}px`
      guide.style.left = `${box.left - origin.left}px`
      guide.style.width = `${box.width}px`
      guide.style.height = ''
    }
    guide.dataset.axis = kind
    guide.dataset.state = state
    guide.hidden = false
  }

  const hideGuide = (): void => {
    guide.hidden = true
  }

  /** The dragged boundary's position, from the previewed sizes. */
  const boundaryOf = (current: Drag): number => {
    const box = current.layout.table.getBoundingClientRect()
    if (current.kind === 'column') {
      let x = box.left
      for (let column = 0; column <= current.index; column++) x += current.columns[column] ?? 0
      return x
    }
    const row = current.layout.rowElements[current.index]
    return row ? row.element.getBoundingClientRect().bottom : box.bottom
  }

  // ---- corner handle ---------------------------------------------------------------

  /** The table holding the caret, or null when the selection is outside every table. */
  const activeTable = (): HTMLTableElement | null => {
    const anchor = doc.getSelection()?.anchorNode
    if (!anchor || !surface.contains(anchor)) return null
    const element = anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement
    const table = element?.closest('table') as HTMLTableElement | null
    return table && surface.contains(table) ? table : null
  }

  const positionCorner = (): void => {
    if (!cornerTable) return
    const box = cornerTable.getBoundingClientRect()
    const origin = container.getBoundingClientRect()
    corner.style.left = `${box.right - origin.left}px`
    corner.style.top = `${box.bottom - origin.top}px`
  }

  const updateCorner = (): void => {
    // Mid-drag the handle stays with the table being dragged.
    if (drag) return
    cornerTable = options.cornerHandle === false ? null : activeTable()
    corner.hidden = !cornerTable
    positionCorner()
  }

  // ---- drag lifecycle ----------------------------------------------------------------

  const begin = (
    kind: Axis | 'table',
    table: HTMLTableElement,
    index: number,
    event: PointerEvent,
  ): void => {
    const layout = measure(table)
    if (layout.columns.length === 0 || layout.width <= 0) return
    // The outer edge has no neighbour to trade with, so it always moves alone.
    const outer = index === layout.columns.length - 1
    drag = {
      kind,
      index,
      mode: kind === 'column' && (outer || event.shiftKey) ? 'edge' : 'boundary',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      layout,
      columns: [...layout.columns],
      rowHeights: [],
      width: layout.width,
    }
    // Cancelling the pointerdown keeps the caret where it is and starts no
    // text selection under the drag.
    event.preventDefault()
    doc.body.style.userSelect = 'none'
    doc.body.style.cursor = cursorFor(kind)
    doc.addEventListener('pointermove', onDragMove)
    doc.addEventListener('pointerup', onDragEnd)
    doc.addEventListener('pointercancel', onDragCancel)
    doc.addEventListener('keydown', onKeyDown, true)
    if (kind !== 'table') showGuide(kind, table, boundaryOf(drag), 'active')
  }

  const finish = (): Drag | null => {
    const current = drag
    drag = null
    doc.removeEventListener('pointermove', onDragMove)
    doc.removeEventListener('pointerup', onDragEnd)
    doc.removeEventListener('pointercancel', onDragCancel)
    doc.removeEventListener('keydown', onKeyDown, true)
    doc.body.style.userSelect = ''
    doc.body.style.cursor = ''
    hideGuide()
    return current
  }

  const onDragMove = (event: PointerEvent): void => {
    const current = drag
    if (!current || event.pointerId !== current.pointerId) return
    const { layout } = current
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY

    if (current.kind === 'column') {
      const from = layout.columns[current.index] ?? 0
      current.columns = [...layout.columns]
      if (current.mode === 'boundary') {
        // The neighbour gives up what this column gains, down to its minimum,
        // so the border moves and nothing else does.
        const neighbour = layout.columns[current.index + 1] ?? 0
        const delta = clamp(
          dx,
          Math.min(0, layout.minColumn - from),
          Math.max(0, neighbour - layout.minColumn),
        )
        current.columns[current.index] = from + delta
        current.columns[current.index + 1] = neighbour - delta
        current.width = layout.width
      } else {
        // The table grows or shrinks with the column, as far as the editor's
        // edge; a column already under the minimum is not forced wider.
        const room = layout.cap - layout.width
        const next = clamp(from + dx, Math.min(from, layout.minColumn), from + Math.max(0, room))
        current.columns[current.index] = next
        current.width = layout.width + (next - from)
      }
    } else if (current.kind === 'row') {
      const from = layout.rows[current.index] ?? 0
      current.rowHeights = []
      current.rowHeights[current.index] = Math.max(minRow, from + dy)
    } else {
      // Every column scales by the same factor, between the narrowest the
      // columns allow and the editor's edge. The per-column clamp keeps a
      // narrow column legible, so the width is re-summed rather than assumed.
      const floor = Math.min(layout.width, layout.minColumn * layout.columns.length)
      const scale = clamp(layout.width + dx, floor, layout.cap) / layout.width
      current.columns = layout.columns.map((width) => Math.max(layout.minColumn, width * scale))
      current.width = current.columns.reduce((sum, width) => sum + width, 0) + layout.chrome
      if (Math.abs(dy) > DEAD_ZONE && layout.height > 0) {
        const vertical = Math.max(minRow * layout.rows.length, layout.height + dy) / layout.height
        current.rowHeights = layout.rows.map((height) => Math.max(minRow, height * vertical))
      } else {
        current.rowHeights = []
      }
    }

    preview(current)
    if (current.kind !== 'table')
      showGuide(current.kind, layout.table, boundaryOf(current), 'active')
  }

  const onDragEnd = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const current = finish()
    if (!current) return
    const { layout } = current
    const rowMoved = current.rowHeights.some(
      (height, index) =>
        height !== undefined && Math.abs(height - (layout.rows[index] ?? 0)) >= DEAD_ZONE,
    )
    // A border moved between two columns leaves the width alone, so the
    // columns are checked as well as the table.
    const columnsMoved =
      current.kind !== 'row' &&
      current.columns.some(
        (width, index) => Math.abs(width - (layout.columns[index] ?? 0)) >= DEAD_ZONE,
      )
    const widthMoved = current.kind !== 'row' && Math.abs(current.width - layout.width) >= DEAD_ZONE
    if (!rowMoved && !columnsMoved && !widthMoved) {
      restore(layout)
      return
    }

    // Whole pixels that still add up: rounding each column on its own can
    // leave the columns a pixel wider than the table, and fixed layout then
    // widens the table to fit them, a pixel past the editor's edge.
    const columnWidths = roundToTotal(current.columns, Math.round(current.width - layout.chrome))
    const sizing: TableSizing =
      current.kind === 'row'
        ? { rowHeights: current.rowHeights }
        : {
            columnWidths,
            width: columnWidths.reduce((sum, width) => sum + width, 0) + Math.round(layout.chrome),
            ...(rowMoved ? { rowHeights: current.rowHeights } : {}),
          }
    const path = pathOfElement(surface, view.renderer, layout.table)
    // Store what was dragged as a proportion of the space the table sits in,
    // not as pixels of the window it was dragged in. Otherwise a table sized
    // in fullscreen keeps those pixels afterwards and hangs off the edge of
    // the narrower editor.
    const room = availableWidth(layout.table)
    const applied = path
      ? editor.exec(
          setTableSizing(sizing, {
            tablePath: path,
            ...(Number.isFinite(room) ? { relativeTo: room } : {}),
          }),
        )
      : false
    // The preview may only stay if the document took the change; otherwise the
    // DOM would show a size the model does not hold.
    if (!applied) restore(layout)
  }

  const onDragCancel = (): void => {
    const current = finish()
    if (current) restore(current.layout)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !drag) return
    event.preventDefault()
    event.stopPropagation()
    onDragCancel()
  }

  // ---- surface -----------------------------------------------------------------------

  const onHover = (event: PointerEvent): void => {
    // Not while dragging, and not while a text selection is being swept.
    if (drag || event.buttons !== 0) return
    const edge = edgeAt(event)
    surface.style.cursor = edge ? cursorFor(edge.kind) : ''
    if (edge) showGuide(edge.kind, edge.table, edge.at, 'hover')
    else hideGuide()
  }

  const onLeave = (): void => {
    if (drag) return
    surface.style.cursor = ''
    hideGuide()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || drag) return
    const edge = edgeAt(event)
    if (edge) begin(edge.kind, edge.table, edge.index, event)
  }

  const onCornerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || drag || !cornerTable) return
    begin('table', cornerTable, -1, event)
  }

  surface.addEventListener('pointermove', onHover)
  surface.addEventListener('pointerleave', onLeave)
  surface.addEventListener('pointerdown', onPointerDown)
  corner.addEventListener('pointerdown', onCornerDown)
  const offTransaction = editor.on('transaction', updateCorner)
  const offSelection = editor.on('selectionUpdate', updateCorner)
  // `selectionchange` is asynchronous, so a plain click into a cell is not
  // covered by the editor's own events.
  doc.addEventListener('selectionchange', updateCorner)
  win?.addEventListener('resize', positionCorner)
  updateCorner()

  return {
    destroy() {
      const current = finish()
      if (current) restore(current.layout)
      surface.removeEventListener('pointermove', onHover)
      surface.removeEventListener('pointerleave', onLeave)
      surface.removeEventListener('pointerdown', onPointerDown)
      corner.removeEventListener('pointerdown', onCornerDown)
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', updateCorner)
      win?.removeEventListener('resize', positionCorner)
      guide.remove()
      corner.remove()
      surface.style.cursor = ''
    },
  }
}

/** Grid column where a cell begins, colspans included. */
function columnStartOf(cell: HTMLTableCellElement): number {
  let start = 0
  for (
    let sibling = cell.previousElementSibling;
    sibling;
    sibling = sibling.previousElementSibling
  ) {
    start += Math.max(1, (sibling as HTMLTableCellElement).colSpan || 1)
  }
  return start
}

function rowIndexOf(table: HTMLTableElement, row: HTMLTableRowElement): number {
  return [...table.rows].indexOf(row)
}

function cursorFor(kind: Axis | 'table'): string {
  return kind === 'column' ? 'col-resize' : kind === 'row' ? 'row-resize' : 'nwse-resize'
}

function computedStyle(element: Element): CSSStyleDeclaration {
  const win = element.ownerDocument.defaultView ?? globalThis.window
  return win.getComputedStyle(element)
}

/** Put an inline style back exactly as it was, attribute and all. */
function setInlineStyle(element: HTMLElement, style: string | null): void {
  if (style === null) element.removeAttribute('style')
  else element.setAttribute('style', style)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

/**
 * Round each value to a whole number so that the results add up to `total`:
 * every value is rounded down, then the leftover pixels go to the values that
 * lost the most.
 */
function roundToTotal(values: readonly number[], total: number): number[] {
  const floors = values.map((value) => Math.max(1, Math.floor(value)))
  let remaining = total - floors.reduce((sum, value) => sum + value, 0)
  const byLoss = values
    .map((value, index) => ({ index, loss: value - Math.floor(value) }))
    .sort((a, b) => b.loss - a.loss)
  for (const { index } of byLoss) {
    if (remaining <= 0) break
    floors[index] = (floors[index] ?? 0) + 1
    remaining--
  }
  return floors
}
