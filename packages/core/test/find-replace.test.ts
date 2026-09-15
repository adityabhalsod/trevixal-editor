import { describe, expect, it } from 'vitest'
import { characterCount, wordCount } from '../src/model/counts'
import { findMatches, replaceAll, replaceMatch } from '../src/search/find-replace'
import { bold, br, doc, h, p, stateWith, text } from './helpers'

describe('findMatches', () => {
  const document = doc(p('the cat and the hat'), h(1, 'The End'))

  it('finds all occurrences across blocks', () => {
    const matches = findMatches(document, 'the')
    expect(matches).toEqual([
      { path: [0], from: 0, to: 3 },
      { path: [0], from: 12, to: 15 },
      { path: [1], from: 0, to: 3 },
    ])
  })

  it('honors case sensitivity', () => {
    expect(findMatches(document, 'The', { caseSensitive: true })).toEqual([
      { path: [1], from: 0, to: 3 },
    ])
  })

  it('keeps offsets aligned across inline atoms', () => {
    const withBreak = doc(p(text('ab'), br(), text('cd')))
    expect(findMatches(withBreak, 'cd')).toEqual([{ path: [0], from: 3, to: 5 }])
  })

  it('returns nothing for an empty query', () => {
    expect(findMatches(document, '')).toEqual([])
  })
})

describe('replace', () => {
  it('replaceAll rewrites every match, back to front', () => {
    const state = stateWith(doc(p('aXbXc')))
    const tr = replaceAll('X', 'yy')(state)
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('ayybyyc')))).toBe(true)
  })

  it('replacement text inherits the marks at the match', () => {
    const state = stateWith(doc(p(bold('hello'))))
    const tr = replaceAll('ell', 'ipp')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.child(0).childCount).toBe(1)
    expect(next.doc.child(0).child(0).marks[0]?.type.name).toBe('bold')
    expect(next.doc.textContent).toBe('hippo')
  })

  it('replaceMatch rewrites a single match', () => {
    const state = stateWith(doc(p('aXbXc')))
    const match = findMatches(state.doc, 'X')[1]
    expect(match).toBeDefined()
    const tr = replaceMatch(match as NonNullable<typeof match>, 'Z')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.textContent).toBe('aXbZc')
  })

  it('replaceAll with empty replacement deletes matches', () => {
    const state = stateWith(doc(p('a--b--c')))
    const tr = replaceAll('--', '')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.textContent).toBe('abc')
  })

  it('replaceAll returns null when nothing matches', () => {
    const state = stateWith(doc(p('abc')))
    expect(replaceAll('zzz', 'x')(state)).toBeNull()
  })
})

describe('counts', () => {
  it('counts characters (atoms count 1) and words', () => {
    const document = doc(p(text('one two'), br(), text('three')), h(1, 'four'))
    expect(characterCount(document)).toBe(17)
    expect(wordCount(document)).toBe(4)
  })

  it('counts an empty document as zero', () => {
    const document = doc(p())
    expect(characterCount(document)).toBe(0)
    expect(wordCount(document)).toBe(0)
  })
})
