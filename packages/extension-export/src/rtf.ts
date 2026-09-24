import {
  type BorderStyle,
  DEFAULT_LIST_NUMBERING,
  type EditorNode,
  type Fragment,
  type ListNumberingScheme,
  type Mark,
  type NamedStyle,
  type StyleProps,
  type TextNode,
  columnCount,
  documentStyles,
  dropCapOf,
  formatListCounter,
  headingNumbers,
  inlineLength,
  listMarker,
  listNumberingOf,
  listStylesFor,
  paragraphBorderOf,
  paragraphShadingOf,
  safeStyleId,
  sliceInline,
  tabStopsOf,
  taskMetaText,
  textDirection,
} from '@trevixal/core'
import { type RGB, parseColor } from './color'
import type { RenderedDocument, RenderedImage, RenderedRun } from './rendered'
import {
  type CellSide,
  NODE,
  attrString,
  blockLayout,
  cellSpan,
  decodeDataURL,
  headingLevel,
  hiddenCellSides,
  imageDimensions,
  listKind,
  listStart,
  markNamed,
  primaryFont,
  tableColumns,
  taskGlyph,
} from './shared'
import { type TableColors, type TableLine, type TableLook, tableLook } from './table-look'
import { type ThemeTokens, documentPalette } from './theme'
import { lengthToHalfPoints, lengthToTwips } from './units'
import { jsonEntries, sequenceName } from './word-fields'

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
  /** The document being written: its settings resolve what its lists name. */
  readonly doc: EditorNode
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
  /** The page and ink a table style's tints are mixed against. */
  readonly tableColors: TableColors
  readonly rendered: RenderedDocument
  /** The document's direction; a paragraph without one of its own takes it. */
  readonly direction: 'ltr' | 'rtl'
  /** The document's named styles by id, whose look is written into each paragraph and run. */
  readonly styles: ReadonlyMap<string, NamedStyle>
  /**
   * Each numbered heading's number, written as text before it: RTF readers
   * number lists, but no simpler one links a list to heading styles.
   */
  /** Top-level headings' numbers, by their index in the document. */
  readonly headingLabels: ReadonlyMap<number, string>
}

interface ParagraphState {
  /** Extra left indent in twips from enclosing lists and quotes. */
  readonly indent: number
  /** A list marker to place before the first paragraph of an item. */
  readonly marker: string | null
  /** RTF to end the first paragraph of an item with: a task's assignee and date. */
  readonly suffix?: string
  readonly listDepth: number
  /** The number of each enclosing list item, outermost first. */
  readonly listNumbers: readonly number[]
  /** The multilevel scheme the enclosing lists number with, if one does. */
  readonly listTree: ListTree | null
  readonly italic: boolean
  readonly bold: boolean
  /** Colour-table index for ink other than the page's: a styled table's header. */
  readonly ink?: number
  /** How many tables deep the paragraph sits: 0 outside one, 2 in a table in a cell. */
  readonly tableDepth: number
  /** The width a table here may take, in twips: the page's, or its cell's. */
  readonly tableWidth: number
  readonly align: string | null
}

/** A multilevel scheme, and where its tree's numbers begin in `listNumbers`. */
interface ListTree {
  readonly scheme: ListNumberingScheme
  readonly from: number
}

