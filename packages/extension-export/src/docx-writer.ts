import {
  DEFAULT_LIST_NUMBERING,
  type EditorNode,
  type Fragment,
  type ListNumberingScheme,
  type Mark,
  type TextNode,
  levelMarker,
  listNumberingOf,
  listStylesFor,
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

/** Heading sizes in half-points, h1 first. */
const HEADING_SIZES = [32, 28, 26, 24, 22, 22]

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
  }
  const body = writeBlocks(doc.content.children, context, {}).join('')
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const entries = [
    { name: '[Content_Types].xml', data: contentTypes(context) },
    { name: '_rels/.rels', data: packageRelationships() },
    { name: 'docProps/core.xml', data: coreProperties(options, now) },
    { name: 'docProps/app.xml', data: appProperties() },
    { name: 'word/document.xml', data: documentPart(body, palette) },
    {
      name: 'word/styles.xml',
      data: stylesPart(primaryFont(options.fontFamily ?? 'Calibri'), basePt, palette),
    },
    { name: 'word/numbering.xml', data: numberingPart(context) },
    { name: 'word/settings.xml', data: settingsPart() },
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

/** US Letter with 1in margins: the section the body always ends with. */
const SECTION =
  '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'

function documentPart(body: string, palette: DocumentPalette): string {
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
    SECTION,
    '</w:body></w:document>',
  ].join('')
}

/**
 * The document-wide settings. Only one matters here, without it Word stores
 * the page colour and declines to draw it, but the part has to exist, be
 * declared and be related for Word to read any of it.
 */
function settingsPart(): string {
  return `${XML_HEADER}<w:settings xmlns:w="${NS.w}"><w:displayBackgroundShape/></w:settings>`
}

/**
 * The styles that never vary with the writer's options. They are the ones
 * `w:pStyle` refers to from the body, so Word needs every one defined even
 * when a given document happens not to use it.
 */
const STYLE_NORMAL =
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
const STYLE_TITLE =
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:contextualSpacing/></w:pPr><w:rPr><w:spacing w:val="-10"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>'
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

function stylesPart(font: string, basePt: number, palette: DocumentPalette): string {
  const size = Math.round(basePt * 2)
  const family = escapeXML(font)
  const heading = (level: number): string => {
    const hp = HEADING_SIZES[level - 1] ?? 22
    return (
      `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${level === 1 ? 240 : 160}" w:after="80"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
      `<w:rPr><w:b/><w:bCs/>${level >= 5 ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/></w:rPr></w:style>`
    )
  }
  // Body ink, set once rather than per run: `w:color` on the default run
  // properties is what every style without a colour of its own inherits.
  const ink = palette.text ? `<w:color w:val="${palette.text}"/>` : ''
  const docDefaults = [
    '<w:docDefaults><w:rPrDefault><w:rPr>',
    `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>`,
    `${ink}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US"/>`,
    '</w:rPr></w:rPrDefault>',
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
    '</w:docDefaults>',
  ].join('')
  return [
    XML_HEADER,
    `<w:styles xmlns:w="${NS.w}">`,
    docDefaults,
    STYLE_NORMAL,
    STYLE_TITLE,
    [1, 2, 3, 4, 5, 6].map(heading).join(''),
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
  return [
    XML_HEADER,
    `<w:numbering xmlns:w="${NS.w}">`,
    abstract(ABSTRACT_BULLETS, 'hybridMultilevel', bullets),
    abstract(ABSTRACT_NUMBERED, 'hybridMultilevel', numbered),
    ...schemes,
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
}

function writeBlocks(nodes: readonly EditorNode[], context: Context, run: RunContext): string[] {
  const out: string[] = []
  for (const node of nodes) out.push(...writeBlock(node, context, run, {}))
  return out
}

function writeBlock(
  node: EditorNode,
  context: Context,
  run: RunContext,
  props: ParagraphProps,
): string[] {
  switch (node.type.name) {
    case NODE.paragraph:
      return [paragraph(node, context, run, props)]
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
    default:
      if (node.isTextblock) return [paragraph(node, context, run, props)]
      if (node.isAtom || node.childCount === 0) {
        const text = node.textContent
        return text ? [`<w:p>${pPr(props, null, context)}${textRun(text, '')}</w:p>`] : []
      }
      return node.content.children.flatMap((child) => writeBlock(child, context, run, props))
  }
}

function paragraph(
  node: EditorNode,
  context: Context,
  run: RunContext,
  props: ParagraphProps,
  prefix = '',
): string {
  return `<w:p>${pPr(props, node, context)}${prefix}${runs(node.content, context, run)}</w:p>`
}

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
  }
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
  const jc = layout?.align ?? props.jc
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
  let tblPr = '<w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>'
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
  let index = 0
  while (index < children.length) {
    const child = children[index] as EditorNode
    const href = linkHref(child)
    if (href) {
      let inner = ''
      while (index < children.length && linkHref(children[index] as EditorNode) === href) {
        inner += inlineNode(children[index] as EditorNode, context, run, true)
        index++
      }
      const id = addRelationship(context, 'hyperlink', encodeTarget(href), true)
      out += `<w:hyperlink r:id="${id}">${inner}</w:hyperlink>`
      continue
    }
    out += inlineNode(child, context, run, false)
    index++
  }
  return out
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
  if (node.type.name === NODE.image) {
    const alt = attrString(node.attrs, 'alt') ?? 'image'
    return textRun(`[${alt}]`, runProperties([], context, run, inLink))
  }
  const text = node.textContent || String(node.type.spec.toHTML?.(node)?.text ?? '')
  return text ? textRun(text, runProperties(node.marks, context, run, inLink)) : ''
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
  if (inLink) out += '<w:rStyle w:val="Hyperlink"/>'
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
  return out
}
