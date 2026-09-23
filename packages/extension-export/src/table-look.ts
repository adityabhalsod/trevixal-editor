import type { EditorNode } from '@trevixal/core'
import { type RGB, parseColor } from './color'
import { attrString } from './shared'

/** A line a word processor draws around or between table cells. */
export interface TableLine {
  readonly style: 'single' | 'dashed' | 'dotted' | 'double'
  /** The weight, in points. */
  readonly points: number
  /** Null leaves the writer's own rule colour. */
  readonly color: RGB | null
}

/** One cell of a table, as a word processor has to be told it. */
export interface CellLook {
  readonly fill: RGB | null
  readonly ink: RGB | null
  readonly bold: boolean
  /** A rule the style draws on that side, over the table's own line. */
  readonly top: TableLine | null
  readonly bottom: TableLine | null
}

/** Which of a table's lines are drawn: its four outer edges, and the lines inside it. */
export interface TableEdges {
  readonly top: boolean
  readonly left: boolean
  readonly bottom: boolean
  readonly right: boolean
  readonly insideH: boolean
  readonly insideV: boolean
}

export interface TableLook {
  /**
   * Whether the table departs from the plain grid at all. A plain one is left
   * to the document's own table style, as it always was.
   */
  readonly styled: boolean
  /** Every line of the table, as its pen draws it. */
  readonly line: TableLine
  readonly edges: TableEdges
  cell(rowIndex: number, cellIndex: number): CellLook
}

/** The page and text colours a style's tints are mixed against. */
export interface TableColors {
  readonly page: RGB
  readonly ink: RGB
}

const WHITE: RGB = { r: 255, g: 255, b: 255 }

/** The pen's weights, in points; null is Word's default ½ pt. */
const POINTS: Readonly<Record<string, number>> = { '1.5pt': 1.5, '2.25pt': 2.25, '3pt': 3 }
const DEFAULT_POINTS = 0.5

const LINE_STYLES: Readonly<Record<string, TableLine['style']>> = {
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
}

/**
 * How much of the style's colour each tint takes, the rest being the page:
 * the same shares the editor's stylesheet mixes, so a table looks the same
 * in Word as on screen.
 */
const TINT = { line: 0.45, band: 0.12, headerBand: 0.16, plainBand: 0.06 } as const

/** Word's rule under a grid style's header row, and its double rule over a total row. */
const HEADER_RULE_POINTS = 1.5
const TOTAL_RULE_POINTS = 0.5

const ALL_EDGES: TableEdges = {
  top: true,
  left: true,
  bottom: true,
  right: true,
  insideH: true,
  insideV: true,
}

/** The lines each of the Table menu's border styles draws. */
const EDGES: Readonly<Record<string, TableEdges>> = {
  none: { top: false, left: false, bottom: false, right: false, insideH: false, insideV: false },
  outer: { ...ALL_EDGES, insideH: false, insideV: false },
  horizontal: { ...ALL_EDGES, left: false, right: false, insideV: false },
}

/**
 * A table's style, Table Style Options, border style and pen, resolved to
 * what a word processor draws. The editor gets all of this from its
 * stylesheet; a .docx or .rtf has to be told cell by cell.
 */
export function tableLook(table: EditorNode, colors: TableColors): TableLook {
  const { attrs } = table
  const style = attrString(attrs, 'tableStyle')
  const pen = parseColor(attrs.borderColor)
  const tone = style ? (parseColor(attrs.accentColor) ?? colors.ink) : null
  const presetName = attrString(attrs, 'borders')
  const edges = (presetName && EDGES[presetName]) || ALL_EDGES
  // A style's own rules go with the lines when a border style takes the inside away.
  const rules = presetName !== 'none' && presetName !== 'outer'
  const line: TableLine = {
    style: LINE_STYLES[attrString(attrs, 'borderStyle') ?? ''] ?? 'single',
    points: POINTS[attrString(attrs, 'borderWidth') ?? ''] ?? DEFAULT_POINTS,
    color: pen ?? (tone ? mix(tone, colors.page, TINT.line) : null),
  }
  const options = {
    firstColumn: attrs.firstColumn === true,
    lastColumn: attrs.lastColumn === true,
    totalRow: attrs.totalRow === true,
    bandedRows: attrs.bandedRows === true,
    bandedColumns: attrs.bandedColumns === true,
  }
  const styled =
    style !== null ||
    pen !== null ||
    edges !== ALL_EDGES ||
    line.style !== 'single' ||
    line.points !== DEFAULT_POINTS ||
    Object.values(options).some(Boolean)

  const firstRow = table.content.maybeChild(0)
  const headerRow = firstRow?.content.children.some((cell) => cell.attrs.header === true) ?? false
  const lastRow = table.childCount - 1
  const band = tone
    ? mix(tone, colors.page, style === 'header' ? TINT.headerBand : TINT.band)
    : mix(colors.ink, colors.page, TINT.plainBand)
  const strong = tone ?? line.color

  return {
    styled,
    line,
    edges,
    cell(rowIndex, cellIndex) {
      const row = table.child(rowIndex)
      const cell = row.child(cellIndex)
      const header = cell.attrs.header === true
      const total = options.totalRow && rowIndex === lastRow && rowIndex > 0
      const bold =
        header ||
        total ||
        (options.firstColumn && cellIndex === 0) ||
        (options.lastColumn && cellIndex === row.childCount - 1)
      const bandedRow = options.bandedRows && rowIndex % 2 === (headerRow ? 1 : 0)
      const bandedColumn = options.bandedColumns && cellIndex % 2 === 0
      const filledHeader = header && style === 'header' && tone !== null
      return {
        fill: filledHeader ? tone : !header && (bandedRow || bandedColumn) ? band : null,
        ink: filledHeader ? (parseColor(attrs.accentColor) ? WHITE : colors.page) : null,
        bold,
        top: total && rules ? { style: 'double', points: TOTAL_RULE_POINTS, color: strong } : null,
        bottom:
          header && style === 'grid' && rules && tone
            ? { style: 'single', points: Math.max(HEADER_RULE_POINTS, line.points), color: tone }
            : null,
      }
    },
  }
}

/** `color` laid over `page` at `share` opacity: the opaque colour a translucent tint shows as. */
export function mix(color: RGB, page: RGB, share: number): RGB {
  const blend = (over: number, under: number) => Math.round(over * share + under * (1 - share))
  return { r: blend(color.r, page.r), g: blend(color.g, page.g), b: blend(color.b, page.b) }
}
