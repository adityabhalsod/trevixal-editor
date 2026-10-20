import {
  DEFAULT_LIST_NUMBERING,
  type EditorNode,
  Fragment,
  type ListNumberingScheme,
  type Mark,
  type NamedStyle,
  PAPER_SIZES,
  type Schema,
  TableMap,
  type TextNode,
  codeBlockTitle,
  documentStyles,
  dropCapOf,
  exportTextOf,
  levelMarker,
  listNumberingOf,
  listStylesFor,
  normalizeDoc,
  pageSetupAttr,
  pageSetupOf,
  pageTemplateParts,
  paragraphBorderOf,
  paragraphShadingOf,
  safeStyleId,
  tabStopsOf,
  taskMetaText,
  textDirection,
} from '@trevixal/core'
import { parseColor, toHex } from './color'
import type {
  RenderedBlock,
  RenderedBox,
  RenderedDocument,
  RenderedImage,
  RenderedLook,
  RenderedRun,
  RenderedSide,
} from './rendered'
import {
  NODE,
  NOTES,
  attrNumber,
  attrString,
  base64Encode,
  blockLayout,
  decodeDataURL,
  embedLink,
  imageDimensions,
  listKind,
  listStart,
  markNamed,
  mimeForExtension,
  namedLook,
  notesNumbering,
  primaryFont,
  taskGlyph,
  taskTally,
} from './shared'
import { type DocumentPalette, type ThemeTokens, documentPalette } from './theme'
import { lengthToHalfPoints, lengthToTwips } from './units'
import { type XmlElement, escapeXML, isXmlElement, parseXML } from './xml'
import { ArchiveError, type ZipEntry, createZip, readZip } from './zip'

/**
 * OpenDocument Text, the `.odt` LibreOffice and Google Docs read and write:
 * a stored ZIP of XML parts, its `mimetype` first. The writer sets the
 * document as the editor shows it: the page and its footer, paragraph and
 * character formatting, named styles, lists with the editor's own markers,
 * tables with their lines and fills, code coloured and numbered, pictures,
 * equations as LibreOffice's own formula objects, and the boxes the editor
 * draws round callouts, cards and toggles. The reader takes the structure
 * back, and what LibreOffice itself writes.
 */

const MIME = 'application/vnd.oasis.opendocument.text'
const FORMULA_MIME = 'application/vnd.oasis.opendocument.formula'

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
  'xmlns:math="http://www.w3.org/1998/Math/MathML"',
].join(' ')

/** Centimetres in a CSS pixel, and in a twip. */
const CM_PER_PX = 2.54 / 96
const CM_PER_TWIP = 2.54 / 1440
/** One list level's step, as the editor and Word indent one. */
const LEVEL_CM = 1.27
/** The hanging indent a list's marker sits in. */
const MARKER_CM = 0.635
const CODE_FONT = 'Liberation Mono'
const BULLETS = ['●', '○', '▪']
const BULLET_GLYPHS: Readonly<Record<string, string>> = { disc: '●', circle: '○', square: '▪' }
/** CSS counter styles as ODF's `style:num-format`. */
const NUMBER_FORMATS: Readonly<Record<string, string>> = {
  decimal: '1',
  'decimal-leading-zero': '1',
  'lower-alpha': 'a',
  'upper-alpha': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
}

const cm = (value: number): string => `${Math.round(value * 1000) / 1000}cm`

/** `#rrggbb` for a colour the editor drew; null for one a document cannot carry. */
function hex(value: string | null | undefined): string | null {
  const rgb = parseColor(value)
  return rgb ? `#${toHex(rgb).toLowerCase()}` : null
}

/** How the type is set, as `style:text-properties` reads it. Absent fields are inherited. */
interface TextLook {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strike?: boolean
  readonly smallCaps?: boolean
  readonly position?: 'super' | 'sub'
  readonly font?: string
  /** In points. */
  readonly size?: number
  readonly color?: string
  readonly fill?: string
  /** Extra space between letters, in points. */
  readonly spacing?: number
}

function textProperties(look: TextLook): string {
  const out: string[] = []
  if (look.bold) out.push('fo:font-weight="bold" style:font-weight-complex="bold"')
  if (look.italic) out.push('fo:font-style="italic" style:font-style-complex="italic"')
  if (look.underline) {
    out.push(
      'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"',
    )
  }
  // Said either way: a task's chip is not struck through with its words.
  if (look.strike !== undefined) {
    out.push(`style:text-line-through-style="${look.strike ? 'solid' : 'none'}"`)
  }
  if (look.smallCaps) out.push('fo:font-variant="small-caps"')
  if (look.position) out.push(`style:text-position="${look.position} 58%"`)
  if (look.font) out.push(`fo:font-family="${escapeXML(look.font)}"`)
  if (look.size) out.push(`fo:font-size="${Math.round(look.size * 10) / 10}pt"`)
  if (look.color) out.push(`fo:color="${look.color}"`)
  if (look.fill) out.push(`fo:background-color="${look.fill}"`)
  if (look.spacing) out.push(`fo:letter-spacing="${Math.round(look.spacing * 100) / 100}pt"`)
  return out.join(' ')
}

/** A paragraph's share of the box round it: its ground, and a line on each side drawn. */
interface Frame {
  readonly fill?: string
  readonly sides: Readonly<Partial<Record<RenderedSide, string>>>
}

/** What a block's paragraphs take from the blocks around them. */
interface State {
  readonly text: TextLook
  readonly frame?: Frame
  /** The side a paragraph without an alignment of its own lines up on. */
  readonly align?: 'left' | 'center' | 'right'
  /** Extra left margin from enclosing quotes and task lists, in centimetres. */
  readonly indent: number
  /** In a table's cell: its paragraphs take no space after. */
  readonly inCell: boolean
}

const ROOT: State = { text: {}, indent: 0, inCell: false }

interface Writer {
  readonly basePt: number
  readonly palette: DocumentPalette
  readonly rendered: RenderedDocument
  readonly direction: 'ltr' | 'rtl'
  readonly doc: EditorNode
  readonly namedStyles: ReadonlyMap<string, NamedStyle>
  /** Automatic styles by what they say, so two alike share a name. */
  readonly styles: Map<string, string>
  readonly automatic: string[]
  readonly pictures: ZipEntry[]
  /** Formula objects: their directories' names and MathML. */
  readonly formulas: { name: string; mathml: string }[]
  /** The width between the margins, in centimetres. */
  readonly textWidth: number
  tables: number
  frames: number
}

/** An automatic style, made the first time it is asked for. */
function automaticStyle(writer: Writer, family: string, prefix: string, body: string): string {
  const key = `${family}|${body}`
  const known = writer.styles.get(key)
  if (known) return known
  const name = `${prefix}${writer.styles.size + 1}`
  writer.styles.set(key, name)
  writer.automatic.push(body.replace('%NAME%', name))
  return name
}

