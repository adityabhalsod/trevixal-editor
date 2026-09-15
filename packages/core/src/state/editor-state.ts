import { Fragment } from '../model/fragment'
import { type DocJSON, nodeFromJSON } from '../model/json'
import type { Mark } from '../model/mark'
import type { EditorNode } from '../model/node'
import { normalizeDoc } from '../model/normalize'
import { clampPosition } from '../model/position'
import type { Schema } from '../model/schema'
import { nodeAtPath } from '../model/tree'
import {
  AllSelection,
  NodeSelection,
  type Selection,
  TextSelection,
  selectionNear,
} from './selection'
import { Transaction } from './transaction'

export interface EditorStateConfig {
  readonly schema: Schema
  /** Initial document. Takes precedence over `content`. */
  readonly doc?: EditorNode
  /** Initial document as canonical JSON. */
  readonly content?: DocJSON
  readonly selection?: Selection
}

/**
 * Immutable editor state: the document, selection and stored marks. The DOM
 * is never the source of truth, this is.
 */
export class EditorState {
  private constructor(
    readonly schema: Schema,
    readonly doc: EditorNode,
    readonly selection: Selection,
    readonly storedMarks: readonly Mark[] | null,
  ) {}

  static create(config: EditorStateConfig): EditorState {
    const { schema } = config
    const initial =
      config.doc ??
      (config.content
        ? nodeFromJSON(schema, config.content)
        : schema.topType.create(undefined, Fragment.of(schema.firstTextblockType().create())))
    const doc = normalizeDoc(initial)
    const selection = config.selection
      ? validateSelection(doc, config.selection)
      : TextSelection.atStart(doc)
    return new EditorState(schema, doc, selection, null)
  }

  /** Start building a transaction from this state. */
  get tr(): Transaction {
    return new Transaction(this)
  }

  apply(tr: Transaction): EditorState {
    return new EditorState(
      this.schema,
      tr.doc,
      validateSelection(tr.doc, tr.selection),
      tr.storedMarks,
    )
  }

  toJSON(): { doc: DocJSON; selection: unknown } {
    return { doc: this.doc.toJSON(), selection: this.selection.toJSON() }
  }
}

/** Repair a selection so it is valid for the given document. */
export function validateSelection(doc: EditorNode, selection: Selection): Selection {
  if (selection instanceof AllSelection) return new AllSelection(doc)
  if (selection instanceof NodeSelection) {
    const node = nodeAtPath(doc, selection.path)
    return node && !node.isText ? selection : selectionNear(doc, selection.from)
  }
  if (selection instanceof TextSelection) {
    const anchor = clampPosition(doc, selection.anchor)
    const head = clampPosition(doc, selection.head)
    const anchorNode = nodeAtPath(doc, anchor.path)
    const headNode = nodeAtPath(doc, head.path)
    if (anchorNode?.isTextblock && headNode?.isTextblock) {
      return new TextSelection(anchor, head)
    }
    return selectionNear(doc, anchor)
  }
  return selectionNear(doc, selection.from)
}
