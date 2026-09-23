import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  replaceNodeAt,
} from '@trevixal/core'
import { cellContextAt, colspanOf, columnCount, columnStart } from './commands'
import { cellsInSelection } from './features'
import { safeTableLength } from './schema'
import type { MeasureTable } from './table-geometry'

/**
 * Set the width of the column holding the selection.
 *
 * The width goes on every cell in that column, because a column is not a node:
 * HTML carries a column's width on its cells. Passing null clears it.
 *
 * The table is also switched to `table-layout: fixed`, without which the
 * browser treats a cell width as a minimum and widens it to fit content, so
 * setting a width would appear to do nothing.
 */
export function setColumnWidth(width: string | null): Command {
  return (state) => {
    const value = width === null ? null : safeTableLength(width)
    // A non-null width that fails validation is a caller error, not a request
    // to clear: declining says so rather than silently wiping the column.
    if (width !== null && value === null) return null

    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const { table, tablePath, row, cellIndex } = context
    const column = columnStart(row, cellIndex)

    const rows = table.content.children.map((candidate) => {
      const index = childIndexAtColumn(candidate, column)
      if (index === null) return candidate
      const cells = [...candidate.content.children]
      const cell = cells[index]
      if (!cell) return candidate
      cells[index] = cell.type.create({ ...cell.attrs, width: value }, cell.content, cell.marks)
      return candidate.type.create(candidate.attrs, Fragment.from(cells), candidate.marks)
    })

    const next = table.type.create(
      // Fixed layout, or the width is only ever a minimum.
      { ...table.attrs, layout: value ? 'fixed' : table.attrs.layout },
      Fragment.from(rows),
      table.marks,
    )
    return state.tr.step(replaceNodeAt(tablePath, Fragment.of(next)))
  }
}

/** Set the height of the row holding the selection; null clears it. */
export function setRowHeight(height: string | null): Command {
  return (state) => {
    const value = height === null ? null : safeTableLength(height)
    if (height !== null && value === null) return null

    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const { tablePath, rowIndex, row } = context
    return state.tr.step(
      new SetNodeAttrsStep([...tablePath, rowIndex], { ...row.attrs, height: value }),
    )
  }
}

/** Set the width of the whole table; null returns it to its natural width. */
export function setTableWidth(width: string | null): Command {
  return (state) => {
    const value = width === null ? null : safeTableLength(width)
    if (width !== null && value === null) return null

    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    return state.tr.step(
      new SetNodeAttrsStep(context.tablePath, { ...context.table.attrs, width: value }),
    )
  }
}

/**
 * Drop every explicit width and height, returning the table to content-driven
 * sizing. The escape hatch from a layout that has been resized into a corner.
 */
export const clearTableSizing: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null

  const { table, tablePath } = context
  const rows = table.content.children.map((row) => {
    const cells = row.content.children.map((cell) =>
      cell.attrs.width === null
        ? cell
        : cell.type.create({ ...cell.attrs, width: null }, cell.content, cell.marks),
    )
    return row.attrs.height === null && cells.every((cell, i) => cell === row.child(i))
      ? row
      : row.type.create({ ...row.attrs, height: null }, Fragment.from(cells), row.marks)
  })

  const next = table.type.create(
    { ...table.attrs, width: null, layout: null },
    Fragment.from(rows),
    table.marks,
  )
  return state.tr.step(replaceNodeAt(tablePath, Fragment.of(next)))
}

/** For the commands that size a table by how it looks on the page. */
export interface MeasuredSizingOptions {
  /** Reads the table's geometry off the page: `measureTableGeometry(editor)`. */
  readonly measure: MeasureTable
}

/**
 * Word's AutoFit Contents: every column as wide as its content needs, and the
 * table only as wide as they add up to. Row heights stay as they are.
 */
export const autoFitContents: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table } = context
  const next = table.type.create(
    { ...table.attrs, width: 'auto', layout: null },
    Fragment.from(table.content.children.map((row) => withCellWidths(row, () => null))),
    table.marks,
  )
  return replaceTable(state, context.tablePath, table, next)
}

