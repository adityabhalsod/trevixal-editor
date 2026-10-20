import {
  type Command,
  type EditorState,
  Fragment,
  ReplaceInlineStep,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  blocksInRange,
  inlineLength,
  nodeAtPath,
  pathsEqual,
  pos,
} from '@trevixal/core'
import { formatJSON, minifyJSON } from './json'
import type { FormatKind } from './types'
import { formatXML, minifyXML } from './xml'

export interface FormatCodeBlockOptions {
  /** Spaces per indent level; 2 by default. */
  readonly indent?: number
  /** Node type holding the source; `"codeBlock"` by default. */
  readonly nodeName?: string
}

/** Language aliases a code block may carry for each formatter. */
const ALIASES: Record<FormatKind, ReadonlySet<string>> = {
  json: new Set(['json', 'jsonc', 'json5']),
  xml: new Set(['xml', 'xhtml', 'svg', 'rss', 'atom', 'xsl', 'xslt']),
}

/**
 * How text that names no language has to start to be taken for one: an
 * object or an array, or a tag. Parsing alone would take a lone `42` or a
 * word for a document.
 */
const UNDECLARED_START: Record<FormatKind, RegExp> = {
  json: /^\s*[[{]/,
  xml: /^\s*</,
}

/**
 * Reformat the code block holding the selection, in place. Declines (returns
 * null) when the block is another language, when the source does not parse,
 * and when the result is identical, so a chained command can take over and
 * the history gets no empty entry.
 *
 * A block with no language is formatted when it parses, and takes the
 * language it turned out to be: the highlighter guesses one to colour it
 * without writing it down, so a block that looked like JSON was refused. So
 * are paragraphs, pasted from somewhere that sent the JSON as lines of text:
 * the selected ones become one code block.
 */
export function formatCodeBlock(kind: FormatKind, options: FormatCodeBlockOptions = {}): Command {
  return rewriteCodeBlock(kind, options, (source, indent) =>
    kind === 'json' ? formatJSON(source, indent) : formatXML(source, indent),
  )
}

/** The inverse of {@link formatCodeBlock}: collapse the block to one line. */
export function minifyCodeBlock(kind: FormatKind, options: FormatCodeBlockOptions = {}): Command {
  return rewriteCodeBlock(kind, options, (source) =>
    kind === 'json' ? minifyJSON(source) : minifyXML(source),
  )
}

function rewriteCodeBlock(
  kind: FormatKind,
  options: FormatCodeBlockOptions,
  render: (source: string, indent: number | undefined) => { ok: boolean; text?: string },
): Command {
  const nodeName = options.nodeName ?? 'codeBlock'
  return (state) => {
    const block = nodeAtPath(state.doc, state.selection.from.path)
    if (!block) return null
    if (block.type.name === 'paragraph')
      return paragraphsToCode(state, kind, nodeName, render, options)
    if (block.type.name !== nodeName) return null

    // Only touch a block that declares itself as this language: silently
    // reformatting a Python block as JSON would be destructive.
    const language =
      typeof block.attrs.language === 'string' ? block.attrs.language.trim().toLowerCase() : ''
    if (language && !ALIASES[kind].has(language)) return null

    const source = block.textContent
    if (!language && !UNDECLARED_START[kind].test(source)) return null
    const result = render(source, options.indent)
    if (!result.ok || typeof result.text !== 'string') return null
    const text = result.text
    if (text === source && language) return null // already formatted: decline rather than churn history

    const path = state.selection.from.path
    const tr = state.tr
    if (!language) tr.step(new SetNodeAttrsStep(path, { ...block.attrs, language: kind }))
    tr.step(
      new ReplaceInlineStep(
        path,
        0,
        inlineLength(block.content),
        text.length > 0 ? Fragment.of(state.schema.text(text)) : Fragment.empty,
      ),
    )
    // The old offsets mean nothing in the reformatted text; park the caret at
    // the end, which is where a "format document" action conventionally lands.
    tr.setSelection(new TextSelection(pos(path, text.length)))
    return tr
  }
}

/**
 * The selected paragraphs, siblings all, as one code block of `kind` holding
 * their text formatted; null when they are not that language.
 */
function paragraphsToCode(
  state: EditorState,
  kind: FormatKind,
  nodeName: string,
  render: (source: string, indent: number | undefined) => { ok: boolean; text?: string },
  options: FormatCodeBlockOptions,
): Transaction | null {
  const type = state.schema.nodes[nodeName]
  const blocks = blocksInRange(state.doc, state.selection.from, state.selection.to)
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  if (!type || !first || !last) return null
  const parentPath = first.path.slice(0, -1)
  const siblings = blocks.every(
    (block) =>
      block.node.type.name === 'paragraph' && pathsEqual(block.path.slice(0, -1), parentPath),
  )
  if (!siblings) return null
  const source = blocks.map((block) => block.node.textContent).join('\n')
  if (!UNDECLARED_START[kind].test(source)) return null
  const result = render(source, options.indent)
  if (!result.ok || typeof result.text !== 'string') return null

  const from = first.path[first.path.length - 1] as number
  const to = (last.path[last.path.length - 1] as number) + 1
  const code = type.create({ language: kind }, Fragment.of(state.schema.text(result.text)))
  const tr = state.tr
  tr.step(new ReplaceNodesStep(parentPath, from, to, Fragment.of(code)))
  return tr.setSelection(new TextSelection(pos([...parentPath, from], result.text.length)))
}
