import {
  type BorderStyle,
  DEFAULT_LIST_NUMBERING,
  type EditorNode,
  Fragment,
  type ListNumberingScheme,
  type Mark,
  type NamedStyle,
  type TextNode,
  columnCount,
  documentStyles,
  dropCapOf,
  headingNumberingOf,
  inlineLength,
  levelMarker,
  listNumberingOf,
  listStylesFor,
  paragraphBorderOf,
  paragraphShadingOf,
  safeStyleId,
  sliceInline,
  tabStopsOf,
  textDirection,
} from '@trevixal/core'
import { nearestHighlight, parseColor, toHex } from './color'
import type { RenderedDocument, RenderedImage, RenderedRun } from './rendered'
import {
  type CellSide,
  NODE,
  attrString,
  blockLayout,
  cellSpan,
  decodeDataURL,
  extensionForMime,
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
import {
  type CellLook,
  type TableColors,
  type TableLine,
  type TableLook,
  tableLook,
} from './table-look'
import { type DocumentPalette, type ThemeTokens, documentPalette } from './theme'
import { EMU_PER_PX, lengthToHalfPoints, lengthToPx, lengthToTwips } from './units'
import {
  FIELD_END,
  type ReferenceIds,
  bookmarkEnd,
  bookmarkName,
  bookmarkStart,
  fieldBegin,
  indexEntryText,
  jsonEntries,
  referenceIds,
  sequenceName,
  simpleField,
} from './word-fields'
import { namedStylesXML, wordStyleId } from './word-styles'
import { escapeXML } from './xml'
import { createZip } from './zip'

export interface DOCXOptions {
  /** Document title for the core properties. */
  readonly title?: string
  /** Author for the core properties. */
  readonly creator?: string
  /** Body font; Calibri by default. */
  readonly fontFamily?: string
  /** Body size in points; 11 by default. */
  readonly fontSize?: number
  /**
   * The editor's palette, so the document opens in the theme it was written
   * in. Omitted, the writer uses Word's own black-on-white.
   */
  readonly theme?: ThemeTokens
  /**
   * What the editor drew that the document does not hold: highlighted code,
   * and the picture a diagram block only describes.
   */
  readonly rendered?: RenderedDocument
}

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
}

const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** Twips per indent step / list level (0.5in). */
const INDENT = 720
/** Usable width between 1in margins on US Letter: 6.5in. */
const TABLE_WIDTH = 9360
/** Widest an image may render before it is scaled down to the text width. */
const MAX_IMAGE_PX = 624
const DEFAULT_IMAGE_PX = 400
const CODE_FONT = 'Consolas'

interface Context {
  readonly basePt: number
  readonly rendered: RenderedDocument
  readonly relationships: string[]
  readonly media: { name: string; data: Uint8Array }[]
  readonly mediaExtensions: Set<string>
  readonly numbers: NumberingInstance[]
  /** Each multilevel scheme the document uses, with its `w:abstractNum` id. */
  readonly schemes: Map<ListNumberingScheme, number>
  /** The page and ink a table style's tints are mixed against. */
  readonly tableColors: TableColors
  /** The colour a table line left to the default takes, as `w:color` wants it. */
  readonly rule: string
  drawingId: number
  /** The document's direction; a paragraph without one of its own takes it. */
  readonly direction: 'ltr' | 'rtl'
  /** Word's Automatic hyphenation, a document setting. */
  readonly hyphenation: boolean
  /** The document's named styles, the ones a paragraph or a run can point at. */
  readonly styles: readonly NamedStyle[]
  /** The caption and heading ids a cross-reference can name. */
  readonly references: ReferenceIds
  /** The scheme the document numbers its headings with, if it does. */
  readonly headingScheme: ListNumberingScheme | null
  /** The `w:num` every numbered heading shares, made when the first is written. */
  headingNum: number | null
  bookmarkId: number
  /** A table of figures or an index needs Word to update its fields on open. */
  updateFields: boolean
}

/**
 * One `w:num`. Word numbers the paragraphs that share one as a single list,
 * which is what a multilevel scheme needs: a `1.1.` reads its parent's number
 * only from the same instance.
 */
interface NumberingInstance {
  readonly id: number
  readonly abstractId: number
  /** Per level: a number to restart at, and a `w:lvl` to use instead of the abstract's. */
  readonly overrides: Map<number, { start?: number; lvl?: string }>
}

interface RunContext {
  readonly bold?: boolean
  readonly italic?: boolean
  /** Ink for runs without a colour of their own, as `RRGGBB`: a styled table's header. */
  readonly color?: string
  /** The run sits in a right-to-left paragraph. */
  readonly rtl?: boolean
}

/**
 * Office Open XML (`.docx`) export. Writes a complete package, content
 * types, relationships, core and app properties, styles, numbering and the
 * document body, into a stored ZIP archive, with no external dependency.
 */
export async function serializeToDOCX(
  doc: EditorNode,
  options: DOCXOptions = {},
): Promise<Uint8Array> {
  const basePt = options.fontSize && options.fontSize > 0 ? options.fontSize : 11
  const palette = documentPalette(options.theme)
  const context: Context = {
    basePt,
    rendered: options.rendered ?? new Map(),
    // Settings is related unconditionally, theme or not, so that the ids the
    // media below take never shift with the palette.
    relationships: [
      relationship(1, 'styles', 'styles.xml'),
      relationship(2, 'numbering', 'numbering.xml'),
      relationship(3, 'settings', 'settings.xml'),
    ],
    media: [],
    mediaExtensions: new Set(),
    numbers: [],
    schemes: new Map(),
    tableColors: {
      page: parseColor(palette.background ? `#${palette.background}` : null) ?? WHITE,
      ink: parseColor(palette.text ? `#${palette.text}` : null) ?? BLACK,
    },
    // `auto` asks Word to pick, and on a dark page it picks against the theme.
    rule: palette.border ?? 'auto',
    drawingId: 0,
    direction: textDirection(doc.attrs.direction) === 'rtl' ? 'rtl' : 'ltr',
    hyphenation: doc.attrs.hyphenation === true,
    styles: documentStyles(doc),
    references: referenceIds(doc),
    headingScheme: headingNumberingOf(doc),
    headingNum: null,
    bookmarkId: 0,
    updateFields: false,
  }
  const body = writeBlocks(doc.content.children, context, {}, true).join('')
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const entries = [
    { name: '[Content_Types].xml', data: contentTypes(context) },
    { name: '_rels/.rels', data: packageRelationships() },
    { name: 'docProps/core.xml', data: coreProperties(options, now) },
    { name: 'docProps/app.xml', data: appProperties() },
    { name: 'word/document.xml', data: documentPart(body, palette, sectionXML(doc, context)) },
    {
      name: 'word/styles.xml',
      data: stylesPart(primaryFont(options.fontFamily ?? 'Calibri'), basePt, palette, {
        widowControl: doc.attrs.widowControl !== false,
        styles: context.styles,
      }),
    },
    { name: 'word/numbering.xml', data: numberingPart(context) },
    { name: 'word/settings.xml', data: settingsPart(context) },
    {
      name: 'word/_rels/document.xml.rels',
      data: `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL}">${context.relationships.join('')}</Relationships>`,
    },
    ...context.media.map((item) => ({ name: `word/media/${item.name}`, data: item.data })),
  ]
  return createZip(entries)
}

function relationship(id: number, type: string, target: string, external = false): string {
  return `<Relationship Id="rId${id}" Type="${REL_TYPE}/${type}" Target="${escapeXML(target)}"${
    external ? ' TargetMode="External"' : ''
  }/>`
}

