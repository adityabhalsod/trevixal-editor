import { createEditor, serializeToHTML } from '@trevixal/core'
import { fieldSteps } from '@trevixal/extension-blocks'
import { formulaSteps } from '@trevixal/extension-table'
import { afterAll, describe, expect, test } from 'vitest'
import { initialContent } from '../src/content'
import { createFullSchema } from '../src/schema'

/**
 * The tour every example app opens with. It shows each finished feature in
 * the text itself, where one can, and says where the rest live. The browser
 * suite leans on parts of it, so what it may not change is held here too.
 */
const editor = createEditor({ schema: createFullSchema(), content: initialContent })
const html = serializeToHTML(editor.state.doc)

afterAll(() => editor.destroy())

describe('the tour', () => {
  test('arrives with its fields already worked out, so opening it edits nothing', () => {
    // A server that renders it without the kit, as `examples/ssr` does,
    // shows the numbers too; the updater finds nothing to change on load.
    expect(fieldSteps(editor.state.doc)).toEqual([])
    expect(html).toContain('>Table 1</span>')
    expect(html).toContain('Table 1: Launch budget')
  })

  test('shows the developer tools', () => {
    expect(html).toContain('data-line-numbers="true"')
    expect(html).toContain('data-title="report.sql"')
    expect(html).toContain('data-language="console"')
    expect(html).toContain('data-numbered="true"')
    expect(html).toContain('<span class="trevixal-math__number" aria-hidden="true">(1)</span>')
    expect(html).toContain('Tools ▸ Key bindings')
  })

  test('says where the advanced blocks are', () => {
    expect(html).toContain('Insert ▸ Margin note, Poll and Map')
    expect(html).toContain('Insert ▸ Show only when')
  })

  test('says where the protection tools are', () => {
    expect(html).toContain('Tools ▸ Redact selection')
    expect(html).toContain('Tools ▸ Lock selected blocks')
    expect(html).toContain('File ▸ Lock now')
    expect(html).toContain('File ▸ Sign document')
  })

  test('says where the customization tools are', () => {
    expect(html).toContain('View ▸ Language')
    expect(html).toContain('View ▸ Toolbar')
    expect(html).toContain('Format ▸ Document fonts')
    expect(html).toContain('View ▸ Dyslexia-friendly font')
  })

  test('holds a form field to fill in, and says where forms are', () => {
    expect(html).toContain('data-form-field="text" data-name="your_name"')
    expect(html).toContain('Fillable PDF form')
    expect(html).toContain('Tools ▸ Mail merge')
  })

  test('says where the page layout is', () => {
    expect(html).toContain('File ▸ Page setup')
    expect(html).toContain('Insert ▸ Section break')
    expect(html).toContain('File ▸ Print preview shows the pages')
  })

  test('says where comments are', () => {
    expect(html).toContain('Ctrl+Alt+M to comment')
    expect(html).toContain('View ▸ Comments')
  })

  test('says where the writing tools are', () => {
    expect(html).toContain('Tools ▸ Accessibility check')
    expect(html).toContain('Right-click a word for synonyms')
    expect(html).toContain('Insert ▸ Citation style')
    expect(html).toContain('Tools ▸ Writing assistant')
    expect(html).toContain('Tools ▸ Read aloud')
  })

  test('says where the file formats are', () => {
    expect(html).toContain('OpenDocument, EPUB, LaTeX')
    expect(html).toContain('Notion or Google Docs exports')
    expect(html).toContain('View ▸ Present shows each top-level heading as a slide')
  })

  test('says where the keyboard tools are', () => {
    expect(html).toContain('Alt+click adds a caret')
    expect(html).toContain('Tools ▸ Snippets')
    expect(html).toContain('Tools ▸ Macro')
  })

  test('says where the editing workflow tools are', () => {
    expect(html).toContain('Insert ▸ Include from workspace')
    expect(html).toContain('File ▸ Save version')
    expect(html).toContain('Tools ▸ Compare with a file')
  })

  test('says where the link tools are', () => {
    expect(html).toContain('Tools ▸ Check links')
    expect(html).toContain('type [[ to link to another one')
  })

  test('shows the long-document tools', () => {
    for (const marker of [
      'data-caption="table"',
      'class="trevixal-xref"',
      'data-caption-list="table"',
      'data-document-index="true"',
      'data-index-term="xe-index"',
      'data-endnote="1"',
      'data-endnotes="true"',
      '<p dir="rtl">',
    ]) {
      expect(html, marker).toContain(marker)
    }
  })

  test('shows the formatting tools', () => {
    for (const marker of [
      'data-paragraph-style="pull-quote"',
      'data-char-style="subtleEmphasis"',
      'data-drop-cap="drop"',
      'data-tab-stops="360 decimal dot"',
      'border-top: 1px solid #2f6fed',
      'data-styles=',
    ]) {
      expect(html, marker).toContain(marker)
    }
  })

  test('shows the list and table tools', () => {
    for (const marker of [
      'data-assignee="Lee"',
      'data-due="2027-06-30"',
      'data-folded=""',
      'data-numbering="custom-1"',
      'data-list-schemes=',
      'data-freeze-header=""',
      '--tvx-cell-padding: 16px',
      'vertical-align: middle',
    ]) {
      expect(html, marker).toContain(marker)
    }
    // A table inside a cell.
    expect(html).toMatch(/<td>(?:(?!<\/td>).)*<table>/)
    // A cell merged down a column.
    expect(html).toContain('<td rowspan="2">')
    // A drawing, to double-click and draw on.
    expect(html).toContain('class="trevixal-drawing"')
    // A formula, its result seeded as the updater works it out, so opening
    // the tour edits nothing.
    expect(html).toContain('data-formula="SUM(ABOVE)"')
    expect(formulaSteps(editor.state.doc)).toEqual([])
  })

  test('keeps what the browser suite counts on', () => {
    const count = (pattern: RegExp): number => html.match(pattern)?.length ?? 0
    // Three tasks, the third undone; five code blocks; one tab strip of two.
    expect(count(/data-type="taskItem"/g)).toBe(3)
    expect(count(/<pre[ >]/g)).toBe(5)
    expect(count(/data-checked="false"/g)).toBe(1)
    expect(html).toContain('<h1>Trevixal</h1>')
  })
})
