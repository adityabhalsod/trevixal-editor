import type { Command, Editor, Path } from '@trevixal/core'
import {
  type ImageHit,
  activeImage,
  removeImage,
  selectImage,
  setImageAlign,
  setImageAlt,
  setImageWidth,
  toggleImageCaption,
} from './commands'
import { boxWithin, clamp, imageElementAt } from './dom'
import type { ImageController } from './index'
import type { ImageAlign } from './schema'
import type { ImageCrop } from './transform'

export interface ImageToolbarOptions {
  /**
   * Where the toolbar and the crop overlay are appended. Must be a positioned
   * ancestor of the editor surface. Both are placed absolutely within it.
   */
  readonly container: HTMLElement
  /** Width presets offered as buttons. Defaults to 25/50/75/100%. */
  readonly sizes?: readonly string[]
}

export interface ImageToolbar {
  readonly element: HTMLElement
  /** Re-read the selection and reposition; called for you on every change. */
  refresh(): void
  destroy(): void
}

const DEFAULT_SIZES: readonly string[] = ['25%', '50%', '75%', '100%']

const ALIGNMENTS: readonly { readonly value: ImageAlign; readonly label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'none', label: 'None' },
]

/** Corner and edge grips, named by compass point. */
const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type CropHandle = (typeof CROP_HANDLES)[number]

/** The crop rectangle while it is being dragged, in px relative to the image. */
interface CropRect {
  left: number
  top: number
  width: number
  height: number
}

/** Gap between the image and the toolbar floating above it, in px. */
const GAP = 8
/** Smallest crop rectangle the pointer can produce, in px. */
const MIN_CROP = 16
/**
 * Bounds on the alt field's `size`, in characters. It is sized to the text it
 * holds so a file name, which is what an uploaded image's alt text starts as,
 * reads in full rather than being clipped at some fixed width. The floor
 * keeps an empty field from collapsing to nothing; the ceiling keeps a very
 * long name from pushing every other control off the bar. The stylesheet caps
 * the result again in pixels, which is what truncates it on a narrow screen.
 */
const ALT_MIN_CHARS = 12
const ALT_MAX_CHARS = 44

/**
 * A floating toolbar for the selected image: alignment, size presets, rotate,
 * crop, alt text, caption and delete.
 *
 * It lives outside the editor surface and never takes focus, every control
 * cancels its own `mousedown`, because the selection it acts on is the thing
 * a click would otherwise destroy. Commands are dispatched against the path
 * the toolbar resolved when it last refreshed, so they stay correct even if
 * the browser moves the caret behind our back.
 */