function addRelationship(
  context: Context,
  type: string,
  target: string,
  external: boolean,
): string {
  const id = context.relationships.length + 1
  context.relationships.push(relationship(id, type, target, external))
  return `rId${id}`
}

/** The content-type prefix every WordprocessingML part shares. */
const WML_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml'

function contentTypes(context: Context): string {
  const defaults = [...context.mediaExtensions]
    .map((ext) => `<Default Extension="${ext}" ContentType="${mimeForExtension(ext)}"/>`)
    .join('')
  const override = (part: string, type: string): string =>
    `<Override PartName="${part}" ContentType="${type}"/>`
  return [
    XML_HEADER,
    `<Types xmlns="${NS.ct}">`,
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    defaults,
    override('/word/document.xml', `${WML_TYPE}.document.main+xml`),
    override('/word/styles.xml', `${WML_TYPE}.styles+xml`),
    override('/word/numbering.xml', `${WML_TYPE}.numbering+xml`),
    override('/word/settings.xml', `${WML_TYPE}.settings+xml`),
    override('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'),
    override(
      '/docProps/app.xml',
      'application/vnd.openxmlformats-officedocument.extended-properties+xml',
    ),
    '</Types>',
  ].join('')
}

function mimeForExtension(extension: string): string {
  switch (extension) {
    case 'png':
      return 'image/png'
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

/** Core properties hang off the package, not the office-document, namespace. */
const CORE_PROPS_REL = `${PACKAGE_REL}/metadata/core-properties`

function packageRelationships(): string {
  return [
    XML_HEADER,
    `<Relationships xmlns="${PACKAGE_REL}">`,
    `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="word/document.xml"/>`,
    `<Relationship Id="rId2" Type="${CORE_PROPS_REL}" Target="docProps/core.xml"/>`,
    `<Relationship Id="rId3" Type="${REL_TYPE}/extended-properties" Target="docProps/app.xml"/>`,
    '</Relationships>',
  ].join('')
}

function coreProperties(options: DOCXOptions, now: string): string {
  const title = options.title ? `<dc:title>${escapeXML(options.title)}</dc:title>` : ''
  const creator = options.creator
    ? `<dc:creator>${escapeXML(options.creator)}</dc:creator><cp:lastModifiedBy>${escapeXML(
        options.creator,
      )}</cp:lastModifiedBy>`
    : ''
  return [
    XML_HEADER,
    `<cp:coreProperties ${CORE_PROPS_XMLNS}>`,
    title,
    creator,
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`,
    '</cp:coreProperties>',
  ].join('')
}

const CORE_PROPS_XMLNS = [
  'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:dcterms="http://purl.org/dc/terms/"',
  'xmlns:dcmitype="http://purl.org/dc/dcmitype/"',
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
].join(' ')

const APP_PROPS_XMLNS = [
  'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
  'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"',
].join(' ')

function appProperties(): string {
  const body = '<Application>Trevixal</Application>'
  return `${XML_HEADER}<Properties ${APP_PROPS_XMLNS}>${body}</Properties>`
}

/**
 * US Letter with 1in margins: the section the body always ends with. Line
 * numbers are Word's own, so they count the lines Word lays out; a
 * right-to-left document is a right-to-left section.
 */
function sectionXML(doc: EditorNode, context: Context): string {
  const lines =
    doc.attrs.lineNumbers === true ? '<w:lnNumType w:countBy="1" w:restart="continuous"/>' : ''
  // Newspaper columns, half an inch apart, with Word's line between them when asked.
  const count = columnCount(doc.attrs.columns)
  const rule = doc.attrs.columnRule === true ? ' w:sep="1"' : ''
  const cols = count > 1 ? `<w:cols w:num="${count}" w:space="720"${rule}/>` : ''
  const bidi = context.direction === 'rtl' ? '<w:bidi/>' : ''
  return `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>${lines}${cols}${bidi}</w:sectPr>`
}

function documentPart(body: string, palette: DocumentPalette, section: string): string {
  const xmlns = `xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}" xmlns:mc="${NS.mc}"`
  // `w:background` is the page's own colour, and it belongs between the
  // document element and the body. On its own it does nothing: Word only
  // paints it when `w:displayBackgroundShape` is set, which is why this
  // writer emits a settings part at all.
  const background = palette.background ? `<w:background w:color="${palette.background}"/>` : ''
  return [
    XML_HEADER,
    `<w:document ${xmlns}>`,
    background,
    `<w:body>${body}`,
    section,
    '</w:body></w:document>',
  ].join('')
}

/**
 * The document-wide settings. Without `w:displayBackgroundShape` Word stores
 * the page colour and declines to draw it, and the part has to exist, be
 * declared and be related for Word to read any of it. A document holding a
 * table of figures or an index also asks Word to update its fields on open,
 * which is when their page numbers are filled in.
 */
function settingsPart(context: Context): string {
  const update = context.updateFields ? '<w:updateFields w:val="true"/>' : ''
  const hyphenate = context.hyphenation ? '<w:autoHyphenation/>' : ''
  return `${XML_HEADER}<w:settings xmlns:w="${NS.w}"><w:displayBackgroundShape/>${hyphenate}${update}</w:settings>`
}

/**
 * The styles that never vary with the writer's options. They are the ones
 * `w:pStyle` refers to from the body, so Word needs every one defined even
 * when a given document happens not to use it.
 */
function styleQuote(palette: DocumentPalette): string {
  const rule = palette.border ?? 'BFBFBF'
  const ink = palette.muted ?? '404040'
  return `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="${rule}"/></w:pBdr><w:spacing w:before="160" w:after="160"/><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="${ink}"/></w:rPr></w:style>`
}

function styleCode(palette: DocumentPalette): string {
  const fill = palette.code ?? 'F2F2F2'
  // The fill is the editor's code ground, so the ink has to be the editor's
  // too: Word's automatic black on a dark code block is unreadable.
  const ink = palette.text ? `<w:color w:val="${palette.text}"/>` : ''
  return [
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/>',
    `<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr>`,
    `<w:rPr><w:rFonts w:ascii="${CODE_FONT}" w:hAnsi="${CODE_FONT}" w:cs="${CODE_FONT}"/>${ink}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`,
    '</w:style>',
  ].join('')
}
const STYLE_LIST_PARAGRAPH =
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>'
function styleCaption(palette: DocumentPalette): string {
  const ink = palette.muted ?? '44546A'
  return `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="${ink}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>`
}

function styleHyperlink(palette: DocumentPalette): string {
  const ink = palette.accent ?? '0563C1'
  return `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${ink}"/><w:u w:val="single"/></w:rPr></w:style>`
}
const STYLE_TABLE_NORMAL =
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
const WHITE = { r: 255, g: 255, b: 255 }
const BLACK = { r: 0, g: 0, b: 0 }

function styleTableGrid(palette: DocumentPalette): string {
  // `auto` asks Word to pick, and on a dark page it picks against the theme.
  const rule = palette.border ?? 'auto'
  const edge = (name: string): string =>
    `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="${rule}"/>`
  const edges = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge).join('')
  return `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>${edges}</w:tblBorders></w:tblPr></w:style>`
}

function stylesPart(
  font: string,
  basePt: number,
  palette: DocumentPalette,
  options: { readonly widowControl: boolean; readonly styles: readonly NamedStyle[] },
): string {
  const size = Math.round(basePt * 2)
  const family = escapeXML(font)
  // Body ink, set once rather than per run: `w:color` on the default run
  // properties is what every style without a colour of its own inherits.
  const ink = palette.text ? `<w:color w:val="${palette.text}"/>` : ''
  const docDefaults = [
    '<w:docDefaults><w:rPrDefault><w:rPr>',
    `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>`,
    `${ink}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US"/>`,
    '</w:rPr></w:rPrDefault>',
    // Widow control is Word's default, but only as the Normal template sets it:
    // left out here, a paragraph's last line could sit alone on a page.
    `<w:pPrDefault><w:pPr>${options.widowControl ? '<w:widowControl/>' : ''}<w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>`,
    '</w:docDefaults>',
  ].join('')
  return [
    XML_HEADER,
    `<w:styles xmlns:w="${NS.w}">`,
    docDefaults,
    // Normal, Title, Subtitle, the headings and the character styles, with
    // whatever the document changed in them, then the writer's own styles.
    namedStylesXML(options.styles),
    styleQuote(palette),
    styleCode(palette),
    STYLE_LIST_PARAGRAPH,
    styleCaption(palette),
    styleHyperlink(palette),
    STYLE_TABLE_NORMAL,
    styleTableGrid(palette),
    '</w:styles>',
  ].join('')
}

const BULLETS = ['●', '○', '▪']

/** The bullet a `list-style-type` keyword draws, as Word writes it. */
const BULLET_GLYPHS: Readonly<Record<string, string>> = {
  disc: '●',
  circle: '○',
  square: '▪',
}

/** A CSS counter style's Word `w:numFmt`. */
const WORD_FORMATS: Readonly<Record<string, string>> = {
  decimal: 'decimal',
  'lower-alpha': 'lowerLetter',
  'upper-alpha': 'upperLetter',
  'lower-roman': 'lowerRoman',
  'upper-roman': 'upperRoman',
}

/** Word's nine list levels, `w:ilvl` 0 to 8. */
const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

/** Abstract ids 0 and 1 are the plain bullets and the default numbering. */
const ABSTRACT_BULLETS = 0
const ABSTRACT_NUMBERED = 1

/** Room for a marker: the hanging indent between it and the text, in twips. */
const HANGING = 360

interface LevelOptions {
  /** `w:isLgl`, Word's legal numbering: every part of an outline in decimal. */
  readonly legal?: boolean
  readonly hanging?: number
}

/** One `w:lvl`. */
function levelXML(ilvl: number, format: string, text: string, options: LevelOptions = {}): string {
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>${
    options.legal ? '<w:isLgl/>' : ''
  }<w:lvlText w:val="${escapeXML(text)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${
    INDENT * (ilvl + 1)
  }" w:hanging="${options.hanging ?? HANGING}"/></w:pPr></w:lvl>`
}

