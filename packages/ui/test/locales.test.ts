// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { createEditorUI } from '../src/editor-ui'
import { type Messages, defaultMessages } from '../src/i18n'
import { UI_LANGUAGES } from '../src/languages'
import ar from '../src/locales/ar'
import de from '../src/locales/de'
import es from '../src/locales/es'
import fr from '../src/locales/fr'
import hi from '../src/locales/hi'
import ja from '../src/locales/ja'
import pt from '../src/locales/pt'
import zh from '../src/locales/zh'

const catalogues: Readonly<Record<string, Messages>> = { de, fr, es, pt, hi, ja, zh, ar }
const english = defaultMessages()

describe.each(Object.entries(catalogues))('the %s catalogue', (code, messages) => {
  it('is a language the menu offers', () => {
    expect(UI_LANGUAGES.map((language) => language.code)).toContain(code)
  })

  it('translates only labels the chrome has', () => {
    expect(Object.keys(messages).filter((key) => !(key in english))).toEqual([])
  })

  it('covers nearly every label, leaving names and numbers as they are', () => {
    expect(Object.keys(messages).length / Object.keys(english).length).toBeGreaterThan(0.9)
    expect(Object.keys(messages).filter((key) => key.startsWith('menu.language-'))).toEqual([])
  })

  it('keeps the ellipsis that says an entry opens a dialog', () => {
    const lost = Object.entries(messages)
      .filter(([key, text]) => english[key]?.endsWith('…') !== text.endsWith('…'))
      .map(([key]) => key)
    expect(lost).toEqual([])
  })
})

describe('switching language', () => {
  it('relabels the menus and the toolbar in place, and mirrors for Arabic', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
    const editor = createEditor({ schema, element: host })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ui = createEditorUI(editor, { container })
    const file = container.querySelector('[data-trevixal-menu="file"]')
    const bold = container.querySelector('.trevixal-toolbar [data-trevixal-item="bold"]')
    expect(file?.textContent).toBe('File')

    ui.setLanguage({ code: 'ar', direction: 'rtl', messages: ar })
    expect(file?.textContent).toBe('ملف')
    expect(bold?.getAttribute('aria-label')).toBe('غامق')
    expect(ui.element.getAttribute('dir')).toBe('rtl')
    expect(ui.element.lang).toBe('ar')

    ui.setLanguage({ code: 'en' })
    expect(file?.textContent).toBe('File')
    expect(bold?.getAttribute('aria-label')).toBe('Bold')
    expect(ui.element.hasAttribute('dir')).toBe(false)
    ui.destroy()
    editor.destroy()
  })
})
