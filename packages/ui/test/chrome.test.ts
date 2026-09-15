// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTableGridControl } from '../src/controls'
import { openCharacterPicker, openDialog } from '../src/dialog'
import { createEditorUI } from '../src/editor-ui'
import { createMenubar } from '../src/menubar'
import { createStatusBar } from '../src/status-bar'
import { createToolbar } from '../src/toolbar'

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

describe('menubar', () => {
  it('renders the ARIA menubar pattern with the stock menus', () => {
    const editor = createEditor({ schema })
    const menubar = createMenubar(editor, container)
    expect(menubar.element.getAttribute('role')).toBe('menubar')
    const labels = [...menubar.element.querySelectorAll('.trevixal-menubar__trigger')].map(
      (trigger) => trigger.textContent,
    )
    expect(labels).toEqual(['File', 'Edit', 'Insert', 'Format', 'Tools', 'Table', 'View', 'Help'])
    menubar.destroy()
    expect(container.querySelector('.trevixal-menubar')).toBeNull()
  })

  it('opens a menu, runs an item and closes again', () => {
    const editor = mountEditor()
    const menubar = createMenubar(editor, container)
    editor.commands.insertText('hello')
    editor.commands.selectAll()

    const trigger = menubar.element.querySelector<HTMLButtonElement>(
      '[data-trevixal-menu="format"]',
    )
    const panel = trigger?.parentElement?.querySelector<HTMLElement>('.trevixal-dropdown__panel')
    expect(panel?.hidden).toBe(true)
    trigger?.click()
    expect(panel?.hidden).toBe(false)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')

    const bold = panel?.querySelector<HTMLButtonElement>('[data-trevixal-item="bold"]')
    bold?.click()
    expect(editor.isActive('bold')).toBe(true)
    expect(panel?.hidden).toBe(true) // acting closes the menu
    editor.destroy()
  })

  it('reflects enabled state and disables items with no action', () => {
    const editor = createEditor({ schema })
    const menubar = createMenubar(editor, container)
    const undo = menubar.element.querySelector<HTMLButtonElement>('[data-trevixal-item="undo"]')
    expect(undo?.disabled).toBe(true)
    editor.commands.insertText('x')
    expect(undo?.disabled).toBe(false)

    // "Insert table" has no wired command here, so it must not look available.
    const table = menubar.element.querySelector<HTMLButtonElement>(
      '[data-trevixal-item="insertTable"]',
    )
    expect(table?.disabled).toBe(true)
  })

  it('shows keyboard shortcuts and separators', () => {
    const editor = createEditor({ schema })
    const menubar = createMenubar(editor, container)
    const bold = menubar.element.querySelector('[data-trevixal-item="bold"]')
    expect(bold?.querySelector('.trevixal-menu__shortcut')?.textContent).toBe('Ctrl+B')
    expect(menubar.element.querySelectorAll('[role="separator"]').length).toBeGreaterThan(0)
  })

  it('closes on Escape and on an outside click', () => {
    const editor = createEditor({ schema })
    const menubar = createMenubar(editor, container)
    const trigger = menubar.element.querySelector<HTMLButtonElement>('[data-trevixal-menu="edit"]')
    const panel = trigger?.parentElement?.querySelector<HTMLElement>('.trevixal-dropdown__panel')

    trigger?.click()
    expect(panel?.hidden).toBe(false)
    trigger?.parentElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(panel?.hidden).toBe(true)

    trigger?.click()
    expect(panel?.hidden).toBe(false)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(panel?.hidden).toBe(true)
  })

  it('opens only one menu at a time', () => {
    const editor = createEditor({ schema })
    const menubar = createMenubar(editor, container)
    const panels = [...menubar.element.querySelectorAll<HTMLElement>('.trevixal-dropdown__panel')]
    const triggers = [
      ...menubar.element.querySelectorAll<HTMLButtonElement>('.trevixal-menubar__trigger'),
    ]
    triggers[0]?.click()
    triggers[1]?.click()
    expect(panels.filter((panel) => !panel.hidden)).toHaveLength(1)
  })
})

