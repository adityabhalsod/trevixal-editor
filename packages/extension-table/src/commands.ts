import {
  type Attrs,
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  type Position,
  ReplaceNodesStep,
  type Schema,
  SetNodeAttrsStep,
  TableMap,
  type TableMapCell,
  type TableRect,
  TextSelection,
  type Transaction,
  nodeAtPath,
  pos,
  replaceNodeAt,
} from '@trevixal/core'
import { sidesOfMergedRect, sidesOfPart } from './cell-borders'
import { type CellAlign, safeTableLength } from './schema'
import {
  type BuiltTable,
  type Placed,
  caretAtGrid,
  carrySelection,
  placedFor,
  placementsOf,
  tableFrom,
} from './table-grid'

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

/** The context's cell as its table's grid places it. */
export function gridCellOf(context: CellContext): TableMapCell {
  return TableMap.of(context.table).cellAt(context.rowIndex, context.cellIndex) as TableMapCell
}

/** How many grid columns a cell covers. */
export function colspanOf(cell: EditorNode): number {
  const value = cell.attrs.colspan
  return typeof value === 'number' && value > 1 ? value : 1
}

/** How many rows a cell covers. */
export function rowspanOf(cell: EditorNode): number {
  const value = cell.attrs.rowspan
  return typeof value === 'number' && value > 1 ? value : 1
}

/**
 * Column index where a cell begins, counting the colspans before it in its
 * own row. A cell spanning down from a row above stands in this row's
 * columns too without being one of its cells, so for a table with vertical
 * merges read the column off `TableMap` instead.
 */
export function columnStart(row: EditorNode, cellIndex: number): number {
  let column = 0
  for (let i = 0; i < cellIndex; i++) column += colspanOf(row.child(i))
  return column
}

/** How many grid columns the table has. */
export function columnCount(table: EditorNode): number {
  return TableMap.of(table).width
}

/**
 * The cell covering a column among a row's own cells, with its index and
 * start column. Like {@link columnStart}, it sees only the row's own cells.
 */
