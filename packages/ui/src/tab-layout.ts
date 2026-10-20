import type { Editor } from '@trevixal/core'

/**
 * Word's tab stops, laid out. A tab character takes the text after it to the
 * paragraph's next stop: its left edge there, its right edge, its middle, or
 * its decimal point, with a leader (dots, a dashed or a solid line) filling
 * the gap. Past the last custom stop, or in a paragraph with none, stops fall
 * every half inch from the margin, as Word's default ones do.
 *
 * Each tab is its own inline-block holding the tab character, sized with
 * `tab-size`: inside its own box the character runs from 0 to exactly that
 * length, so the tab is as wide as the gap and a caret after it sits at the
 * stop, in every engine. The editor wraps its tabs in a decoration; a print or
 * a saved page wraps them itself.
 */

/**
 * Lay out every tab under `root`. With `wrap`, a tab character not in one of
 * its own spans (a print, a saved page) is put in one first; the editor's are
 * already, as a decoration.
 *
 * Self-contained, as the saved page runs it from its source: it reads the
 * stops from each paragraph's `data-tab-stops` and uses nothing from outside.
 */
export function layoutTabsIn(root: HTMLElement, wrap = false): void {
  const document = root.ownerDocument
  const view = document.defaultView
  if (!view) return
  // CSS pixels per point, and Word's default stop every half inch.
  const pixels = 96 / 72
  const interval = 36 * pixels
  const blocks = 'p, h1, h2, h3, h4, h5, h6, figcaption, summary, li'

  /** Every text node under `node`, in document order. Walked by hand: nothing else to lean on. */
  const textsIn = (node: Node, into: Text[] = []): Text[] => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) into.push(child as Text)
      else textsIn(child, into)
    }
    return into
  }

  if (wrap) {
    const found = textsIn(root).filter(
      (text) =>
        text.data.includes('\t') && !text.parentElement?.closest('pre, code, .trevixal-tab'),
    )
    for (const text of found) {
      let rest: Text | null = text
      while (rest) {
        const at: number = rest.data.indexOf('\t')
        if (at < 0) break
        const tab: Text = at > 0 ? rest.splitText(at) : rest
        rest = tab.data.length > 1 ? tab.splitText(1) : null
        const span = document.createElement('span')
        span.className = 'trevixal-tab'
        tab.replaceWith(span)
        span.appendChild(tab)
      }
    }
  }

  /** Stops as `data-tab-stops` writes them: `72 left, 216 right dot`, in points. */
  const stopsOf = (block: Element): { at: number; align: string; leader: string }[] =>
    (block.getAttribute('data-tab-stops') ?? '')
      .split(',')
      .map((part) => part.trim().split(/\s+/))
      .map(([position, align, leader]) => ({
        at: Number.parseFloat(position ?? '') * pixels,
        align: align ?? 'left',
        leader: leader ?? 'none',
      }))
      .filter((stop) => Number.isFinite(stop.at) && stop.at > 0)
      .sort((a, b) => a.at - b.at)

  const setWidth = (span: HTMLElement, width: number): void => {
    const size = `${Math.max(0, Math.round(width * 100) / 100)}px`
    span.style.setProperty('tab-size', size)
    span.style.setProperty('-moz-tab-size', size)
  }

  const byBlock = new Map<Element, HTMLElement[]>()
  for (const span of root.querySelectorAll<HTMLElement>('.trevixal-tab')) {
    const block = span.parentElement?.closest(blocks)
    if (!block) continue
    byBlock.set(block, [...(byBlock.get(block) ?? []), span])
  }

  for (const [block, spans] of byBlock) {
    const style = view.getComputedStyle(block)
    const rtl = style.direction === 'rtl'
    const box = block.getBoundingClientRect()
    // Stops are measured from the margin, not from where an indent starts the text.
    const indent = Number.parseFloat(style.marginInlineStart) || 0
    const margin = rtl ? box.right + indent : box.left - indent
    // Where the line ends, from the margin. A stop of the paragraph's past it
    // (a wide stop in a narrow column or window) is taken as a right stop at
    // that end, so the text after the tab stays on its line rather than the
    // tab wrapping onto one of its own; a default stop past it ends the line.
    const endInset =
      (Number.parseFloat(style.paddingInlineEnd) || 0) +
      (Number.parseFloat(style.borderInlineEndWidth) || 0)
    const lineEnd = (rtl ? margin - box.left : box.right - margin) - endInset
    const stops = stopsOf(block)
    for (const span of spans) setWidth(span, 0)
    spans.forEach((span, index) => {
      const rect = span.getBoundingClientRect()
      const at = rtl ? margin - rect.right : rect.left - margin
      const stop = stops.find((each) => each.at > at + 1)
      const wanted = stop ? stop.at : (Math.floor(at / interval) + 1) * interval
      const target = Math.min(wanted, lineEnd)
      const align = stop && wanted > lineEnd ? 'right' : stop?.align
      let width = target - at
      if (stop && align !== 'left') {
        // The text the tab leads, up to the next tab or the end of the paragraph.
        const range = document.createRange()
        range.setStartAfter(span)
        const next = spans[index + 1]
        if (next) range.setEndBefore(next)
        else range.setEnd(block, block.childNodes.length)
        const text = range.toString()
        const point = align === 'decimal' ? text.search(/[.,]/) : -1
        if (point >= 0) {
          const upTo = range.cloneRange()
          upTo.collapse(true)
          const found = locate(upTo, point)
          width -= found ? found.getBoundingClientRect().width : 0
        } else {
          const first = range.getClientRects()[0]
          const segment = first ? first.width : 0
          width -= align === 'center' ? segment / 2 : segment
        }
      }
      setWidth(span, width)
      if (stop && stop.leader !== 'none') span.dataset.leader = stop.leader
      else delete span.dataset.leader
    })
  }

  /** A range from `start` over the next `count` characters of the text after it. */
  function locate(start: Range, count: number): Range | null {
    let remaining = count
    for (const text of textsIn(root)) {
      const position = start.comparePoint(text, 0)
      // Text wholly before the start is not after it.
      if (position < 0 && start.comparePoint(text, text.data.length) < 0) continue
      const from = text === start.startContainer ? start.startOffset : 0
      const length = text.data.length - from
      if (remaining <= length) {
        const range = start.cloneRange()
        range.setEnd(text, from + remaining)
        return range
      }
      remaining -= length
    }
    return null
  }
}

