import type { EditorNode, Fragment, Mark, TextNode } from '@trevixal/core'
import { type RGB, parseColor } from './color'
import type { RenderedDocument, RenderedImage, RenderedRun } from './rendered'
import {
  NODE,
  attrString,
  blockLayout,
  cellSpan,
  decodeDataURL,
  headingLevel,
  imageDimensions,
  listKind,
  listStart,
  markNamed,
  primaryFont,
  tableColumns,
  taskGlyph,
} from './shared'
import { type ThemeTokens, documentPalette } from './theme'
import { lengthToHalfPoints, lengthToTwips } from './units'

export interface RTFOptions {
  /** Body font; Calibri by default. */
  readonly fontFamily?: string
  /** Body size in points; 11 by default. */
  readonly fontSize?: number
  /**
   * The editor's palette, so the document opens in the theme it was written
   * in. Omitted, the writer uses the reader's own black-on-white.
   */
  readonly theme?: ThemeTokens
  /**
   * What the editor drew that the document does not hold: highlighted code,
   * and the picture a diagram block only describes.
   */
  readonly rendered?: RenderedDocument
}

/** Heading sizes in half-points, h1 first. */
const HEADING_SIZES = [48, 40, 32, 28, 26, 24]

/** Twips of indent per list level or `indent` step (0.5in). */
const INDENT = 720

/** Usable width between default margins: 6.5in. */
const TABLE_WIDTH = 9360

const CODE_FONT = 'Courier New'

interface Context {
  readonly fonts: string[]
  readonly colors: RGB[]
  readonly sizeHp: number
  readonly basePt: number
  /** Colour-table index for the theme's body ink, or null when unthemed. */
  readonly text: number | null
  /** Colour-table index for the theme's page colour, or null when unthemed. */
  readonly background: number | null
  /** Colour-table index for the fill behind a code block. */
  readonly code: number | null
  /** The theme's link colour, or null for the reader's usual blue. */
  readonly accent: RGB | null
  /** Colour-table index for rules: table cells and horizontal rules. */
  readonly border: number | null
  readonly rendered: RenderedDocument
}

interface ParagraphState {
  /** Extra left indent in twips from enclosing lists and quotes. */
  readonly indent: number
  /** A list marker to place before the first paragraph of an item. */
  readonly marker: string | null
  readonly listDepth: number
  readonly italic: boolean
  readonly bold: boolean
  readonly inTable: boolean
  readonly align: string | null
}

const ROOT_STATE: ParagraphState = {
  indent: 0,
  marker: null,
  listDepth: 0,
  italic: false,
  bold: false,
  inTable: false,
  align: null,
}

/**
 * Rich Text Format export. Produces a single self-contained RTF 1.x document
 * that Word, LibreOffice, WordPad and macOS TextEdit all open. Fidelity
 * covers everything the default schema holds plus tables; images have no
 * dependency-free encoding here and are written as their alt text.
 */
export function serializeToRTF(doc: EditorNode, options: RTFOptions = {}): string {
  const basePt = options.fontSize && options.fontSize > 0 ? options.fontSize : 11
  const palette = documentPalette(options.theme)
  const colors: RGB[] = []
  // Registered before the body so the theme's own colours take the lowest
  // indices, and so `context` can name them while blocks are being written.
  const register = (hex: string | null): number | null => {
    const rgb = hex ? parseColor(`#${hex}`) : null
    if (!rgb) return null
    colors.push(rgb)
    return colors.length
  }
  const context: Context = {
    fonts: [primaryFont(options.fontFamily ?? 'Calibri'), CODE_FONT],
    colors,
    sizeHp: Math.round(basePt * 2),
    basePt,
    text: register(palette.text),
    background: register(palette.background),
    code: register(palette.code),
    accent: palette.accent ? parseColor(`#${palette.accent}`) : null,
    border: register(palette.border),
    rendered: options.rendered ?? new Map(),
  }
  // The body is written first so the font and colour tables list exactly
  // what it references.
  const body = writeBlocks(doc.content.children, context, ROOT_STATE).join('\n')

  const fontTable = context.fonts
    .map(
      (family, index) =>
        `{\\f${index}${index === 1 ? '\\fmodern' : '\\fnil'}\\fcharset0 ${escapeRTF(family)};}`,
    )
    .join('')
  const colorTable = context.colors
    .map((color) => `\\red${color.r}\\green${color.g}\\blue${color.b};`)
    .join('')

  const preamble = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033'
  const tables = `{\\fonttbl${fontTable}}{\\colortbl;${colorTable}}`
  return `${preamble}${tables}${pageBackground(palette.background)}\\viewkind4\\uc1\n${body}\n}`
}

