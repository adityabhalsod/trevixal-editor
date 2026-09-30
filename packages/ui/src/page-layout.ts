import {
  DOCUMENT_ATTRIBUTE,
  type PageMargins,
  type PageSetup,
  fillPageTemplate,
  pageDimensions,
  pageSectionOf,
} from '@trevixal/core'

/**
 * The page layout engine: a print, or its preview, set as the pages it
 * prints on. Each page is a box of the paper's size with the document's
 * margins, its header and footer in them (page numbers filled in), and as
 * much of the text as fits between. A paragraph, a list, a table or a box
 * that runs past the foot of a page is split there and goes on over the
 * page: at a line, an item, a row. A heading goes over with what follows
 * it, and with widow control on, a paragraph leaves no single line on
 * either page. A section break starts pages of its own: turned, in columns,
 * or with other margins.
 *
 * It works on laid-out markup, the print frame's, and measures as it goes,
 * so what it measures is what the paper gets.
 */

/** A place in a block's text: where a line starts. */
export interface TextPoint {
  readonly node: Text
  readonly offset: number
}

/** One line of a block's text, as laid out. */
export interface PageLine {
  readonly start: TextPoint
  /** Whether the line ends inside the page body. */
  readonly fits: boolean
}

/** How the engine measures. The page's own layout, unless a test says otherwise. */
export interface PageMeasure {
  /** Whether a page body holds everything in it. */
  readonly fits: (body: HTMLElement) => boolean
  /** Whether an element in a page body ends inside it. */
  readonly endsInside: (element: Element, body: HTMLElement) => boolean
  /** A block's lines, in order. */
  readonly lines: (block: HTMLElement, body: HTMLElement) => readonly PageLine[]
}

export interface PaginateOptions {
  readonly setup: PageSetup
  /** Keep a paragraph's first and last lines off pages of their own. On unless the document turns it off. */
  readonly widowControl?: boolean
  readonly measure?: PageMeasure
}

/** Marks the first part of something split at the foot of a page. */
const SPLIT = 'data-trevixal-split'
/** Marks the part of it that goes on over the page. */
const CONTINUED = 'data-trevixal-continued'
/** On the content once it is set as pages. */
const PAGINATED = 'trevixal-paginated'

/** The counters heading numbers count with, as `_editor.scss` names them. */
const HEADING_COUNTERS = ['tvx-h1', 'tvx-h2', 'tvx-h3', 'tvx-h4', 'tvx-h5', 'tvx-h6']

/** Blocks whose lines are split between pages. */
const TEXT_BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE'])
/** What is never split: a picture, a rule, a frame, a formula. */
const WHOLE = new Set([
  'IMG',
  'FIGURE',
  'HR',
  'IFRAME',
  'VIDEO',
  'AUDIO',
  'CANVAS',
  'PICTURE',
  // A toggle's copy would open with a summary of the browser's own.
  'DETAILS',
  'svg',
  'math',
])

/** Sub-pixel slack: a line that ends a fraction of a pixel past the body is inside it. */
const SLACK = 1

/** What starts a line of a block's text: each word, or in code, each line as written. */
function* lineCandidates(block: HTMLElement): Generator<TextPoint> {
  const code = block.tagName === 'PRE'
  const walker = block.ownerDocument.createTreeWalker(block, 4 /* NodeFilter.SHOW_TEXT */)
  let previous = '\n'
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    // A line number hangs in the margin; its digits are not the text.
    if (node.parentElement?.closest('.trevixal-line-number')) continue
    const text = node.data
    for (let offset = 0; offset < text.length; offset++) {
      const char = text[offset] as string
      const starts = code ? previous === '\n' : /\s/.test(previous) && !/\s/.test(char)
      if (starts) yield { node, offset }
      previous = char
    }
  }
}