describe('toolbar controls', () => {
  it('reflects and applies the block format select', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    const select = toolbar.element.querySelector<HTMLElement>('[data-trevixal-item="blockFormat"]')
    const label = select?.querySelector('.trevixal-select__label')
    expect(label?.textContent).toBe('Paragraph')

    select?.querySelector<HTMLButtonElement>('.trevixal-dropdown__trigger')?.click()
    select?.querySelector<HTMLButtonElement>('[data-value="heading:2"]')?.click()
    expect(editor.getHTML()).toContain('<h2')
    expect(label?.textContent).toBe('Heading 2')
    editor.destroy()
  })

  it('applies font family and size, and shows the current value', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    editor.commands.insertText('styled')
    editor.commands.selectAll()

    const size = toolbar.element.querySelector<HTMLElement>('[data-trevixal-item="fontSize"]')
    size?.querySelector<HTMLButtonElement>('[data-value="18pt"]')?.click()
    expect(editor.getHTML()).toContain('font-size: 18pt')
    expect(size?.querySelector('.trevixal-select__label')?.textContent).toBe('18pt')

    const font = toolbar.element.querySelector<HTMLElement>('[data-trevixal-item="fontFamily"]')
    font?.querySelector<HTMLButtonElement>('button[data-value]')?.click()
    expect(editor.getHTML()).toContain('font-family')
    editor.destroy()
  })

  it('applies a color swatch and clears it again', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    editor.commands.insertText('colored')
    editor.commands.selectAll()

    const control = toolbar.element.querySelector<HTMLElement>('[data-trevixal-item="textColor"]')
    control?.querySelector<HTMLButtonElement>('[data-color="#dc2626"]')?.click()
    expect(editor.getHTML()).toContain('color: #dc2626')
    const indicator = control?.querySelector<HTMLElement>('.trevixal-color__indicator')
    expect(indicator?.style.backgroundColor).toBeTruthy()

    control?.querySelector<HTMLButtonElement>('.trevixal-color__clear')?.click()
    expect(editor.getHTML()).not.toContain('color: #dc2626')
    editor.destroy()
  })

  it('offers a hover-sized table grid', () => {
    const picked: [number, number][] = []
    const control = createTableGridControl({
      document,
      onSelect: (rows, cols) => picked.push([rows, cols]),
    })
    container.appendChild(control.element)
    control.element.querySelector<HTMLButtonElement>('.trevixal-dropdown__trigger')?.click()
    const cell = control.element.querySelector<HTMLButtonElement>('[data-row="3"][data-col="4"]')
    cell?.dispatchEvent(new MouseEvent('mouseenter'))
    expect(control.element.querySelector('.trevixal-tablegrid__readout')?.textContent).toBe('3 × 4')
    expect(control.element.querySelectorAll('.trevixal-tablegrid__cell--on')).toHaveLength(12)
    cell?.click()
    expect(picked).toEqual([[3, 4]])
    control.destroy()
  })

  it('applies alignment and indent from the toolbar', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    editor.commands.insertText('aligned')
    const center = toolbar.element.querySelector<HTMLButtonElement>(
      '[data-trevixal-item="align-center"]',
    )
    center?.click()
    expect(editor.getHTML()).toContain('text-align: center')
    expect(center?.getAttribute('aria-pressed')).toBe('true')

    const outdent = toolbar.element.querySelector<HTMLButtonElement>(
      '[data-trevixal-item="outdent"]',
    )
    expect(outdent?.disabled).toBe(true)
    toolbar.element.querySelector<HTMLButtonElement>('[data-trevixal-item="indent"]')?.click()
    expect(editor.getHTML()).toContain('margin-left: 2.5rem')
    expect(outdent?.disabled).toBe(false)
    editor.destroy()
  })

  it('groups controls and renders icons', () => {
    const editor = createEditor({ schema })
    const toolbar = createToolbar(editor, container)
    const groups = [...toolbar.element.querySelectorAll('.trevixal-toolbar__group')]
    expect(groups.length).toBeGreaterThan(4)
    const bold = toolbar.element.querySelector('[data-trevixal-item="bold"]')
    expect(bold?.querySelector('svg')).not.toBeNull()
    expect(bold?.getAttribute('title')).toBe('Bold (Ctrl+B)')
  })

  it('clears every mark with clear formatting', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    editor.commands.insertText('messy')
    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    editor.commands.setTextColor('#ff0000')
    expect(editor.getHTML()).toContain('<strong>')
    toolbar.element
      .querySelector<HTMLButtonElement>('[data-trevixal-item="clearFormatting"]')
      ?.click()
    expect(editor.getHTML()).toBe('<p>messy</p>')
    editor.destroy()
  })

  it('keeps the editor selection when a control is clicked', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    const bold = toolbar.element.querySelector<HTMLButtonElement>('[data-trevixal-item="bold"]')
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    bold?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    editor.destroy()
  })
})