/**
 * Word's AutoFit Window: the table as wide as the space it sits in. A column
 * sized as a share of the table keeps its share, and so widens with it; one
 * sized in fixed units cannot follow the window, and gives its width up to
 * be shared out again.
 */
export const autoFitWindow: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table } = context
  let keepsWidths = false
  const rows = table.content.children.map((row) =>
    withCellWidths(row, (width) => {
      const share = safeTableLength(width)?.endsWith('%') ? (width as string) : null
      if (share) keepsWidths = true
      return share
    }),
  )
  const next = table.type.create(
    { ...table.attrs, width: '100%', layout: keepsWidths ? table.attrs.layout : null },
    Fragment.from(rows),
    table.marks,
  )
  return replaceTable(state, context.tablePath, table, next)
}

/**
 * Word's Fixed Column Width: the columns stay as wide as they are now, rather
 * than following their content. A table the browser laid out has no widths
 * to keep until they are read off the page, hence `measure`.
 */
export function fixColumnWidths(options: MeasuredSizingOptions): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    const geometry = context ? options.measure(context.tablePath) : null
    if (!context || !geometry) return null
    const sizing = { columnWidths: geometry.columns, width: geometry.width }
    const next = sizedTable(context.table, sizing, geometry.room)
    return next ? replaceTable(state, context.tablePath, context.table, next) : null
  }
}

/**
 * Word's Distribute Rows: the selected rows, or every row when the selection
 * sits in one, all made as tall as the tallest of them. The tallest is the
 * one height every row can take, because a row never shrinks below its text.
 */
export function distributeRowsEvenly(options: MeasuredSizingOptions): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    const geometry = context ? options.measure(context.tablePath) : null
    if (!context || !geometry) return null
    const selected = [
      ...new Set(cellsInSelection(state).map(({ path }) => path[path.length - 2] as number)),
    ]
    const rows = selected.length > 1 ? selected : context.table.content.children.map((_, i) => i)
    const tallest = Math.max(...rows.map((index) => geometry.rows[index] ?? 0))
    if (!(tallest > 0)) return null
    // Sparse: the rows left out keep their heights.
    const rowHeights: number[] = []
    for (const index of rows) rowHeights[index] = tallest
    const next = sizedTable(context.table, { rowHeights }, geometry.room)
    return next ? replaceTable(state, context.tablePath, context.table, next) : null
  }
}

/**
 * Word's Distribute Columns: the selected columns share their combined width
 * equally, or, with the selection in one cell, every column shares the
 * table's.
 *
 * Percentages rather than pixels, so the result still adapts to its
 * container. A table sized in px stops fitting the moment the page is
 * narrower than the sum of its columns.
 *
 * Evening out part of a table keeps the rest where it is, which needs the
 * widths the page gave them: that takes `measure`. Without it the whole
 * table is shared out, whatever is selected.
 */
export function distributeColumnsEvenly(options: Partial<MeasuredSizingOptions> = {}): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

    const part = selectedColumns(state, context.table)
    const geometry = part && options.measure ? options.measure(context.tablePath) : null
    if (part && geometry) {
      const columnWidths = [...geometry.columns]
      const shared = columnWidths.slice(part.first, part.last + 1)
      const each = shared.reduce((sum, width) => sum + width, 0) / shared.length
      columnWidths.fill(each, part.first, part.last + 1)
      const next = sizedTable(context.table, { columnWidths, width: geometry.width }, geometry.room)
      return next ? replaceTable(state, context.tablePath, context.table, next) : null
    }

    const { table, tablePath } = context
    let columns = 0
    for (const row of table.content.children) {
      columns = Math.max(columns, columnStart(row, row.childCount))
    }
    if (columns < 1) return null

    // Two decimals: enough that the columns visibly match, few enough that the
    // serialized style stays readable.
    const each = `${Math.round((100 / columns) * 100) / 100}%`

    const rows = table.content.children.map((row) => {
      const cells = row.content.children.map((cell) => {
        const span = cell.attrs.colspan
        const width =
          typeof span === 'number' && span > 1
            ? `${Math.round((100 / columns) * span * 100) / 100}%`
            : each
        return cell.type.create({ ...cell.attrs, width }, cell.content, cell.marks)
      })
      return row.type.create(row.attrs, Fragment.from(cells), row.marks)
    })

    const next = table.type.create(
      { ...table.attrs, layout: 'fixed' },
      Fragment.from(rows),
      table.marks,
    )
    return replaceTable(state, tablePath, table, next)
  }
}

