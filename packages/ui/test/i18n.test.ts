// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEditorUI } from '../src/editor-ui'
import { MENU_KEY, TOOLBAR_KEY, createTranslator, defaultMessages } from '../src/i18n'
import { createMenubar, defaultMenus } from '../src/menubar'
import { createToolbar, defaultToolbarGroups } from '../src/toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

const mountEditor = () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({ schema, element: host })
}

/** A few words of French, which is all a catalogue ever has to be. */
const FRENCH = {
  'menu.file': 'Fichier',
  'menu.format': 'Format',
  'menu.bold': 'Gras',
  'toolbar.bold': 'Gras',
  'toolbar.italic': 'Italique',
}

describe('defaultMessages', () => {
  it('has a key for every label the chrome can render', () => {
    const messages = defaultMessages()
    const missing: string[] = []
    const walk = (items: readonly { name: string; label: string; items?: readonly never[] }[]) => {
      for (const item of items) {
        if (item.label && !(`${MENU_KEY}${item.name}` in messages)) missing.push(item.name)
        if (item.items) walk(item.items)
      }
    }
    for (const menu of defaultMenus()) {
      if (!(`${MENU_KEY}${menu.name}` in messages)) missing.push(menu.name)
      walk(menu.items as never)
    }
    for (const group of defaultToolbarGroups()) {
      for (const item of group.items ?? []) {
        const entry = item as { name: string; label?: string }
        if (entry.label && !(`${TOOLBAR_KEY}${entry.name}` in messages)) missing.push(entry.name)
      }
    }
    expect(missing).toEqual([])
    // Derived rather than written out beside the menus, so it cannot drift.
    expect(Object.keys(messages).length).toBeGreaterThan(200)
  })

  it('keys by what a thing is, not by the words it uses', () => {
    // This is the whole design. A catalogue keyed on English breaks the day
    // someone rewords a label, and breaks silently. The host's translation
    // simply stops being found.
    const messages = defaultMessages()
    expect(messages['menu.insertTable']).toBe('Insert table')
    expect(messages['toolbar.bold']).toBe('Bold')
    expect(Object.keys(messages).every((key) => !key.includes(' '))).toBe(true)
  })
})

describe('createTranslator', () => {
  it('costs nothing when there is no catalogue', () => {
    const translate = createTranslator()
    expect(translate('menu.file', 'File')).toBe('File')
  })

  it('returns the fallback for a key nobody translated', () => {
    // A partial catalogue is the normal state of translation, not an error.
    const translate = createTranslator(FRENCH)
    expect(translate('menu.file', 'File')).toBe('Fichier')
    expect(translate('menu.insertTable', 'Insert table')).toBe('Insert table')
  })
})

describe('the chrome renders the catalogue', () => {
  const textOf = (selector: string) =>
    [...container.querySelectorAll(selector)].map((element) => element.textContent)

  it('translates the menubar, and leaves untranslated entries in English', () => {
    const editor = mountEditor()
    const menubar = createMenubar(editor, container, { messages: FRENCH })
    const labels = textOf('.trevixal-menubar__trigger')
    expect(labels).toContain('Fichier')
    expect(labels).toContain('Edit')
    menubar.destroy()
    editor.destroy()
  })

  it('translates a menu item inside an open menu', () => {
    const editor = mountEditor()
    const menubar = createMenubar(editor, container, { messages: FRENCH })
    const trigger = container.querySelector<HTMLElement>('[data-trevixal-menu="format"]')
    trigger?.click()
    const bold = container.querySelector('[data-trevixal-item="bold"] .trevixal-menu__label')
    expect(bold?.textContent).toBe('Gras')
    menubar.destroy()
    editor.destroy()
  })

  it('translates a toolbar button, label and accessible name alike', () => {
    const editor = mountEditor()
    const toolbar = createToolbar(editor, container, { messages: FRENCH })
    const bold = container.querySelector('[data-trevixal-item="bold"]')
    expect(bold?.getAttribute('aria-label')).toBe('Gras')
    const italic = container.querySelector('[data-trevixal-item="italic"]')
    expect(italic?.getAttribute('aria-label')).toBe('Italique')
    // Untouched, because the catalogue does not name it.
    const underline = container.querySelector('[data-trevixal-item="underline"]')
    expect(underline?.getAttribute('aria-label')).toBe('Underline')
    toolbar.destroy()
    editor.destroy()
  })

  it('reaches the whole chrome from one option', () => {
    const editor = mountEditor()
    const ui = createEditorUI(editor, { container, messages: FRENCH })
    expect(textOf('.trevixal-menubar__trigger')).toContain('Fichier')
    expect(
      container
        .querySelector('.trevixal-toolbar [data-trevixal-item="bold"]')
        ?.getAttribute('aria-label'),
    ).toBe('Gras')
    ui.destroy()
    editor.destroy()
  })

  it('is English when no catalogue is given, exactly as before', () => {
    const editor = mountEditor()
    const menubar = createMenubar(editor, container)
    expect(textOf('.trevixal-menubar__trigger')).toEqual([
      'File',
      'Edit',
      'Insert',
      'Format',
      'Tools',
      'Table',
      'View',
      'Help',
    ])
    menubar.destroy()
    editor.destroy()
  })
})