function textStyle(writer: Writer, look: TextLook): string | null {
  const properties = textProperties(look)
  if (!properties) return null
  return automaticStyle(
    writer,
    'text',
    'T',
    `<style:style style:name="%NAME%" style:family="text"><style:text-properties ${properties}/></style:style>`,
  )
}

interface ParagraphLook {
  readonly parent: string
  readonly align?: string
  readonly marginLeft?: number
  readonly textIndent?: number
  readonly marginTop?: number
  readonly marginBottom?: number
  readonly lineHeight?: string
  readonly frame?: Frame
  readonly rtl?: boolean
  readonly breakBefore?: boolean
  readonly keepNext?: boolean
  readonly tabs?: string
  readonly dropCap?: number
  readonly text?: TextLook
}

function paragraphStyle(writer: Writer, look: ParagraphLook): string {
  const properties: string[] = []
  if (look.align) properties.push(`fo:text-align="${look.align}"`)
  if (look.marginLeft !== undefined) properties.push(`fo:margin-left="${cm(look.marginLeft)}"`)
  if (look.textIndent !== undefined) properties.push(`fo:text-indent="${cm(look.textIndent)}"`)
  if (look.marginTop !== undefined) properties.push(`fo:margin-top="${cm(look.marginTop)}"`)
  if (look.marginBottom !== undefined) {
    properties.push(`fo:margin-bottom="${cm(look.marginBottom)}"`)
  }
  if (look.lineHeight) properties.push(`fo:line-height="${look.lineHeight}"`)
  if (look.frame?.fill) properties.push(`fo:background-color="${look.frame.fill}"`)
  const sides = look.frame?.sides ?? {}
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const line = sides[side]
    if (line) {
      properties.push(`fo:border-${side}="${line}"`)
      properties.push(
        `fo:padding-${side}="${side === 'left' || side === 'right' ? '0.15cm' : '0.05cm'}"`,
      )
    }
  }
  if (look.rtl) properties.push('style:writing-mode="rl-tb"')
  if (look.breakBefore) properties.push('fo:break-before="page"')
  if (look.keepNext) properties.push('fo:keep-with-next="always"')
  const inner = [
    look.tabs ? `<style:tab-stops>${look.tabs}</style:tab-stops>` : '',
    look.dropCap ? `<style:drop-cap style:lines="${look.dropCap}" style:length="1"/>` : '',
  ].join('')
  const paragraphProperties =
    properties.length > 0 || inner
      ? `<style:paragraph-properties ${properties.join(' ')}${inner ? `>${inner}</style:paragraph-properties>` : '/>'}`
      : ''
  const text = look.text ? textProperties(look.text) : ''
  const textXML = text ? `<style:text-properties ${text}/>` : ''
  if (!paragraphProperties && !textXML) return look.parent
  return automaticStyle(
    writer,
    'paragraph',
    'P',
    `<style:style style:name="%NAME%" style:family="paragraph" style:parent-style-name="${look.parent}">${paragraphProperties}${textXML}</style:style>`,
  )
}

/** A state with how the editor draws a node on it, where it does differ. */
function withLook(writer: Writer, state: State, look: RenderedLook | undefined): State {
  if (!look) return state
  const color = hex(look.color)
  const scale = look.scale && !look.raised ? look.scale : null
  return {
    ...state,
    text: {
      ...state.text,
      ...(color ? { color } : {}),
      ...(look.bold ? { bold: true } : {}),
      ...(look.italic ? { italic: true } : {}),
      ...(look.strike ? { strike: true } : {}),
      ...(scale ? { size: (state.text.size ?? writer.basePt) * scale } : {}),
    },
    ...(look.align ? { align: look.align } : {}),
  }
}

/** A state inside a block's box: its ground over the one round it, its lines over theirs. */
function withBox(state: State, box: RenderedBox | undefined): State {
  if (!box) return state
  const sides: Partial<Record<RenderedSide, string>> = { ...state.frame?.sides }
  const color = hex(box.border?.color)
  if (box.border && color) {
    const width = Math.max(0.5, Math.round(box.border.width * 0.75 * 100) / 100)
    for (const side of box.border.sides) sides[side] = `${width}pt solid ${color}`
  }
  const fill = hex(box.fill) ?? state.frame?.fill
  return { ...state, frame: { ...(fill ? { fill } : {}), sides } }
}

/** The state a block's paragraphs take: the one round it, with the block's own look and box. */
function styled(node: EditorNode, writer: Writer, state: State): State {
  const drawn: RenderedBlock | undefined = writer.rendered.get(node)
  return drawn ? withBox(withLook(writer, state, drawn.look), drawn.box) : state
}

/**
 * Whether two blocks are boxes of their own that a reader would join into
 * one: each drawn with a line on a side the other has too.
 */
function boxedAlike(first: EditorNode, second: EditorNode, writer: Writer): boolean {
  const one = writer.rendered.get(first)?.box?.border?.sides ?? []
  const other = writer.rendered.get(second)?.box?.border?.sides ?? []
  return one.some((side) => other.includes(side))
}

/** Text with its spaces kept: a run of them after the first is `text:s`, a tab `text:tab`. */
function spaced(text: string): string {
  return text
    .split(/(\t|\n| {2,})/)
    .map((piece) => {
      if (piece === '\t') return '<text:tab/>'
      if (piece === '\n') return '<text:line-break/>'
      if (/^ {2,}$/.test(piece)) return ` <text:s text:c="${piece.length - 1}"/>`
      return escapeXML(piece)
    })
    .join('')
}

/** A run of text in the style its marks make, or plain. */
function span(writer: Writer, text: string, look: TextLook): string {
  const style = textStyle(writer, look)
  return style ? `<text:span text:style-name="${style}">${text}</text:span>` : text
}

/** What a text node's marks set, over what it inherits. */
function markLook(marks: readonly Mark[], writer: Writer): TextLook {
  let look: TextLook = {}
  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        look = { ...look, bold: true }
        break
      case 'italic':
        look = { ...look, italic: true }
        break
      case 'underline':
        look = { ...look, underline: true }
        break
      case 'strikethrough':
        look = { ...look, strike: true }
        break
      case 'smallCaps':
        look = { ...look, smallCaps: true }
        break
      case 'superscript':
        look = { ...look, position: 'super' }
        break
      case 'subscript':
        look = { ...look, position: 'sub' }
        break
      case 'code':
        look = {
          ...look,
          font: CODE_FONT,
          fill: writer.palette.code ? `#${writer.palette.code.toLowerCase()}` : '#f1f1f4',
        }
        break
      case 'fontFamily': {
        const family = attrString(mark.attrs, 'family')
        if (family) look = { ...look, font: primaryFont(family) }
        break
      }
      case 'fontSize': {
        const halfPoints = lengthToHalfPoints(mark.attrs.size, writer.basePt)
        if (halfPoints !== null) look = { ...look, size: halfPoints / 2 }
        break
      }
      case 'textColor': {
        const color = hex(attrString(mark.attrs, 'color'))
        if (color) look = { ...look, color }
        break
      }
      case 'highlight':
      case 'backgroundColor': {
        const color = hex(attrString(mark.attrs, 'color') ?? '#ffff00')
        if (color) look = { ...look, fill: color }
        break
      }
      case 'letterSpacing': {
        const twips = lengthToTwips(mark.attrs.spacing, writer.basePt)
        if (twips !== null) look = { ...look, spacing: twips / 20 }
        break
      }
      case 'charStyle': {
        const style = writer.namedStyles.get(safeStyleId(mark.attrs.id) ?? '')
        if (style?.kind === 'character') look = { ...look, ...namedTextLook(style) }
        break
      }
      default:
        break
    }
  }
  return look
}

