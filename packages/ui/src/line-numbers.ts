import type { Editor } from '@trevixal/core'

/**
 * Word's Line Numbers: a number in the margin beside every line of body text,
 * for drafts that are discussed line by line (a contract, a manuscript). It is
 * a document setting, the doc node's `lineNumbers`; this module draws it.
 *
 * The lines are the ones the browser laid out, read from each paragraph's
 * line boxes, so a sentence that wraps takes a number per line, as in Word.
 * Tables, notes and the generated lists are not counted, as Word leaves them
 * out too, and numbering runs on through the document without restarting.
 */

/** The blocks whose lines are counted. A list item's lines are its paragraphs'. */
const COUNTED = 'p, h1, h2, h3, h4, h5, h6, pre, figcaption, summary'

/** Where lines are not counted. */
const SKIPPED =
  'td, th, .trevixal-footnotes, .trevixal-endnotes, .trevixal-caption-list, .trevixal-index'

/** Gap between a number and the text it counts, in px. */
const GAP = 12

export interface MeasuredLine {
  /** Viewport coordinates, as `getBoundingClientRect` gives them. */
  readonly top: number
  readonly height: number
}

/**
 * Every line of body text under `root`, top to bottom. Line boxes are read
 * from a range over each block: the browser reports a rectangle per run of
 * text per line, and rectangles that overlap vertically are one line.
 */
export function measureLines(root: HTMLElement): MeasuredLine[] {
  const lines: MeasuredLine[] = []
  for (const block of root.querySelectorAll<HTMLElement>(COUNTED)) {
    if (block.closest(SKIPPED)) continue
    // A counted block inside another (a paragraph in a summary) is its parent's.
    if (block.parentElement?.closest(COUNTED)) continue
    const range = block.ownerDocument.createRange()
    range.selectNodeContents(block)
    const rects = [...range.getClientRects()]
      .filter((rect) => rect.height > 0)
      .sort((a, b) => a.top - b.top)
    if (rects.length === 0) {
      // An empty paragraph is still a line on the page.
      const box = block.getBoundingClientRect()
      if (box.height > 0) lines.push({ top: box.top, height: box.height })
      continue
    }
    let top = Number.NEGATIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (const rect of rects) {
      if (rect.top < bottom - 2) {
        bottom = Math.max(bottom, rect.bottom)
        continue
      }
      if (Number.isFinite(top)) lines.push({ top, height: bottom - top })
      top = rect.top
      bottom = rect.bottom
    }
    if (Number.isFinite(top)) lines.push({ top, height: bottom - top })
  }
  return lines
}

/** One number, placed against the text it counts: left of it, or right of right-to-left text. */
function numberElement(
  document: Document,
  n: number,
  line: MeasuredLine,
  position: { top: number; edge: number; rtl: boolean },
): HTMLElement {
  const element = document.createElement('span')
  element.className = 'trevixal-line-number'
  element.setAttribute('aria-hidden', 'true')
  element.textContent = String(n)
  element.style.top = `${position.top}px`
  element.style.height = `${line.height}px`
  element.style.lineHeight = `${line.height}px`
  if (position.rtl) element.style.left = `${position.edge + GAP}px`
  else element.style.left = `${position.edge - GAP}px`
  if (!position.rtl) element.style.transform = 'translateX(-100%)'
  return element
}

/** The edge text starts from inside `surface`, as a viewport x coordinate. */
function textEdge(surface: HTMLElement, rtl: boolean): number {
  const box = surface.getBoundingClientRect()
  const style = surface.ownerDocument.defaultView?.getComputedStyle(surface)
  const padding = (side: 'Left' | 'Right'): number =>
    Number.parseFloat(style?.[`padding${side}`] ?? '0') || 0
  return rtl ? box.right - padding('Right') : box.left + padding('Left')
}

function isRightToLeft(element: HTMLElement): boolean {
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === 'rtl'
}

