import { type DrawingShape, shapeSVG } from './drawing'
import { openModal } from './modal'

/** What image markup draws: the whiteboard's arrows, boxes and words, and a blur over a region. */
export type MarkupTool = 'arrow' | 'rect' | 'text' | 'blur'

export interface MarkupShape {
  readonly kind: MarkupTool
  readonly color: string
  readonly width: number
  /** The corners of a box or a blur, and an arrow's ends; a text's corner is x1, y1. */
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly text?: string
}

/** How coarse a blurred region is drawn, as a share of its size: a mosaic nothing can be read through. */
const BLUR_BLOCKS = 12

/**
 * Draw markup onto a 2D context over an image already drawn there: arrows,
 * boxes and words in their colour, and a blur that turns its region into a
 * coarse mosaic. Coordinates are the image's own pixels.
 */
export function drawMarkup(
  context: CanvasRenderingContext2D,
  shapes: readonly MarkupShape[],
  scratch?: () => HTMLCanvasElement,
): void {
  for (const shape of shapes) {
    const left = Math.min(shape.x1, shape.x2)
    const top = Math.min(shape.y1, shape.y2)
    const width = Math.abs(shape.x2 - shape.x1)
    const height = Math.abs(shape.y2 - shape.y1)
    context.save()
    context.strokeStyle = shape.color
    context.fillStyle = shape.color
    context.lineWidth = shape.width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (shape.kind === 'blur' && width >= 1 && height >= 1) {
      // A mosaic: the region drawn tiny and back up with no smoothing.
      const small = scratch?.()
      if (small) {
        const across = Math.max(1, Math.round(width / BLUR_BLOCKS))
        const down = Math.max(1, Math.round(height / BLUR_BLOCKS))
        small.width = across
        small.height = down
        small
          .getContext('2d')
          ?.drawImage(context.canvas, left, top, width, height, 0, 0, across, down)
        context.imageSmoothingEnabled = false
        context.drawImage(small, 0, 0, across, down, left, top, width, height)
      } else {
        context.fillRect(left, top, width, height)
      }
    } else if (shape.kind === 'rect') {
      context.strokeRect(left, top, width, height)
    } else if (shape.kind === 'arrow') {
      const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1)
      const head = Math.max(10, shape.width * 4)
      context.beginPath()
      context.moveTo(shape.x1, shape.y1)
      context.lineTo(shape.x2, shape.y2)
      context.stroke()
      context.beginPath()
      context.moveTo(shape.x2, shape.y2)
      context.lineTo(
        shape.x2 - head * Math.cos(angle - Math.PI / 7),
        shape.y2 - head * Math.sin(angle - Math.PI / 7),
      )
      context.lineTo(
        shape.x2 - head * Math.cos(angle + Math.PI / 7),
        shape.y2 - head * Math.sin(angle + Math.PI / 7),
      )
      context.closePath()
      context.fill()
    } else if (shape.kind === 'text' && shape.text) {
      context.font = `600 ${Math.max(14, shape.width * 6)}px system-ui, sans-serif`
      context.textBaseline = 'top'
      context.fillText(shape.text, shape.x1, shape.y1)
    }
    context.restore()
  }
}

/** The image with its markup burned in, as a PNG. */
export async function renderMarkup(image: Blob, shapes: readonly MarkupShape[]): Promise<Blob> {
  const bitmap = await createImageBitmap(image)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw on an image')
  context.drawImage(bitmap, 0, 0)
  drawMarkup(context, shapes, () => document.createElement('canvas'))
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The marked-up image could not be saved')
  return blob
}

const TOOL_LABELS: Readonly<Record<MarkupTool, string>> = {
  arrow: 'Arrow',
  rect: 'Box',
  text: 'Text',
  blur: 'Blur',
}

const MARKUP_COLORS: readonly string[] = [
  '#dc2626',
  '#f59e0b',
  '#16a34a',
  '#2563eb',
  '#111827',
  '#ffffff',
]

/** A markup shape as the whiteboard's shape, to preview it; a blur previews as a hatched box. */
function previewSVG(shape: MarkupShape, scale: number): string {
  if (shape.kind === 'blur') {
    const left = Math.min(shape.x1, shape.x2) / scale
    const top = Math.min(shape.y1, shape.y2) / scale
    const width = Math.abs(shape.x2 - shape.x1) / scale
    const height = Math.abs(shape.y2 - shape.y1) / scale
    return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgba(128,128,128,0.55)" stroke="#fff" stroke-dasharray="4 3"/>`
  }
  const scaled: DrawingShape = {
    kind: shape.kind,
    color: shape.color,
    width: shape.width / scale,
    x1: shape.x1 / scale,
    y1: shape.y1 / scale,
    x2: shape.x2 / scale,
    y2: shape.y2 / scale,
    text: shape.text,
  }
  return shapeSVG(scaled)
}