/** The layout's own measure: boxes and line boxes, as the frame sets them. */
export const layoutMeasure: PageMeasure = {
  fits: (body) =>
    body.scrollHeight <= body.clientHeight + SLACK && body.scrollWidth <= body.clientWidth + SLACK,
  endsInside: (element, body) => {
    const box = element.getBoundingClientRect()
    const limit = body.getBoundingClientRect()
    return box.bottom <= limit.bottom + SLACK && box.right <= limit.right + SLACK
  },
  lines: (block, body) => {
    const limit = body.getBoundingClientRect()
    const range = block.ownerDocument.createRange()
    const lines: { start: TextPoint; top: number; bottom: number; right: number }[] = []
    for (const point of lineCandidates(block)) {
      range.setStart(point.node, point.offset)
      range.setEnd(point.node, point.offset + 1)
      const box = range.getClientRects()[0]
      if (!box) continue
      const last = lines[lines.length - 1]
      // Below the line so far is a new line; above it, the next column's first.
      if (!last || box.top >= last.bottom - SLACK || box.bottom <= last.top + SLACK) {
        lines.push({ start: point, top: box.top, bottom: box.bottom, right: box.right })
      } else {
        last.bottom = Math.max(last.bottom, box.bottom)
        last.right = Math.max(last.right, box.right)
      }
    }
    return lines.map((line) => ({
      start: line.start,
      fits: line.bottom <= limit.bottom + SLACK && line.right <= limit.right + SLACK,
    }))
  },
}

/** The first part fits and the rest went on to the next page; or all of it stays. */
type Split = HTMLElement | 'keep' | null

/** One page as it is being filled. */
interface Page {
  readonly box: HTMLElement
  readonly body: HTMLElement
}

/** A section's pages: which way up, their margins, their columns. */
interface SectionLayout {
  readonly orientation: PageSetup['orientation']
  readonly margins: PageMargins
  readonly columns: number | null
}

const isHeading = (element: Element): boolean =>
  /^H[1-6]$/.test(element.tagName) && !element.hasAttribute(CONTINUED)