/**
 * The grid columns a selection of several cells covers, when that is some of
 * the table's columns but not all of them; null otherwise.
 */
function selectedColumns(
  state: EditorState,
  table: EditorNode,
): { first: number; last: number } | null {
  const cells = cellsInSelection(state)
  if (cells.length < 2) return null
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  for (const { path, cell } of cells) {
    const row = table.child(path[path.length - 2] as number)
    const start = columnStart(row, path[path.length - 1] as number)
    first = Math.min(first, start)
    last = Math.max(last, start + colspanOf(cell) - 1)
  }
  return last > first && last - first + 1 < columnCount(table) ? { first, last } : null
}

/** The row with every cell's width passed through `map`. */
function withCellWidths(row: EditorNode, map: (width: unknown) => string | null): EditorNode {
  const cells = row.content.children.map((cell) => {
    const width = map(cell.attrs.width)
    return width === (cell.attrs.width ?? null) ? cell : cell.withAttrs({ ...cell.attrs, width })
  })
  return row.withContent(Fragment.from(cells))
}

/**
 * Swap in a resized table, or decline when it came out the same. The rows
 * and cells are all still there, so the selection is kept, where the replace
 * step alone would carry it out of the table.
 */
function replaceTable(
  state: EditorState,
  tablePath: Path,
  before: EditorNode,
  after: EditorNode,
): Transaction | null {
  if (after.eq(before)) return null
  const tr = state.tr.step(replaceNodeAt(tablePath, Fragment.of(after)))
  return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
}

/** Child index of the cell that starts at a grid column, else null. */
function childIndexAtColumn(row: EditorNode, column: number): number | null {
  let start = 0
  for (let index = 0; index < row.childCount; index++) {
    if (start === column) return index
    const cell = row.child(index)
    const span = cell.attrs.colspan
    start += typeof span === 'number' && span > 1 ? span : 1
    if (start > column) return null
  }
  return null
}

/**
 * Explicit sizes for a whole table, in px.
 *
 * The resize handles commit one of these per drag, every column at once,
 * because `table-layout: fixed` shares whatever width the sized columns leave
 * over among the unsized ones. Setting only the dragged column therefore moved
 * every other column too, and the next drag moved the first one again. With
 * every column pinned there is nothing left to redistribute.
 *
 * Widths are written to the cells' `width`, which the kit's stylesheet makes
 * border-box: a column is then exactly as wide as the cells in it, so what the
 * handles measure is what they write back.
 */
export interface TableSizing {
  /** Width of every grid column, left to right. */
  readonly columnWidths?: readonly number[]
  /**
   * Height of each row, top to bottom. `null` clears a row's height and a
   * missing (undefined) entry leaves that row as it is, so a single-row drag
   * passes a sparse array.
   */
  readonly rowHeights?: readonly (number | null | undefined)[]
  /** The table's own width; `null` clears it. */
  readonly width?: number | null
}

export interface TableSizingTarget {
  /**
   * Path of the table to size. Defaults to the table holding the selection;
   * the handles pass the table under the pointer instead, so a drag never has
   * to move the caret into the table it resizes.
   */
  readonly tablePath?: Path
  /**
   * Width of the space the table sits in, in px. Given it, the sizes are
   * stored as proportions of it rather than as pixels.
   *
   * Pixels are a measurement of the window the drag happened in: a table
   * sized in fullscreen keeps those pixels when fullscreen ends and hangs off
   * the edge of the narrower editor, because `table-layout: fixed` widens a
   * table to fit its columns whatever `max-width` says. Proportions survive
   * the change of window, which is what a column width means to the person
   * who dragged it.
   */
  readonly relativeTo?: number
}

