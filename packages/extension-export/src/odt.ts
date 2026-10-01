import {
  type EditorNode,
  Fragment,
  type Mark,
  type Schema,
  TableMap,
  normalizeDoc,
} from '@trevixal/core'
import { NODE, base64Encode, mimeForExtension } from './shared'
import { type XmlElement, escapeXML, isXmlElement, parseXML } from './xml'
import { ArchiveError, type ZipEntry, createZip, readZip } from './zip'

/**
 * OpenDocument Text, the `.odt` LibreOffice and Google Docs read and write:
 * a stored ZIP of XML parts, its `mimetype` first. The writer puts headings,
 * paragraphs, marks, links, lists, tables with their merged cells, code and
 * pictures in `content.xml`, with the automatic styles they need; the reader
 * takes the same back, and what LibreOffice itself writes.
 */

const MIME = 'application/vnd.oasis.opendocument.text'

const NAMESPACES = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
].join(' ')

/** The text properties each mark stands for, as `style:text-properties` attributes. */
const MARK_PROPERTIES: Readonly<Record<string, string>> = {
  bold: 'fo:font-weight="bold"',
  italic: 'fo:font-style="italic"',
  underline:
    'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"',
  strikethrough: 'style:text-line-through-style="solid"',
  code: 'style:font-name="Liberation Mono" fo:font-family="monospace"',
  superscript: 'style:text-position="super 58%"',
  subscript: 'style:text-position="sub 58%"',
}

interface Writer {
  /** A text style name per set of marks, as `bold+italic`. */
  readonly textStyles: Map<string, string>
  readonly pictures: ZipEntry[]
  tables: number
}

/** The automatic text style for a set of marks, made on first use. */
function textStyle(writer: Writer, marks: readonly Mark[]): string | null {
  const names = marks
    .map((mark) => mark.type.name)
    .filter((name) => name in MARK_PROPERTIES)
    .sort()
  if (names.length === 0) return null
  const key = names.join('+')
  let style = writer.textStyles.get(key)
  if (!style) {
    style = `T${writer.textStyles.size + 1}`
    writer.textStyles.set(key, style)
  }
  return style
}

/** Text with its spaces kept: a run of them after the first is `text:s`, a tab `text:tab`. */
function spaced(text: string): string {
  return text
    .split(/(\t| {2,})/)
    .map((piece) => {
      if (piece === '\t') return '<text:tab/>'
      if (/^ {2,}$/.test(piece)) return ` <text:s text:c="${piece.length - 1}"/>`
      return escapeXML(piece)
    })
    .join('')
}

/** The size of a PNG or a GIF from its header; null for any other kind. */
function pictureSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  return null
}

