import { describe, expect, it } from 'vitest'
import { escapeWrapperOnEnter, exitEnclosingBlock } from '../src/commands/commands'
import type { Command } from '../src/commands/commands'
import type { EditorState } from '../src/state/editor-state'
import { blockquote, cursor, doc, p, stateWith } from './helpers'

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