/**
 * A scheme's level as Word writes it: `%2)`, `%1.%2.`, or a bullet's glyph.
 *
 * An outline number grows a part with every level, and one wider than its
 * hanging indent pushes the text out to the next tab stop, which reads as a
 * gap. So each level widens it by about one part, `1.`, at the body size.
 */
function schemeLevelXML(scheme: ListNumberingScheme, ilvl: number, basePt: number): string {
  const marker = levelMarker(scheme, ilvl)
  if (scheme.listType === 'bulletList') return levelXML(ilvl, 'bullet', marker)
  if (scheme.outline) {
    const text = `${LEVELS.slice(0, ilvl + 1)
      .map((level) => `%${level + 1}`)
      .join('.')}.`
    // A digit and a dot come to about 0.8em; in twips that is 16 per point.
    const hanging = HANGING + ilvl * Math.round(basePt * 16)
    return levelXML(ilvl, 'decimal', text, { legal: true, hanging })
  }
  return levelXML(ilvl, WORD_FORMATS[marker] ?? 'decimal', `%${ilvl + 1}${scheme.suffix}`)
}

/** A list's own marker style at its level, or null for a style Word has no word for. */
function styleLevelXML(style: string, ilvl: number): string | null {
  const bullet = BULLET_GLYPHS[style]
  if (bullet) return levelXML(ilvl, 'bullet', bullet)
  const format = WORD_FORMATS[style]
  return format ? levelXML(ilvl, format, `%${ilvl + 1}.`) : null
}

/** The abstract numbering the headings share; well clear of the list schemes' ids. */
const HEADING_ABSTRACT = 90

/**
 * A heading level's number: the scheme's marker with a space after it and no
 * indent, since a heading sits at the margin rather than hanging like a list.
 */
function headingLevelXML(scheme: ListNumberingScheme, ilvl: number): string {
  const marker = levelMarker(scheme, ilvl)
  const text = scheme.outline
    ? `${LEVELS.slice(0, ilvl + 1)
        .map((level) => `%${level + 1}`)
        .join('.')}.`
    : `%${ilvl + 1}${scheme.suffix}`
  const format = scheme.outline ? 'decimal' : (WORD_FORMATS[marker] ?? 'decimal')
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>${
    scheme.outline ? '<w:isLgl/>' : ''
  }<w:suff w:val="space"/><w:lvlText w:val="${escapeXML(text)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="0" w:firstLine="0"/></w:pPr></w:lvl>`
}

/** The heading numbering's `w:num`, made the first time a numbered heading is written. */
function headingNumbering(context: Context, level: number): { id: number; level: number } | null {
  if (!context.headingScheme) return null
  if (context.headingNum === null) {
    context.headingNum = addNumbering(context, HEADING_ABSTRACT, 0, null).id
  }
  return { id: context.headingNum, level: Math.min(5, Math.max(0, level - 1)) }
}

