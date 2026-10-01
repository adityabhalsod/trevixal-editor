// @vitest-environment happy-dom
import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  type Path,
  Schema,
  TableMap,
  TextSelection,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  addColumn,
  addRow,
  convertTableToText,
  deleteColumn,
  deleteRow,
  escapeTableOnEnter,
  mergeCells,
  moveColumn,
  moveRow,
  sortTable,
  splitCell,
  splitCellInto,
  swapCellContent,
  tableToCSV,
} from '../src'
import { cellsInSelection } from '../src/features'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node('tableCell', { header: false, ...attrs }, Fragment.of(p(text)))
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function docOf(...rows: EditorNode[]): EditorNode {
  return schema.node(
    'doc',
    undefined,
    Fragment.from([schema.node('table', undefined, Fragment.from(rows)), p('after')]),
  )
}

/**
 * | A | b | c |
 * |   | e | f |
 * | g | h | i |
 */
const merged = (): EditorNode =>
  docOf(
    row(cell('A', { rowspan: 2 }), cell('b'), cell('c')),
    row(cell('e'), cell('f')),
    row(cell('g'), cell('h'), cell('i')),
  )

function at(doc: EditorNode, rowIndex: number, cellIndex: number): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos([0, rowIndex, cellIndex, 0], 0)),
  })
}

function between(doc: EditorNode, from: [number, number], to: [number, number]): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos([0, ...from, 0], 0), pos([0, ...to, 0], 1)),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** The table as rows of `text:colspan:rowspan`. */
function grid(state: EditorState): string[][] {
  return state.doc
    .child(0)
    .content.children.map((line) =>
      line.content.children.map(
        (node) => `${node.textContent}:${node.attrs.colspan}:${node.attrs.rowspan}`,
      ),
    )
}

const cellPath = (state: EditorState): Path => state.selection.from.path.slice(0, 3)

describe('TableMap', () => {
  it('places a cell spanning down in the rows below it', () => {
    const map = TableMap.of(merged().child(0))
    expect([map.width, map.height]).toEqual([3, 3])
    expect(map.at(1, 0)?.node.textContent).toBe('A')
    // The second row's first cell stands in the second column.
    expect(map.cellAt(1, 0)).toMatchObject({ left: 1, top: 1 })
  })

  it('grows a rectangle until no cell sticks out of it', () => {
    const map = TableMap.of(merged().child(0))
    expect(map.expand({ top: 1, left: 0, bottom: 3, right: 2 })).toEqual({
      top: 0,
      left: 0,
      bottom: 3,
      right: 2,
    })
  })
})

