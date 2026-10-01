import { safeColor } from './css-values'

/**
 * Word's paragraph formatting beyond alignment and spacing: borders and
 * shading, drop caps and tab stops. Each is attributes on a textblock (a paragraph, a
 * heading), written into its markup as inline style and `data-` attributes
 * and read back from both, so a paragraph pasted from another editor keeps a
 * border or a fill it had.
 */

export type BorderSide = 'top' | 'right' | 'bottom' | 'left'

export const BORDER_SIDES: readonly BorderSide[] = ['top', 'right', 'bottom', 'left']

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double'

export const BORDER_STYLES: readonly BorderStyle[] = ['solid', 'dashed', 'dotted', 'double']

/** Thickest border a paragraph takes, in px: Word's 6 pt, near enough. */
export const MAX_BORDER_WIDTH = 6

export interface ParagraphBorder {
  /** Which sides have a line; all four is Word's Box. */
  readonly sides: readonly BorderSide[]
  readonly style: BorderStyle
  /** In px, 1 to {@link MAX_BORDER_WIDTH}. */
  readonly width: number
  /** Null draws in the text's own colour, as Word's Automatic does. */
  readonly color: string | null
}

export type DropCapKind = 'drop' | 'margin'

export interface DropCap {
  /** Dropped into the paragraph, or hung in the margin beside it. */
  readonly kind: DropCapKind
  /** How many lines the letter spans. */
  readonly lines: number
}

/** Lines a drop cap may span, and Word's default. */
export const DROP_CAP_LINES = { min: 2, max: 5, default: 3 } as const

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The attributes, merged into every textblock's alongside its layout. */
export function paragraphFormatAttrs(): Record<string, { default: null }> {
  return {
    // The sides with a line, space-separated in top, right, bottom, left order.
    borderSides: { default: null },
    borderStyle: { default: null },
    borderWidth: { default: null },
    borderColor: { default: null },
    shading: { default: null },
    dropCap: { default: null },
    dropCapLines: { default: null },
    // Custom tab stops, as `data-tab-stops` writes them: see tabStopsOf.
    tabStops: { default: null },
  }
}

/** A textblock's border, normalised; null when it has none. */
export function paragraphBorderOf(
  attrs: Readonly<Record<string, unknown>>,
): ParagraphBorder | null {
  const listed = typeof attrs.borderSides === 'string' ? attrs.borderSides.split(/\s+/) : []
  const sides = BORDER_SIDES.filter((side) => listed.includes(side))
  if (sides.length === 0) return null
  const style = BORDER_STYLES.find((each) => each === attrs.borderStyle) ?? 'solid'
  const raw = finite(attrs.borderWidth) ?? 1
  const width = Math.min(MAX_BORDER_WIDTH, Math.max(1, Math.round(raw)))
  return { sides, style, width, color: safeColor(attrs.borderColor) }
}

/** A border as the attributes that store it; null clears them all. */
export function paragraphBorderAttrs(border: ParagraphBorder | null): Record<string, unknown> {
  const sides = border ? BORDER_SIDES.filter((side) => border.sides.includes(side)) : []
  if (!border || sides.length === 0) {
    return { borderSides: null, borderStyle: null, borderWidth: null, borderColor: null }
  }
  return {
    borderSides: sides.join(' '),
    borderStyle: BORDER_STYLES.includes(border.style) ? border.style : 'solid',
    borderWidth: Math.min(MAX_BORDER_WIDTH, Math.max(1, Math.round(border.width))),
    borderColor: safeColor(border.color),
  }
}

/**
 * A textblock's shading, or null. A colour that shows nothing (transparent,
 * or with a zero alpha, as a browser writes on a block it copies) is none:
 * Word and RTF take only a fill's channels, and would paint it black.
 */
export function paragraphShadingOf(attrs: Readonly<Record<string, unknown>>): string | null {
  const color = safeColor(attrs.shading)
  if (!color || color.toLowerCase() === 'transparent') return null
  const hex = /^#(?:[0-9a-f]{3}([0-9a-f])|[0-9a-f]{6}([0-9a-f]{2}))$/i.exec(color)
  const inside = /^(?:rgba?|hsla?)\((.*)\)$/i.exec(color)?.[1]
  const alpha = hex ? (hex[1] ?? hex[2]) : inside?.split(/[\s,/]+/).filter(Boolean)[3]
  if (alpha === undefined) return color
  return (hex ? Number.parseInt(alpha, 16) : Number.parseFloat(alpha)) === 0 ? null : color
}

/** A textblock's drop cap, or null. */
export function dropCapOf(attrs: Readonly<Record<string, unknown>>): DropCap | null {
  if (attrs.dropCap !== 'drop' && attrs.dropCap !== 'margin') return null
  const raw = finite(attrs.dropCapLines) ?? DROP_CAP_LINES.default
  const lines = Math.min(DROP_CAP_LINES.max, Math.max(DROP_CAP_LINES.min, Math.round(raw)))
  return { kind: attrs.dropCap, lines }
}

/**
 * Space between a border and the text it rules, per side: a little above and
 * below, more at the sides, as Word's 1 pt and 4 pt defaults read on screen.
 */
const BORDER_PADDING: Readonly<Record<BorderSide, string>> = {
  top: '0.2em',
  right: '0.4em',
  bottom: '0.2em',
  left: '0.4em',
}

