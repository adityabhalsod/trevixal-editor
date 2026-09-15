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
import {
  clearTableSizing,
  distributeColumnsEvenly,
  moveColumn,
  moveRow,
  setColumnWidth,
  setRowHeight,
  setTableSizing,
  setTableWidth,
  swapCellContent,
} from '../src'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node(
    'tableCell',
    { header: false, colspan: 1, align: null, width: null, ...attrs },
    Fragment.of(p(text)),
  )
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', { height: null }, Fragment.from(cells))
}

function table(...rows: EditorNode[]): EditorNode {
  return schema.node('table', { width: null, layout: null }, Fragment.from(rows))
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

/** The visible text of every cell, row by row. */
function grid(doc: EditorNode): string[][] {
  const node = doc.child(0)
  return node.content.children.map((r) => r.content.children.map((c) => c.textContent))
}

const twoByTwo = (): EditorNode =>
  docOf(table(row(cell('a'), cell('b')), row(cell('c'), cell('d'))))

// Paths run doc -> table -> row -> cell -> paragraph.
const inCell = (rowIndex: number, cellIndex: number): Path => [0, rowIndex, cellIndex, 0]

describe('moveRow', () => {
  it('swaps a row with the one below it', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), moveRow('down'))
    expect(grid(next.doc)).toEqual([
      ['c', 'd'],
      ['a', 'b'],
    ])
  })

  it('swaps a row with the one above it', () => {
    const next = run(stateAt(twoByTwo(), inCell(1, 0)), moveRow('up'))
    expect(grid(next.doc)).toEqual([
      ['c', 'd'],
      ['a', 'b'],
    ])
  })

  it('keeps the caret in the cell it was editing', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 1)), moveRow('down'))
    // The row moved to index 1, so the caret follows it there.
    expect(next.selection.from.path.slice(0, 3)).toEqual([0, 1, 1])
  })

  it('carries per-cell attributes with the row', () => {
    const doc = docOf(table(row(cell('a', { header: true }), cell('b')), row(cell('c'), cell('d'))))
    const next = run(stateAt(doc, inCell(0, 0)), moveRow('down'))
    expect(next.doc.child(0).child(1).child(0).attrs.header).toBe(true)
  })

  it('declines at the ends of the table', () => {
    expect(moveRow('up')(stateAt(twoByTwo(), inCell(0, 0)))).toBeNull()
    expect(moveRow('down')(stateAt(twoByTwo(), inCell(1, 0)))).toBeNull()
  })

  it('declines outside a table', () => {
    const state = stateAt(docOf(p('plain')), [0], 0)
    expect(moveRow('down')(state)).toBeNull()
  })
})

describe('moveColumn', () => {
  it('swaps a column with the one beside it, in every row', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), moveColumn('right'))
    expect(grid(next.doc)).toEqual([
      ['b', 'a'],
      ['d', 'c'],
    ])
  })

  it('declines at the edges', () => {
    expect(moveColumn('left')(stateAt(twoByTwo(), inCell(0, 0)))).toBeNull()
    expect(moveColumn('right')(stateAt(twoByTwo(), inCell(0, 1)))).toBeNull()
  })

  it('declines rather than cutting through a merged cell', () => {
    // Row 0 is one cell spanning both columns, so there is no column boundary
    // at 1 in that row to swap across.
    const doc = docOf(table(row(cell('wide', { colspan: 2 })), row(cell('c'), cell('d'))))
    expect(moveColumn('right')(stateAt(doc, inCell(1, 0)))).toBeNull()
  })
})