export function createImageToolbar(
  editor: Editor,
  controller: ImageController,
  options: ImageToolbarOptions,
): ImageToolbar {
  const container = options.container
  const doc = (editor.view?.dom ?? container).ownerDocument
  const sizes = options.sizes ?? DEFAULT_SIZES

  const root = doc.createElement('div')
  root.className = 'trevixal-image-toolbar'
  root.setAttribute('role', 'toolbar')
  root.setAttribute('aria-label', 'Image options')
  root.hidden = true
  root.addEventListener('mousedown', (event) => event.preventDefault())
  container.appendChild(root)

  let active: ImageHit | null = null
  let crop: CropSession | null = null

  const run = (make: (at: Path) => Command): void => {
    if (!active) return
    editor.exec(make(active.path))
    refresh()
  }

  const button = (label: string, name: string, onClick: () => void): HTMLButtonElement => {
    const element = doc.createElement('button')
    element.type = 'button'
    element.textContent = label
    element.dataset.trevixalItem = name
    element.addEventListener('mousedown', (event) => event.preventDefault())
    element.addEventListener('click', onClick)
    root.appendChild(element)
    return element
  }

  const alignButtons = new Map<ImageAlign, HTMLButtonElement>()
  for (const { value, label } of ALIGNMENTS) {
    alignButtons.set(
      value,
      button(label, `align-${value}`, () => run((at) => setImageAlign(value, at))),
    )
  }
  for (const size of sizes) {
    button(size, `size-${size}`, () => run((at) => setImageWidth(size, at)))
  }
  button('⟲', 'rotate-left', () => {
    if (active) void controller.rotateLeft(active.path)
  })
  button('⟳', 'rotate-right', () => {
    if (active) void controller.rotateRight(active.path)
  })
  const cropButton = button('Crop…', 'crop', () => (crop ? closeCrop() : openCrop()))

  const altInput = doc.createElement('input')
  altInput.type = 'text'
  altInput.placeholder = 'Alt text'
  altInput.setAttribute('aria-label', 'Alt text')
  altInput.dataset.trevixalItem = 'alt'
  const commitAlt = (): void => {
    if (!active || altInput.value === String(active.node.attrs.alt ?? '')) return
    run((at) => setImageAlt(altInput.value, at))
  }
  altInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commitAlt()
  })
  altInput.addEventListener('blur', commitAlt)
  altInput.addEventListener('input', () => sizeAltInput())
  root.appendChild(altInput)

  const captionButton = button('Caption', 'caption', () => run((at) => toggleImageCaption(at)))
  button('Delete', 'delete', () => run((at) => removeImage(at)))

  // ------------------------------------------------------------------ crop

  interface CropSession {
    readonly overlay: HTMLElement
    readonly actions: HTMLElement
    readonly image: HTMLElement
    readonly rect: CropRect
    readonly path: Path
    destroy(): void
  }

  const openCrop = (): void => {
    if (!active || crop) return
    const image = imageElementAt(editor, active.path)
    if (!image) return
    const frame = boxWithin(container, image)

    const overlay = doc.createElement('div')
    overlay.className = 'trevixal-image-crop'
    overlay.dataset.trevixalItem = 'crop-overlay'
    const actions = doc.createElement('div')
    actions.className = 'trevixal-image-toolbar'
    actions.addEventListener('mousedown', (event) => event.preventDefault())
    const rect: CropRect = {
      left: 0,
      top: 0,
      width: frame.width,
      height: frame.height,
    }
    const session: CropSession = {
      overlay,
      actions,
      image,
      rect,
      path: active.path,
      destroy() {
        doc.removeEventListener('pointermove', onCropMove)
        doc.removeEventListener('pointerup', onCropUp)
        overlay.remove()
        actions.remove()
      },
    }

    const place = (): void => {
      const box = boxWithin(container, image)
      overlay.style.left = `${box.left + rect.left}px`
      overlay.style.top = `${box.top + rect.top}px`
      overlay.style.width = `${rect.width}px`
      overlay.style.height = `${rect.height}px`
      actions.style.left = `${box.left}px`
      actions.style.top = `${box.top + box.height + GAP}px`
    }

    for (const handle of CROP_HANDLES) {
      const grip = doc.createElement('div')
      grip.className = 'trevixal-image-crop__handle'
      grip.dataset.trevixalHandle = handle
      grip.style.left = handle.includes('w') ? '-5px' : handle.includes('e') ? 'auto' : '50%'
      grip.style.right = handle.includes('e') ? '-5px' : 'auto'
      grip.style.top = handle.includes('n') ? '-5px' : handle.includes('s') ? 'auto' : '50%'
      grip.style.bottom = handle.includes('s') ? '-5px' : 'auto'
      grip.addEventListener('pointerdown', (event) => beginCrop(event, handle))
      overlay.appendChild(grip)
    }
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) beginCrop(event, null)
    })

    const apply = doc.createElement('button')
    apply.type = 'button'
    apply.textContent = 'Apply'
    apply.dataset.trevixalItem = 'crop-apply'
    apply.addEventListener('mousedown', (event) => event.preventDefault())
    apply.addEventListener('click', () => {
      const path = session.path
      const fractions = cropFractions(rect, boxWithin(container, image))
      closeCrop()
      void controller.transform({ crop: fractions }, path)
    })
    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    cancel.dataset.trevixalItem = 'crop-cancel'
    cancel.addEventListener('mousedown', (event) => event.preventDefault())
    cancel.addEventListener('click', () => closeCrop())
    actions.append(apply, cancel)

    container.append(overlay, actions)
    crop = session
    cropButton.setAttribute('aria-pressed', 'true')
    place()

    let drag: { handle: CropHandle | null; x: number; y: number; from: CropRect } | null = null

    function beginCrop(event: PointerEvent, handle: CropHandle | null): void {
      event.preventDefault()
      event.stopPropagation()
      drag = { handle, x: event.clientX, y: event.clientY, from: { ...rect } }
      doc.addEventListener('pointermove', onCropMove)
      doc.addEventListener('pointerup', onCropUp)
    }

    function onCropMove(event: PointerEvent): void {
      if (!drag) return
      const frameNow = boxWithin(container, session.image)
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      const next = drag.handle
        ? resizeCrop(drag.from, drag.handle, dx, dy, frameNow.width, frameNow.height)
        : moveCrop(drag.from, dx, dy, frameNow.width, frameNow.height)
      Object.assign(rect, next)
      place()
    }

    function onCropUp(): void {
      drag = null
      doc.removeEventListener('pointermove', onCropMove)
      doc.removeEventListener('pointerup', onCropUp)
    }
  }

  const closeCrop = (): void => {
    crop?.destroy()
    crop = null
    cropButton.setAttribute('aria-pressed', 'false')
  }

  // --------------------------------------------------------------- refresh

  /** Grow the alt field to the text it holds, within {@link ALT_MIN_CHARS}. */
  const sizeAltInput = (): void => {
    altInput.size = Math.round(clamp(altInput.value.length + 1, ALT_MIN_CHARS, ALT_MAX_CHARS))
  }

  /** Mark the image the toolbar is acting on, and only that one. */
  const markSelected = (element: HTMLElement | null): void => {
    const surface = editor.view?.dom
    if (!surface) return
    for (const other of surface.querySelectorAll('img[data-trevixal-selected]')) {
      if (other !== element) other.removeAttribute('data-trevixal-selected')
    }
    element?.setAttribute('data-trevixal-selected', 'true')
  }

  const refresh = (): void => {
    const hit = editor.isDestroyed ? null : activeImage(editor.state)
    active = hit
    if (!hit) {
      closeCrop()
      markSelected(null)
      root.hidden = true
      return
    }
    root.hidden = false
    const align = typeof hit.node.attrs.align === 'string' ? hit.node.attrs.align : 'none'
    for (const [value, element] of alignButtons) {
      element.setAttribute('aria-pressed', String(value === align))
    }
    captionButton.setAttribute('aria-pressed', String(hit.figurePath !== null))
    if (doc.activeElement !== altInput) altInput.value = String(hit.node.attrs.alt ?? '')
    // Before anything measures the bar: the field's width is part of it.
    sizeAltInput()

    const image = imageElementAt(editor, hit.path)
    markSelected(image)
    if (!image) return
    const box = boxWithin(container, image)
    // Aligned with the image, but never past the edge of the container: the
    // bar is as wide as its controls need, so one beside an image near the
    // right margin would otherwise hang off the side of the page.
    //
    // Only when both widths are real. A container that has not been laid out
    // measures zero, and clamping to that would pin every bar to the left.
    const room = container.getBoundingClientRect().width - root.offsetWidth
    root.style.left = `${room > 0 ? clamp(box.left, 0, room) : box.left}px`
    root.style.top = `${box.top - root.offsetHeight - GAP}px`
  }

  const offTransaction = editor.on('transaction', refresh)
  const offSelection = editor.on('selectionUpdate', refresh)
  // `selectionchange` is asynchronous, so a plain click on an image is not
  // covered by the editor's own events.
  doc.addEventListener('selectionchange', refresh)
  // Clicking an image selects it as a node: images are atoms, so there is no
  // caret to put inside one and nothing else would ever select it.
  const onSurfaceMouseDown = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target || target.tagName !== 'IMG') return
    const path = pathOfImage(editor, target)
    if (path) editor.exec(selectImage(path))
  }
  editor.view?.dom.addEventListener('mousedown', onSurfaceMouseDown)
  refresh()

  return {
    element: root,
    refresh,
    destroy() {
      closeCrop()
      markSelected(null)
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', refresh)
      editor.view?.dom.removeEventListener('mousedown', onSurfaceMouseDown)
      root.remove()
    },
  }
}

