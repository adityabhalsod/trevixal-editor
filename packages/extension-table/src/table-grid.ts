import {
  type EditorNode,
  Fragment,
  type Path,
  type Position,
  TableMap,
  type TableMapCell,
  TextSelection,
  pos,
} from '@trevixal/core'

/**
 * A cell on the grid while a command reshapes its table.
 *
 * A row alone cannot say which columns its cells stand in once a cell above
 * spans down into it, so the structural commands work on the grid instead:
 * they move, resize, add and remove these, and {@link tableFrom} builds the
 * rows back. Placements are plain objects, changed in place, so a command
 * working through several cells keeps each one's position current however
 * the others moved it.
 */
export interface Placed {
  node: EditorNode
  top: number
  left: number
  width: number
  height: number
}

/** The table's cells as placements, in document order: `cells[i]` is `TableMap.of(table).cells[i]`. */
export function placementsOf(table: EditorNode): Placed[] {
  return TableMap.of(table).cells.map(({ node, top, left, width, height }) => ({
    node,
    top,
    left,
    width,
    height,
  }))
}

/** The placement standing for a map cell, found by its place in document order. */
export function placedFor(map: TableMap, placed: readonly Placed[], cell: TableMapCell): Placed {
  return placed[map.cells.indexOf(cell)] as Placed
}

/** A table built back from placements, and the input rows it kept. */
export interface BuiltTable {
  readonly table: EditorNode
  /** For each row passed in, its index in the built table, or -1 when it was dropped. */
  readonly rowIndex: readonly number[]
}

/**
 * The table built back from placements: a row per grid row, each holding
 * the cells that start in it in column order, their spans rewritten. `rows`
 * gives each grid row's own node, for its attributes; its cells are replaced.
 *
 * A grid row no cell starts in is dropped, and each cell spanning it loses
 * that row. A row the cells above cover completely has nothing of its own to
 * show, and a table row has to hold a cell. That is Word's answer too when
 * two whole rows are merged: one row.
 */
export function tableFrom(
  table: EditorNode,
  rows: readonly EditorNode[],
  cells: readonly Placed[],
): BuiltTable {
  const live = cells.map((cell) => ({ ...cell }))
  const kept = rows.map((_, index) => index)
  for (let row = rows.length - 1; row >= 0; row--) {
    if (live.some((cell) => cell.top === row)) continue
    for (const cell of live) {
      if (cell.top > row) cell.top -= 1
      else if (cell.top + cell.height > row) cell.height -= 1
    }
    kept.splice(row, 1)
  }
  const built = kept.map((source, index) => {
    const own = live
      .filter((cell) => cell.top === index)
      .sort((a, b) => a.left - b.left)
      .map((cell) => withSpans(cell.node, cell.width, Math.min(cell.height, kept.length - index)))
    return (rows[source] as EditorNode).withContent(Fragment.from(own))
  })
  const rowIndex = rows.map((_, index) => kept.indexOf(index))
  return { table: table.withContent(Fragment.from(built)), rowIndex }
}

function spanValue(value: unknown): number {
  return typeof value === 'number' && value > 1 ? value : 1
}

/** The cell with these spans, the same node when it already had them. */
function withSpans(node: EditorNode, width: number, height: number): EditorNode {
  const colspan = Math.max(1, width)
  const rowspan = Math.max(1, height)
  if (spanValue(node.attrs.colspan) === colspan && spanValue(node.attrs.rowspan) === rowspan) {
    return node
  }
  return node.withAttrs({ ...node.attrs, colspan, rowspan })
}

/** A caret at the start of the cell covering a grid position of `table`, or null off the grid. */
export function caretAtGrid(
  tablePath: Path,
  table: EditorNode,
  row: number,
  column: number,
): TextSelection | null {
  const cell = TableMap.of(table).at(row, column)
  return cell ? new TextSelection(pos([...tablePath, cell.row, cell.index, 0], 0)) : null
}

/**
 * The selection carried over a table rebuilt from placements: each end that
 * was inside one of the table's cells goes to the same place in that cell,
 * wherever the cell now stands. An end whose cell is gone is null.
 */
export function carrySelection(
  selection: TextSelection,
  tablePath: Path,
  before: EditorNode,
  placed: readonly Placed[],
  after: BuiltTable,
): TextSelection | null {
  const from = carryPosition(selection.anchor, tablePath, before, placed, after)
  const to = carryPosition(selection.head, tablePath, before, placed, after)
  return from && to ? new TextSelection(from, to) : null
}

function carryPosition(
  position: Position,
  tablePath: Path,
  before: EditorNode,
  placed: readonly Placed[],
  after: BuiltTable,
): Position | null {
  const depth = tablePath.length
  const inside =
    position.path.length > depth + 1 && tablePath.every((index, i) => position.path[i] === index)
  if (!inside) return position
  const row = position.path[depth] as number
  const index = position.path[depth + 1] as number
  const map = TableMap.of(before)
  const cell = map.cellAt(row, index)
  const moved = cell ? placed[map.cells.indexOf(cell)] : undefined
  if (!moved) return null
  const landed = TableMap.of(after.table).at(after.rowIndex[moved.top] ?? -1, moved.left)
  if (!landed || landed.node.content !== moved.node.content) return null
  return pos(
    [...tablePath, landed.row, landed.index, ...position.path.slice(depth + 2)],
    position.offset,
  )
}
