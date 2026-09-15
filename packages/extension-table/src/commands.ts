import {
  type Attrs,
  type Command,
  type EditorNode,
  Fragment,
  type Path,
  type Position,
  ReplaceNodesStep,
  type Schema,
  SetNodeAttrsStep,
  TextSelection,
  pos,
  replaceNodeAt,
} from '@trevixal/core'
import { type CellAlign, safeTableLength } from './schema'

export interface CellContext {
  readonly tablePath: Path
  readonly table: EditorNode
  readonly rowIndex: number
  readonly row: EditorNode
  readonly cellIndex: number
  readonly cell: EditorNode
}

/** Resolve the innermost table containing a position. */
export function cellContextAt(doc: EditorNode, position: Position): CellContext | null {
  const chain: EditorNode[] = [doc]
  let current: EditorNode = doc
  for (const index of position.path) {
    const child = current.content.maybeChild(index)
    if (!child) return null
    chain.push(child)
    current = child
  }
  for (let depth = chain.length - 1; depth >= 0; depth--) {
    const node = chain[depth]
    if (node?.type.name !== 'table') continue
    const rowIndex = position.path[depth]
    const cellIndex = position.path[depth + 1]
    const row = chain[depth + 1]
    const cell = chain[depth + 2]
    if (rowIndex === undefined || cellIndex === undefined || !row || !cell) return null
    return { tablePath: position.path.slice(0, depth), table: node, rowIndex, row, cellIndex, cell }
  }
  return null
}

/** How many grid columns a cell covers. */
export function colspanOf(cell: EditorNode): number {
  const value = cell.attrs.colspan
  return typeof value === 'number' && value > 1 ? value : 1
}

/** Column index where a cell begins (colspans included). */
export function columnStart(row: EditorNode, cellIndex: number): number {
  let column = 0
  for (let i = 0; i < cellIndex; i++) column += colspanOf(row.child(i))
  return column
}

export function columnCount(table: EditorNode): number {
  let max = 0
  for (const row of table.content.children) {
    max = Math.max(max, columnStart(row, row.childCount))
  }
  return max
}

/** The cell covering a column, with its index and start column. */
function cellAtColumn(
  row: EditorNode,
  column: number,
): { index: number; start: number; cell: EditorNode } | null {
  let start = 0
  for (let i = 0; i < row.childCount; i++) {
    const cell = row.child(i)
    const end = start + colspanOf(cell)
    if (column >= start && column < end) return { index: i, start, cell }
    start = end
  }
  return null
}

function emptyCell(schema: Schema, attrs: Attrs): EditorNode {
  return schema
    .nodeType('tableCell')
    .create(attrs, Fragment.of(schema.firstTextblockType().create()))
}

function cursorIn(tablePath: Path, rowIndex: number, cellIndex: number): TextSelection {
  return new TextSelection(pos([...tablePath, rowIndex, cellIndex, 0], 0))
}

/**
 * A cell width as a number and a unit, when it is one the schema will emit.
 * `auto` and `0` carry no unit to share out, so they read as no width.
 */
const SIZED_WIDTH = /^(\d{1,5}(?:\.\d{1,3})?)(px|em|rem|%|ch|vw)$/

function widthParts(value: unknown): { size: number; unit: string } | null {
  const text = safeTableLength(value)
  const match = text ? SIZED_WIDTH.exec(text) : null
  const size = match?.[1]
  const unit = match?.[2]
  return size !== undefined && unit !== undefined ? { size: Number.parseFloat(size), unit } : null
}

/** Two decimals, so the result is still a length the schema serializes. */
function widthOf(size: number, unit: string): string | null {
  return safeTableLength(`${Math.round(size * 100) / 100}${unit}`)
}

/**
 * The combined width of the cells being merged. A spanning cell carries the
 * width of every column it covers, the convention `setTableSizing` and
 * `distributeColumnsEvenly` both write, so merging has to add them up. Mixed
 * or missing units cannot be added, and clear the width instead.
 */