const ROOT_STATE: ParagraphState = {
  indent: 0,
  marker: null,
  listDepth: 0,
  listNumbers: [],
  listTree: null,
  italic: false,
  bold: false,
  tableDepth: 0,
  tableWidth: TABLE_WIDTH,
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
    doc,
    fonts: [primaryFont(options.fontFamily ?? 'Calibri'), CODE_FONT],
    colors,
    sizeHp: Math.round(basePt * 2),
    basePt,
    text: register(palette.text),
    background: register(palette.background),
    code: register(palette.code),
    accent: palette.accent ? parseColor(`#${palette.accent}`) : null,
    border: register(palette.border),
    tableColors: {
      page: parseColor(palette.background ? `#${palette.background}` : null) ?? WHITE,
      ink: parseColor(palette.text ? `#${palette.text}` : null) ?? BLACK,
    },
    rendered: options.rendered ?? new Map(),
    direction: textDirection(doc.attrs.direction) === 'rtl' ? 'rtl' : 'ltr',
    styles: new Map(documentStyles(doc).map((style) => [style.id, style])),
    headingLabels: new Map(headingNumbers(doc).map((entry) => [entry.index, entry.label] as const)),
  }
  // The body is written first so the font and colour tables list exactly
  // what it references.
  // Top level by index, which is how a heading's number is found: the same
  // heading node can stand at two places in a document and be two numbers.
  const body = doc.content.children
    .flatMap((node, index) =>
      writeBlock(node, context, ROOT_STATE, context.headingLabels.get(index)),
    )
    .join('\n')

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
  // Document and section settings: a right-to-left document, and Word's line
  // numbers, counting every line and running on through the document.
  const settings = [
    context.direction === 'rtl' ? '\\rtldoc' : '',
    // Widow control, on unless the document turned it off, and hyphenation.
    doc.attrs.widowControl === false ? '' : '\\widowctrl',
    doc.attrs.hyphenation === true ? '\\hyphauto1' : '',
    sectionRTF(doc),
  ].join('')
  return `${preamble}${tables}${pageBackground(palette.background)}\\viewkind4\\uc1${settings}\n${body}\n}`
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
function writeBlock(
  node: EditorNode,
  context: Context,
  state: ParagraphState,
  headingLabel?: string,
): string[] {
  switch (node.type.name) {
    case NODE.paragraph:
      return [textblock(node, context, state, `\\f0\\fs${context.sizeHp}`)]
    case NODE.heading: {
      const size = HEADING_SIZES[headingLevel(node) - 1] ?? 24
      const number = headingLabel ? `${escapeRTF(headingLabel)} ` : ''
      return [textblock(node, context, state, `\\sb240\\sa120\\keepn\\b\\f0\\fs${size}`, number)]
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
    // A table of figures and an index are their entries, as text; a reader
    // with fields of its own rebuilds them from the captions and marks. They
    // are passed as the paragraph's node for the document's direction.
    case 'captionList':
      return jsonEntries(node.attrs.entries).flatMap((entry) =>
        typeof entry.text === 'string'
          ? [
              `${paragraphStart(context, state, node)}\\f0\\fs${context.sizeHp} ${escapeRTF(entry.text)}\\par`,
            ]
          : [],
      )
    case 'documentIndex':
      return indexLines(node).map(
        (line) =>
          `${paragraphStart(context, { ...state, indent: state.indent + (line.sub ? INDENT / 2 : 0) }, node)}\\f0\\fs${context.sizeHp} ${escapeRTF(line.text)}\\par`,
      )
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
  if (state.tableDepth > 0) out += '\\intbl'
  if (state.tableDepth > 1) out += `\\itap${state.tableDepth}`
  // A paragraph's own direction, or the document's; code (no node) runs left to right.
  const direction = node ? (textDirection(node.attrs.dir) ?? context.direction) : 'ltr'
  if (direction === 'rtl') out += '\\rtlpar'
  const shading = node ? parseColor(paragraphShadingOf(node.attrs)) : null
  if (shading) out += `\\cbpat${colorIndex(context, shading)}`
  else if (context.background !== null) out += `\\cbpat${context.background}`
  if (context.text !== null) out += `\\cf${context.text}`
  if (state.ink !== undefined) out += `\\cf${state.ink}`
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
  if (node) out += paragraphBorderRTF(context, node)
  if (node) out += tabStopsRTF(node)
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
  prefix = '',
): string {
  const dropped = dropCapFrame(node, context, state)
  if (dropped) return `${dropped.frame}${textblock(dropped.rest, context, state, props, prefix)}`
  const marker = state.marker === null ? '' : `${state.marker}\\tab `
  // The paragraph's named style after the writer's own defaults, so it wins over them.
  const style = paragraphStyleRTF(context, node)
  return `${paragraphStart(context, state, node)}${props}${style} ${marker}${prefix}${inline(
    node.content,
    context,
  )}${state.suffix ?? ''}\\par`
}

/** Grey, as the editor's chip is: the ink a task's assignee and date are written in. */
const TASK_META_INK: RGB = { r: 0x76, g: 0x76, b: 0x76 }

/** A task's assignee and due date, after its text, smaller and in grey. */
function taskMetaRTF(item: EditorNode, context: Context): string {
  const text = taskMetaText(item.attrs)
  if (!text) return ''
  const size = Math.max(2, Math.round(context.sizeHp * 0.85))
  return `{\\cf${colorIndex(context, TASK_META_INK)}\\fs${size} ${escapeRTF(` ${text}`)}}`
}

/** The section's own settings: Word's line numbers, and newspaper columns. */
function sectionRTF(doc: EditorNode): string {
  const lines = doc.attrs.lineNumbers === true ? '\\linemod1\\linex360\\linecont' : ''
  const count = columnCount(doc.attrs.columns)
  const rule = count > 1 && doc.attrs.columnRule === true ? '\\linebetcol' : ''
  const columns = count > 1 ? `\\cols${count}\\colsx720${rule}` : ''
  return lines || columns ? `\\sectd${lines}${columns}` : ''
}

const RTF_TAB_ALIGN = { left: '', center: '\\tqc', right: '\\tqr', decimal: '\\tqdec' } as const
const RTF_TAB_LEADER = {
  none: '',
  dot: '\\tldot',
  hyphen: '\\tlhyph',
  underscore: '\\tlul',
} as const

/** A paragraph's custom tab stops: each its alignment, its leader, then its position in twips. */
function tabStopsRTF(node: EditorNode): string {
  return tabStopsOf(node.attrs)
    .map(
      (stop) =>
        `${RTF_TAB_ALIGN[stop.align]}${RTF_TAB_LEADER[stop.leader]}\\tx${Math.round(stop.position * 20)}`,
    )
    .join('')
}

/** A style's run look as control words: font, size, colour, weight, slant, underline. */
function styleRTF(context: Context, props: StyleProps): string {
  let out = ''
  if (props.fontFamily) out += `\\f${fontIndex(context, props.fontFamily)}`
  if (props.fontSize !== undefined) out += `\\fs${Math.round(props.fontSize * 2)}`
  const color = parseColor(props.color)
  if (color) out += `\\cf${colorIndex(context, color)}`
  if (props.bold !== undefined) out += props.bold ? '\\b' : '\\b0'
  if (props.italic !== undefined) out += props.italic ? '\\i' : '\\i0'
  if (props.underline !== undefined) out += props.underline ? '\\ul' : '\\ulnone'
  return out
}

/**
 * The built-in styles' own look, which RTF has no style sheet to carry: Title,
 * Subtitle and the character styles as Word draws them before a document
 * changes anything in them (see word-styles.ts). A heading brings its own.
 */
const BUILT_IN_LOOK: Readonly<Record<string, StyleProps>> = {
  title: { fontSize: 28, spaceAfter: 12 },
  subtitle: { fontSize: 15, color: '#5a5a5a', spaceAfter: 8 },
  emphasis: { italic: true },
  strong: { bold: true },
  subtleEmphasis: { italic: true, color: '#404040' },
}

/** A style's props laid over the built-in look it starts from. */
function lookOf(id: string, props: StyleProps): StyleProps {
  return { ...BUILT_IN_LOOK[id], ...props }
}

const RTF_ALIGN = { left: '\\ql', center: '\\qc', right: '\\qr', justify: '\\qj' } as const

/**
 * A paragraph's or heading's named style, as RTF has no styles of its own to
 * point at: Normal's font and colour, which every style is based on, then its
 * own style's look, and its spacing and alignment where the paragraph sets
 * none directly. Other blocks keep the writer's own look.
 */
function paragraphStyleRTF(context: Context, node: EditorNode): string {
  if (node.type.name !== NODE.paragraph && node.type.name !== NODE.heading) return ''
  const own =
    node.type.name === NODE.heading
      ? `heading${headingLevel(node)}`
      : (safeStyleId(node.attrs.paragraphStyle) ?? 'normal')
  const normal = context.styles.get('normal')?.props ?? {}
  const props = own === 'normal' ? normal : lookOf(own, context.styles.get(own)?.props ?? {})
  const based = own === 'normal' ? {} : { fontFamily: normal.fontFamily, color: normal.color }
  const look = Object.fromEntries(
    Object.entries({ ...based, ...props }).filter(([, value]) => value !== undefined),
  ) as StyleProps
  let out = styleRTF(context, look)
  if (props.align && !node.attrs.align) out += RTF_ALIGN[props.align]
  if (props.spaceBefore !== undefined && node.attrs.spaceBefore == null) {
    out += `\\sb${Math.round(props.spaceBefore * 20)}`
  }
  if (props.spaceAfter !== undefined && node.attrs.spaceAfter == null) {
    out += `\\sa${Math.round(props.spaceAfter * 20)}`
  }
  if (props.lineHeight !== undefined && node.attrs.lineHeight == null) {
    out += `\\sl${Math.round(props.lineHeight * 240)}\\slmult1`
  }
  return out
}

/** RTF's border style words. */
const RTF_BORDER: Readonly<Record<BorderStyle, string>> = {
  solid: '\\brdrs',
  dashed: '\\brdrdash',
  dotted: '\\brdrdot',
  double: '\\brdrdb',
}

const RTF_SIDE = { top: '\\brdrt', right: '\\brdrr', bottom: '\\brdrb', left: '\\brdrl' } as const

/** A paragraph's border: per side its style, width (a px is 15 twips), gap and colour. */
function paragraphBorderRTF(context: Context, node: EditorNode): string {
  const border = paragraphBorderOf(node.attrs)
  if (!border) return ''
  const rgb = parseColor(border.color)
  const color = rgb ? `\\brdrcf${colorIndex(context, rgb)}` : ''
  return border.sides
    .map((side) => {
      const space = side === 'top' || side === 'bottom' ? 20 : 80
      return `${RTF_SIDE[side]}${RTF_BORDER[border.style]}\\brdrw${border.width * 15}\\brsp${space}${color}`
    })
    .join('')
}

/**
 * A drop cap: the first letter in a frame paragraph of its own, dropped over
 * (or hung in the margin beside) the next lines, then the rest of the text.
 */
function dropCapFrame(
  node: EditorNode,
  context: Context,
  state: ParagraphState,
): { frame: string; rest: EditorNode } | null {
  const dropCap = dropCapOf(node.attrs)
  const first = node.content.maybeChild(0)
  if (!dropCap || !first?.isText) return null
  const text = first.textContent
  const code = text.charCodeAt(0)
  const length = code >= 0xd800 && code <= 0xdbff && text.length > 1 ? 2 : 1
  const letter = text.slice(0, length)
  if (letter.trim() === '') return null
  const size = Math.round(dropCap.lines * context.sizeHp * 1.2 * 0.85)
  const kind = dropCap.kind === 'drop' ? 1 : 2
  const frame = `${paragraphStart(context, state, node)}\\dropcapli${dropCap.lines}\\dropcapt${kind}\\pvpara\\wraparound\\f0\\fs${size} ${escapeRTF(letter)}\\par`
  const rest = node
    .withAttrs({ ...node.attrs, dropCap: null, dropCapLines: null })
    .withContent(sliceInline(node.content, length, inlineLength(node.content)))
  return { frame, rest }
}

/** An index's entries as lines of text: "apple, 1, 3", its subentries indented under it. */
function indexLines(node: EditorNode): { text: string; sub: boolean }[] {
  const labels = (locations: unknown): string =>
    Array.isArray(locations)
      ? locations
          .map((location) => (location as Record<string, unknown>).label)
          .filter((label): label is string => typeof label === 'string')
          .join(', ')
      : ''
  const lines: { text: string; sub: boolean }[] = []
  for (const entry of jsonEntries(node.attrs.entries)) {
    if (typeof entry.term !== 'string') continue
    const own = labels(entry.locations)
    lines.push({ text: own ? `${entry.term}, ${own}` : entry.term, sub: false })
    for (const sub of Array.isArray(entry.subentries) ? entry.subentries : []) {
      const record = sub as Record<string, unknown>
      if (typeof record.term === 'string') {
        lines.push({ text: `${record.term}, ${labels(record.locations)}`, sub: true })
      }
    }
  }
  return lines
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
  const depth = state.listDepth
  // A list storing a scheme opens a tree; a list of its type below continues
  // it, level by level, as the stylesheet's `[data-numbering] ol` rules do.
  const scheme = listNumberingOf(list, context.doc)
  const tree: ListTree | null =
    scheme !== null && scheme !== DEFAULT_LIST_NUMBERING
      ? { scheme, from: state.listNumbers.length }
      : state.listTree
  const inTree = tree !== null && tree.scheme.listType === list.type.name
  // A defined level starts where it says, unless the list sets its own start.
  const levelStart = inTree
    ? tree.scheme.custom?.[state.listNumbers.length - tree.from]?.start
    : undefined
  let number = listStart(list) === 1 && levelStart !== undefined ? levelStart : listStart(list)
  const style = list.attrs.listStyle
  const ownStyle =
    typeof style === 'string' && listStylesFor(list.type.name).has(style) ? style : null
  list.content.children.forEach((item, index) => {
    // Every item counts, bullet or not, as the browser's `list-item` counter does.
    const own = kind === 'ordered' ? number++ : index + 1
    const numbers = [...state.listNumbers, own]
    let marker: string
    if (kind === 'task' || item.type.name === NODE.taskItem) marker = escapeRTF(taskGlyph(item))
    else if (kind === 'ordered' && ownStyle) marker = `${formatListCounter(own, ownStyle)}.`
    else if (inTree && !ownStyle)
      marker = escapeRTF(listMarker(tree.scheme, numbers.slice(tree.from)))
    else if (kind === 'ordered') marker = listMarker(DEFAULT_LIST_NUMBERING, numbers)
    else marker = '\\bullet'
    const itemState: ParagraphState = {
      ...state,
      // `state.indent` already carries the enclosing levels, so each list adds
      // exactly one stop, multiplying by the depth again would compound it.
      indent: state.indent + INDENT,
      listDepth: depth + 1,
      listNumbers: numbers,
      listTree: tree,
      marker: null,
    }
    const isTask = kind === 'task' || item.type.name === NODE.taskItem
    const suffix = isTask ? taskMetaRTF(item, context) : ''
    item.content.children.forEach((block, blockIndex) => {
      const withMarker = blockIndex === 0 && block.isTextblock
      out.push(
        ...writeBlock(block, context, withMarker ? { ...itemState, marker, suffix } : itemState),
      )
    })
  })
  return out
}

const WHITE: RGB = { r: 255, g: 255, b: 255 }
const BLACK: RGB = { r: 0, g: 0, b: 0 }

/** RTF's control word for each line style. */
const RTF_LINE_STYLES: Readonly<Record<TableLine['style'], string>> = {
  single: '\\brdrs',
  dashed: '\\brdrdash',
  dotted: '\\brdrdot',
  double: '\\brdrdb',
}

/** A cell border's style, weight (in twips) and colour. */
function rtfLine(line: TableLine, context: Context): string {
  // A rule left uncoloured is drawn in the reader's automatic black, which on
  // a dark page is a table with no visible grid at all.
  const color = line.color ? `\\brdrcf${colorIndex(context, line.color)}` : rule(context)
  return `${RTF_LINE_STYLES[line.style]}\\brdrw${Math.round(line.points * 20)}${color}`
}

/**
 * Which sides of a cell the table's own lines run along: RTF draws each
 * cell's border itself, so the table's border style is worked out per cell.
 */
function drawnSides(
  look: TableLook,
  rowIndex: number,
  cellIndex: number,
  rowCount: number,
  cellCount: number,
): Readonly<Record<'top' | 'left' | 'bottom' | 'right', boolean>> {
  const { edges } = look
  return {
    top: rowIndex === 0 ? edges.top : edges.insideH,
    bottom: rowIndex === rowCount - 1 ? edges.bottom : edges.insideH,
    left: cellIndex === 0 ? edges.left : edges.insideV,
    right: cellIndex === cellCount - 1 ? edges.right : edges.insideV,
  }
}

/** RTF's letter for each side of a cell's border, in the order it lists them. */
const RTF_SIDES: readonly (readonly [string, CellSide])[] = [
  ['t', 'top'],
  ['l', 'left'],
  ['b', 'bottom'],
  ['r', 'right'],
]

/** A table's own cell padding as RTF's row padding, every side in twips; empty for the default. */
function cellPaddingRTF(table: EditorNode, context: Context): string {
  const padding = attrString(table.attrs, 'cellPadding')
  const twips = padding ? lengthToTwips(padding, context.basePt) : null
  if (twips === null || twips < 0) return ''
  return ['l', 't', 'r', 'b'].map((side) => `\\trpadd${side}${twips}\\trpaddf${side}3`).join('')
}

/**
 * A table's rows. One in a cell is RTF's nested table: its paragraphs carry
 * their depth (`\itap2`), its cells end in `\nestcell`, and each row's
 * properties follow its cells in a `\nesttableprops` group, with a plain
 * paragraph break for a reader that knows nothing of nesting. It shares out
 * its cell's width rather than the page's.
 */
function writeTable(table: EditorNode, context: Context, state: ParagraphState): string[] {
  const depth = state.tableDepth + 1
  const nested = depth > 1
  const columns = tableColumns(table)
  const unit = Math.floor(state.tableWidth / columns)
  const look = tableLook(table, context.tableColors)
  const rowCount = table.childCount
  const rows: string[] = []
  for (const [rowIndex, row] of table.content.children.entries()) {
    if (row.type.name !== NODE.tableRow) continue
    // A right-to-left document lays its tables out from the right. A header
    // row heads every page, as Word's does; a table's own padding pads every
    // side of every cell, in twips.
    const header = row.content.children.every((cell) => cell.attrs.header === true)
    let definition = `\\trowd${context.direction === 'rtl' ? '\\rtlrow' : ''}${
      header && row.childCount > 0 ? '\\trhdr' : ''
    }\\trgaph108\\trleft-108${cellPaddingRTF(table, context)}`
    let right = 0
    const cells: string[] = []
    for (const [cellIndex, cell] of row.content.children.entries()) {
      if (cell.type.name !== NODE.tableCell) continue
      right += unit * cellSpan(cell)
      const cellLook = look.cell(rowIndex, cellIndex)
      // A line the Eraser took out is simply not written; a style's rule
      // under the header or over the total row takes the table's line's place.
      const hidden = hiddenCellSides(table, rowIndex, cellIndex)
      const drawn = drawnSides(look, rowIndex, cellIndex, rowCount, row.childCount)
      for (const [code, side] of RTF_SIDES) {
        if (hidden.has(side)) continue
        const line =
          (side === 'top' && cellLook.top) ||
          (side === 'bottom' && cellLook.bottom) ||
          (drawn[side] ? look.line : null)
        if (line) definition += `\\clbrdr${code}${rtfLine(line, context)}`
      }
      // The cell's own shading wins over its style's, as a direct format does in Word.
      const fill = parseColor(cell.attrs.background) ?? cellLook.fill
      if (fill) definition += `\\clcbpat${colorIndex(context, fill)}`
      const vertical = attrString(cell.attrs, 'verticalAlign')
      if (vertical === 'middle') definition += '\\clvertalc'
      if (vertical === 'bottom') definition += '\\clvertalb'
      definition += `\\cellx${right}`

      const align = attrString(cell.attrs, 'align')
      const cellState: ParagraphState = {
        ...state,
        indent: 0,
        marker: null,
        listDepth: 0,
        listNumbers: [],
        listTree: null,
        tableDepth: depth,
        tableWidth: unit * cellSpan(cell),
        bold: state.bold || cellLook.bold,
        ...(cellLook.ink ? { ink: colorIndex(context, cellLook.ink) } : {}),
        align: align === 'center' || align === 'right' ? align : null,
      }
      const paragraphs = writeBlocks(cell.content.children, context, cellState)
      // `\cell` ends the cell's last paragraph in place of `\par`; a cell
      // ending in a table of its own takes an empty paragraph to end on.
      const end = nested ? '\\nestcell' : '\\cell'
      const last = paragraphs.pop() ?? `${paragraphStart(context, cellState, null)} \\par`
      paragraphs.push(
        last.endsWith('\\par')
          ? `${last.slice(0, -4)}${end}`
          : `${last}\n${paragraphStart(context, cellState, null)}${end}`,
      )
      cells.push(paragraphs.join('\n'))
    }
    if (nested) {
      const properties = paragraphStart(context, { ...state, tableDepth: depth }, null)
      rows.push(
        `${cells.join('\n')}\n${properties}{\\*\\nesttableprops${definition}\\nestrow}{\\nonesttables\\par}`,
      )
    } else {
      rows.push(`${definition}\n${cells.join('\n')}\n\\row`)
    }
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
  // A caption's number as the SEQ field Word writes, with its present value.
  if (node.type.name === 'captionNumber') {
    const number = escapeRTF(String(node.attrs.number ?? ''))
    return `{\\field{\\*\\fldinst SEQ ${sequenceName(node.attrs.kind)} \\\\* ARABIC}{\\fldrslt ${number}}}`
  }
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
      case 'charStyle': {
        const style = context.styles.get(safeStyleId(mark.attrs.id) ?? '')
        if (style?.kind === 'character') out += styleRTF(context, lookOf(style.id, style.props))
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
