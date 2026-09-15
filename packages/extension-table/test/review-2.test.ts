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
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { addRow, deleteColumn, mergeCells, splitCell } from '../src/commands'
import {
  convertTableToText,
  detectDelimiter,
  parseCSV,
  tableToCSV,
  tableToRows,
} from '../src/features'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function cellOf(blocks: readonly EditorNode[], attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node(
    'tableCell',
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.from([...blocks]),
  )
}

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return cellOf([p(text)], attrs)
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function table(...rows: EditorNode[]): EditorNode {
  return schema.node('table', undefined, Fragment.from(rows))
}

function docOf(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', undefined, Fragment.from(blocks))
}

function stateAt(doc: EditorNode, path: Path, offset = 0): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, offset)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** Every node in the document whose content its own type rejects. */
function invalidNodes(doc: EditorNode): string[] {
  const problems: string[] = []
  const walk = (node: EditorNode, path: string): void => {
    if (!node.type.validContent(node.content)) problems.push(`${path || '/'}:${node.type.name}`)
    node.content.children.forEach((child, index) => walk(child, `${path}/${index}`))
  }
  walk(doc, '')
  return problems
}

/** The widths of one row's cells, left to right. */
function widths(tableNode: EditorNode, rowIndex = 0): (string | null)[] {
  return tableNode.child(rowIndex).content.children.map((c) => c.attrs.width as string | null)
}

describe('deleteColumn on a table whose rows are not all the same width', () => {
  // Pasted HTML routinely has short rows; deleting the column holding a short
  // row's only cell used to leave `<tr></tr>`, which the schema rejects.
  const ragged = (): EditorNode => docOf(table(row(cell('a')), row(cell('b'), cell('c'))))

  it('drops a row the column empties instead of leaving it cell-less', () => {
    const next = run(stateAt(ragged(), [0, 0, 0, 0]), deleteColumn)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(tableToRows(next.doc.child(0))).toEqual([['c']])
    expect(serializeToHTML(next.doc)).not.toContain('<tr></tr>')
  })

  it('leaves the caret in a cell that exists', () => {
    const next = run(stateAt(ragged(), [0, 0, 0, 0]), deleteColumn)
    const { path } = next.selection.from
    const rowNode = next.doc.child(0).content.maybeChild(path[1] as number)
    expect(rowNode?.content.maybeChild(path[2] as number)).toBeDefined()
  })

  it('keeps the caret in its own cell when a column to its right goes', () => {
    const doc = docOf(table(row(cell('a'), cell('b'), cell('c'))))
    const next = run(stateAt(doc, [0, 0, 0, 0]), deleteColumn)
    expect(tableToRows(next.doc.child(0))).toEqual([['b', 'c']])
    expect(next.selection.from.path).toEqual([0, 0, 0, 0])
  })
})

describe('mergeCells across separate tables', () => {
  it('declines a selection that starts in one table and ends in another', () => {
    const doc = docOf(table(row(cell('a'), cell('b'))), table(row(cell('c'), cell('d'))))
    const state = EditorState.create({
      schema,
      doc,
      selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([1, 0, 1, 0], 1)),
    })
    expect(mergeCells(state)).toBeNull()
  })
})

describe('column widths through merge and split', () => {
  // setTableSizing and distributeColumnsEvenly both give a spanning cell the
  // combined width of its columns, so merge and split have to keep that sum.
  it('merging sums the widths and splitting shares them out again', () => {
    const doc = docOf(
      table(row(cell('a', { width: '100px' }), cell('b', { width: '50px' })), row(cell('c'))),
    )
    const state = EditorState.create({
      schema,
      doc,
      selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 0, 1, 0], 1)),
    })
    const merged = run(state, mergeCells)
    expect(widths(merged.doc.child(0))).toEqual(['150px'])
    const split = run(stateAt(merged.doc, [0, 0, 0, 0]), splitCell)
    expect(widths(split.doc.child(0))).toEqual(['75px', '75px'])
  })

  it('leaves the width alone when the cells are not sized in one unit', () => {
    const doc = docOf(table(row(cell('a', { width: '100px' }), cell('b', { width: '50%' }))))
    const state = EditorState.create({
      schema,
      doc,
      selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 0, 1, 0], 1)),
    })
    expect(widths(run(state, mergeCells).doc.child(0))).toEqual([null])
  })
})

describe('addRow', () => {
  it('mirrors the column widths, which a fixed layout reads off the first row', () => {
    const doc = docOf(table(row(cell('a', { width: '100px' }), cell('b', { width: '50px' }))))
    const next = run(stateAt(doc, [0, 0, 0, 0]), addRow('before'))
    expect(widths(next.doc.child(0), 0)).toEqual(['100px', '50px'])
    expect(widths(next.doc.child(0), 1)).toEqual(['100px', '50px'])
  })
})

describe('convertTableToText', () => {
  it('separates the blocks of a multi-paragraph cell', () => {
    const doc = docOf(table(row(cellOf([p('x'), p('y')]), cell('z'))))
    const next = run(stateAt(doc, [0, 0, 0, 0]), convertTableToText())
    expect(next.doc.child(0).textContent).toBe('x y\tz')
  })
})

describe('CSV', () => {
  it('keeps a row whose fields are all empty', () => {
    expect(parseCSV('a,b\n,\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd'],
    ])
  })

  it('round-trips a table with an empty row', () => {
    const grid = table(row(cell('a'), cell('b')), row(cell(''), cell('')), row(cell('c')))
    expect(parseCSV(tableToCSV(grid), ',')).toEqual([['a', 'b'], ['', ''], ['c']])
  })

  it('still skips blank lines', () => {
    expect(parseCSV('\n\n')).toEqual([])
    expect(parseCSV('a,b\r\n')).toEqual([['a', 'b']])
  })

  it('strips a byte-order mark from the first field', () => {
    expect(parseCSV('﻿Name,Price\n1,2')).toEqual([
      ['Name', 'Price'],
      ['1', '2'],
    ])
  })

  it('detects the delimiter past a quoted field holding a line break', () => {
    expect(detectDelimiter('"a\nb";c\n1;2')).toBe(';')
    expect(parseCSV('"a\nb";c\n1;2')).toEqual([
      ['a\nb', 'c'],
      ['1', '2'],
    ])
  })

  it('detects the delimiter past a doubled quote', () => {
    expect(detectDelimiter('"a""b";c;d\n1;2;3')).toBe(';')
  })
})
