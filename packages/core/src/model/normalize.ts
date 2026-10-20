import { Fragment } from './fragment'
import { mergeInline } from './inline'
import type { EditorNode } from './node'

/**
 * Deterministically repair a document so it conforms to its schema where
 * possible: drops children from leaf nodes, wraps stray inline content in the
 * schema's default textblock, strips disallowed marks, merges adjacent text
 * nodes, and guarantees a non-empty top node.
 */
export function normalizeDoc(doc: EditorNode): EditorNode {
  const schema = doc.type.schema
  let normalized = normalizeNode(doc)
  if (normalized.childCount === 0 && !normalized.type.allowsEmptyContent) {
    normalized = normalized.withContent(Fragment.of(schema.firstTextblockType().create()))
  }
  return normalized
}

function normalizeNode(node: EditorNode): EditorNode {
  if (node.isText) return node
  if (!node.type.spec.content) {
    // Leaf node: content is never allowed.
    return node.childCount === 0 ? node : node.withContent(Fragment.empty)
  }

  const children = node.content.children.map(normalizeNode)

  if (node.isTextblock) {
    // Inline context: flatten any stray block children into their inline content.
    const inline = children
      .map((child) => stripDisallowedMarks(child, node))
      .flatMap((child) =>
        child.isInline ? [child] : child.content.children.filter((inner) => inner.isInline),
      )
    return node.withContent(mergeInline(Fragment.from(inline)))
  }

  // Block context: wrap runs of stray inline children in the default textblock.
  // Their marks are checked against that textblock, not against this block,
  // which allows none: text pasted loose from a `<div>` lost its bold there.
  const schema = node.type.schema
  const wrapped: EditorNode[] = []
  let inlineRun: EditorNode[] = []
  const flushRun = (): void => {
    if (inlineRun.length > 0) {
      const textblock = schema.firstTextblockType().create()
      const inline = inlineRun.map((child) => stripDisallowedMarks(child, textblock))
      wrapped.push(textblock.withContent(mergeInline(Fragment.from(inline))))
      inlineRun = []
    }
  }
  for (const child of children) {
    if (child.isInline) {
      inlineRun.push(child)
    } else {
      flushRun()
      wrapped.push(stripDisallowedMarks(child, node))
    }
  }
  flushRun()
  return node.withContent(Fragment.from(wrapped))
}

function stripDisallowedMarks(child: EditorNode, parent: EditorNode): EditorNode {
  if (child.marks.length === 0) return child
  const allowed = child.marks.filter((mark) => parent.type.allowsMarkType(mark.type))
  return allowed.length === child.marks.length ? child : child.withMarks(allowed)
}
