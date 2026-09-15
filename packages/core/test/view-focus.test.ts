// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { type Editor, createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { TextSelection } from '../src/state/selection'
import { SetNodeAttrsStep } from '../src/state/steps/attrs-step'
import { ReplaceInlineStep } from '../src/state/steps/replace-inline'
import type { EditorView } from '../src/view/editor-view'
import { doc, p, testSchema } from './helpers'

function mount(document = doc(p('hello world'))): { editor: Editor; view: EditorView } {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const editor = createEditor({ schema: testSchema, doc: document, element: host })
  return { editor, view: editor.view as EditorView }
}

describe('EditorView.focus', () => {
  it('takes focus without scrolling the page to the caret', () => {
    const { view } = mount()
    const focus = vi.spyOn(view.dom, 'focus')

    view.focus()

    // A bare `focus()` scrolls the caret into view, and the caret can be a
    // whole document away from what the reader is looking at. Every caller is
    // handing focus back after a menu or a dialog took it, so the page has to
    // stay where it was.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('scrolls to the caret only when asked to', () => {
    const { editor, view } = mount(doc(p('one'), p('two')))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1, 0], 0))))
    const scrolled: ScrollIntoViewOptions[] = []
    for (const element of view.dom.querySelectorAll('p')) {
      element.scrollIntoView = ((options: ScrollIntoViewOptions) => {
        scrolled.push(options)
      }) as Element['scrollIntoView']
    }

    view.scrollSelectionIntoView({ block: 'start' })

    expect(scrolled).toEqual([{ block: 'start' }])
  })
})

describe('inline decoration attributes', () => {
  it('renders a decoration’s attributes onto the span it paints', () => {
    const { editor, view } = mount(doc(p('hello world')))
    view.setDecorationLayer('probe', (node) =>
      node.isTextblock
        ? [{ from: 0, to: 5, className: 'probe', attrs: { 'data-probe': 'one', title: 'why' } }]
        : null,
    )

    const span = view.dom.querySelector('.probe') as HTMLElement
    // A decoration that can only set a class can be seen but not identified:
    // nothing on the span says which decoration painted it.
    expect(span.getAttribute('data-probe')).toBe('one')
    expect(span.getAttribute('title')).toBe('why')
    expect(span.textContent).toBe('hello')
    editor.destroy()
  })

  it('repaints when only an attribute changes', () => {
    const { editor, view } = mount(doc(p('hello world')))
    let value = 'one'
    view.setDecorationLayer('probe', (node) =>
      node.isTextblock
        ? [{ from: 0, to: 5, className: 'probe', attrs: { 'data-probe': value } }]
        : null,
    )
    expect(view.dom.querySelector('.probe')?.getAttribute('data-probe')).toBe('one')

    value = 'two'
    view.setDecorationLayer('probe', (node) =>
      node.isTextblock
        ? [{ from: 0, to: 5, className: 'probe', attrs: { 'data-probe': value } }]
        : null,
    )

    // Without attributes in the equality check the renderer reuses the old
    // span, and the new value never reaches the DOM.
    expect(view.dom.querySelector('.probe')?.getAttribute('data-probe')).toBe('two')
    editor.destroy()
  })
})

describe('block attributes are patched, not rewritten', () => {
  it('leaves an unchanged attribute alone when something else is edited', () => {
    const code = testSchema.node(
      'codeBlock',
      { language: 'typescript' },
      Fragment.of(testSchema.text('const a = 1')),
    )
    const { editor, view } = mount(doc(p('edit me'), code))
    const pre = view.dom.querySelector('pre') as HTMLElement
    expect(pre.getAttribute('data-language')).toBe('typescript')

    const writes: string[] = []
    const real = pre.setAttribute.bind(pre)
    pre.setAttribute = (name: string, value: string) => {
      writes.push(`${name}=${value}`)
      real(name, value)
    }

    // A decoration layer changing is what forces the whole document through
    // the renderer again. An unchanged block is otherwise skipped outright,
    // so without this the test would pass against the bug. In the editor this
    // happens on a timer: the writing checks re-run 200ms after every edit.
    view.setDecorationLayer('probe', (node) =>
      node.isTextblock ? [{ from: 0, to: 1, className: 'probe' }] : null,
    )
    editor.dispatch(
      editor.state.tr.step(new ReplaceInlineStep([0], 0, 0, Fragment.of(testSchema.text('X')))),
    )
    view.setDecorationLayer('probe', (node) =>
      node.isTextblock ? [{ from: 0, to: 2, className: 'probe' }] : null,
    )

    // Assigning an attribute the value it already has is still a write: it
    // invalidates style, it shows as a mutation to anything observing, and on
    // an `<iframe>` assigning `src` reloads the frame, so an embedded video
    // restarted whenever anything re-rendered the document.
    expect(writes).toEqual([])
    expect(pre.getAttribute('data-language')).toBe('typescript')
    editor.destroy()
  })

  it('still writes an attribute that actually changed', () => {
    const code = testSchema.node(
      'codeBlock',
      { language: 'typescript' },
      Fragment.of(testSchema.text('const a = 1')),
    )
    const { editor, view } = mount(doc(code))
    const pre = view.dom.querySelector('pre') as HTMLElement

    editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep([0], { language: 'python' })))

    expect(view.dom.querySelector('pre')?.getAttribute('data-language')).toBe('python')
    expect(pre.getAttribute('data-language')).toBe('python')
    editor.destroy()
  })
})