/** The CSS declarations a textblock's border and shading draw with. */
export function paragraphFormatCSS(attrs: Readonly<Record<string, unknown>>): string[] {
  const declarations: string[] = []
  const border = paragraphBorderOf(attrs)
  if (border) {
    const color = border.color ?? 'currentColor'
    // A double line needs three pixels to show as two.
    const width = border.style === 'double' ? Math.max(3, border.width) : border.width
    for (const side of border.sides) {
      declarations.push(`border-${side}: ${width}px ${border.style} ${color}`)
      declarations.push(`padding-${side}: ${BORDER_PADDING[side]}`)
    }
  }
  const shading = paragraphShadingOf(attrs)
  if (shading) declarations.push(`background-color: ${shading}`)
  return declarations
}

/** The `data-` attributes a textblock's drop cap and tab stops are written as. */
export function paragraphFormatHTML(
  attrs: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const html: Record<string, string> = {}
  const dropCap = dropCapOf(attrs)
  if (dropCap) {
    html['data-drop-cap'] = dropCap.kind
    html['data-drop-cap-lines'] = String(dropCap.lines)
  }
  const stops = tabStopsOf(attrs)
  if (stops.length > 0) html['data-tab-stops'] = formatTabStops(stops)
  return html
}

/** Border, shading and drop cap read back from an element's markup. */
export function parseParagraphFormat(element: HTMLElement): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  const style = element.style
  const sides = BORDER_SIDES.filter((side) => {
    const line = style.getPropertyValue(`border-${side}-style`)
    return line !== '' && line !== 'none' && line !== 'hidden'
  })
  if (sides.length > 0) {
    const first = sides[0] as BorderSide
    const line = style.getPropertyValue(`border-${first}-style`)
    const width = Number.parseFloat(style.getPropertyValue(`border-${first}-width`))
    Object.assign(
      attrs,
      paragraphBorderAttrs({
        sides,
        style: BORDER_STYLES.find((each) => each === line) ?? 'solid',
        width: Number.isFinite(width) ? width : 1,
        color: safeColor(style.getPropertyValue(`border-${first}-color`)),
      }),
    )
    if (attrs.borderColor === 'currentcolor') attrs.borderColor = null
  }
  const shading = paragraphShadingOf({ shading: style.backgroundColor })
  if (shading) attrs.shading = shading
  const stops = parseTabStops(element.getAttribute('data-tab-stops'))
  if (stops.length > 0) attrs.tabStops = formatTabStops(stops)
  const dropCap = element.getAttribute('data-drop-cap')
  if (dropCap === 'drop' || dropCap === 'margin') {
    const lines = Number.parseInt(element.getAttribute('data-drop-cap-lines') ?? '', 10)
    Object.assign(attrs, {
      dropCap,
      dropCapLines: dropCapOf({ dropCap, dropCapLines: lines })?.lines,
    })
  }
  return attrs
}

export type TabAlignment = 'left' | 'center' | 'right' | 'decimal'

export const TAB_ALIGNMENTS: readonly TabAlignment[] = ['left', 'center', 'right', 'decimal']

export type TabLeader = 'none' | 'dot' | 'hyphen' | 'underscore'

export const TAB_LEADERS: readonly TabLeader[] = ['none', 'dot', 'hyphen', 'underscore']

/**
 * A custom tab stop, as Word's Tabs dialog sets one: where a tab character
 * takes the text to, how the text after it lines up there, and what fills
 * the gap (a dot leader for a contents line: "Results ........ 12").
 */
export interface TabStop {
  /** From the paragraph's start edge (the margin, not its indent), in points. */
  readonly position: number
  readonly align: TabAlignment
  readonly leader: TabLeader
}

/** Word's default: a stop every half inch where no custom one reaches. */
export const DEFAULT_TAB_INTERVAL = 36

/** Furthest a stop may sit, in points: past the widest page there is. */
const MAX_TAB_POSITION = 1584

/**
 * Tab stops as the attribute stores them, `72 left, 216 right dot`: each a
 * position in points, an alignment and, when there is one, a leader; in
 * order of position, one per position. Anything else is dropped.
 */
export function parseTabStops(value: unknown): TabStop[] {
  if (typeof value !== 'string') return []
  const stops = new Map<number, TabStop>()
  for (const part of value.split(',')) {
    const [rawPosition, rawAlign, rawLeader] = part.trim().split(/\s+/)
    const position = Math.round(Number.parseFloat(rawPosition ?? '') * 100) / 100
    if (!Number.isFinite(position) || position <= 0 || position > MAX_TAB_POSITION) continue
    const align = TAB_ALIGNMENTS.find((each) => each === rawAlign) ?? 'left'
    const leader = TAB_LEADERS.find((each) => each === rawLeader) ?? 'none'
    stops.set(position, { position, align, leader })
  }
  return [...stops.values()].sort((a, b) => a.position - b.position)
}

export function formatTabStops(stops: readonly TabStop[]): string {
  return stops
    .map((stop) =>
      [stop.position, stop.align, stop.leader === 'none' ? '' : stop.leader].join(' ').trim(),
    )
    .join(', ')
}

/** A textblock's custom tab stops, in order; none when it has none. */
export function tabStopsOf(attrs: Readonly<Record<string, unknown>>): TabStop[] {
  return parseTabStops(attrs.tabStops)
}