function numberingPart(context: Context): string {
  const abstract = (id: number, type: string, body: string): string =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="${type}"/>${body}</w:abstractNum>`
  const bullets = LEVELS.map((ilvl) =>
    levelXML(ilvl, 'bullet', BULLETS[ilvl % BULLETS.length] as string),
  ).join('')
  const numbered = LEVELS.map((ilvl) =>
    schemeLevelXML(DEFAULT_LIST_NUMBERING, ilvl, context.basePt),
  ).join('')
  // A scheme's levels depend on each other (`%1.%2.`), which is Word's
  // `multilevel`; the two defaults number each level on its own.
  const schemes = [...context.schemes].map(([scheme, id]) =>
    abstract(
      id,
      'multilevel',
      LEVELS.map((ilvl) => schemeLevelXML(scheme, ilvl, context.basePt)).join(''),
    ),
  )
  const headingScheme = context.headingScheme
  const headings =
    headingScheme && context.headingNum !== null
      ? [
          abstract(
            HEADING_ABSTRACT,
            'multilevel',
            [0, 1, 2, 3, 4, 5].map((ilvl) => headingLevelXML(headingScheme, ilvl)).join(''),
          ),
        ]
      : []
  return [
    XML_HEADER,
    `<w:numbering xmlns:w="${NS.w}">`,
    abstract(ABSTRACT_BULLETS, 'hybridMultilevel', bullets),
    abstract(ABSTRACT_NUMBERED, 'hybridMultilevel', numbered),
    ...schemes,
    ...headings,
    context.numbers.map(numXML).join(''),
    '</w:numbering>',
  ].join('')
}

function numXML(instance: NumberingInstance): string {
  const overrides = [...instance.overrides]
    .sort(([a], [b]) => a - b)
    .map(
      ([ilvl, { start, lvl }]) =>
        `<w:lvlOverride w:ilvl="${ilvl}">${
          start === undefined ? '' : `<w:startOverride w:val="${Math.max(0, start)}"/>`
        }${lvl ?? ''}</w:lvlOverride>`,
    )
    .join('')
  return `<w:num w:numId="${instance.id}"><w:abstractNumId w:val="${instance.abstractId}"/>${overrides}</w:num>`
}

/** The `w:abstractNum` id of a scheme, defining it on first use. */
function schemeAbstract(context: Context, scheme: ListNumberingScheme): number {
  const known = context.schemes.get(scheme)
  if (known !== undefined) return known
  const id = ABSTRACT_NUMBERED + 1 + context.schemes.size
  context.schemes.set(scheme, id)
  return id
}

/**
 * Register a numbering instance. Every ordered instance carries a
 * `w:startOverride` on the level it starts at: Word treats `w:num` elements
 * that share an abstract definition as one continuous list unless the
 * override is present, so without it a second ordered list would carry on
 * from where the first stopped.
 */
function addNumbering(
  context: Context,
  abstractId: number,
  level: number,
  start: number | null,
): NumberingInstance {
  const instance: NumberingInstance = {
    id: context.numbers.length + 1,
    abstractId,
    overrides: new Map(start === null ? [] : [[level, { start }]]),
  }
  context.numbers.push(instance)
  return instance
}

/** The multilevel tree a list sits in, for the lists nested below it. */
interface NumberingTree {
  readonly instance: NumberingInstance
  readonly listType: string
}

/**
 * The instance a list's paragraphs use, and the tree lists below it continue.
 *
 * A list storing a scheme opens one instance for its whole tree, and every
 * list of the same type below it joins that instance at its own level: Word
 * then restarts each level after the one above, as the editor does, and a
 * `1.1.` can read its parent's number. Any other list gets an instance of its
 * own, as it always has. A list's own marker style replaces its level's.
 */
function listNumbering(
  list: EditorNode,
  ordered: boolean,
  level: number,
  tree: NumberingTree | null,
  context: Context,
): { instance: NumberingInstance; tree: NumberingTree | null } {
  const scheme = listNumberingOf(list)
  const start = ordered ? listStart(list) : null
  let instance: NumberingInstance
  let next = tree
  if (scheme !== null && scheme !== DEFAULT_LIST_NUMBERING) {
    instance = addNumbering(context, schemeAbstract(context, scheme), level, start)
    next = { instance, listType: list.type.name }
  } else if (tree?.listType === list.type.name) {
    instance = tree.instance
  } else {
    instance = addNumbering(context, ordered ? ABSTRACT_NUMBERED : ABSTRACT_BULLETS, level, start)
  }

  const style = list.attrs.listStyle
  const lvl =
    typeof style === 'string' && listStylesFor(list.type.name).has(style)
      ? styleLevelXML(style, level)
      : null
  if (lvl) instance.overrides.set(level, { ...instance.overrides.get(level), lvl })
  return { instance, tree: next }
}

interface ParagraphProps {
  style?: string
  numbering?: { readonly id: number; readonly level: number }
  border?: boolean
  indentLeft?: number
  jc?: string
  /** Right to left: `w:bidi`. */
  bidi?: boolean
}

/**
 * Write a run of blocks. At the top level of the document a heading takes
 * the heading numbering, as the editor numbers only top-level headings.
 */
function writeBlocks(
  nodes: readonly EditorNode[],
  context: Context,
  run: RunContext,
  topLevel = false,
): string[] {
  const out: string[] = []
  for (const node of nodes) {
    const numbering =
      topLevel && node.type.name === NODE.heading
        ? headingNumbering(context, headingLevel(node))
        : null
    out.push(...writeBlock(node, context, run, numbering ? { numbering } : {}))
  }
  return out
}

function writeBlock(
  node: EditorNode,
  context: Context,
  run: RunContext,
  props: ParagraphProps,
): string[] {
  switch (node.type.name) {
    case NODE.paragraph: {
      // A caption paragraph (one holding a caption number) takes Word's Caption style.
      const caption = node.content.children.some((child) => child.type.name === 'captionNumber')
      const style = caption ? 'Caption' : (props.style ?? namedParagraphStyle(node, context))
      return [paragraph(node, context, run, style ? { ...props, style } : props)]
    }
    case NODE.heading:
      return [paragraph(node, context, run, { ...props, style: `Heading${headingLevel(node)}` })]
    case NODE.blockquote:
      return node.content.children.flatMap((child) =>
        child.isTextblock
          ? writeBlock(child, context, run, { ...props, style: props.style ?? 'Quote' })
          : writeBlock(child, context, run, props),
      )
    case NODE.codeBlock: {
      const block = context.rendered.get(node)
      // The drawing replaces the source it was drawn from: the source is the
      // instruction, not a second way of reading the document. Only when
      // there is a drawing, though, otherwise the block would be dropped in
      // favour of nothing at all.
      const drawn = block?.image ? diagramParagraph(block.image, context, props) : null
      if (drawn) return [drawn]
      return codeLines(node.textContent, block?.runs).map(
        (line) =>
          `<w:p>${pPr({ ...props, style: 'Code' }, null, context)}${line
            .map((run) => textRun(run.text, codeRunProperties(run)))
            .join('')}</w:p>`,
      )
    }
    case NODE.horizontalRule:
      return [`<w:p>${pPr({ ...props, border: true }, null, context)}</w:p>`]
    case NODE.bulletList:
    case NODE.orderedList:
    case NODE.taskList:
      return writeList(node, context, run, 0)
    case NODE.table:
      return [writeTable(node, context, run)]
    case NODE.image:
      return [imageParagraph(node, context, props)]
    case NODE.figure:
      return node.content.children.flatMap((child) => writeBlock(child, context, run, props))
    case NODE.caption:
      return [
        paragraph(
          node,
          context,
          { ...run, italic: true },
          { ...props, style: 'Caption', jc: 'center' },
        ),
      ]
    case 'captionList':
      return captionListParagraphs(node, context)
    case 'documentIndex':
      return indexParagraphs(node, context)
    default:
      if (node.isTextblock) return [paragraph(node, context, run, props)]
      if (node.isAtom || node.childCount === 0) {
        const text = node.textContent
        return text ? [`<w:p>${pPr(props, null, context)}${textRun(text, '')}</w:p>`] : []
      }
      return node.content.children.flatMap((child) => writeBlock(child, context, run, props))
  }
}

/** The Word style a paragraph's named style is, when the document has that style. */
function namedParagraphStyle(node: EditorNode, context: Context): string | undefined {
  const id = safeStyleId(node.attrs.paragraphStyle)
  if (!id || id === 'normal') return undefined
  return context.styles.some((style) => style.id === id) ? wordStyleId(id) : undefined
}

function paragraph(
  node: EditorNode,
  context: Context,
  run: RunContext,
  props: ParagraphProps,
  prefix = '',
): string {
  const dropped = dropCapFrame(node, context)
  if (dropped) return `${dropped.frame}${paragraph(dropped.rest, context, run, props, prefix)}`
  const rtl = (textDirection(node.attrs.dir) ?? context.direction) === 'rtl'
  const properties = pPr(rtl ? { ...props, bidi: true } : props, node, context)
  const body = paragraphBody(node, context, rtl ? { ...run, rtl: true } : run)
  return `<w:p>${properties}${prefix}${body}</w:p>`
}

/** How tall one line of body text is, as Word lays it out, in points per point of type. */
const LINE_SPACING = 1.2

/**
 * A drop cap as Word writes one: the first letter alone in a paragraph of
 * its own, framed to drop beside the next `lines` lines of the paragraph, or
 * to hang in the margin, and sized to span them. The rest of the paragraph
 * follows it. Null when the paragraph has none or does not start with text.
 */
function dropCapFrame(
  node: EditorNode,
  context: Context,
): { frame: string; rest: EditorNode } | null {
  const dropCap = dropCapOf(node.attrs)
  const first = node.content.maybeChild(0)
  if (!dropCap || !first?.isText) return null
  const text = first.textContent
  const code = text.charCodeAt(0)
  const length = code >= 0xd800 && code <= 0xdbff && text.length > 1 ? 2 : 1
  const letter = text.slice(0, length)
  if (letter.trim() === '') return null
  const line = Math.round(context.basePt * LINE_SPACING * 20)
  // The letter's height, in half-points, is the lines' less the gap under the last.
  const size = Math.round(dropCap.lines * context.basePt * LINE_SPACING * 0.85 * 2)
  const rtl = (textDirection(node.attrs.dir) ?? context.direction) === 'rtl'
  const frame = [
    '<w:p><w:pPr><w:keepNext/>',
    `<w:framePr w:dropCap="${dropCap.kind}" w:lines="${dropCap.lines}" w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>`,
    rtl ? '<w:bidi/>' : '',
    `<w:spacing w:after="0" w:line="${line * dropCap.lines}" w:lineRule="exact"/></w:pPr>`,
    textRun(letter, `<w:position w:val="0"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`),
    '</w:p>',
  ].join('')
  const rest = node
    .withAttrs({ ...node.attrs, dropCap: null, dropCapLines: null })
    .withContent(sliceInline(node.content, length, inlineLength(node.content)))
  return { frame, rest }
}

/**
 * A paragraph's runs, with the bookmarks a cross-reference reads from. A
 * caption's number is a SEQ field, and three bookmarks let each reference
 * format come back as written: the number, "Figure 2", the whole caption. A
 * heading with an id is bookmarked over its text.
 */
function paragraphBody(node: EditorNode, context: Context, run: RunContext): string {
  const children = node.content.children
  const at = children.findIndex((child) => child.type.name === 'captionNumber')
  if (at < 0) {
    const body = runs(node.content, context, run)
    const id = node.type.name === NODE.heading ? attrString(node.attrs, 'id') : null
    if (!id) return body
    const mark = context.bookmarkId++
    return `${bookmarkStart(mark, bookmarkName(context.references, 'heading', id))}${body}${bookmarkEnd(mark)}`
  }
  const atom = children[at] as EditorNode
  const before = runs(Fragment.from(children.slice(0, at)), context, run)
  const after = runs(Fragment.from(children.slice(at + 1)), context, run)
  const number = String(atom.attrs.number ?? '')
  const seq = simpleField(
    `SEQ ${sequenceName(atom.attrs.kind)} \\* ARABIC`,
    textRun(number, runProperties(atom.marks, context, run, false)),
  )
  const id = attrString(atom.attrs, 'id')
  if (!id) return `${before}${seq}${after}`
  const [full, label, only] = [context.bookmarkId++, context.bookmarkId++, context.bookmarkId++]
  return [
    bookmarkStart(full, bookmarkName(context.references, 'full', id)),
    bookmarkStart(label, bookmarkName(context.references, 'label', id)),
    before,
    bookmarkStart(only, bookmarkName(context.references, 'number', id)),
    seq,
    bookmarkEnd(only),
    bookmarkEnd(label),
    after,
    bookmarkEnd(full),
  ].join('')
}

/**
 * A generated list's paragraph properties: right to left in a right-to-left
 * document, as the editor draws it, and indented for an index subentry.
 */
function listPPr(context: Context, indentLeft: number): string {
  return pPr({ bidi: context.direction === 'rtl', indentLeft }, null, context)
}

/** A table of figures: Word's TOC over one caption kind, its result the editor's entries. */
function captionListParagraphs(node: EditorNode, context: Context): string[] {
  context.updateFields = true
  const begin = fieldBegin(`TOC \\h \\z \\c "${sequenceName(node.attrs.kind)}"`)
  const entries = jsonEntries(node.attrs.entries).filter(
    (entry) => typeof entry.id === 'string' && typeof entry.text === 'string',
  )
  if (entries.length === 0) return [`<w:p>${listPPr(context, 0)}${begin}${FIELD_END}</w:p>`]
  return entries.map((entry, index) => {
    const anchor = escapeXML(bookmarkName(context.references, 'full', entry.id as string))
    const link = `<w:hyperlink w:anchor="${anchor}" w:history="1">${textRun(entry.text as string, '')}</w:hyperlink>`
    const start = index === 0 ? begin : ''
    const end = index === entries.length - 1 ? FIELD_END : ''
    return `<w:p>${listPPr(context, 0)}${start}${link}${end}</w:p>`
  })
}

/** Word's INDEX: its result is the editor's entries, which Word redoes with page numbers. */
function indexParagraphs(node: EditorNode, context: Context): string[] {
  context.updateFields = true
  const begin = fieldBegin('INDEX \\e ", "')
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
  if (lines.length === 0) return [`<w:p>${listPPr(context, 0)}${begin}${FIELD_END}</w:p>`]
  return lines.map((line, index) => {
    const properties = listPPr(context, line.sub ? INDENT / 2 : 0)
    const start = index === 0 ? begin : ''
    const end = index === lines.length - 1 ? FIELD_END : ''
    return `<w:p>${properties}${start}${textRun(line.text, '')}${end}</w:p>`
  })
}

/** Word's names for the border styles the editor draws. */
const WORD_BORDER: Readonly<Record<BorderStyle, string>> = {
  solid: 'single',
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
}

/**
 * A paragraph's border as `w:pBdr`: its sides in the schema's order, each as
 * wide as drawn (eighths of a point: a px is six) and as far from the text as
 * Word's defaults set it.
 */
function paragraphBorderXML(node: EditorNode): string {
  const border = paragraphBorderOf(node.attrs)
  if (!border) return ''
  const rgb = parseColor(border.color)
  const color = rgb ? toHex(rgb) : 'auto'
  const size = Math.min(96, Math.max(2, Math.round(border.width * 6)))
  const edges = (['top', 'left', 'bottom', 'right'] as const)
    .filter((side) => border.sides.includes(side))
    .map((side) => {
      const space = side === 'top' || side === 'bottom' ? 1 : 4
      return `<w:${side} w:val="${WORD_BORDER[border.style]}" w:sz="${size}" w:space="${space}" w:color="${color}"/>`
    })
  return `<w:pBdr>${edges.join('')}</w:pBdr>`
}

/** A paragraph's custom tab stops as `w:tabs`, each at its position in twips from the margin. */
function tabsXML(node: EditorNode): string {
  const stops = tabStopsOf(node.attrs)
  if (stops.length === 0) return ''
  const tabs = stops.map((stop) => {
    const leader = stop.leader === 'none' ? '' : ` w:leader="${stop.leader}"`
    return `<w:tab w:val="${stop.align}"${leader} w:pos="${Math.round(stop.position * 20)}"/>`
  })
  return `<w:tabs>${tabs.join('')}</w:tabs>`
}

/** A paragraph's fill as `w:shd`. */
function shadingXML(node: EditorNode): string {
  const rgb = parseColor(paragraphShadingOf(node.attrs))
  return rgb ? `<w:shd w:val="clear" w:color="auto" w:fill="${toHex(rgb)}"/>` : ''
}

const MIRRORED_ALIGN: Readonly<Record<string, string>> = { left: 'right', right: 'left' }

/** Paragraph properties in the order the schema requires. */
function pPr(props: ParagraphProps, node: EditorNode | null, context: Context): string {
  const layout = node ? blockLayout(node, context.basePt) : null
  let out = ''
  if (props.style) out += `<w:pStyle w:val="${props.style}"/>`
  if (props.numbering) {
    out += `<w:numPr><w:ilvl w:val="${props.numbering.level}"/><w:numId w:val="${props.numbering.id}"/></w:numPr>`
  }
  if (props.border) {
    out += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>'
  } else if (node) {
    out += paragraphBorderXML(node)
  }
  if (node) out += shadingXML(node)
  if (node) out += tabsXML(node)
  if (props.bidi) out += '<w:bidi/>'
  if (layout && (layout.spaceBefore !== null || layout.spaceAfter !== null || layout.lineHeight)) {
    let spacing = '<w:spacing'
    if (layout.spaceBefore !== null) spacing += ` w:before="${layout.spaceBefore}"`
    if (layout.spaceAfter !== null) spacing += ` w:after="${layout.spaceAfter}"`
    if (layout.lineHeight) {
      spacing +=
        'multiplier' in layout.lineHeight
          ? ` w:line="${Math.round(layout.lineHeight.multiplier * 240)}" w:lineRule="auto"`
          : ` w:line="${layout.lineHeight.twips}" w:lineRule="exact"`
    }
    out += `${spacing}/>`
  }
  const indent = (props.indentLeft ?? 0) + (layout?.indent ?? 0) * INDENT
  if (indent > 0 && !props.numbering) out += `<w:ind w:left="${indent}"/>`
  const align = layout?.align ?? props.jc
  // Word reads left and right in a right-to-left paragraph as its start and
  // end; the editor's alignment is the side of the page, so the two swap.
  const jc = props.bidi ? (MIRRORED_ALIGN[align ?? ''] ?? align) : align
  if (jc) out += `<w:jc w:val="${jc === 'justify' ? 'both' : jc}"/>`
  return out ? `<w:pPr>${out}</w:pPr>` : ''
}

function writeList(
  list: EditorNode,
  context: Context,
  run: RunContext,
  depth: number,
  tree: NumberingTree | null = null,
): string[] {
  const kind = listKind(list) ?? 'bullet'
  const out: string[] = []
  const level = Math.min(8, depth)
  const numbered =
    kind === 'task' ? null : listNumbering(list, kind === 'ordered', level, tree, context)
  const numbering = numbered ? { id: numbered.instance.id, level } : null
  // A task list carries no numbering of its own, but the tree around it goes on.
  const below = numbered ? numbered.tree : tree
  for (const item of list.content.children) {
    const isTask = kind === 'task' || item.type.name === NODE.taskItem
    item.content.children.forEach((block, index) => {
      if (listKind(block)) {
        out.push(...writeList(block, context, run, depth + 1, below))
        return
      }
      const props: ParagraphProps = { style: 'ListParagraph', indentLeft: INDENT * (depth + 1) }
      if (index === 0 && block.isTextblock) {
        if (numbering) {
          out.push(paragraph(block, context, run, { ...props, numbering }))
        } else {
          const prefix = textRun(`${isTask ? taskGlyph(item) : '•'} `, '')
          out.push(paragraph(block, context, run, props, prefix))
        }
        return
      }
      out.push(...writeBlock(block, context, run, block.isTextblock ? props : {}))
    })
  }
  return out
}

function writeTable(table: EditorNode, context: Context, run: RunContext): string {
  const columns = tableColumns(table)
  const unit = Math.floor(TABLE_WIDTH / columns)
  const rows = table.content.children.filter((row) => row.type.name === NODE.tableRow)
  // Word has the style's look spelt out, since its own table style is the
  // plain grid: the lines here, the fills and bold on each cell below.
  const look = tableLook(table, context.tableColors)
  // A right-to-left document lays its tables out from the right, as the editor does.
  const bidiVisual = context.direction === 'rtl' ? '<w:bidiVisual/>' : ''
  let tblPr = `<w:tblStyle w:val="TableGrid"/>${bidiVisual}<w:tblW w:w="5000" w:type="pct"/>`
  if (look.styled) {
    const edges = look.edges
    const sides = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'] as const
    tblPr += `<w:tblBorders>${sides
      .map((side) => (edges[side] ? border(side, look.line, context) : `<w:${side} w:val="nil"/>`))
      .join('')}</w:tblBorders>`
  }
  tblPr += tableLookElement(table, look)
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${unit}"/>`).join('')

  const body = rows
    .map((row, rowIndex) => {
      const cells = row.content.children.filter((cell) => cell.type.name === NODE.tableCell)
      const allHeader = cells.length > 0 && cells.every((cell) => cell.attrs.header === true)
      const trPr = allHeader ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
      const rendered = cells
        .map((cell, cellIndex) => {
          const hidden = hiddenCellSides(table, rowIndex, cellIndex)
          return writeCell(cell, context, run, unit, hidden, look.cell(rowIndex, cellIndex))
        })
        .join('')
      return `<w:tr>${trPr}${rendered}</w:tr>`
    })
    .join('')
  return `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
}

function writeCell(
  cell: EditorNode,
  context: Context,
  run: RunContext,
  unit: number,
  hidden: ReadonlySet<CellSide>,
  look: CellLook,
): string {
  const span = cellSpan(cell)
  let tcPr = `<w:tcW w:w="${unit * span}" w:type="dxa"/>`
  if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`
  // An erased line is `nil`, which wins over the table's own rule; a style's
  // rule under the header or over the total row is drawn here in its place.
  // The schema wants the sides in this order.
  const rules: Readonly<Partial<Record<CellSide, TableLine>>> = {
    ...(look.top ? { top: look.top } : {}),
    ...(look.bottom ? { bottom: look.bottom } : {}),
  }
  const sides = (['top', 'left', 'bottom', 'right'] as const).flatMap((side) => {
    if (hidden.has(side)) return [`<w:${side} w:val="nil"/>`]
    const rule = rules[side]
    return rule ? [border(side, rule, context)] : []
  })
  if (sides.length > 0) tcPr += `<w:tcBorders>${sides.join('')}</w:tcBorders>`
  // The cell's own shading wins over its style's, as a direct format does in Word.
  const fill = parseColor(cell.attrs.background) ?? look.fill
  if (fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${toHex(fill)}"/>`
  const align = attrString(cell.attrs, 'align')
  const jc = align === 'center' || align === 'right' || align === 'left' ? align : undefined
  const cellRun: RunContext = {
    ...run,
    ...(look.bold ? { bold: true } : {}),
    ...(look.ink ? { color: toHex(look.ink) } : {}),
  }
  const blocks = cell.content.children.flatMap((block) =>
    writeBlock(block, context, cellRun, jc ? { jc } : {}),
  )
  // A cell must end with a paragraph; a trailing nested table needs one added.
  const last = blocks[blocks.length - 1]
  if (!last || !last.endsWith('</w:p>')) blocks.push('<w:p/>')
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${blocks.join('')}</w:tc>`
}

/** One edge of a table or cell, drawn with a line. Word weighs lines in eighths of a point. */
function border(side: string, line: TableLine, context: Context): string {
  const color = line.color ? toHex(line.color) : context.rule
  return `<w:${side} w:val="${line.style}" w:sz="${Math.round(line.points * 8)}" w:space="0" w:color="${color}"/>`
}

/** Word's own Table Style Options, set to the table's, so they carry on if a Word style is applied. */
function tableLookElement(table: EditorNode, look: TableLook): string {
  // The plain grid keeps the look it has always been written with.
  if (!look.styled) {
    return '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
  }
  const firstRow = table.content.maybeChild(0)
  const flags = {
    firstRow: firstRow?.content.children.some((cell) => cell.attrs.header === true) ?? false,
    lastRow: table.attrs.totalRow === true,
    firstColumn: table.attrs.firstColumn === true,
    lastColumn: table.attrs.lastColumn === true,
    noHBand: table.attrs.bandedRows !== true,
    noVBand: table.attrs.bandedColumns !== true,
  }
  // The same flags as the bitmask older readers go by.
  const mask =
    (flags.firstRow ? 0x20 : 0) |
    (flags.lastRow ? 0x40 : 0) |
    (flags.firstColumn ? 0x80 : 0) |
    (flags.lastColumn ? 0x100 : 0) |
    (flags.noHBand ? 0x200 : 0) |
    (flags.noVBand ? 0x400 : 0)
  const bits = Object.entries(flags)
    .map(([name, on]) => ` w:${name}="${on ? 1 : 0}"`)
    .join('')
  return `<w:tblLook w:val="${mask.toString(16).toUpperCase().padStart(4, '0')}"${bits}/>`
}

/**
 * A code block's text as lines of runs. Without a capture from the editor
 * that is one plain run per line, which is what the writer emitted before
 * there was anything to colour it with.
 */
function codeLines(text: string, runs: readonly RenderedRun[] | undefined): RenderedRun[][] {
  if (!runs || runs.length === 0) return text.split('\n').map((line) => [{ text: line }])
  const lines: RenderedRun[][] = [[]]
  for (const run of runs) {
    const parts = run.text.split('\n')
    parts.forEach((part, index) => {
      // Every newline inside a run starts a paragraph, carrying the run's
      // colour across the break.
      if (index > 0) lines.push([])
      if (part) (lines[lines.length - 1] as RenderedRun[]).push({ ...run, text: part })
    })
  }
  return lines
}

/** `w:color`/`w:b`/`w:i` for one highlighted run; the Code style supplies the rest. */
function codeRunProperties(run: RenderedRun): string {
  const color = parseColor(run.color)
  return [
    color ? `<w:color w:val="${toHex(color)}"/>` : '',
    run.bold ? '<w:b/><w:bCs/>' : '',
    run.italic ? '<w:i/><w:iCs/>' : '',
  ].join('')
}

/**
 * The picture a diagram block was previewing, as its own centred paragraph,
 * or null if nothing managed to draw one.
 */
function diagramParagraph(
  image: RenderedImage,
  context: Context,
  props: ParagraphProps,
): string | null {
  if (!image.src || !decodeDataURL(image.src)) return null
  // Capped like any other picture: a wide diagram must not run off the page.
  const width = Math.min(image.width, MAX_IMAGE_PX)
  return picture({ src: image.src, alt: image.alt, width, height: null }, context, {
    ...props,
    style: undefined,
    jc: 'center',
  })
}

function imageParagraph(node: EditorNode, context: Context, props: ParagraphProps): string {
  const alignRaw = attrString(node.attrs, 'align')
  const jc = alignRaw === 'center' || alignRaw === 'right' ? alignRaw : props.jc
  return picture(
    {
      src: attrString(node.attrs, 'src') ?? '',
      alt: attrString(node.attrs, 'alt') ?? '',
      width: lengthToPx(node.attrs.width, context.basePt),
      height: lengthToPx(node.attrs.height, context.basePt),
    },
    context,
    { ...props, jc },
  )
}

/** Everything a picture needs, whether it came from the document or was drawn for it. */
interface Picture {
  readonly src: string
  readonly alt: string
  readonly width: number | null
  readonly height: number | null
}

function picture(image: Picture, context: Context, paragraphProps: ParagraphProps): string {
  const { src, alt } = image
  const decoded = decodeDataURL(src)
  if (!decoded || !decoded.mime.startsWith('image/')) {
    // A remote image cannot be embedded without fetching it; leave a link so
    // the reader can still reach it.
    const label = alt || src || 'image'
    if (!src) return `<w:p>${pPr(paragraphProps, null, context)}${textRun(`[${label}]`, '')}</w:p>`
    const id = addRelationship(context, 'hyperlink', encodeTarget(src), true)
    return `<w:p>${pPr(paragraphProps, null, context)}<w:hyperlink r:id="${id}">${textRun(
      label,
      '<w:rStyle w:val="Hyperlink"/>',
    )}</w:hyperlink></w:p>`
  }

  const extension = extensionForMime(decoded.mime)
  const name = `image${context.media.length + 1}.${extension}`
  context.media.push({ name, data: decoded.bytes })
  context.mediaExtensions.add(extension)
  const relId = addRelationship(context, 'image', `media/${name}`, false)

  const natural = imageDimensions(decoded.bytes)
  let width = image.width
  let height = image.height
  if (width === null && height === null) {
    width = natural ? Math.min(natural.width, MAX_IMAGE_PX) : DEFAULT_IMAGE_PX
  }
  const ratio = natural && natural.width > 0 ? natural.height / natural.width : 0.75
  if (width === null) width = (height as number) / ratio
  if (height === null) height = width * ratio
  const cx = Math.max(1, Math.round(width * EMU_PER_PX))
  const cy = Math.max(1, Math.round(height * EMU_PER_PX))
  const id = ++context.drawingId
  const drawing = [
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`,
    `<wp:docPr id="${id}" name="Picture ${id}" descr="${escapeXML(alt)}"/>`,
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    `<a:graphic><a:graphicData uri="${NS.pic}"><pic:pic>`,
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${escapeXML(name)}" descr="${escapeXML(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>`,
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`,
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`,
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
  ].join('')
  return `<w:p>${pPr(paragraphProps, null, context)}${drawing}</w:p>`
}

/**
 * Relationship targets must be valid URIs or Word reports the document as
 * corrupt. Percent-encode what a URI cannot carry, spaces, the characters
 * RFC 3986 excludes, controls and anything non-ASCII, while leaving existing
 * `%xx` escapes, reserved delimiters and unreserved characters as they are.
 */
function encodeTarget(url: string): string {
  let out = ''
  for (const char of url) {
    const code = char.codePointAt(0) as number
    if (code > 0x7e || code <= 0x20 || /["<>\\^`{|}]/.test(char)) out += encodeURIComponent(char)
    else out += char
  }
  return out
}