export function cellAtColumn(
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

export function emptyCell(schema: Schema, attrs: Attrs): EditorNode {
  return schema
    .nodeType('tableCell')
    .create(attrs, Fragment.of(schema.firstTextblockType().create()))
}

export function cursorIn(tablePath: Path, rowIndex: number, cellIndex: number): TextSelection {
  return new TextSelection(pos([...tablePath, rowIndex, cellIndex, 0], 0))
}

/** The row with the cell at `index` replaced by `cells`. */
export function withCells(
  row: EditorNode,
  index: number,
  cells: readonly EditorNode[],
): EditorNode {
  const children = [...row.content.children]
  children.splice(index, 1, ...cells)
  return row.withContent(Fragment.from(children))
}

/**
 * Swap a rebuilt table in, with the selection it should land on. Declines
 * when the table came out the same.
 */
export function replaceTable(
  state: EditorState,
  tablePath: Path,
  built: EditorNode,
  selection: TextSelection | null,
): Transaction | null {
  const before = nodeAtPath(state.doc, tablePath)
  if (!before || built.eq(before)) return null
  const tr = state.tr.step(replaceNodeAt(tablePath, Fragment.of(built)))
  return selection ? tr.setSelection(selection) : tr
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

/** A width cut to `part` of the `whole` columns it covered, for an uneven split. */
export function scaleWidth(value: unknown, part: number, whole: number): string | null {
  const width = widthParts(value)
  return width && whole > 0 ? widthOf((width.size * part) / whole, width.unit) : null
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

/** The distinct cells covering a grid row, left to right, skipping holes. */
function cellsAcross(map: TableMap, row: number): TableMapCell[] {
  const found: TableMapCell[] = []
  for (let column = 0; column < map.width; column++) {
    const cell = map.at(row, column)
    if (cell && found[found.length - 1] !== cell) found.push(cell)
  }
  return found
}

/**
 * Add a row above or below the current cell, mirroring the columns of the
 * row beside it. Below a cell that spans rows means below its last one. A
 * cell spanning across the new row's place grows to cover it, as Word's
 * merged cells do.
 */
export function addRow(where: 'before' | 'after'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const { table, tablePath } = context
    const schema = state.schema
    const map = TableMap.of(table)
    const current = gridCellOf(context)
    const boundary = where === 'after' ? current.top + current.height : current.top
    const reference = where === 'after' ? boundary - 1 : boundary
    const placed = placementsOf(table)
    const added: Placed[] = []
    for (const cell of cellsAcross(map, reference)) {
      const standing = placedFor(map, placed, cell)
      if (cell.top < boundary && cell.top + cell.height > boundary) {
        standing.height += 1
        continue
      }
      // The width travels with the mirrored cell: under `table-layout: fixed`
      // the browser reads the columns off the first row, so a new row without
      // widths inserted before it would resize the whole table.
      added.push({
        node: emptyCell(schema, {
          header: false,
          colspan: 1,
          align: null,
          width: cell.node.attrs.width ?? null,
        }),
        top: boundary,
        left: cell.left,
        width: cell.width,
        height: 1,
      })
    }
    // A row the cells beside it would cover completely has no cell of its own.
    const first = added[0]
    if (!first) return null
    for (const cell of placed) if (cell.top >= boundary) cell.top += 1
    const rows = [...table.content.children]
    rows.splice(boundary, 0, schema.nodeType('tableRow').create())
    const built = tableFrom(table, rows, [...placed, ...added])
    const row = built.rowIndex[boundary] ?? boundary
    return replaceTable(
      state,
      tablePath,
      built.table,
      caretAtGrid(tablePath, built.table, row, first.left),
    )
  }
}

/**
 * Add a column left or right of the current cell. A cell the new column's
 * place falls inside widens across it instead, once, however many rows it
 * spans.
 */
export function addColumn(where: 'before' | 'after'): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const { table, tablePath } = context
    const schema = state.schema
    const map = TableMap.of(table)
    const current = gridCellOf(context)
    const boundary = where === 'after' ? current.left + current.width : current.left
    const placed = placementsOf(table)
    const added: Placed[] = []
    for (let row = 0; row < map.height; row++) {
      const inside = map.at(row, boundary)
      if (inside && inside.left < boundary) {
        // Widened below, once for the whole cell.
        if (inside.top === row) placedFor(map, placed, inside).width += 1
        continue
      }
      const neighbor = inside ?? map.at(row, boundary - 1)
      added.push({
        node: emptyCell(schema, {
          header: neighbor?.node.attrs.header === true,
          colspan: 1,
          align: null,
        }),
        top: row,
        left: boundary,
        width: 1,
        height: 1,
      })
    }
    for (const cell of placed) if (cell.left >= boundary) cell.left += 1
    const built = tableFrom(table, table.content.children, [...placed, ...added])
    const selection = state.selection
    const carried =
      selection instanceof TextSelection
        ? carrySelection(selection, tablePath, table, placed, built)
        : null
    return replaceTable(state, tablePath, built.table, carried)
  }
}

/**
 * Delete the current cell's leftmost column. A cell wider than the column
 * narrows instead; a row left with no cell of its own goes with it.
 */
export const deleteColumn: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table, tablePath } = context
  const map = TableMap.of(table)
  if (map.width <= 1) return deleteTable(state)
  const current = gridCellOf(context)
  const column = current.left
  const kept: Placed[] = []
  for (const cell of placementsOf(table)) {
    if (cell.left <= column && cell.left + cell.width > column) {
      if (cell.width === 1) continue
      cell.width -= 1
    } else if (cell.left > column) {
      cell.left -= 1
    }
    kept.push(cell)
  }
  if (kept.length === 0) return deleteTable(state)
  const built = tableFrom(table, table.content.children, kept)
  const width = TableMap.of(built.table).width
  const row = landingRow(built, current.top)
  // The caret's own row went with the column: the first cell of the row that
  // took its place. Otherwise the cell that took the column's place.
  const vanished = built.rowIndex[current.top] === -1
  const landing = vanished
    ? cursorIn(tablePath, row, 0)
    : caretAtGrid(tablePath, built.table, row, Math.min(column, width - 1))
  return replaceTable(state, tablePath, built.table, landing)
}

