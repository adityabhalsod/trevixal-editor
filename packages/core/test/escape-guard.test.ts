import { describe, expect, it } from 'vitest'
import {
  Schema,
  defaultMarks,
  defaultNodes,
  escapeWrapperOnEnter,
  exitEnclosingBlock,
} from '../src/index'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { EditorState } from '../src/state/editor-state'
import { TextSelection } from '../src/state/selection'

// A table-shaped schema: the point is the grandparent that takes only rows,
// which is what must stop a paragraph being lifted into it.
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    grid: { content: 'gridRow+', group: 'block', toHTML: () => ({ tag: 'table' }) },
    gridRow: { content: 'gridCell+', toHTML: () => ({ tag: 'tr' }) },
    gridCell: { content: 'block+', toHTML: () => ({ tag: 'td' }) },
  },
  marks: defaultMarks(),
})

function node(name: string, ...children: unknown[]) {
  return schema.node(name, undefined, Fragment.from(children as never))
}
const para = (t = '') => schema.node('paragraph', undefined, t ? [schema.text(t)] : [])

function stateAt(doc: ReturnType<typeof node>, path: number[], offset = 0) {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos(path, offset)),
  })
}

describe('the escape stops at a parent that would not take the block', () => {
  it('declines to lift a paragraph out of a cell, where only rows are allowed', () => {
    const doc = node('doc', node('grid', node('gridRow', node('gridCell', para('a'), para()))))
    expect(escapeWrapperOnEnter(stateAt(doc, [0, 0, 0, 1]))).toBeNull()
  })

  it('but Mod-Enter still leaves the whole grid', () => {
    const doc = node('doc', node('grid', node('gridRow', node('gridCell', para('a')))))
    const tr = exitEnclosingBlock(stateAt(doc, [0, 0, 0, 0], 1))
    expect(tr).not.toBeNull()
    const next = stateAt(doc, [0, 0, 0, 0], 1).apply(tr as NonNullable<typeof tr>)
    expect(next.doc.childCount).toBe(2)
    expect(next.doc.content.children[1]?.type.name).toBe('paragraph')
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })
})
