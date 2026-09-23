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
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { hideCellBorder } from '../src/cell-borders'
import { mergeCells, splitCell } from '../src/commands'
import {
  bandAt,
  boundariesOf,
  boundaryNear,
  drawColumnLine,
  drawRowLine,
  insertDrawnTable,
} from '../src/draw-table'
import { setTableBorders } from '../src/features'
import { tableNodes } from '../src/schema'
import { splitCellInto } from '../src/split-cells'

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
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.of(p(text)),
  )
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function docOf(...rows: EditorNode[]): EditorNode {
  return schema.node(
    'doc',
    undefined,
    Fragment.of(schema.node('table', undefined, Fragment.from(rows))),
  )
}

function caret(doc: EditorNode, path: Path = [0, 0, 0, 0]): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, 0)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** The table as rows of `text:colspan`. */
function grid(state: EditorState): string[][] {
  return state.doc
    .child(0)
    .content.children.map((line) =>
      line.content.children.map((node) => `${node.textContent}:${node.attrs.colspan}`),
    )
}

/** Every cell's erased sides, row by row. */
function erased(state: EditorState, tableIndex = 0): unknown[][] {
  return state.doc
    .child(tableIndex)
    .content.children.map((line) => line.content.children.map((node) => node.attrs.hiddenBorders))
}

const widths = (state: EditorState): unknown[][] =>
  state.doc
    .child(0)
    .content.children.map((line) => line.content.children.map((node) => node.attrs.width))

describe('hideCellBorder', () => {
  it('erases one side of one cell, listing sides in CSS order', () => {
    const doc = docOf(row(cell('a'), cell('b')))
    let state = run(caret(doc), hideCellBorder([0, 0, 1], 'left'))
    state = run(state, hideCellBorder([0, 0, 1], 'top'))
    expect(erased(state)).toEqual([[null, 'top left']])
  })

  it('is one step to undo', () => {
    const tr = hideCellBorder([0, 0, 0], 'right')(caret(docOf(row(cell('a'), cell('b')))))
    expect(tr?.steps).toHaveLength(1)
  })

  it('declines a side already erased, and a path that is not a cell', () => {
    const state = caret(docOf(row(cell('a', { hiddenBorders: 'right' }))))
    expect(hideCellBorder([0, 0, 0], 'right')(state)).toBeNull()
    expect(hideCellBorder([0, 0], 'right')(state)).toBeNull()
  })
})

describe('erased sides through split and merge', () => {
  it('keeps them on the outside when a cell splits, drawing the new lines between', () => {
    const doc = docOf(row(cell('a', { hiddenBorders: 'top right bottom left' })))
    const state = run(caret(doc), splitCellInto(3))
    expect(erased(state)).toEqual([['top bottom left', 'top bottom', 'top right bottom']])
  })

  it('does the same when a merged cell splits back', () => {
    const doc = docOf(row(cell('ab', { colspan: 2, hiddenBorders: 'right left' })))
    expect(erased(run(caret(doc), splitCell))).toEqual([['left', 'right']])
  })

  it('merges to the outer sides, and a top or bottom only where every cell had it', () => {
    const doc = docOf(
      row(
        cell('a', { hiddenBorders: 'top left' }),
        cell('b', { hiddenBorders: 'top right bottom' }),
      ),
    )
    const state = EditorState.create({
      schema,
      doc,
      selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 0, 1, 0], 1)),
    })
    expect(erased(run(state, mergeCells))).toEqual([['top right left']])
  })
})

describe('setTableBorders', () => {
  it('brings back every erased line along with the style', () => {
    const doc = docOf(
      row(cell('a', { hiddenBorders: 'right' }), cell('b', { hiddenBorders: 'top' })),
    )
    const state = run(caret(doc), setTableBorders('all'))
    expect(erased(state)).toEqual([[null, null]])
    expect(state.doc.child(0).attrs.borders).toBe('all')
  })

  it('still brings them back when the style is the one already set', () => {
    const state = run(
      caret(docOf(row(cell('a', { hiddenBorders: 'left' })))),
      setTableBorders(null),
    )
    expect(erased(state)).toEqual([[null]])
  })

  it('declines when there is nothing to change', () => {
    expect(setTableBorders(null)(caret(docOf(row(cell('a')))))).toBeNull()
  })
})