/**
 * Apply a {@link TableSizing}. A cell spanning several columns is given their
 * combined width, which keeps the fixed layout consistent with the grid.
 */
export function setTableSizing(sizing: TableSizing, target: TableSizingTarget = {}): Command {
  return (state) => {
    const located = target.tablePath
      ? tableAt(state.doc, target.tablePath)
      : cellContextAt(state.doc, state.selection.from)
    if (!located) return null
    const next = sizedTable(located.table, sizing, target.relativeTo)
    return next ? state.tr.step(replaceNodeAt(located.tablePath, Fragment.of(next))) : null
  }
}

/**
 * `table` with a {@link TableSizing} applied, stored as proportions of `room`
 * when it is given (see {@link TableSizingTarget.relativeTo}). Null when the
 * sizing holds a length that is not a positive number.
 */
export function sizedTable(
  table: EditorNode,
  sizing: TableSizing,
  room?: number,
): EditorNode | null {
  const columns = sizing.columnWidths
  // Sizes reach a style attribute as `${n}px`; anything that is not a
  // positive finite number is a caller error, refused rather than written.
  if (columns && !columns.every(isLength)) return null
  // Columns are a proportion of the table, the table a proportion of the
  // space it sits in, two different denominators, so they are resolved
  // separately.
  const proportional = typeof room === 'number' && Number.isFinite(room) && room > 0
  const span = typeof sizing.width === 'number' && sizing.width > 0 ? sizing.width : null
  const columnLength = (value: number): string =>
    proportional && span !== null ? pct((value / span) * 100) : px(value)
  if (sizing.rowHeights?.some((height) => typeof height === 'number' && !isLength(height))) {
    return null
  }
  if (typeof sizing.width === 'number' && !isLength(sizing.width)) return null

  const rows = table.content.children.map((row, rowIndex) => {
    const cells = columns
      ? row.content.children.map((cell, index) => {
          const start = columnStart(row, index)
          const covered = columns.slice(start, start + colspanOf(cell))
          // A grid wider than the widths supplied keeps its own sizes.
          if (covered.length < colspanOf(cell)) return cell
          const width = columnLength(covered.reduce((sum, value) => sum + value, 0))
          return cell.type.create({ ...cell.attrs, width }, cell.content, cell.marks)
        })
      : [...row.content.children]
    const height = sizing.rowHeights?.[rowIndex]
    const attrs =
      height === undefined
        ? row.attrs
        : { ...row.attrs, height: height === null ? null : px(height) }
    return row.type.create(attrs, Fragment.from(cells), row.marks)
  })

  const attrs: Record<string, unknown> = { ...table.attrs }
  // Fixed layout, or the widths are only ever minimums.
  if (columns) attrs.layout = 'fixed'
  if (sizing.width !== undefined) {
    attrs.width =
      sizing.width === null
        ? null
        : proportional
          ? pct(Math.min(100, (sizing.width / room) * 100))
          : px(sizing.width)
  }
  return table.type.create(attrs, Fragment.from(rows), table.marks)
}

function isLength(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/** Whole pixels: the serialized style stays readable, and sub-pixel drift cannot accumulate. */
function px(value: number): string {
  return `${Math.max(1, Math.round(value))}px`
}

/**
 * A percentage to two decimals: fine enough that a column does not visibly
 * shift, coarse enough to stay inside what the schema's length pattern
 * accepts and to keep the serialized style readable.
 */
function pct(value: number): string {
  return `${Math.round(Math.max(0.01, value) * 100) / 100}%`
}

/** The table at a path, or null when the path leads anywhere else. */
function tableAt(doc: EditorNode, path: Path): { table: EditorNode; tablePath: Path } | null {
  let node: EditorNode = doc
  for (const index of path) {
    const child = node.content.maybeChild(index)
    if (!child) return null
    node = child
  }
  return node.type.name === 'table' ? { table: node, tablePath: path } : null
}
