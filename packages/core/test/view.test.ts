// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { type Editor, createEditor } from '../src/editor/editor'
import { pos } from '../src/model/position'
import { TextSelection } from '../src/state/selection'
import { domPointFromPosition, positionFromDOMPoint } from '../src/view/dom-point'
import type { EditorView } from '../src/view/editor-view'
import { bold, doc, h, p, testSchema, text } from './helpers'

function mount(document = doc(p('hello'))): { editor: Editor; view: EditorView } {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const editor = createEditor({ schema: testSchema, doc: document, element: host })
  return { editor, view: editor.view as EditorView }
}

function fireBeforeInput(target: HTMLElement, inputType: string, data?: string): Event {
  let event: Event
  try {
    event = new InputEvent('beforeinput', {
      inputType,
      data,
      cancelable: true,
      bubbles: true,
    } as InputEventInit)
    if ((event as InputEvent).inputType !== inputType) throw new Error('init not honored')
  } catch {
    event = new Event('beforeinput', { cancelable: true, bubbles: true })
    Object.assign(event, { inputType, data: data ?? null })
  }
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  window.document.body.innerHTML = ''
})

describe('rendering', () => {
  it('renders the document with marks and ARIA attributes', () => {
    const { view } = mount(doc(h(2, 'Hi'), p(text('a '), bold('b'))))
    expect(view.dom.getAttribute('role')).toBe('textbox')
    expect(view.dom.getAttribute('aria-multiline')).toBe('true')
    expect(view.dom.innerHTML).toBe('<h2>Hi</h2><p>a <strong>b</strong></p>')
  })

  it('renders a caret placeholder in empty blocks', () => {
    const { view } = mount(doc(p()))
    const paragraph = view.dom.querySelector('p')
    expect(paragraph?.querySelector('br')).not.toBeNull()
  })

  it('patches only changed blocks, keeping sibling elements', () => {
    const { editor, view } = mount(doc(p('one'), p('two')))
    const [first, second] = [...view.dom.children]
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    editor.commands.insertText('!')
    const [firstAfter, secondAfter] = [...view.dom.children]
    expect(firstAfter).toBe(first) // untouched block: same element
    expect(secondAfter).toBe(second) // changed textblock patched in place
    expect(secondAfter?.textContent).toBe('two!')
  })

  it('renders atoms non-editable', () => {
    const { view } = mount(doc(p('x'), testSchema.node('horizontalRule')))
    const hr = view.dom.querySelector('hr')
    expect(hr?.contentEditable).toBe('false')
  })
})

describe('DOM ↔ model position mapping', () => {
  it('round-trips positions through the rendered DOM', () => {
    const { view } = mount(doc(p(text('ab '), bold('cd')), h(1, 'ti')))
    const renderer = view.renderer
    for (const [path, maxOffset] of [
      [[0], 5],
      [[1], 2],
    ] as const) {
      for (let offset = 0; offset <= maxOffset; offset++) {
        const point = domPointFromPosition(view.dom, renderer, pos(path, offset))
        expect(point).not.toBeNull()
        if (!point) continue
        const back = positionFromDOMPoint(view.dom, renderer, point.node, point.offset)
        expect(back).toEqual({ path, offset })
      }
    }
  })
})

