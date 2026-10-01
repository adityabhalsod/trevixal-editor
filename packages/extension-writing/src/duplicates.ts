// Text that appears word for word in another document of the workspace: a
// paragraph pasted twice, a boilerplate sentence that has drifted in one
// copy and not the other. Sentences are compared by their words alone, so
// punctuation, case and spacing do not hide a match.

import { type EditorNode, type Path, textblocks } from '@trevixal/core'
import { sentenceSpans, splitWords } from './analysis'
import { blockText } from './assistant'

/** Another document to compare against. */
export interface DuplicateSource {
  readonly id: string
  readonly title: string
  readonly doc: EditorNode
}

/** A sentence of this document that another one also has. */
export interface DuplicatePassage {
  readonly path: Path
  readonly from: number
  readonly to: number
  readonly text: string
  readonly foundIn: readonly { readonly id: string; readonly title: string }[]
}

export interface DuplicateOptions {
  /** Sentences shorter than this are too common to count (default 8 words). */
  readonly minWords?: number
}

/** A sentence's words, in lower case, one space apart: what two copies share. */
function fingerprint(sentence: string): string {
  return splitWords(sentence)
    .map((word) => word.toLowerCase())
    .join(' ')
}

/** Every prose sentence of a document with where it is. */
function sentencesOf(doc: EditorNode, minWords: number) {
  const found: { path: Path; from: number; to: number; text: string; key: string }[] = []
  for (const { path, node } of textblocks(doc)) {
    if (node.type.spec.preserveWhitespace === true) continue
    const text = blockText(node)
    for (const sentence of sentenceSpans(text)) {
      if (splitWords(sentence.text).length < minWords) continue
      found.push({
        path,
        from: sentence.index,
        to: sentence.index + sentence.length,
        text: sentence.text,
        key: fingerprint(sentence.text),
      })
    }
  }
  return found
}

/** The sentences `doc` shares with any of `others`, in document order. */
export function findDuplicatePassages(
  doc: EditorNode,
  others: readonly DuplicateSource[],
  options: DuplicateOptions = {},
): readonly DuplicatePassage[] {
  const minWords = options.minWords ?? 8
  const index = new Map<string, { id: string; title: string }[]>()
  for (const other of others) {
    for (const sentence of sentencesOf(other.doc, minWords)) {
      const where = index.get(sentence.key) ?? []
      if (!where.some((entry) => entry.id === other.id))
        where.push({ id: other.id, title: other.title })
      index.set(sentence.key, where)
    }
  }
  return sentencesOf(doc, minWords).flatMap(({ key, ...sentence }) => {
    const foundIn = index.get(key)
    return foundIn ? [{ ...sentence, foundIn }] : []
  })
}
