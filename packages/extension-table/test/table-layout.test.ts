// @vitest-environment happy-dom
import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  type Path,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
  serializeToMarkdown,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { cellContextAt, goToNextCell, insertTable } from '../src/commands'
import { cellPadding, cellVerticalAlign, tableNodes } from '../src/schema'
import {
  setCellPadding,
  setCellVerticalAlign,
  tableLayoutAt,
  toggleFreezeFirstColumn,
  toggleFreezeHeaderRow,
} from '../src/table-layout'
import { tableUICommands } from '../src/ui'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node(
    'tableCell',
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.of(schema.node('paragraph', undefined, text ? [schema.text(text)] : [])),
  )
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function docOf(attrs: Record<string, unknown>, ...rows: EditorNode[]): EditorNode {
  return schema.node(
    'doc',
    undefined,
    Fragment.of(schema.node('table', attrs, Fragment.from(rows))),
  )
}

function caret(doc: EditorNode, path: Path = [0, 0, 0, 0], offset = 0, head?: Path): EditorState {
  const anchor = pos(path, offset)
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(anchor, head ? pos(head, 0) : anchor),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

const grid = () => docOf({}, row(cell('a'), cell('b')), row(cell('c'), cell('d')))

describe('the layout attributes in HTML', () => {
  it('travel as data attributes, the padding as a custom property, and come back', () => {
    const doc = docOf(
      { freezeHeader: true, freezeColumn: true, cellPadding: '4px' },
      row(cell('a', { verticalAlign: 'middle' }), cell('b', { verticalAlign: 'bottom' })),
    )
    const html = serializeToHTML(doc)
    expect(html).toContain('data-freeze-header=""')
    expect(html).toContain('data-freeze-column=""')
    expect(html).toContain('--tvx-cell-padding: 4px')
    expect(html).toContain('vertical-align: middle')
    expect(html).toContain('vertical-align: bottom')
    const back = parseHTML(schema, html, document).child(0)
    expect(back.attrs).toMatchObject({ freezeHeader: true, freezeColumn: true, cellPadding: '4px' })
    expect(back.child(0).child(0).attrs.verticalAlign).toBe('middle')
    expect(back.child(0).child(1).attrs.verticalAlign).toBe('bottom')
  })

  it('writes nothing for the defaults', () => {
    const html = serializeToHTML(grid())
    expect(html).toContain('<table><tr><td>')
    expect(html).not.toContain('vertical-align')
  })

  it('reads a pasted cell’s alignment from its style or its `valign`, and top as none', () => {
    const back = parseHTML(
      schema,
      '<table><tr><td valign="center">a</td><td style="vertical-align: bottom">b</td><td style="vertical-align: top">c</td></tr></table>',
      document,
    ).child(0)
    expect(back.child(0).content.children.map((each) => each.attrs.verticalAlign)).toEqual([
      'middle',
      'bottom',
      null,
    ])
  })

  it('keeps only a padding it can write back', () => {
    expect(cellPadding('0')).toBe('0')
    expect(cellPadding('12px')).toBe('12px')
    expect(cellPadding('0.5em')).toBe('0.5em')
    expect(cellPadding('10%')).toBeNull()
    expect(cellPadding('4px; color: red')).toBeNull()
    expect(cellVerticalAlign('CENTER')).toBe('middle')
    expect(cellVerticalAlign('top')).toBeNull()
    expect(cellVerticalAlign('baseline')).toBeNull()
  })
})

describe('freezing the header row and first column', () => {
  it('freezes the header row, giving a table without one a header row to hold', () => {
    const next = run(caret(grid()), toggleFreezeHeaderRow)
    const table = next.doc.child(0)
    expect(table.attrs.freezeHeader).toBe(true)
    expect(table.child(0).content.children.every((each) => each.attrs.header === true)).toBe(true)
    expect(table.child(1).child(0).attrs.header).toBe(false)
    // And off again leaves the header row as it is.
    const off = run(next, toggleFreezeHeaderRow)
    expect(off.doc.child(0).attrs.freezeHeader).toBe(false)
    expect(off.doc.child(0).child(0).child(0).attrs.header).toBe(true)
  })

  it('freezes the first column, and unfreezes it', () => {
    const next = run(caret(grid()), toggleFreezeFirstColumn)
    expect(next.doc.child(0).attrs.freezeColumn).toBe(true)
    expect(run(next, toggleFreezeFirstColumn).doc.child(0).attrs.freezeColumn).toBe(false)
  })

  it('declines outside a table', () => {
    const doc = schema.node('doc', undefined, Fragment.of(schema.node('paragraph')))
    const state = EditorState.create({ schema, doc, selection: new TextSelection(pos([0], 0)) })
    expect(toggleFreezeHeaderRow(state)).toBeNull()
    expect(toggleFreezeFirstColumn(state)).toBeNull()
    expect(tableLayoutAt(state)).toBeNull()
  })
})

describe('cell padding and vertical alignment', () => {
  it('sets the padding of the whole table, clears it, and declines what it cannot write', () => {
    const next = run(caret(grid()), setCellPadding('16px'))
    expect(next.doc.child(0).attrs.cellPadding).toBe('16px')
    expect(setCellPadding('16px')(next)).toBeNull()
    expect(setCellPadding('1in')(next)).toBeNull()
    expect(run(next, setCellPadding(null)).doc.child(0).attrs.cellPadding).toBeNull()
  })

  it('aligns every cell the selection covers, and stores top as none', () => {
    const state = caret(grid(), [0, 0, 0, 0], 0, [0, 1, 1, 0])
    const next = run(state, setCellVerticalAlign('bottom'))
    const aligns = next.doc
      .child(0)
      .content.children.flatMap((each) => each.content.children.map((c) => c.attrs.verticalAlign))
    expect(aligns).toEqual(['bottom', 'bottom', 'bottom', 'bottom'])
    const top = run(next, setCellVerticalAlign('top'))
    expect(top.doc.child(0).child(0).child(0).attrs.verticalAlign).toBeNull()
    expect(setCellVerticalAlign('top')(top)).toBeNull()
  })

  it('reads the layout at the selection, for the menu’s ticks', () => {
    const doc = docOf(
      { freezeHeader: true, cellPadding: '4px' },
      row(cell('a'), cell('b', { verticalAlign: 'middle' })),
    )
    expect(tableLayoutAt(caret(doc, [0, 0, 1, 0]))).toEqual({
      freezeHeader: true,
      freezeColumn: false,
      cellPadding: '4px',
      verticalAlign: 'middle',
    })
  })

  it('are all in the bundle the ui drives', () => {
    const commands = tableUICommands()
    expect(commands.toggleFreezeHeaderRow).toBe(toggleFreezeHeaderRow)
    expect(commands.toggleFreezeFirstColumn).toBe(toggleFreezeFirstColumn)
    expect(typeof commands.setCellPadding('4px')).toBe('function')
    expect(typeof commands.setCellVerticalAlign('middle')).toBe('function')
    expect(commands.tableLayoutAt(caret(grid()))?.freezeHeader).toBe(false)
  })
})

describe('nested tables', () => {
  it('inserts a table inside a cell, after its paragraph', () => {
    const next = run(caret(grid(), [0, 1, 0, 0]), insertTable({ rows: 2, cols: 2 }))
    const outer = next.doc.child(0)
    const host = outer.child(1).child(0)
    expect(host.childCount).toBe(2)
    expect(host.child(1).type.name).toBe('table')
    expect(next.selection.from.path).toEqual([0, 1, 0, 1, 0, 0, 0])
    // The commands then work on the table the caret is in: the inner one.
    const context = cellContextAt(next.doc, next.selection.from)
    expect(context?.tablePath).toEqual([0, 1, 0, 1])
  })

  it('moves from cell to cell of the inner table with Tab', () => {
    const inserted = run(caret(grid(), [0, 1, 0, 0]), insertTable({ rows: 1, cols: 2 }))
    const next = run(inserted, goToNextCell(1))
    expect(next.selection.from.path).toEqual([0, 1, 0, 1, 0, 1, 0])
  })

  it('round-trips through HTML, each table with its own attributes', () => {
    const inner = schema.node(
      'table',
      { cellPadding: '0' },
      Fragment.of(row(cell('x', { verticalAlign: 'bottom' }))),
    )
    const outer = schema.node(
      'doc',
      undefined,
      Fragment.of(
        schema.node(
          'table',
          { freezeHeader: true },
          Fragment.of(
            row(
              schema.node(
                'tableCell',
                { header: false, colspan: 1 },
                Fragment.of(schema.node('paragraph', undefined, [schema.text('a')]), inner),
              ),
            ),
          ),
        ),
      ),
    )
    const back = parseHTML(schema, serializeToHTML(outer), document)
    const table = back.child(0)
    expect(table.attrs).toMatchObject({ freezeHeader: true, cellPadding: null })
    const nested = table.child(0).child(0).child(1)
    expect(nested.type.name).toBe('table')
    expect(nested.attrs).toMatchObject({ freezeHeader: false, cellPadding: '0' })
    expect(nested.child(0).child(0).attrs.verticalAlign).toBe('bottom')
  })
  it('writes an inner table’s text into its cell in Markdown, which has no table in a table', () => {
    const inner = schema.node('table', undefined, Fragment.of(row(cell('x'), cell('y'))))
    const host = schema.node(
      'tableCell',
      { header: false, colspan: 1 },
      Fragment.of(schema.node('paragraph', undefined, [schema.text('outer')]), inner),
    )
    const doc = schema.node(
      'doc',
      undefined,
      Fragment.of(
        schema.node(
          'table',
          undefined,
          Fragment.from([row(cell('A'), cell('B')), row(host, cell('z'))]),
        ),
      ),
    )
    expect(serializeToMarkdown(doc)).toContain('| outer x y | z |')
  })
})