function sumWidths(cells: readonly EditorNode[]): string | null {
  let unit: string | null = null
  let total = 0
  for (const cell of cells) {
    const parts = widthParts(cell.attrs.width)
    if (!parts || (unit !== null && parts.unit !== unit)) return null
    unit = parts.unit
    total += parts.size
  }
  return unit === null ? null : widthOf(total, unit)
}

/** The inverse: a split cell's columns each take their share of its width. */
function shareWidth(value: unknown, parts: number): string | null {
  const width = widthParts(value)
  return width && parts > 0 ? widthOf(width.size / parts, width.unit) : null
}

export interface InsertTableOptions {
  readonly rows?: number
  readonly cols?: number
  readonly headerRow?: boolean
}

/** Insert a table at the selection (replacing an empty paragraph in place). */
export function insertTable(options: InsertTableOptions = {}): Command {
  return (state) => {
    const rows = Math.max(1, options.rows ?? 3)
    const cols = Math.max(1, options.cols ?? 3)
    const headerRow = options.headerRow !== false
    const schema = state.schema
    const rowType = schema.nodeType('tableRow')
    const rowNodes: EditorNode[] = []
    for (let r = 0; r < rows; r++) {
      const cells: EditorNode[] = []
      for (let c = 0; c < cols; c++) {
        cells.push(emptyCell(schema, { header: headerRow && r === 0, colspan: 1, align: null }))
      }
      rowNodes.push(rowType.create(undefined, Fragment.from(cells)))
    }
    const table = schema.nodeType('table').create(undefined, Fragment.from(rowNodes))

    const selection = state.selection
    const blockPath = selection.to.path
    if (blockPath.length === 0) return null
    const parentPath = blockPath.slice(0, -1)
    const index = blockPath[blockPath.length - 1] as number
    const block = state.doc.content.maybeChild(blockPath[0] as number)
    const tr = state.tr
    const currentEmpty =
      blockPath.length === 1 && block?.isTextblock && block.textContent.length === 0
    if (currentEmpty) {
      tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.of(table)))
      tr.setSelection(cursorIn([...parentPath, index], 0, 0))
    } else {
      tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.of(table)))
      tr.setSelection(cursorIn([...parentPath, index + 1], 0, 0))
    }
    return tr
  }
}

/** Add a row above or below the current one, mirroring its column layout. */
export function addRow(where: 'before' | 'after'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const schema = state.schema
    // The width travels with the mirrored cell: under `table-layout: fixed`
    // the browser reads the columns off the first row, so a new row without
    // widths inserted before it would resize the whole table.
    const cells = context.row.content.children.map((cell) =>
      emptyCell(schema, {
        header: false,
        colspan: colspanOf(cell),
        align: null,
        width: cell.attrs.width ?? null,
      }),
    )
    const row = schema.nodeType('tableRow').create(undefined, Fragment.from(cells))
    const target = context.rowIndex + (where === 'after' ? 1 : 0)
    const tr = state.tr
    tr.step(new ReplaceNodesStep(context.tablePath, target, target, Fragment.of(row)))
    tr.setSelection(cursorIn(context.tablePath, target, 0))
    return tr
  }
}

/** Add a column left or right of the current cell across every row. */
export function addColumn(where: 'before' | 'after'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const schema = state.schema
    const boundary =
      columnStart(context.row, context.cellIndex) +
      (where === 'after' ? colspanOf(context.cell) : 0)
    const tr = state.tr
    context.table.content.children.forEach((row, rowIndex) => {
      const rowPath = [...context.tablePath, rowIndex]
      const covering = cellAtColumn(row, boundary)
      if (covering && covering.start < boundary) {
        // The boundary falls inside a spanning cell: widen it instead.
        tr.step(
          new SetNodeAttrsStep([...rowPath, covering.index], {
            ...covering.cell.attrs,
            colspan: colspanOf(covering.cell) + 1,
          }),
        )
        return
      }
      const insertAt = covering ? covering.index : row.childCount
      const neighbor = row.content.maybeChild(Math.min(insertAt, row.childCount - 1))
      const header = neighbor?.attrs.header === true
      tr.step(
        new ReplaceNodesStep(
          rowPath,
          insertAt,
          insertAt,
          Fragment.of(emptyCell(schema, { header, colspan: 1, align: null })),
        ),
      )
    })
    return tr
  }
}

