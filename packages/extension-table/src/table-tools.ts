import { type Editor, type Path, pathOfElement } from '@trevixal/core'
import { hideCellBorder, hidesSide } from './cell-borders'
import {
  bandAt,
  boundariesOf,
  boundaryNear,
  drawColumnLine,
  drawRowLine,
  insertDrawnTable,
} from './draw-table'
import type { CellSide } from './schema'
import { type TableGeometry, contentWidth, geometryOf } from './table-geometry'

/** Word's two table tools: Draw Table's pencil, and the Eraser. */
export type TableTool = 'draw' | 'erase'

export interface TableToolsOptions {
  /**
   * Where the guide goes, and what carries the tool's cursor while one is
   * held. A positioned ancestor of the editor surface; its parent by default.
   */
  readonly container?: HTMLElement
}

export interface TableTools {
  /** The tool held now, or null. */
  readonly tool: TableTool | null
  /** Pick a tool up, or put it down when it is the one already held. */
  toggle(tool: TableTool): void
  destroy(): void
}

/** How near a cell's side the Eraser has to be to take it, in px. */
const ERASER_REACH = 6
/** Travel below this is a click, not a stroke. */
const DEAD_ZONE = 4
/** The smallest box that draws a table, each way, in px. */
const SMALLEST_BOX = 16
/** How thick the Eraser's mark over a side is, in px. */
const ERASER_MARK = 4

/** The table a stroke began in, as the page showed it then. */
interface StrokeTable {
  readonly path: Path
  readonly geometry: TableGeometry
  readonly box: DOMRect
}

interface Stroke {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  /** Null for a stroke begun outside every table, which draws a box. */
  readonly table: StrokeTable | null
}

/** What letting go would draw: lines in the table's px, a box in the viewport's. */
type Shape =
  | {
      readonly kind: 'column'
      readonly x: number
      readonly fromRow: number
      readonly toRow: number
    }
  | {
      readonly kind: 'row'
      readonly y: number
      readonly fromColumn: number
      readonly toColumn: number
    }
  | {
      readonly kind: 'box'
      readonly left: number
      readonly top: number
      readonly width: number
      readonly height: number
    }

/** The side of a cell under the Eraser. */
interface Target {
  readonly path: Path
  readonly side: CellSide
  readonly box: DOMRect
}

/**
 * Word's Draw Table and Eraser, as tools the pointer holds.
 *
 * **Draw table.** Drag a box where there is no table for a table of one cell
 * that size. In a table, drag down to split the cells the line crosses into
 * columns there, or across to split the row in two. A line drawn onto one
 * already there lands on it, and draws it again wherever the Eraser took it
 * out.
 *
 * **Eraser.** Point at one of a cell's sides, its left, right, top or bottom
 * line, and click to stop drawing it.
 *
 * While a tool is held it has the pointer to itself over the page: a click
 * moves no caret and starts no selection, resize or cell selection. Escape,
 * or picking the tool again, puts it down. Each stroke is one command, and
 * one step to undo. Nothing happens while the editor is read-only.
 */
