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

test('formats the paragraph from keys AltGr cannot take, and the menus print them', () => {
  mounted = mountFullEditor({
    element: host,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Title' }] }],
    } as never,
  })
  const surface = host.querySelector<HTMLElement>('#editor .trevixal-content')
  const press = (init: KeyboardEventInit): void => {
    surface?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    )
  }
  const block = () => mounted?.editor.state.doc.child(0)
  // Shift turns the 2 key into `@`; the chord is still Ctrl+Shift+2.
  press({ key: '@', code: 'Digit2', ctrlKey: true, shiftKey: true })
  expect(block()?.type.name).toBe('heading')
  expect(block()?.attrs.level).toBe(2)
  // Google Docs' key still works where the keyboard lets it through…
  press({ key: '0', code: 'Digit0', ctrlKey: true, altKey: true })
  expect(block()?.type.name).toBe('paragraph')
  // …and where Ctrl+Alt+2 is AltGr and types `@`, it goes on typing it.
  press({ key: '@', code: 'Digit2', ctrlKey: true, altKey: true })
  expect(block()?.type.name).toBe('paragraph')
  press({ key: '*', code: 'Digit8', ctrlKey: true, shiftKey: true })
  expect(block()?.type.name).toBe('bulletList')

  const printed = (name: string): string | null | undefined =>
    host.querySelector(`[data-trevixal-item="${name}"] .trevixal-menu__shortcut`)?.textContent
  expect(printed('styleHeading2')).toBe('Ctrl+Shift+2, Ctrl+Alt+2')
  expect(printed('listBullet')).toBe('Ctrl+Shift+8')
  expect(printed('aligncenter')).toBe('Ctrl+Shift+E')
  expect(printed('insertEmoji')).toBe('Ctrl+Shift+Space')
  // The toolbar's tooltips print what the manager binds too, not their own defaults.
  const link = host.querySelector<HTMLElement>(
    '#chrome .trevixal-toolbar [data-trevixal-item="link"]',
  )
  expect(link?.title).toBe('Insert link (Ctrl+Shift+K)')
})

test('opens find and replace from Ctrl+F before any menu has built the bar', () => {
  mounted = mountFullEditor({ element: host })
  host
    .querySelector<HTMLElement>('#editor .trevixal-content')
    ?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
    )
  const bar = host.querySelector<HTMLElement>('.trevixal-findbar')
  expect(bar).not.toBeNull()
  expect(bar?.hidden).toBe(false)
})

test('opens the emoji picker from Ctrl+Shift+Space', () => {
  mounted = mountFullEditor({ element: host })
  host.querySelector<HTMLElement>('#editor .trevixal-content')?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(document.querySelector('.trevixal-charpicker--emoji')).not.toBeNull()
})

test('applies Customize toolbar in place, and a fresh mount keeps it', () => {
  mounted = mountFullEditor({ element: host })
  const bulletList = host.querySelector('[data-trevixal-item="bulletList"]')
  host.querySelector<HTMLButtonElement>('[data-trevixal-item="customizeToolbar"]')?.click()
  const lists = document.querySelector<HTMLInputElement>(
    '.trevixal-customize__item[data-trevixal-group="lists"] input',
  )
  if (!lists) throw new Error('no Lists row in the dialog')
  lists.checked = false
  lists.dispatchEvent(new Event('change'))
  document
    .querySelector<HTMLButtonElement>(
      '.trevixal-dialog--customize .trevixal-dialog__button--primary',
    )
    ?.click()
  // Gone from this very bar: nothing was reloaded to get there.
  expect(mounted.ui.toolbar.getGroupOrder()).not.toContain('lists')
  expect(bulletList?.isConnected).toBe(false)

  mounted.destroy()
  mounted = mountFullEditor({ element: host })
  expect(mounted.ui.toolbar.getGroupOrder()).not.toContain('lists')
  // Hidden, not unbuilt, so the dialog can bring it back the same way.
  expect(mounted.ui.toolbar.groups.map((group) => group.name)).toContain('lists')
})
