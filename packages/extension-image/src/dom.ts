import type { Editor, Path } from '@trevixal/core'

/**
 * The rendered element for a model path, the inverse of core's
 * `pathOfElement`, which only goes the other way. Floating chrome needs it to
 * measure the image it is decorating.
 *
 * Children are filtered by the renderer's model map exactly as
 * `pathOfElement` filters them, so placeholders and widget decorations do not
 * shift the indices.
 */
export function elementAtPath(editor: Editor, path: Path): HTMLElement | null {
  const view = editor.view
  if (!view) return null
  let element: HTMLElement = view.dom
  for (const index of path) {
    const content = view.renderer.contentElementOf(element)
    const children = [...content.children].filter((child) => view.renderer.modelOf.get(child))
    const next = children[index] as HTMLElement | undefined
    if (!next) return null
    element = next
  }
  return element
}

/** The `<img>` rendering a model path, when it is on screen. */
export function imageElementAt(editor: Editor, path: Path): HTMLElement | null {
  const element = elementAtPath(editor, path)
  return element?.tagName === 'IMG' ? element : null
}

/**
 * A box in the container's coordinate space. Everything floating is
 * positioned from viewport-rect deltas rather than page offsets, so it tracks
 * scrolling and reflow without measuring anything itself.
 */
export interface RelativeBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Where `element` sits inside `container`, both measured right now. */
export function boxWithin(container: HTMLElement, element: HTMLElement): RelativeBox {
  const box = element.getBoundingClientRect()
  const host = container.getBoundingClientRect()
  return {
    left: box.left - host.left,
    top: box.top - host.top,
    width: box.width,
    height: box.height,
  }
}

/**
 * The widest an image may be drawn: the container's content box. Infinite
 * when nothing has been laid out, so an unmeasured document never clamps a
 * resize to zero.
 */
export function contentWidthOf(container: HTMLElement): number {
  const view = container.ownerDocument.defaultView
  const box = container.getBoundingClientRect()
  const style = view?.getComputedStyle(container)
  const padding =
    (Number.parseFloat(style?.paddingLeft ?? '') || 0) +
    (Number.parseFloat(style?.paddingRight ?? '') || 0)
  const width = box.width - padding
  return width > 0 ? width : Number.POSITIVE_INFINITY
}

/** Put an inline style back exactly as it was, attribute and all. */
export function setInlineStyle(element: HTMLElement, style: string | null): void {
  if (style === null) element.removeAttribute('style')
  else element.setAttribute('style', style)
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
