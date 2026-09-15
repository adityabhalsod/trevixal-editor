// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { type Editor, createEditor } from '../src/editor/editor'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import { SetNodeAttrsStep } from '../src/state/steps/attrs-step'
import { pathOfElement } from '../src/view/dom-point'
import type { EditorView, NodeViewFactory } from '../src/view/editor-view'

const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    counter: {
      group: 'block',
      atom: true,
      attrs: { count: { default: 0 } },
      toHTML: (node) => ({
        tag: 'div',
        attrs: { 'data-counter': String(node.attrs.count) },
      }),
    },
  },
  marks: defaultMarks(),
})

let destroyed = 0

/** The "interactive counter block" demo, in plain DOM. */
const counterView: NodeViewFactory = (node, editor) => {
  const dom = window.document.createElement('div')
  dom.className = 'counter-widget'
  const button = window.document.createElement('button')
  const render = (count: unknown): void => {
    button.textContent = `count: ${count}`
  }
  render(node.attrs.count)
  button.addEventListener('click', () => {
    const view = editor.view as EditorView
    const path = pathOfElement(view.dom, view.renderer, dom)
    if (!path) return
    const current = editor.state.doc.content.child(path[0] as number)
    editor.dispatch(
      editor.state.tr.step(
        new SetNodeAttrsStep(path, { count: (current.attrs.count as number) + 1 }),
      ),
    )
  })
  dom.appendChild(button)
  return {
    dom,
    update(next) {
      render(next.attrs.count)
      return true
    },
    destroy() {
      destroyed++
    },
  }
}

function mount(): { editor: Editor; view: EditorView } {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const editor = createEditor({
    schema,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'counter', attrs: { count: 5 } },
      ],
    },
    element: host,
    nodeViews: { counter: counterView },
  })
  return { editor, view: editor.view as EditorView }
}

beforeEach(() => {
  window.document.body.innerHTML = ''
  destroyed = 0
})

describe('node views', () => {
  it('renders the custom widget instead of toHTML output', () => {
    const { view } = mount()
    const widget = view.dom.querySelector('.counter-widget')
    expect(widget).not.toBeNull()
    expect(widget?.querySelector('button')?.textContent).toBe('count: 5')
    expect((widget as HTMLElement).contentEditable).toBe('false')
  })

  it('widget interaction updates the document and patches in place', () => {
    const { editor, view } = mount()
    const widget = view.dom.querySelector('.counter-widget') as HTMLElement
    widget.querySelector('button')?.click()
    expect(editor.getJSON().content?.[1]).toEqual({ type: 'counter', attrs: { count: 6 } })
    // Same element instance: update() patched, no rebuild.
    expect(view.dom.querySelector('.counter-widget')).toBe(widget)
    expect(widget.querySelector('button')?.textContent).toBe('count: 6')
  })

  it('typing near the widget leaves it untouched', () => {
    const { editor, view } = mount()
    const widget = view.dom.querySelector('.counter-widget')
    editor.commands.insertText('x')
    expect(view.dom.querySelector('.counter-widget')).toBe(widget)
    expect(editor.getText()).toBe('xbefore')
  })

  it('destroy hooks fire when the widget leaves the document', () => {
    const { editor } = mount()
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(destroyed).toBe(1)
    expect(editor.getJSON().content).toEqual([{ type: 'paragraph' }])
  })

  it('editor destroy tears down remaining views', () => {
    const { editor } = mount()
    editor.destroy()
    expect(destroyed).toBe(1)
    expect(editor.view).toBeNull()
  })
})
