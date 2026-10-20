// @vitest-environment happy-dom
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { type PageLine, type PageMeasure, type TextPoint, paginate } from '../src/page-layout'

/**
 * A page body holds CAPACITY characters and a line holds PER_LINE: text
 * length stands in for height, as happy-dom lays nothing out.
 */
const CAPACITY = 100
const PER_LINE = 20

/** A subtree's text nodes in order. (happy-dom's TreeWalker does not descend past a skipped element.) */
function textNodes(root: Node): Text[] {
  if (root.nodeType === 3) return [root as Text]
  return [...root.childNodes].flatMap(textNodes)
}

/** How many characters of `body` come up to the end of `until`, or up to `offset` in the text node `until`. */
function textUpTo(body: HTMLElement, until: Node, offset?: number): number {
  let count = 0
  for (const node of textNodes(body)) {
    if (offset !== undefined && node === until) return count + offset
    if (offset === undefined && !until.contains(node) && until.compareDocumentPosition(node) & 4) {
      return count
    }
    count += node.data.length
  }
  return count
}

const measure: PageMeasure = {
  fits: (body) => (body.textContent ?? '').length <= CAPACITY,
  endsInside: (element, body) => textUpTo(body, element) <= CAPACITY,
  lines: (block, body) => {
    const points: TextPoint[] = textNodes(block).flatMap((node) =>
      [...node.data].map((_, offset) => ({ node, offset })),
    )
    const lines: PageLine[] = []
    for (let index = 0; index < points.length; index += PER_LINE) {
      const start = points[index] as TextPoint
      const end = points[Math.min(index + PER_LINE, points.length) - 1] as TextPoint
      lines.push({ start, fits: textUpTo(body, end.node, end.offset + 1) <= CAPACITY })
    }
    return lines
  },
}

const words = (count: number, seed = 'a'): string =>
  `${seed.repeat(PER_LINE - 1)} `.repeat(count).trim()

function content(html: string): HTMLElement {
  document.body.innerHTML = `<div class="trevixal"><div class="trevixal-content">${html}</div></div>`
  return document.querySelector('.trevixal-content') as HTMLElement
}

function layOut(html: string, setup: Partial<PageSetup> = {}, widowControl = true) {
  const root = content(html)
  const count = paginate(root, {
    setup: { ...DEFAULT_PAGE_SETUP, ...setup },
    measure,
    widowControl,
  })
  const pages = [...root.querySelectorAll<HTMLElement>('.trevixal-page')]
  return {
    count,
    pages,
    bodies: pages.map((page) => page.querySelector('.trevixal-page__body') as HTMLElement),
  }
}

