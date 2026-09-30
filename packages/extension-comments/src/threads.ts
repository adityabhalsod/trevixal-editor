import {
  AddMarkStep,
  type Command,
  type EditorNode,
  type EditorState,
  type MarkSpec,
  type Path,
  RemoveMarkStep,
  SetNodeAttrsStep,
  TextSelection,
  blocksInRange,
  documentCommentsOf,
  inlineLength,
  inlineSize,
  marksAtInlineOffset,
  nodeAtPath,
  rangesWithMark,
  textblocks,
} from '@trevixal/core'

/**
 * Comment threads: a mark on the text each is about, carrying the thread's
 * id, and the threads themselves, one document setting holding them all.
 * Both travel with the document, so a review survives a save and a reload,
 * and a thread can never outlive or lose its text without the other knowing.
 */

export const COMMENT_MARK = 'comment'

/** One comment in a thread: the first opens it, the rest reply. */
export interface CommentEntry {
  readonly author: string
  readonly text: string
  /** When it was written, in milliseconds since the epoch. */
  readonly time: number
}

export interface CommentThread {
  readonly id: string
  readonly comments: readonly CommentEntry[]
  readonly resolved: boolean
}

/** The longest comment kept: a review note, not a chapter. */
const COMMENT_TEXT_MAX = 5000

/** The `comment` mark, to merge into a schema's marks. */
export function commentMarks(): Record<string, MarkSpec> {
  return {
    [COMMENT_MARK]: {
      attrs: { id: {} },
      toHTML: (mark) => ({
        tag: 'span',
        attrs: { class: 'trevixal-comment', 'data-comment': String(mark.attrs.id) },
      }),
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-comment',
          getAttrs: (element) => {
            const id = safeCommentId(element.getAttribute('data-comment'))
            return id ? { id } : false
          },
        },
      ],
    },
  }
}

/** A comment id: letters, digits and dashes, short. What a selector holds as is. */
export function safeCommentId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : null
}

function parseEntry(value: unknown): CommentEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.text !== 'string' || raw.text.trim() === '') return null
  return {
    author: typeof raw.author === 'string' ? raw.author.slice(0, 100) : '',
    text: raw.text.slice(0, COMMENT_TEXT_MAX),
    time: typeof raw.time === 'number' && Number.isFinite(raw.time) ? raw.time : 0,
  }
}

