import {
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type Schema,
  blocksInRange,
  escapeHTML,
  insertContent,
  nodeFromJSON,
  normalizeDoc,
  pageDimensions,
  pageSetupOf,
  parseHTML,
  parseMarkdown,
  serializeToHTMLDocument,
  serializeToMarkdown,
  serializeToText,
  sliceInline,
  textblocks,
} from '@trevixal/core'
import {
  type RenderedDocument,
  captureRenderedBlocks,
  rasterizeDiagrams,
  renderedNodeHTML,
} from './export-render'
import { documentBehaviourScript } from './export-script'
import { numberLinesIn } from './line-numbers'
import { pageLayoutCSS, paginate } from './page-layout'
import { layoutTabsIn } from './tab-layout'
import { type ThemeSnapshot, readThemeSnapshot } from './theming'

/**
 * File-level actions for the File menu: open, save, download in a format,
 * export the selection, print and print preview. Formats are pluggable so an
 * extension can add DOCX or RTF without this package knowing about them.
 */

/** Turns a document into bytes for download. `serialize` may be async. */
export interface DocumentExporter {
  /** Stable id, e.g. `'docx'`. */
  readonly name: string
  /** Menu label, e.g. `'Word document (.docx)'`. */
  readonly label: string
  /** File extension without the dot. */
  readonly extension: string
  readonly mime: string
  serialize(
    doc: EditorNode,
    context: ExportContext,
  ): string | Uint8Array | Promise<string | Uint8Array>
}

export interface ExportContext {
  readonly schema: Schema
  /** Document title, for formats that carry one (also the suggested file name). */
  readonly title: string
  /**
   * The palette the editor is rendering in, for the formats that carry
   * colour. {@link exportDocument} fills it in from the live editor; it is
   * absent when a document is serialized outside a browser.
   */
  readonly theme?: ThemeSnapshot
  /**
   * What the editor drew that the document does not hold, highlighted code
   * and rendered diagrams. Filled in by {@link exportDocument} the same way.
   */
  readonly rendered?: RenderedDocument
}

/** Reads a file the user picked into a document the editor can load. */
export interface DocumentImporter {
  readonly name: string
  readonly label: string
  /** Lowercase extensions without the dot. */
  readonly extensions: readonly string[]
  parse(file: File, context: ImportContext): Promise<EditorNode>
}

export interface ImportContext {
  readonly schema: Schema
  readonly document?: Document
}

export interface BuiltinExporterOptions {
  /** CSS inlined into the standalone HTML export, so the file opens styled. */
  readonly styles?: () => string
  /**
   * JavaScript inlined into the standalone HTML export. Defaults to
   * {@link documentBehaviourScript}, which is what makes a tab strip
   * switchable in a saved file. Pass `() => ''` for a page carrying no script.
   */
  readonly scripts?: () => string
}

/** Bytes as base64, for a `data:` URL. */
function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

/** What a page loads from elsewhere, as data: the picture or the stylesheet itself. */
async function fetched(
  url: string,
  fetcher: typeof fetch,
): Promise<{ type: string; bytes: Uint8Array } | null> {
  try {
    const response = await fetcher(url)
    if (!response.ok) return null
    const type =
      response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
    return { type, bytes: new Uint8Array(await response.arrayBuffer()) }
  } catch {
    return null
  }
}

/**
 * A page that needs nothing else: its pictures as `data:` URLs and its
 * stylesheets written into it, so the one file opens anywhere, offline, the
 * same. What cannot be fetched stays a link, and the page still opens.
 */
