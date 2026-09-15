import type { Attrs } from '../../model/attrs'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, updateAtPath } from '../../model/tree'
import { Step, type StepResult, stepFail, stepOk } from '../step'

/** Replace the attributes of the node at `path`. */
export class SetNodeAttrsStep extends Step {
  constructor(
    readonly path: Path,
    readonly attrs: Attrs,
  ) {
    super()
  }

  override apply(doc: EditorNode): StepResult {
    const node = nodeAtPath(doc, this.path)
    if (!node) return stepFail('SetNodeAttrsStep: no node at path')
    if (node.isText) return stepFail('SetNodeAttrsStep: text nodes have no attributes')
    return stepOk(updateAtPath(doc, this.path, (target) => target.withAttrs(this.attrs)))
  }

  override invert(docBefore: EditorNode): Step {
    const node = nodeAtPath(docBefore, this.path)
    if (!node) throw new RangeError('SetNodeAttrsStep.invert: no node at path')
    return new SetNodeAttrsStep(this.path, node.attrs)
  }

  override mapPosition(position: Position): Position {
    return position
  }

  override toJSON(): Record<string, unknown> {
    return { stepType: 'setNodeAttrs', path: [...this.path], attrs: { ...this.attrs } }
  }
}