describe('swapCellContent', () => {
  it('swaps content with the cell to the right', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), swapCellContent('right'))
    expect(grid(next.doc)).toEqual([
      ['b', 'a'],
      ['c', 'd'],
    ])
  })

  it('swaps content with the cell below', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), swapCellContent('down'))
    expect(grid(next.doc)).toEqual([
      ['c', 'b'],
      ['a', 'd'],
    ])
  })

  it('leaves the destination cell its own attributes', () => {
    // A header receiving a body cell's text is still a header: the attributes
    // describe the cell's place in the grid, not the value in it.
    const doc = docOf(table(row(cell('head', { header: true }), cell('body'))))
    const next = run(stateAt(doc, inCell(0, 0)), swapCellContent('right'))
    const first = next.doc.child(0).child(0).child(0)
    const second = next.doc.child(0).child(0).child(1)
    expect(first.attrs.header).toBe(true)
    expect(first.textContent).toBe('body')
    expect(second.attrs.header).toBe(false)
    expect(second.textContent).toBe('head')
  })

  it('does not lose an edit when both cells share a row', () => {
    // Writing the second cell into a stale copy of the row would silently
    // discard the first replacement.
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), swapCellContent('right'))
    expect(next.doc.child(0).child(0).child(0).textContent).toBe('b')
    expect(next.doc.child(0).child(0).child(1).textContent).toBe('a')
  })

  it('declines at the edge of the table', () => {
    expect(swapCellContent('left')(stateAt(twoByTwo(), inCell(0, 0)))).toBeNull()
    expect(swapCellContent('up')(stateAt(twoByTwo(), inCell(0, 0)))).toBeNull()
  })
})

describe('sizing', () => {
  it('sets a width on every cell in the column', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), setColumnWidth('120px'))
    const table0 = next.doc.child(0)
    expect(table0.child(0).child(0).attrs.width).toBe('120px')
    expect(table0.child(1).child(0).attrs.width).toBe('120px')
    // The untouched column keeps its own width.
    expect(table0.child(0).child(1).attrs.width).toBeNull()
  })

  it('switches the table to fixed layout, without which a width is a minimum', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), setColumnWidth('120px'))
    expect(next.doc.child(0).attrs.layout).toBe('fixed')
  })

  it('sets a row height and a table width', () => {
    let state = run(stateAt(twoByTwo(), inCell(0, 0)), setRowHeight('3rem'))
    expect(state.doc.child(0).child(0).attrs.height).toBe('3rem')
    state = run(state, setTableWidth('80%'))
    expect(state.doc.child(0).attrs.width).toBe('80%')
  })

  it('rejects a value that is not a length', () => {
    const state = stateAt(twoByTwo(), inCell(0, 0))
    // These reach a style attribute, so anything unrecognised is refused
    // rather than escaped.
    expect(setColumnWidth('120px; background: url(evil)')(state)).toBeNull()
    expect(setColumnWidth('calc(100% - 10px)')(state)).toBeNull()
    expect(setTableWidth('expression(alert(1))')(state)).toBeNull()
    expect(setRowHeight('-5px')(state)).toBeNull()
  })

  it('clears a width when passed null', () => {
    let state = run(stateAt(twoByTwo(), inCell(0, 0)), setColumnWidth('120px'))
    state = run(state, setColumnWidth(null))
    expect(state.doc.child(0).child(0).child(0).attrs.width).toBeNull()
  })

  it('distributes columns evenly as percentages', () => {
    const next = run(stateAt(twoByTwo(), inCell(0, 0)), distributeColumnsEvenly())
    const first = next.doc.child(0).child(0).child(0)
    expect(first.attrs.width).toBe('50%')
    // Percentages, not pixels: a px-sized table stops fitting a narrow page.
    expect(String(first.attrs.width)).toContain('%')
  })

  it('gives a merged cell the width of the columns it spans', () => {
    const doc = docOf(
      table(row(cell('wide', { colspan: 2 }), cell('c')), row(cell('a'), cell('b'), cell('c'))),
    )
    const next = run(stateAt(doc, inCell(1, 0)), distributeColumnsEvenly())
    const merged = next.doc.child(0).child(0).child(0)
    // Two of three columns.
    expect(merged.attrs.width).toBe('66.67%')
  })

  it('clears every size at once', () => {
    let state = run(stateAt(twoByTwo(), inCell(0, 0)), setColumnWidth('120px'))
    state = run(state, setRowHeight('3rem'))
    state = run(state, setTableWidth('80%'))
    state = run(state, clearTableSizing)

    const table0 = state.doc.child(0)
    expect(table0.attrs.width).toBeNull()
    expect(table0.attrs.layout).toBeNull()
    expect(table0.child(0).attrs.height).toBeNull()
    expect(table0.child(0).child(0).attrs.width).toBeNull()
  })

  it('serializes sizes into the style attribute', () => {
    let state = run(stateAt(twoByTwo(), inCell(0, 0)), setColumnWidth('120px'))
    state = run(state, setRowHeight('3rem'))
    const html = serializeToHTML(state.doc)
    expect(html).toContain('width: 120px')
    expect(html).toContain('height: 3rem')
    expect(html).toContain('table-layout: fixed')
  })

  it('keeps alignment alongside a width on the same cell', () => {
    const doc = docOf(table(row(cell('a', { align: 'center' }), cell('b'))))
    const next = run(stateAt(doc, inCell(0, 0)), setColumnWidth('50%'))
    const html = serializeToHTML(next.doc)
    // Both declarations survive: the style bag is appended to, not replaced.
    expect(html).toContain('text-align: center')
    expect(html).toContain('width: 50%')
  })

  it('declines outside a table', () => {
    const state = stateAt(docOf(p('plain')), [0], 0)
    expect(setColumnWidth('50%')(state)).toBeNull()
    expect(clearTableSizing(state)).toBeNull()
  })
})

