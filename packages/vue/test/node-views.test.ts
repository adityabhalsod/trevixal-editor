// @vitest-environment happy-dom
import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type App, createApp, defineComponent, h } from 'vue'
import { EditorContent, type NodeViewProps, useEditor } from '../src/index'

/**
 * The interactive counter block: a Vue component living *inside* the
 * document, whose clicks are ordinary editor transactions.
 *
 * This is the demonstration the adapter contract asks each framework for. It
 * is also the test that the component is driven by the document rather than
 * by its own state, a node view holding its own count would look identical
 * until someone pressed undo.
 */

const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    counter: {
      group: 'block',
      atom: true,
      attrs: { count: { default: 0 } },
      toHTML: (node) => ({ tag: 'div', attrs: { 'data-counter': String(node.attrs.count) } }),
    },
  },
  marks: defaultMarks(),
})

const content = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    { type: 'counter', attrs: { count: 1 } },
  ],
}

const Counter = defineComponent({
  props: {
    node: { type: Object as () => NodeViewProps['node'], required: true },
    editor: { type: Object as () => NodeViewProps['editor'], required: true },
    updateAttrs: {
      type: Function as unknown as () => NodeViewProps['updateAttrs'],
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          'data-testid': 'counter',
          onClick: () => props.updateAttrs({ count: Number(props.node.attrs.count) + 1 }),
        },
        `count: ${String(props.node.attrs.count)}`,
      )
  },
})

let host: HTMLElement
let app: App | null = null
let editorRef: ReturnType<typeof useEditor> | null = null

const TestApp = defineComponent({
  setup() {
    const editor = useEditor({ schema, content })
    editorRef = editor
    return () => h(EditorContent, { editor: editor.value, nodeViews: { counter: Counter } })
  },
})

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  editorRef = null
  app = createApp(TestApp)
  app.mount(host)
})

afterEach(() => {
  app?.unmount()
  app = null
})

const button = () => host.querySelector<HTMLButtonElement>('[data-testid="counter"]')

describe('Vue node views (interactive counter block)', () => {
  it('renders the component inside the editing surface', () => {
    expect(button()?.textContent).toBe('count: 1')
    expect(host.querySelector('.trevixal-content')?.contains(button())).toBe(true)
  })

  it('a click changes the document, and the document redraws the component', () => {
    button()?.click()
    expect(editorRef?.value?.getJSON().content?.[1]).toEqual({
      type: 'counter',
      attrs: { count: 2 },
    })
    expect(button()?.textContent).toBe('count: 2')
  })

  it('the change is an ordinary edit, so undo takes it back', () => {
    // The proof that the component holds no state of its own: undo rewinds
    // the document, and the button follows it. Clicks in quick succession
    // share an undo group, so this asserts the rewind rather than a count of
    // steps. The grouping is history's business, not the node view's.
    button()?.click()
    button()?.click()
    expect(button()?.textContent).toBe('count: 3')
    editorRef?.value?.undo()
    expect(button()?.textContent).toBe('count: 1')
  })

  it('survives typing elsewhere without being torn down', () => {
    const before = button()
    editorRef?.value?.commands.insertText('x')
    expect(button()).toBe(before)
    expect(editorRef?.value?.getText()).toContain('xhi')
  })

  it('writes to wherever the node is now, not where it was drawn', () => {
    // A node view resolves its own path at click time. Inserting a block
    // above it moves it, and a path captured at render time would then write
    // to whatever had taken its place.
    const editor = editorRef?.value
    if (!editor) throw new Error('no editor')
    editor.commands.selectAll()
    editor.commands.setParagraph()
    editor.dispatch(editor.state.tr.setSelection(editor.state.selection))
    button()?.click()
    const counter = editor.getJSON().content?.find((child) => child.type === 'counter')
    expect(counter).toEqual({ type: 'counter', attrs: { count: 2 } })
  })

  it('is taken down with the editor', () => {
    app?.unmount()
    app = null
    expect(host.querySelector('[data-testid="counter"]')).toBeNull()
  })
})
