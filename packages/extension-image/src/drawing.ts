import {
  type Command,
  type Editor,
  type EditorState,
  NodeSelection,
  type NodeSpec,
  type Path,
  SetNodeAttrsStep,
  escapeHTML,
  insertBlockAfter,
  nodeAtPath,
  pathOfElement,
  safeColor,
} from '@trevixal/core'
import { openModal } from './modal'

/** What a drawing is made of: freehand strokes, and a whiteboard's shapes, lines and words. */
export type DrawingTool = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'

export interface DrawingShape {
  readonly kind: DrawingTool
  readonly color: string
  /** Stroke width, in the drawing's units. */
  readonly width: number
  /** A pen stroke's points. */
  readonly points?: readonly (readonly [number, number])[]
  /** Where a line, arrow, box or ellipse starts and ends; a text's corner is x1, y1. */
  readonly x1?: number
  readonly y1?: number
  readonly x2?: number
  readonly y2?: number
  readonly text?: string
}

export interface DrawingData {
  readonly width: number
  readonly height: number
  readonly shapes: readonly DrawingShape[]
}

/** A new drawing's size: wide and short, as a page is. */
export const DRAWING_SIZE = { width: 640, height: 360 } as const

const KINDS: readonly DrawingTool[] = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'text']
const MAX_SHAPES = 2000
const MAX_POINTS = 5000

/** A coordinate the drawing keeps: a finite number to one decimal, inside a generous bound. */
function coordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 100_000
    ? Math.round(value * 10) / 10
    : null
}

/**
 * A drawing read back from its stored form, every value checked: known
 * shape kinds, safe colours, finite numbers, and no more shapes or points
 * than a drawing could sensibly hold. Null for anything that is not one.
 */
export function parseDrawing(value: unknown): DrawingData | null {
  let data: unknown = value
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const raw = data as { width?: unknown; height?: unknown; shapes?: unknown }
  const width = coordinate(raw.width)
  const height = coordinate(raw.height)
  if (!width || !height || width <= 0 || height <= 0 || !Array.isArray(raw.shapes)) return null
  const shapes: DrawingShape[] = []
  for (const entry of raw.shapes.slice(0, MAX_SHAPES)) {
    if (!entry || typeof entry !== 'object') continue
    const shape = entry as Record<string, unknown>
    const kind = shape.kind as DrawingTool
    const color = safeColor(shape.color)
    const strokeWidth = coordinate(shape.width)
    if (!KINDS.includes(kind) || !color || !strokeWidth || strokeWidth <= 0) continue
    if (kind === 'pen') {
      const points = Array.isArray(shape.points)
        ? shape.points
            .slice(0, MAX_POINTS)
            .map((point) =>
              Array.isArray(point) ? [coordinate(point[0]), coordinate(point[1])] : [null, null],
            )
            .filter((point): point is [number, number] => point[0] !== null && point[1] !== null)
        : []
      if (points.length > 0) shapes.push({ kind, color, width: strokeWidth, points })
      continue
    }
    const [x1, y1, x2, y2] = [shape.x1, shape.y1, shape.x2, shape.y2].map(coordinate)
    if (x1 === null || y1 === null) continue
    if (kind === 'text') {
      const text = typeof shape.text === 'string' ? shape.text.slice(0, 500) : ''
      if (text) shapes.push({ kind, color, width: strokeWidth, x1, y1, text })
      continue
    }
    if (x2 === null || y2 === null) continue
    shapes.push({ kind, color, width: strokeWidth, x1, y1, x2, y2 })
  }
  return { width, height, shapes }
}

/** A pen stroke as a smooth path: straight between the first two points, curved through the rest. */
function strokePath(points: readonly (readonly [number, number])[]): string {
  const [first] = points
  if (!first) return ''
  if (points.length === 1) return `M${first[0]} ${first[1]}l0.1 0`
  let d = `M${first[0]} ${first[1]}`
  for (let index = 1; index < points.length - 1; index++) {
    const [x, y] = points[index] as [number, number]
    const [nx, ny] = points[index + 1] as [number, number]
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
  }
  const last = points[points.length - 1] as [number, number]
  return `${d}L${last[0]} ${last[1]}`
}