/** A picture as an ODF frame, its data packed in when it is data. */
function picture(node: EditorNode, writer: Writer): string {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(src)
  let href = src
  let size: { width: number; height: number } | null = null
  if (match) {
    const mime = match[1] as string
    const binary = atob(match[2] as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const extension = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'png'
    href = `Pictures/image-${writer.pictures.length + 1}.${extension}`
    writer.pictures.push({ name: href, data: bytes })
    size = pictureSize(bytes)
  }
  // A picture wider than the text is set at the text's width, as a word processor would.
  const width = Math.min(16, (Number(node.attrs.width) || size?.width || 400) * 0.0264583)
  const ratio = size ? size.height / size.width : 0.75
  const name = `Image${writer.pictures.length}`
  return `<draw:frame draw:name="${name}" text:anchor-type="as-char" svg:width="${width.toFixed(3)}cm" svg:height="${(width * ratio).toFixed(3)}cm"><draw:image xlink:href="${escapeXML(href)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${alt ? `<svg:desc>${escapeXML(alt)}</svg:desc>` : ''}</draw:frame>`
}

/** A textblock's inline content as ODF: spans for marks, links, breaks, pictures. */
function inlineODF(block: EditorNode, writer: Writer): string {
  return block.content.children
    .map((child) => {
      if (child.type.name === NODE.hardBreak) return '<text:line-break/>'
      if (child.type.name === NODE.image) return picture(child, writer)
      const text = child.isText ? spaced(child.textContent) : escapeXML(child.textContent)
      const style = child.isText ? textStyle(writer, child.marks) : null
      const span = style ? `<text:span text:style-name="${style}">${text}</text:span>` : text
      const link = child.marks.find((mark) => mark.type.name === 'link')
      const href = typeof link?.attrs.href === 'string' ? link.attrs.href : ''
      return href
        ? `<text:a xlink:type="simple" xlink:href="${escapeXML(href)}">${span}</text:a>`
        : span
    })
    .join('')
}

/** One block as ODF. */
function blockODF(node: EditorNode, writer: Writer): string {
  const children = (): string =>
    node.content.children.map((child) => blockODF(child, writer)).join('')
  switch (node.type.name) {
    case NODE.paragraph:
      return `<text:p text:style-name="Standard">${inlineODF(node, writer)}</text:p>`
    case NODE.heading: {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1))
      return `<text:h text:style-name="Heading_20_${level}" text:outline-level="${level}">${inlineODF(node, writer)}</text:h>`
    }
    case NODE.codeBlock:
      return node.textContent
        .split('\n')
        .map((line) => `<text:p text:style-name="Preformatted_20_Text">${spaced(line)}</text:p>`)
        .join('')
    case NODE.blockquote:
      return node.content.children
        .map((child) =>
          child.isTextblock
            ? `<text:p text:style-name="Quotations">${inlineODF(child, writer)}</text:p>`
            : blockODF(child, writer),
        )
        .join('')
    case NODE.bulletList:
    case NODE.orderedList:
    case NODE.taskList: {
      const style = node.type.name === NODE.orderedList ? 'L-number' : 'L-bullet'
      const items = node.content.children.map((item) => {
        const box =
          item.type.name === NODE.taskItem ? (item.attrs.checked === true ? '☑ ' : '☐ ') : ''
        const body = item.content.children
          .map((child, index) =>
            index === 0 && box && child.isTextblock
              ? `<text:p text:style-name="Standard">${escapeXML(box)}${inlineODF(child, writer)}</text:p>`
              : blockODF(child, writer),
          )
          .join('')
        return `<text:list-item>${body}</text:list-item>`
      })
      return `<text:list text:style-name="${style}">${items.join('')}</text:list>`
    }
    case NODE.horizontalRule:
      return '<text:p text:style-name="Horizontal_20_Line"/>'
    case NODE.image:
      return `<text:p text:style-name="Standard">${picture(node, writer)}</text:p>`
    case NODE.table:
      return tableODF(node, writer)
    case 'mathBlock':
      return `<text:p text:style-name="Standard">${escapeXML(String(node.attrs.latex ?? ''))}</text:p>`
    default:
      if (node.isTextblock)
        return `<text:p text:style-name="Standard">${inlineODF(node, writer)}</text:p>`
      return node.content.childCount === 0 ? '' : children()
  }
}

/** A table, merged cells spanning and the cells they cover written as covered. */
function tableODF(node: EditorNode, writer: Writer): string {
  const map = TableMap.of(node)
  writer.tables += 1
  const rows: string[] = []
  for (let row = 0; row < map.height; row++) {
    const cells: string[] = []
    for (let column = 0; column < map.width; column++) {
      const placed = map.at(row, column)
      if (!placed || placed.top !== row || placed.left !== column) {
        cells.push('<table:covered-table-cell/>')
        continue
      }
      const spans = [
        placed.width > 1 ? ` table:number-columns-spanned="${placed.width}"` : '',
        placed.height > 1 ? ` table:number-rows-spanned="${placed.height}"` : '',
      ].join('')
      const body = placed.node.content.children.map((child) => blockODF(child, writer)).join('')
      cells.push(`<table:table-cell office:value-type="string"${spans}>${body}</table:table-cell>`)
    }
    rows.push(`<table:table-row>${cells.join('')}</table:table-row>`)
  }
  return `<table:table table:name="Table${writer.tables}"><table:table-column table:number-columns-repeated="${map.width}"/>${rows.join('')}</table:table>`
}