/** A named style's type, as text properties, a built-in one's own look under the document's. */
function namedTextLook(style: NamedStyle): TextLook {
  const props = namedLook(style.id, style.props)
  const color = hex(props.color)
  return {
    ...(props.bold ? { bold: true } : {}),
    ...(props.italic ? { italic: true } : {}),
    ...(props.underline ? { underline: true } : {}),
    ...(props.fontFamily ? { font: primaryFont(props.fontFamily) } : {}),
    ...(props.fontSize ? { size: props.fontSize } : {}),
    ...(color ? { color } : {}),
  }
}

/** A textblock's inline content as ODF: spans for marks, links, breaks, pictures, atoms. */
function inlineODF(block: EditorNode, writer: Writer, state: State): string {
  let out = ''
  const children = block.content.children
  let index = 0
  while (index < children.length) {
    const child = children[index] as EditorNode
    const link = child.isText ? markNamed(child.marks, 'link') : undefined
    const href = link ? attrString(link.attrs, 'href') : null
    if (href) {
      let inner = ''
      while (index < children.length) {
        const next = children[index] as EditorNode
        const nextLink = next.isText ? markNamed(next.marks, 'link') : undefined
        if (!nextLink || attrString(nextLink.attrs, 'href') !== href) break
        inner += inlineNode(next, writer, state)
        index++
      }
      out += `<text:a xlink:type="simple" xlink:href="${escapeXML(href)}">${inner}</text:a>`
      continue
    }
    out += inlineNode(child, writer, state)
    index++
  }
  return out
}

function inlineNode(node: EditorNode, writer: Writer, state: State): string {
  if (node.isText) {
    const look = markLook(node.marks, writer)
    return span(writer, spaced((node as TextNode).text), look)
  }
  if (node.type.name === NODE.hardBreak) return '<text:line-break/>'
  if (node.type.name === NODE.image) return pictureFrame(pictureOf(node, writer), writer) ?? ''
  const formula = formulaFrame(node, writer, false)
  if (formula) return formula
  const words = exportTextOf(node)
  if (!words) return ''
  // How the editor draws the atom: a badge's pill, a marker raised and bracketed.
  const drawn = writer.rendered.get(node)?.look
  const color = hex(drawn?.color)
  const fill = hex(drawn?.fill)
  const look: TextLook = {
    ...(color ? { color } : {}),
    ...(fill ? { fill } : {}),
    ...(drawn?.bold ? { bold: true } : {}),
    ...(drawn?.italic ? { italic: true } : {}),
    ...(drawn?.strike ? { strike: true } : {}),
    ...(drawn?.underline ? { underline: true } : {}),
    ...(drawn?.raised ? { position: 'super' as const } : {}),
    ...(drawn?.scale && !drawn.raised
      ? { size: (state.text.size ?? writer.basePt) * drawn.scale }
      : {}),
  }
  const text = span(writer, spaced(`${drawn?.before ?? ''}${words}${drawn?.after ?? ''}`), look)
  const link = embedLink(node)
  return link
    ? `<text:a xlink:type="simple" xlink:href="${escapeXML(link.href)}">${text}</text:a>`
    : text
}

/** Everything a picture needs, whether it came from the document or was drawn for it. */
interface Picture {
  readonly src: string
  readonly alt: string
  /** In CSS pixels, or null for the picture's own. */
  readonly width: number | null
  readonly height: number | null
}

/** An image node's picture: the bitmap the editor drew of it where its source is SVG. */
function pictureOf(node: EditorNode, writer: Writer, width?: number): Picture {
  return {
    src: writer.rendered.get(node)?.image?.src ?? attrString(node.attrs, 'src') ?? '',
    alt: attrString(node.attrs, 'alt') ?? '',
    width: width ?? (attrNumber(node.attrs, 'width') || null),
    height: width === undefined ? attrNumber(node.attrs, 'height') || null : null,
  }
}