function runs(content: Fragment, context: Context, run: RunContext): string {
  let out = ''
  const children = content.children
  // Words marked for the index are followed by their XE field, once the run
  // of text under one mark ends, however many nodes other marks split it into.
  let term: { id: string; mark: Mark; words: string } | null = null
  const closeTerm = (): string => {
    if (!term) return ''
    const entry = indexWords(term.mark.attrs.entry) ?? indexWords(term.words)
    const field = entry
      ? simpleField(`XE "${indexEntryText(entry, indexWords(term.mark.attrs.sub))}"`, '')
      : ''
    term = null
    return field
  }
  const track = (node: EditorNode): string => {
    const mark = node.isText ? markNamed(node.marks, 'indexTerm') : undefined
    const id = mark ? attrString(mark.attrs, 'id') : null
    if (!mark || !id) return closeTerm()
    if (term?.id === id) {
      term.words += node.textContent
      return ''
    }
    const closed = closeTerm()
    term = { id, mark, words: node.textContent }
    return closed
  }
  let index = 0
  while (index < children.length) {
    const child = children[index] as EditorNode
    const href = linkHref(child)
    if (href) {
      let inner = ''
      while (index < children.length && linkHref(children[index] as EditorNode) === href) {
        const each = children[index] as EditorNode
        inner += track(each) + inlineNode(each, context, run, true)
        index++
      }
      inner += closeTerm()
      const id = addRelationship(context, 'hyperlink', encodeTarget(href), true)
      out += `<w:hyperlink r:id="${id}">${inner}</w:hyperlink>`
      continue
    }
    out += track(child) + inlineNode(child, context, run, false)
    index++
  }
  return out + closeTerm()
}

