// Comment threads, as Word keeps them: one `w:comment` per thread in
// `word/comments.xml`, and in the body a range start where its text begins,
// a range end where it ends, and a reference run after that. A thread's
// replies follow its first comment as paragraphs of their own, each with
// its author, since Word's reply threading lives in a part of its own.

import { type EditorNode, textblocks } from '@trevixal/core'
import { escapeXML } from './xml'

/** A thread as the comments extension stores it on the document. */
interface StoredThread {
  readonly id: string
  readonly resolved: boolean
  readonly comments: readonly {
    readonly author: string
    readonly text: string
    readonly time: number
  }[]
}

/** What the writer needs to place and number the threads a document has. */
export interface DocxComments {
  /** Each thread's Word id. */
  readonly ids: ReadonlyMap<string, number>
  /** Unwritten segments of each thread's text: the last one closes the range. */
  readonly remaining: Map<string, number>
  readonly started: Set<string>
  readonly threads: readonly StoredThread[]
}

function storedThreads(value: unknown): StoredThread[] {
  if (typeof value !== 'string' || value === '') return []
  let data: unknown
  try {
    data = JSON.parse(value)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data.flatMap((entry) => {
    const raw = entry as Record<string, unknown>
    if (typeof raw?.id !== 'string' || !Array.isArray(raw.comments)) return []
    const comments = raw.comments.flatMap((comment) => {
      const each = comment as Record<string, unknown>
      return typeof each?.text === 'string'
        ? [
            {
              author: typeof each.author === 'string' ? each.author : '',
              text: each.text,
              time: typeof each.time === 'number' ? each.time : 0,
            },
          ]
        : []
    })
    return comments.length > 0 ? [{ id: raw.id, resolved: raw.resolved === true, comments }] : []
  })
}

/**
 * The threads a document has text for, with how many separate stretches of
 * text each covers: a thread across two paragraphs is two segments, and its
 * range ends only with the second.
 */
export function docxComments(doc: EditorNode): DocxComments | null {
  if (!doc.type.schema.marks.comment) return null
  const remaining = new Map<string, number>()
  for (const { node } of textblocks(doc)) {
    let previous: string | null = null
    for (const child of node.content.children) {
      const id = commentIdOf(child)
      if (id && id !== previous) remaining.set(id, (remaining.get(id) ?? 0) + 1)
      previous = id
    }
  }
  const threads = storedThreads(doc.attrs.comments).filter((thread) => remaining.has(thread.id))
  if (threads.length === 0) return null
  const ids = new Map(threads.map((thread, index) => [thread.id, index]))
  for (const id of [...remaining.keys()]) if (!ids.has(id)) remaining.delete(id)
  return { ids, remaining, started: new Set(), threads }
}

/** The thread id an inline node's comment mark names, if it has one. */
export function commentIdOf(node: EditorNode): string | null {
  if (!node.isText) return null
  const mark = node.marks.find((each) => each.type.name === 'comment')
  const id = mark?.attrs.id
  return typeof id === 'string' ? id : null
}

/** Markup where a stretch of a thread's text begins: the range start, the first time. */
export function commentSegmentStart(comments: DocxComments, id: string): string {
  const wordId = comments.ids.get(id)
  if (wordId === undefined || comments.started.has(id)) return ''
  comments.started.add(id)
  return `<w:commentRangeStart w:id="${wordId}"/>`
}

/** Markup where a stretch ends: the range end and the reference, after the last one. */
export function commentSegmentEnd(comments: DocxComments, id: string): string {
  const wordId = comments.ids.get(id)
  const left = comments.remaining.get(id)
  if (wordId === undefined || left === undefined) return ''
  comments.remaining.set(id, left - 1)
  if (left - 1 > 0) return ''
  return `<w:commentRangeEnd w:id="${wordId}"/><w:r><w:commentReference w:id="${wordId}"/></w:r>`
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 9)

const paragraphOf = (text: string): string =>
  `<w:p><w:r><w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r></w:p>`

/** `word/comments.xml`: every thread, its first comment and then its replies. */
export function commentsPart(comments: DocxComments, namespace: string): string {
  const body = comments.threads
    .map((thread) => {
      const [first, ...replies] = thread.comments
      if (!first) return ''
      const date =
        first.time > 0
          ? ` w:date="${new Date(first.time).toISOString().replace(/\.\d{3}Z$/, 'Z')}"`
          : ''
      const paragraphs = [
        paragraphOf(first.text),
        ...replies.map((reply) => paragraphOf(`${reply.author || 'Someone'}: ${reply.text}`)),
        ...(thread.resolved ? [paragraphOf('(Resolved)')] : []),
      ].join('')
      return `<w:comment w:id="${comments.ids.get(thread.id)}" w:author="${escapeXML(first.author || 'Someone')}"${date} w:initials="${escapeXML(initials(first.author || 'Someone'))}">${paragraphs}</w:comment>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="${namespace}">${body}</w:comments>`
}
