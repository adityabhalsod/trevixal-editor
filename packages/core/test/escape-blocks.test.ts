import { describe, expect, it } from 'vitest'
import {
  deleteEmptyBlockAfterContainer,
  escapeWrapperOnBackspace,
  escapeWrapperOnEnter,
  exitEnclosingBlock,
} from '../src/commands/commands'
import type { Command } from '../src/commands/commands'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import type { EditorState } from '../src/state/editor-state'
import { blockquote, cursor, doc, hr, p, stateWith, testSchema } from './helpers'

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

describe('escapeWrapperOnEnter', () => {
  it('leaves a blockquote from its empty last paragraph', () => {
    const state = stateWith(doc(blockquote(p('quoted'), p())), cursor([0, 1], 0))
    const next = run(state, escapeWrapperOnEnter)
    expect(next.doc.eq(doc(blockquote(p('quoted')), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('declines while the paragraph still has text, so Enter splits', () => {
    const state = stateWith(doc(blockquote(p('quoted'))), cursor([0, 0], 6))
    expect(escapeWrapperOnEnter(state)).toBeNull()
  })

  it('declines from a blank line that is not the last, so Enter splits', () => {
    const state = stateWith(doc(blockquote(p(), p('after'))), cursor([0, 0], 0))
    expect(escapeWrapperOnEnter(state)).toBeNull()
  })

  it('declines when emptying the wrapper would leave it invalid', () => {
    const state = stateWith(doc(blockquote(p())), cursor([0, 0], 0))
    expect(escapeWrapperOnEnter(state)).toBeNull()
  })

  it('declines in a top-level paragraph', () => {
    const state = stateWith(doc(p()), cursor([0], 0))
    expect(escapeWrapperOnEnter(state)).toBeNull()
  })

  it('leaves only the innermost wrapper when they nest', () => {
    const state = stateWith(doc(blockquote(p('a'), blockquote(p('b'), p()))), cursor([0, 1, 1], 0))
    const next = run(state, escapeWrapperOnEnter)
    expect(next.doc.eq(doc(blockquote(p('a'), blockquote(p('b')), p())))).toBe(true)
  })
})

describe('escapeWrapperOnBackspace', () => {
  it('takes the empty line "> " made back out of the quote', () => {
    const state = stateWith(doc(p('intro'), blockquote(p())), cursor([1, 0], 0))
    const next = run(state, escapeWrapperOnBackspace)
    expect(next.doc.eq(doc(p('intro'), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('moves an empty first line out above the rest of the quote', () => {
    const state = stateWith(doc(blockquote(p(), p('after'))), cursor([0, 0], 0))
    const next = run(state, escapeWrapperOnBackspace)
    expect(next.doc.eq(doc(p(), blockquote(p('after'))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0], offset: 0 })
  })

  it('leaves one quote at a time when quotes nest', () => {
    const state = stateWith(doc(blockquote(blockquote(p()))), cursor([0, 0, 0], 0))
    const next = run(state, escapeWrapperOnBackspace)
    expect(next.doc.eq(doc(blockquote(p())))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0], offset: 0 })
  })

  it('declines on a line with text, so Backspace deletes as before', () => {
    const state = stateWith(doc(blockquote(p('a'))), cursor([0, 0], 0))
    expect(escapeWrapperOnBackspace(state)).toBeNull()
  })

  it('declines below the first line, where Backspace joins the line above', () => {
    const state = stateWith(doc(blockquote(p('a'), p())), cursor([0, 1], 0))
    expect(escapeWrapperOnBackspace(state)).toBeNull()
  })

  it('declines in a list item, whose list takes it out itself', () => {
    const state = stateWith(doc(ul(li(p()))), cursor([0, 0, 0], 0))
    expect(escapeWrapperOnBackspace(state)).toBeNull()
  })

  it('declines in a top-level paragraph', () => {
    const state = stateWith(doc(p()), cursor([0], 0))
    expect(escapeWrapperOnBackspace(state)).toBeNull()
  })
})

describe('deleteEmptyBlockAfterContainer', () => {
  it('drops an empty line after a list, the caret going to the end of its last point', () => {
    const state = stateWith(doc(ol(li(p('One')), li(p('Two'))), p()), cursor([1], 0))
    const next = run(state, deleteEmptyBlockAfterContainer)
    expect(next.doc.eq(doc(ol(li(p('One')), li(p('Two')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 1, 0], offset: 3 })
  })

  it('reaches the last line of a nested list', () => {
    const state = stateWith(doc(ul(li(p('a'), ul(li(p('b'))))), p()), cursor([1], 0))
    const next = run(state, deleteEmptyBlockAfterContainer)
    expect(next.doc.eq(doc(ul(li(p('a'), ul(li(p('b')))))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 1, 0, 0], offset: 1 })
  })

  it('drops an empty line after a quote', () => {
    const state = stateWith(doc(blockquote(p('q')), p()), cursor([1], 0))
    const next = run(state, deleteEmptyBlockAfterContainer)
    expect(next.doc.eq(doc(blockquote(p('q'))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0], offset: 1 })
  })

  it('declines on a line with text', () => {
    const state = stateWith(doc(ul(li(p('a'))), p('x')), cursor([1], 0))
    expect(deleteEmptyBlockAfterContainer(state)).toBeNull()
  })

  it('declines after a plain paragraph, which Backspace joins as before', () => {
    const state = stateWith(doc(p('a'), p()), cursor([1], 0))
    expect(deleteEmptyBlockAfterContainer(state)).toBeNull()
  })

  it('declines when the container does not end in a line of text', () => {
    const state = stateWith(doc(blockquote(p('a'), hr()), p()), cursor([1], 0))
    expect(deleteEmptyBlockAfterContainer(state)).toBeNull()
  })
})

describe('exitEnclosingBlock', () => {
  it('lands after the whole outer block, from any depth', () => {
    const state = stateWith(doc(blockquote(p('quoted'))), cursor([0, 0], 3))
    const next = run(state, exitEnclosingBlock)
    expect(next.doc.eq(doc(blockquote(p('quoted')), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('escapes the outermost wrapper, not just one level', () => {
    const state = stateWith(doc(blockquote(blockquote(p('deep')))), cursor([0, 0, 0], 2))
    const next = run(state, exitEnclosingBlock)
    expect(next.doc.eq(doc(blockquote(blockquote(p('deep'))), p()))).toBe(true)
  })

  it('keeps text where it is rather than carrying it out', () => {
    const state = stateWith(doc(p('one'), blockquote(p('two'))), cursor([1, 0], 1))
    const next = run(state, exitEnclosingBlock)
    expect(next.doc.eq(doc(p('one'), blockquote(p('two')), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [2], offset: 0 })
  })

  it('declines in a top-level block, leaving the key free', () => {
    const state = stateWith(doc(p('plain')), cursor([0], 2))
    expect(exitEnclosingBlock(state)).toBeNull()
  })
})