/** Index words as the editor files them: trimmed, and null when there are none. */
function indexWords(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const words = value.replace(/\s+/g, ' ').trim()
  return words.length > 0 ? words : null
}

function linkHref(node: EditorNode): string | null {
  if (!node.isText) return null
  const link = markNamed(node.marks, 'link')
  return link ? attrString(link.attrs, 'href') : null
}

function inlineNode(node: EditorNode, context: Context, run: RunContext, inLink: boolean): string {
  if (node.isText) {
    return textRun((node as TextNode).text, runProperties(node.marks, context, run, inLink))
  }
  if (node.type.name === NODE.hardBreak) return '<w:r><w:br/></w:r>'
  if (node.type.name === 'crossReference') return crossReference(node, context, run, inLink)
  if (node.type.name === NODE.image) {
    const alt = attrString(node.attrs, 'alt') ?? 'image'
    return textRun(`[${alt}]`, runProperties([], context, run, inLink))
  }
  const text = node.textContent || String(node.type.spec.toHTML?.(node)?.text ?? '')
  return text ? textRun(text, runProperties(node.marks, context, run, inLink)) : ''
}

/**
 * A cross-reference as a REF field to the bookmark its format reads, showing
 * the text the editor computed until Word updates it. A caption's text alone
 * has no bookmark to read, and a note is not a Word note here, so those two
 * go in as the text itself.
 */