/** Lay `content` out as pages, in place. Returns how many there are. */
export function paginate(content: HTMLElement, options: PaginateOptions): number {
  const { setup } = options
  const measure = options.measure ?? layoutMeasure
  const widowControl = options.widowControl !== false
  const document = content.ownerDocument
  const settings =
    [...content.children].find((child) => child.hasAttribute(DOCUMENT_ATTRIBUTE)) ?? null
  const flow = settings ?? content
  const numbered = settings?.hasAttribute('data-heading-numbering') ?? false
  const headingCounts = HEADING_COUNTERS.map(() => 0)
  /** Where each continuation came from, to put the two back together. */
  const splitFrom = new WeakMap<HTMLElement, HTMLElement>()
  const pages = document.createElement('div')
  pages.className = 'trevixal-pages'
  const opened: Page[] = []

  const countHeadings = (page: Page | undefined): void => {
    for (const child of page?.body.children ?? []) {
      if (!isHeading(child)) continue
      const level = Number(child.tagName[1]) - 1
      headingCounts[level] = (headingCounts[level] ?? 0) + 1
      for (let deeper = level + 1; deeper < headingCounts.length; deeper++)
        headingCounts[deeper] = 0
    }
  }

  const openPage = (layout: SectionLayout): Page => {
    countHeadings(opened[opened.length - 1])
    const { width, height } = pageDimensions(setup.size, layout.orientation)
    const { top, right, bottom, left } = layout.margins
    const box = document.createElement('div')
    box.className = 'trevixal-page'
    box.dataset.orientation = layout.orientation
    box.style.width = `${width}mm`
    box.style.height = `${height}mm`
    box.style.setProperty('page', `trevixal-${layout.orientation}`)
    const band = (name: 'header' | 'footer', template: string): void => {
      if (!template) return
      const element = document.createElement('div')
      element.className = `trevixal-page__${name}`
      element.dataset.template = template
      element.style.left = `${left}mm`
      element.style.right = `${right}mm`
      element.style.height = `${name === 'header' ? top : bottom}mm`
      element.style[name === 'header' ? 'top' : 'bottom'] = '0'
      box.appendChild(element)
    }
    band('header', setup.header)
    const body = document.createElement('div')
    body.className = 'trevixal-page__body'
    for (const attribute of settings?.attributes ?? []) {
      if (attribute.name !== 'class' && attribute.name !== 'style')
        body.setAttribute(attribute.name, attribute.value)
    }
    if (layout.columns !== null) {
      if (layout.columns > 1) body.dataset.columns = String(layout.columns)
      else body.removeAttribute('data-columns')
    }
    body.style.top = `${top}mm`
    body.style.left = `${left}mm`
    body.style.width = `${width - left - right}mm`
    body.style.height = `${height - top - bottom}mm`
    // Heading numbers go on from the page before, not from 1 again.
    if (numbered && opened.length > 0) {
      body.style.setProperty(
        'counter-reset',
        HEADING_COUNTERS.map((name, index) => `${name} ${headingCounts[index] ?? 0}`).join(' '),
      )
    }
    box.appendChild(body)
    band('footer', setup.footer)
    pages.appendChild(box)
    const page = { box, body }
    opened.push(page)
    return page
  }

  /** Mark a split: the first part closes at the foot, the rest opens on the next page. */
  const markSplit = (first: HTMLElement, rest: HTMLElement): void => {
    first.setAttribute(SPLIT, '')
    rest.setAttribute(CONTINUED, '')
    // Once is enough for an anchor and a drop cap.
    for (const name of ['id', 'data-drop-cap', 'data-drop-cap-lines']) rest.removeAttribute(name)
    const view = document.defaultView
    if (view && view.getComputedStyle(first).textAlign === 'justify') {
      first.style.setProperty('text-align-last', 'justify')
    }
    splitFrom.set(rest, first)
  }

  /** Put a split back together, when it goes over whole after all. */
  const rejoin = (first: HTMLElement, rest: HTMLElement): void => {
    first.append(...rest.childNodes)
    first.removeAttribute(SPLIT)
    first.style.removeProperty('text-align-last')
    rest.remove()
  }

  /** Cut a text block at `point`: what follows goes into a copy of it. */
  const cut = (block: HTMLElement, point: TextPoint): HTMLElement => {
    const range = document.createRange()
    // A printed line's number hangs off its first letter, ahead of it in the
    // same span (line-numbers.ts): cut before the span, so the number goes
    // over with its line.
    const anchor = point.node.parentElement?.closest('.trevixal-line-anchor')
    if (anchor && block.contains(anchor) && point.offset === 0) range.setStartBefore(anchor)
    else range.setStart(point.node, point.offset)
    range.setEnd(block, block.childNodes.length)
    const rest = block.cloneNode(false) as HTMLElement
    rest.append(range.extractContents())
    markSplit(block, rest)
    return rest
  }

  const splitText = (block: HTMLElement, body: HTMLElement): Split => {
    const lines = measure.lines(block, body)
    const least = widowControl ? 2 : 1
    let fitting = lines.findIndex((line) => !line.fits)
    if (fitting === -1) return 'keep'
    if (widowControl && lines.length - fitting < least) fitting = lines.length - least
    if (fitting < least) return null
    let rest = cut(block, (lines[fitting] as PageLine).start)
    // A line can still run over (a hyphenated word carried on): cut a line sooner.
    while (!measure.fits(body)) {
      fitting -= 1
      if (fitting < least) {
        rejoin(block, rest)
        return null
      }
      const more = cut(block, (lines[fitting] as PageLine).start)
      more.append(...rest.childNodes)
      rest = more
    }
    return rest
  }

  /** The number an ordered list's first item has. */
  const startOf = (list: HTMLElement): number => {
    const start = Number.parseInt(list.getAttribute('start') ?? '', 10)
    return Number.isFinite(start) ? start : 1
  }

  const splitChildren = (container: HTMLElement, body: HTMLElement): Split => {
    const children = [...container.children] as HTMLElement[]
    const index = children.findIndex((child) => !measure.endsInside(child, body))
    if (index === -1) return 'keep'
    const inner = splitToFit(children[index] as HTMLElement, body)
    const moved =
      inner instanceof HTMLElement
        ? [inner, ...children.slice(index + 1)]
        : children.slice(inner === 'keep' ? index + 1 : index)
    if (moved.length === 0) return 'keep'
    if (moved.length === children.length && !(inner instanceof HTMLElement)) return null
    const rest = container.cloneNode(false) as HTMLElement
    rest.append(...moved)
    markSplit(container, rest)
    // What still runs over (a box's padding, say) goes over too, a child at a time.
    while (!measure.fits(body)) {
      const last = container.lastElementChild as HTMLElement | null
      if (!last) break
      const first = rest.firstElementChild as HTMLElement | null
      if (first && splitFrom.get(first) === last) rejoin(last, first)
      rest.prepend(last)
      if (container.childElementCount === 0) {
        rejoin(container, rest)
        return null
      }
    }
    if (container.tagName === 'OL') {
      const kept = [...container.children].filter((child) => child.tagName === 'LI').length
      const goesOn = rest.firstElementChild?.hasAttribute(CONTINUED) ? 1 : 0
      rest.setAttribute('start', String(startOf(container) + kept - goesOn))
    }
    return rest
  }

  const splitTable = (table: HTMLElement, body: HTMLElement): Split => {
    const section = [...table.children].find((child) => child.tagName === 'TBODY') ?? table
    const rows = [...section.children].filter((child) => child.tagName === 'TR') as HTMLElement[]
    let index = rows.findIndex((row) => !measure.endsInside(row, body))
    if (index === -1) return 'keep'
    // Never between two rows a merged cell joins.
    const spansInto = (at: number): boolean =>
      rows
        .slice(0, at)
        .some((row, rowIndex) =>
          [...row.children].some(
            (cell) => rowIndex + ((cell as HTMLTableCellElement).rowSpan || 1) > at,
          ),
        )
    while (index > 0 && spansInto(index)) index -= 1
    if (index === 0) return null
    const rest = table.cloneNode(false) as HTMLElement
    for (const child of table.children) {
      // The header row heads the rest too, as Word's Repeat Header Rows.
      if (child.tagName === 'THEAD' || child.tagName === 'COLGROUP')
        rest.appendChild(child.cloneNode(true))
    }
    const restRows =
      section === table ? rest : rest.appendChild(section.cloneNode(false) as HTMLElement)
    restRows.append(...rows.slice(index))
    markSplit(table, rest)
    while (!measure.fits(body) && index > 1) {
      index -= 1
      restRows.prepend(rows[index] as HTMLElement)
    }
    return rest
  }

  const splitToFit = (element: HTMLElement, body: HTMLElement): Split => {
    if (WHOLE.has(element.tagName)) return null
    const style = document.defaultView?.getComputedStyle(element)
    if (style && (style.breakInside === 'avoid' || /grid|flex/.test(style.display))) return null
    if (TEXT_BLOCKS.has(element.tagName)) return splitText(element, body)
    if (element.tagName === 'TABLE') return splitTable(element, body)
    return element.childElementCount > 0 ? splitChildren(element, body) : null
  }

  // The sections: the document's own, then one after each section break.
  const sections: { layout: SectionLayout; blocks: HTMLElement[] }[] = [
    {
      layout: { orientation: setup.orientation, margins: setup.margins, columns: null },
      blocks: [],
    },
  ]
  for (const child of [...flow.children] as HTMLElement[]) {
    if (child === pages) continue
    if (child.hasAttribute('data-section-break')) {
      const section = pageSectionOf({
        orientation: child.dataset.orientation,
        columns: child.dataset.columns ? Number(child.dataset.columns) : null,
        margin: child.dataset.margin ? Number(child.dataset.margin) : null,
      })
      const margin = section.margin
      sections.push({
        layout: {
          orientation: section.orientation ?? setup.orientation,
          margins:
            margin === null
              ? setup.margins
              : { top: margin, right: margin, bottom: margin, left: margin },
          columns: section.columns,
        },
        blocks: [],
      })
      child.remove()
      continue
    }
    sections[sections.length - 1]?.blocks.push(child)
  }

  content.appendChild(pages)
  content.classList.add(PAGINATED)
  for (const section of sections) {
    if (section.blocks.length === 0 && opened.length > 0) continue
    let page = openPage(section.layout)
    const queue = [...section.blocks]
    while (queue.length > 0) {
      const block = queue.shift() as HTMLElement
      if (block.hasAttribute('data-page-break')) {
        block.remove()
        if (page.body.childElementCount > 0) page = openPage(section.layout)
        continue
      }
      page.body.appendChild(block)
      if (measure.fits(page.body)) continue
      const split = splitToFit(block, page.body)
      const carried: HTMLElement[] = split instanceof HTMLElement ? [split] : []
      // Nothing of it fits here: it goes over, unless it is too big for any
      // page, when it stays, cut off.
      if (split === null && page.body.childElementCount > 1) {
        block.remove()
        carried.push(block)
      }
      // A heading goes over with what it heads, unless it heads the page.
      for (
        let last = page.body.lastElementChild;
        last && isHeading(last) && last.previousElementSibling;
        last = page.body.lastElementChild
      ) {
        carried.unshift(last as HTMLElement)
        last.remove()
      }
      page = openPage(section.layout)
      queue.unshift(...carried)
    }
  }
  // The first page stands for an empty document too; a page left empty at the end goes.
  const last = opened[opened.length - 1]
  if (opened.length > 1 && last && last.body.childElementCount === 0) {
    last.box.remove()
    opened.pop()
  }
  // Only the pages are left: the surface keeps white space, so even the
  // markup's line breaks around them would print as blank lines.
  for (const node of [...content.childNodes]) if (node !== pages) node.remove()
  opened.forEach(({ box }, index) => {
    for (const band of box.querySelectorAll<HTMLElement>('[data-template]')) {
      band.textContent = fillPageTemplate(band.dataset.template ?? '', index + 1, opened.length)
    }
  })
  return opened.length
}

