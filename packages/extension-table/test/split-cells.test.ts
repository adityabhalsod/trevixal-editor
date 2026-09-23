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
import { tableNodes } from '../src/schema'
import { MAX_SPLIT_COLUMNS, splitCellInto } from '../src/split-cells'

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

/** A caret in the cell at `rowIndex`, `cellIndex`. */
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

/** The table as rows of `text:colspan`, which is what a split changes. */
function grid(state: EditorState): string[][] {
  return state.doc
    .child(0)
    .content.children.map((line) =>
      line.content.children.map((node) => `${node.textContent}:${node.attrs.colspan}`),
    )
}

/** The three-by-three Word screenshot, before its first cell is split. */
const threeByThree = (): EditorNode =>
  docOf(
    row(cell('a'), cell('b'), cell('c')),
    row(cell('d'), cell('e'), cell('f')),
    row(cell('g'), cell('h'), cell('i')),
  )

describe('splitCellInto', () => {
  it('splits one cell, and widens the cell in its column in every other row', () => {
    const next = run(caret(threeByThree(), 0, 0), splitCellInto(2))
    // Word's picture: the first cell in two, the ones below it spanning both.
    expect(grid(next)).toEqual([
      ['a:1', ':1', 'b:1', 'c:1'],
      ['d:2', 'e:1', 'f:1'],
      ['g:2', 'h:1', 'i:1'],
    ])
  })

  it('splits a cell in the middle of a row the same way', () => {
    const next = run(caret(threeByThree(), 1, 1), splitCellInto(3))
    expect(grid(next)).toEqual([
      ['a:1', 'b:3', 'c:1'],
      ['d:1', 'e:1', ':1', ':1', 'f:1'],
      ['g:1', 'h:3', 'i:1'],
    ])
  })

  it('shares a merged cell’s columns out without touching other rows', () => {
    const doc = docOf(
      row(cell('ab', { colspan: 2 }), cell('c')),
      row(cell('d'), cell('e'), cell('f')),
    )
    const next = run(caret(doc, 0, 0), splitCellInto(2))
    expect(grid(next)).toEqual([
      ['ab:1', ':1', 'c:1'],
      ['d:1', 'e:1', 'f:1'],
    ])
  })

  it('shares an uneven split, the first cells taking the extra', () => {
    const doc = docOf(row(cell('x', { colspan: 5 })), row(...'abcde'.split('').map((t) => cell(t))))
    const next = run(caret(doc, 0, 0), splitCellInto(2))
    expect(grid(next)[0]).toEqual(['x:3', ':2'])
    expect(grid(next)[1]).toHaveLength(5)
  })

  it('adds only the columns a merged cell is short of', () => {
    // Two columns wide, split three ways: one more grid column, not three.
    const doc = docOf(row(cell('ab', { colspan: 2 })), row(cell('c'), cell('d')))
    const next = run(caret(doc, 0, 0), splitCellInto(3))
    expect(grid(next)).toEqual([
      ['ab:1', ':1', ':1'],
      ['c:1', 'd:2'],
    ])
  })

  it('splits every cell of a column selection, as Word does', () => {
    const next = run(drag(threeByThree(), [0, 0], [1, 0]), splitCellInto(2))
    // Both selected rows split; the row left out spans the pair.
    expect(grid(next)).toEqual([
      ['a:1', ':1', 'b:1', 'c:1'],
      ['d:1', ':1', 'e:1', 'f:1'],
      ['g:2', 'h:1', 'i:1'],
    ])
  })

  it('splits every cell of a row selection', () => {
    const next = run(drag(threeByThree(), [0, 0], [0, 1]), splitCellInto(2))
    expect(grid(next)).toEqual([
      ['a:1', ':1', 'b:1', ':1', 'c:1'],
      ['d:2', 'e:2', 'f:1'],
      ['g:2', 'h:2', 'i:1'],
    ])
  })

  it('splits a rectangle into a finer grid, leaving the rest spanning it', () => {
    const next = run(drag(threeByThree(), [0, 0], [1, 1]), splitCellInto(2))
    expect(grid(next)).toEqual([
      ['a:1', ':1', 'b:1', ':1', 'c:1'],
      ['d:1', ':1', 'e:1', ':1', 'f:1'],
      ['g:2', 'h:2', 'i:1'],
    ])
  })

  it('shares the cell’s width, and leaves a widened cell’s alone', () => {
    const doc = docOf(
      row(cell('a', { width: '30%' }), cell('b', { width: '70%' })),
      row(cell('c', { width: '30%' }), cell('d', { width: '70%' })),
    )
    const next = run(caret(doc, 0, 0), splitCellInto(3))
    const [first, second] = next.doc.child(0).content.children
    expect(first?.content.children.map((node) => node.attrs.width)).toEqual([
      '10%',
      '10%',
      '10%',
      '70%',
    ])
    // Still thirty percent: it covers the same stretch, over more columns.
    expect(second?.child(0).attrs.width).toBe('30%')
  })

  it('sizes an unsized cell’s new cells to the share it was measured at', () => {
    // A quarter of the table on screen: two cells of an eighth each. Nothing
    // else gets a width, so the browser still lays the rest out as before.
    const next = run(caret(threeByThree(), 0, 0), splitCellInto(2, { measure: () => 0.25 }))
    const widths = next.doc
      .child(0)
      .content.children.map((line) => line.content.children.map((node) => node.attrs.width))
    expect(widths).toEqual([
      ['12.5%', '12.5%', null, null],
      [null, null, null],
      [null, null, null],
    ])
  })

  it('prefers a cell’s own width to the measured one', () => {
    const doc = docOf(row(cell('a', { width: '40%' }), cell('b')))
    const next = run(caret(doc, 0, 0), splitCellInto(2, { measure: () => 0.9 }))
    expect(
      next.doc
        .child(0)
        .child(0)
        .content.children.map((node) => node.attrs.width),
    ).toEqual(['20%', '20%', null])
  })

  it('leaves the width unset when nothing could be measured', () => {
    const next = run(caret(threeByThree(), 0, 0), splitCellInto(2, { measure: () => null }))
    expect(next.doc.child(0).child(0).child(0).attrs.width).toBeNull()
  })

  it('measures every target before anything is split', () => {
    const measured: string[] = []
    const measure = (path: readonly number[]) => {
      measured.push(path.join('.'))
      return 0.25
    }
    run(drag(threeByThree(), [0, 0], [1, 0]), splitCellInto(2, { measure }))
    // Paths into the table as it was: the second row's first cell is still [0, 1, 0].
    expect(measured.sort()).toEqual(['0.0.0', '0.1.0'])
  })

  it('keeps the formatting on every new cell and the content in the first', () => {
    const doc = docOf(row(cell('head', { header: true, align: 'center', background: '#ffeeaa' })))
    const next = run(caret(doc, 0, 0), splitCellInto(3))
    const cells = next.doc.child(0).child(0).content.children
    expect(cells.map((node) => node.textContent)).toEqual(['head', '', ''])
    for (const node of cells) {
      expect(node.attrs.header).toBe(true)
      expect(node.attrs.align).toBe('center')
      expect(node.attrs.background).toBe('#ffeeaa')
    }
  })

  it('puts the caret in the first new cell of the top-left target', () => {
    const next = run(drag(threeByThree(), [1, 1], [2, 2]), splitCellInto(2))
    expect(next.selection.from).toEqual({ path: [0, 1, 1, 0], offset: 0 })
  })

  it('undoes as one step', () => {
    const state = caret(threeByThree(), 0, 0)
    const tr = splitCellInto(2)(state)
    expect(tr?.steps).toHaveLength(1)
  })

  it('declines outside a table, and for a count it cannot make', () => {
    const outside = EditorState.create({
      schema,
      doc: schema.node('doc', undefined, Fragment.of(p('x'))),
      selection: new TextSelection(pos([0], 0)),
    })
    expect(splitCellInto(2)(outside)).toBeNull()

    const inside = caret(threeByThree(), 0, 0)
    for (const count of [1, 0, -2, 2.5, Number.NaN, MAX_SPLIT_COLUMNS + 1]) {
      expect(splitCellInto(count)(inside)).toBeNull()
    }
    expect(splitCellInto(MAX_SPLIT_COLUMNS)(inside)).not.toBeNull()
  })
})