function crossReference(
  node: EditorNode,
  context: Context,
  run: RunContext,
  inLink: boolean,
): string {
  const text = attrString(node.attrs, 'text') ?? ''
  const rPr = runProperties(node.marks, context, run, inLink)
  const result = textRun(text, rPr)
  const target = attrString(node.attrs, 'target')
  const format = node.attrs.format
  if (!target) return result
  if (context.references.captions.has(target)) {
    if (format === 'text') return result
    const part = format === 'number' ? 'number' : format === 'full' ? 'full' : 'label'
    return simpleField(`REF ${bookmarkName(context.references, part, target)} \\h`, result)
  }
  if (!context.references.headings.has(target)) return result
  const name = bookmarkName(context.references, 'heading', target)
  // A heading Word does not number (none are, or this one is nested) has only
  // its text to read, whatever the format.
  if (format === 'text' || !context.references.numberedHeadings.has(target)) {
    return simpleField(`REF ${name} \\h`, result)
  }
  if (format === 'full') {
    const space = text.indexOf(' ')
    const number = space < 0 ? text : text.slice(0, space)
    const words = space < 0 ? '' : text.slice(space + 1)
    return [
      simpleField(`REF ${name} \\r \\h`, textRun(number, rPr)),
      textRun(' ', rPr),
      simpleField(`REF ${name} \\h`, textRun(words, rPr)),
    ].join('')
  }
  return simpleField(`REF ${name} \\r \\h`, result)
}

