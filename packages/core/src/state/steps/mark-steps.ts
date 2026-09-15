import { applyInlineMark, inlineLength } from '../../model/inline'
import type { Mark } from '../../model/mark'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, updateAtPath } from '../../model/tree'
import { Step, type StepResult, stepFail, stepOk } from '../step'

abstract class MarkStep extends Step {
  constructor(
    readonly blockPath: Path,
    readonly from: number,
    readonly to: number,
    readonly mark: Mark,
  ) {
    super()
    if (from > to || from < 0) throw new RangeError(`Invalid mark range [${from}, ${to})`)
  }

  protected applyMark(doc: EditorNode, add: boolean, name: string): StepResult {
    const block = nodeAtPath(doc, this.blockPath)
    if (!block) return stepFail(`${name}: no node at path`)
    if (!block.isTextblock) return stepFail(`${name}: target is not a textblock`)
    if (this.to > inlineLength(block.content)) return stepFail(`${name}: range out of bounds`)
    if (!block.type.allowsMarkType(this.mark.type)) {
      return stepFail(`${name}: mark "${this.mark.type.name}" not allowed here`)
    }
    return stepOk(
      updateAtPath(doc, this.blockPath, (node) =>
        node.withContent(applyInlineMark(node.content, this.from, this.to, this.mark, add)),
      ),
    )
  }

  /** Mark steps never move content. */
  override mapPosition(position: Position): Position {
    return position
  }
}

/** Add a mark across an inline range. */
export class AddMarkStep extends MarkStep {
  override apply(doc: EditorNode): StepResult {
    return this.applyMark(doc, true, 'AddMarkStep')
  }

  override invert(): Step {
    return new RemoveMarkStep(this.blockPath, this.from, this.to, this.mark)
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'addMark',
      blockPath: [...this.blockPath],
      from: this.from,
      to: this.to,
      mark: this.mark.toJSON(),
    }
  }
}

/**
 * Remove a mark across an inline range. For exact invertibility, emit these
 * only over ranges where the mark is actually present (see `rangesWithMark`).
 */
export class RemoveMarkStep extends MarkStep {
  override apply(doc: EditorNode): StepResult {
    return this.applyMark(doc, false, 'RemoveMarkStep')
  }

  override invert(): Step {
    return new AddMarkStep(this.blockPath, this.from, this.to, this.mark)
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'removeMark',
      blockPath: [...this.blockPath],
      from: this.from,
      to: this.to,
      mark: this.mark.toJSON(),
    }
  }
}
