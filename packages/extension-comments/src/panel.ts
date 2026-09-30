import { type Editor, TextSelection, pos } from '@trevixal/core'
import {
  type CommentEntry,
  type CommentThread,
  type MentionUser,
  addComment,
  commentAt,
  commentRanges,
  commentThreads,
  commentedText,
  deleteComment,
  mentionsIn,
  newCommentId,
  replyToComment,
  resolveComment,
} from './threads'

export interface MentionEvent {
  readonly user: MentionUser
  readonly thread: CommentThread
  readonly comment: CommentEntry
}

export interface CommentsPanelOptions {
  /** Where the panel goes: a sidebar, usually. */
  readonly container: HTMLElement
  /** Whose name goes on a new comment or reply. */
  readonly author: () => string
  /** The people `@` can mention; none by default. */
  readonly users?: () => readonly MentionUser[]
  /** Called once for each person a new comment or reply mentions: send them a note. */
  readonly onMention?: (event: MentionEvent) => void
  /** The clock; `Date.now` by default. */
  readonly now?: () => number
}

export interface CommentsPanel {
  readonly element: HTMLElement
  /** Comment on the selected text. False with nothing selected or nothing to say. */
  addComment(text: string): boolean
  destroy(): void
}

/** How many people `@` offers at once. */
const MENTION_SUGGESTIONS = 5

let scopes = 0

/**
 * The comments beside the document: every thread in the order its text
 * appears, each with its replies, a box to reply in (`@` suggests people to
 * mention), Resolve and Delete. A click on a thread's quote selects its
 * text; the caret in commented text picks its thread out. Resolved threads
 * stay listed, faded, and their text loses its highlight.
 */