export async function inlinePageResources(
  html: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const sources = new Set<string>()
  for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    const src = (match[1] as string).replace(/&amp;/g, '&')
    if (!src.startsWith('data:')) sources.add(src)
  }
  const images = new Map<string, string>()
  for (const src of sources) {
    const got = await fetched(src, fetcher)
    if (got?.type.startsWith('image/'))
      images.set(src, `data:${got.type};base64,${base64Of(got.bytes)}`)
  }
  let out = html.replace(
    /(<img\b[^>]*\bsrc=")([^"]+)(")/g,
    (whole, open: string, src: string, close: string) => {
      const inlined = images.get(src.replace(/&amp;/g, '&'))
      return inlined ? `${open}${inlined}${close}` : whole
    },
  )
  const sheets = [...out.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]
  for (const match of sheets) {
    const got = await fetched((match[1] as string).replace(/&amp;/g, '&'), fetcher)
    if (!got) continue
    const css = new TextDecoder().decode(got.bytes).replace(/<\/style/gi, '<\\/style')
    out = out.replace(match[0], `<style>${css}</style>`)
  }
  return out
}

/** HTML (standalone page), Markdown, plain text and the native JSON. */
export function builtinExporters(options: BuiltinExporterOptions = {}): DocumentExporter[] {
  const page = (doc: EditorNode, context: ExportContext): string =>
    serializeToHTMLDocument(doc, {
      title: context.title,
      inlineCSS: options.styles?.(),
      inlineJS: (options.scripts ?? documentBehaviourScript)(),
      theme: context.theme,
      ...(context.rendered ? { renderNode: renderedNodeHTML(context.rendered) } : {}),
    })
  return [
    {
      name: 'html',
      label: 'Web page (.html)',
      extension: 'html',
      mime: 'text/html',
      serialize: page,
    },
    {
      name: 'htmlSingle',
      label: 'Web page, one file (.html)',
      extension: 'html',
      mime: 'text/html',
      serialize: (doc, context) => inlinePageResources(page(doc, context)),
    },
    {
      name: 'markdown',
      label: 'Markdown (.md)',
      extension: 'md',
      mime: 'text/markdown',
      serialize: (doc) => serializeToMarkdown(doc),
    },
    {
      name: 'mdx',
      label: 'MDX (.mdx)',
      extension: 'mdx',
      mime: 'text/mdx',
      serialize: (doc) => serializeToMarkdown(doc, { mdx: true }),
    },
    {
      name: 'text',
      label: 'Plain text (.txt)',
      extension: 'txt',
      mime: 'text/plain',
      serialize: (doc) => serializeToText(doc),
    },
    {
      name: 'json',
      label: 'Trevixal JSON (.json)',
      extension: 'json',
      mime: 'application/json',
      serialize: (doc) => JSON.stringify(doc.toJSON(), null, 2),
    },
  ]
}

/** The importers matching {@link builtinExporters}. */
export function builtinImporters(): DocumentImporter[] {
  return [
    {
      name: 'html',
      label: 'Web page (.html)',
      extensions: ['html', 'htm'],
      parse: async (file, context) =>
        parseHTML(context.schema, await readFileText(file), context.document),
    },
    {
      name: 'markdown',
      label: 'Markdown (.md)',
      extensions: ['md', 'markdown'],
      parse: async (file, context) => parseMarkdown(await readFileText(file), context.schema),
    },
    {
      name: 'mdx',
      label: 'MDX (.mdx)',
      extensions: ['mdx'],
      parse: async (file, context) =>
        parseMarkdown(await readFileText(file), context.schema, { mdx: true }),
    },
    {
      name: 'text',
      label: 'Plain text (.txt)',
      extensions: ['txt'],
      parse: async (file, context) => textToDocument(context.schema, await readFileText(file)),
    },
    {
      name: 'json',
      label: 'Trevixal JSON (.json)',
      extensions: ['json'],
      parse: async (file, context) => {
        const parsed: unknown = JSON.parse(await readFileText(file))
        // Accept a bare document or a saved record wrapping one.
        const json =
          parsed && typeof parsed === 'object' && 'doc' in parsed
            ? (parsed as { doc: unknown }).doc
            : parsed
        return normalizeDoc(
          nodeFromJSON(context.schema, json as Parameters<typeof nodeFromJSON>[1]),
        )
      },
    },
  ]
}