/** The first character of a laid-out line: its text node, where in it, and its box. */
interface LineStart {
  readonly node: Text
  readonly offset: number
  readonly box: DOMRect
}

/**
 * Where each laid-out line of `block` starts. Each character's box says which
 * line it is on, and a character is on a new line once its top clears the
 * bottom of the line before; a binary search per text node finds each one
 * without measuring every character.
 */
function lineStartsIn(block: HTMLElement): LineStart[] {
  const document = block.ownerDocument
  const range = document.createRange()
  const boxOf = (node: Text, offset: number): DOMRect | null => {
    range.setStart(node, offset)
    range.setEnd(node, offset + 1)
    const box = range.getClientRects()[0]
    return box && box.height > 0 ? box : null
  }
  const starts: LineStart[] = []
  let bottom = Number.NEGATIVE_INFINITY
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  for (let found = walker.nextNode(); found; found = walker.nextNode()) {
    const node = found as Text
    const isBelow = (offset: number): boolean => {
      const box = boxOf(node, offset)
      return box !== null && box.top >= bottom - 2
    }
    let from = 0
    while (from < node.data.length) {
      let low = from
      let high = node.data.length
      while (low < high) {
        const middle = (low + high) >> 1
        if (isBelow(middle)) high = middle
        else low = middle + 1
      }
      const box = low < node.data.length ? boxOf(node, low) : null
      if (!box) break
      starts.push({ node, offset: low, box })
      bottom = box.bottom
      from = low + 1
    }
  }
  return starts
}

/** The first text node under `block` with a character in it. */
function firstText(block: HTMLElement): Text | null {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  for (let found = walker.nextNode(); found; found = walker.nextNode()) {
    if ((found as Text).data.length > 0) return found as Text
  }
  return null
}

/** How many UTF-16 units the character at `offset` takes: two for a surrogate pair. */
function characterLength(text: string, offset: number): number {
  const code = text.charCodeAt(offset)
  return code >= 0xd800 && code <= 0xdbff && offset + 1 < text.length ? 2 : 1
}

/**
 * The number for one line, hung on the line's first character: wrapped in an
 * anchor, the character stays where it was, and the number goes wherever the
 * character goes, onto the next page with it when a page breaks the text.
 * `offset` is how far the character sits from the edge the text starts from.
 */
function anchorLine(start: LineStart | null, block: HTMLElement, n: number, offset: number): void {
  const document = block.ownerDocument
  const anchor = document.createElement('span')
  anchor.className = 'trevixal-line-anchor'
  anchor.style.setProperty('--trevixal-line-offset', `${Math.max(0, offset)}px`)
  const number = document.createElement('span')
  number.className = 'trevixal-line-number'
  number.setAttribute('aria-hidden', 'true')
  number.textContent = String(n)
  anchor.appendChild(number)
  if (!start) {
    // An empty paragraph is still a line on the page.
    block.prepend(anchor)
    return
  }
  const character = start.offset > 0 ? start.node.splitText(start.offset) : start.node
  const length = characterLength(character.data, 0)
  if (character.data.length > length) character.splitText(length)
  character.replaceWith(anchor)
  anchor.appendChild(character)
}

/**
 * Number the lines of a rendered document in place: a print frame or a
 * preview, which the editor does not own. Each number is hung on the first
 * character of its line, so a page break moves it with the text rather than
 * leaving it where the unbroken layout had the line; any numbered before are
 * taken out first. The numbers sit beside the edge the text starts from,
 * which is the right one in a right-to-left document.
 */
