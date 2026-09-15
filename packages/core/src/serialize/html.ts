import type { EditorNode, TextNode } from '../model/node'
import type { HTMLSpec } from '../model/schema'

export interface HTMLSerializeOptions {
  /**
   * Markup to emit for a node instead of the one its schema describes;
   * return null to leave the node alone.
   *
   * This is how a document gets out carrying what the editor *drew* rather
   * than only what it holds, syntax highlighting is a decoration layer and a
   * diagram preview is an element the renderer appends, so neither is in the
   * model and neither would otherwise survive being serialized from it.
   *
   * **The string is emitted verbatim, not escaped.** It is markup the host
   * produced, on the same footing as the diagram renderer's own output;
   * never hand this anything that arrived with a document.
   */
  readonly renderNode?: (node: EditorNode) => string | null
}

/**
 * String-based HTML export driven by the schema's `toHTML` specs. No DOM
 * usage (SSR-safe); all text and attribute values are escaped.
 */
export function serializeToHTML(node: EditorNode, options: HTMLSerializeOptions = {}): string {
  if (node.isText) return serializeText(node as TextNode)
  const replacement = options.renderNode?.(node)
  if (replacement !== null && replacement !== undefined) return replacement
  const spec = node.type.spec.toHTML?.(node)
  // An arrow, not a bare reference: `map` would pass the index along as the
  // options argument.
  const children = node.content.children.map((child) => serializeToHTML(child, options)).join('')
  if (!spec) return children
  return renderTag(spec, children)
}

function serializeText(node: TextNode): string {
  let html = escapeHTML(node.text)
  // Innermost mark first so the first mark in the set is the outermost tag.
  for (let i = node.marks.length - 1; i >= 0; i--) {
    const mark = node.marks[i]
    const spec = mark.type.spec.toHTML?.(mark)
    if (spec) html = renderTag(spec, html)
  }
  return html
}

function renderTag(spec: HTMLSpec, children: string): string {
  const attrs = Object.entries(spec.attrs ?? {})
    .map(([name, value]) => ` ${name}="${escapeHTML(value)}"`)
    .join('')
  if (spec.isVoid) return `<${spec.tag}${attrs}>`
  const body = children || spec.innerHTML || (spec.text ? escapeHTML(spec.text) : '')
  const inner = spec.childTag ? `<${spec.childTag}>${body}</${spec.childTag}>` : body
  return `<${spec.tag}${attrs}>${inner}</${spec.tag}>`
}

export function escapeHTML(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Plain-text export: textblock contents joined by newlines. */
export function serializeToText(doc: EditorNode): string {
  const lines: string[] = []
  const walk = (node: EditorNode): void => {
    if (node.isTextblock) {
      lines.push(node.textContent)
      return
    }
    for (const child of node.content.children) walk(child)
  }
  walk(doc)
  return lines.join('\n')
}
