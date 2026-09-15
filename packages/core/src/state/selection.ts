import { firstTextblockPath, textblocks } from '../model/blocks'
import { inlineLength } from '../model/inline'
import type { EditorNode } from '../model/node'
import {
  type Position,
  clampPosition,
  comparePositions,
  maxPosition,
  minPosition,
  pos,
  positionsEqual,
} from '../model/position'
import { type Path, nodeAtPath, pathsEqual } from '../model/tree'
import type { PositionMapper } from './step'

/** JSON shape of a serialized selection. */
export interface SelectionJSON {
  readonly type: string
  readonly [key: string]: unknown
}

export abstract class Selection {
  abstract get from(): Position
  abstract get to(): Position

  get empty(): boolean {
    return positionsEqual(this.from, this.to)
  }

  abstract map(doc: EditorNode, mapper: PositionMapper): Selection
  abstract eq(other: Selection): boolean
  abstract toJSON(): SelectionJSON
}

/** A cursor or text range between two inline positions. */
export class TextSelection extends Selection {
  constructor(
    readonly anchor: Position,
    readonly head: Position = anchor,
  ) {
    super()
  }

  override get from(): Position {
    return minPosition(this.anchor, this.head)
  }

  override get to(): Position {
    return maxPosition(this.anchor, this.head)
  }

  get isCursor(): boolean {
    return positionsEqual(this.anchor, this.head)
  }

  override map(doc: EditorNode, mapper: PositionMapper): Selection {
    const anchor = clampPosition(doc, mapper.mapPosition(this.anchor, -1))
    const head = clampPosition(doc, mapper.mapPosition(this.head, -1))
    return new TextSelection(anchor, head)
  }

  override eq(other: Selection): boolean {
    return (
      other instanceof TextSelection &&
      positionsEqual(other.anchor, this.anchor) &&
      positionsEqual(other.head, this.head)
    )
  }

  override toJSON(): SelectionJSON {
    return {
      type: 'text',
      anchor: { path: [...this.anchor.path], offset: this.anchor.offset },
      head: { path: [...this.head.path], offset: this.head.offset },
    }
  }

  /** Cursor at the start of the document's first textblock. */
  static atStart(doc: EditorNode): TextSelection {
    const path = firstTextblockPath(doc)
    return new TextSelection(pos(path ?? [], 0))
  }

  /** Cursor at the end of the document's last textblock. */
  static atEnd(doc: EditorNode): TextSelection {
    const blocks = textblocks(doc)
    const last = blocks[blocks.length - 1]
    if (!last) return new TextSelection(pos([], 0))
    return new TextSelection(pos(last.path, inlineLength(last.node.content)))
  }
}

/** A single non-text node selected as a whole (image, hr, …). */
export class NodeSelection extends Selection {
  constructor(readonly path: Path) {
    super()
    if (path.length === 0) throw new RangeError('Cannot node-select the root')
  }

  get parentPath(): Path {
    return this.path.slice(0, -1)
  }

  get index(): number {
    return this.path[this.path.length - 1] as number
  }

  override get from(): Position {
    return pos(this.parentPath, this.index)
  }

  override get to(): Position {
    return pos(this.parentPath, this.index + 1)
  }

  override map(doc: EditorNode, mapper: PositionMapper): Selection {
    const mapped = clampPosition(doc, mapper.mapPosition(this.from, -1))
    const node = nodeAtPath(doc, [...mapped.path, mapped.offset])
    if (node && !node.isText) return new NodeSelection([...mapped.path, mapped.offset])
    return new TextSelection(mapped).map(doc, identityMapper)
  }

  override eq(other: Selection): boolean {
    return other instanceof NodeSelection && pathsEqual(other.path, this.path)
  }

  override toJSON(): SelectionJSON {
    return { type: 'node', path: [...this.path] }
  }
}

/** The whole document selected. */
export class AllSelection extends Selection {
  constructor(private readonly doc: EditorNode) {
    super()
  }

  override get from(): Position {
    return pos([], 0)
  }

  override get to(): Position {
    return pos([], this.doc.childCount)
  }

  override map(doc: EditorNode): Selection {
    return new AllSelection(doc)
  }

  override eq(other: Selection): boolean {
    return other instanceof AllSelection
  }

  override toJSON(): SelectionJSON {
    return { type: 'all' }
  }
}

const identityMapper: PositionMapper = {
  mapPosition: (position) => position,
}

/**
 * The nearest valid text selection at or after a (possibly stale) position,
 * used to repair selections after arbitrary document changes.
 */
export function selectionNear(doc: EditorNode, position: Position): TextSelection {
  const clamped = clampPosition(doc, position)
  const node = nodeAtPath(doc, clamped.path)
  if (node?.isTextblock) return new TextSelection(clamped)
  for (const { path, node: block } of textblocks(doc)) {
    if (comparePositions(pos(path, inlineLength(block.content)), clamped) >= 0) {
      return new TextSelection(pos(path, 0))
    }
  }
  return TextSelection.atEnd(doc)
}