/** Delete the current cell's leftmost column across every row. */
export const deleteColumn: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  if (columnCount(context.table) <= 1) return deleteTable(state)
  const column = columnStart(context.row, context.cellIndex)
  const tr = state.tr
  // Rows that lose their only cell go with it: a row with no cells is not a
  // valid table row, and a short row whose one cell sat in this column has
  // nothing left to show. Removing one shifts the rows after it, so the steps
  // are addressed against the table as it stands.
  const survivors: number[] = []
  context.table.content.children.forEach((row, rowIndex) => {
    const covering = cellAtColumn(row, column)
    const at = survivors.length
    if (!covering) {
      survivors.push(rowIndex)
      return
    }
    if (colspanOf(covering.cell) > 1) {
      survivors.push(rowIndex)
      tr.step(
        new SetNodeAttrsStep([...context.tablePath, at, covering.index], {
          ...covering.cell.attrs,
          colspan: colspanOf(covering.cell) - 1,
        }),
      )
      return
    }
    if (row.childCount <= 1) {
      tr.step(new ReplaceNodesStep(context.tablePath, at, at + 1, Fragment.empty))
      return
    }
    survivors.push(rowIndex)
    tr.step(
      new ReplaceNodesStep(
        [...context.tablePath, at],
        covering.index,
        covering.index + 1,
        Fragment.empty,
      ),
    )
  })
  if (survivors.length === 0) return deleteTable(state)
  if (!tr.docChanged) return null
  tr.setSelection(cursorIn(context.tablePath, ...caretAfterDelete(context, column, survivors)))
  return tr
}

/** Where the caret lands once a column is gone: [rowIndex, cellIndex]. */
function caretAfterDelete(
  context: CellContext,
  column: number,
  survivors: readonly number[],
): [number, number] {
  const stayed = survivors.indexOf(context.rowIndex)
  // The caret's own row went with the column: follow it to the row that took
  // its place, or to the last one when it was at the bottom.
  if (stayed === -1) {
    const before = survivors.filter((index) => index < context.rowIndex).length
    return [Math.min(before, survivors.length - 1), 0]
  }
  const covering = cellAtColumn(context.row, column)
  const removed = covering !== null && colspanOf(covering.cell) === 1
  const shifted =
    removed && covering.index < context.cellIndex ? context.cellIndex - 1 : context.cellIndex
  const remaining = context.row.childCount - (removed ? 1 : 0)
  return [stayed, Math.max(0, Math.min(shifted, remaining - 1))]
}

/** Delete the current row (or the whole table when it is the last one). */
export const deleteRow: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  if (context.table.childCount <= 1) return deleteTable(state)
  const tr = state.tr
  tr.step(
    new ReplaceNodesStep(context.tablePath, context.rowIndex, context.rowIndex + 1, Fragment.empty),
  )
  const rowIndex = Math.min(context.rowIndex, context.table.childCount - 2)
  tr.setSelection(cursorIn(context.tablePath, rowIndex, 0))
  return tr
}

/** Replace the whole table with an empty paragraph. */
export const deleteTable: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const paragraph = state.schema.firstTextblockType().create()
  const tr = state.tr
  tr.step(replaceNodeAt(context.tablePath, Fragment.of(paragraph)))
  tr.setSelection(new TextSelection(pos(context.tablePath, 0)))
  return tr
}

/** Toggle the first row between header and regular cells. */
export const toggleHeaderRow: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const firstRow = context.table.content.maybeChild(0)
  if (!firstRow) return null
  const makeHeader = !firstRow.content.children.every((cell) => cell.attrs.header === true)
  const tr = state.tr
  firstRow.content.children.forEach((cell, cellIndex) => {
    if (cell.attrs.header === makeHeader) return
    tr.step(
      new SetNodeAttrsStep([...context.tablePath, 0, cellIndex], {
        ...cell.attrs,
        header: makeHeader,
      }),
    )
  })
  tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
  return tr.docChanged ? tr : null
}