describe('beforeinput pipeline', () => {
  it('intercepts insertText and updates model and DOM', () => {
    const { editor, view } = mount(doc(p('helo')))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 3))))
    const event = fireBeforeInput(view.dom, 'insertText', 'l')
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getText()).toBe('hello')
    expect(view.dom.querySelector('p')?.textContent).toBe('hello')
  })

  it('handles Enter (insertParagraph) and Backspace (deleteContentBackward)', () => {
    const { editor, view } = mount(doc(p('ab')))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    fireBeforeInput(view.dom, 'insertParagraph')
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>')
    // Cursor sits at the start of the second block; Backspace re-joins.
    fireBeforeInput(view.dom, 'deleteContentBackward')
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('deletes an emoji surrogate pair as one unit', () => {
    const { editor, view } = mount(doc(p('a😀')))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 3))))
    fireBeforeInput(view.dom, 'deleteContentBackward')
    expect(editor.getText()).toBe('a')
  })

  it('inserts a hard break on insertLineBreak', () => {
    const { editor, view } = mount(doc(p('ab')))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    fireBeforeInput(view.dom, 'insertLineBreak')
    expect(editor.getHTML()).toBe('<p>a<br>b</p>')
  })

  it('blocks unknown input intents', () => {
    const { view } = mount()
    const event = fireBeforeInput(view.dom, 'insertOrderedList')
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('keymap', () => {
  it('Mod-b toggles bold over the selection', () => {
    const { editor, view } = mount(doc(p('hi')))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0), pos([0], 2))))
    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true, bubbles: true }),
    )
    expect(editor.isActive('bold')).toBe(true)
  })

  it('Mod-z undoes and always consumes the event', () => {
    const { editor, view } = mount(doc(p('')))
    editor.commands.insertText('x')
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    })
    view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getText()).toBe('')
  })
})

describe('IME composition', () => {
  it('lets the DOM lead, then reconciles at compositionend', () => {
    const { editor, view } = mount(doc(p('ab')))
    view.dom.dispatchEvent(new Event('compositionstart', { bubbles: true }))
    // The IME mutates the DOM directly while we hold rendering.
    const textNode = view.dom.querySelector('p')?.firstChild as Text
    textNode.data = 'aかb'
    view.dom.dispatchEvent(new Event('compositionend', { bubbles: true }))
    expect(editor.getText()).toBe('aかb')
    expect(view.dom.querySelector('p')?.textContent).toBe('aかb')
  })

  it('does not re-render mid-composition', () => {
    const { view } = mount(doc(p('ab')))
    view.dom.dispatchEvent(new Event('compositionstart', { bubbles: true }))
    const textNode = view.dom.querySelector('p')?.firstChild as Text
    textNode.data = 'axb'
    view.update() // must be a no-op while composing
    expect(view.dom.querySelector('p')?.textContent).toBe('axb')
    view.dom.dispatchEvent(new Event('compositionend', { bubbles: true }))
  })
})

describe('mutation repair', () => {
  it('reconciles unexpected DOM edits back into the model', async () => {
    const { editor, view } = mount(doc(p('hello')))
    const textNode = view.dom.querySelector('p')?.firstChild as Text
    textNode.data = 'hallo' // autocorrect/extension writing behind our back
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(editor.getText()).toBe('hallo')
  })
})

describe('lifecycle', () => {
  it('destroy removes the DOM and stops listening', () => {
    const host = window.document.createElement('div')
    window.document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, doc: doc(p('x')), element: host })
    expect(host.querySelector('.trevixal-content')).not.toBeNull()
    editor.destroy()
    expect(host.querySelector('.trevixal-content')).toBeNull()
  })
})

describe('container-level DOM points', () => {
  it('maps a whole-document selection reported on the root element', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, element: host })
    editor.commands.insertText('messy text')
    const view = editor.view
    if (!view) throw new Error('view expected')

    // Browsers report Ctrl+A as an offset range over the root's children,
    // not as a text-node range (Firefox does this).
    const start = positionFromDOMPoint(view.dom, view.renderer, view.dom, 0)
    const end = positionFromDOMPoint(view.dom, view.renderer, view.dom, 1)
    expect(start).toEqual(pos([0], 0))
    expect(end).toEqual(pos([0], 10))
    editor.destroy()
  })

  it('descends into nested containers to reach a textblock', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, element: host })
    editor.commands.insertText('quoted')
    editor.commands.wrapIn('blockquote')
    const view = editor.view
    if (!view) throw new Error('view expected')

    const start = positionFromDOMPoint(view.dom, view.renderer, view.dom, 0)
    expect(start).toEqual(pos([0, 0], 0))
    editor.destroy()
  })
})
