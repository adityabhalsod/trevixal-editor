import { describe, expect, it } from 'vitest'
import {
  deleteSelection,
  insertText,
  isMarkActive,
  joinBackward,
  lift,
  setBlockType,
  splitBlock,
  toggleMark,
  wrapIn,
} from '../src/commands/commands'
import type { Command } from '../src/commands/commands'
import type { EditorState } from '../src/state/editor-state'
import { blockquote, bold, cursor, doc, h, p, range, stateWith, testSchema, text } from './helpers'

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

describe('insertText', () => {
  it('types at the cursor and moves it', () => {
    const state = stateWith(doc(p('helo')), cursor([0], 3))
    const next = run(state, insertText('l'))
    expect(next.doc.eq(doc(p('hello')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0], offset: 4 })
  })

  it('replaces a same-block selection', () => {
    const state = stateWith(doc(p('abcdef')), range([0], 1, [0], 5))
    const next = run(state, insertText('X'))
    expect(next.doc.eq(doc(p('aXf')))).toBe(true)
  })

  it('replaces a cross-block selection and joins', () => {
    const state = stateWith(doc(p('one'), p('two'), p('three')), range([0], 2, [2], 3))
    const next = run(state, insertText('!'))
    expect(next.doc.eq(doc(p('on!ee')))).toBe(true)
  })

  it('inherits marks from the left neighbor', () => {
    const state = stateWith(doc(p(bold('hi'))), cursor([0], 2))
    const next = run(state, insertText('!'))
    expect(
      next.doc
        .child(0)
        .child(0)
        .marks.map((m) => m.type.name),
    ).toEqual(['bold'])
    expect(next.doc.child(0).childCount).toBe(1)
  })
})

describe('deleteSelection', () => {
  it('deletes within a block', () => {
    const state = stateWith(doc(p('abcdef')), range([0], 2, [0], 4))
    const next = run(state, deleteSelection)
    expect(next.doc.eq(doc(p('abef')))).toBe(true)
    expect(next.selection.empty).toBe(true)
  })

  it('deletes across sibling blocks, removing middles', () => {
    const state = stateWith(doc(p('one'), h(1, 'mid'), p('three')), range([0], 1, [2], 2))
    const next = run(state, deleteSelection)
    expect(next.doc.eq(doc(p('oree')))).toBe(true)
  })

  it('returns null on an empty selection', () => {
    const state = stateWith(doc(p('x')), cursor([0], 1))
    expect(deleteSelection(state)).toBeNull()
  })
})

describe('toggleMark', () => {
  it('adds then removes across a range', () => {
    const state = stateWith(doc(p('hello')), range([0], 1, [0], 4))
    const marked = run(state, toggleMark('bold'))
    expect(isMarkActive(marked, 'bold')).toBe(true)
    const unmarked = run(marked, toggleMark('bold'))
    expect(unmarked.doc.eq(doc(p('hello')))).toBe(true)
  })

  it('spans multiple blocks', () => {
    const state = stateWith(doc(p('one'), p('two')), range([0], 0, [1], 3))
    const marked = run(state, toggleMark('italic'))
    expect(isMarkActive(marked, 'italic')).toBe(true)
    expect(
      marked.doc
        .child(1)
        .child(0)
        .marks.map((m) => m.type.name),
    ).toEqual(['italic'])
  })

  it('removes exactly the marks present (mixed range)', () => {
    const state = stateWith(doc(p(text('ab'), bold('cd'), text('ef'))), range([0], 0, [0], 6))
    // Not fully bold → first toggle adds everywhere.
    const marked = run(state, toggleMark('bold'))
    expect(marked.doc.child(0).childCount).toBe(1)
    const cleared = run(marked, toggleMark('bold'))
    expect(cleared.doc.eq(doc(p('abcdef')))).toBe(true)
  })

  it('toggles stored marks at a cursor', () => {
    const state = stateWith(doc(p('hi')), cursor([0], 1))
    const tr = toggleMark('bold')(state)
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.storedMarks?.map((m) => m.type.name)).toEqual(['bold'])
    expect(isMarkActive(next, 'bold')).toBe(true)
  })

  it('skips code blocks where marks are forbidden', () => {
    const code = testSchema.node('codeBlock', undefined, [text('let x')])
    const state = stateWith(doc(code), range([0], 0, [0], 5))
    expect(toggleMark('bold')(state)).toBeNull()
  })
})

describe('setBlockType', () => {
  it('converts paragraphs to headings and keeps the selection', () => {
    const state = stateWith(doc(p('title')), range([0], 1, [0], 3))
    const next = run(state, setBlockType('heading', { level: 2 }))
    expect(next.doc.eq(doc(h(2, 'title')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0], offset: 1 })
    expect(next.selection.to).toEqual({ path: [0], offset: 3 })
  })

  it('returns null when nothing changes', () => {
    const state = stateWith(doc(h(2, 'title')), cursor([0], 0))
    expect(setBlockType('heading', { level: 2 })(state)).toBeNull()
  })
})

describe('splitBlock and joinBackward', () => {
  it('splits a paragraph at the cursor', () => {
    const state = stateWith(doc(p('hello')), cursor([0], 2))
    const next = run(state, splitBlock)
    expect(next.doc.eq(doc(p('he'), p('llo')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('starts a paragraph after Enter at the end of a heading', () => {
    const state = stateWith(doc(h(1, 'title')), cursor([0], 5))
    const next = run(state, splitBlock)
    expect(next.doc.eq(doc(h(1, 'title'), p()))).toBe(true)
  })

  it('joins back into the previous block', () => {
    const state = stateWith(doc(p('he'), p('llo')), cursor([1], 0))
    const next = run(state, joinBackward)
    expect(next.doc.eq(doc(p('hello')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0], offset: 2 })
  })

  it('split then join round-trips', () => {
    const original = doc(p('roundtrip'))
    const state = stateWith(original, cursor([0], 4))
    const split = run(state, splitBlock)
    const joined = run(split, joinBackward)
    expect(joined.doc.eq(original)).toBe(true)
  })
})

describe('wrapIn and lift', () => {
  it('wraps blocks in a blockquote and lifts them out', () => {
    const state = stateWith(doc(p('a'), p('b')), range([0], 0, [1], 1))
    const wrapped = run(state, wrapIn('blockquote'))
    expect(wrapped.doc.eq(doc(blockquote(p('a'), p('b'))))).toBe(true)
    // Selection followed the content into the wrapper.
    expect(wrapped.selection.from).toEqual({ path: [0, 0], offset: 0 })
    const lifted = run(wrapped, lift)
    expect(lifted.doc.eq(doc(p('a'), p('b')))).toBe(true)
  })
})