/** A picture as a frame in the line, its bytes packed in; null for one the file cannot hold. */
function pictureFrame(image: Picture, writer: Writer): string | null {
  const decoded = decodeDataURL(image.src)
  if (!decoded || !decoded.mime.startsWith('image/')) {
    // A picture elsewhere is a link to it, so the reader can still reach it.
    if (!/^https?:\/\//i.test(image.src)) return null
    return `<text:a xlink:type="simple" xlink:href="${escapeXML(image.src)}">${escapeXML(image.alt || image.src)}</text:a>`
  }
  const extension =
    decoded.mime.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'png'
  const href = `Pictures/image-${writer.pictures.length + 1}.${extension}`
  writer.pictures.push({ name: href, data: decoded.bytes })
  const natural = imageDimensions(decoded.bytes)
  const pixels = Math.min(image.width ?? natural?.width ?? 400, writer.textWidth / CM_PER_PX)
  const ratio =
    image.width && image.height
      ? image.height / image.width
      : natural && natural.width > 0
        ? natural.height / natural.width
        : 0.75
  const width = pixels * CM_PER_PX
  writer.frames += 1
  return `<draw:frame draw:name="Image${writer.frames}" text:anchor-type="as-char" svg:width="${cm(width)}" svg:height="${cm(width * ratio)}"><draw:image xlink:href="${escapeXML(href)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${image.alt ? `<svg:desc>${escapeXML(image.alt)}</svg:desc>` : ''}</draw:frame>`
}

/** A picture the editor drew, as a frame: a diagram, a drawing. */
function drawnFrame(image: RenderedImage, writer: Writer): string | null {
  return image.src
    ? pictureFrame(
        { src: image.src, alt: image.alt, width: image.width, height: image.height },
        writer,
      )
    : null
}

/**
 * An equation as LibreOffice's own: a formula object holding the MathML the
 * node's spec draws it with, as Writer's Insert ▸ Object ▸ Formula makes one.
 * Sized as the editor set it, where the editor drew it. Null for any other node.
 */
function formulaFrame(node: EditorNode, writer: Writer, display: boolean): string | null {
  const markup = node.type.spec.toHTML?.(node).innerHTML ?? ''
  const start = markup.indexOf('<math')
  const end = markup.lastIndexOf('</math>')
  if (start < 0 || end < 0) return null
  const mathml = markup.slice(start, end + '</math>'.length)
  const name = `Object ${writer.formulas.length + 1}`
  writer.formulas.push({ name, mathml })
  const drawn = writer.rendered.get(node)?.image
  const width = (drawn?.width ?? (display ? 160 : 60)) * CM_PER_PX
  const height = (drawn?.height ?? 24) * CM_PER_PX
  writer.frames += 1
  return `<draw:frame draw:name="Formula${writer.frames}" text:anchor-type="as-char" svg:width="${cm(width)}" svg:height="${cm(height)}" draw:z-index="0"><draw:object xlink:href="./${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
}

/** A paragraph of `inline` in the state's look, its own attributes laid over it. */
function paragraphXML(
  writer: Writer,
  node: EditorNode | null,
  state: State,
  inline: string,
  options: {
    parent?: string
    heading?: number
    after?: number
    extra?: Partial<ParagraphLook>
  } = {},
): string {
  const layout = node ? blockLayout(node, writer.basePt) : null
  const rtl = node ? (textDirection(node.attrs.dir) ?? writer.direction) === 'rtl' : false
  const ownBorder = node ? paragraphBorderOf(node.attrs) : null
  const ownShading = node ? hex(paragraphShadingOf(node.attrs)) : null
  let frame = state.frame
  if (ownBorder || ownShading) {
    const sides: Partial<Record<RenderedSide, string>> = {}
    const color = hex(ownBorder?.color) ?? '#000000'
    // A pixel is three quarters of a point.
    const width = Math.max(0.5, (ownBorder?.width ?? 1) * 0.75)
    for (const side of ownBorder?.sides ?? []) {
      sides[side] = `${width}pt ${ownBorder?.style ?? 'solid'} ${color}`
    }
    frame = { ...(ownShading ? { fill: ownShading } : {}), sides }
  }
  const named = node ? namedStyleName(node, writer) : null
  const align = layout?.align ?? state.align
  const stops = node ? tabStopsOf(node.attrs).map(tabStopXML).join('') : ''
  const dropCap = node ? dropCapOf(node.attrs) : null
  const look: ParagraphLook = {
    parent: options.parent ?? named ?? 'Standard',
    ...(align ? { align: align === 'left' ? 'start' : align === 'right' ? 'end' : align } : {}),
    ...(state.indent || layout?.indent
      ? { marginLeft: state.indent + (layout?.indent ?? 0) * LEVEL_CM }
      : {}),
    ...(layout?.spaceBefore !== null && layout?.spaceBefore !== undefined
      ? { marginTop: layout.spaceBefore * CM_PER_TWIP }
      : {}),
    ...(layout?.spaceAfter !== null && layout?.spaceAfter !== undefined
      ? { marginBottom: layout.spaceAfter * CM_PER_TWIP }
      : options.after !== undefined
        ? { marginBottom: options.after }
        : state.inCell
          ? { marginBottom: 0 }
          : {}),
    ...(layout?.lineHeight
      ? {
          lineHeight:
            'multiplier' in layout.lineHeight
              ? `${Math.round(layout.lineHeight.multiplier * 100)}%`
              : `${Math.round((layout.lineHeight.twips / 20) * 10) / 10}pt`,
        }
      : {}),
    ...(frame ? { frame } : {}),
    ...(rtl ? { rtl: true } : {}),
    ...(stops ? { tabs: stops } : {}),
    ...(dropCap ? { dropCap: dropCap.lines } : {}),
    ...(Object.keys(state.text).length > 0 ? { text: state.text } : {}),
    ...options.extra,
  }
  const style = paragraphStyle(writer, look)
  if (options.heading) {
    return `<text:h text:style-name="${style}" text:outline-level="${options.heading}">${inline}</text:h>`
  }
  return `<text:p text:style-name="${style}">${inline}</text:p>`
}

/** ODF's words for a tab stop's leader: its line's style, and the character it repeats. */
const LEADERS: Readonly<Record<string, readonly [string, string]>> = {
  dot: ['dotted', '.'],
  hyphen: ['dash', '-'],
  underscore: ['solid', '_'],
}

/** One tab stop, at its position from the margin; a decimal one lines up on the point. */
function tabStopXML(stop: ReturnType<typeof tabStopsOf>[number]): string {
  // Positions are in points; a point is 2.54 / 72 cm.
  const position = cm((stop.position * 2.54) / 72)
  const type = stop.align === 'decimal' ? 'char" style:char="."' : `${stop.align}"`
  const leader = LEADERS[stop.leader]
  const leaderXML = leader
    ? ` style:leader-style="${leader[0]}" style:leader-text="${leader[1]}"`
    : ''
  return `<style:tab-stop style:position="${position}" style:type="${type}${leaderXML}/>`
}

/** The style a paragraph's named style is written as, when the document has it. */
function namedStyleName(node: EditorNode, writer: Writer): string | null {
  if (node.type.name !== NODE.paragraph) return null
  const id = safeStyleId(node.attrs.paragraphStyle)
  if (!id || id === 'normal') return null
  return writer.namedStyles.get(id)?.kind === 'paragraph' ? namedStyleId(id) : null
}

/** The style name a named style is written under, safe for an XML name. */
const namedStyleId = (id: string): string => `Trevixal_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`

/** Blocks side by side, a gap between two boxes a reader would join. */
function blocksODF(nodes: readonly EditorNode[], writer: Writer, state: State): string {
  let out = ''
  let previous: EditorNode | null = null
  for (const node of nodes) {
    if (previous && boxedAlike(previous, node, writer)) {
      out += paragraphXML(writer, null, state, '', {
        after: 0,
        extra: { lineHeight: '6pt', text: { size: 3 } },
      })
    }
    out += blockODF(node, writer, state)
    previous = node
  }
  return out
}

/** One block as ODF. */
function blockODF(node: EditorNode, writer: Writer, inherited: State): string {
  const state = styled(node, writer, inherited)
  const drawn = writer.rendered.get(node)
  // A block the editor shows as a picture it drew, a drawing, is that picture.
  if (
    drawn?.image &&
    !node.isTextblock &&
    node.type.name !== NODE.image &&
    node.type.name !== 'mathBlock'
  ) {
    const frame = drawnFrame(drawn.image, writer)
    if (frame) return paragraphXML(writer, null, { ...inherited, align: 'center' }, frame)
  }
  switch (node.type.name) {
    case NODE.paragraph:
      return paragraphXML(writer, node, state, inlineODF(node, writer, state))
    case NODE.heading: {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1))
      return paragraphXML(writer, node, state, inlineODF(node, writer, state), {
        parent: `Heading_20_${level}`,
        heading: level,
      })
    }
    case NODE.codeBlock: {
      const picture = drawn?.image ? drawnFrame(drawn.image, writer) : null
      if (picture) return paragraphXML(writer, null, { ...inherited, align: 'center' }, picture)
      return codeODF(node, drawn, writer, state)
    }
    case NODE.blockquote:
      // The editor's quote is upright, muted beside a rule, which its look and
      // box bring; without them, the Quotations style's indent.
      return node.content.children
        .map((child) =>
          child.isTextblock && !drawn?.box
            ? paragraphXML(
                writer,
                child,
                styled(child, writer, state),
                inlineODF(child, writer, state),
                {
                  parent: 'Quotations',
                },
              )
            : blockODF(child, writer, state),
        )
        .join('')
    case NODE.bulletList:
    case NODE.orderedList:
      return listODF(node, writer, state, 0, null)
    case NODE.taskList:
      return taskListODF(node, writer, state)
    case NODE.horizontalRule:
      return '<text:p text:style-name="Horizontal_20_Line"/>'
    case NODE.image: {
      const frame = pictureFrame(pictureOf(node, writer), writer)
      return frame ? paragraphXML(writer, null, state, frame) : ''
    }
    case NODE.table:
      return tableODF(node, writer, state)
    case NODE.figure:
      return blocksODF(node.content.children, writer, state)
    case NODE.caption:
      return paragraphXML(
        writer,
        node,
        { ...state, text: { ...state.text, italic: true } },
        inlineODF(node, writer, state),
        {
          extra: { align: 'center' },
        },
      )
    case 'pageBreak':
      return paragraphXML(writer, null, inherited, '', { after: 0, extra: { breakBefore: true } })
    case 'mathBlock': {
      const formula = formulaFrame(node, writer, true)
      if (!formula) break
      const number = node.attrs.numbered === true ? attrString(node.attrs, 'number') : null
      if (!number) return paragraphXML(writer, null, { ...inherited, align: 'center' }, formula)
      // Numbered: centred on a tab, its number on a right one at the margin.
      const tabs = `<style:tab-stop style:position="${cm(writer.textWidth / 2)}" style:type="center"/><style:tab-stop style:position="${cm(writer.textWidth)}" style:type="right"/>`
      return paragraphXML(
        writer,
        null,
        inherited,
        `<text:tab/>${formula}<text:tab/>${escapeXML(`(${number})`)}`,
        {
          extra: { tabs },
        },
      )
    }
    case NOTES.footnotes:
    case NOTES.endnotes:
    case NOTES.references:
      return notesODF(node, writer, state)
    case 'columnBlock':
      return columnsODF(node, writer, state)
    case 'gallery':
      return galleryODF(node, writer, state)
    case 'linkCard':
      return linkCardODF(node, writer, state)
  }
  if (node.isTextblock) {
    // What the stylesheet writes beside a heading of its own: an accordion's arrow.
    const look = drawn?.look
    const before = look?.before ? `${escapeXML(look.before)} ` : ''
    const after = look?.after ? ` ${escapeXML(look.after)}` : ''
    return paragraphXML(writer, node, state, `${before}${inlineODF(node, writer, state)}${after}`)
  }
  if (node.isAtom || node.childCount === 0) {
    const link = embedLink(node)
    if (link) {
      return paragraphXML(
        writer,
        null,
        state,
        `<text:a xlink:type="simple" xlink:href="${escapeXML(link.href)}">${escapeXML(link.text)}</text:a>`,
      )
    }
    // An atom with no text of its own, a poll or an index: its words, a line each.
    const words = exportTextOf(node)
    return words
      ? words
          .split('\n')
          .map((line) => paragraphXML(writer, null, state, spaced(line)))
          .join('')
      : ''
  }
  return blocksODF(node.content.children, writer, state)
}