/** The threads a document stores, anything that does not read as one dropped. */
export function parseThreads(value: unknown): CommentThread[] {
  const stored = documentCommentsOf(value)
  if (!stored) return []
  let data: unknown
  try {
    data = JSON.parse(stored)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const threads: CommentThread[] = []
  for (const entry of data) {
    const raw = entry as Record<string, unknown>
    const id = safeCommentId(raw?.id)
    const comments = Array.isArray(raw?.comments)
      ? raw.comments.map(parseEntry).filter((each): each is CommentEntry => each !== null)
      : []
    if (!id || comments.length === 0 || threads.some((thread) => thread.id === id)) continue
    threads.push({ id, comments, resolved: raw.resolved === true })
  }
  return threads
}

/** Threads as the document stores them; null for none. */
export function storedThreads(threads: readonly CommentThread[]): string | null {
  return threads.length > 0 ? JSON.stringify(threads) : null
}

/** The document's threads, in the order their text appears. */
export function commentThreads(doc: EditorNode): CommentThread[] {
  const threads = parseThreads(doc.attrs.comments)
  const order = anchorOrder(doc)
  const rank = (thread: CommentThread): number => {
    const at = order.indexOf(thread.id)
    return at < 0 ? order.length : at
  }
  return threads.sort((a, b) => rank(a) - rank(b))
}

/** Comment ids in the order their text first appears. */
function anchorOrder(doc: EditorNode): string[] {
  const order: string[] = []
  for (const { node } of textblocks(doc)) {
    for (const child of node.content.children) {
      for (const mark of child.marks) {
        const id = mark.type.name === COMMENT_MARK ? String(mark.attrs.id) : null
        if (id && !order.includes(id)) order.push(id)
      }
    }
  }
  return order
}

/** Where a thread's text is: every range of every textblock carrying its mark. */
export function commentRanges(
  doc: EditorNode,
  id: string,
): readonly { path: Path; from: number; to: number }[] {
  const type = doc.type.schema.marks[COMMENT_MARK]
  if (!type) return []
  const ranges: { path: Path; from: number; to: number }[] = []
  for (const { path, node } of textblocks(doc)) {
    for (const range of rangesWithMark(node.content, 0, inlineLength(node.content), type)) {
      if (range.mark.attrs.id === id) ranges.push({ path, from: range.from, to: range.to })
    }
  }
  return ranges
}

/** The text of a textblock between two inline offsets; an atom reads as a space. */
function textBetween(block: EditorNode, from: number, to: number): string {
  let text = ''
  let offset = 0
  for (const child of block.content.children) {
    const size = inlineSize(child)
    if (offset < to && offset + size > from) {
      text += child.isText ? child.textContent.slice(Math.max(0, from - offset), to - offset) : ' '
    }
    offset += size
  }
  return text
}

/** The text a thread is about, as one string. */
export function commentedText(doc: EditorNode, id: string): string {
  return commentRanges(doc, id)
    .map(({ path, from, to }) => {
      const block = nodeAtPath(doc, path)
      return block ? textBetween(block, from, to) : ''
    })
    .join(' ')
}

/** An id no thread in the document has yet. */
export function newCommentId(doc: EditorNode): string {
  const taken = new Set(parseThreads(doc.attrs.comments).map((thread) => thread.id))
  let n = taken.size + 1
  while (taken.has(`c${n}`)) n++
  return `c${n}`
}

/** A command that rewrites the stored threads and nothing else. */
function withThreads(
  state: EditorState,
  update: (threads: CommentThread[]) => CommentThread[] | null,
) {
  const next = update(parseThreads(state.doc.attrs.comments))
  if (!next) return null
  const tr = state.tr
  tr.step(new SetNodeAttrsStep([], { ...state.doc.attrs, comments: storedThreads(next) }))
  return tr
}

/**
 * Comment on the selected text: its mark on the text, its thread in the
 * document, in one undoable step. Declines on an empty selection, since a
 * comment has to be about something.
 */
export function addComment(entry: CommentEntry, id?: string): Command {
  return (state) => {
    const type = state.schema.marks[COMMENT_MARK]
    const text = entry.text.trim()
    if (!type || state.selection.empty || text === '') return null
    const commentId = safeCommentId(id) ?? newCommentId(state.doc)
    const tr = withThreads(state, (threads) =>
      threads.some((thread) => thread.id === commentId)
        ? null
        : [...threads, { id: commentId, resolved: false, comments: [{ ...entry, text }] }],
    )
    if (!tr) return null
    const mark = type.create({ id: commentId })
    for (const block of blocksInRange(state.doc, state.selection.from, state.selection.to)) {
      if (block.from < block.to) tr.step(new AddMarkStep(block.path, block.from, block.to, mark))
    }
    return tr
  }
}

/** Add a reply to the end of a thread. */
export function replyToComment(id: string, entry: CommentEntry): Command {
  return (state) =>
    withThreads(state, (threads) => {
      const text = entry.text.trim()
      if (text === '' || !threads.some((thread) => thread.id === id)) return null
      return threads.map((thread) =>
        thread.id === id
          ? { ...thread, comments: [...thread.comments, { ...entry, text }] }
          : thread,
      )
    })
}

/** Resolve a thread, or reopen it. Its text keeps the mark either way. */
export function resolveComment(id: string, resolved = true): Command {
  return (state) =>
    withThreads(state, (threads) =>
      threads.some((thread) => thread.id === id && thread.resolved !== resolved)
        ? threads.map((thread) => (thread.id === id ? { ...thread, resolved } : thread))
        : null,
    )
}

/** Delete a thread and take its mark off the text, in one step. */
export function deleteComment(id: string): Command {
  return (state) => {
    const tr = withThreads(state, (threads) =>
      threads.some((thread) => thread.id === id)
        ? threads.filter((thread) => thread.id !== id)
        : null,
    )
    if (!tr) return null
    const type = state.schema.marks[COMMENT_MARK]
    if (type) {
      for (const { path, from, to } of commentRanges(state.doc, id)) {
        tr.step(new RemoveMarkStep(path, from, to, type.create({ id })))
      }
    }
    return tr
  }
}

/** The thread whose text holds the caret, or null. */
export function commentAt(state: EditorState): string | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const block = nodeAtPath(state.doc, selection.head.path)
  if (!block?.isTextblock) return null
  // The marks of the character before the caret; the first one's at the start.
  const mark = marksAtInlineOffset(block.content, Math.max(1, selection.head.offset)).find(
    (each) => each.type.name === COMMENT_MARK,
  )
  return mark ? String(mark.attrs.id) : null
}

/** Someone a comment can mention. */
export interface MentionUser {
  readonly id: string
  readonly name: string
}

/** The people a comment mentions by `@Name`, each once, from those it could. */
export function mentionsIn(text: string, users: readonly MentionUser[]): MentionUser[] {
  const lower = text.toLowerCase()
  return users.filter((user) => {
    const at = lower.indexOf(`@${user.name.toLowerCase()}`)
    if (at < 0) return false
    const after = lower[at + user.name.length + 1]
    return after === undefined || !/[\p{L}\p{N}]/u.test(after)
  })
}