describe('dialogs', () => {
  it('resolves with the submitted values', async () => {
    const pending = openDialog({
      document,
      title: 'Insert link',
      fields: [{ name: 'href', label: 'URL', value: 'https://example.com' }],
    })
    const form = document.querySelector<HTMLFormElement>('.trevixal-dialog__form')
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await expect(pending).resolves.toEqual({ href: 'https://example.com' })
    expect(document.querySelector('.trevixal-dialog')).toBeNull()
  })

  it('resolves null on cancel and on Escape', async () => {
    const cancelled = openDialog({ document, title: 'X', fields: [] })
    document.querySelector<HTMLButtonElement>('.trevixal-dialog__button')?.click()
    await expect(cancelled).resolves.toBeNull()

    const escaped = openDialog({ document, title: 'X', fields: [] })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(escaped).resolves.toBeNull()
  })

  it('picks a special character', async () => {
    const pending = openCharacterPicker(document)
    const button = document.querySelector<HTMLButtonElement>('.trevixal-charpicker__item')
    button?.click()
    await expect(pending).resolves.toBe('©')
  })
})

describe('status bar', () => {
  it('shows the element path and live counts', () => {
    const editor = mountEditor()
    const bar = createStatusBar(editor, container)
    expect(bar.element.querySelector('.trevixal-statusbar__counts')?.textContent).toBe(
      '0 words, 0 characters',
    )
    editor.commands.insertText('two words')
    expect(bar.element.querySelector('.trevixal-statusbar__counts')?.textContent).toBe(
      '2 words, 9 characters',
    )
    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    expect(bar.element.querySelector('.trevixal-statusbar__path')?.textContent).toBe(
      'paragraph › bold',
    )
    bar.destroy()
    editor.destroy()
  })
})