describe('structural commands around a vertical merge', () => {
  it('adds a row below a merged cell under its last row', () => {
    const next = run(at(merged(), 0, 0), addRow('after'))
    expect(grid(next)).toEqual([
      ['A:1:2', 'b:1:1', 'c:1:1'],
      ['e:1:1', 'f:1:1'],
      [':1:1', ':1:1', ':1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
    expect(cellPath(next)).toEqual([0, 2, 0])
  })

  it('grows a merged cell across a row added inside it', () => {
    const next = run(at(merged(), 0, 1), addRow('after'))
    expect(grid(next)).toEqual([
      ['A:1:3', 'b:1:1', 'c:1:1'],
      [':1:1', ':1:1'],
      ['e:1:1', 'f:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('adds a column beside a merged cell, a cell in every row', () => {
    const next = run(at(merged(), 0, 0), addColumn('after'))
    expect(grid(next)).toEqual([
      ['A:1:2', ':1:1', 'b:1:1', 'c:1:1'],
      [':1:1', 'e:1:1', 'f:1:1'],
      ['g:1:1', ':1:1', 'h:1:1', 'i:1:1'],
    ])
    // The caret stays where it was.
    expect(cellPath(next)).toEqual([0, 0, 0])
  })

  it('widens a merged cell a new column falls inside, once', () => {
    const doc = docOf(
      row(cell('AB', { colspan: 2, rowspan: 2 }), cell('c')),
      row(cell('f')),
      row(cell('g'), cell('h'), cell('i')),
    )
    const next = run(at(doc, 2, 0), addColumn('after'))
    expect(grid(next)[0]).toEqual(['AB:3:2', 'c:1:1'])
    expect(grid(next)[2]).toEqual(['g:1:1', ':1:1', 'h:1:1', 'i:1:1'])
  })

  it('takes a deleted row out of the merged cell spanning it', () => {
    const next = run(at(merged(), 1, 0), deleteRow)
    expect(grid(next)).toEqual([
      ['A:1:1', 'b:1:1', 'c:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('moves a merged cell down when the row it starts in goes', () => {
    const next = run(at(merged(), 0, 1), deleteRow)
    expect(grid(next)).toEqual([
      ['A:1:1', 'e:1:1', 'f:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('deletes every row a merged cell spans with it', () => {
    const next = run(at(merged(), 0, 0), deleteRow)
    expect(grid(next)).toEqual([['g:1:1', 'h:1:1', 'i:1:1']])
  })

  it('deletes a column under a merged cell', () => {
    const next = run(at(merged(), 0, 0), deleteColumn)
    expect(grid(next)).toEqual([
      ['b:1:1', 'c:1:1'],
      ['e:1:1', 'f:1:1'],
      ['h:1:1', 'i:1:1'],
    ])
  })
})

describe('merging and splitting', () => {
  it('merges a column of cells into one spanning the rows', () => {
    const next = run(between(merged(), [0, 1], [1, 0]), mergeCells)
    expect(grid(next)).toEqual([
      ['A:1:2', 'be:1:2', 'c:1:1'],
      ['f:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('takes in a merged cell that reaches outside the selection', () => {
    // From e to g: A covers the second row too, and reaches up into the first.
    const next = run(between(merged(), [1, 0], [2, 0]), mergeCells)
    expect(grid(next)).toEqual([['Abegh:2:3', 'c:1:1'], ['f:1:1'], ['i:1:1']])
  })

  it('splits a merged cell back into a cell per row', () => {
    const next = run(at(merged(), 0, 0), splitCell)
    expect(grid(next)).toEqual([
      ['A:1:1', 'b:1:1', 'c:1:1'],
      [':1:1', 'e:1:1', 'f:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('splits a cell into rows, the cells beside it spanning them', () => {
    const next = run(at(merged(), 0, 1), splitCellInto(1, { rows: 2 }))
    expect(grid(next)).toEqual([
      ['A:1:3', 'b:1:1', 'c:1:2'],
      [':1:1'],
      ['e:1:1', 'f:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('shares a merged cell’s rows out without adding any', () => {
    const next = run(at(merged(), 0, 0), splitCellInto(1, { rows: 2 }))
    expect(grid(next)).toEqual([
      ['A:1:1', 'b:1:1', 'c:1:1'],
      [':1:1', 'e:1:1', 'f:1:1'],
      ['g:1:1', 'h:1:1', 'i:1:1'],
    ])
  })

  it('splits into columns and rows at once', () => {
    const doc = docOf(row(cell('x')))
    const next = run(at(doc, 0, 0), splitCellInto(2, { rows: 2 }))
    expect(grid(next)).toEqual([
      ['x:1:1', ':1:1'],
      [':1:1', ':1:1'],
    ])
  })

  it('declines a split that would make one cell', () => {
    expect(splitCellInto(1, { rows: 1 })(at(merged(), 0, 0))).toBeNull()
  })
})

describe('reading a table with a vertical merge', () => {
  it('selects the cells of a column once each', () => {
    const cells = cellsInSelection(between(merged(), [0, 1], [2, 1]))
    expect(cells.map(({ cell: node }) => node.textContent)).toEqual(['b', 'e', 'h'])
  })

  it('writes CSV with the merged cell once, the place below it empty', () => {
    expect(tableToCSV(merged().child(0))).toBe('A,b,c\r\n,e,f\r\ng,h,i')
  })

  it('flattens to text that still lines up', () => {
    const next = run(at(merged(), 0, 0), convertTableToText())
    const lines = next.doc.content.children.slice(0, 3).map((block) => block.textContent)
    expect(lines).toEqual(['A\tb\tc', '\te\tf', 'g\th\ti'])
  })

  it('carries rowspan through HTML', () => {
    const html = serializeToHTML(merged())
    expect(html).toContain('rowspan="2"')
    const back = parseHTML(schema, html)
    expect(back.child(0).child(0).child(0).attrs.rowspan).toBe(2)
  })
})

describe('moving and sorting', () => {
  it('sorts rows a merged cell ties together as one', () => {
    const next = run(at(merged(), 0, 1), sortTable({ direction: 'desc', header: false }))
    expect(grid(next)).toEqual([
      ['g:1:1', 'h:1:1', 'i:1:1'],
      ['A:1:2', 'b:1:1', 'c:1:1'],
      ['e:1:1', 'f:1:1'],
    ])
  })

  it('moves the rows a merged cell spans together', () => {
    const next = run(at(merged(), 0, 1), moveRow('down'))
    expect(grid(next)).toEqual([
      ['g:1:1', 'h:1:1', 'i:1:1'],
      ['A:1:2', 'b:1:1', 'c:1:1'],
      ['e:1:1', 'f:1:1'],
    ])
    expect(cellPath(next)).toEqual([0, 1, 1])
  })

  it('moves a column holding a merged cell', () => {
    const next = run(at(merged(), 0, 0), moveColumn('right'))
    expect(grid(next)).toEqual([
      ['b:1:1', 'A:1:2', 'c:1:1'],
      ['e:1:1', 'f:1:1'],
      ['h:1:1', 'g:1:1', 'i:1:1'],
    ])
    expect(cellPath(next)).toEqual([0, 0, 1])
  })

  it('swaps content with the neighbour on the grid', () => {
    const down = run(at(merged(), 0, 0), swapCellContent('down'))
    expect(grid(down)[2]?.[0]).toBe('A:1:1')
    const left = run(at(merged(), 1, 0), swapCellContent('left'))
    expect(grid(left)[0]?.[0]).toBe('e:1:2')
  })
})

describe('the bottom-right cell', () => {
  it('is the merged cell reaching the last row, from whichever row holds it', () => {
    const doc = docOf(row(cell('a'), cell('B', { rowspan: 2 })), row(cell('c')))
    const state = at(doc, 0, 1)
    const empty = EditorState.create({
      schema,
      doc: run(state, (s) => s.tr.setSelection(new TextSelection(pos([0, 0, 1, 0], 0)))).doc,
      selection: new TextSelection(pos([0, 0, 1, 0], 1)),
    })
    // The cell has text, so Enter stays in it; the check is on which cell counts.
    expect(escapeTableOnEnter(empty)).toBeNull()
    const blank = docOf(row(cell('a'), cell('', { rowspan: 2 })), row(cell('c')))
    expect(escapeTableOnEnter(at(blank, 0, 1))).not.toBeNull()
  })
})
