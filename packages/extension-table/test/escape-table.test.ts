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
import { escapeTableOnEnter } from '../src/commands'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

const p = (text = ''): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
const cellOf = (...blocks: EditorNode[]): EditorNode =>
  schema.node('tableCell', { header: false, colspan: 1, align: null }, Fragment.from(blocks))
const row = (...cells: EditorNode[]): EditorNode =>
  schema.node('tableRow', undefined, Fragment.from(cells))
const table = (...rows: EditorNode[]): EditorNode =>
  schema.node('table', undefined, Fragment.from(rows))
const docOf = (...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', undefined, Fragment.from(blocks))

function stateAt(doc: EditorNode, path: Path, offset = 0): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, offset)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** Every node whose content its own type rejects. */
function invalidNodes(doc: EditorNode): string[] {
  const problems: string[] = []
  const walk = (node: EditorNode): void => {
    if (!node.type.validContent(node.content)) problems.push(node.type.name)
    for (const child of node.content.children) walk(child)
  }
  walk(doc)
  return problems
}

describe('escapeTableOnEnter', () => {
  it('leaves the table from an empty last paragraph of the bottom-right cell', () => {
    const doc = docOf(table(row(cellOf(p('a')), cellOf(p('b'), p()))))
    const next = run(stateAt(doc, [0, 0, 1, 1]), escapeTableOnEnter)
    expect(next.doc.eq(docOf(table(row(cellOf(p('a')), cellOf(p('b')))), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
    expect(invalidNodes(next.doc)).toEqual([])
  })

  it('keeps the blank paragraph when it is all the cell has', () => {
    const doc = docOf(table(row(cellOf(p('a')), cellOf(p()))))
    const next = run(stateAt(doc, [0, 0, 1, 0]), escapeTableOnEnter)
    expect(next.doc.eq(docOf(table(row(cellOf(p('a')), cellOf(p()))), p()))).toBe(true)
    expect(invalidNodes(next.doc)).toEqual([])
  })

  it('declines in a cell that is not the last of its row', () => {
    const doc = docOf(table(row(cellOf(p()), cellOf(p('b')))))
    expect(escapeTableOnEnter(stateAt(doc, [0, 0, 0, 0]))).toBeNull()
  })

  it('declines in a row that is not the last', () => {
    const doc = docOf(table(row(cellOf(p())), row(cellOf(p('b')))))
    expect(escapeTableOnEnter(stateAt(doc, [0, 0, 0, 0]))).toBeNull()
  })

  it('declines while the paragraph still has text, so Enter splits', () => {
    const doc = docOf(table(row(cellOf(p('written')))))
    expect(escapeTableOnEnter(stateAt(doc, [0, 0, 0, 0], 7))).toBeNull()
  })

  it('declines outside a table', () => {
    expect(escapeTableOnEnter(stateAt(docOf(p()), [0]))).toBeNull()
  })

  it('lands after the table, not at the end of the document', () => {
    const doc = docOf(table(row(cellOf(p('a'), p()))), p('below'))
    const next = run(stateAt(doc, [0, 0, 0, 1]), escapeTableOnEnter)
    expect(next.doc.eq(docOf(table(row(cellOf(p('a')))), p(), p('below')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })
})
