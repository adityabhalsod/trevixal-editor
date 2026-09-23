// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openCharacterPicker, openDialog } from '../src/dialog'
import { createEditorUI } from '../src/editor-ui'
import { createShortcutManager } from '../src/shortcuts'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

function mountEditor() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({ schema, element: host })
}

/** Fill the open dialog's fields and submit it; resolves once the handler ran. */
async function submitDialog(values: Record<string, string | boolean>): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('.trevixal-dialog__form')
  expect(form).not.toBeNull()
  for (const [name, value] of Object.entries(values)) {
    const control = form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
    expect(control, name).not.toBeNull()
    if (!control) continue
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = value === true
    } else {
      control.value = String(value)
    }
    control.dispatchEvent(new Event('change', { bubbles: true }))
  }
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await Promise.resolve()
  await Promise.resolve()
}

const key = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })

describe('shortcut manager labels', () => {
  it('fires an action from either of its two bindings and prints both', () => {
    const editor = mountEditor()
    const palette = vi.fn()
    const manager = createShortcutManager(editor, {
      isMac: false,
      actions: [
        {
          name: 'commandPalette',
          label: 'Command palette',
          keys: 'Mod-k',
          alternateKeys: 'Mod-Shift-p',
          run: palette,
        },
        { name: 'insertLink', label: 'Link', keys: 'Mod-Shift-k', run: () => undefined },
        { name: 'unbound', label: 'Nothing', keys: null, run: () => undefined },
      ],
    })
    expect(manager.handle(key({ key: 'k', ctrlKey: true }))).toBe(true)
    expect(manager.handle(key({ key: 'P', ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(palette).toHaveBeenCalledTimes(2)
    expect(manager.labels()).toEqual({
      commandPalette: 'Ctrl+K, Ctrl+Shift+P',
      insertLink: 'Ctrl+Shift+K',
      unbound: null,
    })
    // Unbinding silences both keys; rebinding replaces only the primary.
    manager.rebind('commandPalette', null)
    expect(manager.handle(key({ key: 'P', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(manager.labels().commandPalette).toBeNull()
    manager.rebind('commandPalette', 'Mod-Shift-o')
    expect(manager.labels().commandPalette).toBe('Ctrl+Shift+O, Ctrl+Shift+P')
    // Taking a key that is another action's alternate unbinds that action.
    manager.rebind('insertLink', 'Mod-Shift-p')
    expect(manager.labels().commandPalette).toBeNull()
    manager.destroy()
    editor.destroy()
  })

  it('makes the manager the only source of the menus’ printed shortcuts', () => {
    const editor = mountEditor()
    const manager = createShortcutManager(editor, {
      isMac: false,
      actions: [
        { name: 'commandPalette', label: 'Palette', keys: 'Mod-k', run: () => undefined },
        { name: 'insertLink', label: 'Link', keys: 'Mod-Shift-k', run: () => undefined },
        { name: 'bold', label: 'Bold', keys: 'Mod-b', run: () => undefined },
      ],
    })
    const ui = createEditorUI(editor, {
      container,
      shortcutLabels: manager.labels(),
      viewActions: { openCommandPalette: () => undefined },
    })
    const printed = (name: string): string | null => {
      const slot = ui.element.querySelector<HTMLElement>(
        `[data-trevixal-item="${name}"] .trevixal-menu__shortcut`,
      )
      return slot && !slot.hidden ? slot.textContent : null
    }
    // The menu's own "Ctrl+K" beside Link is replaced by what really fires.
    expect(printed('insertLink')).toBe('Ctrl+Shift+K')
    expect(printed('commandPalette')).toBe('Ctrl+K')
    expect(printed('bold')).toBe('Ctrl+B')
    // An item the manager knows nothing about prints no shortcut at all.
    expect(printed('italic')).toBeNull()
    expect(printed('print')).toBeNull()

    manager.rebind('bold', 'Mod-Shift-b')
    ui.setShortcutLabels(manager.labels())
    expect(printed('bold')).toBe('Ctrl+Shift+B')
    manager.rebind('bold', null)
    ui.setShortcutLabels(manager.labels())
    expect(printed('bold')).toBeNull()

    // Without labels the menus fall back to their declared defaults.
    ui.setShortcutLabels(undefined)
    expect(printed('insertLink')).toBe('Ctrl+K')
    ui.destroy()
    manager.destroy()
    editor.destroy()
  })

  it('prints the shortcut on every copy of an item that appears in two menus', () => {
    const editor = mountEditor()
    const manager = createShortcutManager(editor, {
      isMac: false,
      actions: [
        { name: 'findReplace', label: 'Find', keys: 'Mod-f', run: () => undefined },
        { name: 'tableOfContents', label: 'Contents', keys: 'Mod-Shift-t', run: () => undefined },
      ],
    })
    const ui = createEditorUI(editor, {
      container,
      shortcutLabels: manager.labels(),
      viewActions: { toggleTableOfContents: () => undefined },
    })
    /** Every slot printed for `name`, across all the menus that offer it. */
    const printedEverywhere = (name: string): string[] =>
      [
        ...ui.element.querySelectorAll<HTMLElement>(
          `[data-trevixal-item="${name}"] .trevixal-menu__shortcut`,
        ),
      ].map((slot) => (slot.hidden ? '' : (slot.textContent ?? '')))

    // findReplace is in both Edit and Tools; both copies must say Ctrl+F, not
    // just whichever menu was rendered last.
    expect(printedEverywhere('findReplace')).toEqual(['Ctrl+F', 'Ctrl+F'])
    // tableOfContents is in both Tools and View.
    expect(printedEverywhere('tableOfContents')).toEqual(['Ctrl+Shift+T', 'Ctrl+Shift+T'])

    manager.rebind('findReplace', 'Mod-Shift-f')
    ui.setShortcutLabels(manager.labels())
    expect(printedEverywhere('findReplace')).toEqual(['Ctrl+Shift+F', 'Ctrl+Shift+F'])
    ui.destroy()
    manager.destroy()
    editor.destroy()
  })
})

describe('link dialog', () => {
  it('applies target=_blank with the protective rel from the checkbox', async () => {
    const editor = mountEditor()
    const ui = createEditorUI(editor, { container })
    editor.commands.insertText('open me')
    editor.commands.selectAll()
    ui.openLinkDialog()
    await submitDialog({ kind: 'web', href: 'https://example.com', newTab: true })
    expect(editor.getHTML()).toContain('target="_blank"')
    expect(editor.getHTML()).toContain('rel="noopener noreferrer"')
    // Reopening prefills the dialog from the existing link.
    ui.openLinkDialog()
    const href = document.querySelector<HTMLInputElement>('.trevixal-dialog [name="href"]')
    const newTab = document.querySelector<HTMLInputElement>('.trevixal-dialog [name="newTab"]')
    expect(href?.value).toBe('https://example.com')
    expect(newTab?.checked).toBe(true)
    await submitDialog({ newTab: false })
    expect(editor.getHTML()).not.toContain('target="_blank"')
    ui.destroy()
    editor.destroy()
  })

  it('links to a heading in the document and to an email address', async () => {
    const editor = mountEditor()
    const ui = createEditorUI(editor, { container })
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, id: 'intro' },
          content: [{ type: 'text', text: 'Intro' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'jump' }] },
      ],
    })
    editor.commands.selectAll()
    ui.openLinkDialog()
    const kind = document.querySelector<HTMLSelectElement>('.trevixal-dialog [name="kind"]')
    expect([...(kind?.options ?? [])].map((option) => option.value)).toEqual([
      'web',
      'email',
      'anchor',
    ])
    const anchor = document.querySelector<HTMLSelectElement>('.trevixal-dialog [name="anchor"]')
    expect([...(anchor?.options ?? [])].map((option) => option.textContent)).toEqual(['Intro'])
    // The URL box is hidden while a heading is chosen, so its `required`
    // must not block the submit.
    kind!.value = 'anchor'
    kind?.dispatchEvent(new Event('change', { bubbles: true }))
    const hrefRow = document.querySelector<HTMLInputElement>('.trevixal-dialog [name="href"]')
    expect(hrefRow?.disabled).toBe(true)
    await submitDialog({ kind: 'anchor', anchor: 'intro' })
    expect(editor.getHTML()).toContain('href="#intro"')

    ui.openLinkDialog()
    await submitDialog({ kind: 'email', email: 'ada@example.com' })
    expect(editor.getHTML()).toContain('href="mailto:ada@example.com"')

    // A bad address is refused rather than becoming a dead link.
    ui.openLinkDialog()
    await submitDialog({ kind: 'email', email: 'not an address' })
    expect(editor.getHTML()).toContain('href="mailto:ada@example.com"')
    ui.destroy()
    editor.destroy()
  })
})

describe('dialog conditional fields', () => {
  it('shows a field only while its controller holds a listed value', async () => {
    const pending = openDialog({
      document,
      title: 'Kinds',
      fields: [
        {
          name: 'kind',
          label: 'Kind',
          type: 'select',
          value: 'a',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
        {
          name: 'onlyB',
          label: 'B only',
          required: true,
          visibleWhen: { field: 'kind', values: ['b'] },
        },
      ],
    })
    const only = document.querySelector<HTMLInputElement>('[name="onlyB"]')
    expect(only?.disabled).toBe(true)
    expect(only?.closest<HTMLElement>('.trevixal-dialog__field')?.hidden).toBe(true)
    const kind = document.querySelector<HTMLSelectElement>('[name="kind"]')
    kind!.value = 'b'
    kind?.dispatchEvent(new Event('change', { bubbles: true }))
    expect(only?.disabled).toBe(false)
    expect(only?.closest<HTMLElement>('.trevixal-dialog__field')?.hidden).toBe(false)
    kind!.value = 'a'
    kind?.dispatchEvent(new Event('change', { bubbles: true }))
    document
      .querySelector<HTMLFormElement>('.trevixal-dialog__form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(await pending).toEqual({ kind: 'a', onlyB: '' })
  })

  it('labels picker entries for emoji shortcodes', async () => {
    const pending = openCharacterPicker(document, [{ char: '😄', label: 'smile' }], {
      title: 'Emoji',
    })
    expect(document.querySelector('.trevixal-dialog__title')?.textContent).toBe('Emoji')
    const item = document.querySelector<HTMLButtonElement>('[data-trevixal-char="smile"]')
    expect(item?.getAttribute('aria-label')).toBe('smile')
    item?.click()
    expect(await pending).toBe('😄')
  })
})

describe('host hooks in the menus', () => {
  it('offers the security and split-editor entries only when wired', () => {
    const editor = mountEditor()
    const bare = createEditorUI(editor, { container })
    for (const name of [
      'protectDocument',
      'documentRestrictions',
      'downloadEncrypted',
      'splitEditor',
      'writingGrammar',
    ]) {
      expect(bare.element.querySelector(`[data-trevixal-item="${name}"]`), name).toBeNull()
    }
    bare.destroy()

    const protect = vi.fn()
    const restrict = vi.fn()
    const download = vi.fn()
    const enabled: Record<string, boolean> = { grammar: true, passive: false }
    // The real host toggle mutates the state the reporter reads back, so the
    // click -> action -> reporter -> aria-checked round trip is exercised whole.
    const toggleCheck = vi.fn((kind: string) => {
      enabled[kind] = enabled[kind] !== true
    })
    const ui = createEditorUI(editor, {
      container,
      fileActions: {
        protectDocument: protect,
        documentRestrictions: restrict,
        downloadAs: download,
      },
      viewActions: {
        toggleSplitEditor: () => undefined,
        toggleWritingCheck: toggleCheck,
        isWritingCheckEnabled: (kind) => enabled[kind] === true,
      },
    })
    const item = (name: string) =>
      ui.element.querySelector<HTMLButtonElement>(`[data-trevixal-item="${name}"]`)
    item('protectDocument')?.click()
    expect(protect).toHaveBeenCalledOnce()
    item('documentRestrictions')?.click()
    expect(restrict).toHaveBeenCalledOnce()
    item('downloadEncrypted')?.click()
    expect(download).toHaveBeenCalledWith('encrypted')
    expect(item('splitEditor')).not.toBeNull()

    // Toggling chrome emits no transaction, so the click itself refreshes the
    // checkmark from the state reporter rather than waiting for one.
    expect(item('writingGrammar')?.getAttribute('aria-checked')).toBe('true')
    expect(item('writingPassive')?.getAttribute('aria-checked')).toBe('false')
    item('writingPassive')?.click()
    expect(toggleCheck).toHaveBeenCalledWith('passive')
    expect(item('writingPassive')?.getAttribute('aria-checked')).toBe('true')
    item('writingPassive')?.click()
    expect(item('writingPassive')?.getAttribute('aria-checked')).toBe('false')
    ui.destroy()
    editor.destroy()
  })

  it('prints the document alone from Print…, never the page around it', () => {
    const editor = mountEditor()
    editor.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only the document' }] }],
    })
    const pagePrint = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const print = (ui: { element: HTMLElement }): void =>
      ui.element.querySelector<HTMLButtonElement>('[data-trevixal-item="print"]')?.click()

    // A host with no print of its own still gets the document, in a frame.
    const bare = createEditorUI(editor, { container })
    print(bare)
    const frame = document.querySelector<HTMLIFrameElement>('.trevixal-print-frame')
    expect(frame?.srcdoc ?? '').toContain('Only the document')
    bare.destroy()

    // A host's print wins: the assembled editor's is the one Ctrl+P and
    // PDF (via print) already run, and it asks the restrictions first.
    const exportPDF = vi.fn()
    const ui = createEditorUI(editor, { container, fileActions: { exportPDF } })
    print(ui)
    expect(exportPDF).toHaveBeenCalledOnce()
    expect(pagePrint).not.toHaveBeenCalled()
    pagePrint.mockRestore()
    ui.destroy()
    editor.destroy()
  })
})
