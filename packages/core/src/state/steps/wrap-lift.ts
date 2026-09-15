import type { Attrs } from '../../model/attrs'
import { Fragment } from '../../model/fragment'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, pathStartsWith, updateAtPath } from '../../model/tree'
import { Step, type StepResult, stepFail, stepOk } from '../step'

/**
 * Wrap the children [from, to) of the node at `parentPath` in a new node of
 * type `wrapperType`, placed at index `from`.
 */
export class WrapNodesStep extends Step {
  constructor(
    readonly parentPath: Path,
    readonly from: number,
    readonly to: number,
    readonly wrapperType: string,
    readonly wrapperAttrs?: Attrs,
  ) {
    super()
    if (from >= to || from < 0) throw new RangeError(`Invalid wrap range [${from}, ${to})`)
  }

  override apply(doc: EditorNode): StepResult {
    const parent = nodeAtPath(doc, this.parentPath)
    if (!parent) return stepFail('WrapNodesStep: no node at path')
    if (parent.isTextblock || parent.isText)
      return stepFail('WrapNodesStep: cannot wrap inline content')
    if (this.to > parent.childCount) return stepFail('WrapNodesStep: range out of bounds')
    const schema = parent.type.schema
    const wrapper = schema
      .nodeType(this.wrapperType)
      .create(this.wrapperAttrs, parent.content.slice(this.from, this.to))
    return stepOk(
      updateAtPath(doc, this.parentPath, (node) =>
        node.withContent(node.content.replaceRange(this.from, this.to, Fragment.of(wrapper))),
      ),
    )
  }

  override invert(): Step {
    return new LiftNodesStep([...this.parentPath, this.from], this.to - this.from)
  }

  override mapPosition(position: Position): Position {
    if (!pathStartsWith(position.path, this.parentPath)) return position
    const removed = this.to - this.from
    if (position.path.length === this.parentPath.length) {
      const index = position.offset
      if (index <= this.from) return position
      if (index >= this.to) return { path: position.path, offset: index - removed + 1 }
      // Between wrapped children: land inside the wrapper.
      return { path: [...this.parentPath, this.from], offset: index - this.from }
    }
    const childIndex = position.path[this.parentPath.length] as number
    const rest = position.path.slice(this.parentPath.length + 1)
    if (childIndex < this.from) return position
    if (childIndex >= this.to) {
      const path = [...position.path]
      path[this.parentPath.length] = childIndex - removed + 1
      return { path, offset: position.offset }
    }
    return {
      path: [...this.parentPath, this.from, childIndex - this.from, ...rest],
      offset: position.offset,
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'wrapNodes',
      parentPath: [...this.parentPath],
      from: this.from,
      to: this.to,
      wrapperType: this.wrapperType,
      ...(this.wrapperAttrs ? { wrapperAttrs: { ...this.wrapperAttrs } } : {}),
    }
  }
}

/**
 * Replace the node at `path` with its own children (remove one wrapper
 * level). `liftedCount` must equal the node's child count. It makes position
 * mapping document-independent.
 */
export class LiftNodesStep extends Step {
  constructor(
    readonly path: Path,
    readonly liftedCount: number,
  ) {
    super()
    if (path.length === 0) throw new RangeError('Cannot lift the root node')
  }

  override apply(doc: EditorNode): StepResult {
    const node = nodeAtPath(doc, this.path)
    if (!node) return stepFail('LiftNodesStep: no node at path')
    if (node.isTextblock || node.isText)
      return stepFail('LiftNodesStep: cannot lift inline content')
    if (node.childCount !== this.liftedCount) {
      return stepFail('LiftNodesStep: liftedCount does not match the node')
    }
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    return stepOk(
      updateAtPath(doc, parentPath, (parent) =>
        parent.withContent(parent.content.replaceRange(index, index + 1, node.content)),
      ),
    )
  }

  override invert(docBefore: EditorNode): Step {
    const node = nodeAtPath(docBefore, this.path)
    if (!node) throw new RangeError('LiftNodesStep.invert: no node at path')
    const index = this.path[this.path.length - 1] as number
    return new WrapNodesStep(
      this.path.slice(0, -1),
      index,
      index + node.childCount,
      node.type.name,
      node.attrs,
    )
  }

  override mapPosition(position: Position): Position {
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    if (pathStartsWith(position.path, this.path)) {
      if (position.path.length === this.path.length) {
        // A child index inside the lifted wrapper maps to the parent level.
        return { path: parentPath, offset: index + position.offset }
      }
      const childIndex = position.path[this.path.length] as number
      const rest = position.path.slice(this.path.length + 1)
      return { path: [...parentPath, index + childIndex, ...rest], offset: position.offset }
    }
    if (!pathStartsWith(position.path, parentPath)) return position
    const delta = this.liftedCount - 1
    if (position.path.length === parentPath.length) {
      return position.offset > index
        ? { path: position.path, offset: position.offset + delta }
        : position
    }
    const childIndex = position.path[parentPath.length] as number
    if (childIndex > index) {
      const path = [...position.path]
      path[parentPath.length] = childIndex + delta
      return { path, offset: position.offset }
    }
    return position
  }

  override toJSON(): Record<string, unknown> {
    return { stepType: 'liftNodes', path: [...this.path], liftedCount: this.liftedCount }
  }
}
