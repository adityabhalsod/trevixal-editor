import type { Attrs } from '../../model/attrs'
import { Fragment } from '../../model/fragment'
import { inlineLength, mergeInline, sliceInline } from '../../model/inline'
import type { EditorNode } from '../../model/node'
import type { Position } from '../../model/position'
import { type Path, nodeAtPath, pathStartsWith, pathsEqual, updateAtPath } from '../../model/tree'
import { type Bias, Step, type StepResult, stepFail, stepOk } from '../step'

function siblingShift(
  position: Position,
  parentPath: Path,
  fromIndex: number,
  delta: number,
): Position | null {
  if (!pathStartsWith(position.path, parentPath)) return null
  if (position.path.length === parentPath.length) {
    return position.offset > fromIndex
      ? { path: position.path, offset: position.offset + delta }
      : position
  }
  const index = position.path[parentPath.length] as number
  if (index <= fromIndex) return position
  const path = [...position.path]
  path[parentPath.length] = index + delta
  return { path, offset: position.offset }
}

/**
 * A block's attributes for a copy of it: everything but its `id`, which names
 * one block and would otherwise be carried by two, leaving every link to it
 * pointing at whichever the browser finds first.
 */
export function withoutId(attrs: Attrs): Attrs {
  return attrs.id === undefined || attrs.id === null ? attrs : { ...attrs, id: null }
}

/**
 * Split the textblock at `path` at inline offset `offset`. The second half
 * becomes the next sibling, of type `afterType` (defaults to the same type
 * and attributes, bar its `id`).
 */
export class SplitNodeStep extends Step {
  constructor(
    readonly path: Path,
    readonly offset: number,
    readonly afterType?: string,
    readonly afterAttrs?: Attrs,
  ) {
    super()
    if (path.length === 0) throw new RangeError('Cannot split the root node')
  }

  override apply(doc: EditorNode): StepResult {
    const node = nodeAtPath(doc, this.path)
    if (!node) return stepFail('SplitNodeStep: no node at path')
    if (!node.isTextblock) return stepFail('SplitNodeStep: only textblocks can be split')
    const length = inlineLength(node.content)
    if (this.offset > length) return stepFail('SplitNodeStep: offset out of bounds')
    const before = sliceInline(node.content, 0, this.offset)
    const after = sliceInline(node.content, this.offset, length)
    const schema = node.type.schema
    const secondType = this.afterType ? schema.nodeType(this.afterType) : node.type
    const secondAttrs = this.afterType
      ? this.afterAttrs
      : (this.afterAttrs ?? withoutId(node.attrs))
    const second = secondType.create(secondAttrs, after)
    const first = node.withContent(before)
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    return stepOk(
      updateAtPath(doc, parentPath, (parent) =>
        parent.withContent(
          parent.content.replaceRange(index, index + 1, Fragment.of(first, second)),
        ),
      ),
    )
  }

  override invert(): Step {
    return new JoinNodesStep(this.path, this.offset)
  }

  override mapPosition(position: Position, bias: Bias = 1): Position {
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    if (pathsEqual(position.path, this.path)) {
      if (position.offset < this.offset) return position
      if (position.offset === this.offset && bias < 0) return position
      return {
        path: [...parentPath, index + 1],
        offset: position.offset - this.offset,
      }
    }
    return siblingShift(position, parentPath, index, 1) ?? position
  }

  override toJSON(): Record<string, unknown> {
    return {
      stepType: 'splitNode',
      path: [...this.path],
      offset: this.offset,
      ...(this.afterType ? { afterType: this.afterType } : {}),
      ...(this.afterAttrs ? { afterAttrs: { ...this.afterAttrs } } : {}),
    }
  }
}

/**
 * Join the textblock at `path` with its next sibling, absorbing the sibling's
 * inline content. `joinOffset` must equal the first block's inline length.
 * It makes position mapping document-independent.
 */
export class JoinNodesStep extends Step {
  constructor(
    readonly path: Path,
    readonly joinOffset: number,
  ) {
    super()
    if (path.length === 0) throw new RangeError('Cannot join the root node')
  }

  override apply(doc: EditorNode): StepResult {
    const node = nodeAtPath(doc, this.path)
    if (!node) return stepFail('JoinNodesStep: no node at path')
    if (!node.isTextblock) return stepFail('JoinNodesStep: only textblocks can be joined')
    if (inlineLength(node.content) !== this.joinOffset) {
      return stepFail('JoinNodesStep: joinOffset does not match the block length')
    }
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    const parent = nodeAtPath(doc, parentPath)
    const next = parent?.content.maybeChild(index + 1)
    if (!next) return stepFail('JoinNodesStep: no next sibling to join with')
    if (!next.isTextblock) return stepFail('JoinNodesStep: next sibling is not a textblock')
    const joined = node.withContent(mergeInline(node.content.append(next.content)))
    return stepOk(
      updateAtPath(doc, parentPath, (target) =>
        target.withContent(target.content.replaceRange(index, index + 2, Fragment.of(joined))),
      ),
    )
  }

  override invert(docBefore: EditorNode): Step {
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    const parent = nodeAtPath(docBefore, parentPath)
    const next = parent?.content.maybeChild(index + 1)
    if (!next) throw new RangeError('JoinNodesStep.invert: no next sibling')
    return new SplitNodeStep(this.path, this.joinOffset, next.type.name, next.attrs)
  }

  override mapPosition(position: Position): Position {
    const parentPath = this.path.slice(0, -1)
    const index = this.path[this.path.length - 1] as number
    const nextPath = [...parentPath, index + 1]
    if (pathsEqual(position.path, nextPath)) {
      return { path: this.path, offset: position.offset + this.joinOffset }
    }
    if (!pathStartsWith(position.path, parentPath)) return position
    if (position.path.length === parentPath.length) {
      // A child index at or past the removed sibling shifts left by one.
      return position.offset >= index + 2
        ? { path: position.path, offset: position.offset - 1 }
        : position
    }
    const childIndex = position.path[parentPath.length] as number
    if (childIndex >= index + 2) {
      const path = [...position.path]
      path[parentPath.length] = childIndex - 1
      return { path, offset: position.offset }
    }
    return position
  }

  override toJSON(): Record<string, unknown> {
    return { stepType: 'joinNodes', path: [...this.path], joinOffset: this.joinOffset }
  }
}
