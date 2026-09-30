// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  namedStylesCSS,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DOCUMENT_THEME,
  bindDocumentTheme,
  documentFonts,
  documentTheme,
  setDocumentFonts,
  setDocumentTheme,
} from '../src/document-appearance'
import { enableLongDocumentMode } from '../src/long-document'
import { KEYBOARD_INSET_PROPERTY, trackVirtualKeyboard } from '../src/mobile'
import { MOTION_ATTRIBUTE, scrollBehavior } from '../src/motion'
import {
  ThemeFileError,
  createThemeController,
  currentTheme,
  parseTheme,
  serializeTheme,
} from '../src/theming'
import { toolbarPresetGroups } from '../src/toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const editors: Editor[] = []

function mount(): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-trevixal-theme')
  document.documentElement.removeAttribute('data-trevixal-preset')
})

describe('theme files', () => {
  it('come back as the theme they were, and drop a token that would break out', () => {
    const theme = createThemeController(document, { preset: 'nord' })
    const file = serializeTheme(currentTheme(theme))
    const back = parseTheme(file)
    expect(back).toMatchObject({ name: 'nord', base: 'dark' })
    expect(back.tokens['color-bg']).toBe('#2e3440')
    const hostile = parseTheme(
      JSON.stringify({
        format: 'trevixal-theme',
        base: 'light',
        tokens: { 'color-bg': 'red; } body { display: none', 'color-text': '#111111' },
      }),
    )
    expect(hostile.tokens).toEqual({ 'color-text': '#111111' })
  })

  it('refuse a file that is not a theme', () => {
    expect(() => parseTheme('not json')).toThrow(ThemeFileError)
    expect(() => parseTheme('{"format":"trevixal-theme","base":"purple"}')).toThrow(ThemeFileError)
  })
})

describe('the document’s own look', () => {
  it('opens a document in the theme saved with it, and gives the reader’s back after', () => {
    const editor = mount()
    const theme = createThemeController(document, { preset: 'sepia' })
    const stop = bindDocumentTheme(editor, theme)
    editor.exec(setDocumentTheme(theme.presets.find((preset) => preset.name === 'nord') ?? null))
    expect(documentTheme(editor.state.doc)?.base).toBe('dark')
    expect(theme.preset).toBe(DOCUMENT_THEME)
    expect(document.documentElement.dataset.trevixalTheme).toBe('dark')
    editor.setContent({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(theme.preset).toBe('sepia')
    stop()
  })

  it('keeps its fonts in its styles, the rest of each style kept', () => {
    const editor = mount()
    editor.exec(setDocumentFonts({ body: 'Georgia, serif', headings: "'Open Sans', sans-serif" }))
    expect(documentFonts(editor.state.doc)).toEqual({
      body: 'Georgia, serif',
      headings: "'Open Sans', sans-serif",
    })
    const css = namedStylesCSS(editor.state.doc, '.scope')
    expect(css).toContain('.scope { font-family: Georgia, serif }')
    expect(css).toContain(".scope h6 { font-family: 'Open Sans', sans-serif }")
    editor.exec(setDocumentFonts({ body: null, headings: null }))
    expect(documentFonts(editor.state.doc)).toEqual({ body: null, headings: null })
  })
})

describe('reading settings', () => {
  it('scrolls at once where motion is reduced', () => {
    const root = document.createElement('div')
    const inside = document.createElement('p')
    root.append(inside)
    document.body.append(root)
    expect(scrollBehavior(inside)).toBe('smooth')
    root.setAttribute(MOTION_ATTRIBUTE, 'reduced')
    expect(scrollBehavior(inside)).toBe('auto')
  })

  it('offers each toolbar preset’s groups, in the bar’s order, from the groups it has', () => {
    const groups = ['block', 'marks', 'lists', 'code', 'history']
    expect(toolbarPresetGroups('minimal', groups)).toEqual(['marks', 'lists', 'history'])
    expect(toolbarPresetGroups('developer', groups)).toEqual(groups)
    expect(toolbarPresetGroups('full', groups)).toEqual(groups)
  })
})

describe('a long document', () => {
  it('marks its surface once it has enough blocks, so the browser skips what is off screen', () => {
    const editor = mount()
    const stop = enableLongDocumentMode(editor, 3)
    expect(editor.view?.dom.hasAttribute('data-trevixal-long')).toBe(false)
    editor.setContent({
      type: 'doc',
      content: [1, 2, 3].map((n) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: `P${n}` }],
      })),
    })
    expect(editor.view?.dom.hasAttribute('data-trevixal-long')).toBe(true)
    stop()
    expect(editor.view?.dom.hasAttribute('data-trevixal-long')).toBe(false)
  })
})

describe('on a phone', () => {
  it('keeps the height the on-screen keyboard covers, for the toolbar to ride on', () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const root = document.createElement('div')
    document.body.append(root)
    const stop = trackVirtualKeyboard(root)
    expect(root.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('0px')
    viewport.height = 460
    viewport.dispatchEvent(new Event('resize'))
    expect(root.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('340px')
    stop()
    expect(root.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('')
  })
})
