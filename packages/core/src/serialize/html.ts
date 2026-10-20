import { exportTextOf } from '../model/export-text'
import type { EditorNode, TextNode } from '../model/node'
import type { HTMLSpec } from '../model/schema'
import { TableMap } from '../model/table-map'
import { listStylesFor } from '../schema/basic'
import { documentSettingsAttrs } from '../schema/document-settings'
import {
  DEFAULT_LIST_NUMBERING,
  type ListNumberingScheme,
  formatListCounter,
  listMarker,
  listNumberingOf,
} from '../schema/list-numbering'

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
  // An arrow, not a bare reference: `map` would pass the index along as the
  // options argument.
  const children = node.content.children.map((child) => serializeToHTML(child, options)).join('')
  if (node.type === node.type.schema.topType) {
    // The document's own settings, when it has any, wrap its blocks; without
    // them the markup is the blocks alone, as it has always been.
    const attrs = documentSettingsAttrs(node)
    return Object.keys(attrs).length > 0 ? renderTag({ tag: 'div', attrs }, children) : children
  }
  const spec = node.type.spec.toHTML?.(node)
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

/** The bullet each level of a bulleted list draws, and each list style's. */
const TEXT_BULLETS = ['•', '◦', '▪']
const TEXT_BULLET_STYLES: Readonly<Record<string, string>> = { disc: '•', circle: '◦', square: '▪' }

/**
 * How the editor numbers the notes and references it collects at the end:
 * footnotes 1, 2, endnotes i, ii, and an IEEE reference list's [1], [2].
 */
const NOTE_COUNTERS: Readonly<Record<string, string>> = {
  footnoteList: 'decimal',
  endnoteList: 'lower-roman',
  referenceList: 'decimal',
}

/**
 * A plain-text file of the document: a line per textblock, as the page shows
 * it. A list item keeps its marker as the editor draws it (a bullet, `II.`, a
 * scheme's `Step 1:`, a tick box) and its depth, a note its number, a table
 * row its cells on one line, a merged cell's place kept empty, and an
 * equation, a video or a badge the words it stands for, where
 * {@link serializeToText} leaves each of them out.
 */
export function serializeToTextFile(doc: EditorNode): string {
  const lines: string[] = []
  /** `numbers`: each enclosing item's number; `tree`: the scheme a list tree numbers with, and its depth. */
  const walk = (
    node: EditorNode,
    indent: string,
    marker: string,
    numbers: readonly number[] = [],
    tree: { scheme: ListNumberingScheme; from: number } | null = null,
  ): void => {
    if (node.isTextblock) {
      lines.push(indent + marker + inlineText(node))
      return
    }
    if (node.childCount === 0) {
      const words = exportTextOf(node)
      if (words) lines.push(...words.split('\n').map((line) => indent + marker + line))
      return
    }
    if (isTextList(node)) {
      const scheme = listNumberingOf(node, doc)
      const ownTree =
        scheme && scheme !== DEFAULT_LIST_NUMBERING ? { scheme, from: numbers.length } : tree
      const inTree = ownTree?.scheme.listType === node.type.name
      const style = typeof node.attrs.listStyle === 'string' ? node.attrs.listStyle : ''
      const own = listStylesFor(node.type.name).has(style) ? style : null
      const start = typeof node.attrs.start === 'number' ? node.attrs.start : 1
      node.content.children.forEach((item, index) => {
        const path = [...numbers, start + index]
        let text = taskBox(item)
        if (text === null) {
          if (node.type.name === 'orderedList') {
            text = own
              ? `${formatListCounter(start + index, own)}.`
              : listMarker(
                  inTree && ownTree ? ownTree.scheme : DEFAULT_LIST_NUMBERING,
                  inTree && ownTree ? path.slice(ownTree.from) : [start + index],
                )
          } else {
            text =
              (own && TEXT_BULLET_STYLES[own]) ||
              (inTree && ownTree
                ? listMarker(ownTree.scheme, path.slice(ownTree.from))
                : TEXT_BULLETS[numbers.length % 3]) ||
              '•'
          }
          text += ' '
        }
        item.content.children.forEach((child, at) =>
          walk(child, indent + (at === 0 ? '' : '  '), at === 0 ? text : '', path, ownTree),
        )
      })
      return
    }
    const counter = NOTE_COUNTERS[node.type.name]
    if (
      counter &&
      (node.type.name !== 'referenceList' || (node.attrs.style ?? 'ieee') === 'ieee')
    ) {
      node.content.children.forEach((item, index) => {
        const number = formatListCounter(index + 1, counter)
        const own = node.type.name === 'referenceList' ? `[${number}] ` : `${number}. `
        if (item.isTextblock) walk(item, indent, own)
        else item.content.children.forEach((child, at) => walk(child, indent, at === 0 ? own : ''))
      })
      return
    }
    if (node.type.name === 'table') {
      // A merged cell's text once, at its top left, and its other places
      // empty: every row keeps its columns, as the Markdown table does.
      const map = TableMap.of(node)
      for (let row = 0; row < map.height; row++) {
        const cells: string[] = []
        for (let column = 0; column < map.width; column++) {
          const placed = map.at(row, column)
          cells.push(
            placed && placed.top === row && placed.left === column ? cellText(placed.node) : '',
          )
        }
        lines.push(indent + cells.join('\t'))
      }
      return
    }
    node.content.children.forEach((child, index) =>
      walk(child, indent, index === 0 ? marker : '', numbers, tree),
    )
  }
  walk(doc, '', '')
  return lines.join('\n')
}

/** A textblock's words, its atoms (an equation, a chip) included, a note's marker bracketed. */
function inlineText(block: EditorNode): string {
  return block.content.children
    .map((child) =>
      child.type.name === 'hardBreak'
        ? '\n'
        : /^(?:footnote|endnote)Ref$/.test(child.type.name)
          ? `[${exportTextOf(child)}]`
          : exportTextOf(child),
    )
    .join('')
}

function isTextList(node: EditorNode): boolean {
  return ['bulletList', 'orderedList', 'taskList'].includes(node.type.name)
}

/** A task's box, ticked or not; null for an ordinary item. */
function taskBox(item: EditorNode): string | null {
  if (item.type.name !== 'taskItem') return null
  return item.attrs.checked === true ? '☑ ' : '☐ '
}

/** A cell's text on one line. */
function cellText(cell: EditorNode): string {
  const words: string[] = []
  const collect = (node: EditorNode): void => {
    if (node.isTextblock) words.push(inlineText(node))
    else node.content.children.forEach(collect)
  }
  collect(cell)
  return words.join(' ')
}
