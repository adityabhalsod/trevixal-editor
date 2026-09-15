import {
  type Attrs,
  type EditorNode,
  Fragment,
  type Mark,
  type Schema,
  normalizeDoc,
} from '@trevixal/core'
import { type RGB, highlightColor, toCSSHex } from './color'
import { NODE, base64Encode, mimeForExtension } from './shared'
import { EMU_PER_PX } from './units'
import { type XmlElement, parseXML } from './xml'
import { ArchiveError } from './zip'
import { readZip } from './zip'

export interface DOCXImportOptions {
  /**
   * `embed` (the default) inlines every `word/media` part as a `data:` URL;
   * `skip` drops images entirely, which keeps the resulting document small
   * when only its text matters.
   */
  readonly images?: 'embed' | 'skip'
}

/** Twips per indent step / list level (0.5in), matching the writer. */
const INDENT = 720

/** The formats Word calls a number rather than a bullet. */
const ORDERED_FORMATS = new Set([
  'decimal',
  'decimalzero',
  'lowerletter',
  'upperletter',
  'lowerroman',
  'upperroman',
])

const DEFAULT_HIGHLIGHT: RGB = { r: 255, g: 255, b: 0 }

const decoder = new TextDecoder()

interface NumberFormat {
  readonly ordered: boolean
  readonly start: number
}

interface Numbering {
  readonly level: number
  readonly format: NumberFormat
}

interface Reader {
  readonly schema: Schema
  /** Paragraph style id → heading level. */
  readonly headings: ReadonlyMap<string, number>
  /** `w:numId` → one {@link NumberFormat} per `w:ilvl`. */
  readonly numbering: ReadonlyMap<string, readonly NumberFormat[]>
  /** Relationship id → target, for hyperlinks and external images. */
  readonly links: ReadonlyMap<string, string>
  /** Relationship id → `data:` URL of an embedded media part. */
  readonly images: ReadonlyMap<string, string>
  readonly supportsLists: boolean
  readonly supportsTables: boolean
  /** Whether this schema's `image` node may sit inside a textblock. */
  readonly inlineImages: boolean
}

/**
 * Read an Office Open XML (`.docx`) package into a document for `schema`.
 * Only the parts a Trevixal document can represent are mapped, and anything
 * unrecognised is skipped rather than raising: an import that loses a footnote
 * is far more useful than one that refuses the file.
 */
export async function parseDOCX(
  schema: Schema,
  data: ArrayBuffer | Uint8Array | Blob,
  options: DOCXImportOptions = {},
): Promise<EditorNode> {
  const parts = await readZip(await toBytes(data))
  const document = partXML(parts, 'word/document.xml')
  if (!document) throw new ArchiveError('Not a DOCX package: word/document.xml is missing')

  const relationships = readRelationships(partXML(parts, 'word/_rels/document.xml.rels'))
  const reader: Reader = {
    schema,
    headings: readHeadingStyles(partXML(parts, 'word/styles.xml')),
    numbering: readNumbering(partXML(parts, 'word/numbering.xml')),
    links: linkTargets(relationships),
    images:
      options.images === 'skip' || !schema.nodes[NODE.image]
        ? new Map()
        : mediaURLs(relationships, parts),
    supportsLists: Boolean(schema.nodes[NODE.listItem]),
    supportsTables: Boolean(
      schema.nodes[NODE.table] && schema.nodes[NODE.tableRow] && schema.nodes[NODE.tableCell],
    ),
    inlineImages: schema.nodes[NODE.image]?.isInline === true,
  }

  const body = document.child('w:body') ?? document
  const sink = new BlockSink(reader)
  visitBlocks(body.elements(), reader, sink)
  return normalizeDoc(schema.topType.create(undefined, Fragment.from(sink.finish())))
}

async function toBytes(data: ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(await data.arrayBuffer())
}

function partXML(parts: ReadonlyMap<string, Uint8Array>, name: string): XmlElement | null {
  const bytes = parts.get(name)
  if (!bytes) return null
  try {
    return parseXML(decoder.decode(bytes))
  } catch {
    return null
  }
}

// --- package metadata -------------------------------------------------------

interface Relationship {
  readonly type: string
  readonly target: string
  readonly external: boolean
}

function readRelationships(root: XmlElement | null): ReadonlyMap<string, Relationship> {
  const out = new Map<string, Relationship>()
  if (!root) return out
  for (const element of root.findAll('Relationship')) {
    const id = element.attr('Id')
    const target = element.attr('Target')
    if (!id || !target) continue
    const type = (element.attr('Type') ?? '').split('/').pop() ?? ''
    out.set(id, { type, target, external: element.attr('TargetMode') === 'External' })
  }
  return out
}