describe('hiddenBorders in HTML', () => {
  it('travels as data-hidden-borders, and survives a parse', () => {
    const doc = docOf(row(cell('a', { hiddenBorders: 'bottom top' }), cell('b')))
    const html = serializeToHTML(doc)
    expect(html).toContain('<td data-hidden-borders="top bottom">')
    const back = parseHTML(schema, html, document)
    expect(back.child(0).child(0).child(0).attrs.hiddenBorders).toBe('top bottom')
  })

  it('drops words that are not sides', () => {
    const back = parseHTML(
      schema,
      '<table><tr><td data-hidden-borders="left middle"></td></tr></table>',
      document,
    )
    expect(back.child(0).child(0).child(0).attrs.hiddenBorders).toBe('left')
  })
})

describe('drawColumnLine', () => {
  const geometry = { columns: [100, 100], rows: [20, 20], width: 200, room: 400 }
  const doc = docOf(row(cell('a'), cell('b')), row(cell('c'), cell('d')))

  it('splits the cells it crosses where it was drawn, the other rows spanning the new column', () => {
    const line = { tablePath: [0], geometry, x: 30, fromRow: 0, toRow: 0 }
    const state = run(caret(doc), drawColumnLine(line))
    expect(grid(state)).toEqual([
      ['a:1', ':1', 'b:1'],
      ['c:2', 'd:1'],
    ])
    expect(widths(state)).toEqual([
      ['15%', '35%', '50%'],
      ['50%', '50%'],
    ])
    expect(state.doc.child(0).attrs.layout).toBe('fixed')
    // The caret goes to the new cell right of the line.
    expect(state.selection.from).toEqual(pos([0, 0, 1, 0], 0))
  })

  it('crosses every row between where it started and where it ended', () => {
    const line = { tablePath: [0], geometry, x: 150, fromRow: 1, toRow: 0 }
    expect(grid(run(caret(doc), drawColumnLine(line)))).toEqual([
      ['a:1', 'b:1', ':1'],
      ['c:1', 'd:1', ':1'],
    ])
  })

  it('lands on a line already there rather than cutting a sliver of a column', () => {
    const line = { tablePath: [0], geometry, x: 103, fromRow: 0, toRow: 1 }
    expect(drawColumnLine(line)(caret(doc))).toBeNull()
  })

  it('splits a merged cell back along the line it lands on', () => {
    const merged = docOf(row(cell('ab', { colspan: 2 })), row(cell('c'), cell('d')))
    const line = { tablePath: [0], geometry, x: 98, fromRow: 0, toRow: 0 }
    const state = run(caret(merged), drawColumnLine(line))
    expect(grid(state)).toEqual([
      ['ab:1', ':1'],
      ['c:1', 'd:1'],
    ])
    expect(widths(state)[0]).toEqual(['50%', '50%'])
  })

  it('draws a line again where the Eraser took it out', () => {
    const rubbed = docOf(
      row(cell('a', { hiddenBorders: 'right' }), cell('b', { hiddenBorders: 'left top' })),
      row(cell('c', { hiddenBorders: 'right' }), cell('d')),
    )
    const line = { tablePath: [0], geometry, x: 101, fromRow: 0, toRow: 0 }
    expect(erased(run(caret(rubbed), drawColumnLine(line)))).toEqual([
      [null, 'top'],
      ['right', null],
    ])
  })

  it('declines for a measurement of some other table', () => {
    const line = {
      tablePath: [0],
      geometry: { ...geometry, columns: [200] },
      x: 30,
      fromRow: 0,
      toRow: 0,
    }
    expect(drawColumnLine(line)(caret(doc))).toBeNull()
  })
})

