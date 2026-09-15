import { describe, expect, it } from 'vitest'
import type { Command } from '../src/commands/commands'
import {
  deleteBackwardInPreformatted,
  exitPreformatted,
  insertNewlineInPreformatted,
  splitBlockInPreformatted,
  typeInPreformatted,
} from '../src/commands/commands'
import type { EditorState } from '../src/state/editor-state'
import { cursor, doc, p, range, stateWith, testSchema, text } from './helpers'

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** A document holding one code block, with the caret at `offset` in it. */
function code(source: string, offset = source.length) {
  return stateWith(
    doc(testSchema.node('codeBlock', undefined, source ? [text(source)] : [])),
    cursor([0], offset),
  )
}

const codeText = (state: EditorState): string => state.doc.child(0).textContent
const caret = (state: EditorState): number => state.selection.from.offset

describe('Enter inside a code block', () => {
  it('keeps the indentation of the line it leaves', () => {
    const next = run(code('    return x'), splitBlockInPreformatted)
    expect(codeText(next)).toBe('    return x\n    ')
    expect(caret(next)).toBe('    return x\n    '.length)
  })

  it('keeps tabs as they are', () => {
    expect(codeText(run(code('\tif x:'), splitBlockInPreformatted))).toBe('\tif x:\n\t')
  })

  it('goes one level deeper after an opening bracket', () => {
    expect(codeText(run(code('  if (a) {'), splitBlockInPreformatted))).toBe('  if (a) {\n    ')
  })

  it('opens a block when the caret sits between a bracket and its closer', () => {
    // `{|}`: the way the auto-closed pair leaves it.
    const next = run(code('function f() {}', 14), splitBlockInPreformatted)
    expect(codeText(next)).toBe('function f() {\n  \n}')
    // The caret is on the indented middle line, ready to type the body.
    expect(caret(next)).toBe('function f() {\n  '.length)
  })

  it('carries the outer indentation to the moved closer', () => {
    const next = run(code('  if (a) {}', 10), splitBlockInPreformatted)
    expect(codeText(next)).toBe('  if (a) {\n    \n  }')
  })

  it('adds a plain line mid-text without disturbing what follows', () => {
    const next = run(code('one\ntwo', 3), splitBlockInPreformatted)
    expect(codeText(next)).toBe('one\n\ntwo')
    expect(caret(next)).toBe(4)
  })

  it('leaves the block on a second Enter, taking the indented blank line with it', () => {
    // Enter after `{` makes an indented, otherwise blank last line.
    let state = run(code('while (x) {'), splitBlockInPreformatted)
    expect(codeText(state)).toBe('while (x) {\n  ')
    // A second Enter there is the escape gesture; the indent must not linger.
    state = run(state, splitBlockInPreformatted)
    expect(state.doc.childCount).toBe(2)
    expect(codeText(state)).toBe('while (x) {')
    expect(state.doc.child(1).type.name).toBe('paragraph')
    expect(state.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('does not escape from a blank line that is not the last one', () => {
    let state = run(code('a\nb', 1), splitBlockInPreformatted)
    expect(codeText(state)).toBe('a\n\nb')
    state = run(state, splitBlockInPreformatted)
    expect(state.doc.childCount).toBe(1)
    expect(codeText(state)).toBe('a\n\n\nb')
  })
})

describe('exitPreformatted', () => {
  it('starts a paragraph after the block from anywhere inside it', () => {
    const next = run(code('first\nsecond', 2), exitPreformatted)
    expect(next.doc.childCount).toBe(2)
    expect(codeText(next)).toBe('first\nsecond')
    expect(next.doc.child(1).type.name).toBe('paragraph')
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('declines outside a code block, leaving the key free', () => {
    expect(exitPreformatted(stateWith(doc(p('prose')), cursor([0], 2)))).toBeNull()
  })
})

describe('insertNewlineInPreformatted', () => {
  it('inserts a bare newline, indentation left alone', () => {
    expect(codeText(run(code('    deep'), insertNewlineInPreformatted))).toBe('    deep\n')
  })

  it('declines outside a code block, so Shift-Enter stays a hard break', () => {
    expect(insertNewlineInPreformatted(stateWith(doc(p('prose')), cursor([0], 2)))).toBeNull()
  })
})

describe('typing inside a code block', () => {
  it('closes a bracket and leaves the caret between the pair', () => {
    const next = run(code('call'), typeInPreformatted('('))
    expect(codeText(next)).toBe('call()')
    expect(caret(next)).toBe(5)
  })

  it('closes every bracket and quote kind', () => {
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
      ['"', '"'],
      ["'", "'"],
      ['`', '`'],
    ]) {
      expect(codeText(run(code('x = '), typeInPreformatted(open as string)))).toBe(
        `x = ${open}${close}`,
      )
    }
  })

  it('steps over a closer that is already there', () => {
    const next = run(code('f()', 2), typeInPreformatted(')'))
    expect(codeText(next)).toBe('f()')
    expect(caret(next)).toBe(3)
    const quoted = run(code('""', 1), typeInPreformatted('"'))
    expect(codeText(quoted)).toBe('""')
    expect(caret(quoted)).toBe(2)
  })

  it('closes a pair before a closer, punctuation or whitespace, but not mid-word', () => {
    expect(codeText(run(code('f(a)', 3), typeInPreformatted('[')))).toBe('f(a[])')
    expect(codeText(run(code('a; b', 1), typeInPreformatted('(')))).toBe('a(); b')
    // `(` typed straight before a letter is a plain bracket.
    expect(typeInPreformatted('(')(code('call', 0))).toBeNull()
  })

  it('does not turn an apostrophe into a pair', () => {
    expect(typeInPreformatted("'")(code('don'))).toBeNull()
    // Nor doubles a quote typed right after one of the same kind.
    expect(typeInPreformatted('"')(code('x = "', 5))).toBeNull()
  })

  it('wraps a selection in the pair and keeps it selected', () => {
    const state = stateWith(
      doc(testSchema.node('codeBlock', undefined, [text('log(value)')])),
      range([0], 4, [0], 9),
    )
    const next = run(state, typeInPreformatted('"'))
    expect(codeText(next)).toBe('log("value")')
    expect(next.selection.from.offset).toBe(5)
    expect(next.selection.to.offset).toBe(10)
  })

  it('declines outside a code block, and for anything longer than one character', () => {
    expect(typeInPreformatted('(')(stateWith(doc(p('prose')), cursor([0], 5)))).toBeNull()
    expect(typeInPreformatted('()')(code('x'))).toBeNull()
    expect(typeInPreformatted('a')(code('x'))).toBeNull()
  })
})

describe('Backspace inside a code block', () => {
  it('removes both halves of an empty pair', () => {
    const next = run(code('f()', 2), deleteBackwardInPreformatted)
    expect(codeText(next)).toBe('f')
    expect(caret(next)).toBe(1)
  })

  it('steps back one indent level inside leading whitespace', () => {
    expect(codeText(run(code('    x', 4), deleteBackwardInPreformatted))).toBe('  x')
    // An odd indent goes back to the previous stop, not past it.
    expect(codeText(run(code('   x', 3), deleteBackwardInPreformatted))).toBe('  x')
    expect(codeText(run(code('a\n    b', 6), deleteBackwardInPreformatted))).toBe('a\n  b')
  })

  it('declines everywhere else, so the ordinary delete runs', () => {
    expect(deleteBackwardInPreformatted(code('f(x)', 2))).toBeNull()
    expect(deleteBackwardInPreformatted(code(' x', 1))).toBeNull()
    expect(deleteBackwardInPreformatted(code('abc', 3))).toBeNull()
    expect(deleteBackwardInPreformatted(code('abc', 0))).toBeNull()
    expect(deleteBackwardInPreformatted(stateWith(doc(p('()')), cursor([0], 1)))).toBeNull()
  })
})
