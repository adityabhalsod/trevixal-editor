import {
  type Command,
  type EditorNode,
  type Path,
  SetNodeAttrsStep,
  nodeAtPath,
} from '@trevixal/core'
import { type CellSide, hiddenBordersValue, hiddenSides } from './schema'

/**
 * The Eraser: stop drawing one side of one cell.
 *
 * Only that cell's side is marked. The stylesheet draws a marked side
 * `hidden`, which in the collapsed border model wins over the neighbour's
 * visible one, so a line two cells share goes whichever of them it was
 * erased from.
 *
 * Declines for a path that is not a cell, and for a side already hidden.
 */
export function hideCellBorder(cellPath: Path, side: CellSide): Command {
  return (state) => {
    const cell = nodeAtPath(state.doc, cellPath)
    if (cell?.type.name !== 'tableCell' || hidesSide(cell, side)) return null
    const hiddenBorders = hiddenBordersValue([...hiddenSides(cell.attrs.hiddenBorders), side])
    return state.tr.step(new SetNodeAttrsStep(cellPath, { ...cell.attrs, hiddenBorders }))
  }
}

/** Whether the Eraser took this side of the cell out. */
export function hidesSide(cell: EditorNode, side: CellSide): boolean {
  return hiddenSides(cell.attrs.hiddenBorders).includes(side)
}

/** The cell's `hiddenBorders` with these sides drawn again. */
export function showingSides(cell: EditorNode, sides: readonly CellSide[]): string | null {
  return hiddenBordersValue(
    hiddenSides(cell.attrs.hiddenBorders).filter((side) => !sides.includes(side)),
  )
}

/**
 * `hiddenBorders` for part `index` of a cell cut into `count` side by side.
 * An erased top or bottom ran the cell's whole width, so every part keeps
 * it; the left side stays with the first part and the right with the last,
 * and the new lines between the parts are drawn.
 */
export function sidesOfColumnPart(cell: EditorNode, index: number, count: number): string | null {
  const inner: CellSide[] = []
  if (index > 0) inner.push('left')
  if (index < count - 1) inner.push('right')
  return showingSides(cell, inner)
}

/**
 * `hiddenBorders` for one cell merged from `cells`, left to right: the first
 * one's left side, the last one's right, and a top or bottom only where every
 * one of them had it erased. Part of an edge cannot be hidden, and a line
 * that comes back is easier to notice than one that quietly went missing.
 */
export function sidesOfMerge(cells: readonly EditorNode[]): string | null {
  const first = cells[0]
  const last = cells[cells.length - 1]
  if (!first || !last) return null
  const everywhere = (side: CellSide): boolean => cells.every((cell) => hidesSide(cell, side))
  const sides: CellSide[] = []
  if (everywhere('top')) sides.push('top')
  if (hidesSide(last, 'right')) sides.push('right')
  if (everywhere('bottom')) sides.push('bottom')
  if (hidesSide(first, 'left')) sides.push('left')
  return hiddenBordersValue(sides)
}