/** Plain text becomes one paragraph per line, blank lines included. */
export function textToDocument(schema: Schema, text: string): EditorNode {
  const paragraph = schema.firstTextblockType()
  const blocks = text
    .split(/\r?\n/)
    .map((line) =>
      paragraph.create(undefined, line ? Fragment.of(schema.text(line)) : Fragment.empty),
    )
  return normalizeDoc(schema.topType.create(undefined, Fragment.from(blocks)))
}

export function readFileText(file: Blob): Promise<string> {
  if ('text' in file && typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsText(file)
  })
}

/** The document's title: its first heading, else the first words, else a default. */
export function documentTitle(doc: EditorNode, fallback = 'Document'): string {
  for (const { node } of textblocks(doc)) {
    if (node.type.name === 'heading' && node.textContent.trim()) return node.textContent.trim()
  }
  for (const { node } of textblocks(doc)) {
    const text = node.textContent.trim()
    if (text) return text.length > 60 ? `${text.slice(0, 57)}…` : text
  }
  return fallback
}

/** Characters no common file system accepts in a name. */
const FORBIDDEN_IN_FILENAME = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

/** Long enough for the click to have started the download before the URL goes. */
const OBJECT_URL_LIFETIME_MS = 1000

/**
 * A file-system-safe name from a title: `Quarterly report.md`.
 *
 * Filtering by code point rather than with a regular expression keeps the
 * control range out without putting control characters in the source. Trailing
 * dots and spaces go too: Windows silently drops them, so `Report. ` would
 * otherwise become `Report..md` here and `Report.md` once saved.
 */
export function suggestFileName(title: string, extension: string): string {
  const base = [...title]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return !FORBIDDEN_IN_FILENAME.has(char) && code > 0x1f && code !== 0x7f
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/, '')
  return `${base || 'document'}.${extension}`
}

export interface DownloadOptions {
  readonly name: string
  readonly mime: string
  readonly data: string | Uint8Array | Blob
}

/** Hand the browser a file to save, through a temporary object URL. */
export function downloadFile(document: Document, options: DownloadOptions): void {
  const blob =
    options.data instanceof Blob
      ? options.data
      : new Blob([options.data as BlobPart], { type: options.mime })
  const win = document.defaultView
  const url = (win?.URL ?? URL).createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => (win?.URL ?? URL).revokeObjectURL(url), OBJECT_URL_LIFETIME_MS)
}

/**
 * A document holding just the selected content: whole blocks for a
 * multi-block selection, and the selected slice of a block at either end.
 * With nothing selected the whole document is returned.
 */
export function selectionDocument(state: EditorState): EditorNode {
  const selection = state.selection
  if (selection.empty) return state.doc
  const blocks = blocksInRange(state.doc, selection.from, selection.to)
    .filter((block) => block.node.isTextblock)
    .map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)))
  if (blocks.length === 0) return state.doc
  return normalizeDoc(state.schema.topType.create(undefined, Fragment.from(blocks)))
}

export interface ExportOptions {
  /** Export the selection instead of the whole document. */
  readonly selectionOnly?: boolean
  /** Title override; the first heading by default. */
  readonly title?: string
  /** Palette override; the one the editor is rendering in by default. */
  readonly theme?: ThemeSnapshot
  /**
   * The document as it goes out, from the document as it is: conditional
   * content settled by its variables, say.
   */
  readonly transform?: (doc: EditorNode) => EditorNode
  /**
   * Write the file somewhere else, off the main thread, say. Null (or no
   * option) leaves it to the exporter here, as for a format that needs the
   * page's DOM.
   */
  readonly serialize?: (
    exporter: DocumentExporter,
    doc: EditorNode,
    context: ExportContext,
  ) => Promise<string | Uint8Array> | null
}