/** Where a row went in a rebuilt table: its own index, or that of the row that took its place. */
function landingRow(built: BuiltTable, row: number): number {
  const height = built.table.childCount
  const own = built.rowIndex[row] ?? -1
  if (own !== -1) return own
  const before = built.rowIndex.slice(0, row).filter((index) => index !== -1).length
  return Math.min(before, height - 1)
}

/**
 * Delete the rows the current cell covers (one, unless it spans more), or
 * the whole table when that is every row. A cell spanning into them from
 * above loses them; one starting in them and reaching below moves down to
 * the first row left, with its content.
 */
export const deleteRow: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table, tablePath } = context
  const current = gridCellOf(context)
  const first = current.top
  const last = current.top + current.height - 1
  const count = last - first + 1
  if (count >= table.childCount) return deleteTable(state)
  const kept: Placed[] = []
  for (const cell of placementsOf(table)) {
    const end = cell.top + cell.height - 1
    if (cell.top >= first && end <= last) continue
    if (cell.top >= first && cell.top <= last) {
      cell.height = end - last
      cell.top = first
    } else if (cell.top < first && end >= first) {
      cell.height -= Math.min(end, last) - first + 1
    } else if (cell.top > last) {
      cell.top -= count
    }
    kept.push(cell)
  }
  const rows = [...table.content.children]
  rows.splice(first, count)
  const built = tableFrom(table, rows, kept)
  const rowIndex = Math.min(first, built.table.childCount - 1)
  return replaceTable(state, tablePath, built.table, cursorIn(tablePath, rowIndex, 0))
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

/** The part of a table a merge would take in: the selection's corner cells' rectangle, grown to whole cells. */
export function mergeRect(state: EditorState): { context: CellContext; rect: TableRect } | null {
  const selection = state.selection
  const fromContext = cellContextAt(state.doc, selection.from)
  const toContext = cellContextAt(state.doc, selection.to)
  if (!fromContext || !toContext) return null
  // The same depth is not the same table: two tables side by side in the
  // document both sit at depth one, and merging across them would edit the
  // first on the strength of a selection that left it.
  if (fromContext.tablePath.join('/') !== toContext.tablePath.join('/')) return null
  const map = TableMap.of(fromContext.table)
  const rect = map.expand(map.rectAround(gridCellOf(fromContext), gridCellOf(toContext)))
  return map.cellsIn(rect).length > 1 ? { context: fromContext, rect } : null
}

/**
 * Merge the cells the selection covers into one: a row of them, a column of
 * them, or any rectangle. A cell reaching outside the selection is taken in
 * whole, since part of a cell cannot be merged. The text goes into the
 * top-left cell, in reading order.
 */
export const mergeCells: Command = (state) => {
  const found = mergeRect(state)
  if (!found) return null
  const { context, rect } = found
  const { table, tablePath } = context
  const map = TableMap.of(table)
  const inside = map.cellsIn(rect).sort((a, b) => a.top - b.top || a.left - b.left)
  const corner = inside[0] as TableMapCell
  const combined = inside.reduce(
    (fragment, cell) => fragment.append(cell.node.content),
    Fragment.empty,
  )
  // Empty paragraphs from vacant cells are noise; keep at least one block.
  const blocks = combined.children.filter(
    (block) => !(block.isTextblock && block.textContent.length === 0),
  )
  const content = blocks.length > 0 ? Fragment.from(blocks) : combined.slice(0, 1)
  const topEdge = inside.filter((cell) => cell.top === rect.top).map((cell) => cell.node)
  const merged = corner.node
    .withAttrs({
      ...corner.node.attrs,
      width: sumWidths(topEdge),
      hiddenBorders: sidesOfMergedRect(inside, rect),
    })
    .withContent(content)
  const placed = placementsOf(table)
  const gone = new Set(inside.map((cell) => placedFor(map, placed, cell)))
  const kept = placed.filter((cell) => !gone.has(cell))
  kept.push({
    node: merged,
    top: rect.top,
    left: rect.left,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  })
  const built = tableFrom(table, table.content.children, kept)
  const row = built.rowIndex[rect.top] ?? rect.top
  return replaceTable(
    state,
    tablePath,
    built.table,
    caretAtGrid(tablePath, built.table, row, rect.left),
  )
}

