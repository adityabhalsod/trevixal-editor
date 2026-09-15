import type { Fragment } from '../../model/fragment'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, pathStartsWith, updateAtPath } from '../../model/tree'
import { type Bias, Step, type StepResult, stepFail, stepOk } from '../step'

/**
 * Replace the children [from, to) of the element node at `parentPath` with a
 * fragment. Covers node insertion (from === to) and removal (empty fragment).
 */
export class ReplaceNodesStep extends Step {
  constructor(
    readonly parentPath: Path,
    readonly from: number,
    readonly to: number,
    readonly insert: Fragment,
  ) {
    super()
    if (from > to || from < 0) throw new RangeError(`Invalid child range [${from}, ${to})`)
  }

  override apply(doc: EditorNode): StepResult {
    const parent = nodeAtPath(doc, this.parentPath)
    if (!parent) return stepFail('ReplaceNodesStep: no node at path')
    if (parent.isTextblock || parent.isText) {
      return stepFail('ReplaceNodesStep: target children are inline; use ReplaceInlineStep')
    }
    if (this.to > parent.childCount) return stepFail('ReplaceNodesStep: range out of bounds')
    return stepOk(
      updateAtPath(doc, this.parentPath, (node) =>
        node.withContent(node.content.replaceRange(this.from, this.to, this.insert)),
      ),
    )
  }

  override invert(docBefore: EditorNode): Step {
    const parent = nodeAtPath(docBefore, this.parentPath)
    if (!parent) throw new RangeError('ReplaceNodesStep.invert: no node at path')
    const removed = parent.content.slice(this.from, this.to)
    return new ReplaceNodesStep(
      this.parentPath,
      this.from,
      this.from + this.insert.childCount,
      removed,
    )
  }

  override mapPosition(position: Position, bias: Bias = 1): Position {
    if (!pathStartsWith(position.path, this.parentPath)) return position
    const delta = this.insert.childCount - (this.to - this.from)
    if (position.path.length === this.parentPath.length) {
      // The offset is a child index in the parent itself.
      const index = position.offset
      if (index < this.from) return position
      if (index >= this.to) return { path: position.path, offset: index + delta }
      return {
        path: position.path,
        offset: bias < 0 ? this.from : this.from + this.insert.childCount,
      }
    }
    const childIndex = position.path[this.parentPath.length] as number
    if (childIndex < this.from) return position
    if (childIndex >= this.to) {
      const path = [...position.path]
      path[this.parentPath.length] = childIndex + delta
      return { path, offset: position.offset }
    }
    // The position lived inside a replaced node, degrade to a parent index.
    return {
      path: this.parentPath,
      offset: bias < 0 ? this.from : this.from + this.insert.childCount,
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'replaceNodes',
      parentPath: [...this.parentPath],
      from: this.from,
      to: this.to,
      insert: this.insert.toJSON(),
    }
  }
}

/** Convenience: replace the single node at `path` with a fragment. */
export function replaceNodeAt(path: Path, insert: Fragment): ReplaceNodesStep {
  if (path.length === 0) throw new RangeError('Cannot replace the root node')
  const index = path[path.length - 1] as number
  return new ReplaceNodesStep(path.slice(0, -1), index, index + 1, insert)
}
