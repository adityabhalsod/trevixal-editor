// @vitest-environment happy-dom
import { type Editor, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommandPalette } from '../src/command-palette'
import { createEditorUI } from '../src/editor-ui'
import { createMenubar } from '../src/menubar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const editors: Editor[] = []
let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

function mount(): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  editors.push(editor)
  return editor
}

const item = (name: string): HTMLElement =>
  container.querySelector(`[data-trevixal-item="${name}"]`) as HTMLElement

describe('menu entries that report a state', () => {
  it('draws a tick, not only an aria attribute', () => {
    const editor = mount()
    let on = false
    createMenubar(editor, container, {
      menus: [
        {
          name: 'test',
          label: 'Test',
          items: [
            { name: 'switch', label: 'A switch', run: () => undefined, isActive: () => on },
            { name: 'plain', label: 'A command', run: () => undefined },
          ],
        },
      ],
    })

    // `aria-checked` tells a screen reader everything and a sighted user
    // nothing; the state has to be drawn as well as announced.
    expect(item('switch').querySelector('.trevixal-menu__check')).not.toBeNull()
    expect(item('switch').getAttribute('role')).toBe('menuitemcheckbox')
    expect(item('switch').getAttribute('aria-checked')).toBe('false')

    // A plain command has no state, so it gets no tick to leave blank.
    expect(item('plain').querySelector('.trevixal-menu__check')).toBeNull()
    expect(item('plain').getAttribute('role')).toBe('menuitem')

    on = true
    container.querySelector<HTMLButtonElement>('[data-trevixal-menu="test"]')?.click()
    expect(item('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('recomputes when the menu opens, not only when the document changes', () => {
    const editor = mount()
    let panelOpen = false
    createMenubar(editor, container, {
      menus: [
        {
          name: 'view',
          label: 'View',
          items: [
            { name: 'panel', label: 'Panel', run: () => undefined, isActive: () => panelOpen },
          ],
        },
      ],
    })
    expect(item('panel').getAttribute('aria-checked')).toBe('false')

    // Chrome changing outside the document: a panel opened by a shortcut, a
    // split view closed from a button, raises no transaction at all, so a
    // menu refreshed only by editing shows the state at the last keystroke.
    panelOpen = true
    expect(item('panel').getAttribute('aria-checked')).toBe('false')

    container.querySelector<HTMLButtonElement>('[data-trevixal-menu="view"]')?.click()

    expect(item('panel').getAttribute('aria-checked')).toBe('true')
  })
})

describe('createEditorUI view state', () => {
  it('asks the host whether each View toggle is on', () => {
    const editor = mount()
    const on = new Set<string>(['focusMode', 'readOnly'])
    createEditorUI(editor, {
      container,
      viewActions: {
        toggleFocusMode: () => undefined,
        togglePageMode: () => undefined,
        toggleReadOnly: () => undefined,
        setWidth: () => undefined,
        isViewToggleOn: (toggle) => on.has(toggle),
        activeWidth: () => 'wide',
      },
    })

    expect(item('focusMode').getAttribute('aria-checked')).toBe('true')
    expect(item('readOnly').getAttribute('aria-checked')).toBe('true')
    expect(item('pageMode').getAttribute('aria-checked')).toBe('false')
    // Widths are a radio group: exactly one of the four carries the tick.
    expect(item('widthWide').getAttribute('aria-checked')).toBe('true')
    expect(item('widthNarrow').getAttribute('aria-checked')).toBe('false')
  })

  it('leaves entries as plain commands when the host answers nothing', () => {
    const editor = mount()
    createEditorUI(editor, {
      container,
      viewActions: { toggleFocusMode: () => undefined },
    })
    expect(item('focusMode').getAttribute('role')).toBe('menuitem')
    expect(item('focusMode').getAttribute('aria-checked')).toBeNull()
  })
})

describe('command palette focus handling', () => {
  it('hands focus back without scrolling the page to the caret', () => {
    const editor = mount()
    const surface = editor.view?.dom as HTMLElement
    const palette = createCommandPalette(editor, {
      commands: [{ name: 'noop', label: 'Do nothing', run: () => undefined }],
      container,
    })
    surface.focus()
    const focus = vi.spyOn(surface, 'focus')

    palette.open()
    palette.close()

    // The editor surface can be thousands of pixels tall. Restoring focus to
    // it with a plain `focus()` scrolls its caret into view, so opening the
    // palette and pressing Escape left the page somewhere else entirely.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    palette.destroy()
  })
})