/** The head of an arrow from (x1, y1) to (x2, y2), as a filled triangle's points. */
function arrowHead(x1: number, y1: number, x2: number, y2: number, width: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = Math.max(8, width * 4)
  const left = [
    x2 - size * Math.cos(angle - Math.PI / 7),
    y2 - size * Math.sin(angle - Math.PI / 7),
  ]
  const right = [
    x2 - size * Math.cos(angle + Math.PI / 7),
    y2 - size * Math.sin(angle + Math.PI / 7),
  ]
  const round = (value: number): number => Math.round(value * 10) / 10
  return `${x2},${y2} ${round(left[0] as number)},${round(left[1] as number)} ${round(right[0] as number)},${round(right[1] as number)}`
}

/** One shape as SVG markup, `index` marking it for the eraser. */
export function shapeSVG(shape: DrawingShape, index?: number): string {
  const mark = index === undefined ? '' : ` data-shape="${index}"`
  const stroke = `stroke="${escapeHTML(shape.color)}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"`
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = shape
  switch (shape.kind) {
    case 'pen':
      return `<path${mark} d="${strokePath(shape.points ?? [])}" fill="none" ${stroke}/>`
    case 'line':
      return `<line${mark} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${stroke}/>`
    case 'arrow':
      return (
        `<g${mark}><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${stroke}/>` +
        `<polygon points="${arrowHead(x1, y1, x2, y2, shape.width)}" fill="${escapeHTML(shape.color)}"/></g>`
      )
    case 'rect':
      return `<rect${mark} x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" rx="4" fill="none" ${stroke}/>`
    case 'ellipse':
      return `<ellipse${mark} cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${Math.abs(x2 - x1) / 2}" ry="${Math.abs(y2 - y1) / 2}" fill="none" ${stroke}/>`
    case 'text':
      return `<text${mark} x="${x1}" y="${y1}" fill="${escapeHTML(shape.color)}" font-size="${Math.max(12, shape.width * 6)}" font-family="system-ui, sans-serif">${escapeHTML(shape.text ?? '')}</text>`
  }
}

/** A drawing as a standalone SVG document's markup. */
export function drawingSVG(data: DrawingData, marked = false): string {
  const shapes = data.shapes.map((shape, index) => shapeSVG(shape, marked ? index : undefined))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.width} ${data.height}" width="${data.width}" height="${data.height}" role="img" aria-label="Drawing">${shapes.join('')}</svg>`
}

/** The drawing node, a block that draws itself as SVG and keeps its shapes to be edited again. */
export function drawingNodes(): Record<string, NodeSpec> {
  return {
    drawing: {
      group: 'block',
      atom: true,
      attrs: { data: { default: null } },
      toHTML: (node) => {
        const data = parseDrawing(node.attrs.data) ?? { ...DRAWING_SIZE, shapes: [] }
        return {
          tag: 'div',
          attrs: { class: 'trevixal-drawing', 'data-drawing': JSON.stringify(data) },
          innerHTML: drawingSVG(data),
        }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-drawing',
          getAttrs: (element) => {
            const data = parseDrawing(element.getAttribute('data-drawing'))
            return data ? { data: JSON.stringify(data) } : false
          },
        },
      ],
    },
  }
}

/** Insert a drawing after the current block; an empty one when no data is given. */
export function insertDrawing(data: DrawingData = { ...DRAWING_SIZE, shapes: [] }): Command {
  return insertBlockAfter('drawing', { data: JSON.stringify(data) })
}

/** The drawing at `path` given new shapes. */
export function updateDrawing(path: Path, data: DrawingData): Command {
  return (state) => {
    const node = nodeAtPath(state.doc, path)
    if (node?.type.name !== 'drawing') return null
    return state.tr.step(new SetNodeAttrsStep(path, { ...node.attrs, data: JSON.stringify(data) }))
  }
}

/** The selected drawing, with its path and shapes. */
export function drawingAt(state: EditorState): { path: Path; data: DrawingData } | null {
  const selection = state.selection
  if (!(selection instanceof NodeSelection)) return null
  const node = nodeAtPath(state.doc, selection.path)
  if (node?.type.name !== 'drawing') return null
  return {
    path: selection.path,
    data: parseDrawing(node.attrs.data) ?? { ...DRAWING_SIZE, shapes: [] },
  }
}

