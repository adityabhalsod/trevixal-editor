import type { EditorNode } from './node'

/** One cell placed on its table's grid. */
export interface TableMapCell {
  readonly node: EditorNode
  /** The row that holds the cell, and its index among that row's cells. */
  readonly row: number
  readonly index: number
  /** Where its top-left corner sits on the grid, and how many rows and columns it covers. */
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** Part of a grid: rows `top` to `bottom - 1`, columns `left` to `right - 1`. */
export interface TableRect {
  readonly top: number
  readonly left: number
  readonly bottom: number
  readonly right: number
}

/** A cell's `colspan` or `rowspan`, as a whole number of at least 1. */
function spanOf(cell: EditorNode, name: 'colspan' | 'rowspan'): number {
  const value = cell.attrs[name]
  return typeof value === 'number' && Number.isFinite(value) && value > 1 ? Math.floor(value) : 1
}

const maps = new WeakMap<EditorNode, TableMap>()

/**
 * A table laid out on its grid, as HTML lays out `colspan` and `rowspan`:
 * each row's cells take the first columns that no cell spanning down from a
 * row above already covers.
 *
 * A row's cells alone cannot say which columns they stand in once a cell
 * above spans down into the row, so everything that reasons about columns
 * (commands, exports, serializers) reads them from here. Tables are
 * immutable, so a map is built once per table node and kept.
 *
 * Nothing is assumed about the table being well formed. A span that runs
 * past the last row stops there, a short row leaves holes (positions no cell
 * covers), and where two cells overlap the first one placed keeps the spot.
 */
export class TableMap {
  private constructor(
    /** Columns in the grid. */
    readonly width: number,
    /** Rows in the grid, the table's rows. */
    readonly height: number,
    /** Every cell, in document order. */
    readonly cells: readonly TableMapCell[],
    private readonly grid: readonly (TableMapCell | null)[],
  ) {}

  /** The map of a table node. */
  static of(table: EditorNode): TableMap {
    let map = maps.get(table)
    if (!map) {
      map = new TableMap(...layOut(table))
      maps.set(table, map)
    }
    return map
  }

  /** The cell covering a grid position, or null for a hole or a position off the grid. */
  at(row: number, column: number): TableMapCell | null {
    if (row < 0 || row >= this.height || column < 0 || column >= this.width) return null
    return this.grid[row * this.width + column] ?? null
  }

  /** The cell at a row and index in the document, or null. */
  cellAt(row: number, index: number): TableMapCell | null {
    return this.cells.find((cell) => cell.row === row && cell.index === index) ?? null
  }

  /** Every cell overlapping a rectangle, once each, in document order. */
  cellsIn(rect: TableRect): TableMapCell[] {
    return this.cells.filter(
      (cell) =>
        cell.top < rect.bottom &&
        cell.top + cell.height > rect.top &&
        cell.left < rect.right &&
        cell.left + cell.width > rect.left,
    )
  }

  /** The smallest rectangle holding both cells. */
  rectAround(a: TableMapCell, b: TableMapCell): TableRect {
    return {
      top: Math.min(a.top, b.top),
      left: Math.min(a.left, b.left),
      bottom: Math.max(a.top + a.height, b.top + b.height),
      right: Math.max(a.left + a.width, b.left + b.width),
    }
  }

  /**
   * The rectangle grown until no cell overlapping it sticks out of it: what a
   * merge has to take in, since part of a cell cannot be merged.
   */
  expand(rect: TableRect): TableRect {
    let current = rect
    while (true) {
      let { top, left, bottom, right } = current
      for (const cell of this.cellsIn(current)) {
        top = Math.min(top, cell.top)
        left = Math.min(left, cell.left)
        bottom = Math.max(bottom, cell.top + cell.height)
        right = Math.max(right, cell.left + cell.width)
      }
      const grown = { top, left, bottom, right }
      if (
        grown.top === current.top &&
        grown.left === current.left &&
        grown.bottom === current.bottom &&
        grown.right === current.right
      ) {
        return current
      }
      current = grown
    }
  }
}

/** Place every cell of a table on its grid: the width, height, cells and grid a map holds. */
function layOut(
  table: EditorNode,
): [number, number, readonly TableMapCell[], readonly (TableMapCell | null)[]] {
  const rows = table.content.children
  const height = rows.length
  const covered: (TableMapCell | undefined)[][] = rows.map(() => [])
  const cells: TableMapCell[] = []
  let width = 0
  rows.forEach((row, rowIndex) => {
    const line = covered[rowIndex] as (TableMapCell | undefined)[]
    let column = 0
    row.content.children.forEach((node, index) => {
      while (line[column]) column++
      const cellWidth = spanOf(node, 'colspan')
      const cell: TableMapCell = {
        node,
        row: rowIndex,
        index,
        top: rowIndex,
        left: column,
        width: cellWidth,
        height: Math.min(spanOf(node, 'rowspan'), height - rowIndex),
      }
      cells.push(cell)
      for (let r = rowIndex; r < rowIndex + cell.height; r++) {
        const target = covered[r] as (TableMapCell | undefined)[]
        for (let c = column; c < column + cellWidth; c++) target[c] ??= cell
      }
      column += cellWidth
      width = Math.max(width, column)
    })
  })
  const grid = new Array<TableMapCell | null>(width * height).fill(null)
  covered.forEach((line, row) => {
    line.forEach((cell, column) => {
      if (cell) grid[row * width + column] = cell
    })
  })
  return [width, height, cells, grid]
}