/**
 * The palette the editor is painting itself with, or undefined where there is
 * no view to read one from. A headless export, or a test DOM.
 */
export function editorTheme(editor: Editor): ThemeSnapshot | undefined {
  const dom = editor.view?.dom
  return dom ? readThemeSnapshot(dom) : undefined
}

/** Serialize with an exporter and download the result. */
export async function exportDocument(
  editor: Editor,
  exporter: DocumentExporter,
  document: Document,
  options: ExportOptions = {},
): Promise<void> {
  const readerCopy = (source: EditorNode): EditorNode => options.transform?.(source) ?? source
  const doc = readerCopy(options.selectionOnly ? selectionDocument(editor.state) : editor.state.doc)
  // The title names the file, so it comes from the copy going out too: a
  // heading with redacted words in it must not put them in the file name.
  const title =
    options.title ?? documentTitle(options.selectionOnly ? readerCopy(editor.state.doc) : doc)
  const theme = options.theme ?? editorTheme(editor)
  // Rasterized here rather than in the capture: turning an SVG into a bitmap
  // is asynchronous, and the print path below has to stay synchronous.
  const rendered = await rasterizeDiagrams(captureRenderedBlocks(editor), document)
  const context: ExportContext = { schema: editor.schema, title, theme, rendered }
  const data = await (options.serialize?.(exporter, doc, context) ??
    exporter.serialize(doc, context))
  downloadFile(document, {
    name: suggestFileName(title, exporter.extension),
    mime: exporter.mime,
    data,
  })
}

/** Open the OS file picker; resolves with the chosen file, or null. */
export function pickFile(document: Document, accept?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.style.display = 'none'
    let settled = false
    const finish = (file: File | null): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    // No `cancel` event in older engines: a focus return with no file means cancelled.
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
}

/** The importer for a file, by extension first and MIME type second. */
export function importerFor(
  file: File,
  importers: readonly DocumentImporter[],
): DocumentImporter | null {
  // Only a real dot separates an extension: a file named `md` has none, and
  // a dotfile like `.md` is all name.
  const dot = file.name.lastIndexOf('.')
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  const byExtension = importers.find((importer) => importer.extensions.includes(extension))
  if (byExtension) return byExtension
  const mime = file.type.toLowerCase()
  const byMime: Record<string, string> = {
    'text/html': 'html',
    'text/markdown': 'markdown',
    'text/plain': 'text',
    'application/json': 'json',
  }
  const name = byMime[mime]
  return name ? (importers.find((importer) => importer.name === name) ?? null) : null
}

export interface ImportOptions {
  /** Replace the document (default) or insert at the caret. */
  readonly mode?: 'replace' | 'insert'
}

/**
 * Load a file into the editor. Replacing is recorded as one undoable step, so
 * an accidental import is a Ctrl+Z away. Returns false when no importer
 * understands the file.
 */
/** A file read as a document by whichever importer takes its type; null when none does. */
export async function readDocumentFile(
  file: File,
  importers: readonly DocumentImporter[],
  context: ImportContext,
): Promise<EditorNode | null> {
  const importer = importerFor(file, importers)
  return importer ? importer.parse(file, context) : null
}

export async function importFile(
  editor: Editor,
  file: File,
  importers: readonly DocumentImporter[],
  options: ImportOptions = {},
): Promise<boolean> {
  const doc = await readDocumentFile(file, importers, {
    schema: editor.schema,
    document: editor.view?.dom.ownerDocument,
  })
  if (!doc) return false
  if (options.mode === 'insert') {
    return editor.exec(insertContent(doc.content.children))
  }
  editor.setContent(doc, { addToHistory: true })
  return true
}

/** The `accept` attribute covering a set of importers. */
export function acceptFor(importers: readonly DocumentImporter[]): string {
  return importers
    .flatMap((importer) => importer.extensions.map((extension) => `.${extension}`))
    .join(',')
}