/**
 * Open a drawing to edit on a double click on it. `edit` gets its path and
 * shapes and is the host's to open the editor with. Returns a disposer.
 */
export function enableDrawingEditing(
  editor: Editor,
  edit: (path: Path, data: DrawingData) => void,
): () => void {
  const view = editor.view
  if (!view) return () => {}
  const onDoubleClick = (event: MouseEvent): void => {
    const element = (event.target as Element | null)?.closest?.('.trevixal-drawing')
    if (!(element instanceof HTMLElement) || !view.dom.contains(element)) return
    const path = pathOfElement(view.dom, view.renderer, element)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    if (!path || node?.type.name !== 'drawing') return
    event.preventDefault()
    edit(path, parseDrawing(node.attrs.data) ?? { ...DRAWING_SIZE, shapes: [] })
  }
  view.dom.addEventListener('dblclick', onDoubleClick)
  return () => view.dom.removeEventListener('dblclick', onDoubleClick)
}

/** The colours the drawing tools offer, readable on a light page and a dark one. */
export const DRAWING_COLORS: readonly string[] = [
  '#1f2937',
  '#dc2626',
  '#ea580c',
  '#16a34a',
  '#2563eb',
  '#9333ea',
]

const TOOL_LABELS: Readonly<Record<DrawingTool | 'eraser', string>> = {
  pen: 'Pen',
  line: 'Line',
  arrow: 'Arrow',
  rect: 'Box',
  ellipse: 'Ellipse',
  text: 'Text',
  eraser: 'Eraser',
}

/**
 * The drawing editor: a board to draw on with a pen or stylus, and a
 * whiteboard's tools, lines, arrows to join things up, boxes, ellipses and
 * words. The eraser takes out what it is clicked on; Undo takes back the
 * last thing drawn. A stylus draws thicker as it presses harder. Resolves
 * with the drawing on Save, or null on Cancel.
 */