/**
 * The page colour, as the ignorable shape destination Word itself writes for
 * one. Paragraph shading is what actually carries the theme, see
 * {@link paragraphStart}, because this group is the first thing a simpler
 * reader skips; what it adds is the colour reaching the margins too.
 */
function pageBackground(hex: string | null): string {
  const rgb = hex ? parseColor(`#${hex}`) : null
  if (!rgb) return ''
  // Office shape colours are packed as 0x00BBGGRR, not as the RGB the rest of
  // this file writes.
  const fill = rgb.r + (rgb.g << 8) + (rgb.b << 16)
  const property = (name: string, value: number): string => `{\\sp{\\sn ${name}}{\\sv ${value}}}`
  return [
    '\\viewbksp1{\\*\\background{\\shp{\\*\\shpinst\\shpleft0\\shptop0\\shpright0\\shpbottom0\\shpfhdr0\\shpbxmargin\\shpbymargin\\shpwr0\\shpfblwtxt1\\shpz0\\shplid1025',
    property('shapeType', 1),
    property('fFilled', 1),
    property('fillColor', fill),
    property('fLine', 0),
    property('fBackground', 1),
    '}}}',
  ].join('')
}

function fontIndex(context: Context, family: string): number {
  const name = primaryFont(family)
  const existing = context.fonts.indexOf(name)
  if (existing >= 0) return existing
  context.fonts.push(name)
  return context.fonts.length - 1
}

/** 1-based colour table index; 0 is reserved for "auto". */
function colorIndex(context: Context, color: RGB): number {
  const existing = context.colors.findIndex(
    (candidate) => candidate.r === color.r && candidate.g === color.g && candidate.b === color.b,
  )
  if (existing >= 0) return existing + 1
  context.colors.push(color)
  return context.colors.length
}

function writeBlocks(
  nodes: readonly EditorNode[],
  context: Context,
  state: ParagraphState,
): string[] {
  const out: string[] = []
  for (const node of nodes) out.push(...writeBlock(node, context, state))
  return out
}

/** One block as zero or more paragraphs, each terminated by `\par` (or `\row`). */
function writeBlock(node: EditorNode, context: Context, state: ParagraphState): string[] {
  switch (node.type.name) {
    case NODE.paragraph:
      return [textblock(node, context, state, `\\f0\\fs${context.sizeHp}`)]
    case NODE.heading: {
      const size = HEADING_SIZES[headingLevel(node) - 1] ?? 24
      return [textblock(node, context, state, `\\sb240\\sa120\\keepn\\b\\f0\\fs${size}`)]
    }
    case NODE.blockquote:
      return writeBlocks(node.content.children, context, {
        ...state,
        indent: state.indent + INDENT,
        italic: true,
      })
    case NODE.codeBlock: {
      const block = context.rendered.get(node)
      // The drawing replaces the source it was drawn from: the source is the
      // instruction, not a second way of reading the document. Only when
      // there is a drawing, though, otherwise the block would be dropped in
      // favour of nothing at all.
      const drawn = block?.image ? diagramParagraph(block.image, context, state) : null
      if (drawn) return [drawn]
      const size = Math.max(2, context.sizeHp - 2)
      const body = codeRuns(node.textContent, block?.runs, context)
      return [
        `${paragraphStart(context, state, null)}${codeShading(
          context,
        )}\\f1\\fs${size} ${body}\\par`,
      ]
    }
    case NODE.horizontalRule:
      return [
        `${paragraphStart(context, state, null)}\\brdrb\\brdrs\\brdrw10${rule(
          context,
        )}\\brsp20\\fs6 \\par`,
      ]
    case NODE.bulletList:
    case NODE.orderedList:
    case NODE.taskList:
      return writeList(node, context, state)
    case NODE.table:
      return writeTable(node, context, state)
    case NODE.image:
      return [imageParagraph(node, context, state)]
    case NODE.figure:
      return writeBlocks(node.content.children, context, state)
    case NODE.caption:
      return [
        textblock(
          node,
          context,
          { ...state, italic: true, align: 'center' },
          `\\f0\\fs${Math.max(2, context.sizeHp - 2)}`,
        ),
      ]
    default:
      if (node.isTextblock) return [textblock(node, context, state, `\\f0\\fs${context.sizeHp}`)]
      if (node.isAtom || node.childCount === 0) {
        const text = node.textContent
        return text
          ? [
              `${paragraphStart(context, state, null)}\\f0\\fs${context.sizeHp} ${escapeRTF(
                text,
              )}\\par`,
            ]
          : []
      }
      return writeBlocks(node.content.children, context, state)
  }
}

