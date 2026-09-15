import { type Editor, Schema, TextSelection, defaultMarks, defaultNodes, pos } from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type App,
  type Ref,
  type ShallowRef,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from 'vue'
import { EditorContent, useEditor, useEditorSnapshot } from '../src/index'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const twoParagraphs = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'second line' }] },
  ],
}

let host: HTMLElement
let app: App | null = null
let captured: ShallowRef<Editor | null> | null = null
let editableRef: Ref<boolean>
let contentRef: Ref<typeof twoParagraphs>

function makeApp(onChange?: (change: unknown) => void) {
  return defineComponent({
    setup() {
      const editor = useEditor({ schema, content: contentRef.value, onChange })
      captured = editor
      return () => h(EditorContent, { editor: editor.value, editable: editableRef.value })
    },
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  captured = null
  editableRef = ref(true)
  contentRef = ref(twoParagraphs)
})

afterEach(() => {
  app?.unmount()
  app = null
})

describe('content stability', () => {
  it('re-rendering with the same content leaves the selection alone', async () => {
    app = createApp(makeApp())
    app.mount(host)
    const editor = captured?.value as Editor
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    const before = editor.state.selection
    contentRef.value = { ...twoParagraphs }
    await nextTick()
    expect(captured?.value).toBe(editor) // create-once: never re-instantiated
    expect(editor.state.selection.eq(before)).toBe(true)
    expect(editor.getText()).toContain('second line')
  })
})

describe('EditorContent editable prop', () => {
  it('honours editable=false at mount', () => {
    editableRef.value = false
    app = createApp(makeApp())
    app.mount(host)
    expect(captured?.value?.isEditable).toBe(false)
    expect(host.querySelector('.trevixal-content')?.getAttribute('aria-readonly')).toBe('true')
  })

  it('propagates a runtime editable toggle to the view', async () => {
    app = createApp(makeApp())
    app.mount(host)
    expect(captured?.value?.isEditable).toBe(true)
    editableRef.value = false
    await nextTick()
    expect(captured?.value?.isEditable).toBe(false)
    editableRef.value = true
    await nextTick()
    expect(captured?.value?.isEditable).toBe(true)
  })

  it('does not recreate the view when only editable changes', async () => {
    app = createApp(makeApp())
    app.mount(host)
    const surface = host.querySelector('.trevixal-content')
    editableRef.value = false
    await nextTick()
    expect(host.querySelector('.trevixal-content')).toBe(surface)
  })
})

describe('onChange', () => {
  it('fires exactly once per document transaction', () => {
    const onChange = vi.fn()
    app = createApp(makeApp(onChange))
    app.mount(host)
    captured?.value?.commands.insertText('abc')
    expect(onChange).toHaveBeenCalledTimes(1)
    captured?.value?.commands.insertText('d')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('does not fire for a selection-only transaction', () => {
    const onChange = vi.fn()
    app = createApp(makeApp(onChange))
    app.mount(host)
    const editor = captured?.value as Editor
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 2))))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('unmount', () => {
  it('destroys the editor and survives a post-unmount dispatch', () => {
    const onChange = vi.fn()
    app = createApp(makeApp(onChange))
    app.mount(host)
    const editor = captured?.value as Editor
    app.unmount()
    app = null
    expect(editor.isDestroyed).toBe(true)
    expect(editor.view).toBeNull()
    expect(() => editor.commands.insertText('x')).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
    expect(host.querySelector('.trevixal-content')).toBeNull()
  })

  it('stops snapshot subscriptions on unmount', () => {
    const seen: unknown[] = []
    const Component = defineComponent({
      setup() {
        const editor = useEditor({ schema })
        captured = editor
        const snapshot = useEditorSnapshot(editor)
        return () => {
          seen.push(snapshot.value)
          return h(EditorContent, { editor: editor.value })
        }
      },
    })
    app = createApp(Component)
    app.mount(host)
    const editor = captured?.value as Editor
    app.unmount()
    app = null
    const count = seen.length
    editor.commands.insertText('x')
    expect(seen.length).toBe(count)
  })
})
