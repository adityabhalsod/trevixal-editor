/**
 * How a document is set on paper, as Word's Page Setup keeps it: the paper,
 * which way up, the margins, a header and a footer on every page (`{page}`
 * and `{pages}` stand for the page number and the page count), and a
 * watermark across each page. It is one document setting, stored as JSON,
 * so it travels with the file; the print, its preview, the page view and
 * the Word export all read it.
 */

/** Most text columns a document takes, as Word's Columns gallery offers them. */
export const MAX_COLUMNS = 3

/** A column count, clamped to 1 (the default) to {@link MAX_COLUMNS}. */
export function columnCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(MAX_COLUMNS, Math.max(1, Math.round(value)))
}

/** Paper a document can be set on, portrait, in millimetres. */
export const PAPER_SIZES = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  a5: { width: 148, height: 210 },
} as const

export type PaperSize = keyof typeof PAPER_SIZES

export type PageOrientation = 'portrait' | 'landscape'

export interface PageMargins {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface PageSetup {
  readonly size: PaperSize
  readonly orientation: PageOrientation
  /** In millimetres. */
  readonly margins: PageMargins
  /** Text at the top of every page; `{page}` and `{pages}` are filled in. */
  readonly header: string
  /** Text at the foot of every page, filled in as the header is. */
  readonly footer: string
  /** Words set large and faint across every page: "Draft". */
  readonly watermark: string
}

/** A4, upright, 20 mm all round: the page the print has always used. */
export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: 'a4',
  orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  header: '',
  footer: '',
  watermark: '',
}

/** The widest margin kept, in millimetres: past it there is no page left. */
export const MAX_PAGE_MARGIN = 100

/** The longest header or footer kept: one line of text. */
const PAGE_TEXT_MAX = 200

/** The longest watermark kept: a word or two, set large. */
const WATERMARK_MAX = 60

export function paperSize(value: unknown): PaperSize | null {
  return typeof value === 'string' && Object.hasOwn(PAPER_SIZES, value)
    ? (value as PaperSize)
    : null
}

export function pageOrientation(value: unknown): PageOrientation | null {
  return value === 'portrait' || value === 'landscape' ? value : null
}

/** A margin in millimetres, clamped to the page; null for anything that is not a number. */
export function pageMargin(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(MAX_PAGE_MARGIN, Math.max(0, value))
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').slice(0, max) : ''

/** A stored page setup's fields, or null for anything that is not one. */
function parsedSetup(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}

/** A document's page setup from its stored JSON: the defaults, where it says nothing usable. */
export function pageSetupOf(value: unknown): PageSetup {
  const stored = parsedSetup(value)
  if (!stored) return DEFAULT_PAGE_SETUP
  const margins = (stored.margins ?? {}) as Record<string, unknown>
  const fallback = DEFAULT_PAGE_SETUP.margins
  return {
    size: paperSize(stored.size) ?? DEFAULT_PAGE_SETUP.size,
    orientation: pageOrientation(stored.orientation) ?? DEFAULT_PAGE_SETUP.orientation,
    margins: {
      top: pageMargin(margins.top) ?? fallback.top,
      right: pageMargin(margins.right) ?? fallback.right,
      bottom: pageMargin(margins.bottom) ?? fallback.bottom,
      left: pageMargin(margins.left) ?? fallback.left,
    },
    header: text(stored.header, PAGE_TEXT_MAX),
    footer: text(stored.footer, PAGE_TEXT_MAX),
    watermark: text(stored.watermark, WATERMARK_MAX),
  }
}

/** A page setup as the document stores it: its JSON, every value checked. */
export function storedPageSetup(setup: PageSetup): string {
  return JSON.stringify(pageSetupOf(JSON.stringify(setup)))
}

/**
 * A document's stored page setup, checked, or null when it has none: one
 * never set up is printed on the default page, and goes to Word on the page
 * Word export has always used.
 */
export function pageSetupAttr(value: unknown): string | null {
  return parsedSetup(value) ? storedPageSetup(pageSetupOf(value)) : null
}

/**
 * A section's own page settings, from a section break's attributes: its
 * pages turned, set in columns, or with other margins (millimetres, all
 * four sides). Null takes the document's.
 */
export interface PageSection {
  readonly orientation: PageOrientation | null
  readonly columns: number | null
  readonly margin: number | null
}

export function pageSectionOf(attrs: Readonly<Record<string, unknown>>): PageSection {
  const columns = attrs.columns
  return {
    orientation: pageOrientation(attrs.orientation),
    columns: typeof columns === 'number' && Number.isFinite(columns) ? columnCount(columns) : null,
    margin: pageMargin(attrs.margin),
  }
}

/** A page's width and height in millimetres, turned for landscape. */
export function pageDimensions(
  size: PaperSize,
  orientation: PageOrientation,
): { width: number; height: number } {
  const { width, height } = PAPER_SIZES[size]
  return orientation === 'landscape' ? { width: height, height: width } : { width, height }
}

/** A header's or footer's text and page fields, in order. */
export type PageTemplatePart = { readonly text: string } | { readonly field: 'page' | 'pages' }

export function pageTemplateParts(template: string): PageTemplatePart[] {
  const parts: PageTemplatePart[] = []
  for (const piece of template.split(/(\{pages?\})/)) {
    if (piece === '{page}') parts.push({ field: 'page' })
    else if (piece === '{pages}') parts.push({ field: 'pages' })
    else if (piece !== '') parts.push({ text: piece })
  }
  return parts
}

/** A header or footer as it reads on page `page` of `pages`. */
export function fillPageTemplate(template: string, page: number, pages: number): string {
  return pageTemplateParts(template)
    .map((part) => ('text' in part ? part.text : String(part.field === 'page' ? page : pages)))
    .join('')
}