export interface ODTOptions {
  readonly title?: string
}

/** The document as the bytes of an `.odt` file. */
export function serializeToODT(doc: EditorNode, options: ODTOptions = {}): Uint8Array {
  const writer: Writer = { textStyles: new Map(), pictures: [], tables: 0 }
  const body = doc.content.children.map((child) => blockODF(child, writer)).join('\n')
  const automatic = [...writer.textStyles]
    .map(([key, name]) => {
      const properties = key
        .split('+')
        .map((mark) => MARK_PROPERTIES[mark])
        .join(' ')
      return `<style:style style:name="${name}" style:family="text"><style:text-properties ${properties}/></style:style>`
    })
    .join('')
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NAMESPACES} office:version="1.3">
<office:automatic-styles>${automatic}<text:list-style style:name="L-bullet"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="1.27cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style><text:list-style style:name="L-number"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="1.27cm"/></style:list-level-properties></text:list-level-style-number></text:list-style></office:automatic-styles>
<office:body><office:text>
${body}
</office:text></office:body>
</office:document-content>
`
  const headingStyles = [24, 20, 16, 14, 12, 11]
    .map(
      (size, index) =>
        `<style:style style:name="Heading_20_${index + 1}" style:display-name="Heading ${index + 1}" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="${index + 1}"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="${size}pt" fo:font-weight="bold"/></style:style>`,
    )
    .join('')
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NAMESPACES} office:version="1.3">
<office:styles><style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm"/></style:style>${headingStyles}<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0cm"/><style:text-properties style:font-name="Liberation Mono" fo:font-family="monospace" fo:font-size="10pt"/></style:style><style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.06pt solid #808080" fo:padding="0cm"/></style:style></office:styles>
</office:document-styles>
`
  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NAMESPACES} office:version="1.3"><office:meta><meta:generator>Trevixal</meta:generator>${options.title ? `<dc:title>${escapeXML(options.title)}</dc:title>` : ''}</office:meta></office:document-meta>
`
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIME}"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
${writer.pictures.map((entry) => ` <manifest:file-entry manifest:full-path="${entry.name}" manifest:media-type="${mimeForExtension(entry.name.split('.').pop() ?? '')}"/>`).join('\n')}
</manifest:manifest>
`
  return createZip([
    { name: 'mimetype', data: MIME },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
    { name: 'meta.xml', data: meta },
    ...writer.pictures,
    { name: 'META-INF/manifest.xml', data: manifest },
  ])
}

// ------------------------------------------------------------------- reading

interface Reader {
  readonly schema: Schema
  /** Text style name → the marks it stands for. */
  readonly styles: ReadonlyMap<string, readonly string[]>
  /** List style name → whether it numbers. */
  readonly numbered: ReadonlyMap<string, boolean>
  /** Picture path → `data:` URL. */
  readonly pictures: ReadonlyMap<string, string>
}

/** The marks a style's text properties stand for. */
function marksOfStyle(style: XmlElement): string[] {
  const properties = style.childrenNamed('style:text-properties')[0]
  if (!properties) return []
  const marks: string[] = []
  if (
    properties.attr('fo:font-weight') === 'bold' ||
    Number(properties.attr('fo:font-weight')) >= 600
  )
    marks.push('bold')
  if (properties.attr('fo:font-style') === 'italic') marks.push('italic')
  const underline = properties.attr('style:text-underline-style')
  if (underline && underline !== 'none') marks.push('underline')
  const through = properties.attr('style:text-line-through-style')
  if (through && through !== 'none') marks.push('strikethrough')
  const position = properties.attr('style:text-position') ?? ''
  if (position.startsWith('super')) marks.push('superscript')
  if (position.startsWith('sub')) marks.push('subscript')
  const font = `${properties.attr('style:font-name') ?? ''} ${properties.attr('fo:font-family') ?? ''}`
  if (/mono|courier/i.test(font)) marks.push('code')
  return marks
}

/** Every element named `name` under `root`, at any depth. */
function descendants(root: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = []
  const walk = (element: XmlElement): void => {
    for (const child of element.elements()) {
      if (child.name === name) found.push(child)
      walk(child)
    }
  }
  walk(root)
  return found
}