export function createCommentsPanel(editor: Editor, options: CommentsPanelOptions): CommentsPanel {
  const document = options.container.ownerDocument
  const now = options.now ?? Date.now
  const users = options.users ?? (() => [])
  const view = editor.view
  const scope = String(++scopes)
  view?.dom.setAttribute('data-trevixal-comments-scope', scope)
  const sheet = document.createElement('style')
  document.head.append(sheet)

  const element = document.createElement('section')
  element.className = 'trevixal-comments'
  element.setAttribute('aria-label', 'Comments')
  options.container.append(element)

  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
  ): HTMLElementTagNameMap[K] => {
    const created = document.createElement(tag)
    created.className = className
    if (text) created.textContent = text
    return created
  }

  /** Tell everyone a new comment mentions, once each. */
  const notify = (threadId: string, comment: CommentEntry): void => {
    if (!options.onMention) return
    const thread = commentThreads(editor.state.doc).find((each) => each.id === threadId)
    if (!thread) return
    for (const user of mentionsIn(comment.text, users())) {
      options.onMention({ user, thread, comment })
    }
  }

  const select = (id: string): void => {
    const [first] = commentRanges(editor.state.doc, id)
    if (!first) return
    editor.dispatch(
      editor.state.tr.setSelection(
        new TextSelection(pos(first.path, first.from), pos(first.path, first.to)),
      ),
    )
    editor.view?.focus()
    editor.view?.scrollSelectionIntoView()
  }

  /** `@` followed by a name's start, before the caret, offers the people it could be. */
  const bindMentions = (box: HTMLTextAreaElement, list: HTMLElement): void => {
    const update = (): void => {
      list.replaceChildren()
      const before = box.value.slice(0, box.selectionStart ?? box.value.length)
      const typed = /@([\p{L}\p{N}]*)$/u.exec(before)
      if (!typed) return
      const start = (typed[1] ?? '').toLowerCase()
      for (const user of users()
        .filter((each) => each.name.toLowerCase().startsWith(start))
        .slice(0, MENTION_SUGGESTIONS)) {
        const option = make('button', 'trevixal-comments__mention', `@${user.name}`)
        option.type = 'button'
        option.addEventListener('click', () => {
          const at = before.length - (typed[0] ?? '').length
          box.value = `${box.value.slice(0, at)}@${user.name} ${box.value.slice(before.length)}`
          list.replaceChildren()
          box.focus()
        })
        list.append(option)
      }
    }
    box.addEventListener('input', update)
  }

  let drawnThreads: unknown = Symbol('never drawn')
  let drawnAnchors = ''
  const drafts = new Map<string, string>()

  const draw = (): void => {
    const doc = editor.state.doc
    const threads = commentThreads(doc)
    const anchors = threads
      .map((thread) => `${thread.id}:${commentedText(doc, thread.id)}`)
      .join('\n')
    if (doc.attrs.comments === drawnThreads && anchors === drawnAnchors) return
    drawnThreads = doc.attrs.comments
    drawnAnchors = anchors
    for (const box of element.querySelectorAll<HTMLTextAreaElement>('textarea[data-thread]')) {
      drafts.set(box.dataset.thread ?? '', box.value)
    }
    element.replaceChildren()
    if (threads.length === 0) {
      element.append(
        make(
          'p',
          'trevixal-comments__empty',
          'No comments yet. Select some text to comment on it.',
        ),
      )
    }
    const list = make('ol', 'trevixal-comments__threads')
    for (const thread of threads) {
      const item = make('li', 'trevixal-comments__thread')
      item.dataset.thread = thread.id
      if (thread.resolved) item.classList.add('trevixal-comments__thread--resolved')
      const quote = make('button', 'trevixal-comments__quote', `“${commentedText(doc, thread.id)}”`)
      quote.type = 'button'
      quote.addEventListener('click', () => select(thread.id))
      const entries = make('ol', 'trevixal-comments__entries')
      for (const comment of thread.comments) {
        const entry = make('li', 'trevixal-comments__entry')
        const meta = make('div', 'trevixal-comments__meta')
        meta.append(make('strong', 'trevixal-comments__author', comment.author || 'Someone'))
        if (comment.time > 0) {
          const time = make(
            'time',
            'trevixal-comments__time',
            new Date(comment.time).toLocaleString(),
          )
          time.dateTime = new Date(comment.time).toISOString()
          meta.append(time)
        }
        entry.append(meta, make('p', 'trevixal-comments__text', comment.text))
        entries.append(entry)
      }
      const reply = make('form', 'trevixal-comments__reply')
      const box = make('textarea', 'trevixal-comments__box')
      box.name = 'reply'
      box.dataset.thread = thread.id
      box.rows = 2
      box.placeholder = users().length > 0 ? 'Reply… (@ to mention)' : 'Reply…'
      box.setAttribute('aria-label', 'Reply')
      box.value = drafts.get(thread.id) ?? ''
      const mentions = make('div', 'trevixal-comments__mentions')
      bindMentions(box, mentions)
      const send = make('button', 'trevixal-comments__button', 'Reply')
      send.type = 'submit'
      reply.append(box, mentions, send)
      reply.addEventListener('submit', (event) => {
        event.preventDefault()
        const comment = { author: options.author(), text: box.value, time: now() }
        if (editor.exec(replyToComment(thread.id, comment))) {
          drafts.delete(thread.id)
          notify(thread.id, comment)
        }
      })
      const actions = make('div', 'trevixal-comments__actions')
      const resolve = make(
        'button',
        'trevixal-comments__button',
        thread.resolved ? 'Reopen' : 'Resolve',
      )
      resolve.type = 'button'
      resolve.addEventListener('click', () =>
        editor.exec(resolveComment(thread.id, !thread.resolved)),
      )
      const remove = make('button', 'trevixal-comments__button', 'Delete')
      remove.type = 'button'
      remove.addEventListener('click', () => editor.exec(deleteComment(thread.id)))
      actions.append(resolve, remove)
      item.append(quote, entries, reply, actions)
      list.append(item)
    }
    if (threads.length > 0) element.append(list)
    const selector = `[data-trevixal-comments-scope="${scope}"]`
    sheet.textContent = threads
      .filter((thread) => thread.resolved)
      .map(
        (thread) =>
          `${selector} [data-comment="${thread.id}"] { background: none; border-bottom: 0 }`,
      )
      .join('\n')
    highlight()
  }

  /** The thread under the caret, picked out in the panel and in the text. */
  const highlight = (): void => {
    const active = commentAt(editor.state)
    for (const item of element.querySelectorAll<HTMLElement>('.trevixal-comments__thread')) {
      item.classList.toggle('trevixal-comments__thread--active', item.dataset.thread === active)
    }
  }

  draw()
  const stop = editor.on('transaction', draw)
  const stopSelection = editor.on('selectionUpdate', highlight)

  return {
    element,
    addComment(text) {
      const comment = { author: options.author(), text, time: now() }
      const id = newCommentId(editor.state.doc)
      if (!editor.exec(addComment(comment, id))) return false
      notify(id, comment)
      return true
    },
    destroy() {
      stop()
      stopSelection()
      sheet.remove()
      element.remove()
      view?.dom.removeAttribute('data-trevixal-comments-scope')
    },
  }
}