/**
 * `\pard` plus the paragraph-level control words the state implies.
 *
 * This is also where a theme is applied. `\plain` resets the ink to the
 * reader's automatic colour, so the theme's has to be restated on every
 * paragraph; and the shading goes on the paragraph rather than being left to
 * the page background alone, because a reader that skips the background group
 * would otherwise render pale text on white.
 */
function paragraphStart(context: Context, state: ParagraphState, node: EditorNode | null): string {
  let out = '\\pard\\plain'
  if (state.inTable) out += '\\intbl'
  if (context.background !== null) out += `\\cbpat${context.background}`
  if (context.text !== null) out += `\\cf${context.text}`
  const layout = node ? blockLayout(node, context.basePt) : null
  const align = layout?.align ?? state.align
  if (align === 'center') out += '\\qc'
  else if (align === 'right') out += '\\qr'
  else if (align === 'justify') out += '\\qj'
  const indent = state.indent + (layout?.indent ?? 0) * INDENT
  if (indent > 0) out += `\\li${indent}`
  if (state.marker !== null) out += '\\fi-360'
  if (layout?.spaceBefore) out += `\\sb${layout.spaceBefore}`
  if (layout?.spaceAfter) out += `\\sa${layout.spaceAfter}`
  if (layout?.lineHeight) {
    out +=
      'multiplier' in layout.lineHeight
        ? `\\sl${Math.round(layout.lineHeight.multiplier * 240)}\\slmult1`
        : `\\sl${layout.lineHeight.twips}\\slmult0`
  }
  if (state.italic) out += '\\i'
  if (state.bold) out += '\\b'
  return out
}

/**
 * The fill behind a code block, overriding the page shading `paragraphStart`
 * has just written. A later `\cbpat` wins within the same paragraph.
 */
function codeShading(context: Context): string {
  return context.code === null ? '' : `\\cbpat${context.code}`
}

/** The colour a rule is drawn in; empty leaves it to the reader. */
function rule(context: Context): string {
  return context.border === null ? '' : `\\brdrcf${context.border}`
}

function textblock(
  node: EditorNode,
  context: Context,
  state: ParagraphState,
  props: string,
): string {
  const marker = state.marker === null ? '' : `${state.marker}\\tab `
  return `${paragraphStart(context, state, node)}${props} ${marker}${inline(
    node.content,
    context,
  )}\\par`
}

/**
 * A code block's text, highlighted where the editor highlighted it.
 *
 * Each run is its own group so the colour it sets is scoped to it, the way
 * every other inline run in this writer is written.
 */
function codeRuns(
  text: string,
  runs: readonly RenderedRun[] | undefined,
  context: Context,
): string {
  if (!runs || runs.length === 0) return escapeRTF(text)
  let out = ''
  for (const run of runs) {
    const color = parseColor(run.color)
    const controls = [
      color ? `\\cf${colorIndex(context, color)}` : '',
      run.bold ? '\\b' : '',
      run.italic ? '\\i' : '',
    ].join('')
    const body = escapeRTF(run.text)
    out += controls ? `{${controls} ${body}}` : body
  }
  return out
}

/**
 * The picture a diagram block was previewing, as its own centred paragraph,
 * or null if the format cannot carry the bitmap it was given.
 */
function diagramParagraph(
  image: RenderedImage,
  context: Context,
  state: ParagraphState,
): string | null {
  const drawn = picture(image.src ?? null, image.width, image.height)
  if (!drawn) return null
  return `${paragraphStart(context, { ...state, align: 'center' }, null)}${drawn}\\par`
}

function imageParagraph(node: EditorNode, context: Context, state: ParagraphState): string {
  const alt = attrString(node.attrs, 'alt') ?? attrString(node.attrs, 'title') ?? 'image'
  const alignRaw = attrString(node.attrs, 'align')
  const align = alignRaw === 'center' || alignRaw === 'right' ? alignRaw : state.align
  const start = paragraphStart(context, { ...state, align }, null)
  const drawn = picture(attrString(node.attrs, 'src'), null, null)
  if (drawn) return `${start}${drawn}\\par`
  return `${start}\\f0\\fs${context.sizeHp} ${escapeRTF(`[${alt}]`)}\\par`
}

/** Twips per pixel at the 96dpi the editor lays out in. */
const TWIPS_PER_PX = 15
/** Widest a picture may render before it is scaled down to the text width. */
const MAX_PICTURE_PX = 624

