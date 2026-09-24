import {
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type Schema,
  blocksInRange,
  insertContent,
  nodeFromJSON,
  normalizeDoc,
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

/** HTML (standalone page), Markdown, plain text and the native JSON. */
export function builtinExporters(options: BuiltinExporterOptions = {}): DocumentExporter[] {
  return [
    {
      name: 'html',
      label: 'Web page (.html)',
      extension: 'html',
      mime: 'text/html',
      serialize: (doc, context) =>
        serializeToHTMLDocument(doc, {
          title: context.title,
          inlineCSS: options.styles?.(),
          inlineJS: (options.scripts ?? documentBehaviourScript)(),
          theme: context.theme,
          ...(context.rendered ? { renderNode: renderedNodeHTML(context.rendered) } : {}),
        }),
    },
    {
      name: 'markdown',
      label: 'Markdown (.md)',
      extension: 'md',
      mime: 'text/markdown',
      serialize: (doc) => serializeToMarkdown(doc),
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
  const doc = options.selectionOnly ? selectionDocument(editor.state) : editor.state.doc
  const title = options.title ?? documentTitle(editor.state.doc)
  const theme = options.theme ?? editorTheme(editor)
  // Rasterized here rather than in the capture: turning an SVG into a bitmap
  // is asynchronous, and the print path below has to stay synchronous.
  const rendered = await rasterizeDiagrams(captureRenderedBlocks(editor), document)
  const data = await exporter.serialize(doc, { schema: editor.schema, title, theme, rendered })
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
export async function importFile(
  editor: Editor,
  file: File,
  importers: readonly DocumentImporter[],
  options: ImportOptions = {},
): Promise<boolean> {
  const importer = importerFor(file, importers)
  if (!importer) return false
  const doc = await importer.parse(file, {
    schema: editor.schema,
    document: editor.view?.dom.ownerDocument,
  })
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
}

/**
 * The printed text's width when the print is measured before it prints (its
 * lines numbered, its tabs set at their stops): A4 less 20 mm margins, which
 * fits Letter too. A print is laid out afresh at whatever width the page
 * gives it, so lines or tabs measured at any other width would not be the
 * paper's. Fixing both is what makes them agree.
 */
const PRINTED_WIDTH = '170mm'

/** Room beside the text for the numbers, inside the printed area: a page's margin clips what is drawn in it. */
const LINE_NUMBER_GUTTER = '12mm'

const MEASURED_PAGE = [
  '@page { margin: 20mm; }',
  `.trevixal .trevixal-content { box-sizing: border-box !important; width: ${PRINTED_WIDTH} !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }`,
].join('\n')

const LINE_NUMBERED_PAGE = [
  // The settings' element carries the direction, so the gutter is on the side the text starts from.
  `.trevixal .trevixal-content > [data-trevixal-document] { padding-inline-start: ${LINE_NUMBER_GUTTER} !important; }`,
  // Each number hangs off the first character of its line (see `numberLinesIn`), out in the gutter.
  '.trevixal-line-anchor { position: relative; }',
  '.trevixal-line-anchor > .trevixal-line-number { position: absolute; top: 50%; transform: translateY(-50%); line-height: 1; white-space: nowrap; }',
  "[data-line-numbers-side='left'] .trevixal-line-anchor > .trevixal-line-number { right: calc(100% + var(--trevixal-line-offset) + 3mm); }",
  "[data-line-numbers-side='right'] .trevixal-line-anchor > .trevixal-line-number { left: calc(100% + var(--trevixal-line-offset) + 3mm); }",
].join('\n')

/** Whether a document numbers its lines, so its print has to be set up to match. */
function numbersLines(editor: Editor): boolean {
  return editor.state.doc.attrs.lineNumbers === true
}

/** Whether a print is measured before it prints, so it has to be at the printed width: lines to number, or tabs to set. */
function measuresPrint(editor: Editor): boolean {
  return numbersLines(editor) || editor.state.doc.textContent.includes('\t')
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
 * its lines, at the printed width.
 */
function layoutFrame(frame: HTMLIFrameElement, lineNumbers: boolean): void {
  const content = frame.contentDocument?.querySelector<HTMLElement>('.trevixal-content')
  if (!content) return
  repeatHeaderRowsIn(content)
  layoutTabsIn(content, true)
  if (lineNumbers) numberLinesIn(content)
}

/** The standalone HTML a print job or preview renders. */
export function printableHTML(editor: Editor, options: PrintOptions = {}): string {
  // The SVG the editor drew goes straight in, so nothing here has to wait on
  // a bitmap: printing happens inside a click and cannot be asynchronous.
  const rendered = captureRenderedBlocks(editor)
  const styles = options.styles?.()
  const page = [
    measuresPrint(editor) ? MEASURED_PAGE : '',
    numbersLines(editor) ? LINE_NUMBERED_PAGE : '',
  ].filter(Boolean)
  return serializeToHTMLDocument(editor.state.doc, {
    title: options.title ?? documentTitle(editor.state.doc),
    inlineCSS: page.length > 0 ? [styles ?? '', ...page].join('\n') : styles,
    ...(rendered.size > 0 ? { renderNode: renderedNodeHTML(rendered) } : {}),
    // A print preview showing white while the editor behind it is dark reads
    // as the preview being broken, and "Export as PDF" is this same page.
    theme: options.theme ?? editorTheme(editor),
  })
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
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.style.opacity = '0'
  const lineNumbers = numbersLines(editor)
  if (measuresPrint(editor)) {
    // Laid out at the printed width, off to one side, so the lines and tabs
    // measured here are the ones the paper gets.
    frame.style.width = PRINTED_WIDTH
    frame.style.height = '100px'
    frame.style.left = '-10000px'
    frame.style.pointerEvents = 'none'
  }
  frame.srcdoc = printableHTML(editor, options)
  frame.addEventListener('load', () => {
    try {
      layoutFrame(frame, lineNumbers)
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
  const lineNumbers = numbersLines(editor)
  frame.addEventListener('load', () => layoutFrame(frame, lineNumbers))

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