/** The marks `names` stand for in the schema, those it has. */
function schemaMarks(schema: Schema, names: readonly string[], href: string | null): Mark[] {
  const marks: Mark[] = []
  for (const name of names) {
    const type = schema.marks[name]
    if (type) marks.push(type.create())
  }
  if (href && schema.marks.link) marks.push(schema.marks.link.create({ href }))
  return marks
}

/** A paragraph's inline content, and the block pictures it holds when images are blocks. */
function readInline(
  element: XmlElement,
  reader: Reader,
  styles: readonly string[],
  href: string | null,
  out: EditorNode[],
  images: EditorNode[],
): void {
  const { schema } = reader
  const text = (value: string): void => {
    if (value) out.push(schema.text(value, schemaMarks(schema, styles, href)))
  }
  for (const child of element.children) {
    if (!isXmlElement(child)) {
      text(child.text.replace(/\s+/g, ' '))
      continue
    }
    switch (child.name) {
      case 'text:span': {
        const own = reader.styles.get(child.attr('text:style-name') ?? '') ?? []
        readInline(child, reader, [...styles, ...own], href, out, images)
        break
      }
      case 'text:a':
        readInline(child, reader, styles, child.attr('xlink:href') ?? null, out, images)
        break
      case 'text:s':
        text(' '.repeat(Math.max(1, Number(child.attr('text:c') ?? '1') || 1)))
        break
      case 'text:tab':
        text('\t')
        break
      case 'text:line-break': {
        const type = schema.nodes[NODE.hardBreak]
        if (type) out.push(type.create())
        break
      }
      case 'draw:frame': {
        const image = child.childrenNamed('draw:image')[0]
        const src =
          reader.pictures.get(image?.attr('xlink:href') ?? '') ?? image?.attr('xlink:href')
        const type = schema.nodes[NODE.image]
        if (!type || !src) break
        const alt =
          child.childrenNamed('svg:desc')[0]?.text() ??
          child.childrenNamed('svg:title')[0]?.text() ??
          ''
        const node = type.create({ src, alt })
        if (type.isInline) out.push(node)
        else images.push(node)
        break
      }
      case 'text:note':
      case 'text:bookmark':
      case 'text:bookmark-start':
      case 'text:bookmark-end':
      case 'text:soft-page-break':
        break
      default:
        readInline(child, reader, styles, href, out, images)
    }
  }
}

/** A paragraph and the pictures it held, when the schema keeps pictures as blocks. */
function readParagraph(element: XmlElement, reader: Reader, heading: number | null): EditorNode[] {
  const inline: EditorNode[] = []
  const images: EditorNode[] = []
  const own = reader.styles.get(element.attr('text:style-name') ?? '') ?? []
  readInline(element, reader, own, null, inline, images)
  const type =
    heading !== null ? reader.schema.nodeType(NODE.heading) : reader.schema.nodeType(NODE.paragraph)
  const node = type.create(heading !== null ? { level: heading } : undefined, Fragment.from(inline))
  return inline.length > 0 || images.length === 0 ? [node, ...images] : images
}

function readBlocks(elements: readonly XmlElement[], reader: Reader): EditorNode[] {
  const { schema } = reader
  const out: EditorNode[] = []
  for (const element of elements) {
    switch (element.name) {
      case 'text:p':
        out.push(...readParagraph(element, reader, null))
        break
      case 'text:h': {
        const level = Math.min(
          6,
          Math.max(1, Number(element.attr('text:outline-level') ?? '1') || 1),
        )
        out.push(...readParagraph(element, reader, level))
        break
      }
      case 'text:list': {
        const ordered = reader.numbered.get(element.attr('text:style-name') ?? '') === true
        const listType = schema.nodes[ordered ? NODE.orderedList : NODE.bulletList]
        const itemType = schema.nodes[NODE.listItem]
        if (!listType || !itemType) break
        const items = element.childrenNamed('text:list-item').map((item) => {
          const blocks = readBlocks(item.elements(), reader)
          return itemType.create(
            undefined,
            Fragment.from(blocks.length > 0 ? blocks : [schema.nodeType(NODE.paragraph).create()]),
          )
        })
        if (items.length > 0) out.push(listType.create(undefined, Fragment.from(items)))
        break
      }
      case 'table:table': {
        const table = readTable(element, reader)
        if (table) out.push(table)
        break
      }
      case 'text:section':
      case 'text:index-body':
      case 'text:table-of-content':
        out.push(...readBlocks(element.elements(), reader))
        break
      default:
        break
    }
  }
  return out
}