describe('createEditorUI', () => {
  it('assembles menubar, toolbar and status bar', () => {
    const editor = mountEditor()
    const ui = createEditorUI(editor, { container })
    expect(ui.menubar).not.toBeNull()
    expect(ui.statusBar).not.toBeNull()
    expect(container.querySelector('.trevixal-menubar')).not.toBeNull()
    expect(container.querySelector('.trevixal-toolbar')).not.toBeNull()
    expect(container.querySelector('.trevixal-statusbar')).not.toBeNull()
    ui.destroy()
    expect(container.querySelector('.trevixal-ui')).toBeNull()
    editor.destroy()
  })

  it('omits the chrome that is switched off', () => {
    const editor = mountEditor()
    const ui = createEditorUI(editor, { container, showMenubar: false, showStatusBar: false })
    expect(ui.menubar).toBeNull()
    expect(ui.statusBar).toBeNull()
    expect(container.querySelector('.trevixal-toolbar')).not.toBeNull()
    editor.destroy()
  })

  it('wires supplied table commands into the menu and the grid', () => {
    const editor = mountEditor()
    // A command that never applies: we assert the wiring, not the table.
    const insertTable = vi.fn(() => () => null)
    const ui = createEditorUI(editor, {
      container,
      // biome-ignore lint/suspicious/noExplicitAny: exercising the contract shape
      tableCommands: { insertTable } as any,
    })
    const menuItem = ui.element.querySelector<HTMLButtonElement>(
      '[data-trevixal-item="insertTable"]',
    )
    expect(menuItem?.disabled).toBe(false)
    menuItem?.click()
    expect(insertTable).toHaveBeenCalledWith(3, 3)

    const grid = ui.element.querySelector<HTMLElement>('[data-trevixal-item="table"]')
    grid?.querySelector<HTMLButtonElement>('[data-row="2"][data-col="2"]')?.click()
    expect(insertTable).toHaveBeenLastCalledWith(2, 2)
    editor.destroy()
  })

  it('routes the image button to the supplied image actions', () => {
    const editor = mountEditor()
    const pickFiles = vi.fn()
    const ui = createEditorUI(editor, {
      container,
      images: { pickFiles, insertImage: vi.fn() },
    })
    ui.element.querySelector<HTMLButtonElement>('[data-trevixal-item="image"]')?.click()
    expect(pickFiles).toHaveBeenCalledOnce()
    editor.destroy()
  })

  it('applies a link through the dialog', async () => {
    const editor = mountEditor()
    const ui = createEditorUI(editor, { container })
    editor.commands.insertText('link me')
    editor.commands.selectAll()
    ui.element.querySelector<HTMLButtonElement>('[data-trevixal-item="link"]')?.click()

    const input = document.querySelector<HTMLInputElement>('.trevixal-dialog input[name="href"]')
    expect(input).not.toBeNull()
    if (input) input.value = 'https://example.com'
    document
      .querySelector<HTMLFormElement>('.trevixal-dialog__form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(editor.getHTML()).toContain('href="https://example.com"')
    editor.destroy()
  })
})

describe('toolbar accessibility invariants', () => {
  it('distinguishes bullet from numbered lists', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    const bullet = toolbar.element.querySelector('[data-trevixal-item="bulletList"]')
    const ordered = toolbar.element.querySelector('[data-trevixal-item="orderedList"]')

    editor.commands.insertText('an item')
    editor.commands.toggleOrderedList()
    expect(ordered?.getAttribute('aria-pressed')).toBe('true')
    expect(bullet?.getAttribute('aria-pressed')).toBe('false')

    editor.commands.toggleBulletList()
    expect(bullet?.getAttribute('aria-pressed')).toBe('true')
    expect(ordered?.getAttribute('aria-pressed')).toBe('false')
    editor.destroy()
  })

  it('never parks the only tab stop on a disabled control', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    const tabbable = () => [...toolbar.element.querySelectorAll<HTMLElement>('[tabindex="0"]')]

    // Undo starts disabled; the tab stop must be on something usable.
    expect(tabbable()).toHaveLength(1)
    expect((tabbable()[0] as HTMLButtonElement).disabled).toBe(false)

    editor.commands.insertText('x')
    expect(tabbable()).toHaveLength(1)
    expect((tabbable()[0] as HTMLButtonElement).disabled).toBe(false)
    editor.destroy()
  })

  it('closes an open dropdown when another one opens', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container)
    const triggers = [
      ...toolbar.element.querySelectorAll<HTMLButtonElement>('.trevixal-dropdown__trigger'),
    ]
    triggers[0]?.click()
    triggers[1]?.click()
    const open = toolbar.element.querySelectorAll('.trevixal-dropdown--open')
    expect(open).toHaveLength(1)
    editor.destroy()
  })
})