/** A run whose text may hold tabs and newlines, which become `w:tab` and `w:br`. */
function textRun(text: string, rPr: string): string {
  const properties = rPr ? `<w:rPr>${rPr}</w:rPr>` : ''
  let body = ''
  let buffer = ''
  const flush = (): void => {
    if (buffer) body += `<w:t xml:space="preserve">${escapeXML(buffer)}</w:t>`
    buffer = ''
  }
  for (const char of text) {
    if (char === '\t') {
      flush()
      body += '<w:tab/>'
    } else if (char === '\n') {
      flush()
      body += '<w:br/>'
    } else if (char !== '\r') buffer += char
  }
  flush()
  return `<w:r>${properties}${body}</w:r>`
}

/** Run properties in schema order: style, fonts, toggles, colour, spacing, size, highlight, underline, shading, vertical alignment. */
function runProperties(
  marks: readonly Mark[],
  context: Context,
  run: RunContext,
  inLink: boolean,
): string {
  let bold = run.bold === true
  let italic = run.italic === true
  let underline = false
  let strike = false
  let smallCaps = false
  let font: string | null = null
  let color: string | null = run.color ?? null
  let size: number | null = null
  let spacing: number | null = null
  let highlight: string | null = null
  let shading: string | null = null
  let vertical: string | null = null

  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        bold = true
        break
      case 'italic':
        italic = true
        break
      case 'underline':
        underline = true
        break
      case 'strikethrough':
        strike = true
        break
      case 'smallCaps':
        smallCaps = true
        break
      case 'code':
        font = CODE_FONT
        break
      case 'superscript':
        vertical = 'superscript'
        break
      case 'subscript':
        vertical = 'subscript'
        break
      case 'highlight': {
        const rgb = parseColor(mark.attrs.color)
        highlight = rgb ? nearestHighlight(rgb) : 'yellow'
        break
      }
      case 'textColor': {
        const rgb = parseColor(mark.attrs.color)
        if (rgb) color = toHex(rgb)
        break
      }
      case 'backgroundColor': {
        const rgb = parseColor(mark.attrs.color)
        if (rgb) shading = toHex(rgb)
        break
      }
      case 'fontFamily': {
        const family = attrString(mark.attrs, 'family')
        if (family) font = primaryFont(family)
        break
      }
      case 'fontSize':
        size = lengthToHalfPoints(mark.attrs.size, context.basePt)
        break
      case 'letterSpacing':
        spacing = lengthToTwips(mark.attrs.spacing, context.basePt)
        break
      default:
        break
    }
  }

  let out = ''
  // One run style: a link's own, or else the named character style it is in.
  const named = inLink
    ? null
    : safeStyleId(marks.find((mark) => mark.type.name === 'charStyle')?.attrs.id)
  if (inLink) out += '<w:rStyle w:val="Hyperlink"/>'
  else if (
    named &&
    context.styles.some((style) => style.id === named && style.kind === 'character')
  ) {
    out += `<w:rStyle w:val="${escapeXML(wordStyleId(named))}"/>`
  }
  if (font) {
    const family = escapeXML(font)
    out += `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>`
  }
  if (bold) out += '<w:b/><w:bCs/>'
  if (italic) out += '<w:i/><w:iCs/>'
  if (smallCaps) out += '<w:smallCaps/>'
  if (strike) out += '<w:strike/>'
  if (color) out += `<w:color w:val="${color}"/>`
  if (spacing !== null) out += `<w:spacing w:val="${spacing}"/>`
  if (size !== null) out += `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`
  if (highlight) out += `<w:highlight w:val="${highlight}"/>`
  if (underline) out += '<w:u w:val="single"/>'
  if (shading) out += `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`
  if (vertical) out += `<w:vertAlign w:val="${vertical}"/>`
  if (run.rtl) out += '<w:rtl/>'
  return out
}
