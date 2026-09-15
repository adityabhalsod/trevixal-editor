// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { type Editor, type EditorOptions, createEditor } from '../src/editor/editor'
import { pos } from '../src/model/position'
import { findMatches } from '../src/search/find-replace'
import { TextSelection } from '../src/state/selection'
import type { EditorView } from '../src/view/editor-view'
import { testSchema } from './helpers'

function mount(options: Partial<EditorOptions> = {}): { editor: Editor; view: EditorView } {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const editor = createEditor({ schema: testSchema, element: host, ...options })
  return { editor, view: editor.view as EditorView }
}

function fireBeforeInput(target: HTMLElement, inputType: string, data?: string): Event {
  const event = new Event('beforeinput', { cancelable: true, bubbles: true })
  Object.assign(event, { inputType, data: data ?? null })
  target.dispatchEvent(event)
  return event
}

function fireClipboard(
  target: HTMLElement,
  type: 'copy' | 'cut' | 'paste',
  data: Record<string, string>,
): Record<string, string> {
  const store: Record<string, string> = { ...data }
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (mime: string) => store[mime] ?? '',
      setData: (mime: string, value: string) => {
        store[mime] = value
      },
    },
  })
  target.dispatchEvent(event)
  return store
}

beforeEach(() => {
  window.document.body.innerHTML = ''
})

describe('placeholder', () => {
  it('shows while empty and clears on content', () => {
    const { editor, view } = mount({ placeholder: 'Write something…' })
    expect(view.dom.dataset.trevixalPlaceholder).toBe('Write something…')
    expect(view.dom.dataset.trevixalEmpty).toBe('true')
    editor.commands.insertText('x')
    expect(view.dom.dataset.trevixalEmpty).toBeUndefined()
  })
})

describe('read-only mode', () => {
  it('blocks input and can be toggled', () => {
    const { editor, view } = mount({ editable: false })
    expect(view.dom.contentEditable).toBe('false')
    fireBeforeInput(view.dom, 'insertText', 'x')
    expect(editor.getText()).toBe('')
    editor.setEditable(true)
    expect(view.dom.contentEditable).toBe('true')
    fireBeforeInput(view.dom, 'insertText', 'x')
    expect(editor.getText()).toBe('x')
  })
})

describe('max length', () => {
  it('rejects edits past the limit but allows deletions', () => {
    const { editor } = mount({ maxLength: 5 })
    editor.commands.insertText('hello')
    expect(editor.getText()).toBe('hello')
    editor.commands.insertText('!')
    expect(editor.getText()).toBe('hello')
    expect(editor.getCharacterCount()).toBe(5)
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(editor.getText()).toBe('')
  })
})

describe('input rules through the view', () => {
  it('## + space becomes a heading while typing', () => {
    const { editor, view } = mount()
    fireBeforeInput(view.dom, 'insertText', '#')
    fireBeforeInput(view.dom, 'insertText', '#')
    fireBeforeInput(view.dom, 'insertText', ' ')
    fireBeforeInput(view.dom, 'insertText', 'T')
    expect(editor.getHTML()).toBe('<h2>T</h2>')
  })

  it('- + space starts a list; Enter splits items; Enter on empty exits', () => {
    const { editor, view } = mount()
    fireBeforeInput(view.dom, 'insertText', '-')
    fireBeforeInput(view.dom, 'insertText', ' ')
    fireBeforeInput(view.dom, 'insertText', 'a')
    fireBeforeInput(view.dom, 'insertParagraph')
    fireBeforeInput(view.dom, 'insertText', 'b')
    expect(editor.getHTML()).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>')
    fireBeforeInput(view.dom, 'insertParagraph') // new empty item
    fireBeforeInput(view.dom, 'insertParagraph') // exits the list
    expect(editor.getHTML()).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul><p></p>')
  })
})

describe('clipboard', () => {
  it('copy writes html, plain text and Trevixal JSON', () => {
    const { editor, view } = mount()
    editor.commands.insertText('hello')
    editor.commands.selectAll()
    const written = fireClipboard(view.dom, 'copy', {})
    expect(written['text/html']).toBe('<p>hello</p>')
    expect(written['text/plain']).toBe('hello')
    expect(JSON.parse(written['application/x-trevixal+json'] as string)).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    ])
  })

  it('cut copies then deletes', () => {
    const { editor, view } = mount()
    editor.commands.insertText('hello')
    editor.commands.selectAll()
    const written = fireClipboard(view.dom, 'cut', {})
    expect(written['text/plain']).toBe('hello')
    expect(editor.getText()).toBe('')
  })

  it('paste prefers Trevixal JSON', () => {
    const { editor, view } = mount()
    fireClipboard(view.dom, 'paste', {
      'application/x-trevixal+json': JSON.stringify([
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hi' }] },
      ]),
      'text/html': '<p>wrong</p>',
      'text/plain': 'wrong',
    })
    expect(editor.getHTML()).toContain('<h2>Hi</h2>')
  })

  it('paste sanitizes HTML payloads', () => {
    const { editor, view } = mount()
    fireClipboard(view.dom, 'paste', {
      'text/html': '<p>safe</p><script>alert(1)</script>',
      'text/plain': 'safe',
    })
    expect(editor.getHTML()).toBe('<p>safe</p>')
  })

  it('multi-line plain text becomes paragraphs', () => {
    const { editor, view } = mount()
    fireClipboard(view.dom, 'paste', { 'text/plain': 'one\ntwo' })
    expect(editor.getHTML()).toBe('<p>one</p><p>two</p>')
  })

  it('inline paste lands at the cursor', () => {
    const { editor, view } = mount()
    editor.commands.insertText('ac')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    fireClipboard(view.dom, 'paste', { 'text/plain': 'b' })
    expect(editor.getText()).toBe('abc')
  })
})

describe('search highlights', () => {
  it('renders and clears decorations without touching the document', () => {
    const { editor, view } = mount()
    editor.commands.insertText('hey there hey')
    const jsonBefore = JSON.stringify(editor.getJSON())
    view.setHighlights(findMatches(editor.state.doc, 'hey'))
    const spans = view.dom.querySelectorAll('.trevixal-search-match')
    expect(spans.length).toBe(2)
    expect(JSON.stringify(editor.getJSON())).toBe(jsonBefore)
    view.setHighlights([])
    expect(view.dom.querySelectorAll('.trevixal-search-match').length).toBe(0)
  })
})