/**
 * A code block as paragraphs, a line each, as the editor shows it: its title
 * above it, its lines numbered and banded where it marks them, on its own
 * ground and in its own ink, highlighted as the editor highlighted it.
 */
function codeODF(
  node: EditorNode,
  drawn: RenderedBlock | undefined,
  writer: Writer,
  state: State,
): string {
  const ground =
    hex(drawn?.box?.fill) ??
    (writer.palette.code ? `#${writer.palette.code.toLowerCase()}` : '#f1f1f4')
  const ink = hex(drawn?.look?.color)
  const muted = mutedInk(writer)
  const bands = new Map((drawn?.lines ?? []).map((line) => [line.line, hex(line.band)]))
  const lines = codeLines(node.textContent, drawn?.runs)
  const digits = String(lines.length).length
  const frame = (fill: string | null): State => ({
    ...state,
    text: { ...state.text, ...(ink ? { color: ink } : {}) },
    frame: { sides: state.frame?.sides ?? {}, ...(fill ? { fill } : {}) },
  })
  let out = ''
  const title = codeBlockTitle(node.attrs.title)
  if (title) {
    const rule = writer.palette.border ? `#${writer.palette.border.toLowerCase()}` : '#d9d9e3'
    const titled = frame(ground)
    out += paragraphXML(
      writer,
      null,
      {
        ...titled,
        frame: {
          ...titled.frame,
          sides: { ...titled.frame?.sides, bottom: `0.75pt solid ${rule}` },
        },
      },
      span(writer, escapeXML(title), { bold: true, size: 8, color: muted }),
      { parent: 'Preformatted_20_Text', after: 0 },
    )
  }
  lines.forEach((pieces, index) => {
    const number =
      node.attrs.lineNumbers === true
        ? span(writer, spaced(`${String(index + 1).padStart(digits)}  `), { color: muted })
        : ''
    const body = pieces
      .map((piece) => {
        const color = hex(piece.color)
        return span(writer, spaced(piece.text), {
          ...(color ? { color } : {}),
          ...(piece.bold ? { bold: true } : {}),
          ...(piece.italic ? { italic: true } : {}),
        })
      })
      .join('')
    const last = index === lines.length - 1
    out += paragraphXML(writer, null, frame(bands.get(index + 1) ?? ground), `${number}${body}`, {
      parent: 'Preformatted_20_Text',
      after: last ? 0.28 : 0,
    })
  })
  return out
}

/** A code block's text as lines of runs, a plain run a line where nothing coloured it. */
function codeLines(text: string, runs: readonly RenderedRun[] | undefined): RenderedRun[][] {
  if (!runs || runs.length === 0) return text.split('\n').map((line) => [{ text: line }])
  const lines: RenderedRun[][] = [[]]
  for (const run of runs) {
    run.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part) (lines[lines.length - 1] as RenderedRun[]).push({ ...run, text: part })
    })
  }
  return lines
}

/** One level of a list style: a bullet's glyph, or a number's format and the text around it. */
type ListLevel =
  | { readonly kind: 'bullet'; readonly glyph: string }
  | {
      readonly kind: 'number'
      readonly format: string
      readonly prefix: string
      readonly suffix: string
      readonly display: number
      readonly start: number
    }

/** A list style for a list's level and the levels below it, made on first use. */
function listStyle(writer: Writer, levels: readonly ListLevel[]): string {
  const body = levels
    .map((level, index) => {
      const position = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${cm(LEVEL_CM * (index + 1))}" fo:text-indent="${cm(-MARKER_CM)}" fo:margin-left="${cm(LEVEL_CM * (index + 1))}"/></style:list-level-properties>`
      if (level.kind === 'bullet') {
        return `<text:list-level-style-bullet text:level="${index + 1}" text:bullet-char="${escapeXML(level.glyph)}">${position}</text:list-level-style-bullet>`
      }
      const prefix = level.prefix ? ` style:num-prefix="${escapeXML(level.prefix)}"` : ''
      const suffix = level.suffix ? ` style:num-suffix="${escapeXML(level.suffix)}"` : ''
      const display = level.display > 1 ? ` text:display-levels="${level.display}"` : ''
      return `<text:list-level-style-number text:level="${index + 1}"${prefix}${suffix} style:num-format="${level.format}"${display} text:start-value="${level.start}">${position}</text:list-level-style-number>`
    })
    .join('')
  return automaticStyle(
    writer,
    'list',
    'L',
    `<text:list-style style:name="%NAME%">${body}</text:list-style>`,
  )
}