export function createTableTools(editor: Editor, options: TableToolsOptions = {}): TableTools {
  const view = editor.view
  const surface = view?.dom
  if (!view || !surface) return { tool: null, toggle: () => undefined, destroy: () => undefined }

  const doc = surface.ownerDocument
  const container = options.container ?? (surface.parentElement as HTMLElement) ?? surface
  const guide = doc.createElement('div')
  guide.className = 'trevixal-draw-guide'
  guide.hidden = true
  container.appendChild(guide)

  let tool: TableTool | null = null
  let stroke: Stroke | null = null
  let target: Target | null = null

  /** Whether an event is on the page while a tool is held, and so the tool's. */
  const held = (event: Event): boolean => {
    const node = event.target as Node | null
    return tool !== null && editor.isEditable && node !== null && surface.contains(node)
  }

  // ---- guide -------------------------------------------------------------------

  /** Show the guide over a rectangle given in viewport px. */
  const place = (
    shape: 'line' | 'box' | 'erase',
    left: number,
    top: number,
    width: number,
    height: number,
  ): void => {
    const origin = container.getBoundingClientRect()
    guide.style.left = `${left - origin.left - container.clientLeft + container.scrollLeft}px`
    guide.style.top = `${top - origin.top - container.clientTop + container.scrollTop}px`
    guide.style.width = `${Math.max(0, width)}px`
    guide.style.height = `${Math.max(0, height)}px`
    guide.dataset.shape = shape
    guide.hidden = false
  }

  /** Show what letting go would draw: where a line lands, and how far it reaches. */
  const preview = (current: Stroke, shape: Shape | null): void => {
    if (!shape) {
      guide.hidden = true
      return
    }
    if (shape.kind === 'box') {
      place('box', shape.left, shape.top, shape.width, shape.height)
      return
    }
    if (!current.table) return
    const { box, geometry } = current.table
    const rows = boundariesOf(geometry.rows)
    const columns = boundariesOf(geometry.columns)
    if (shape.kind === 'column') {
      const onLine = boundaryNear(columns, shape.x)
      const x = onLine === null ? shape.x : (columns[onLine] ?? shape.x)
      const top = rows[Math.min(shape.fromRow, shape.toRow)] ?? 0
      const bottom = rows[Math.max(shape.fromRow, shape.toRow) + 1] ?? 0
      place('line', box.left + x - 1, box.top + top, 2, bottom - top)
      return
    }
    const onLine = boundaryNear(rows, shape.y)
    const y = onLine === null ? shape.y : (rows[onLine] ?? shape.y)
    // A new line splits the whole row; one landing on a line redraws only what it crossed.
    const left = onLine === null ? 0 : (columns[Math.min(shape.fromColumn, shape.toColumn)] ?? 0)
    const right =
      onLine === null
        ? (columns[columns.length - 1] ?? 0)
        : (columns[Math.max(shape.fromColumn, shape.toColumn) + 1] ?? 0)
    place('line', box.left + left, box.top + y - 1, right - left, 2)
  }

  // ---- drawing -----------------------------------------------------------------

  const shapeOf = (current: Stroke, x: number, y: number): Shape | null => {
    const dx = x - current.startX
    const dy = y - current.startY
    if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return null
    if (!current.table) {
      return {
        kind: 'box',
        left: Math.min(x, current.startX),
        top: Math.min(y, current.startY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }
    }
    const { box, geometry } = current.table
    // Word straightens a stroke to whichever way it mostly went.
    if (Math.abs(dy) >= Math.abs(dx)) {
      const rows = boundariesOf(geometry.rows)
      return {
        kind: 'column',
        x: current.startX - box.left,
        fromRow: bandAt(rows, current.startY - box.top),
        toRow: bandAt(rows, y - box.top),
      }
    }
    const columns = boundariesOf(geometry.columns)
    return {
      kind: 'row',
      y: current.startY - box.top,
      fromColumn: bandAt(columns, current.startX - box.left),
      toColumn: bandAt(columns, x - box.left),
    }
  }

  /** The top-level block at or above a height on the page, the one a drawn table follows. */
  const blockAt = (y: number): number => {
    let index = 0
    let found = 0
    for (const child of [...surface.children]) {
      if (!view.renderer.modelOf.get(child)) continue
      if (child.getBoundingClientRect().top <= y) found = index
      index++
    }
    return found
  }

  const draw = (current: Stroke, shape: Shape): void => {
    if (shape.kind === 'box') {
      if (shape.width < SMALLEST_BOX || shape.height < SMALLEST_BOX) return
      const block = blockAt(current.startY)
      const room = contentWidth(surface)
      editor.exec(insertDrawnTable({ block, width: shape.width, height: shape.height, room }))
      return
    }
    if (!current.table) return
    const { path: tablePath, geometry } = current.table
    if (shape.kind === 'column') {
      const { x, fromRow, toRow } = shape
      editor.exec(drawColumnLine({ tablePath, geometry, x, fromRow, toRow }))
    } else {
      const { y, fromColumn, toColumn } = shape
      editor.exec(drawRowLine({ tablePath, geometry, y, fromColumn, toColumn }))
    }
  }

  // ---- erasing -----------------------------------------------------------------

  /** The side of a cell the pointer is on, unless it is already erased. */
  const targetAt = (event: PointerEvent): Target | null => {
    const cell = (event.target as Element | null)?.closest?.('td, th') as HTMLElement | null
    if (!cell || !surface.contains(cell)) return null
    const box = cell.getBoundingClientRect()
    const reach: readonly (readonly [CellSide, number])[] = [
      ['top', event.clientY - box.top],
      ['right', box.right - event.clientX],
      ['bottom', box.bottom - event.clientY],
      ['left', event.clientX - box.left],
    ]
    const [side, distance] = reach.reduce((best, next) => (next[1] < best[1] ? next : best))
    if (distance > ERASER_REACH) return null
    const node = view.renderer.modelOf.get(cell)
    const path = pathOfElement(surface, view.renderer, cell)
    if (!node || !path || hidesSide(node, side)) return null
    return { path, side, box }
  }

  /** Mark the side the Eraser would take, or clear the mark. */
  const showTarget = (next: Target | null): void => {
    target = next
    if (!next) {
      guide.hidden = true
      return
    }
    const { box, side } = next
    const half = ERASER_MARK / 2
    if (side === 'top' || side === 'bottom') {
      const at = side === 'top' ? box.top : box.bottom
      place('erase', box.left, at - half, box.width, ERASER_MARK)
    } else {
      const at = side === 'left' ? box.left : box.right
      place('erase', at - half, box.top, ERASER_MARK, box.height)
    }
  }

  // ---- events ------------------------------------------------------------------
  // Listened for on the document, ahead of anything on the page, so that the
  // editor, the resize handles and the cell selection never see a press that
  // belongs to the tool.

  const claim = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!held(event)) return
    claim(event)
    if (event.button !== 0) return
    if (tool === 'erase') {
      const hit = targetAt(event)
      if (hit) editor.exec(hideCellBorder(hit.path, hit.side))
      showTarget(null)
      return
    }
    const table = (event.target as Element | null)?.closest?.('table') ?? null
    const path = table ? pathOfElement(surface, view.renderer, table) : null
    stroke = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      table:
        table && path
          ? { path, geometry: geometryOf(table), box: table.getBoundingClientRect() }
          : null,
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    const current = stroke
    if (current) {
      if (event.pointerId !== current.pointerId) return
      claim(event)
      preview(current, shapeOf(current, event.clientX, event.clientY))
      return
    }
    if (!held(event)) {
      if (target) showTarget(null)
      return
    }
    // Nothing else on the page answers the pointer while a tool is held.
    event.stopPropagation()
    if (tool === 'erase') showTarget(targetAt(event))
  }

  const onPointerUp = (event: PointerEvent): void => {
    const current = stroke
    if (!current || event.pointerId !== current.pointerId) return
    claim(event)
    stroke = null
    guide.hidden = true
    const shape = shapeOf(current, event.clientX, event.clientY)
    if (shape) draw(current, shape)
  }

  const onPointerCancel = (): void => {
    stroke = null
    guide.hidden = true
  }

  /** The mouse events a press still makes, kept from the page like the press itself. */
  const onMouse = (event: MouseEvent): void => {
    if (held(event)) claim(event)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || tool === null) return
    // A menu or dialog open over the page keeps its own Escape.
    if (!stroke && !surface.contains(event.target as Node | null)) return
    claim(event)
    // Escape lets go of a stroke first, then of the tool.
    if (stroke) onPointerCancel()
    else setTool(null)
  }

  const setTool = (next: TableTool | null): void => {
    tool = next
    stroke = null
    showTarget(null)
    if (next) container.dataset.tableTool = next
    else delete container.dataset.tableTool
  }

  doc.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('pointermove', onPointerMove, true)
  doc.addEventListener('pointerup', onPointerUp, true)
  doc.addEventListener('pointercancel', onPointerCancel, true)
  doc.addEventListener('mousedown', onMouse, true)
  doc.addEventListener('click', onMouse, true)
  doc.addEventListener('dblclick', onMouse, true)
  doc.addEventListener('keydown', onKeyDown, true)

  return {
    get tool() {
      return tool
    },
    toggle(next) {
      setTool(tool === next ? null : next)
    },
    destroy() {
      setTool(null)
      doc.removeEventListener('pointerdown', onPointerDown, true)
      doc.removeEventListener('pointermove', onPointerMove, true)
      doc.removeEventListener('pointerup', onPointerUp, true)
      doc.removeEventListener('pointercancel', onPointerCancel, true)
      doc.removeEventListener('mousedown', onMouse, true)
      doc.removeEventListener('click', onMouse, true)
      doc.removeEventListener('dblclick', onMouse, true)
      doc.removeEventListener('keydown', onKeyDown, true)
      guide.remove()
    },
  }
}
