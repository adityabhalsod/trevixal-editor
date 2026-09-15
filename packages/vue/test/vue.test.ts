import {
  type Editor,
  type EditorSnapshot,
  Schema,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { type App, type ShallowRef, createApp, defineComponent, h } from 'vue'
import { EditorContent, useEditor, useEditorSnapshot } from '../src/index'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let host: HTMLElement
let app: App | null = null
let captured: ShallowRef<Editor | null> | null = null
let snapshotRef: ShallowRef<EditorSnapshot | null> | null = null

const TestApp = defineComponent({
  setup() {
    const editor = useEditor({ schema })
    captured = editor
    snapshotRef = useEditorSnapshot(editor)
    return () => h(EditorContent, { editor: editor.value })
  },
})

beforeEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  captured = null
  snapshotRef = null
})

describe('@trevixal/vue', () => {
  it('mounts the contenteditable surface', () => {
    app = createApp(TestApp)
    app.mount(host)
    expect(host.querySelector('.trevixal-content')).not.toBeNull()
    expect(captured?.value?.view).not.toBeNull()
  })

  it('typing updates the DOM directly', () => {
    app = createApp(TestApp)
    app.mount(host)
    captured?.value?.commands.insertText('bonjour')
    expect(host.querySelector('.trevixal-content')?.textContent).toBe('bonjour')
  })

  it('exposes a live snapshot shallow ref', () => {
    app = createApp(TestApp)
    app.mount(host)
    expect(snapshotRef?.value?.blockType).toBe('paragraph')
    captured?.value?.commands.setHeading(3)
    expect(snapshotRef?.value?.blockType).toBe('heading')
    expect(snapshotRef?.value?.blockAttrs).toMatchObject({ level: 3 })
  })

  it('unmount destroys the editor and removes the view', () => {
    app = createApp(TestApp)
    app.mount(host)
    const editor = captured?.value as Editor
    app.unmount()
    app = null
    expect(editor.isDestroyed).toBe(true)
    expect(host.querySelector('.trevixal-content')).toBeNull()
  })
})
