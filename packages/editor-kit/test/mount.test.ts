import { afterEach, beforeEach, expect, test } from 'vitest'
import { mountFullEditor } from '../src/mount'
import type { FullEditor } from '../src/options'

let host: HTMLElement
let mounted: FullEditor | null = null

beforeEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  mounted?.destroy()
  mounted = null
})

test('mounts an editable surface with its chrome around it', () => {
  mounted = mountFullEditor({ element: host })
  expect(host.querySelector('#editor .trevixal-content')).not.toBeNull()
  expect(mounted.ui.toolbar.element.isConnected).toBe(true)
  expect(mounted.editor.getText()).toContain('Trevixal')
})

test('opens the document it was given rather than the tour', () => {
  mounted = mountFullEditor({
    element: host,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only this.' }] }],
      // `initialContent` is typed the same way: the schema is assembled at
      // mount, so a caller's document cannot be checked against it up front.
    } as never,
  })
  expect(mounted.editor.getText()).toBe('Only this.')
})

test('keeps two namespaces out of each other saved preferences', () => {
  window.localStorage.setItem('one:preferences', JSON.stringify({ theme: 'dark', preset: null }))
  mounted = mountFullEditor({ element: host, namespace: 'two' })
  expect(window.localStorage.getItem('one:preferences')).toContain('dark')
  // Nothing under `two:` claims to be `one:`.
  const strayed = Object.keys(window.localStorage).filter((key) => key.startsWith('one:'))
  expect(strayed).toEqual(['one:preferences'])
})

test('destroy empties the host and can be called twice', () => {
  const editor = mountFullEditor({ element: host })
  editor.destroy()
  expect(host.childNodes).toHaveLength(0)
  expect(editor.editor.isDestroyed).toBe(true)
  expect(() => editor.destroy()).not.toThrow()
})

test('leaves nothing behind on the document it does not own', () => {
  // The host is the editor's to empty. `document.body` is not: the command
  // palette, the dialogs and the character picker all mount beside it, and a
  // teardown that forgets one leaves a hidden overlay on the page for as long
  // as the tab is open.
  const before = document.body.childNodes.length
  const editor = mountFullEditor({ element: host })
  expect(document.body.childNodes.length).toBeGreaterThan(before)
  editor.destroy()
  expect(document.body.childNodes.length).toBe(before)
})

test('mounts again into the same host after it has been taken down', () => {
  // What a framework does on every remount, React's strict mode does it on
  // the first one. A teardown that left anything behind would show up here as
  // two surfaces, or as the second mount reading the first one's document.
  mountFullEditor({ element: host }).destroy()
  mounted = mountFullEditor({ element: host })
  expect(host.querySelectorAll('.trevixal-content')).toHaveLength(1)
})

test('reports changes to the host after its own readouts have caught up', () => {
  const seen: string[] = []
  mounted = mountFullEditor({
    element: host,
    content: { type: 'doc', content: [{ type: 'paragraph' }] } as never,
    onChange: (editor) => seen.push(editor.getText()),
  })
  mounted.editor.commands.insertText('Hi')
  expect(seen.at(-1)).toBe('Hi')
  expect(host.querySelector('#output')?.textContent).toContain('Hi')
})