/** A table, its spans read back into colspans and rowspans, its covered cells skipped. */
function readTable(element: XmlElement, reader: Reader): EditorNode | null {
  const { schema } = reader
  const tableType = schema.nodes[NODE.table]
  const rowType = schema.nodes[NODE.tableRow]
  const cellType = schema.nodes[NODE.tableCell]
  if (!tableType || !rowType || !cellType) return null
  const rowElements = [
    ...element.childrenNamed('table:table-row'),
    ...element
      .childrenNamed('table:table-header-rows')
      .flatMap((group) => group.childrenNamed('table:table-row')),
    ...element
      .childrenNamed('table:table-rows')
      .flatMap((group) => group.childrenNamed('table:table-row')),
  ]
  const rows = rowElements
    .map((row) => {
      const cells = row.childrenNamed('table:table-cell').map((cell) => {
        const blocks = readBlocks(cell.elements(), reader)
        const colspan = Number(cell.attr('table:number-columns-spanned') ?? '1') || 1
        const rowspan = Number(cell.attr('table:number-rows-spanned') ?? '1') || 1
        const attrs: Record<string, unknown> = {}
        if (colspan > 1 && cellType.spec.attrs?.colspan) attrs.colspan = colspan
        if (rowspan > 1 && cellType.spec.attrs?.rowspan) attrs.rowspan = rowspan
        return cellType.create(
          attrs,
          Fragment.from(blocks.length > 0 ? blocks : [schema.nodeType(NODE.paragraph).create()]),
        )
      })
      return cells.length > 0 ? rowType.create(undefined, Fragment.from(cells)) : null
    })
    .filter((row): row is EditorNode => row !== null)
  return rows.length > 0 ? tableType.create(undefined, Fragment.from(rows)) : null
}

/** Read an `.odt` file into a document of `schema`. */
export async function parseODT(schema: Schema, file: Blob): Promise<EditorNode> {
  const parts = await readZip(new Uint8Array(await file.arrayBuffer()))
  const decoder = new TextDecoder()
  const content = parts.get('content.xml')
  if (!content) throw new ArchiveError('This is not an OpenDocument text: it has no content.xml')
  const root = parseXML(decoder.decode(content))
  const stylesPart = parts.get('styles.xml')
  const styleRoots = [root, ...(stylesPart ? [parseXML(decoder.decode(stylesPart))] : [])]
  const styles = new Map<string, readonly string[]>()
  const numbered = new Map<string, boolean>()
  for (const part of styleRoots) {
    for (const style of descendants(part, 'style:style')) {
      const name = style.attr('style:name')
      if (name) styles.set(name, marksOfStyle(style))
    }
    for (const list of descendants(part, 'text:list-style')) {
      const name = list.attr('style:name')
      const first = list.elements()[0]
      if (name) numbered.set(name, first?.name === 'text:list-level-style-number')
    }
  }
  const pictures = new Map<string, string>()
  for (const [name, bytes] of parts) {
    if (!name.startsWith('Pictures/')) continue
    const mime = mimeForExtension(name.split('.').pop() ?? '')
    pictures.set(name, `data:${mime};base64,${base64Encode(bytes)}`)
  }
  const reader: Reader = { schema, styles, numbered, pictures }
  const text = descendants(root, 'office:text')[0]
  const blocks = text ? readBlocks(text.elements(), reader) : []
  const content_ = blocks.length > 0 ? blocks : [schema.nodeType(NODE.paragraph).create()]
  return normalizeDoc(schema.topType.create(undefined, Fragment.from(content_)))
}
