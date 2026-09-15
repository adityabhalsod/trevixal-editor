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

  let children = node.content.children.map((child) =>
    stripDisallowedMarks(normalizeNode(child), node),
  )

  if (node.isTextblock) {
    // Inline context: flatten any stray block children into their inline content.
    children = children.flatMap((child) =>
      child.isInline ? [child] : child.content.children.filter((inner) => inner.isInline),
    )
    return node.withContent(mergeInline(Fragment.from(children)))
  }

  // Block context: wrap runs of stray inline children in the default textblock.
  const schema = node.type.schema
  const wrapped: EditorNode[] = []
  let inlineRun: EditorNode[] = []
  const flushRun = (): void => {
    if (inlineRun.length > 0) {
      wrapped.push(
        schema.firstTextblockType().create(undefined, mergeInline(Fragment.from(inlineRun))),
      )
      inlineRun = []
    }
  }
  for (const child of children) {
    if (child.isInline) {
      inlineRun.push(child)
    } else {
      flushRun()
      wrapped.push(child)
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