function linkTargets(
  relationships: ReadonlyMap<string, Relationship>,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>()
  for (const [id, relationship] of relationships) {
    if (relationship.type !== 'image') out.set(id, relationship.target)
  }
  return out
}

/** Resolve a relationship target against the `word/` part it was declared in. */
function resolvePart(target: string): string {
  const path = target.startsWith('/') ? target.slice(1) : `word/${target}`
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

function mediaURLs(
  relationships: ReadonlyMap<string, Relationship>,
  parts: ReadonlyMap<string, Uint8Array>,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>()
  for (const [id, relationship] of relationships) {
    if (relationship.type !== 'image' || relationship.external) continue
    const bytes = parts.get(resolvePart(relationship.target))
    if (!bytes) continue
    const extension = relationship.target.split('.').pop() ?? ''
    out.set(id, `data:${mimeForExtension(extension)};base64,${base64Encode(bytes)}`)
  }
  return out
}

function readHeadingStyles(root: XmlElement | null): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  if (!root) return out
  for (const style of root.findAll('w:style')) {
    const id = style.attr('w:styleId')
    if (!id) continue
    const name = (style.child('w:name')?.attr('w:val') ?? '').trim()
    const heading = /^heading\s*(\d)/i.exec(name)
    if (heading) out.set(id, clampLevel(Number.parseInt(heading[1] as string, 10)))
    else if (/^title$/i.test(name)) out.set(id, 1)
  }
  return out
}

/** A style id's heading level, falling back to the `Heading2` naming convention. */
function styleLevel(reader: Reader, styleId: string | undefined): number | null {
  if (!styleId) return null
  const mapped = reader.headings.get(styleId)
  if (mapped !== undefined) return mapped
  const match = /^heading\s*(\d)$/i.exec(styleId)
  if (match) return clampLevel(Number.parseInt(match[1] as string, 10))
  return /^title$/i.test(styleId) ? 1 : null
}

function clampLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(6, Math.max(1, level)) : 1
}

function readNumbering(root: XmlElement | null): ReadonlyMap<string, readonly NumberFormat[]> {
  const out = new Map<string, readonly NumberFormat[]>()
  if (!root) return out

  const abstracts = new Map<string, NumberFormat[]>()
  for (const element of root.childrenNamed('w:abstractNum')) {
    const id = element.attr('w:abstractNumId')
    if (!id) continue
    const levels: NumberFormat[] = []
    for (const lvl of element.childrenNamed('w:lvl')) {
      const index = integer(lvl.attr('w:ilvl')) ?? levels.length
      const format = (lvl.child('w:numFmt')?.attr('w:val') ?? 'bullet').trim().toLowerCase()
      levels[index] = {
        ordered: ORDERED_FORMATS.has(format),
        start: integer(lvl.child('w:start')?.attr('w:val')) ?? 1,
      }
    }
    abstracts.set(id, levels)
  }

  for (const element of root.childrenNamed('w:num')) {
    const id = element.attr('w:numId')
    if (!id) continue
    const levels = [...(abstracts.get(element.child('w:abstractNumId')?.attr('w:val') ?? '') ?? [])]
    for (const override of element.childrenNamed('w:lvlOverride')) {
      const index = integer(override.attr('w:ilvl'))
      const start = integer(override.child('w:startOverride')?.attr('w:val'))
      if (index === null || start === null) continue
      levels[index] = { ordered: levels[index]?.ordered ?? true, start }
    }
    out.set(id, levels)
  }
  return out
}

