import { createEditor, serializeToHTML } from '@trevixal/core'
import { fieldSteps } from '@trevixal/extension-blocks'
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
  })

  test('keeps what the browser suite counts on', () => {
    const count = (pattern: RegExp): number => html.match(pattern)?.length ?? 0
    // Three tasks, the third undone; four code blocks; one tab strip of two.
    expect(count(/data-type="taskItem"/g)).toBe(3)
    expect(count(/<pre[ >]/g)).toBe(4)
    expect(count(/data-checked="false"/g)).toBe(1)
    expect(html).toContain('<h1>Trevixal</h1>')
  })
})