/** Child-index path of a rendered `<img>`, via core's DOM↔model mapping. */
function pathOfImage(editor: Editor, element: HTMLElement): Path | null {
  const view = editor.view
  if (!view) return null
  const path: number[] = []
  let current: HTMLElement = element
  while (current !== view.dom) {
    const parent = current.parentElement
    if (!parent) return null
    const children = [...parent.children].filter((child) => view.renderer.modelOf.get(child))
    const index = children.indexOf(current)
    if (index < 0) return null
    path.unshift(index)
    current = parent
  }
  return path
}

/** The crop rectangle as fractions of the image, which is what a crop means. */
function cropFractions(rect: CropRect, frame: { width: number; height: number }): ImageCrop {
  if (frame.width <= 0 || frame.height <= 0) return { x: 0, y: 0, width: 1, height: 1 }
  return {
    x: clamp(rect.left / frame.width, 0, 1),
    y: clamp(rect.top / frame.height, 0, 1),
    width: clamp(rect.width / frame.width, 0, 1),
    height: clamp(rect.height / frame.height, 0, 1),
  }
}

/** Slide the whole rectangle, never past the edges of the image. */
function moveCrop(from: CropRect, dx: number, dy: number, width: number, height: number): CropRect {
  return {
    left: clamp(from.left + dx, 0, Math.max(0, width - from.width)),
    top: clamp(from.top + dy, 0, Math.max(0, height - from.height)),
    width: from.width,
    height: from.height,
  }
}

/** Drag one grip: each compass point moves only the edges it names. */
function resizeCrop(
  from: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): CropRect {
  let { left, top } = from
  let right = from.left + from.width
  let bottom = from.top + from.height
  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP)
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP, width)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, height)
  return { left, top, width: right - left, height: bottom - top }
}