function integer(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

// --- block structure --------------------------------------------------------

interface ListFrame {
  readonly level: number
  readonly ordered: boolean
  readonly start: number
  readonly items: EditorNode[]
}

/**
 * Collects body blocks while turning the flat run of `w:numPr` paragraphs
 * Word emits back into nested list nodes. Word has no list element at all:
 * nesting exists only as the `w:ilvl` each paragraph carries, so the reader
 * has to keep a stack and close frames as the level drops.
 */
class BlockSink {
  private readonly blocks: EditorNode[] = []
  private readonly frames: ListFrame[] = []

  constructor(private readonly reader: Reader) {}

  /** Append a block, ending any open list first. */
  push(node: EditorNode): void {
    this.closeLists()
    if (isEmptyParagraph(node) && isEmptyParagraph(this.blocks[this.blocks.length - 1])) return
    this.blocks.push(node)
  }

  /** Append one numbered paragraph (plus any blocks pulled out of it). */
  pushListItem(numbering: Numbering, content: readonly EditorNode[]): void {
    const { level, format } = numbering
    while (this.top && this.top.level > level) this.closeTop()
    if (this.top && this.top.level === level && this.top.ordered !== format.ordered) this.closeTop()
    if (!this.top || this.top.level < level) {
      this.frames.push({ level, ordered: format.ordered, start: format.start, items: [] })
    }
    const item = this.reader.schema.node(NODE.listItem, undefined, Fragment.from(content))
    ;(this.top as ListFrame).items.push(item)
  }

  finish(): EditorNode[] {
    this.closeLists()
    return this.blocks
  }

  private get top(): ListFrame | undefined {
    return this.frames[this.frames.length - 1]
  }

  private closeLists(): void {
    while (this.frames.length > 0) this.closeTop()
  }

  private closeTop(): void {
    const frame = this.frames.pop()
    if (!frame || frame.items.length === 0) return
    const list = this.buildList(frame)
    if (!list) return
    const parent = this.top
    const last = parent?.items[parent.items.length - 1]
    if (parent && last) {
      parent.items[parent.items.length - 1] = last.withContent(
        last.content.append(Fragment.of(list)),
      )
    } else {
      this.blocks.push(list)
    }
  }

  private buildList(frame: ListFrame): EditorNode | null {
    const name = frame.ordered ? NODE.orderedList : NODE.bulletList
    if (!this.reader.schema.nodes[name]) return null
    const attrs = frame.ordered ? { start: frame.start } : undefined
    return this.reader.schema.node(name, attrs, Fragment.from(frame.items))
  }
}

function isEmptyParagraph(node: EditorNode | undefined): boolean {
  return node?.type.name === NODE.paragraph && node.childCount === 0
}

function visitBlocks(elements: readonly XmlElement[], reader: Reader, sink: BlockSink): void {
  for (const element of elements) {
    switch (element.name) {
      case 'w:p':
        readParagraph(element, reader, sink)
        break
      case 'w:tbl':
        for (const node of readTable(element, reader)) sink.push(node)
        break
      case 'w:sdt': {
        const content = element.child('w:sdtContent')
        if (content) visitBlocks(content.elements(), reader, sink)
        break
      }
      case 'w:smartTag':
      case 'w:ins':
        visitBlocks(element.elements(), reader, sink)
        break
      default:
        break
    }
  }
}

interface ParsedParagraph {
  readonly node: EditorNode
  readonly numbering: Numbering | null
  /** Images lifted out of the paragraph because this schema's are blocks. */
  readonly images: readonly EditorNode[]
}

function readParagraph(element: XmlElement, reader: Reader, sink: BlockSink): void {
  const parsed = parseParagraph(element, reader)
  // A paragraph whose only content was a picture would otherwise leave an
  // empty stub behind next to the image the writer put there.
  const keep = parsed.node.childCount > 0 || parsed.images.length === 0
  const blocks = keep ? [parsed.node, ...parsed.images] : [...parsed.images]
  if (parsed.numbering && reader.supportsLists) {
    sink.pushListItem(parsed.numbering, blocks)
    return
  }
  for (const block of blocks) sink.push(block)
}

function parseParagraph(element: XmlElement, reader: Reader): ParsedParagraph {
  const pPr = element.child('w:pPr')
  const level = styleLevel(reader, pPr?.child('w:pStyle')?.attr('w:val'))
  const numbering = paragraphNumbering(pPr, reader)

  const inline: EditorNode[] = []
  const images: EditorNode[] = []
  collectInline(element, reader, [], inline, images)

  const indentTwips = integer(pPr?.child('w:ind')?.attr('w:left')) ?? 0
  let indent = Math.min(8, Math.max(0, Math.round(indentTwips / INDENT)))
  if (numbering) {
    // A numbered paragraph's `w:ind` is the hanging indent Word gives every
    // list item; the list node carries that, so it must not become an extra
    // indent step. Without list nodes the nesting has to survive as plain
    // indentation instead.
    indent = reader.supportsLists ? 0 : Math.min(8, numbering.level + 1)
  }

  const attrs: Attrs = { align: alignment(pPr), indent }
  const isHeading = level !== null && reader.schema.nodes[NODE.heading] !== undefined
  const node = isHeading
    ? reader.schema.node(NODE.heading, { ...attrs, level }, Fragment.from(inline))
    : reader.schema.node(NODE.paragraph, attrs, Fragment.from(inline))
  return { node, numbering, images }
}

function paragraphNumbering(pPr: XmlElement | undefined, reader: Reader): Numbering | null {
  const numPr = pPr?.child('w:numPr')
  const numId = numPr?.child('w:numId')?.attr('w:val')
  if (!numId || numId === '0') return null
  const level = Math.min(8, Math.max(0, integer(numPr?.child('w:ilvl')?.attr('w:val')) ?? 0))
  const levels = reader.numbering.get(numId)
  const format = levels?.[level] ?? levels?.[0] ?? { ordered: false, start: 1 }
  return { level, format }
}

function alignment(pPr: XmlElement | undefined): string | null {
  switch (pPr?.child('w:jc')?.attr('w:val')) {
    case 'center':
      return 'center'
    case 'right':
    case 'end':
      return 'right'
    case 'both':
    case 'distribute':
      return 'justify'
    case 'left':
    case 'start':
      return 'left'
    default:
      return null
  }
}

// --- inline content ---------------------------------------------------------

function collectInline(
  container: XmlElement,
  reader: Reader,
  marks: readonly Mark[],
  out: EditorNode[],
  images: EditorNode[],
): void {
  for (const child of container.elements()) {
    switch (child.name) {
      case 'w:r':
        readRun(child, reader, marks, out, images)
        break
      case 'w:hyperlink': {
        const href = linkHref(child, reader)
        const link = href === null ? null : makeMark(reader, 'link', { href })
        collectInline(child, reader, link ? mergeMarks(marks, [link]) : marks, out, images)
        break
      }
      case 'w:sdt': {
        const content = child.child('w:sdtContent')
        if (content) collectInline(content, reader, marks, out, images)
        break
      }
      case 'w:smartTag':
      case 'w:ins':
        collectInline(child, reader, marks, out, images)
        break
      default:
        break
    }
  }
}

function linkHref(element: XmlElement, reader: Reader): string | null {
  const id = element.attr('r:id')
  if (id) {
    const target = reader.links.get(id)
    if (target) return target
  }
  const anchor = element.attr('w:anchor')
  return anchor ? `#${anchor}` : null
}

function readRun(
  run: XmlElement,
  reader: Reader,
  inherited: readonly Mark[],
  out: EditorNode[],
  images: EditorNode[],
): void {
  const marks = mergeMarks(inherited, runMarks(run.child('w:rPr'), reader))
  for (const child of run.elements()) {
    switch (child.name) {
      case 'w:t':
        pushText(reader, child.text(), marks, out)
        break
      case 'w:tab':
        pushText(reader, '\t', marks, out)
        break
      case 'w:noBreakHyphen':
        pushText(reader, '-', marks, out)
        break
      case 'w:br':
      case 'w:cr':
        pushBreak(reader, marks, out)
        break
      case 'w:drawing':
      case 'w:pict':
      case 'w:object': {
        const image = readImage(child, reader)
        if (image) (reader.inlineImages ? out : images).push(image)
        break
      }
      default:
        break
    }
  }
}

function pushText(reader: Reader, text: string, marks: readonly Mark[], out: EditorNode[]): void {
  if (text.length === 0) return
  out.push(reader.schema.text(text, marks))
}

function pushBreak(reader: Reader, marks: readonly Mark[], out: EditorNode[]): void {
  if (reader.schema.nodes[NODE.hardBreak]) out.push(reader.schema.node(NODE.hardBreak))
  else pushText(reader, '\n', marks, out)
}

function mergeMarks(base: readonly Mark[], extra: readonly Mark[]): Mark[] {
  if (extra.length === 0) return [...base]
  const out = [...base]
  for (const mark of extra) {
    const index = out.findIndex((existing) => existing.type === mark.type)
    if (index >= 0) out[index] = mark
    else out.push(mark)
  }
  return out
}

function makeMark(reader: Reader, name: string, attrs?: Attrs): Mark | null {
  return reader.schema.marks[name] ? reader.schema.mark(name, attrs) : null
}

/** `w:b`-style toggles are on unless their `w:val` explicitly says otherwise. */
function toggle(element: XmlElement | undefined): boolean {
  if (!element) return false
  const value = element.attr('w:val')
  return value === undefined || !(value === '0' || value === 'false' || value === 'off')
}

/** An OOXML `RRGGBB` attribute as `#rrggbb`; null for `auto` and junk. */
function hexColor(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(trimmed) ? `#${trimmed.toLowerCase()}` : null
}

function runMarks(rPr: XmlElement | undefined, reader: Reader): Mark[] {
  const out: Mark[] = []
  if (!rPr) return out
  const add = (name: string, attrs?: Attrs): void => {
    const mark = makeMark(reader, name, attrs)
    if (mark) out.push(mark)
  }

  if (toggle(rPr.child('w:b'))) add('bold')
  if (toggle(rPr.child('w:i'))) add('italic')
  const underline = rPr.child('w:u')
  if (underline && (underline.attr('w:val') ?? 'single') !== 'none') add('underline')
  if (toggle(rPr.child('w:strike')) || toggle(rPr.child('w:dstrike'))) add('strikethrough')
  if (toggle(rPr.child('w:smallCaps'))) add('smallCaps')

  const vertical = rPr.child('w:vertAlign')?.attr('w:val')
  if (vertical === 'superscript') add('superscript')
  else if (vertical === 'subscript') add('subscript')

  const color = hexColor(rPr.child('w:color')?.attr('w:val'))
  if (color) add('textColor', { color })

  const highlight = rPr.child('w:highlight')?.attr('w:val')
  if (highlight && highlight !== 'none') {
    add('highlight', { color: toCSSHex(highlightColor(highlight) ?? DEFAULT_HIGHLIGHT) })
  }

  const fill = hexColor(rPr.child('w:shd')?.attr('w:fill'))
  if (fill) add('backgroundColor', { color: fill })

  const family = rPr.child('w:rFonts')?.attr('w:ascii')
  if (family) add('fontFamily', { family })

  const halfPoints = integer(rPr.child('w:sz')?.attr('w:val'))
  if (halfPoints !== null && halfPoints > 0) add('fontSize', { size: `${halfPoints / 2}pt` })
  return out
}

function readImage(element: XmlElement, reader: Reader): EditorNode | null {
  const type = reader.schema.nodes[NODE.image]
  if (!type) return null
  const blip = element.find('a:blip')
  const relId =
    blip?.attr('r:embed') ?? blip?.attr('r:link') ?? element.find('v:imagedata')?.attr('r:id')
  if (!relId) return null
  const src = reader.images.get(relId) ?? reader.links.get(relId)
  if (!src) return null

  const attrs: Record<string, unknown> = {
    src,
    alt: element.find('wp:docPr')?.attr('descr') ?? '',
  }
  const extent = element.find('wp:extent')
  const width = integer(extent?.attr('cx'))
  const height = integer(extent?.attr('cy'))
  if (width !== null && width > 0) attrs.width = `${Math.round(width / EMU_PER_PX)}px`
  if (height !== null && height > 0) attrs.height = `${Math.round(height / EMU_PER_PX)}px`
  return type.create(attrs)
}

// --- tables -----------------------------------------------------------------

function readTable(element: XmlElement, reader: Reader): EditorNode[] {
  const rows = element.childrenNamed('w:tr')
  if (!reader.supportsTables) {
    return rows.flatMap((row) =>
      row.childrenNamed('w:tc').flatMap((cell) => readCellBlocks(cell, reader)),
    )
  }

  const built: EditorNode[] = []
  for (const [index, row] of rows.entries()) {
    const header =
      row.child('w:trPr')?.child('w:tblHeader') !== undefined || (index === 0 && allBold(row))
    const cells = row
      .childrenNamed('w:tc')
      .map((cell) => readCell(cell, reader, header))
      .filter((cell): cell is EditorNode => cell !== null)
    if (cells.length > 0) {
      built.push(reader.schema.node(NODE.tableRow, undefined, Fragment.from(cells)))
    }
  }
  if (built.length === 0) return []
  return [reader.schema.node(NODE.table, undefined, Fragment.from(built))]
}

/** Word marks a header row with `w:tblHeader`; writers that do not simply bold it. */
function allBold(row: XmlElement): boolean {
  let seen = false
  for (const run of row.findAll('w:r')) {
    if (run.childrenNamed('w:t').every((text) => text.text().length === 0)) continue
    seen = true
    if (!toggle(run.child('w:rPr')?.child('w:b'))) return false
  }
  return seen
}

function readCell(cell: XmlElement, reader: Reader, header: boolean): EditorNode | null {
  const tcPr = cell.child('w:tcPr')
  const colspan = Math.max(1, integer(tcPr?.child('w:gridSpan')?.attr('w:val')) ?? 1)
  const background = hexColor(tcPr?.child('w:shd')?.attr('w:fill'))
  const blocks = readCellBlocks(cell, reader)
  if (blocks.length === 0) blocks.push(reader.schema.node(NODE.paragraph))
  const attrs: Attrs = background ? { header, colspan, background } : { header, colspan }
  return reader.schema.node(NODE.tableCell, attrs, Fragment.from(blocks))
}

function readCellBlocks(cell: XmlElement, reader: Reader): EditorNode[] {
  const sink = new BlockSink(reader)
  visitBlocks(cell.elements(), reader, sink)
  return sink.finish()
}
