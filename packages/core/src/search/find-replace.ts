import type { Command } from '../commands/commands'
import { textblocks } from '../model/blocks'
import { Fragment } from '../model/fragment'
import { inlineSize, marksAtInlineOffset } from '../model/inline'
import type { EditorNode, TextNode } from '../model/node'
import type { Path } from '../model/tree'
import { ReplaceInlineStep } from '../state/steps/replace-inline'

export interface SearchMatch {
  readonly path: Path
  readonly from: number
  readonly to: number
}

export interface SearchOptions {
  readonly caseSensitive?: boolean
}

/** A block's text with inline atoms as placeholders, so offsets stay aligned. */
function searchableText(block: EditorNode): string {
  let text = ''
  for (const child of block.content.children) {
    text += child.isText ? (child as TextNode).text : '￼'.repeat(inlineSize(child))
  }
  return text
}

/** All matches of a query across the document's textblocks. */
export function findMatches(
  doc: EditorNode,
  query: string,
  options: SearchOptions = {},
): readonly SearchMatch[] {
  if (query.length === 0) return []
  const caseSensitive = options.caseSensitive === true
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: SearchMatch[] = []
  for (const { path, node } of textblocks(doc)) {
    const haystack = caseSensitive ? searchableText(node) : searchableText(node).toLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      matches.push({ path, from: index, to: index + query.length })
      index = haystack.indexOf(needle, index + query.length)
    }
  }
  return matches
}

/** Replace one match, inheriting the marks at its start. */
export function replaceMatch(match: SearchMatch, replacement: string): Command {
  return (state) => {
    const tr = state.tr
    const insert = buildReplacement(state.doc, match, replacement)
    if (insert === null) return null
    if (!tr.maybeStep(new ReplaceInlineStep(match.path, match.from, match.to, insert))) return null
    return tr
  }
}

/** Replace every match of the query. Offsets are applied back-to-front per block. */
export function replaceAll(
  query: string,
  replacement: string,
  options: SearchOptions = {},
): Command {
  return (state) => {
    const matches = findMatches(state.doc, query, options)
    if (matches.length === 0) return null
    const tr = state.tr
    // Reverse order keeps earlier offsets in the same block stable.
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i] as SearchMatch
      const insert = buildReplacement(state.doc, match, replacement)
      if (insert === null) continue
      tr.step(new ReplaceInlineStep(match.path, match.from, match.to, insert))
    }
    return tr.docChanged ? tr : null
  }
}

function buildReplacement(
  doc: EditorNode,
  match: SearchMatch,
  replacement: string,
): Fragment | null {
  if (replacement.length === 0) return Fragment.empty
  let block: EditorNode | null = doc
  for (const index of match.path) {
    block = block?.content.maybeChild(index) ?? null
  }
  if (!block?.isTextblock) return null
  const marks = marksAtInlineOffset(block.content, match.from + 1)
  return Fragment.of(block.type.schema.text(replacement, marks))
}