export interface TabLayout {
  /** Lay the tabs out now, rather than on the next frame. */
  refresh(): void
  destroy(): void
}

/**
 * Keep the editor's tabs at their stops: each tab character in body text is
 * wrapped in a decoration, and laid out again as the text changes, the page
 * resizes or its fonts arrive. Code keeps its own tabs.
 */
export function createTabLayout(editor: Editor): TabLayout {
  const view = editor.view
  if (!view) return { refresh() {}, destroy() {} }
  const document = view.dom.ownerDocument
  view.setDecorationLayer('tabs', (node) => {
    if (!node.isTextblock || node.type.spec.preserveWhitespace) return null
    const tabs: { from: number; to: number; className: string }[] = []
    let offset = 0
    for (const child of node.content.children) {
      if (child.isText) {
        const text = child.textContent
        for (let at = text.indexOf('\t'); at >= 0; at = text.indexOf('\t', at + 1)) {
          tabs.push({ from: offset + at, to: offset + at + 1, className: 'trevixal-tab' })
        }
      }
      // An inline node (a line break, a footnote marker) is one position.
      offset += child.isText ? child.textContent.length : 1
    }
    return tabs.length > 0 ? tabs : null
  })

  const render = (): void => layoutTabsIn(view.dom)
  let frame: number | null = null
  const schedule = (): void => {
    const window = document.defaultView
    if (frame !== null || !window?.requestAnimationFrame) {
      if (!window?.requestAnimationFrame) render()
      return
    }
    frame = window.requestAnimationFrame(() => {
      frame = null
      render()
    })
  }
  const unsubscribe = editor.on('update', schedule)
  const Observer = document.defaultView?.ResizeObserver
  const resize = Observer ? new Observer(schedule) : null
  resize?.observe(view.dom)
  void document.fonts?.ready.then(schedule)
  render()

  return {
    refresh: render,
    destroy() {
      unsubscribe()
      resize?.disconnect()
      if (frame !== null) document.defaultView?.cancelAnimationFrame(frame)
      view.setDecorationLayer('tabs', null)
    },
  }
}
