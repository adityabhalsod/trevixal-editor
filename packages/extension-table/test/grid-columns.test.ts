// @vitest-environment happy-dom
import {
  type EditorNode,
  Fragment,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { markGridColumns } from '../src/grid-columns'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  const paragraph = schema.node('paragraph', undefined, [schema.text(text)])
  return schema.node('tableCell', attrs, Fragment.of(paragraph))
}

function mount(...rows: EditorNode[][]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const table = schema.node(
    'table',
    undefined,
    Fragment.from(rows.map((cells) => schema.node('tableRow', undefined, Fragment.from(cells)))),
  )
  const editor = createEditor({
    schema,
    doc: schema.node('doc', undefined, [table]),
    element: host,
  })
  return { host, editor }
}

const marks = (host: HTMLElement): (string | null)[][] =>
  [...host.querySelectorAll('tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) =>
      cell.hasAttribute('data-grid-column')
        ? `${cell.getAttribute('data-grid-column')}${cell.hasAttribute('data-grid-last') ? 'L' : ''}${cell.hasAttribute('data-grid-band') ? 'B' : ''}`
        : null,
    ),
  )

describe('markGridColumns', () => {
  it('marks where each cell stands once a cell spans rows', () => {
    const { host, editor } = mount(
      [cell('A', { rowspan: 2 }), cell('b'), cell('c')],
      [cell('e'), cell('f')],
    )
    const dispose = markGridColumns(editor)
    expect(marks(host)).toEqual([
      ['0B', '1', '2LB'],
      ['1', '2LB'],
    ])
    // Only the page is marked, never the document.
    expect(serializeToHTML(editor.state.doc)).not.toContain('data-grid')
    dispose()
    expect(marks(host)).toEqual([
      [null, null, null],
      [null, null],
    ])
    editor.destroy()
  })

  it('leaves a table without a vertical merge to its rows', () => {
    const { host, editor } = mount([cell('a'), cell('b')], [cell('c'), cell('d')])
    const dispose = markGridColumns(editor)
    expect(marks(host)).toEqual([
      [null, null],
      [null, null],
    ])
    dispose()
    editor.destroy()
  })
})