describe('drawRowLine', () => {
  const geometry = { columns: [100, 100], rows: [40, 20], width: 200, room: 400 }

  it('splits the whole row where the line was drawn, the text staying above', () => {
    const doc = docOf(row(cell('a'), cell('b')), row(cell('c'), cell('d')))
    const line = { tablePath: [0], geometry, y: 15, fromColumn: 1, toColumn: 1 }
    const state = run(caret(doc), drawRowLine(line))
    expect(grid(state)).toEqual([
      ['a:1', 'b:1'],
      [':1', ':1'],
      ['c:1', 'd:1'],
    ])
    expect(state.doc.child(0).content.children.map((line) => line.attrs.height)).toEqual([
      '15px',
      '25px',
      null,
    ])
    expect(state.selection.from).toEqual(pos([0, 1, 1, 0], 0))
  })

  it('gives the new row the formatting of the cells, and the erased sides below the line', () => {
    const doc = docOf(
      row(cell('a', { header: true, background: '#ffeeaa', hiddenBorders: 'top bottom left' })),
      row(cell('c')),
    )
    const line = {
      tablePath: [0],
      geometry: { ...geometry, columns: [200] },
      y: 20,
      fromColumn: 0,
      toColumn: 0,
    }
    const state = run(caret(doc), drawRowLine(line))
    const [upper, lower] = [0, 1].map((index) => state.doc.child(0).child(index).child(0).attrs)
    expect(upper).toMatchObject({ header: true, hiddenBorders: 'top left' })
    expect(lower).toMatchObject({
      header: true,
      background: '#ffeeaa',
      hiddenBorders: 'bottom left',
    })
  })

  it('draws erased lines again, under the columns it crossed, when it lands on a row line', () => {
    const doc = docOf(
      row(cell('a', { hiddenBorders: 'bottom' }), cell('b', { hiddenBorders: 'bottom' })),
      row(cell('c', { hiddenBorders: 'top' }), cell('d')),
    )
    const line = { tablePath: [0], geometry, y: 42, fromColumn: 0, toColumn: 0 }
    expect(erased(run(caret(doc), drawRowLine(line)))).toEqual([
      [null, 'bottom'],
      [null, null],
    ])
  })

  it('declines when it lands on a line with nothing erased', () => {
    const doc = docOf(row(cell('a'), cell('b')), row(cell('c'), cell('d')))
    const line = { tablePath: [0], geometry, y: 38, fromColumn: 0, toColumn: 1 }
    expect(drawRowLine(line)(caret(doc))).toBeNull()
  })
})

describe('insertDrawnTable', () => {
  it('draws a table of one cell after the block, as wide and as tall as the box', () => {
    const doc = schema.node('doc', undefined, Fragment.from([p('one'), p('two')]))
    const state = run(
      caret(doc, [0]),
      insertDrawnTable({ block: 0, width: 300, height: 80, room: 600 }),
    )
    const table = state.doc.child(1)
    expect(state.doc.childCount).toBe(3)
    expect(table.type.name).toBe('table')
    expect(table.attrs.width).toBe('50%')
    expect(table.child(0).attrs.height).toBe('80px')
    expect(grid({ doc: schema.node('doc', undefined, Fragment.of(table)) } as EditorState)).toEqual(
      [[':1']],
    )
    expect(table.child(0).child(0).attrs.header).toBe(false)
    expect(state.selection.from).toEqual(pos([1, 0, 0, 0], 0))
  })

  it('takes the place of an empty paragraph', () => {
    const doc = schema.node('doc', undefined, Fragment.from([p('one'), p()]))
    const state = run(
      caret(doc, [0]),
      insertDrawnTable({ block: 1, width: 900, height: 30, room: 600 }),
    )
    expect(state.doc.content.children.map((node) => node.type.name)).toEqual(['paragraph', 'table'])
    // Never wider than the space it sits in.
    expect(state.doc.child(1).attrs.width).toBe('100%')
  })

  it('declines a box with no size', () => {
    const doc = schema.node('doc', undefined, Fragment.of(p('one')))
    expect(
      insertDrawnTable({ block: 0, width: 0, height: 30, room: 600 })(caret(doc, [0])),
    ).toBeNull()
  })
})

describe('grid lines', () => {
  it('runs the sizes into lines, and finds the one near a point or the band holding it', () => {
    const lines = boundariesOf([40, 60])
    expect(lines).toEqual([0, 40, 100])
    expect(boundaryNear(lines, 44)).toBe(1)
    expect(boundaryNear(lines, 50)).toBeNull()
    expect(bandAt(lines, 50)).toBe(1)
    // Past either end, the first or last band.
    expect(bandAt(lines, -5)).toBe(0)
    expect(bandAt(lines, 500)).toBe(1)
  })
})
