import { describe, expect, it } from 'vitest'
import type { Command } from '../src/commands/commands'
import { liftListItem, sinkListItem, splitListItem, toggleList } from '../src/commands/lists'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import type { EditorState } from '../src/state/editor-state'
import { cursor, doc, p, range, stateWith, testSchema } from './helpers'

function ul(...items: EditorNode[]): EditorNode {
  return testSchema.node('bulletList', undefined, Fragment.from(items))
}

function ol(...items: EditorNode[]): EditorNode {
  return testSchema.node('orderedList', undefined, Fragment.from(items))
}

function li(...blocks: EditorNode[]): EditorNode {
  return testSchema.node('listItem', undefined, Fragment.from(blocks))
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

describe('toggleList', () => {
  it('wraps sibling paragraphs into a list, one item each', () => {
    const state = stateWith(doc(p('a'), p('b')), range([0], 0, [1], 1))
    const next = run(state, toggleList('bulletList'))
    expect(next.doc.eq(doc(ul(li(p('a')), li(p('b')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 0 })
    expect(next.selection.to).toEqual({ path: [0, 1, 0], offset: 1 })
  })

  it('unwraps a same-type list back to paragraphs', () => {
    const state = stateWith(doc(ul(li(p('a')), li(p('b')))), cursor([0, 1, 0], 1))
    const next = run(state, toggleList('bulletList'))
    expect(next.doc.eq(doc(p('a'), p('b')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 1 })
  })

  it('retypes a different list type in place', () => {
    const state = stateWith(doc(ul(li(p('a')))), cursor([0, 0, 0], 1))
    const next = run(state, toggleList('orderedList'))
    expect(next.doc.eq(doc(ol(li(p('a')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 1 })
  })
})

describe('splitListItem', () => {
  it('splits an item at the cursor', () => {
    const state = stateWith(doc(ul(li(p('abcd')))), cursor([0, 0, 0], 2))
    const next = run(state, splitListItem)
    expect(next.doc.eq(doc(ul(li(p('ab')), li(p('cd')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 1, 0], offset: 0 })
  })

  it('Enter on an empty item lifts out of the list', () => {
    const state = stateWith(doc(ul(li(p('a')), li(p()))), cursor([0, 1, 0], 0))
    const next = run(state, splitListItem)
    expect(next.doc.eq(doc(ul(li(p('a'))), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('does not apply outside a list', () => {
    const state = stateWith(doc(p('x')), cursor([0], 0))
    expect(splitListItem(state)).toBeNull()
  })
})

describe('sinkListItem', () => {
  it('nests an item under its previous sibling', () => {
    const state = stateWith(doc(ul(li(p('a')), li(p('b')))), cursor([0, 1, 0], 1))
    const next = run(state, sinkListItem)
    expect(next.doc.eq(doc(ul(li(p('a'), ul(li(p('b')))))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 1, 0, 0], offset: 1 })
  })

  it('appends to an existing nested list', () => {
    const state = stateWith(doc(ul(li(p('a'), ul(li(p('b')))), li(p('c')))), cursor([0, 1, 0], 0))
    const next = run(state, sinkListItem)
    expect(next.doc.eq(doc(ul(li(p('a'), ul(li(p('b')), li(p('c')))))))).toBe(true)
  })

  it('cannot sink the first item', () => {
    const state = stateWith(doc(ul(li(p('a')))), cursor([0, 0, 0], 0))
    expect(sinkListItem(state)).toBeNull()
  })
})

describe('liftListItem', () => {
  it('lifts a middle item out, splitting the list', () => {
    const state = stateWith(doc(ul(li(p('a')), li(p('b')), li(p('c')))), cursor([0, 1, 0], 1))
    const next = run(state, liftListItem)
    expect(next.doc.eq(doc(ul(li(p('a'))), p('b'), ul(li(p('c')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 1 })
  })

  it('lifts the only item, removing the list', () => {
    const state = stateWith(doc(ul(li(p('a')))), cursor([0, 0, 0], 0))
    const next = run(state, liftListItem)
    expect(next.doc.eq(doc(p('a')))).toBe(true)
  })

  it('round-trips with sinkListItem', () => {
    const original = doc(ul(li(p('a')), li(p('b'))))
    const state = stateWith(original, cursor([0, 1, 0], 0))
    const sunk = run(state, sinkListItem)
    const lifted = run(sunk, liftListItem)
    expect(lifted.doc.eq(original)).toBe(true)
  })
})