export interface PrintOptions {
  readonly title?: string
  /** CSS inlined into the printed page; pass the kit's collected styles. */
  readonly styles?: () => string
  /** Palette override; the one the editor is rendering in by default. */
  readonly theme?: ThemeSnapshot
  /** The document as it prints, from the document as it is: redactions blacked out, say. */
  readonly transform?: (doc: EditorNode) => EditorNode
  /** Words set large and faint across every printed page: "Confidential". */
  readonly watermark?: string
}

/** A watermark repeated on every page: fixed, so print sets it on each one. */
const WATERMARK_CSS =
  '.trevixal-watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2147483647; font: 700 56px/1.2 system-ui, sans-serif; color: rgba(128, 128, 128, 0.2); transform: rotate(-30deg); white-space: nowrap; }'

const LINE_NUMBERED_PAGE = [
  // Each number hangs off the first character of its line (see `numberLinesIn`),
  // out in the page's margin, which the page box holds and so does not clip.
  '.trevixal-line-anchor { position: relative; }',
  '.trevixal-line-anchor > .trevixal-line-number { position: absolute; top: 50%; transform: translateY(-50%); line-height: 1; white-space: nowrap; }',
  "[data-line-numbers-side='left'] .trevixal-line-anchor > .trevixal-line-number { right: calc(100% + var(--trevixal-line-offset) + 3mm); }",
  "[data-line-numbers-side='right'] .trevixal-line-anchor > .trevixal-line-number { left: calc(100% + var(--trevixal-line-offset) + 3mm); }",
].join('\n')

/** The document as it prints: the reader's copy, when the host makes one. */
function printedDocument(editor: Editor, options: PrintOptions): EditorNode {
  return options.transform ? options.transform(editor.state.doc) : editor.state.doc
}

/**
 * Word's Repeat Header Rows, in print, as the Word export already has it: a
 * browser heads every page a table runs onto with its `thead`, so each
 * table's header row moves into one. Only the printed copy changes; the
 * editor keeps a table's rows together, as the document does.
 */
export function repeatHeaderRowsIn(root: ParentNode): void {
  const childrenNamed = (parent: Element, tag: string): Element[] =>
    [...parent.children].filter((child) => child.tagName === tag)
  for (const table of root.querySelectorAll('table')) {
    if (childrenNamed(table, 'THEAD').length > 0) continue
    // The parser a print page goes through puts the rows in a `tbody`.
    const body = childrenNamed(table, 'TBODY')[0] ?? table
    const first = childrenNamed(body, 'TR')[0]
    const cells = first ? [...first.children] : []
    if (!first || cells.length === 0 || !cells.every((cell) => cell.tagName === 'TH')) continue
    const head = table.ownerDocument.createElement('thead')
    head.appendChild(first)
    table.insertBefore(head, table.firstChild)
  }
}

/**
 * Lay out a loaded print frame as its print will be: its header rows made
 * to repeat, its tabs at their stops, then, when the document numbers them,
 * its lines, at the printed width; then all of it set as pages.
 */
function layoutFrame(frame: HTMLIFrameElement, doc: EditorNode): void {
  const content = frame.contentDocument?.querySelector<HTMLElement>('.trevixal-content')
  if (!content) return
  repeatHeaderRowsIn(content)
  layoutTabsIn(content, true)
  if (doc.attrs.lineNumbers === true) numberLinesIn(content)
  paginate(content, {
    setup: pageSetupOf(doc.attrs.pageSetup),
    widowControl: doc.attrs.widowControl !== false,
  })
}

