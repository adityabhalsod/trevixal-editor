// @vitest-environment happy-dom
import {
  type Command,
  type NodeJSON,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  nodeFromJSON,
  parseHTML,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDialog } from '../src/dialog'
import { createEditorUI } from '../src/editor-ui'
import { defaultMessages } from '../src/i18n'
import { createSourceMode } from '../src/source-mode'
import { createToolbar } from '../src/toolbar'

/** Found by clicking through every menu entry of the assembled editor. */

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const tableSchema = new Schema({
  nodes: {
    ...defaultNodes(),
    table: { content: 'tableRow+', group: 'block', toHTML: () => ({ tag: 'table' }) },
    tableRow: { content: 'tableCell+', toHTML: () => ({ tag: 'tr' }) },
    tableCell: { content: 'block+', toHTML: () => ({ tag: 'td' }) },
  },
  marks: defaultMarks(),
})

const noop: Command = (state) => state.tr

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(content: string | NodeJSON, withSchema = schema) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const doc =
    typeof content === 'string'
      ? parseHTML(withSchema, content, document)
      : nodeFromJSON(withSchema, content)
  const editor = createEditor({ schema: withSchema, element: host, doc })
  return { editor, container }
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

const item = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[data-trevixal-item="${name}"]`)

const openDialogElement = () => document.querySelector<HTMLElement>('.trevixal-dialog')

describe('a text box opens at its first line', () => {
  it('in a dialog, so a long list is read from the top', () => {
    void openDialog({
      document,
      title: 'List',
      fields: [{ name: 'words', label: 'Words', type: 'textarea', value: 'one\ntwo\nthree' }],
    })
    const box = document.querySelector<HTMLTextAreaElement>('.trevixal-dialog textarea')
    expect(document.activeElement).toBe(box)
    expect([box?.selectionStart, box?.selectionEnd]).toEqual([0, 0])
  })

  it('in the Markdown source mode', () => {
    const { editor } = mount('<h1>Title</h1><p>First</p><p>Last</p>')
    const mode = createSourceMode(editor, { format: 'markdown' })
    mode.enter()
    const box = mode.element?.querySelector('textarea')
    expect(box?.value).toContain('Last')
    expect([box?.selectionStart, box?.selectionEnd]).toEqual([0, 0])
    mode.destroy()
    editor.destroy()
  })
})

describe('menu dialogs', () => {
  it('offers a badge only the tones it can draw', () => {
    const { editor, container } = mount('<p>Hello</p>')
    const ui = createEditorUI(editor, { container, blockCommands: { insertBadge: () => noop } })
    item('insertBadge')?.click()
    const tone = document.querySelector<HTMLSelectElement>('.trevixal-dialog [name="tone"]')
    expect(tone?.tagName).toBe('SELECT')
    expect([...(tone?.options ?? [])].map((option) => option.value)).toEqual([
      'neutral',
      'info',
      'success',
      'warning',
      'danger',
    ])
    ui.destroy()
    editor.destroy()
  })

  it('shows the word count as a report, with one button to close it', () => {
    const { editor, container } = mount('<p>Three short words</p>')
    const ui = createEditorUI(editor, { container })
    item('wordCount')?.click()
    const dialog = openDialogElement()
    expect(dialog?.textContent).toContain('3')
    expect(dialog?.querySelectorAll('input, textarea')).toHaveLength(0)
    expect([...(dialog?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Close',
    ])
    ui.destroy()
    editor.destroy()
  })

  it('asks for a video first without offering to save chapters it has nowhere to put', () => {
    const { editor, container } = mount('<p>No video here</p>')
    const ui = createEditorUI(editor, {
      container,
      embedCommands: { setVideoChapters: () => noop, videoChaptersAt: () => null },
    })
    item('videoChapters')?.click()
    const dialog = openDialogElement()
    expect(dialog?.textContent).toContain('Select a video first')
    expect([...(dialog?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Close',
    ])
    ui.destroy()
    editor.destroy()
  })
})

describe('the Table menu', () => {
  it('greys out what needs a table while the caret is outside one', () => {
    const { editor, container } = mount(
      {
        type: 'doc',
        content: [
          paragraph('Before'),
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Cell')] }] },
            ],
          },
        ],
      },
      tableSchema,
    )
    const ui = createEditorUI(editor, {
      container,
      tableCommands: {
        insertTable: () => noop,
        addRowBefore: noop,
        deleteTable: noop,
        convertTextToTable: noop,
      },
    })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 2))))
    expect(item('addRowBefore')?.disabled).toBe(true)
    expect(item('deleteTable')?.disabled).toBe(true)
    // What makes a table stays on offer.
    expect(item('insertTable')?.disabled).toBe(false)
    expect(item('convertTextToTable')?.disabled).toBe(false)

    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1, 0, 0, 0], 2))))
    expect(item('addRowBefore')?.disabled).toBe(false)
    expect(item('deleteTable')?.disabled).toBe(false)
    ui.destroy()
    editor.destroy()
  })
})

describe('the toolbar', () => {
  it('names its two spacing lists apart', () => {
    const { editor, container } = mount('<p>Hello</p>')
    const toolbar = createToolbar(editor, container)
    const text = (name: string) =>
      container.querySelector(`[data-trevixal-item="${name}"] .trevixal-select__label`)?.textContent
    expect(text('paragraphSpacing')).toBeTruthy()
    expect(text('letterSpacing')).toBeTruthy()
    expect(text('letterSpacing')).not.toBe(text('paragraphSpacing'))
    toolbar.destroy()
    editor.destroy()
  })
})

describe('the toolbar in another language', () => {
  const label = (container: HTMLElement, name: string) =>
    container.querySelector(`[data-trevixal-item="${name}"] .trevixal-select__label`)?.textContent
  const trigger = (container: HTMLElement, name: string) =>
    container.querySelector(`[data-trevixal-item="${name}"] .trevixal-dropdown__trigger`)

  it('names its lists in the catalogue’s words, and their choices in the menus’', () => {
    const { editor, container } = mount('<h1>Title</h1>')
    const toolbar = createToolbar(editor, container, {
      messages: {
        'toolbar.fontFamily': 'Schriftart',
        'toolbar.lineHeight': 'Zeilenabstand',
        'toolbar.blockFormat.aria': 'Absatzformat',
        'menu.styleHeading1': 'Überschrift 1',
      },
    })
    expect(label(container, 'fontFamily')).toBe('Schriftart')
    expect(label(container, 'blockFormat')).toBe('Überschrift 1')
    expect(trigger(container, 'blockFormat')?.getAttribute('aria-label')).toBe('Absatzformat')
    // A list whose English name and label are one text is spoken as translated.
    expect(trigger(container, 'lineHeight')?.getAttribute('aria-label')).toBe('Zeilenabstand')

    toolbar.setMessages(undefined)
    expect(label(container, 'fontFamily')).toBe('Font')
    expect(label(container, 'blockFormat')).toBe('Heading 1')
    toolbar.destroy()
    editor.destroy()
  })

  it('lists each list’s name among the labels there are to translate', () => {
    const english = defaultMessages()
    expect(english['toolbar.fontFamily']).toBe('Font')
    expect(english['toolbar.fontFamily.aria']).toBe('Font family')
    expect(english['toolbar.letterSpacing']).toBe('Letter spacing')
  })
})

describe('inside a quote', () => {
  it('presses the Quote button, names it in the block list and ticks it in the menu', async () => {
    // The ui reads core's built snapshot, so build core before this test.
    const { editor, container } = mount('<blockquote><p>Quoted words</p></blockquote>')
    const ui = createEditorUI(editor, { container })
    const toolbar = container.querySelector('.trevixal-toolbar')
    expect(
      toolbar?.querySelector('[data-trevixal-item="blockquote"]')?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      toolbar?.querySelector('[data-trevixal-item="blockFormat"] .trevixal-select__label')
        ?.textContent,
    ).toBe('Quote')
    expect(item('styleQuote')?.getAttribute('aria-checked')).toBe('true')
    expect(item('styleParagraph')?.getAttribute('aria-checked')).toBe('false')
    ui.destroy()
    editor.destroy()
  })
})
