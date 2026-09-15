import type { Fragment } from '../../model/fragment'
import { inlineLength, replaceInline, sliceInline } from '../../model/inline'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, pathsEqual, updateAtPath } from '../../model/tree'
import { type Bias, Step, type StepResult, stepFail, stepOk } from '../step'

/**
 * Replace the inline range [from, to) inside the textblock at `blockPath`
 * with an inline fragment. Covers text insertion (from === to), deletion
 * (empty fragment) and replacement.
 */
export class ReplaceInlineStep extends Step {
  constructor(
    readonly blockPath: Path,
    readonly from: number,
    readonly to: number,
    readonly insert: Fragment,
  ) {
    super()
    if (from > to || from < 0) throw new RangeError(`Invalid inline range [${from}, ${to})`)
  }

  get insertLength(): number {
    return inlineLength(this.insert)
  }

  override apply(doc: EditorNode): StepResult {
    const block = nodeAtPath(doc, this.blockPath)
    if (!block) return stepFail('ReplaceInlineStep: no node at path')
    if (!block.isTextblock) return stepFail('ReplaceInlineStep: target is not a textblock')
    if (this.to > inlineLength(block.content))
      return stepFail('ReplaceInlineStep: range out of bounds')
    if (this.insert.children.some((child) => !child.isInline)) {
      return stepFail('ReplaceInlineStep: fragment contains non-inline nodes')
    }
    return stepOk(
      updateAtPath(doc, this.blockPath, (node) =>
        node.withContent(replaceInline(node.content, this.from, this.to, this.insert)),
      ),
    )
  }

  override invert(docBefore: EditorNode): Step {
    const block = nodeAtPath(docBefore, this.blockPath)
    if (!block) throw new RangeError('ReplaceInlineStep.invert: no node at path')
    const removed = sliceInline(block.content, this.from, this.to)
    return new ReplaceInlineStep(this.blockPath, this.from, this.from + this.insertLength, removed)
  }

  override mapPosition(position: Position, bias: Bias = 1): Position {
    if (!pathsEqual(position.path, this.blockPath)) return position
    const { offset } = position
    if (offset < this.from) return position
    const delta = this.insertLength - (this.to - this.from)
    if (offset > this.to) return { path: position.path, offset: offset + delta }
    // Inside (or at the edge of) the replaced range.
    const mapped = bias < 0 ? this.from : this.from + this.insertLength
    return { path: position.path, offset: mapped }
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'replaceInline',
      blockPath: [...this.blockPath],
      from: this.from,
      to: this.to,
      insert: this.insert.toJSON(),
    }
  }
}
