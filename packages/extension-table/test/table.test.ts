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
  addColumn,
  addRow,
  cellContextAt,
  columnCount,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  insertTable,
  mergeCells,
  setCellAlign,
  splitCell,
  toggleHeaderRow,
} from '../src/commands'
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
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.of(p(text)),
  )
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

const twoByTwo = (): EditorNode =>
  docOf(table(row(cell('a'), cell('b')), row(cell('c'), cell('d'))))

describe('insertTable', () => {
  it('replaces an empty paragraph with a table and enters the first cell', () => {
    const state = stateAt(docOf(p()), [0])
    const next = run(state, insertTable({ rows: 2, cols: 2 }))
    expect(next.doc.childCount).toBe(1)
    const inserted = next.doc.child(0)
    expect(inserted.type.name).toBe('table')
    expect(inserted.childCount).toBe(2)
    expect(inserted.child(0).child(0).attrs.header).toBe(true)
    expect(inserted.child(1).child(0).attrs.header).toBe(false)
    expect(next.selection.from).toEqual({ path: [0, 0, 0, 0], offset: 0 })
  })

  it('inserts after a non-empty block', () => {
    const state = stateAt(docOf(p('text')), [0], 2)
    const next = run(state, insertTable({ rows: 1, cols: 1, headerRow: false }))
    expect(next.doc.childCount).toBe(2)
    expect(next.doc.child(1).type.name).toBe('table')
  })
})

describe('rows and columns', () => {
  it('addRow after mirrors the column layout', () => {
    const state = stateAt(twoByTwo(), [0, 0, 0, 0])
    const next = run(state, addRow('after'))
    expect(next.doc.child(0).childCount).toBe(3)
    expect(next.doc.child(0).child(1).childCount).toBe(2)
    expect(next.selection.from).toEqual({ path: [0, 1, 0, 0], offset: 0 })
  })

  it('addColumn after inserts a cell in every row', () => {
    const state = stateAt(twoByTwo(), [0, 0, 0, 0])
    const next = run(state, addColumn('after'))
    for (const tableRow of next.doc.child(0).content.children) {
      expect(tableRow.childCount).toBe(3)
    }
    expect(next.doc.child(0).child(0).child(1).textContent).toBe('')
    expect(next.doc.child(0).child(0).child(2).textContent).toBe('b')
  })

  it('addColumn widens a spanning cell instead of splitting it', () => {
    const doc = docOf(table(row(cell('a'), cell('b')), row(cell('wide', { colspan: 2 }))))
    const state = stateAt(doc, [0, 0, 0, 0])
    const next = run(state, addColumn('after'))
    expect(next.doc.child(0).child(0).childCount).toBe(3)
    expect(next.doc.child(0).child(1).childCount).toBe(1)
    expect(next.doc.child(0).child(1).child(0).attrs.colspan).toBe(3)
  })

  it('deleteRow removes the row; the last row deletes the table', () => {
    const state = stateAt(twoByTwo(), [0, 0, 0, 0])
    const next = run(state, deleteRow)
    expect(next.doc.child(0).childCount).toBe(1)
    expect(next.doc.child(0).child(0).child(0).textContent).toBe('c')
    const last = run(stateAt(next.doc, [0, 0, 0, 0]), deleteRow)
    expect(last.doc.child(0).type.name).toBe('paragraph')
  })

  it('deleteColumn removes the column across rows', () => {
    const state = stateAt(twoByTwo(), [0, 0, 1, 0])
    const next = run(state, deleteColumn)
    expect(next.doc.child(0).child(0).childCount).toBe(1)
    expect(next.doc.child(0).child(0).child(0).textContent).toBe('a')
    expect(next.doc.child(0).child(1).child(0).textContent).toBe('c')
  })

  it('deleteColumn narrows spanning cells', () => {
    const doc = docOf(table(row(cell('a'), cell('b')), row(cell('wide', { colspan: 2 }))))
    const state = stateAt(doc, [0, 0, 1, 0])
    const next = run(state, deleteColumn)
    expect(next.doc.child(0).child(0).childCount).toBe(1)
    expect(next.doc.child(0).child(1).child(0).attrs.colspan).toBe(1)
  })
})