export function openDrawingEditor(
  document: Document,
  initial: DrawingData = { ...DRAWING_SIZE, shapes: [] },
): Promise<DrawingData | null> {
  return new Promise((resolve) => {
    const shapes: DrawingShape[] = [...initial.shapes]
    const { width, height } = initial
    let tool: DrawingTool | 'eraser' = 'pen'
    let color = DRAWING_COLORS[0] as string
    let strokeWidth = 3
    let settled = false
    const finish = (value: DrawingData | null): void => {
      if (settled) return
      settled = true
      modal.close()
      resolve(value)
    }
    const modal = openModal(document, 'Drawing', () => finish(null))
    modal.dialog.classList.add('trevixal-drawing-editor')
    const bar = document.createElement('div')
    bar.className = 'trevixal-drawing-editor__tools'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'Drawing tools')
    const toolButtons = new Map<string, HTMLButtonElement>()
    for (const name of [...KINDS, 'eraser'] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-drawing-editor__tool'
      button.textContent = TOOL_LABELS[name]
      button.setAttribute('aria-pressed', String(name === tool))
      button.addEventListener('click', () => {
        tool = name
        for (const [other, element] of toolButtons) {
          element.setAttribute('aria-pressed', String(other === name))
        }
      })
      toolButtons.set(name, button)
      bar.appendChild(button)
    }
    for (const swatch of DRAWING_COLORS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-drawing-editor__swatch'
      button.style.background = swatch
      button.setAttribute('aria-label', `Colour ${swatch}`)
      button.setAttribute('aria-pressed', String(swatch === color))
      button.addEventListener('click', () => {
        color = swatch
        for (const element of bar.querySelectorAll('.trevixal-drawing-editor__swatch')) {
          element.setAttribute('aria-pressed', String(element === button))
        }
      })
      bar.appendChild(button)
    }
    const size = document.createElement('select')
    size.className = 'trevixal-drawing-editor__size'
    size.setAttribute('aria-label', 'Line width')
    for (const value of [2, 3, 5, 8]) {
      const option = document.createElement('option')
      option.value = String(value)
      option.textContent = `${value} px`
      option.selected = value === strokeWidth
      size.appendChild(option)
    }
    size.addEventListener('change', () => {
      strokeWidth = Number(size.value)
    })
    const words = document.createElement('input')
    words.type = 'text'
    words.className = 'trevixal-drawing-editor__words'
    words.placeholder = 'Text to place'
    words.setAttribute('aria-label', 'Text to place')
    const undo = document.createElement('button')
    undo.type = 'button'
    undo.className = 'trevixal-drawing-editor__tool'
    undo.textContent = 'Undo'
    const clear = document.createElement('button')
    clear.type = 'button'
    clear.className = 'trevixal-drawing-editor__tool'
    clear.textContent = 'Clear'
    bar.append(size, words, undo, clear)

    const board = document.createElement('div')
    board.className = 'trevixal-drawing-editor__board'
    board.setAttribute('role', 'img')
    board.setAttribute('aria-label', 'Drawing board')
    board.style.aspectRatio = `${width} / ${height}`
    const redraw = (preview?: DrawingShape): void => {
      const all = preview ? [...shapes, preview] : shapes
      board.innerHTML = drawingSVG({ width, height, shapes: all }, true)
    }
    redraw()
    modal.body.append(bar, board)
    undo.addEventListener('click', () => {
      shapes.pop()
      redraw()
    })
    clear.addEventListener('click', () => {
      shapes.length = 0
      redraw()
    })

    /** A pointer's position in the drawing's own units. */
    const at = (event: PointerEvent): [number, number] => {
      const box = board.getBoundingClientRect()
      const x = ((event.clientX - box.left) / Math.max(1, box.width)) * width
      const y = ((event.clientY - box.top) / Math.max(1, box.height)) * height
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
    }
    let drawing: DrawingShape | null = null
    board.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      const [x, y] = at(event)
      if (tool === 'eraser') {
        const index = (event.target as Element)
          .closest?.('[data-shape]')
          ?.getAttribute('data-shape')
        if (index !== null && index !== undefined) {
          shapes.splice(Number(index), 1)
          redraw()
        }
        return
      }
      if (tool === 'text') {
        const text = words.value.trim()
        if (!text) {
          words.focus()
          return
        }
        shapes.push({ kind: 'text', color, width: strokeWidth, x1: x, y1: y, text })
        redraw()
        return
      }
      // A stylus draws thicker as it presses harder; a mouse reports half pressure.
      const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure * 2 : 1
      const lineWidth = Math.round(strokeWidth * pressure * 10) / 10
      drawing =
        tool === 'pen'
          ? { kind: 'pen', color, width: lineWidth, points: [[x, y]] }
          : { kind: tool, color, width: lineWidth, x1: x, y1: y, x2: x, y2: y }
      board.setPointerCapture?.(event.pointerId)
      redraw(drawing)
    })
    board.addEventListener('pointermove', (event) => {
      if (!drawing) return
      const [x, y] = at(event)
      drawing =
        drawing.kind === 'pen'
          ? { ...drawing, points: [...(drawing.points ?? []), [x, y]] }
          : { ...drawing, x2: x, y2: y }
      redraw(drawing)
    })
    const commit = (): void => {
      if (!drawing) return
      const moved =
        drawing.kind === 'pen' ||
        Math.abs((drawing.x2 ?? 0) - (drawing.x1 ?? 0)) +
          Math.abs((drawing.y2 ?? 0) - (drawing.y1 ?? 0)) >
          2
      if (moved) shapes.push(drawing)
      drawing = null
      redraw()
    }
    board.addEventListener('pointerup', commit)
    board.addEventListener('pointercancel', commit)

    const cancel = modal.button('Cancel')
    const save = modal.button('Save', true)
    cancel.addEventListener('click', () => finish(null))
    save.addEventListener('click', () => finish({ width, height, shapes: [...shapes] }))
    toolButtons.get('pen')?.focus()
  })
}

/** A drawing as an SVG file, to download or share on its own. */
export function drawingFile(data: DrawingData, name = 'drawing.svg'): File {
  return new File([drawingSVG(data)], name, { type: 'image/svg+xml' })
}
