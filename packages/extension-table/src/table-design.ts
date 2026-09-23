import {
  type Attrs,
  type Command,
  type EditorState,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  safeColor,
} from '@trevixal/core'
import { cellContextAt, toggleHeaderRow } from './commands'
import {
  TABLE_BORDER_STYLES,
  TABLE_BORDER_WIDTHS,
  TABLE_STYLES,
  TABLE_STYLE_OPTIONS,
  type TableBorderStyle,
  type TableBorderWidth,
  type TableBorders,
  type TableStyle,
  type TableStyleOption,
  tableBorderStyle,
  tableBorderWidth,
  tableBorders,
  tableStyle,
} from './schema'

/** One tile of the Table Styles gallery. */
export interface TableStyleChoice {
  readonly label: string
  readonly style: TableStyle | null
  readonly accentColor: string | null
}

/**
 * The accents the gallery offers each look in: Office's current theme
 * colours, with the three light ones (orange, sky and lime) taken a shade
 * darker, so a header row filled with any of them carries white text at the
 * 4.5:1 contrast WCAG AA asks of it. Word's own fall short at about 3:1.
 */
const ACCENTS: readonly (readonly [name: string, color: string])[] = [
  ['Blue', '#156082'],
  ['Orange', '#b85418'],
  ['Green', '#196b24'],
  ['Sky', '#0e79ad'],
  ['Purple', '#a02b93'],
  ['Lime', '#3b7d22'],
]

/**
 * Word's Table Styles gallery, simplified: the plain Table Grid, then each
 * look in the text colour and in six accents.
 */
export const TABLE_STYLE_GALLERY: readonly TableStyleChoice[] = [
  { label: 'Table grid', style: null, accentColor: null },
  { label: 'Grid', style: 'grid', accentColor: null },
  ...ACCENTS.map(([name, color]) => ({
    label: `${name} grid`,
    style: 'grid' as const,
    accentColor: color,
  })),
  { label: 'Header', style: 'header', accentColor: null },
  ...ACCENTS.map(([name, color]) => ({
    label: `${name} header`,
    style: 'header' as const,
    accentColor: color,
  })),
]

/** Every Table Style Option the checkboxes offer, the header row included. */
export type TableDesignOption = 'headerRow' | TableStyleOption

export const TABLE_DESIGN_OPTIONS: readonly TableDesignOption[] = [
  'headerRow',
  ...TABLE_STYLE_OPTIONS,
]

/** What the Table Design controls show for the table holding the selection. */
export interface TableDesign {
  readonly style: TableStyle | null
  readonly accentColor: string | null
  readonly options: Readonly<Record<TableDesignOption, boolean>>
  readonly borders: TableBorders | null
  readonly borderStyle: TableBorderStyle
  readonly borderWidth: TableBorderWidth
  readonly borderColor: string | null
}

/** The design of the table holding the selection, or null outside every table. */
export function tableDesignAt(state: EditorState): TableDesign | null {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { attrs } = context.table
  const firstRow = context.table.content.maybeChild(0)
  const headerRow =
    firstRow !== null &&
    firstRow.childCount > 0 &&
    firstRow.content.children.every((cell) => cell.attrs.header === true)
  const style = tableStyle(attrs.tableStyle)
  return {
    style,
    accentColor: style ? safeColor(attrs.accentColor) : null,
    options: {
      headerRow,
      ...(Object.fromEntries(
        TABLE_STYLE_OPTIONS.map((option) => [option, attrs[option] === true]),
      ) as Record<TableStyleOption, boolean>),
    },
    borders: tableBorders(attrs.borders),
    borderStyle: tableBorderStyle(attrs.borderStyle) ?? 'solid',
    borderWidth: tableBorderWidth(attrs.borderWidth) ?? '0.5pt',
    borderColor: safeColor(attrs.borderColor),
  }
}

/**
 * Word's Table Styles gallery: draw the table in a style, in `accentColor`
 * or, without one, in the text colour. Null returns it to the plain grid.
 * Declines outside a table, for a style or colour it does not know, and
 * when the table already has that look.
 */
export function setTableStyle(
  style: TableStyle | null,
  accentColor: string | null = null,
): Command {
  return (state) => {
    if (style !== null && !TABLE_STYLES.includes(style)) return null
    const accent = style !== null && accentColor !== null ? safeColor(accentColor) : null
    // A colour that is not one is a caller error, not a request for the text colour.
    if (style !== null && accentColor !== null && accent === null) return null
    return setTableAttrs(state, { tableStyle: style, accentColor: accent })
  }
}

/**
 * Word's Table Style Options: turn one on or off for the table holding the
 * selection. The header row makes the first row's cells header cells, which
 * is `toggleHeaderRow`; the others are the table's own switches.
 */
export function toggleTableStyleOption(option: TableDesignOption): Command {
  if (option === 'headerRow') return toggleHeaderRow
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context || !TABLE_STYLE_OPTIONS.includes(option)) return null
    return setTableAttrs(state, { [option]: context.table.attrs[option] !== true })
  }
}

/** The pen's line style for every line of the table. Solid is the default. */
export function setTableBorderStyle(style: TableBorderStyle | null): Command {
  return (state) =>
    style === null || TABLE_BORDER_STYLES.includes(style)
      ? setTableAttrs(state, { borderStyle: tableBorderStyle(style) })
      : null
}

/** The pen's weight for every line of the table. ½ pt is the default. */
export function setTableBorderWidth(width: TableBorderWidth | null): Command {
  return (state) =>
    width === null || TABLE_BORDER_WIDTHS.includes(width)
      ? setTableAttrs(state, { borderWidth: tableBorderWidth(width) })
      : null
}

/** Merge attributes into the table holding the selection; null when none of them change. */
function setTableAttrs(state: EditorState, changes: Attrs): Transaction | null {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table, tablePath } = context
  if (Object.entries(changes).every(([key, value]) => (table.attrs[key] ?? null) === value)) {
    return null
  }
  const tr = state.tr.step(new SetNodeAttrsStep(tablePath, { ...table.attrs, ...changes }))
  return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
}
