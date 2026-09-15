import { describe, expect, it } from 'vitest'
import type { Command } from '../src/commands/commands'
import { indentInPreformatted, outdentInPreformatted } from '../src/commands/commands'
import type { EditorState } from '../src/state/editor-state'
import { cursor, doc, p, range, stateWith, testSchema, text } from './helpers'

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** A document holding one code block. */
function codeDoc(source: string) {
  return doc(testSchema.node('codeBlock', undefined, source ? [text(source)] : []))
}

const codeText = (state: EditorState): string => state.doc.child(0).textContent

describe('indentInPreformatted', () => {
  it('inserts an indent at the caret', () => {
    const next = run(stateWith(codeDoc('let x = 1'), cursor([0], 0)), indentInPreformatted)
    expect(codeText(next)).toBe('  let x = 1')
    expect(next.selection.from).toEqual({ path: [0], offset: 2 })
  })

  it('indents mid-line, where a code editor inserts rather than aligns', () => {
    const next = run(stateWith(codeDoc('ab'), cursor([0], 1)), indentInPreformatted)
    expect(codeText(next)).toBe('a  b')
  })

  it('replaces a selection inside one line', () => {
    const next = run(stateWith(codeDoc('abcd'), range([0], 1, [0], 3)), indentInPreformatted)
    expect(codeText(next)).toBe('a  d')
  })

  it('indents every line a multi-line selection touches', () => {
    // Selecting into the second line must indent both, not replace them.
    const state = stateWith(codeDoc('one\ntwo\nthree'), range([0], 1, [0], 5))
    const next = run(state, indentInPreformatted)
    expect(codeText(next)).toBe('  one\n  two\nthree')
  })

  it('indents from the start of the first touched line, not the selection', () => {
    const state = stateWith(codeDoc('one\ntwo'), range([0], 2, [0], 6))
    expect(codeText(run(state, indentInPreformatted))).toBe('  one\n  two')
  })

  it('declines outside a preformatted block', () => {
    // Tab has to keep its list and focus-movement behaviour everywhere else.
    expect(indentInPreformatted(stateWith(doc(p('hi')), cursor([0], 1)))).toBeNull()
  })

  it('declines when the selection spans two blocks', () => {
    const state = stateWith(codeDoc('code'), range([0], 0, [0], 4))
    expect(indentInPreformatted(state)).not.toBeNull()
    const across = stateWith(doc(p('a'), p('b')), range([0], 0, [1], 1))
    expect(indentInPreformatted(across)).toBeNull()
  })
})

describe('outdentInPreformatted', () => {
  it('removes one indent level from the caret line', () => {
    const next = run(stateWith(codeDoc('    deep'), cursor([0], 6)), outdentInPreformatted)
    expect(codeText(next)).toBe('  deep')
  })

  it('removes a tab as one level', () => {
    const next = run(stateWith(codeDoc('\tdeep'), cursor([0], 3)), outdentInPreformatted)
    expect(codeText(next)).toBe('deep')
  })

  it('takes only what is there when a line is under-indented', () => {
    // One space, not two: the command must not eat into the text.
    const next = run(stateWith(codeDoc(' x'), cursor([0], 2)), outdentInPreformatted)
    expect(codeText(next)).toBe('x')
  })

  it('outdents every line a selection touches', () => {
    const state = stateWith(codeDoc('  one\n  two\n  three'), range([0], 1, [0], 8))
    const next = run(state, outdentInPreformatted)
    expect(codeText(next)).toBe('one\ntwo\n  three')
  })

  it('leaves an unindented line alone while outdenting its neighbours', () => {
    const state = stateWith(codeDoc('flush\n  indented'), range([0], 0, [0], 12))
    const next = run(state, outdentInPreformatted)
    expect(codeText(next)).toBe('flush\nindented')
  })

  it('declines when there is nothing to outdent, so the binding falls through', () => {
    const state = stateWith(codeDoc('flush'), cursor([0], 2))
    expect(outdentInPreformatted(state)).toBeNull()
  })

  it('declines outside a preformatted block', () => {
    expect(outdentInPreformatted(stateWith(doc(p('  hi')), cursor([0], 3)))).toBeNull()
  })

  it('round-trips with indent', () => {
    const original = '  one\ntwo'
    let state = stateWith(codeDoc(original), range([0], 0, [0], 9))
    state = run(state, indentInPreformatted)
    expect(codeText(state)).toBe('    one\n  two')
    state = run(state, outdentInPreformatted)
    expect(codeText(state)).toBe(original)
  })
})