/** Set (or clear) the text alignment of the current cell. */
export function setCellAlign(align: CellAlign | null): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    if (context.cell.attrs.align === align) return null
    const tr = state.tr
    tr.step(
      new SetNodeAttrsStep([...context.tablePath, context.rowIndex, context.cellIndex], {
        ...context.cell.attrs,
        align,
      }),
    )
    tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
    return tr
  }
}

/** Merge the horizontally adjacent cells covered by the selection. */
export const mergeCells: Command = (state) => {
  const selection = state.selection
  const fromContext = cellContextAt(state.doc, selection.from)
  const toContext = cellContextAt(state.doc, selection.to)
  if (!fromContext || !toContext) return null
  if (
    // The same depth is not the same table: two tables side by side in the
    // document both sit at depth one, and merging across them would edit the
    // first on the strength of a selection that left it.
    fromContext.tablePath.join('/') !== toContext.tablePath.join('/') ||
    fromContext.rowIndex !== toContext.rowIndex ||
    fromContext.cellIndex === toContext.cellIndex
  ) {
    return null
  }
  const first = Math.min(fromContext.cellIndex, toContext.cellIndex)
  const last = Math.max(fromContext.cellIndex, toContext.cellIndex)
  const row = fromContext.row
  const merged = row.content.children.slice(first, last + 1)
  const colspan = merged.reduce((sum, cell) => sum + colspanOf(cell), 0)
  const firstCell = merged[0] as EditorNode
  const combined = merged.reduce((fragment, cell) => fragment.append(cell.content), Fragment.empty)
  // Empty paragraphs from vacant cells are noise; keep at least one block.
  const kept = combined.children.filter(
    (block) => !(block.isTextblock && block.textContent.length === 0),
  )
  const content = kept.length > 0 ? Fragment.from(kept) : combined.slice(0, 1)
  const cell = firstCell
    .withAttrs({ ...firstCell.attrs, colspan, width: sumWidths(merged) })
    .withContent(content)
  const rowPath = [...fromContext.tablePath, fromContext.rowIndex]
  const tr = state.tr
  tr.step(new ReplaceNodesStep(rowPath, first, last + 1, Fragment.of(cell)))
  tr.setSelection(cursorIn(fromContext.tablePath, fromContext.rowIndex, first))
  return tr
}

/** Split a merged (colspan > 1) cell back into unit cells. */
export const splitCell: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context || colspanOf(context.cell) <= 1) return null
  const schema = state.schema
  const attrs = {
    ...context.cell.attrs,
    colspan: 1,
    width: shareWidth(context.cell.attrs.width, colspanOf(context.cell)),
  }
  const cells: EditorNode[] = [context.cell.withAttrs(attrs)]
  for (let i = 1; i < colspanOf(context.cell); i++) {
    cells.push(emptyCell(schema, attrs))
  }
  const rowPath = [...context.tablePath, context.rowIndex]
  const tr = state.tr
  tr.step(
    new ReplaceNodesStep(rowPath, context.cellIndex, context.cellIndex + 1, Fragment.from(cells)),
  )
  tr.setSelection(cursorIn(context.tablePath, context.rowIndex, context.cellIndex))
  return tr
}

/** Tab navigation: move to the next/previous cell; Tab past the end adds a row. */
export function goToNextCell(direction: 1 | -1): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    let rowIndex = context.rowIndex
    let cellIndex = context.cellIndex + direction
    while (true) {
      const row = context.table.content.maybeChild(rowIndex)
      if (!row) break
      if (cellIndex >= 0 && cellIndex < row.childCount) {
        const tr = state.tr
        tr.setSelection(cursorIn(context.tablePath, rowIndex, cellIndex))
        return tr
      }
      rowIndex += direction
      const nextRow = context.table.content.maybeChild(rowIndex)
      if (!nextRow) break
      cellIndex = direction > 0 ? 0 : nextRow.childCount - 1
    }
    if (direction > 0) {
      // Tab on the last cell grows the table by a row.
      return addRow('after')(state)
    }
    return null
  }
}
