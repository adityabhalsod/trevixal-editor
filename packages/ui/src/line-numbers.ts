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

/**
 * A drop cap's letter, as CSS's `::first-letter` takes it: the first letter,
 * number or symbol, with its combining marks and the punctuation either side.
 */
const FIRST_LETTER = /^\p{P}*[\p{L}\p{N}\p{S}]\p{M}*\p{P}*/u

/** The number of the line holding the caret. */
const ACTIVE_CLASS = 'trevixal-line-number--active'

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
    // A drop cap's letter is as tall as the lines beside it, and would make
    // them one line.
    const letter = dropCapLetter(block)
    if (letter) range.setStart(letter.node, letter.length)
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

/**
 * One number, level with the line it counts and placed at the edge the text
 * starts from. The stylesheet sets it off from there, into the gutter.
 */
function numberElement(
  document: Document,
  n: number,
  line: MeasuredLine,
  position: { top: number; edge: number },
): HTMLElement {
  const element = document.createElement('span')
  element.className = 'trevixal-line-number'
  element.setAttribute('aria-hidden', 'true')
  element.textContent = String(n)
  element.style.top = `${position.top}px`
  element.style.height = `${line.height}px`
  element.style.lineHeight = `${line.height}px`
  element.style.left = `${position.edge}px`
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
  // Past a drop cap's letter: it is as tall as the lines beside it, so each
  // of them would seem to start below it.
  const letter = dropCapLetter(block)
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  for (let found = walker.nextNode(); found; found = walker.nextNode()) {
    const node = found as Text
    const isBelow = (offset: number): boolean => {
      const box = boxOf(node, offset)
      return box !== null && box.top >= bottom - 2
    }
    let from = node === letter?.node ? letter.length : 0
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

/**
 * The letter a drop cap draws, and the text node it starts: null for a block
 * without one. The letter floats beside the block's first lines, so it is
 * left out of them.
 */
function dropCapLetter(block: HTMLElement): { node: Text; length: number } | null {
  if (!block.hasAttribute('data-drop-cap')) return null
  const node = firstText(block)
  const length = node ? (FIRST_LETTER.exec(node.data)?.[0].length ?? 0) : 0
  return node && length > 0 ? { node, length } : null
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
    // The stylesheet sets the numbers off on the side the text starts from.
    layer.dataset.side = rtl ? 'right' : 'left'
    measureLines(surface).forEach((line, index) => {
      layer.appendChild(
        numberElement(document, index + 1, line, { top: line.top + offsetTop, edge }),
      )
    })
    light()
  }

  /** Light the number of the line the caret is on, as a code editor does. */
  const light = (): void => {
    // Nothing to light while the numbers are off, so no caret to measure.
    if (layer.childElementCount === 0) return
    const caret = surface ? caretMiddle(surface) : null
    let lit = false
    for (const number of Array.from(layer.children)) {
      const box = number.getBoundingClientRect()
      const on = !lit && caret !== null && caret >= box.top && caret < box.bottom
      number.classList.toggle(ACTIVE_CLASS, on)
      if (on) lit = true
    }
  }

  const redraw = nextFrame(document, render)
  const relight = nextFrame(document, light)

  // A change to the document moves the lines; the caret moving moves the light.
  const unsubscribe = editor.on('update', redraw.request)
  const offSelection = editor.on('selectionUpdate', relight.request)
  const Observer = document.defaultView?.ResizeObserver
  const resize = Observer && surface ? new Observer(redraw.request) : null
  if (surface) resize?.observe(surface)
  document.defaultView?.addEventListener('resize', redraw.request)
  // Web fonts arriving change every line's length.
  void document.fonts?.ready.then(redraw.request)
  render()

  return {
    element: layer,
    refresh: render,
    destroy() {
      unsubscribe()
      offSelection()
      resize?.disconnect()
      document.defaultView?.removeEventListener('resize', redraw.request)
      redraw.cancel()
      relight.cancel()
      layer.remove()
    },
  }
}

/** Run `task` on the next frame, once however often it is asked for before then. */
function nextFrame(document: Document, task: () => void): { request(): void; cancel(): void } {
  let frame: number | null = null
  return {
    request() {
      if (frame !== null) return
      const view = document.defaultView
      if (!view?.requestAnimationFrame) {
        task()
        return
      }
      frame = view.requestAnimationFrame(() => {
        frame = null
        task()
      })
    },
    cancel() {
      if (frame !== null) document.defaultView?.cancelAnimationFrame(frame)
      frame = null
    },
  }
}

/**
 * The middle of the caret's line, in viewport coordinates: the selection's
 * head, read from the page, where the browser laid it out. Null when the
 * selection is not in `surface`.
 */
function caretMiddle(surface: HTMLElement): number | null {
  const document = surface.ownerDocument
  const selection = document.getSelection()
  const node = selection?.focusNode
  if (!selection || !node || !surface.contains(node)) return null
  const middle = (box: DOMRect | undefined): number | null =>
    box && box.height > 0 ? box.top + box.height / 2 : null
  const range = document.createRange()
  range.setStart(node, selection.focusOffset)
  const caret = middle(range.getClientRects()[0])
  if (caret !== null) return caret
  // WebKit measures nothing for a collapsed range: measure the character after
  // the caret instead, or the one before it at the end of the text.
  if (node.nodeType === node.TEXT_NODE && (node as Text).length > 0) {
    const offset = Math.min(selection.focusOffset, (node as Text).length - 1)
    range.setStart(node, offset)
    range.setEnd(node, offset + 1)
    return middle(range.getClientRects()[0])
  }
  // An empty paragraph has no text to measure: its line is the block itself.
  const element = node.nodeType === node.ELEMENT_NODE ? (node as Element) : node.parentElement
  if (!element || element === surface || element.textContent !== '') return null
  return middle(element.getBoundingClientRect())
}
