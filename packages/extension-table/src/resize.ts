import {
  type Command,
  type EditorNode,
  Fragment,
  type Path,
  SetNodeAttrsStep,
  replaceNodeAt,
} from '@trevixal/core'
import { cellContextAt, colspanOf, columnStart } from './commands'
import { safeTableLength } from './schema'

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

/**
 * Distribute the table's width evenly across its columns.
 *
 * Percentages rather than pixels, so the result still adapts to its
 * container. A table sized in px stops fitting the moment the page is
 * narrower than the sum of its columns.
 */
export function distributeColumnsEvenly(): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null

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
    return state.tr.step(replaceNodeAt(tablePath, Fragment.of(next)))
  }
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
    const { table, tablePath } = located

    const columns = sizing.columnWidths
    // Sizes reach a style attribute as `${n}px`; anything that is not a
    // positive finite number is a caller error, refused rather than written.
    if (columns && !columns.every(isLength)) return null
    // Columns are a proportion of the table, the table a proportion of the
    // space it sits in, two different denominators, so they are resolved
    // separately.
    const room = target.relativeTo
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
    const next = table.type.create(attrs, Fragment.from(rows), table.marks)
    return state.tr.step(replaceNodeAt(tablePath, Fragment.of(next)))
  }
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
