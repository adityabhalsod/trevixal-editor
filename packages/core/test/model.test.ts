import { describe, expect, it } from 'vitest'
import { blocksInRange, textblocks } from '../src/model/blocks'
import { Fragment } from '../src/model/fragment'
import { inlineLength, mergeInline, sliceInline } from '../src/model/inline'
import { nodeFromJSON } from '../src/model/json'
import { normalizeDoc } from '../src/model/normalize'
import { clampPosition, comparePositions, pos } from '../src/model/position'
import { bold, doc, h, p, testSchema, text } from './helpers'

describe('schema', () => {
  it('validates content expressions', () => {
    const docType = testSchema.nodeType('doc')
    expect(docType.validContent(Fragment.of(p('a')))).toBe(true)
    expect(docType.validContent(Fragment.empty)).toBe(false)
    expect(docType.validContent(Fragment.of(text('loose')))).toBe(false)
    const listType = testSchema.nodeType('bulletList')
    expect(listType.validContent(Fragment.of(p('a')))).toBe(false)
    expect(
      listType.validContent(Fragment.of(testSchema.node('listItem', undefined, [p('a')]))),
    ).toBe(true)
  })

  it('fills attribute defaults and rejects missing required attrs', () => {
    const heading = testSchema.node('heading')
    expect(heading.attrs.level).toBe(1)
    expect(() => testSchema.mark('link')).toThrow(/href/)
    expect(testSchema.mark('link', { href: 'https://x.dev' }).attrs.title).toBeNull()
  })

  it('applies mark exclusion rules', () => {
    const sub = testSchema.mark('subscript')
    const sup = testSchema.mark('superscript')
    const set = sup.addToSet(sub.addToSet([]))
    expect(set.map((mark) => mark.type.name)).toEqual(['superscript'])
  })

  it('disallows marks on code blocks', () => {
    expect(testSchema.nodeType('codeBlock').allowsMarkType(testSchema.markType('bold'))).toBe(false)
    expect(testSchema.nodeType('paragraph').allowsMarkType(testSchema.markType('bold'))).toBe(true)
  })
})

describe('json round-trip', () => {
  it('preserves documents', () => {
    const original = doc(h(2, 'Title'), p(text('plain '), bold('bold')), p('tail'))
    const restored = nodeFromJSON(testSchema, original.toJSON())
    expect(restored.eq(original)).toBe(true)
  })

  it('rejects unknown node types', () => {
    expect(() => nodeFromJSON(testSchema, { type: 'nope' })).toThrow(/Unknown node type/)
  })
})

describe('normalization', () => {
  it('wraps stray inline content in a paragraph', () => {
    const invalid = testSchema.node('doc', undefined, [text('loose'), p('ok')])
    const fixed = normalizeDoc(invalid)
    expect(fixed.type.validContent(fixed.content)).toBe(true)
    expect(fixed.child(0).type.name).toBe('paragraph')
    expect(fixed.textContent).toBe('looseok')
  })

  it('guarantees a non-empty document', () => {
    const fixed = normalizeDoc(testSchema.node('doc'))
    expect(fixed.childCount).toBe(1)
    expect(fixed.child(0).type.name).toBe('paragraph')
  })

  it('merges adjacent identical text runs', () => {
    const messy = doc(p(text('a'), text('b'), bold('c')))
    const fixed = normalizeDoc(messy)
    expect(fixed.child(0).childCount).toBe(2)
  })
})

describe('positions', () => {
  it('compares in document order', () => {
    expect(comparePositions(pos([0], 2), pos([0], 5))).toBe(-1)
    expect(comparePositions(pos([1], 0), pos([0], 99))).toBe(1)
    expect(comparePositions(pos([0], 3), pos([0], 3))).toBe(0)
    // Doc-level index before deeper positions in later children.
    expect(comparePositions(pos([], 1), pos([1], 0))).toBe(-1)
    expect(comparePositions(pos([], 1), pos([0], 4))).toBe(1)
  })

  it('clamps into the valid range', () => {
    const d = doc(p('hello'))
    expect(clampPosition(d, pos([5], 99))).toEqual({ path: [0], offset: 5 })
    expect(clampPosition(d, pos([0], 99)).offset).toBe(5)
  })
})

describe('inline helpers', () => {
  it('slices across mark boundaries', () => {
    const para = p(text('abc'), bold('def'))
    const slice = sliceInline(para.content, 2, 4)
    expect(inlineLength(slice)).toBe(2)
    expect(slice.child(0).textContent).toBe('c')
    expect(slice.child(1).textContent).toBe('d')
  })

  it('merges compatible neighbors', () => {
    const merged = mergeInline(Fragment.of(text('a'), text('b')))
    expect(merged.childCount).toBe(1)
    expect(merged.child(0).textContent).toBe('ab')
  })
})

describe('block traversal', () => {
  it('finds textblocks in order and computes per-block ranges', () => {
    const d = doc(p('one'), h(1, 'two'), p('three'))
    expect(textblocks(d).map((b) => b.node.textContent)).toEqual(['one', 'two', 'three'])
    const ranges = blocksInRange(d, pos([0], 1), pos([2], 2))
    expect(ranges).toHaveLength(3)
    expect(ranges[0]).toMatchObject({ from: 1, to: 3 })
    expect(ranges[1]).toMatchObject({ from: 0, to: 3 })
    expect(ranges[2]).toMatchObject({ from: 0, to: 2 })
  })
})
