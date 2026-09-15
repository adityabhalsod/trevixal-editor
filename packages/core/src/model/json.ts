import type { Attrs } from './attrs'
import { Fragment } from './fragment'
import type { Mark, MarkJSON } from './mark'
import type { EditorNode, NodeJSON } from './node'
import type { Schema } from './schema'

/** Canonical JSON document shape accepted by {@link nodeFromJSON}. */
export type DocJSON = NodeJSON

export function markFromJSON(schema: Schema, json: MarkJSON): Mark {
  return schema.markType(json.type).create(json.attrs as Attrs | undefined)
}

export function nodeFromJSON(schema: Schema, json: NodeJSON): EditorNode {
  const marks = (json.marks ?? []).map((mark) => markFromJSON(schema, mark))
  if (json.type === 'text') {
    if (typeof json.text !== 'string') {
      throw new RangeError('Text node JSON is missing its "text" property')
    }
    return schema.text(json.text, marks)
  }
  const content = Fragment.from((json.content ?? []).map((child) => nodeFromJSON(schema, child)))
  return schema.nodeType(json.type).create(json.attrs as Attrs | undefined, content, marks)
}
