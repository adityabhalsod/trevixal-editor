import type { NodeSpec } from '@trevixal/core'
import { safeColor } from '@trevixal/core'

export type CellAlign = 'left' | 'center' | 'right'

/** Which rules a table draws: every cell edge, the outline only, row rules, or none. */
export type TableBorders = 'all' | 'outer' | 'horizontal' | 'none'

export const TABLE_BORDERS: readonly TableBorders[] = ['all', 'outer', 'horizontal', 'none']

/** Coerce a value to a known border style, or null. */
export function tableBorders(value: unknown): TableBorders | null {
  return TABLE_BORDERS.includes(value as TableBorders) ? (value as TableBorders) : null
}

/** A side of a table cell. */
export type CellSide = 'top' | 'right' | 'bottom' | 'left'

/** The four sides in CSS order, the order a `hiddenBorders` value lists them in. */
export const CELL_SIDES: readonly CellSide[] = ['top', 'right', 'bottom', 'left']

/** The sides a `hiddenBorders` value names, in CSS order; anything else is dropped. */
export function hiddenSides(value: unknown): CellSide[] {
  if (typeof value !== 'string') return []
  const words = value.toLowerCase().split(/\s+/)
  return CELL_SIDES.filter((side) => words.includes(side))
}

/** The `hiddenBorders` value naming these sides, or null when there are none. */
export function hiddenBordersValue(sides: Iterable<CellSide>): string | null {
  const named = new Set(sides)
  const value = CELL_SIDES.filter((side) => named.has(side)).join(' ')
  return value === '' ? null : value
}

const ALIGNS: readonly CellAlign[] = ['left', 'center', 'right']

function parseAlign(value: string | null): CellAlign | null {
  return ALIGNS.includes(value as CellAlign) ? (value as CellAlign) : null
}

/**
 * A CSS length this schema will emit: a non-negative number with a unit we
 * recognise, or `auto`. Values reach a `style` attribute, so anything not
 * matching is dropped rather than escaped. The same rule the core schema
 * applies to colours and lengths.
 */
const LENGTH = /^(?:auto|0|\d{1,5}(?:\.\d{1,3})?(?:px|em|rem|%|ch|vw))$/

export function safeTableLength(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return LENGTH.test(trimmed) ? trimmed : null
}

/** Append one sanitized declaration to a style attribute bag. */
function addStyle(attrs: Record<string, string>, property: string, value: string | null): void {
  if (!value) return
  attrs.style = attrs.style ? `${attrs.style}; ${property}: ${value}` : `${property}: ${value}`
}

/** Read one declaration out of an element's inline style. */
function styleValue(element: HTMLElement, property: string): string | null {
  const raw = element.style.getPropertyValue(property)
  return safeTableLength(raw)
}

/**
 * Table node specs to merge into a schema:
 * `new Schema({ nodes: { ...defaultNodes(), ...tableNodes() }, marks: … })`.
 *
 * Cells span horizontally via `colspan`; vertical (rowspan) merging is a
 * roadmap item. A cell with `header: true` renders as `th`.
 */
export function tableNodes(): Record<string, NodeSpec> {
  return {
    table: {
      content: 'tableRow+',
      group: 'block',
      attrs: {
        width: { default: null },
        // `fixed` makes the column widths authoritative; `auto` lets content
        // size them. Resizing a column is meaningless under `auto`, so the
        // resize commands switch this over.
        layout: { default: null },
        // Border style and colour travel as data attributes plus a custom
        // property, so the kit's stylesheet (and an exported copy of it)
        // draws them without any per-cell inline styles.
        borders: { default: null },
        borderColor: { default: null },
      },
      toHTML: (node) => {
        const attrs: Record<string, string> = {}
        addStyle(attrs, 'width', safeTableLength(node.attrs.width))
        if (node.attrs.layout === 'fixed') addStyle(attrs, 'table-layout', 'fixed')
        const borders = tableBorders(node.attrs.borders)
        if (borders) attrs['data-borders'] = borders
        const borderColor = safeColor(node.attrs.borderColor)
        if (borderColor) {
          attrs['data-border-color'] = borderColor
          addStyle(attrs, '--tvx-table-border', borderColor)
        }
        return { tag: 'table', attrs }
      },
      parseHTML: [
        {
          tag: 'table',
          getAttrs: (element) => ({
            width: styleValue(element, 'width'),
            layout: element.style.tableLayout === 'fixed' ? 'fixed' : null,
            borders: tableBorders(element.getAttribute('data-borders')),
            borderColor: safeColor(element.getAttribute('data-border-color')),
          }),
        },
      ],
    },
    tableRow: {
      content: 'tableCell+',
      attrs: { height: { default: null } },
      toHTML: (node) => {
        const attrs: Record<string, string> = {}
        addStyle(attrs, 'height', safeTableLength(node.attrs.height))
        return { tag: 'tr', attrs }
      },
      parseHTML: [
        { tag: 'tr', getAttrs: (element) => ({ height: styleValue(element, 'height') }) },
      ],
    },
    tableCell: {
      content: 'block+',
      attrs: {
        header: { default: false },
        colspan: { default: 1 },
        align: { default: null },
        // A column's width lives on its cells, which is how HTML carries it.
        width: { default: null },
        background: { default: null },
        // Sides whose line the Eraser took out, `'top left'`; null draws all four.
        hiddenBorders: { default: null },
      },
      toHTML: (node) => {
        const attrs: Record<string, string> = {}
        const colspan = node.attrs.colspan
        if (typeof colspan === 'number' && colspan > 1) attrs.colspan = String(colspan)
        const align = parseAlign(node.attrs.align as string | null)
        if (align) addStyle(attrs, 'text-align', align)
        addStyle(attrs, 'width', safeTableLength(node.attrs.width))
        addStyle(attrs, 'background-color', safeColor(node.attrs.background))
        const hidden = hiddenBordersValue(hiddenSides(node.attrs.hiddenBorders))
        if (hidden) attrs['data-hidden-borders'] = hidden
        return { tag: node.attrs.header === true ? 'th' : 'td', attrs }
      },
      parseHTML: [
        { tag: 'td', getAttrs: (element) => cellAttrsFrom(element, false) },
        { tag: 'th', getAttrs: (element) => cellAttrsFrom(element, true) },
      ],
    },
  }
}

function cellAttrsFrom(element: HTMLElement, header: boolean): Record<string, unknown> {
  const colspanRaw = Number.parseInt(element.getAttribute('colspan') ?? '1', 10)
  const colspan = Number.isNaN(colspanRaw) || colspanRaw < 1 ? 1 : Math.min(colspanRaw, 100)
  const style = element.getAttribute('style') ?? ''
  const styleMatch = /text-align:\s*(left|center|right)/i.exec(style)
  const align = parseAlign(
    (styleMatch?.[1] ?? element.getAttribute('align'))?.toLowerCase() ?? null,
  )
  const backgroundMatch = /background(?:-color)?:\s*([^;]+)/i.exec(style)
  const background = safeColor(
    backgroundMatch?.[1]?.trim() ?? element.getAttribute('bgcolor') ?? null,
  )
  const hiddenBorders = hiddenBordersValue(hiddenSides(element.getAttribute('data-hidden-borders')))
  return { header, colspan, align, width: styleValue(element, 'width'), background, hiddenBorders }
}