/** The standalone HTML a print job or preview renders. */
export function printableHTML(editor: Editor, options: PrintOptions = {}): string {
  // The SVG the editor drew goes straight in, so nothing here has to wait on
  // a bitmap: printing happens inside a click and cannot be asynchronous.
  const rendered = captureRenderedBlocks(editor)
  const styles = options.styles?.()
  const doc = printedDocument(editor, options)
  const setup = pageSetupOf(doc.attrs.pageSetup)
  // The print's own watermark (a protected document's), or the document's.
  const watermark = options.watermark ?? (setup.watermark || undefined)
  const page = [
    pageLayoutCSS(setup),
    doc.attrs.lineNumbers === true ? LINE_NUMBERED_PAGE : '',
    watermark ? WATERMARK_CSS : '',
  ].filter(Boolean)
  const html = serializeToHTMLDocument(doc, {
    title: options.title ?? documentTitle(doc),
    inlineCSS: [styles ?? '', ...page].join('\n'),
    ...(rendered.size > 0 ? { renderNode: renderedNodeHTML(rendered) } : {}),
    // A print preview showing white while the editor behind it is dark reads
    // as the preview being broken, and "Export as PDF" is this same page.
    theme: options.theme ?? editorTheme(editor),
  })
  // A picture that waits to near the screen never loads in a print frame,
  // which has no screen to near: every picture on paper is fetched at once.
  const eager = html.replaceAll(' loading="lazy"', '')
  if (!watermark) return eager
  const mark = `<div class="trevixal-watermark" aria-hidden="true">${escapeHTML(watermark)}</div>`
  return eager.includes('</body>') ? eager.replace('</body>', `${mark}</body>`) : eager + mark
}

/**
 * Print the document alone, not the page around it, through a hidden
 * iframe. The browser's dialog offers "Save as PDF", which is what "Export
 * as PDF" means in every web editor.
 */
export function printDocument(
  editor: Editor,
  document: Document,
  options: PrintOptions = {},
): void {
  const frame = document.createElement('iframe')
  frame.className = 'trevixal-print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.border = '0'
  frame.style.opacity = '0'
  const doc = printedDocument(editor, options)
  const setup = pageSetupOf(doc.attrs.pageSetup)
  // Laid out at the page's width, off to one side, so the lines, tabs and
  // pages measured here are the ones the paper gets.
  frame.style.width = `${pageDimensions(setup.size, setup.orientation).width}mm`
  frame.style.height = '100px'
  frame.style.left = '-10000px'
  frame.style.pointerEvents = 'none'
  frame.srcdoc = printableHTML(editor, options)
  frame.addEventListener('load', () => {
    try {
      layoutFrame(frame, doc)
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      // Printing needs a real window; a test DOM has none. Nothing to do.
    }
    setTimeout(() => frame.remove(), 60_000)
  })
  document.body.appendChild(frame)
}

/**
 * Show the document as it will print, in a modal with a Print button. The
 * "print preview" of desktop editors, rendered by the browser itself.
 */
export function openPrintPreview(
  editor: Editor,
  document: Document,
  options: PrintOptions = {},
): Promise<void> {
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--preview trevixal-print-preview'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Print preview')

  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = 'Print preview'
  const frame = document.createElement('iframe')
  frame.className = 'trevixal-print-preview__frame'
  frame.title = 'Print preview'
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.srcdoc = printableHTML(editor, options)
  const doc = printedDocument(editor, options)
  frame.addEventListener('load', () => layoutFrame(frame, doc))

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'trevixal-dialog__button'
  close.textContent = 'Close'
  const print = document.createElement('button')
  print.type = 'button'
  print.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  print.textContent = 'Print…'
  actions.append(close, print)
  dialog.append(heading, frame, actions)
  overlay.appendChild(dialog)
  // A modal takes focus; closing it must give focus back rather than leave it
  // on a removed element, which drops the caret to the top of the page.
  const previouslyFocused = document.activeElement as HTMLElement | null
  document.body.appendChild(overlay)

  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.()
      resolve()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    close.addEventListener('click', finish)
    print.addEventListener('click', () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        // See printDocument.
      }
    })
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })
    print.focus()
  })
}
