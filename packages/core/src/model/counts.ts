import { textblocks } from './blocks'
import { inlineLength } from './inline'
import type { EditorNode, TextNode } from './node'

/** Character count: inline length summed over all textblocks (atoms count 1). */
export function characterCount(doc: EditorNode): number {
  return textblocks(doc).reduce((sum, { node }) => sum + inlineLength(node.content), 0)
}

/** Word count over the document's visible text. Inline atoms separate words. */
export function wordCount(doc: EditorNode): number {
  let count = 0
  for (const { node } of textblocks(doc)) {
    count += blockText(node)
      .split(/\s+/)
      .filter((word) => word.length > 0).length
  }
  return count
}

/**
 * Sentence count: runs of text closed by `.`, `!`, `?` or `…`, with a block's
 * end closing its last sentence. A heuristic, "e.g." counts as a boundary,
 * but the one every word processor's statistics dialog uses.
 */
export function sentenceCount(doc: EditorNode): number {
  let count = 0
  for (const { node } of textblocks(doc)) {
    const text = blockText(node).trim()
    if (text.length === 0) continue
    count += Math.max(
      1,
      text.split(/[.!?…]+(?:\s+|$)/).filter((part) => part.trim().length > 0).length,
    )
  }
  return count
}

/** Paragraph count: textblocks holding at least one visible character. */
export function paragraphCount(doc: EditorNode): number {
  let count = 0
  for (const { node } of textblocks(doc)) {
    if (blockText(node).trim().length > 0) count++
  }
  return count
}

/** A block's text with each inline atom standing in as a word separator. */
function blockText(node: EditorNode): string {
  let text = ''
  for (const child of node.content.children) {
    text += child.isText ? (child as TextNode).text : ' '
  }
  return text
}