describe('setTableSizing', () => {
  const threeByTwo = (): EditorNode =>
    docOf(table(row(cell('a'), cell('b'), cell('c')), row(cell('d'), cell('e'), cell('f'))))

  it('pins every column at once and fixes the layout', () => {
    const next = run(
      stateAt(threeByTwo(), inCell(0, 0)),
      setTableSizing({ columnWidths: [100, 150.4, 200], width: 450.4 }),
    )
    const sized = next.doc.child(0)
    for (const r of sized.content.children) {
      expect(r.content.children.map((c) => c.attrs.width)).toEqual(['100px', '150px', '200px'])
    }
    expect(sized.attrs.layout).toBe('fixed')
    expect(sized.attrs.width).toBe('450px')
  })

  /**
   * Pixels are a measurement of the window the drag happened in. Resize a
   * table in fullscreen and those pixels outlive it: `table-layout: fixed`
   * widens a table to fit its columns whatever `max-width` says, so the table
   * hangs off the edge of the narrower editor afterwards.
   */
  it('stores proportions, not pixels, when told the space it sits in', () => {
    const next = run(
      stateAt(threeByTwo(), inCell(0, 0)),
      setTableSizing({ columnWidths: [225, 135, 90], width: 450 }, { relativeTo: 900 }),
    )
    const sized = next.doc.child(0)
    // Columns are a share of the table…
    for (const r of sized.content.children) {
      expect(r.content.children.map((c) => c.attrs.width)).toEqual(['50%', '30%', '20%'])
    }
    // …and the table a share of the room it was given.
    expect(sized.attrs.width).toBe('50%')
    expect(sized.attrs.layout).toBe('fixed')
  })

  it('never stores a table wider than the space it sits in', () => {
    const next = run(
      stateAt(threeByTwo(), inCell(0, 0)),
      setTableSizing({ columnWidths: [500, 500], width: 1000 }, { relativeTo: 600 }),
    )
    expect(next.doc.child(0).attrs.width).toBe('100%')
  })

  it('still stores pixels when no space is given, as before', () => {
    const next = run(
      stateAt(threeByTwo(), inCell(0, 0)),
      setTableSizing({ columnWidths: [100, 150, 200], width: 450 }),
    )
    expect(next.doc.child(0).attrs.width).toBe('450px')
    expect(next.doc.child(0).child(0).child(0).attrs.width).toBe('100px')
  })

  it('gives a merged cell the combined width of the columns it spans', () => {
    const doc = docOf(
      table(row(cell('wide', { colspan: 2 }), cell('c')), row(cell('a'), cell('b'), cell('c'))),
    )
    const next = run(stateAt(doc, inCell(1, 0)), setTableSizing({ columnWidths: [100, 150, 200] }))
    expect(next.doc.child(0).child(0).child(0).attrs.width).toBe('250px')
    expect(next.doc.child(0).child(0).child(1).attrs.width).toBe('200px')
  })

  it('sizes only the rows named, and clears one with null', () => {
    let state = run(
      stateAt(threeByTwo(), inCell(0, 0)),
      setTableSizing({ rowHeights: [undefined, 60] }),
    )
    expect(state.doc.child(0).child(0).attrs.height).toBeNull()
    expect(state.doc.child(0).child(1).attrs.height).toBe('60px')
    // Columns were not mentioned, so nothing else changes.
    expect(state.doc.child(0).attrs.layout).toBeNull()
    expect(state.doc.child(0).child(0).child(0).attrs.width).toBeNull()
    state = run(state, setTableSizing({ rowHeights: [undefined, null] }))
    expect(state.doc.child(0).child(1).attrs.height).toBeNull()
  })

  it('targets a table by path, leaving the selection out of it', () => {
    const doc = docOf(p('before'), table(row(cell('a'), cell('b'))))
    // The caret is in the paragraph, not the table.
    const next = run(
      stateAt(doc, [0], 0),
      setTableSizing({ columnWidths: [80, 120], width: 200 }, { tablePath: [1] }),
    )
    expect(next.doc.child(1).child(0).child(1).attrs.width).toBe('120px')
    expect(next.doc.child(1).attrs.width).toBe('200px')
    expect(next.doc.child(0).textContent).toBe('before')
  })

  it('declines outside every table, and for a path that is not a table', () => {
    const doc = docOf(p('text'), table(row(cell('a'))))
    expect(setTableSizing({ columnWidths: [80] })(stateAt(doc, [0], 0))).toBeNull()
    expect(
      setTableSizing({ columnWidths: [80] }, { tablePath: [0] })(stateAt(doc, [0], 0)),
    ).toBeNull()
  })

  it('refuses sizes that are not positive numbers', () => {
    const state = stateAt(threeByTwo(), inCell(0, 0))
    expect(setTableSizing({ columnWidths: [100, -5, 200] })(state)).toBeNull()
    expect(setTableSizing({ columnWidths: [100, Number.NaN, 200] })(state)).toBeNull()
    expect(setTableSizing({ width: Number.POSITIVE_INFINITY })(state)).toBeNull()
    expect(setTableSizing({ rowHeights: [0] })(state)).toBeNull()
  })

  it('leaves a grid wider than the widths given alone', () => {
    const next = run(
      stateAt(threeByTwo(), inCell(0, 0)),
      setTableSizing({ columnWidths: [100, 150] }),
    )
    const first = next.doc.child(0).child(0)
    expect(first.child(0).attrs.width).toBe('100px')
    expect(first.child(2).attrs.width).toBeNull()
  })
})