/** The ten levels a list numbers its tree with: its own at `depth`, its kind's below. */
function listLevels(list: EditorNode, writer: Writer, depth: number): ListLevel[] {
  const ordered = list.type.name === NODE.orderedList
  const scheme: ListNumberingScheme | null = listNumberingOf(list, writer.doc)
  const style = list.attrs.listStyle
  const own = typeof style === 'string' && listStylesFor(list.type.name).has(style) ? style : null
  return Array.from({ length: 10 }, (_, level): ListLevel => {
    if (scheme?.custom) {
      const custom = scheme.custom[level]
      if (custom) {
        if (custom.style === 'bullet') return { kind: 'bullet', glyph: custom.text || '•' }
        // `Step %1:`, `%1.%2)`: what is before the first number and after the
        // last, and how many levels' numbers the marker shows.
        const numbers = [...custom.text.matchAll(/%([1-9])/g)]
        const first = numbers[0]?.index ?? 0
        const last = numbers[numbers.length - 1]
        const end = last ? (last.index ?? 0) + last[0].length : custom.text.length
        return {
          kind: 'number',
          format: NUMBER_FORMATS[custom.style] ?? '1',
          prefix: custom.text.slice(0, first),
          suffix: custom.text.slice(end),
          display: Math.max(1, numbers.length),
          start: custom.start,
        }
      }
    }
    const atOwn = level === depth && own
    if (!ordered) {
      const glyph =
        (atOwn && BULLET_GLYPHS[own]) ||
        (scheme && scheme !== DEFAULT_LIST_NUMBERING && scheme.listType === 'bulletList'
          ? levelMarker(scheme, level)
          : BULLETS[level % BULLETS.length])
      return { kind: 'bullet', glyph: glyph as string }
    }
    const marker = atOwn
      ? own
      : scheme && scheme !== DEFAULT_LIST_NUMBERING
        ? levelMarker(scheme, level)
        : 'decimal'
    const outline = Boolean(scheme?.outline) && !atOwn
    return {
      kind: 'number',
      format: NUMBER_FORMATS[marker as string] ?? '1',
      prefix: '',
      suffix: outline ? '.' : (scheme?.suffix ?? '.') || '.',
      display: outline ? level + 1 : 1,
      start: level === depth ? listStart(list) : 1,
    }
  })
}

/** A bulleted or numbered list, its items' nested lists inside them, as ODF nests them. */
function listODF(
  list: EditorNode,
  writer: Writer,
  state: State,
  depth: number,
  style: string | null,
): string {
  const name = style ?? listStyle(writer, listLevels(list, writer, depth))
  const items = list.content.children.map((item) => {
    const itemState = styled(item, writer, state)
    const body = item.content.children
      .map((child) =>
        listKind(child) === 'bullet' || listKind(child) === 'ordered'
          ? listODF(
              child,
              writer,
              itemState,
              depth + 1,
              listKind(child) === listKind(list) ? name : null,
            )
          : blockODF(child, writer, { ...itemState, inCell: itemState.inCell }),
      )
      .join('')
    return `<text:list-item>${body}</text:list-item>`
  })
  return `<text:list text:style-name="${name}">${items.join('')}</text:list>`
}

/** The editor's quieter ink, a code line's number or a task list's tally: the theme's, else the chip's grey. */
function mutedInk(writer: Writer): string {
  return writer.palette.muted ? `#${writer.palette.muted.toLowerCase()}` : '#767676'
}

/** A task list as the editor shows it: a box before each task, a tally under the list. */
function taskListODF(list: EditorNode, writer: Writer, state: State, depth = 0): string {
  const muted = mutedInk(writer)
  const indent = state.indent + LEVEL_CM * (depth + 1)
  let out = list.content.children
    .map((item) => {
      const itemState = styled(item, writer, { ...state, indent })
      return item.content.children
        .map((child, index) => {
          if (listKind(child) === 'task') return taskListODF(child, writer, state, depth + 1)
          if (index !== 0 || !child.isTextblock) return blockODF(child, writer, itemState)
          const meta = taskMetaText(item.attrs)
          // The chip after a task is not struck through with its words.
          const chip = meta
            ? span(writer, escapeXML(` ${meta}`), {
                color: muted,
                size: writer.basePt * 0.85,
                strike: false,
              })
            : ''
          const looked = styled(child, writer, itemState)
          // Nor is its box.
          const glyph = escapeXML(taskGlyph(item))
          return paragraphXML(
            writer,
            child,
            looked,
            `${looked.text.strike ? span(writer, glyph, { strike: false }) : glyph} ${inlineODF(child, writer, itemState)}${chip}`,
            { after: 0, extra: { textIndent: -MARKER_CM } },
          )
        })
        .join('')
    })
    .join('')
  const tally = taskTally(list)
  if (tally) {
    out += paragraphXML(
      writer,
      null,
      { ...state, indent: state.indent + LEVEL_CM * depth },
      span(writer, escapeXML(tally), {
        color: muted,
        size: writer.basePt * 0.8,
      }),
    )
  }
  return out
}

/**
 * Footnotes, endnotes and a reference list as the editor sets them at the
 * end of the document: numbered, the endnotes in roman numerals, and an
 * author-date style's references not numbered at all.
 */
function notesODF(list: EditorNode, writer: Writer, state: State): string {
  const numbering = notesNumbering(list)
  if (numbering === 'none') return blocksODF(list.content.children, writer, state)
  const style = listStyle(writer, [
    {
      kind: 'number',
      format: numbering === 'lower-roman' ? 'i' : '1',
      prefix: '',
      suffix: '.',
      display: 1,
      start: 1,
    },
  ])
  const items = list.content.children.map((item) => {
    const itemState = styled(item, writer, state)
    const body = item.isTextblock
      ? paragraphXML(writer, item, itemState, inlineODF(item, writer, itemState))
      : blocksODF(item.content.children, writer, itemState)
    return `<text:list-item>${body}</text:list-item>`
  })
  return `<text:list text:style-name="${style}">${items.join('')}</text:list>`
}

/** A side of a table's cell as the stylesheet draws it, or the table's own grid. */
const GRID = '0.75pt solid #d9d9e3'