export function numberLinesIn(root: HTMLElement): void {
  for (const old of root.querySelectorAll('.trevixal-line-anchor')) {
    old.querySelector(':scope > .trevixal-line-number')?.remove()
    old.replaceWith(...old.childNodes)
  }
  root.normalize()
  // A saved document keeps its direction on the element carrying its settings.
  const settings = root.querySelector<HTMLElement>(':scope > [data-trevixal-document]') ?? root
  const rtl = isRightToLeft(settings)
  const edge = textEdge(settings, rtl)
  root.dataset.lineNumbersSide = rtl ? 'right' : 'left'
  const lines: { block: HTMLElement; start: LineStart | null; offset: number }[] = []
  for (const block of root.querySelectorAll<HTMLElement>(COUNTED)) {
    if (block.closest(SKIPPED)) continue
    if (block.parentElement?.closest(COUNTED)) continue
    const starts = lineStartsIn(block)
    if (starts.length === 0) {
      // No character reported a box: an empty paragraph, or one WebKit has
      // not measured yet (inside an accordion). Either way a line on the page,
      // hung on its first character when it has one.
      const box = block.getBoundingClientRect()
      if (box.height === 0) continue
      const first = firstText(block)
      const start = first ? { node: first, offset: 0, box } : null
      lines.push({ block, start, offset: rtl ? edge - box.right : box.left - edge })
      continue
    }
    for (const start of starts) {
      const offset = rtl ? edge - start.box.right : start.box.left - edge
      lines.push({ block, start, offset })
    }
  }
  // Last first, so splitting a text node never moves a start not yet anchored.
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    if (line) anchorLine(line.start, line.block, index + 1, line.offset)
  }
}

export interface LineNumbersOptions {
  /**
   * Where the numbers are drawn: a positioned ancestor of the editing surface,
   * or one sharing its offset parent. Defaults to the surface's own parent.
   */
  readonly container?: HTMLElement
}

export interface LineNumbers {
  readonly element: HTMLElement
  /** Redraw now, rather than on the next frame. */
  refresh(): void
  destroy(): void
}

/**
 * Draw the editor's line numbers while its document asks for them, and keep
 * them in step as the text changes and the page resizes. Inert, and hidden,
 * while the setting is off.
 */
export function createLineNumbers(editor: Editor, options: LineNumbersOptions = {}): LineNumbers {
  const surface = editor.view?.dom ?? null
  const host = options.container ?? (surface?.parentElement as HTMLElement | null)
  const document = host?.ownerDocument ?? globalThis.document
  const layer = document.createElement('div')
  layer.className = 'trevixal-line-numbers'
  layer.setAttribute('aria-hidden', 'true')
  layer.hidden = true
  host?.appendChild(layer)

  const render = (): void => {
    layer.textContent = ''
    const on = editor.state.doc.attrs.lineNumbers === true
    layer.hidden = !on
    if (!on || !surface || !host) return
    const hostBox = host.getBoundingClientRect()
    const rtl = isRightToLeft(surface)
    const offsetTop = host.scrollTop - hostBox.top - host.clientTop
    const edge = textEdge(surface, rtl) - hostBox.left - host.clientLeft + host.scrollLeft
    measureLines(surface).forEach((line, index) => {
      layer.appendChild(
        numberElement(document, index + 1, line, { top: line.top + offsetTop, edge, rtl }),
      )
    })
  }

  let frame: number | null = null
  const schedule = (): void => {
    if (frame !== null) return
    const view = document.defaultView
    if (!view?.requestAnimationFrame) {
      render()
      return
    }
    frame = view.requestAnimationFrame(() => {
      frame = null
      render()
    })
  }

  // Only a change to the document moves a line; a caret moving does not.
  const unsubscribe = editor.on('update', schedule)
  const Observer = document.defaultView?.ResizeObserver
  const resize = Observer && surface ? new Observer(schedule) : null
  if (surface) resize?.observe(surface)
  document.defaultView?.addEventListener('resize', schedule)
  // Web fonts arriving change every line's length.
  void document.fonts?.ready.then(schedule)
  render()

  return {
    element: layer,
    refresh: render,
    destroy() {
      unsubscribe()
      resize?.disconnect()
      document.defaultView?.removeEventListener('resize', schedule)
      if (frame !== null) document.defaultView?.cancelAnimationFrame(frame)
      layer.remove()
    },
  }
}