/**
 * An embedded bitmap, as RTF spells one: a `\pict` destination holding the
 * file's bytes in hexadecimal.
 *
 * `\picw`/`\pich` are the picture's own size and `\picwgoal`/`\pichgoal`
 * the size to draw it at, in twips, without the pair a reader has nothing to
 * scale against and renders the thing at whatever its pixel count implies.
 *
 * PNG and JPEG only: those are the two `\*blip` forms readers agree on, and
 * anything else, an SVG especially, would be written as bytes no reader
 * could decode.
 */
function picture(src: string | null, width: number | null, height: number | null): string | null {
  const decoded = src ? decodeDataURL(src) : null
  if (!decoded) return null
  const blip =
    decoded.mime === 'image/png' ? 'pngblip' : decoded.mime === 'image/jpeg' ? 'jpegblip' : null
  if (!blip) return null
  const natural = imageDimensions(decoded.bytes)
  const pixelWidth = width ?? natural?.width ?? MAX_PICTURE_PX
  const ratio = natural && natural.width > 0 ? natural.height / natural.width : 0.75
  const drawWidth = Math.min(pixelWidth, MAX_PICTURE_PX)
  const drawHeight = height !== null ? (height * drawWidth) / pixelWidth : drawWidth * ratio
  const dimensions = [
    `\\picw${natural?.width ?? Math.round(pixelWidth)}`,
    `\\pich${natural?.height ?? Math.round(pixelWidth * ratio)}`,
    `\\picwgoal${Math.round(drawWidth * TWIPS_PER_PX)}`,
    `\\pichgoal${Math.round(drawHeight * TWIPS_PER_PX)}`,
  ].join('')
  return `{\\pict\\${blip}${dimensions} ${hex(decoded.bytes)}}`
}

const HEX_DIGITS = '0123456789abcdef'

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    out += HEX_DIGITS[(byte >> 4) & 0xf]
    out += HEX_DIGITS[byte & 0xf]
  }
  return out
}

function writeList(list: EditorNode, context: Context, state: ParagraphState): string[] {
  const kind = listKind(list) ?? 'bullet'
  const out: string[] = []
  let number = listStart(list)
  const depth = state.listDepth
  for (const item of list.content.children) {
    let marker: string
    if (kind === 'ordered') marker = `${number++}.`
    else if (kind === 'task' || item.type.name === NODE.taskItem)
      marker = escapeRTF(taskGlyph(item))
    else marker = '\\bullet'
    const itemState: ParagraphState = {
      ...state,
      // `state.indent` already carries the enclosing levels, so each list adds
      // exactly one stop, multiplying by the depth again would compound it.
      indent: state.indent + INDENT,
      listDepth: depth + 1,
      marker: null,
    }
    item.content.children.forEach((block, index) => {
      const withMarker = index === 0 && block.isTextblock
      out.push(...writeBlock(block, context, withMarker ? { ...itemState, marker } : itemState))
    })
  }
  return out
}

function writeTable(table: EditorNode, context: Context, state: ParagraphState): string[] {
  const columns = tableColumns(table)
  const unit = Math.floor(TABLE_WIDTH / columns)
  const borders = attrString(table.attrs, 'borders') !== 'none'
  const rows: string[] = []
  for (const row of table.content.children) {
    if (row.type.name !== NODE.tableRow) continue
    let definition = '\\trowd\\trgaph108\\trleft-108'
    let right = 0
    const cells: string[] = []
    for (const cell of row.content.children) {
      if (cell.type.name !== NODE.tableCell) continue
      right += unit * cellSpan(cell)
      const background = parseColor(cell.attrs.background)
      if (borders) {
        // A rule left uncoloured is drawn in the reader's automatic black,
        // which on a dark page is a table with no visible grid at all.
        const edge = rule(context)
        definition += ['t', 'l', 'b', 'r']
          .map((side) => `\\clbrdr${side}\\brdrs\\brdrw10${edge}`)
          .join('')
      }
      if (background) definition += `\\clcbpat${colorIndex(context, background)}`
      definition += `\\cellx${right}`

      const align = attrString(cell.attrs, 'align')
      const cellState: ParagraphState = {
        ...state,
        indent: 0,
        marker: null,
        listDepth: 0,
        inTable: true,
        bold: state.bold || cell.attrs.header === true,
        align: align === 'center' || align === 'right' ? align : null,
      }
      const paragraphs = writeBlocks(cell.content.children, context, cellState)
      // `\cell` ends the cell's last paragraph in place of `\par`.
      const last = paragraphs.pop() ?? `${paragraphStart(context, cellState, null)} \\par`
      paragraphs.push(
        last.endsWith('\\par') ? `${last.slice(0, -4)}\\cell` : `${last}\n\\pard\\intbl\\cell`,
      )
      cells.push(paragraphs.join('\n'))
    }
    rows.push(`${definition}\n${cells.join('\n')}\n\\row`)
  }
  return rows
}