/**
 * The print's page rules: the paper, no margin of the browser's own (a page
 * box holds its margins), the text at its printed width to be measured, and
 * how the pages look in a preview and print.
 */
export function pageLayoutCSS(setup: PageSetup): string {
  const page = pageDimensions(setup.size, setup.orientation)
  const portrait = pageDimensions(setup.size, 'portrait')
  const text = page.width - setup.margins.left - setup.margins.right
  return [
    `@page { size: ${page.width}mm ${page.height}mm; margin: 0; }`,
    `@page trevixal-portrait { size: ${portrait.width}mm ${portrait.height}mm; margin: 0; }`,
    `@page trevixal-landscape { size: ${portrait.height}mm ${portrait.width}mm; margin: 0; }`,
    'html, body { margin: 0; padding: 0; }',
    // Measured at the width of a page's text box, to the pixel: no padding, no border.
    `.trevixal .trevixal-content { box-sizing: border-box !important; width: ${text}mm !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; outline: 0 !important; box-shadow: none !important; }`,
    `.trevixal .trevixal-content.${PAGINATED} { width: auto !important; background: none !important; }`,
    '@media screen { html, body { background: var(--tvx-color-surface, #eceef2) !important; } }',
    '.trevixal-pages { display: flex; flex-direction: column; align-items: center; gap: 8mm; padding: 8mm 0; }',
    '.trevixal-page { position: relative; flex: none; box-sizing: border-box; overflow: hidden; background: var(--tvx-color-bg, #fff); box-shadow: 0 1px 4px rgb(0 0 0 / 0.25); }',
    '.trevixal-page__body { position: absolute; box-sizing: border-box; overflow: visible; column-fill: auto; }',
    '.trevixal-page__header, .trevixal-page__footer { position: absolute; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; font-size: 9pt; color: var(--tvx-color-text-muted, #555); }',
    `.trevixal-page [${SPLIT}] { margin-bottom: 0 !important; padding-bottom: 0 !important; border-bottom: 0 !important; }`,
    `.trevixal-page [${CONTINUED}] { margin-top: 0 !important; padding-top: 0 !important; border-top: 0 !important; text-indent: 0 !important; }`,
    `.trevixal-page li[${CONTINUED}] { list-style-type: none; }`,
    `.trevixal-page [${CONTINUED}]::before { content: none !important; }`,
    `.trevixal-page :is(h1, h2, h3, h4, h5, h6)[${CONTINUED}] { counter-increment: none !important; }`,
    '@media print { .trevixal-pages { display: block; padding: 0; } .trevixal-page { box-shadow: none; break-after: page; } .trevixal-page:last-child { break-after: auto; } }',
  ].join('\n')
}