/** A table, merged cells spanning and the cells they cover written as covered. */
function tableODF(node: EditorNode, writer: Writer, state: State): string {
  const map = TableMap.of(node)
  writer.tables += 1
  const tableName = `Table${writer.tables}`
  const padding = attrString(node.attrs, 'cellPadding')
  const twips = padding ? lengthToTwips(padding, writer.basePt) : null
  const pad = twips !== null && twips >= 0 ? cm(twips * CM_PER_TWIP) : '0.1cm'
  const rows: string[] = []
  let headerRows = 0
  for (let row = 0; row < map.height; row++) {
    const cells: string[] = []
    let header = true
    for (let column = 0; column < map.width; column++) {
      const placed = map.at(row, column)
      if (!placed || placed.top !== row || placed.left !== column) {
        cells.push('<table:covered-table-cell/>')
        continue
      }
      const cell = placed.node
      if (cell.attrs.header !== true) header = false
      const captured = writer.rendered.get(cell)
      const fill = hex(attrString(cell.attrs, 'background')) ?? hex(captured?.box?.fill)
      const border = captured?.box?.border
      const line = border
        ? `${Math.max(0.5, border.width * 0.75)}pt solid ${hex(border.color) ?? '#d9d9e3'}`
        : GRID
      const vertical = attrString(cell.attrs, 'verticalAlign')
      const cellStyle = automaticStyle(
        writer,
        'table-cell',
        'C',
        `<style:style style:name="%NAME%" style:family="table-cell"><style:table-cell-properties fo:border="${line}" fo:padding="${pad}"${fill ? ` fo:background-color="${fill}"` : ''}${vertical === 'middle' ? ' style:vertical-align="middle"' : vertical === 'bottom' ? ' style:vertical-align="bottom"' : ''}/></style:style>`,
      )
      const spans = [
        placed.width > 1 ? ` table:number-columns-spanned="${placed.width}"` : '',
        placed.height > 1 ? ` table:number-rows-spanned="${placed.height}"` : '',
      ].join('')
      // A cell draws its own lines: the box round the table is not its paragraphs'.
      const own = attrString(cell.attrs, 'align')
      const cellState: State = {
        ...withLook(
          writer,
          { ...state, frame: undefined, inCell: true, indent: 0 },
          captured?.look,
        ),
        ...(own === 'center' || own === 'right' || own === 'left' ? { align: own } : {}),
      }
      const body = blocksODF(cell.content.children, writer, cellState)
      cells.push(
        `<table:table-cell table:style-name="${cellStyle}" office:value-type="string"${spans}>${body || '<text:p/>'}</table:table-cell>`,
      )
    }
    if (header && row === headerRows) headerRows += 1
    rows.push(`<table:table-row>${cells.join('')}</table:table-row>`)
  }
  const head = rows.slice(0, headerRows)
  const body = rows.slice(headerRows)
  const tableStyle = automaticStyle(
    writer,
    'table',
    'Tb',
    `<style:style style:name="%NAME%" style:family="table"><style:table-properties style:width="${cm(writer.textWidth)}" table:align="margins" fo:margin-bottom="0.28cm"/></style:style>`,
  )
  return `<table:table table:name="${tableName}" table:style-name="${tableStyle}"><table:table-column table:number-columns-repeated="${map.width}"/>${
    head.length > 0 ? `<table:table-header-rows>${head.join('')}</table:table-header-rows>` : ''
  }${body.join('')}</table:table>`
}

/** Columns side by side, as the editor lays them out: a table without lines, a cell a column. */
function columnsODF(node: EditorNode, writer: Writer, state: State): string {
  writer.tables += 1
  const cellStyle = automaticStyle(
    writer,
    'table-cell',
    'C',
    '<style:style style:name="%NAME%" style:family="table-cell"><style:table-cell-properties fo:border="none" fo:padding-left="0cm" fo:padding-right="0.4cm"/></style:style>',
  )
  const cells = node.content.children
    .map((column) => {
      const columnState: State = {
        ...styled(column, writer, state),
        frame: undefined,
        inCell: true,
        indent: 0,
      }
      return `<table:table-cell table:style-name="${cellStyle}" office:value-type="string">${
        blocksODF(column.content.children, writer, columnState) || '<text:p/>'
      }</table:table-cell>`
    })
    .join('')
  return `<table:table table:name="Table${writer.tables}"><table:table-column table:number-columns-repeated="${Math.max(1, node.childCount)}"/><table:table-row>${cells}</table:table-row></table:table>`
}

/** A gallery as the editor lays it out: its pictures side by side, as many to a row as it has columns. */
function galleryODF(node: EditorNode, writer: Writer, state: State): string {
  const columns = Math.min(6, Math.max(1, Math.round(attrNumber(node.attrs, 'columns') ?? 3)))
  const width = Math.floor((writer.textWidth / CM_PER_PX - 8 * (columns - 1)) / columns)
  const frames = node.content.children
    .filter((child) => child.type.name === NODE.image)
    .map((image) => pictureFrame(pictureOf(image, writer, width), writer))
    .filter((frame): frame is string => frame !== null)
  return paragraphXML(writer, null, state, frames.join(' '))
}

/** A link card as the editor shows it, in its box: the page's title, bold and a link, its description, the site. */
function linkCardODF(node: EditorNode, writer: Writer, state: State): string {
  const link = embedLink(node)
  const title = escapeXML(attrString(node.attrs, 'title') ?? link?.href ?? '')
  const muted = mutedInk(writer)
  const lines = [
    span(
      writer,
      link
        ? `<text:a xlink:type="simple" xlink:href="${escapeXML(link.href)}">${title}</text:a>`
        : title,
      { bold: true },
    ),
    ...['description', 'siteName']
      .map((key) => attrString(node.attrs, key))
      .filter((text): text is string => text !== null)
      .map((text) => span(writer, escapeXML(text), { color: muted, size: writer.basePt * 0.85 })),
  ]
  return lines
    .map((line, index) =>
      paragraphXML(writer, null, state, line, index < lines.length - 1 ? { after: 0.07 } : {}),
    )
    .join('')
}

export interface ODTOptions {
  readonly title?: string
  /** Body size in points; 11 by default. */
  readonly fontSize?: number
  /** Body font; Calibri by default, as the Word writer's. */
  readonly fontFamily?: string
  /** The editor's palette, so the document opens in the theme it was written in. */
  readonly theme?: ThemeTokens
  /** What the editor drew that the document does not hold: code colours, pictures, boxes. */
  readonly rendered?: RenderedDocument
}