/**
 * The markup editor: the image, and arrows, boxes, words and blurs to draw
 * over it. Undo takes back the last one. Apply resolves with the shapes, in
 * the image's own pixels, for {@link renderMarkup} to burn in; Cancel with
 * null.
 */
export function openImageMarkup(
  document: Document,
  src: string,
  natural: { width: number; height: number },
): Promise<MarkupShape[] | null> {
  return new Promise((resolve) => {
    const shapes: MarkupShape[] = []
    let tool: MarkupTool = 'arrow'
    let color = MARKUP_COLORS[0] as string
    let settled = false
    const finish = (value: MarkupShape[] | null): void => {
      if (settled) return
      settled = true
      modal.close()
      resolve(value)
    }
    const modal = openModal(document, 'Mark up image', () => finish(null))
    modal.dialog.classList.add('trevixal-markup')
    const bar = document.createElement('div')
    bar.className = 'trevixal-drawing-editor__tools'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'Markup tools')
    const toolButtons = new Map<MarkupTool, HTMLButtonElement>()
    for (const name of ['arrow', 'rect', 'text', 'blur'] as const) {
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
    for (const swatch of MARKUP_COLORS) {
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
    const words = document.createElement('input')
    words.type = 'text'
    words.className = 'trevixal-drawing-editor__words'
    words.placeholder = 'Text to place'
    words.setAttribute('aria-label', 'Text to place')
    const undo = document.createElement('button')
    undo.type = 'button'
    undo.className = 'trevixal-drawing-editor__tool'
    undo.textContent = 'Undo'
    bar.append(words, undo)

    const stage = document.createElement('div')
    stage.className = 'trevixal-markup__stage'
    const picture = document.createElement('img')
    picture.src = src
    picture.alt = ''
    picture.draggable = false
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    overlay.setAttribute('class', 'trevixal-markup__overlay')
    stage.append(picture, overlay)
    modal.body.append(bar, stage)

    /** Image pixels per on-screen pixel, as the picture is shown now. */
    const scale = (): number => natural.width / Math.max(1, picture.getBoundingClientRect().width)
    const redraw = (preview?: MarkupShape): void => {
      const box = picture.getBoundingClientRect()
      overlay.setAttribute('viewBox', `0 0 ${Math.max(1, box.width)} ${Math.max(1, box.height)}`)
      const factor = scale()
      overlay.innerHTML = [...shapes, ...(preview ? [preview] : [])]
        .map((shape) => previewSVG(shape, factor))
        .join('')
    }
    picture.addEventListener('load', () => redraw())
    undo.addEventListener('click', () => {
      shapes.pop()
      redraw()
    })
    const at = (event: PointerEvent): [number, number] => {
      const box = picture.getBoundingClientRect()
      const factor = scale()
      return [
        Math.round((event.clientX - box.left) * factor),
        Math.round((event.clientY - box.top) * factor),
      ]
    }
    let drawing: MarkupShape | null = null
    stage.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      const [x, y] = at(event)
      const width = Math.max(3, Math.round(3 * scale()))
      if (tool === 'text') {
        const text = words.value.trim()
        if (!text) {
          words.focus()
          return
        }
        shapes.push({ kind: 'text', color, width, x1: x, y1: y, x2: x, y2: y, text })
        redraw()
        return
      }
      drawing = { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y }
      stage.setPointerCapture?.(event.pointerId)
    })
    stage.addEventListener('pointermove', (event) => {
      if (!drawing) return
      const [x, y] = at(event)
      drawing = { ...drawing, x2: x, y2: y }
      redraw(drawing)
    })
    const commit = (): void => {
      if (!drawing) return
      if (Math.abs(drawing.x2 - drawing.x1) + Math.abs(drawing.y2 - drawing.y1) > 3) {
        shapes.push(drawing)
      }
      drawing = null
      redraw()
    }
    stage.addEventListener('pointerup', commit)
    stage.addEventListener('pointercancel', commit)

    const cancel = modal.button('Cancel')
    const apply = modal.button('Apply', true)
    cancel.addEventListener('click', () => finish(null))
    apply.addEventListener('click', () => finish(shapes.length > 0 ? [...shapes] : null))
    toolButtons.get('arrow')?.focus()
  })
}
