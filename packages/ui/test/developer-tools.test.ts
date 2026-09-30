// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Fragment,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorUI } from '../src/editor-ui'
import { insertAtCaret, openEquationDialog } from '../src/equation-dialog'
import { installKeyPreset } from '../src/key-presets'
import type { Menu, MenuItem } from '../src/menubar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

const p = (text: string): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])

function mount(...blocks: EditorNode[]): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({
    schema,
    element: host,
    doc: schema.node('doc', undefined, Fragment.from(blocks)),
  })
}

function caretAt(editor: Editor, offset: number, to = offset): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], offset), pos([0], to))))
}

/** A key pressed on the writing surface; true when something took it. */
function press(editor: Editor, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  editor.view?.dom.dispatchEvent(event)
  return event.defaultPrevented
}

function item(menus: readonly Menu[], name: string): MenuItem {
  const walk = (items: readonly MenuItem[]): MenuItem | undefined => {
    for (const entry of items) {
      if (entry.name === name) return entry
      const found = entry.items ? walk(entry.items) : undefined
      if (found) return found
    }
    return undefined
  }
  for (const menu of menus) {
    const found = walk(menu.items)
    if (found) return found
  }
  throw new Error(`no menu item ${name}`)
}

describe('Vim keys', () => {
  it('starts in normal mode, where keys edit rather than type', () => {
    const editor = mount(p('abc'))
    caretAt(editor, 0)
    const modes: (string | null)[] = []
    const remove = installKeyPreset(editor, 'vim', { onMode: (mode) => modes.push(mode) })

    expect(modes).toEqual(['normal'])
    expect(press(editor, 'x')).toBe(true)
    expect(editor.state.doc.textContent).toBe('bc')
    // A count repeats it.
    expect(press(editor, '2')).toBe(true)
    press(editor, 'x')
    expect(editor.state.doc.textContent).toBe('')
    press(editor, 'u')
    expect(editor.state.doc.textContent).toBe('bc')
    remove()
    expect(modes.at(-1)).toBeNull()
    editor.destroy()
  })

  it('types in insert mode, until Escape', () => {
    const editor = mount(p('abc'))
    caretAt(editor, 1)
    const modes: (string | null)[] = []
    const remove = installKeyPreset(editor, 'vim', { onMode: (mode) => modes.push(mode) })
    press(editor, 'i')
    expect(modes.at(-1)).toBe('insert')
    expect(editor.view?.dom.dataset.trevixalKeyMode).toBe('insert')
    // The key goes on to the editor, which types it.
    expect(press(editor, 'z')).toBe(false)
    expect(press(editor, 'Escape')).toBe(true)
    expect(modes.at(-1)).toBe('normal')
    remove()
    editor.destroy()
  })
})

describe('Emacs keys', () => {
  it('kills the selection with Ctrl+W and yanks it back with Ctrl+Y', () => {
    const editor = mount(p('hello world'))
    caretAt(editor, 5, 11)
    const remove = installKeyPreset(editor, 'emacs')
    expect(press(editor, 'w', { ctrlKey: true })).toBe(true)
    expect(editor.state.doc.textContent).toBe('hello')
    press(editor, 'y', { ctrlKey: true })
    expect(editor.state.doc.textContent).toBe('hello world')
    // Ctrl+D deletes forward.
    caretAt(editor, 0)
    press(editor, 'd', { ctrlKey: true })
    expect(editor.state.doc.textContent).toBe('ello world')
    remove()
    // Standard again: the chord is left to the browser and the shortcut manager.
    expect(press(editor, 'd', { ctrlKey: true })).toBe(false)
    editor.destroy()
  })

  it('installs nothing for the standard keys', () => {
    const editor = mount(p('abc'))
    const onMode = vi.fn()
    installKeyPreset(editor, 'standard', { onMode })()
    expect(onMode).toHaveBeenCalledWith(null)
    expect(press(editor, 'x')).toBe(false)
    editor.destroy()
  })
})

describe('the equation dialog', () => {
  it('puts a structure in at the caret and leaves the caret in its first hole', () => {
    const area = document.createElement('textarea')
    area.value = 'x = '
    area.setSelectionRange(4, 4)
    insertAtCaret(area, '\\frac{}{}')
    expect(area.value).toBe('x = \\frac{}{}')
    expect(area.selectionStart).toBe(10)
  })

  it('writes from the palette, previews, and says whether to number it', async () => {
    const render = vi.fn((latex: string) => `<math>${latex}</math>`)
    const pending = openEquationDialog({
      document,
      title: 'Insert display equation',
      render,
      display: true,
      numbered: false,
    })
    const dialog = document.querySelector('.trevixal-equation') as HTMLElement
    const area = dialog.querySelector('textarea') as HTMLTextAreaElement
    ;(dialog.querySelector('[aria-label="Square root"]') as HTMLButtonElement).click()
    expect(area.value).toBe('\\sqrt{}')
    expect(render).toHaveBeenLastCalledWith('\\sqrt{}', true)
    area.value = '\\sqrt{2}'
    ;(dialog.querySelector('[name="numbered"]') as HTMLInputElement).checked = true
    dialog.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(await pending).toEqual({ latex: '\\sqrt{2}', numbered: true })
  })
})

describe('front matter', () => {
  it('edits the YAML the document keeps for Markdown', async () => {
    const editor = mount(p('Body'))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ui = createEditorUI(editor, { container })
    item(ui.menus, 'frontMatter').run?.(editor)
    const area = document.querySelector<HTMLTextAreaElement>('.trevixal-dialog [name="yaml"]')
    expect(area).not.toBeNull()
    if (area) area.value = 'title: Notes\n'
    document
      .querySelector('.trevixal-dialog__form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(editor.state.doc.attrs.frontMatter).toBe('title: Notes')
    ui.destroy()
    editor.destroy()
  })
})