/** The page as the document sets it up, and its footer and header, in `styles.xml`. */
function pageLayoutXML(
  doc: EditorNode,
  palette: DocumentPalette,
): { layout: string; master: string } {
  const stored = pageSetupAttr(doc.attrs.pageSetup) !== null
  const setup = pageSetupOf(doc.attrs.pageSetup)
  const paper = PAPER_SIZES[stored ? setup.size : 'letter']
  const landscape = stored && setup.orientation === 'landscape'
  const [width, height] = landscape ? [paper.height, paper.width] : [paper.width, paper.height]
  const margins = stored ? setup.margins : { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 }
  const mm = (value: number): string => `${Math.round(value * 100) / 100}mm`
  const background = palette.background
    ? ` fo:background-color="#${palette.background.toLowerCase()}"`
    : ''
  const band = (name: 'header' | 'footer', template: string): string => {
    if (!stored || !template) return ''
    const parts = pageTemplateParts(template)
      .map((part) =>
        'text' in part
          ? escapeXML(part.text)
          : part.field === 'page'
            ? '<text:page-number text:select-page="current">1</text:page-number>'
            : '<text:page-count>1</text:page-count>',
      )
      .join('')
    return `<style:${name}><text:p text:style-name="Band">${parts}</text:p></style:${name}>`
  }
  const bandStyle = (name: 'header' | 'footer'): string =>
    stored && setup[name]
      ? `<style:${name}-style><style:header-footer-properties fo:min-height="0cm" fo:margin-${name === 'header' ? 'bottom' : 'top'}="0.3cm"/></style:${name}-style>`
      : ''
  return {
    layout: `<style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="${mm(width)}" fo:page-height="${mm(height)}" style:print-orientation="${landscape ? 'landscape' : 'portrait'}" fo:margin-top="${mm(margins.top)}" fo:margin-bottom="${mm(margins.bottom)}" fo:margin-left="${mm(margins.left)}" fo:margin-right="${mm(margins.right)}"${background}/>${bandStyle('header')}${bandStyle('footer')}</style:page-layout>`,
    master: `<style:master-page style:name="Standard" style:page-layout-name="Page">${band('header', setup.header)}${band('footer', setup.footer)}</style:master-page>`,
  }
}

/** The document's named paragraph and character styles, as LibreOffice's own. */
function namedStylesXML(styles: readonly NamedStyle[]): string {
  return styles
    .filter((style) => !style.builtIn && (style.kind === 'paragraph' || style.kind === 'character'))
    .map((style) => {
      const text = textProperties(namedTextLook(style))
      const textXML = text ? `<style:text-properties ${text}/>` : ''
      const name = namedStyleId(style.id)
      const display = escapeXML(style.name)
      if (style.kind === 'character') {
        return `<style:style style:name="${name}" style:display-name="${display}" style:family="text">${textXML}</style:style>`
      }
      const props = style.props
      const paragraph = [
        props.align
          ? `fo:text-align="${props.align === 'left' ? 'start' : props.align === 'right' ? 'end' : props.align}"`
          : '',
        props.spaceBefore !== undefined ? `fo:margin-top="${props.spaceBefore}pt"` : '',
        props.spaceAfter !== undefined ? `fo:margin-bottom="${props.spaceAfter}pt"` : '',
        props.lineHeight !== undefined
          ? `fo:line-height="${Math.round(props.lineHeight * 100)}%"`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `<style:style style:name="${name}" style:display-name="${display}" style:family="paragraph" style:parent-style-name="Standard">${
        paragraph ? `<style:paragraph-properties ${paragraph}/>` : ''
      }${textXML}</style:style>`
    })
    .join('')
}

/** A formula object's own `content.xml`: the equation's MathML. */
function formulaContent(mathml: string): string {
  // The MathML namespace on the root, as LibreOffice's Math reads it.
  const root = mathml.replace(/^<math\b/, '<math').replace(/\sdisplay="[^"]*"/, '')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root}\n`
}

/** The document as the bytes of an `.odt` file. */
export function serializeToODT(doc: EditorNode, options: ODTOptions = {}): Uint8Array {
  const basePt = options.fontSize && options.fontSize > 0 ? options.fontSize : 11
  const palette = documentPalette(options.theme)
  const setup = pageSetupOf(doc.attrs.pageSetup)
  const stored = pageSetupAttr(doc.attrs.pageSetup) !== null
  const paper = PAPER_SIZES[stored ? setup.size : 'letter']
  const pageWidth = stored && setup.orientation === 'landscape' ? paper.height : paper.width
  const margins = stored ? setup.margins.left + setup.margins.right : 50.8
  const writer: Writer = {
    basePt,
    palette,
    rendered: options.rendered ?? new Map(),
    direction: textDirection(doc.attrs.direction) === 'rtl' ? 'rtl' : 'ltr',
    doc,
    namedStyles: new Map(documentStyles(doc).map((style) => [style.id, style])),
    styles: new Map(),
    automatic: [],
    pictures: [],
    formulas: [],
    textWidth: (pageWidth - margins) / 10,
    tables: 0,
    frames: 0,
  }
  const body = blocksODF(doc.content.children, writer, ROOT)
  const font = escapeXML(primaryFont(options.fontFamily ?? 'Calibri'))
  const ink = palette.text ? ` fo:color="#${palette.text.toLowerCase()}"` : ''
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NAMESPACES} office:version="1.3">
<office:automatic-styles>${writer.automatic.join('')}</office:automatic-styles>
<office:body><office:text>
${body}
</office:text></office:body>
</office:document-content>
`
  const headingStyles = [24, 20, 16, 14, 12, 11]
    .map(
      (size, index) =>
        `<style:style style:name="Heading_20_${index + 1}" style:display-name="Heading ${index + 1}" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="${index + 1}"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="${size}pt" fo:font-weight="bold"/></style:style>`,
    )
    .join('')
  const page = pageLayoutXML(doc, palette)
  const rule = palette.border ? `#${palette.border.toLowerCase()}` : '#808080'
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NAMESPACES} office:version="1.3">
<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="115%"/><style:text-properties fo:font-family="${font}" fo:font-size="${basePt}pt"${ink}/></style:default-style><style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.28cm"/></style:style>${headingStyles}<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0cm" fo:line-height="100%"/><style:text-properties fo:font-family="${CODE_FONT}" fo:font-size="10pt"/></style:style><style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/></style:style><style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.75pt solid ${rule}" fo:padding="0cm"/></style:style><style:style style:name="Band" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0cm"/><style:text-properties fo:font-size="9pt"/></style:style>${namedStylesXML(documentStyles(doc))}</office:styles>
<office:automatic-styles>${page.layout}</office:automatic-styles>
<office:master-styles>${page.master}</office:master-styles>
</office:document-styles>
`
  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NAMESPACES} office:version="1.3"><office:meta><meta:generator>Trevixal</meta:generator>${options.title ? `<dc:title>${escapeXML(options.title)}</dc:title>` : ''}</office:meta></office:document-meta>
`
  const formulas = writer.formulas.flatMap((formula) => [
    { name: `${formula.name}/content.xml`, data: formulaContent(formula.mathml) },
  ])
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIME}"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
${writer.pictures.map((entry) => ` <manifest:file-entry manifest:full-path="${entry.name}" manifest:media-type="${mimeForExtension(entry.name.split('.').pop() ?? '')}"/>`).join('\n')}
${writer.formulas.map((formula) => ` <manifest:file-entry manifest:full-path="${formula.name}/" manifest:version="1.3" manifest:media-type="${FORMULA_MIME}"/>\n <manifest:file-entry manifest:full-path="${formula.name}/content.xml" manifest:media-type="text/xml"/>`).join('\n')}
</manifest:manifest>
`
  return createZip([
    { name: 'mimetype', data: MIME },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
    { name: 'meta.xml', data: meta },
    ...writer.pictures,
    ...formulas,
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