interface LinkGroup {
  readonly href: string
  readonly nodes: EditorNode[]
}

function inline(content: Fragment, context: Context): string {
  let out = ''
  const children = content.children
  let index = 0
  while (index < children.length) {
    const child = children[index] as EditorNode
    const link = child.isText ? markNamed(child.marks, 'link') : undefined
    const href = link ? attrString(link.attrs, 'href') : null
    if (href) {
      const group: LinkGroup = { href, nodes: [child] }
      index++
      while (index < children.length) {
        const next = children[index] as EditorNode
        const nextLink = next.isText ? markNamed(next.marks, 'link') : undefined
        if (!nextLink || attrString(nextLink.attrs, 'href') !== href) break
        group.nodes.push(next)
        index++
      }
      const text = group.nodes.map((node) => inlineNode(node, context)).join('')
      out += `{\\field{\\*\\fldinst{HYPERLINK "${escapeRTF(href)}"}}{\\fldrslt{\\ul\\cf${colorIndex(
        context,
        context.accent ?? { r: 5, g: 99, b: 193 },
      )} ${text}}}}`
      continue
    }
    out += inlineNode(child, context)
    index++
  }
  return out
}

function inlineNode(node: EditorNode, context: Context): string {
  if (node.isText) return run(node as TextNode, context)
  if (node.type.name === NODE.hardBreak) return '\\line '
  if (node.type.name === NODE.image) {
    const alt = attrString(node.attrs, 'alt') ?? 'image'
    return escapeRTF(`[${alt}]`)
  }
  const text = node.textContent || String(node.type.spec.toHTML?.(node)?.text ?? '')
  return escapeRTF(text)
}

function run(node: TextNode, context: Context): string {
  const controls = markControls(node.marks, context)
  const text = escapeRTF(node.text)
  return controls ? `{${controls} ${text}}` : text
}

function markControls(marks: readonly Mark[], context: Context): string {
  let out = ''
  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        out += '\\b'
        break
      case 'italic':
        out += '\\i'
        break
      case 'underline':
        out += '\\ul'
        break
      case 'strikethrough':
        out += '\\strike'
        break
      case 'superscript':
        out += '\\super'
        break
      case 'subscript':
        out += '\\sub'
        break
      case 'smallCaps':
        out += '\\scaps'
        break
      case 'code':
        out += '\\f1'
        break
      case 'highlight': {
        const color = parseColor(mark.attrs.color) ?? { r: 255, g: 255, b: 0 }
        out += `\\highlight${colorIndex(context, color)}`
        break
      }
      case 'textColor': {
        const color = parseColor(mark.attrs.color)
        if (color) out += `\\cf${colorIndex(context, color)}`
        break
      }
      case 'backgroundColor': {
        const color = parseColor(mark.attrs.color)
        if (color) {
          const index = colorIndex(context, color)
          out += `\\chcbpat${index}\\cb${index}`
        }
        break
      }
      case 'fontFamily': {
        const family = attrString(mark.attrs, 'family')
        if (family) out += `\\f${fontIndex(context, family)}`
        break
      }
      case 'fontSize': {
        const size = lengthToHalfPoints(mark.attrs.size, context.basePt)
        if (size !== null) out += `\\fs${size}`
        break
      }
      case 'letterSpacing': {
        const twips = lengthToTwips(mark.attrs.spacing, context.basePt)
        if (twips !== null) out += `\\expndtw${twips}`
        break
      }
      default:
        // link is handled by the caller; other marks have no RTF equivalent.
        break
    }
  }
  return out
}

/**
 * Escape text for RTF: the three syntax characters, line and tab controls,
 * and every non-ASCII UTF-16 code unit as a signed `\uN?` escape. Surrogate
 * pairs come out as two escapes, which is how RTF spells astral characters.
 */
export function escapeRTF(text: string): string {
  let out = ''
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    const char = text[index] as string
    if (char === '\\' || char === '{' || char === '}') out += `\\${char}`
    else if (char === '\n') out += '\\line '
    else if (char === '\t') out += '\\tab '
    else if (char === '\r') continue
    else if (code < 0x20) continue
    else if (code >= 0x80) out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`
    else out += char
  }
  return out
}
