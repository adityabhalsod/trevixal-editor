import { inlineLength } from './inline'
import type { EditorNode } from './node'
import { type Position, comparePositions, pos } from './position'
import { type Path, pathsEqual } from './tree'

/** All textblock nodes in document order, with their paths. */
export function textblocks(doc: EditorNode): readonly { path: Path; node: EditorNode }[] {
  const found: { path: Path; node: EditorNode }[] = []
  const walk = (node: EditorNode, path: Path): void => {
    if (node.isTextblock) {
      found.push({ path, node })
      return
    }
    node.content.children.forEach((child, index) => {
      walk(child, [...path, index])
    })
  }
  walk(doc, [])
  return found
}

export function firstTextblockPath(doc: EditorNode): Path | null {
  return textblocks(doc)[0]?.path ?? null
}

export interface BlockRange {
  readonly path: Path
  readonly node: EditorNode
  /** Inline range within this block covered by the selection. */
  readonly from: number
  readonly to: number
}

/** Textblocks intersecting the position range [from, to], with per-block inline ranges. */
export function blocksInRange(
  doc: EditorNode,
  from: Position,
  to: Position,
): readonly BlockRange[] {
  const ranges: BlockRange[] = []
  for (const { path, node } of textblocks(doc)) {
    const length = inlineLength(node.content)
    if (comparePositions(pos(path, length), from) < 0) continue
    if (comparePositions(pos(path, 0), to) > 0) break
    ranges.push({
      path,
      node,
      from: pathsEqual(path, from.path) ? from.offset : 0,
      to: pathsEqual(path, to.path) ? to.offset : length,
    })
  }
  return ranges
}
