import {
  type Command,
  Fragment,
  ReplaceInlineStep,
  TextSelection,
  inlineLength,
  nodeAtPath,
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
 * Reformat the code block holding the selection, in place. Declines (returns
 * null) when the selection is not in a code block, when the block is not that
 * language, when the source does not parse, and when the result is identical,
 * so a chained command can take over and the history gets no empty entry.
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
    if (!block || block.type.name !== nodeName) return null

    // Only touch a block that declares itself as this language: silently
    // reformatting a Python block as JSON would be destructive.
    const language = typeof block.attrs.language === 'string' ? block.attrs.language : null
    if (!language || !ALIASES[kind].has(language.trim().toLowerCase())) return null

    const source = block.textContent
    const result = render(source, options.indent)
    if (!result.ok || typeof result.text !== 'string') return null
    const text = result.text
    if (text === source) return null // already formatted: decline rather than churn history

    const path = state.selection.from.path
    const tr = state.tr
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