describe('the page layout engine', () => {
  it('sets a short document on one page, its header and footer filled in', () => {
    const { count, pages } = layOut('<p>Hello</p>', {
      header: 'Report',
      footer: 'Page {page} of {pages}',
    })
    expect(count).toBe(1)
    expect(pages[0]?.style.width).toBe('210mm')
    expect(pages[0]?.querySelector('.trevixal-page__header')?.textContent).toBe('Report')
    expect(pages[0]?.querySelector('.trevixal-page__footer')?.textContent).toBe('Page 1 of 1')
  })

  it('goes on to a new page when one is full, and numbers them all', () => {
    const paragraphs = Array.from(
      { length: 6 },
      (_, index) => `<p>${String(index).repeat(40)}</p>`,
    ).join('')
    const { count, pages, bodies } = layOut(paragraphs, { footer: '{page}/{pages}' })
    expect(count).toBe(3)
    expect(bodies.map((body) => body.children.length)).toEqual([2, 2, 2])
    expect(pages.map((page) => page.querySelector('.trevixal-page__footer')?.textContent)).toEqual([
      '1/3',
      '2/3',
      '3/3',
    ])
  })

  it('splits a paragraph at a line, and leaves no line alone on either page', () => {
    // 60 characters, then a paragraph of six lines: two fit, four go over.
    const { bodies } = layOut(`<p>${'x'.repeat(60)}</p><p>${words(6)}</p>`)
    const first = bodies[0]?.lastElementChild as HTMLElement
    const rest = bodies[1]?.firstElementChild as HTMLElement
    expect(first.hasAttribute('data-trevixal-split')).toBe(true)
    expect(rest.hasAttribute('data-trevixal-continued')).toBe(true)
    expect(first.textContent?.length).toBe(PER_LINE * 2)
    // Only one line would be left over after five: it takes one more with it.
    const { bodies: widowed } = layOut(`<p>${words(6)}</p>`)
    expect(widowed[1]?.textContent?.length).toBeGreaterThanOrEqual(PER_LINE * 2 - 1)
  })

  it('takes a line’s number over with the line', () => {
    // A printed line's number hangs off its first letter: <anchor><number/>letter</anchor>.
    const root = content(
      `<p>${'x'.repeat(95)} <span class="trevixal-line-anchor"><span class="trevixal-line-number">2</span>w</span>ord</p>`,
    )
    const anchor = root.querySelector('.trevixal-line-anchor') as HTMLElement
    const letter = anchor.lastChild as Text
    const first = root.querySelector('p')?.firstChild as Text
    const byLine: PageMeasure = {
      ...measure,
      lines: () => [
        { start: { node: first, offset: 0 }, fits: true },
        { start: { node: letter, offset: 0 }, fits: false },
      ],
    }
    paginate(root, { setup: DEFAULT_PAGE_SETUP, measure: byLine, widowControl: false })
    const [one, two] = [...root.querySelectorAll('.trevixal-page__body')]
    expect(one?.querySelector('.trevixal-line-number')).toBeNull()
    expect(two?.querySelector('.trevixal-line-anchor')?.textContent).toBe('2w')
  })

  it('breaks the page at a page break, and starts a section on pages of its own', () => {
    const { pages, bodies } = layOut(
      '<p>One</p><div data-page-break="true"></div><p>Two</p><div data-section-break="" data-orientation="landscape" data-columns="2"></div><p>Three</p>',
    )
    expect(bodies.map((body) => body.textContent)).toEqual(['One', 'Two', 'Three'])
    expect(pages[2]?.dataset.orientation).toBe('landscape')
    expect(pages[2]?.style.width).toBe('297mm')
    expect(bodies[2]?.dataset.columns).toBe('2')
  })

  it('takes a heading over with what it heads', () => {
    const { bodies } = layOut(
      `<p>${'x'.repeat(80)}</p><h2>Next</h2><p>${'y'.repeat(60)}</p>`,
      {},
      false,
    )
    expect(bodies[1]?.firstElementChild?.tagName).toBe('H2')
    // Also when only the heading's own margin runs over, and it would stay.
    const kept: PageMeasure = {
      ...measure,
      // The heading's margin runs over below other text, not at the head of a page.
      fits: (body) =>
        measure.fits(body) &&
        (body.lastElementChild?.tagName !== 'H3' || body.childElementCount === 1),
      lines: (block, body) => measure.lines(block, body).map((line) => ({ ...line, fits: true })),
    }
    const root = content(`<p>${'x'.repeat(40)}</p><h3>Next</h3><p>${'y'.repeat(20)}</p>`)
    paginate(root, { setup: DEFAULT_PAGE_SETUP, measure: kept })
    const pages = [...root.querySelectorAll('.trevixal-page__body')]
    expect(pages.map((body) => body.lastElementChild?.tagName)).not.toContain('H3')
  })

  it('goes on with a list’s numbers, and a table’s header row, over the page', () => {
    const list = `<ol start="3">${Array.from({ length: 4 }, () => `<li><p>${'l'.repeat(39)}</p></li>`).join('')}</ol>`
    const { bodies } = layOut(list)
    expect(bodies[1]?.querySelector('ol')?.getAttribute('start')).toBe('5')

    const rows = Array.from(
      { length: 5 },
      (_, index) => `<tr><td>${String(index).repeat(30)}</td></tr>`,
    ).join('')
    const { bodies: tables } = layOut(
      `<table><thead><tr><th>Head</th></tr></thead><tbody>${rows}</tbody></table>`,
    )
    expect(tables.length).toBeGreaterThan(1)
    expect(tables[1]?.querySelector('thead')?.textContent).toBe('Head')
    expect(tables[1]?.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
  })

  it('carries the document’s settings onto each page, and its heading numbers on from the last', () => {
    const { bodies } = layOut(
      `<div data-trevixal-document="" data-heading-numbering="outline"><h1>A</h1><p>${'x'.repeat(99)}</p><h1>B</h1></div>`,
    )
    expect(bodies[0]?.getAttribute('data-heading-numbering')).toBe('outline')
    expect(bodies[1]?.style.getPropertyValue('counter-reset')).toContain('tvx-h1 1')
  })
})
