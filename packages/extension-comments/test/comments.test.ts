// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addComment,
  commentAt,
  commentMarks,
  commentRanges,
  commentThreads,
  commentedText,
  createCommentsPanel,
  deleteComment,
  mentionsIn,
  replyToComment,
  resolveComment,
} from '../src'

const schema = new Schema({
  nodes: defaultNodes(),
  marks: { ...defaultMarks(), ...commentMarks() },
})
const editors: Editor[] = []

function mount(html = '<p>The budget is final.</p>'): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
  editors.push(editor)
  return editor
}

/** Select "budget" in the first paragraph. */
function selectBudget(editor: Editor): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4), pos([0], 10))))
}

const ada = { author: 'Ada', text: 'Is this approved?', time: 1 }

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
  for (const style of document.head.querySelectorAll('style')) style.remove()
})

describe('comment threads', () => {
  it('put a thread on the selected text, and it comes back from the saved page', () => {
    const editor = mount()
    selectBudget(editor)
    expect(editor.exec(addComment(ada, 'c1'))).toBe(true)
    expect(commentedText(editor.state.doc, 'c1')).toBe('budget')
    expect(commentAt(editor.state)).toBe('c1')
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain('<span class="trevixal-comment" data-comment="c1">budget</span>')
    const back = parseHTML(schema, html, document)
    expect(commentThreads(back)).toEqual([{ id: 'c1', resolved: false, comments: [ada] }])
  })

  it('take replies, resolve and reopen, and delete with the mark', () => {
    const editor = mount()
    selectBudget(editor)
    editor.exec(addComment(ada, 'c1'))
    editor.exec(replyToComment('c1', { author: 'Sam', text: 'Yes, on Monday.', time: 2 }))
    editor.exec(resolveComment('c1'))
    const [thread] = commentThreads(editor.state.doc)
    expect(thread?.comments.map((comment) => comment.author)).toEqual(['Ada', 'Sam'])
    expect(thread?.resolved).toBe(true)
    expect(editor.exec(resolveComment('c1'))).toBe(false)
    editor.exec(deleteComment('c1'))
    expect(commentThreads(editor.state.doc)).toEqual([])
    expect(commentRanges(editor.state.doc, 'c1')).toEqual([])
    expect(editor.state.doc.textContent).toBe('The budget is final.')
  })

  it('decline an empty selection, or nothing to say', () => {
    const editor = mount()
    expect(editor.exec(addComment(ada))).toBe(false)
    selectBudget(editor)
    expect(editor.exec(addComment({ ...ada, text: '   ' }))).toBe(false)
  })

  it('find the people a comment mentions, whole names only', () => {
    const users = [
      { id: 'u1', name: 'Sam' },
      { id: 'u2', name: 'Samira' },
    ]
    expect(mentionsIn('Thanks @Sam, and @samira too', users).map((user) => user.id)).toEqual([
      'u1',
      'u2',
    ])
    expect(mentionsIn('@Samantha', users)).toEqual([])
  })
})

describe('the comments panel', () => {
  it('lists threads, replies with mentions, and fades a resolved one', () => {
    const editor = mount()
    const container = document.createElement('aside')
    document.body.append(container)
    const onMention = vi.fn()
    const panel = createCommentsPanel(editor, {
      container,
      author: () => 'Ada',
      users: () => [{ id: 'u1', name: 'Sam' }],
      onMention,
      now: () => 5,
    })
    expect(container.textContent).toContain('No comments yet')
    selectBudget(editor)
    expect(panel.addComment('Please check, @Sam')).toBe(true)
    expect(onMention).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'u1', name: 'Sam' } }),
    )
    const thread = container.querySelector('[data-thread="c1"]')
    expect(thread?.querySelector('.trevixal-comments__quote')?.textContent).toBe('“budget”')

    // @ suggests who to mention, and a click finishes the name.
    const box = thread?.querySelector('textarea') as HTMLTextAreaElement
    box.value = 'Done @S'
    box.dispatchEvent(new Event('input'))
    ;(thread?.querySelector('.trevixal-comments__mention') as HTMLButtonElement).click()
    expect(box.value).toBe('Done @Sam ')
    box.closest('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(commentThreads(editor.state.doc)[0]?.comments).toHaveLength(2)
    expect(onMention).toHaveBeenCalledTimes(2)

    const resolve = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Resolve',
    )
    resolve?.click()
    expect(container.querySelector('.trevixal-comments__thread--resolved')).not.toBeNull()
    expect(document.head.querySelector('style')?.textContent).toContain('[data-comment="c1"]')
    panel.destroy()
  })
})
