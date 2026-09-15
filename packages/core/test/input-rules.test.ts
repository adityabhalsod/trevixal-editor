import { describe, expect, it } from 'vitest'
import { applyInputRules, defaultInputRules } from '../src/input-rules/input-rules'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import type { EditorState } from '../src/state/editor-state'
import { cursor, doc, h, p, stateWith, testSchema } from './helpers'

const rules = defaultInputRules()

function typeChar(state: EditorState, char: string): EditorState | null {
  const tr = applyInputRules(state, char, rules)
  return tr ? state.apply(tr) : null
}

function ul(...items: EditorNode[]): EditorNode {
  return testSchema.node('bulletList', undefined, Fragment.from(items))
}

function li(...blocks: EditorNode[]): EditorNode {
  return testSchema.node('listItem', undefined, Fragment.from(blocks))
}

describe('input rules', () => {
  it('## + space turns a paragraph into a heading', () => {
    const state = stateWith(doc(p('##')), cursor([0], 2))
    const next = typeChar(state, ' ')
    expect(next?.doc.eq(doc(h(2)))).toBe(true)
    expect(next?.selection.from).toEqual({ path: [0], offset: 0 })
  })

  it('- + space starts a bullet list', () => {
    const state = stateWith(doc(p('-')), cursor([0], 1))
    const next = typeChar(state, ' ')
    expect(next?.doc.eq(doc(ul(li(p()))))).toBe(true)
    expect(next?.selection.from).toEqual({ path: [0, 0, 0], offset: 0 })
  })

  it('3. + space starts an ordered list at 3', () => {
    const state = stateWith(doc(p('3.')), cursor([0], 2))
    const next = typeChar(state, ' ')
    expect(next?.doc.child(0).type.name).toBe('orderedList')
    expect(next?.doc.child(0).attrs.start).toBe(3)
  })

  it('> + space wraps in a blockquote', () => {
    const state = stateWith(doc(p('>')), cursor([0], 1))
    const next = typeChar(state, ' ')
    expect(next?.doc.child(0).type.name).toBe('blockquote')
  })

  it('``` turns into a code block', () => {
    const state = stateWith(doc(p('``')), cursor([0], 2))
    const next = typeChar(state, '`')
    expect(next?.doc.child(0).type.name).toBe('codeBlock')
  })

  it('-- becomes an em dash', () => {
    const state = stateWith(doc(p('a-')), cursor([0], 2))
    const next = typeChar(state, '-')
    expect(next?.doc.child(0).textContent).toBe('a—')
  })

  it('the em dash rule can be disabled', () => {
    const state = stateWith(doc(p('a-')), cursor([0], 2))
    expect(applyInputRules(state, '-', defaultInputRules({ emDash: false }))).toBeNull()
  })

  it('list rules do not re-trigger inside a list item', () => {
    const state = stateWith(doc(ul(li(p('-')))), cursor([0, 0, 0], 1))
    expect(applyInputRules(state, ' ', rules)).toBeNull()
  })

  it('only fires at the pattern position', () => {
    const state = stateWith(doc(p('a ##')), cursor([0], 4))
    expect(typeChar(state, ' ')).toBeNull()
  })

  it('does nothing mid-word', () => {
    const state = stateWith(doc(p('hello')), cursor([0], 3))
    expect(typeChar(state, 'x')).toBeNull()
  })
})
