import { type EditorNode, Fragment, type Schema, normalizeDoc } from '@trevixal/core'

/**
 * A PDF's text layer as a document: the words each page draws, gathered
 * into lines by where they sit, lines into paragraphs by the space between
 * them, and lines set markedly larger than the body read as headings. What
 * a PDF has no text for (a scan, a picture of a page) has nothing to give.
 *
 * The parsing is PDF.js's, fetched on demand as Mermaid is: a PDF is too
 * varied a format to read without a real parser, and most documents never
 * need one.
 */

/** One run of text PDF.js reports, and where on the page it sits. */
export interface PdfTextItem {
  readonly str: string
  /** `[a, b, c, d, e, f]`: `e`, `f` are its position; `d` its height, near enough. */
  readonly transform: readonly number[]
  readonly height?: number
  readonly hasEOL?: boolean
}

/** The slice of PDF.js this reader touches. */
export interface PdfJsLike {
  getDocument(source: { data: Uint8Array }): {
    readonly promise: Promise<{
      readonly numPages: number
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: readonly unknown[] }> }>
    }>
  }
  readonly GlobalWorkerOptions?: { workerSrc: string }
}

/** Where PDF.js comes from unless the host says. */
export const PDFJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs'
export const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs'

/** Load PDF.js from a CDN, or any ESM URL, the first time a PDF is opened. */
export async function loadPdfJs(
  url: string = PDFJS_CDN_URL,
  worker: string = PDFJS_WORKER_URL,
): Promise<PdfJsLike> {
  // The same two directives as `loadMermaid`: a runtime URL for the browser.
  const loaded = (await import(/* @vite-ignore */ /* webpackIgnore: true */ url)) as PdfJsLike
  if (typeof loaded.getDocument !== 'function') {
    throw new Error(`loadPdfJs: ${url} does not export PDF.js`)
  }
  if (loaded.GlobalWorkerOptions) loaded.GlobalWorkerOptions.workerSrc = worker
  return loaded
}

interface Line {
  readonly text: string
  readonly y: number
  readonly size: number
}

function isTextItem(value: unknown): value is PdfTextItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PdfTextItem).str === 'string' &&
    Array.isArray((value as PdfTextItem).transform)
  )
}

/** A page's runs as lines, top to bottom: runs on one baseline are one line. */
export function pageLines(items: readonly PdfTextItem[]): Line[] {
  const lines: { text: string; y: number; size: number }[] = []
  for (const item of items) {
    const y = item.transform[5] ?? 0
    const size = Math.abs(item.height ?? item.transform[3] ?? 0)
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - y) <= Math.max(2, size * 0.3)) {
      // A gap between runs on one line is a space, unless the run brings one.
      const joiner = last.text.endsWith(' ') || item.str.startsWith(' ') || !last.text ? '' : ' '
      last.text += joiner + item.str
      last.size = Math.max(last.size, size)
    } else if (item.str.trim()) {
      lines.push({ text: item.str, y, size })
    }
  }
  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text)
}

/** The most common line size on the pages: the body text's. */
function bodySize(lines: readonly Line[]): number {
  const counts = new Map<number, number>()
  for (const line of lines) {
    const size = Math.round(line.size)
    counts.set(size, (counts.get(size) ?? 0) + line.text.length)
  }
  let best = 0
  let most = -1
  for (const [size, count] of counts) {
    if (count > most) {
      best = size
      most = count
    }
  }
  return best || 12
}

/**
 * Lines as blocks: a paragraph runs on while the next line follows close
 * below it; a line half again the body's size or more is a heading on its own.
 */
export function linesToBlocks(schema: Schema, pages: readonly (readonly Line[])[]): EditorNode[] {
  const all = pages.flat()
  const body = bodySize(all)
  const blocks: EditorNode[] = []
  const paragraph = schema.nodeType('paragraph')
  const heading = schema.nodes.heading
  for (const lines of pages) {
    let run: string[] = []
    let previous: Line | null = null
    const flush = (): void => {
      if (run.length > 0)
        blocks.push(paragraph.create(undefined, Fragment.of(schema.text(run.join(' ')))))
      run = []
    }
    for (const line of lines) {
      const ratio = line.size / body
      if (heading && ratio >= 1.25 && line.text.length < 120) {
        flush()
        const level = ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : 3
        blocks.push(heading.create({ level }, Fragment.of(schema.text(line.text))))
        previous = null
        continue
      }
      const gap = previous ? previous.y - line.y : 0
      if (previous && gap > Math.max(line.size, previous.size) * 1.6) flush()
      // A hyphen at the end of a line joins the word it broke.
      const last = run[run.length - 1]
      if (last?.endsWith('-') && /^[a-z]/.test(line.text))
        run[run.length - 1] = last.slice(0, -1) + line.text
      else run.push(line.text)
      previous = line
    }
    flush()
  }
  return blocks
}

/** Read a PDF's text into a document of `schema`, through PDF.js. */
export async function parsePDF(schema: Schema, file: Blob, pdfjs: PdfJsLike): Promise<EditorNode> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages: Line[][] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    pages.push(pageLines(content.items.filter(isTextItem)))
  }
  const blocks = linesToBlocks(schema, pages)
  const content = blocks.length > 0 ? blocks : [schema.nodeType('paragraph').create()]
  return normalizeDoc(schema.topType.create(undefined, Fragment.from(content)))
}
