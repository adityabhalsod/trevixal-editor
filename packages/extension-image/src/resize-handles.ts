import type { Editor, Path } from '@trevixal/core'
import { activeImage, updateImage } from './commands'
import { boxWithin, clamp, contentWidthOf, imageElementAt, setInlineStyle } from './dom'

export interface ImageResizeHandlesOptions {
  /**
   * Where the handles are appended. Must be a positioned ancestor of the
   * editor surface. They are placed absolutely within it, and its content
   * box is also the widest an image may be dragged.
   */
  readonly container: HTMLElement
  /** Narrowest an image may be dragged, in px. Defaults to 40. */
  readonly minWidth?: number
  /** Live size during a drag, for a size readout. */
  readonly onResize?: (size: { width: number; height: number }) => void
}

export interface ImageResizeHandles {
  /** Re-read the selection and reposition; called for you on every change. */
  refresh(): void
  destroy(): void
}

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const
type Corner = (typeof CORNERS)[number]

/** Half a handle, so it straddles the corner rather than hanging off it. */
const OFFSET = 5
/** Travel below this is a click on the handle, not a resize. */
const DEAD_ZONE = 2

interface Drag {
  readonly corner: Corner
  readonly path: Path
  readonly image: HTMLElement
  /** Inline style before the drag, restored before anything is committed. */
  readonly style: string | null
  readonly startX: number
  readonly startY: number
  readonly width: number
  readonly height: number
  readonly aspect: number
  readonly cap: number
  size: { width: number; height: number }
}

/**
 * Corner handles that scale the selected image.
 *
 * The drag previews through an inline style on the `<img>` and nothing enters
 * the document until the pointer is released, so a resize is one history entry
 * rather than one per pixel. Aspect ratio is kept by default, a distorted
 * photo is almost never what was meant, with Shift for the rare case where
 * it is.
 */
export function createImageResizeHandles(
  editor: Editor,
  options: ImageResizeHandlesOptions,
): ImageResizeHandles {
  const container = options.container
  const doc = (editor.view?.dom ?? container).ownerDocument
  const minWidth = options.minWidth ?? 40

  const handles = new Map<Corner, HTMLElement>()
  for (const corner of CORNERS) {
    const element = doc.createElement('div')
    element.className = 'trevixal-image-handles__handle'
    element.dataset.trevixalHandle = corner
    element.setAttribute('aria-hidden', 'true')
    element.style.cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
    element.hidden = true
    // Never let grabbing a handle move the caret or start a text selection.
    element.addEventListener('mousedown', (event) => event.preventDefault())
    element.addEventListener('pointerdown', (event) => begin(event, corner))
    container.appendChild(element)
    handles.set(corner, element)
  }

  let drag: Drag | null = null

  const hide = (): void => {
    for (const element of handles.values()) element.hidden = true
  }

  const refresh = (): void => {
    if (drag) return // mid-drag the handles stay with the image being dragged
    const hit = editor.isDestroyed ? null : activeImage(editor.state)
    const image = hit ? imageElementAt(editor, hit.path) : null
    if (!hit || !image) {
      hide()
      return
    }
    const box = boxWithin(container, image)
    for (const [corner, element] of handles) {
      element.hidden = false
      const left = corner.includes('w') ? box.left : box.left + box.width
      const top = corner.includes('n') ? box.top : box.top + box.height
      element.style.left = `${left - OFFSET}px`
      element.style.top = `${top - OFFSET}px`
    }
  }

  function begin(event: PointerEvent, corner: Corner): void {
    if (drag) return
    const hit = activeImage(editor.state)
    const image = hit ? imageElementAt(editor, hit.path) : null
    if (!hit || !image) return
    const box = image.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    event.preventDefault()
    drag = {
      corner,
      path: hit.path,
      image,
      style: image.getAttribute('style'),
      startX: event.clientX,
      startY: event.clientY,
      width: box.width,
      height: box.height,
      aspect: box.width / box.height,
      cap: contentWidthOf(container),
      size: { width: Math.round(box.width), height: Math.round(box.height) },
    }
    doc.addEventListener('pointermove', onMove)
    doc.addEventListener('pointerup', onUp)
    doc.addEventListener('pointercancel', onCancel)
  }

  const onMove = (event: PointerEvent): void => {
    const current = drag
    if (!current) return
    // A west/north corner grows as the pointer moves the *other* way.
    const signX = current.corner.includes('e') ? 1 : -1
    const signY = current.corner.includes('s') ? 1 : -1
    const dx = (event.clientX - current.startX) * signX
    const dy = (event.clientY - current.startY) * signY
    const width = clamp(current.width + dx, minWidth, current.cap)
    const height = event.shiftKey ? Math.max(minWidth, current.height + dy) : width / current.aspect
    current.size = { width: Math.round(width), height: Math.round(height) }
    current.image.style.width = `${current.size.width}px`
    current.image.style.height = `${current.size.height}px`
    options.onResize?.(current.size)
  }

  const finish = (): Drag | null => {
    const current = drag
    drag = null
    doc.removeEventListener('pointermove', onMove)
    doc.removeEventListener('pointerup', onUp)
    doc.removeEventListener('pointercancel', onCancel)
    if (current) setInlineStyle(current.image, current.style)
    return current
  }

  const onUp = (): void => {
    const current = finish()
    if (!current) return
    const moved =
      Math.abs(current.size.width - current.width) >= DEAD_ZONE ||
      Math.abs(current.size.height - current.height) >= DEAD_ZONE
    if (moved) {
      editor.exec(
        updateImage(
          { width: `${current.size.width}px`, height: `${current.size.height}px` },
          current.path,
        ),
      )
    }
    refresh()
  }

  const onCancel = (): void => {
    finish()
    refresh()
  }

  const offTransaction = editor.on('transaction', refresh)
  const offSelection = editor.on('selectionUpdate', refresh)
  doc.addEventListener('selectionchange', refresh)
  refresh()

  return {
    refresh,
    destroy() {
      finish()
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', refresh)
      for (const element of handles.values()) element.remove()
    },
  }
}
