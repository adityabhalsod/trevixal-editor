import { Fragment } from '../../model/fragment'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, pathStartsWith, updateAtPath } from '../../model/tree'
import { Step, type StepResult, stepFail, stepOk } from '../step'

/**
 * Move one child of an element node to another index among its siblings.
 *
 * Composing a move out of a remove and an insert produces the same document,
 * but not the same *positions*: every position inside the moved node is
 * mapped through a replacement that no longer contains it, and collapses to
 * the parent. That is why a caret has to be restored by hand after a
 * rebuild-the-whole-table move. Here the subtree keeps its identity, so a
 * selection, a decoration or a pending upload placeholder inside the moved
 * node travels with it and needs no repair.
 *
 * It is also one undo step rather than two, and inverts to a plain move back.
 *
 * `to` is the index the node ends up at, the way `Array.prototype.splice`
 * counts: removed first, then inserted. Moving child 0 to index 2 of
 * `[a, b, c]` gives `[b, c, a]`.
 */
export class MoveNodeStep extends Step {
  constructor(
    readonly parentPath: Path,
    readonly from: number,
    readonly to: number,
  ) {
    super()
    if (from < 0 || to < 0) throw new RangeError(`Invalid move ${from} → ${to}`)
  }

  override apply(doc: EditorNode): StepResult {
    const parent = nodeAtPath(doc, this.parentPath)
    if (!parent) return stepFail('MoveNodeStep: no node at path')
    if (parent.isTextblock || parent.isText) {
      return stepFail('MoveNodeStep: children are inline; use ReplaceInlineStep')
    }
    if (this.from >= parent.childCount || this.to >= parent.childCount) {
      return stepFail('MoveNodeStep: index out of bounds')
    }
    if (this.from === this.to) return stepOk(doc)
    return stepOk(
      updateAtPath(doc, this.parentPath, (node) => {
        const children = [...node.content.children]
        const [moved] = children.splice(this.from, 1)
        if (!moved) return node
        children.splice(this.to, 0, moved)
        return node.withContent(Fragment.from(children))
      }),
    )
  }

  /**
   * Moving back is just the move with its ends swapped, under splice
   * semantics that restores the original order for every element, not only
   * the one that moved.
   */
  override invert(): Step {
    return new MoveNodeStep(this.parentPath, this.to, this.from)
  }

  override mapPosition(position: Position): Position {
    if (this.from === this.to) return position
    if (!pathStartsWith(position.path, this.parentPath)) return position

    // A position at the parent's own level addresses a gap between children.
    if (position.path.length === this.parentPath.length) {
      return { path: position.path, offset: this.mapGap(position.offset) }
    }

    const index = position.path[this.parentPath.length] as number
    const mapped = this.mapIndex(index)
    if (mapped === index) return position
    const path = [...position.path]
    path[this.parentPath.length] = mapped
    return { path, offset: position.offset }
  }

  /** Where the child that was at `index` ends up. */
  private mapIndex(index: number): number {
    if (index === this.from) return this.to
    if (this.from < this.to) return index > this.from && index <= this.to ? index - 1 : index
    return index >= this.to && index < this.from ? index + 1 : index
  }

  /**
   * Where a gap between children ends up.
   *
   * A gap is not a child, so it cannot travel with the moved node; it stays
   * where it is in the sequence and shifts only because its neighbours did.
   * Gaps outside the span the move touched are untouched.
   */
  private mapGap(offset: number): number {
    if (this.from < this.to) return offset > this.from && offset <= this.to ? offset - 1 : offset
    return offset >= this.to && offset <= this.from ? offset + 1 : offset
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'moveNode',
      parentPath: [...this.parentPath],
      from: this.from,
      to: this.to,
    }
  }
}

/** Move the node at `path` to `to` among its siblings. */
export function moveNodeTo(path: Path, to: number): MoveNodeStep {
  if (path.length === 0) throw new RangeError('Cannot move the root node')
  const index = path[path.length - 1] as number
  return new MoveNodeStep(path.slice(0, -1), index, to)
}
