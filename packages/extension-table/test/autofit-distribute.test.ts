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
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  autoFitContents,
  autoFitWindow,
  distributeColumnsEvenly,
  distributeRowsEvenly,
  fixColumnWidths,
} from '../src/resize'
import { tableNodes } from '../src/schema'
import type { TableGeometry } from '../src/table-geometry'

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

function caret(doc: EditorNode, rowIndex: number, cellIndex: number): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos([0, rowIndex, cellIndex, 0], 0)),
  })
}

/** A selection from the start of one cell to the end of another, as a drag makes. */
function drag(doc: EditorNode, from: Path, to: Path): EditorState {
  const end = doc
    .child(0)
    .child(to[0] as number)
    .child(to[1] as number).textContent.length
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos([0, ...from, 0], 0), pos([0, ...to, 0], end)),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** A page that shows every table the same way. */
function page(geometry: TableGeometry): { measure: () => TableGeometry } {
  return { measure: () => geometry }
}

const table = (state: EditorState): EditorNode => state.doc.child(0)
const widths = (state: EditorState): unknown[][] =>
  table(state).content.children.map((line) => line.content.children.map((c) => c.attrs.width))
const heights = (state: EditorState): unknown[] =>
  table(state).content.children.map((line) => line.attrs.height)

describe('autoFitContents', () => {
  it('lets the content size every column, the table shrinking to them', () => {
    const doc = docOf(
      { width: '80%', layout: 'fixed' },
      row(cell('a', { width: '30%' }), cell('b', { width: '70%' })),
    )
    const state = run(caret(doc, 0, 1), autoFitContents)
    expect(table(state).attrs).toMatchObject({ width: 'auto', layout: null })
    expect(widths(state)).toEqual([[null, null]])
  })

  it('leaves the rows their heights and the caret where it was', () => {
    const doc = docOf(
      {},
      schema.node('tableRow', { height: '40px' }, Fragment.from([cell('a'), cell('bc')])),
    )
    const before = EditorState.create({
      schema,
      doc,
      selection: new TextSelection(pos([0, 0, 1, 0], 1)),
    })
    const state = run(before, autoFitContents)
    expect(heights(state)).toEqual(['40px'])
    expect(state.selection.from).toEqual(pos([0, 0, 1, 0], 1))
  })

  it('declines for a table that already fits its contents, and outside a table', () => {
    expect(autoFitContents(caret(docOf({ width: 'auto' }, row(cell('a'))), 0, 0))).toBeNull()
    const prose = EditorState.create({ schema, content: undefined })
    expect(autoFitContents(prose)).toBeNull()
  })
})

describe('autoFitWindow', () => {
  it('widens the table to the window, each column keeping its share', () => {
    const doc = docOf(
      { width: '60%', layout: 'fixed' },
      row(cell('a', { width: '25%' }), cell('b', { width: '75%' })),
    )
    const state = run(caret(doc, 0, 0), autoFitWindow)
    expect(table(state).attrs).toMatchObject({ width: '100%', layout: 'fixed' })
    expect(widths(state)).toEqual([['25%', '75%']])
  })

  it('gives up widths in fixed units, which cannot follow the window', () => {
    const doc = docOf(
      { width: '900px', layout: 'fixed' },
      row(cell('a', { width: '300px' }), cell('b', { width: '600px' })),
    )
    const state = run(caret(doc, 0, 0), autoFitWindow)
    expect(table(state).attrs).toMatchObject({ width: '100%', layout: null })
    expect(widths(state)).toEqual([[null, null]])
  })

  it('turns a table fitted to its contents back to the full width', () => {
    const state = run(caret(docOf({ width: 'auto' }, row(cell('a'))), 0, 0), autoFitWindow)
    expect(table(state).attrs.width).toBe('100%')
    expect(autoFitWindow(state)).toBeNull()
  })
})

describe('fixColumnWidths', () => {
  const geometry = { columns: [150, 450], rows: [30, 30], width: 600, room: 600 }

  it('pins the columns at the widths the page shows, as shares of the table', () => {
    const doc = docOf({}, row(cell('a'), cell('b')), row(cell('c'), cell('d')))
    const state = run(caret(doc, 0, 0), fixColumnWidths(page(geometry)))
    expect(table(state).attrs).toMatchObject({ layout: 'fixed', width: '100%' })
    expect(widths(state)).toEqual([
      ['25%', '75%'],
      ['25%', '75%'],
    ])
  })

  it('declines when the table is not on the page to read', () => {
    const doc = docOf({}, row(cell('a'), cell('b')))
    expect(fixColumnWidths({ measure: () => null })(caret(doc, 0, 0))).toBeNull()
  })
})

describe('distributeRowsEvenly', () => {
  const geometry = { columns: [100, 100], rows: [20, 60, 30], width: 200, room: 400 }
  const doc = docOf(
    {},
    row(cell('a'), cell('b')),
    row(cell('c'), cell('d')),
    row(cell('e'), cell('f')),
  )

  it('makes every row as tall as the tallest when the selection is in one row', () => {
    const state = run(caret(doc, 2, 1), distributeRowsEvenly(page(geometry)))
    expect(heights(state)).toEqual(['60px', '60px', '60px'])
    expect(state.selection.from).toEqual(pos([0, 2, 1, 0], 0))
  })

  it('evens out only the rows selected', () => {
    const state = run(drag(doc, [0, 0], [1, 1]), distributeRowsEvenly(page(geometry)))
    expect(heights(state)).toEqual(['60px', '60px', null])
  })

  it('declines once the rows already match', () => {
    const state = run(caret(doc, 0, 0), distributeRowsEvenly(page(geometry)))
    expect(distributeRowsEvenly(page(geometry))(state)).toBeNull()
  })
})

describe('distributeColumnsEvenly', () => {
  const geometry = { columns: [100, 300, 200], rows: [20, 20], width: 600, room: 600 }
  const doc = docOf({}, row(cell('a'), cell('b'), cell('c')), row(cell('d'), cell('e'), cell('f')))

  it('shares the width of the selected columns between them, leaving the rest', () => {
    const state = run(drag(doc, [0, 1], [1, 2]), distributeColumnsEvenly(page(geometry)))
    expect(widths(state)).toEqual([
      ['16.67%', '41.67%', '41.67%'],
      ['16.67%', '41.67%', '41.67%'],
    ])
  })

  it('shares the whole table out when the selection is in one cell', () => {
    const state = run(caret(doc, 0, 1), distributeColumnsEvenly(page(geometry)))
    expect(widths(state)).toEqual([
      ['33.33%', '33.33%', '33.33%'],
      ['33.33%', '33.33%', '33.33%'],
    ])
    // The caret stays in its cell rather than jumping to the first.
    expect(state.selection.from).toEqual(pos([0, 0, 1, 0], 0))
  })

  it('shares the whole table out without a page to measure, whatever is selected', () => {
    const state = run(drag(doc, [0, 1], [1, 2]), distributeColumnsEvenly())
    expect(widths(state)[0]).toEqual(['33.33%', '33.33%', '33.33%'])
  })
})