describe('a table that is not the first node', () => {
  // Every other fixture puts the table at doc index 0, where a replacement
  // count and an end index happen to be the same number. They are not, and
  // only an offset table shows it.
  const offset = (): EditorNode =>
    docOf(p('before'), table(row(cell('a'), cell('b')), row(cell('c'), cell('d'))))

  const inOffsetCell = (rowIndex: number, cellIndex: number): Path => [1, rowIndex, cellIndex, 0]

  function gridAt(doc: EditorNode, index: number): string[][] {
    return doc
      .child(index)
      .content.children.map((r) => r.content.children.map((c) => c.textContent))
  }

  it('moves a row', () => {
    const next = run(stateAt(offset(), inOffsetCell(0, 0)), moveRow('down'))
    expect(gridAt(next.doc, 1)).toEqual([
      ['c', 'd'],
      ['a', 'b'],
    ])
    // The paragraph in front is untouched.
    expect(next.doc.child(0).textContent).toBe('before')
  })

  it('moves a column', () => {
    const next = run(stateAt(offset(), inOffsetCell(0, 0)), moveColumn('right'))
    expect(gridAt(next.doc, 1)).toEqual([
      ['b', 'a'],
      ['d', 'c'],
    ])
  })

  it('swaps cell content', () => {
    const next = run(stateAt(offset(), inOffsetCell(0, 0)), swapCellContent('right'))
    expect(gridAt(next.doc, 1)[0]).toEqual(['b', 'a'])
  })

  it('sets and clears sizes', () => {
    let state = run(stateAt(offset(), inOffsetCell(0, 0)), setColumnWidth('120px'))
    expect(state.doc.child(1).child(0).child(0).attrs.width).toBe('120px')
    state = run(state, distributeColumnsEvenly())
    expect(state.doc.child(1).child(0).child(0).attrs.width).toBe('50%')
    state = run(state, clearTableSizing)
    expect(state.doc.child(1).child(0).child(0).attrs.width).toBeNull()
    expect(state.doc.childCount).toBe(2)
  })
})
