import type { EditorNode } from './node'

/**
 * The words a node stands for in a format that cannot draw it: its own text,
 * or for an atom, what its spec says it reads as (an equation's LaTeX, a
 * video's title and address, a badge's label). Empty when there is nothing.
 */
export function exportTextOf(node: EditorNode): string {
  const text = node.textContent
  if (text) return text
  const spec = node.type.spec
  return spec.exportText?.(node) ?? spec.plainText?.(node) ?? spec.toHTML?.(node)?.text ?? ''
}