/** Split a merged cell, across columns, rows or both, back into unit cells. */
export const splitCell: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table, tablePath } = context
  const current = gridCellOf(context)
  if (current.width <= 1 && current.height <= 1) return null
  const schema = state.schema
  const map = TableMap.of(table)
  const placed = placementsOf(table)
  const target = placedFor(map, placed, current)
  const parts: Placed[] = []
  for (let row = 0; row < current.height; row++) {
    for (let column = 0; column < current.width; column++) {
      const attrs = {
        ...current.node.attrs,
        colspan: 1,
        rowspan: 1,
        width: shareWidth(current.node.attrs.width, current.width),
        hiddenBorders: sidesOfPart(current.node, row, column, current.height, current.width),
      }
      parts.push({
        node: row === 0 && column === 0 ? current.node.withAttrs(attrs) : emptyCell(schema, attrs),
        top: current.top + row,
        left: current.left + column,
        width: 1,
        height: 1,
      })
    }
  }
  const kept = [...placed.filter((cell) => cell !== target), ...parts]
  const built = tableFrom(table, table.content.children, kept)
  const row = built.rowIndex[current.top] ?? current.top
  return replaceTable(
    state,
    tablePath,
    built.table,
    caretAtGrid(tablePath, built.table, row, current.left),
  )
}

/**
 * Enter on the empty last paragraph of the bottom-right cell: a new paragraph
 * after the table, with the caret in it.
 *
 * A table at the end of the document otherwise traps the caret. Nothing can
 * follow it, and Enter inside a cell only ever makes another paragraph in
 * that cell. This is the same gesture a blockquote and a callout answer to,
 * in the one cell where there is nowhere further to go.
 *
 * The blank paragraph is taken along, unless it is all the cell has: a cell
 * holds `block+`, so emptying it would leave the table invalid.
 */
export const escapeTableOnEnter: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const path = selection.from.path
  const context = cellContextAt(state.doc, selection.from)
  if (!context) return null

  const { table, tablePath, cell } = context
  // Only the bottom-right cell: anywhere else there is still table to move
  // through, and Tab is how you move through it. A cell spanning down to the
  // last row counts, from whichever row holds it.
  const map = TableMap.of(table)
  if (map.at(map.height - 1, map.width - 1) !== gridCellOf(context)) return null

  const blockIndex = path[path.length - 1] as number
  if (blockIndex !== cell.childCount - 1) return null
  const block = nodeAtPath(state.doc, path)
  if (!block?.isTextblock || block.textContent.length > 0) return null

  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return null
  const tableIndex = tablePath[tablePath.length - 1] as number
  const parentPath = tablePath.slice(0, -1)

  const tr = state.tr
  if (cell.childCount > 1) {
    tr.step(new ReplaceNodesStep(path.slice(0, -1), blockIndex, blockIndex + 1, Fragment.empty))
  }
  tr.step(
    new ReplaceNodesStep(
      parentPath,
      tableIndex + 1,
      tableIndex + 1,
      Fragment.of(paragraph.create()),
    ),
  )
  tr.setSelection(new TextSelection(pos([...parentPath, tableIndex + 1], 0)))
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