describe('merge and split', () => {
  it('merges adjacent cells in a row, concatenating content', () => {
    const state = EditorState.create({
      schema,
      doc: twoByTwo(),
      selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 0, 1, 0], 1)),
    })
    const next = run(state, mergeCells)
    const mergedRow = next.doc.child(0).child(0)
    expect(mergedRow.childCount).toBe(1)
    expect(mergedRow.child(0).attrs.colspan).toBe(2)
    expect(mergedRow.child(0).textContent).toBe('ab')
    expect(columnCount(next.doc.child(0))).toBe(2)
  })

  it('splits a merged cell back into unit cells', () => {
    const merged = run(
      EditorState.create({
        schema,
        doc: twoByTwo(),
        selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 0, 1, 0], 1)),
      }),
      mergeCells,
    )
    const next = run(merged, splitCell)
    const splitRow = next.doc.child(0).child(0)
    expect(splitRow.childCount).toBe(2)
    expect(splitRow.child(0).textContent).toBe('ab')
    expect(splitRow.child(1).textContent).toBe('')
    expect(splitRow.child(0).attrs.colspan).toBe(1)
  })

  it('splitCell copies the cell attributes onto every clone', () => {
    // Converted from an exploration probe. Only colspan and width were pinned
    // before, and those are the two the command rewrites. Nothing checked
    // that the styling a user set on the merged cell survives the split, so a
    // spread turning into an explicit pick would have gone unnoticed.
    const merged = run(
      EditorState.create({
        schema,
        doc: docOf(
          table(
            row(
              cell('ab', { header: true, align: 'center', background: '#ff0000', width: '120px' }),
              cell('c', { width: '80px' }),
            ),
          ),
        ),
        selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 0, 1, 0], 1)),
      }),
      mergeCells,
    )
    const splitRow = run(merged, splitCell).doc.child(0).child(0)
    expect(splitRow.childCount).toBe(2)
    for (const clone of splitRow.content.children) {
      expect(clone.attrs).toMatchObject({
        header: true,
        align: 'center',
        background: '#ff0000',
        colspan: 1,
      })
    }
    // The width is the one attribute that is divided rather than copied.
    expect(splitRow.content.children.map((c) => c.attrs.width)).toEqual(['100px', '100px'])
  })

  it('refuses to merge across rows', () => {
    const state = EditorState.create({
      schema,
      doc: twoByTwo(),
      selection: new TextSelection(pos([0, 0, 0, 0], 0), pos([0, 1, 0, 0], 1)),
    })
    expect(mergeCells(state)).toBeNull()
  })
})

describe('header row and alignment', () => {
  it('toggleHeaderRow flips the first row and serializes as th', () => {
    const state = stateAt(twoByTwo(), [0, 0, 0, 0])
    const next = run(state, toggleHeaderRow)
    expect(
      next.doc
        .child(0)
        .child(0)
        .content.children.every((c) => c.attrs.header),
    ).toBe(true)
    expect(serializeToHTML(next.doc)).toContain('<th>')
    const back = run(stateAt(next.doc, [0, 0, 0, 0]), toggleHeaderRow)
    expect(serializeToHTML(back.doc)).not.toContain('<th>')
  })

  it('setCellAlign styles a single cell', () => {
    const state = stateAt(twoByTwo(), [0, 0, 1, 0])
    const next = run(state, setCellAlign('center'))
    expect(next.doc.child(0).child(0).child(1).attrs.align).toBe('center')
    expect(serializeToHTML(next.doc)).toContain('style="text-align: center"')
  })
})

describe('navigation', () => {
  it('Tab walks cells row-major and grows the table at the end', () => {
    let state = stateAt(twoByTwo(), [0, 0, 0, 0])
    state = run(state, goToNextCell(1))
    expect(state.selection.from.path).toEqual([0, 0, 1, 0])
    state = run(state, goToNextCell(1))
    expect(state.selection.from.path).toEqual([0, 1, 0, 0])
    state = run(state, goToNextCell(1))
    expect(state.selection.from.path).toEqual([0, 1, 1, 0])
    state = run(state, goToNextCell(1)) // last cell: adds a row
    expect(state.doc.child(0).childCount).toBe(3)
    expect(state.selection.from.path).toEqual([0, 2, 0, 0])
  })

  it('Shift-Tab walks backwards and stops before the table', () => {
    let state = stateAt(twoByTwo(), [0, 1, 0, 0])
    state = run(state, goToNextCell(-1))
    expect(state.selection.from.path).toEqual([0, 0, 1, 0])
    state = run(state, goToNextCell(-1))
    expect(state.selection.from.path).toEqual([0, 0, 0, 0])
    expect(goToNextCell(-1)(state)).toBeNull()
  })

  it('returns null outside tables', () => {
    const state = stateAt(docOf(p('x')), [0])
    expect(goToNextCell(1)(state)).toBeNull()
    expect(cellContextAt(state.doc, state.selection.from)).toBeNull()
  })

  it('walks into a shorter row, and back to the cell it came from', () => {
    // Pasted HTML can leave rows of different widths. Stepping off the end of
    // a wide row must land in the next row's first cell rather than in a cell
    // index that row does not have.
    const ragged = docOf(table(row(cell('a'), cell('b'), cell('c')), row(cell('d'))))
    let state = stateAt(ragged, [0, 0, 2, 0])
    state = run(state, goToNextCell(1))
    expect(state.selection.from.path).toEqual([0, 1, 0, 0])
    state = run(state, goToNextCell(-1))
    expect(state.selection.from.path).toEqual([0, 0, 2, 0])
  })
})

describe('structure integrity', () => {
  it('deleteTable leaves a valid document', () => {
    const state = stateAt(twoByTwo(), [0, 1, 1, 0])
    const next = run(state, deleteTable)
    expect(next.doc.child(0).type.name).toBe('paragraph')
    expect(next.doc.type.validContent(next.doc.content)).toBe(true)
  })

  it('all structural edits keep the schema valid', () => {
    let state = stateAt(twoByTwo(), [0, 0, 0, 0])
    for (const command of [addRow('before'), addColumn('before'), deleteColumn, deleteRow]) {
      state = run(state, command)
      const tableNode = state.doc.child(0)
      expect(tableNode.type.validContent(tableNode.content)).toBe(true)
      for (const r of tableNode.content.children) {
        expect(r.type.validContent(r.content)).toBe(true)
      }
    }
  })
})
