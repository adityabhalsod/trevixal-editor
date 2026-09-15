import { describe, expect, it } from 'vitest'
import { pos } from '../src/model/position'
import { lastIndexOfPath, parentPathOf, pathStartsWith, pathsEqual } from '../src/model/tree'
import { AllSelection, NodeSelection, TextSelection, selectionNear } from '../src/state/selection'
import type { PositionMapper } from '../src/state/step'
import { blockquote, doc, hr, p } from './helpers'

/** A mapper that leaves every position where it is. */
const identity: PositionMapper = { mapPosition: (position) => position }

describe('NodeSelection', () => {
  it('refuses to select the document itself', () => {
    // The root has no parent to address it from, so `from` and `to` could not
    // be expressed; failing loudly beats producing a selection nothing can map.
    expect(() => new NodeSelection([])).toThrow(RangeError)
  })

  it('spans exactly the one node it names', () => {
    const selection = new NodeSelection([1])
    expect(selection.parentPath).toEqual([])
    expect(selection.index).toBe(1)
    expect(selection.from).toEqual(pos([], 1))
    expect(selection.to).toEqual(pos([], 2))
    expect(selection.empty).toBe(false)
  })

  it('stays a node selection while the node it names is still a node', () => {
    const d = doc(p('a'), hr())
    const mapped = new NodeSelection([1]).map(d, identity)
    expect(mapped).toBeInstanceOf(NodeSelection)
    expect((mapped as NodeSelection).path).toEqual([1])
  })

  it('degrades to a caret when the position no longer lands on a node', () => {
    // Text is not node-selectable: there is nothing to draw a box around, so
    // the selection becomes the caret at that spot instead of staying invalid.
    const d = doc(p('hello'))
    const mapped = new NodeSelection([0, 0]).map(d, identity)
    expect(mapped).toBeInstanceOf(TextSelection)
  })

  it('compares by path, and never equals another kind of selection', () => {
    const selection = new NodeSelection([1])
    expect(selection.eq(new NodeSelection([1]))).toBe(true)
    expect(selection.eq(new NodeSelection([2]))).toBe(false)
    expect(selection.eq(new TextSelection(pos([], 1)))).toBe(false)
  })

  it('serializes to a path', () => {
    expect(new NodeSelection([0, 2]).toJSON()).toEqual({ type: 'node', path: [0, 2] })
  })
})

describe('AllSelection', () => {
  it('spans every top-level child', () => {
    const d = doc(p('a'), p('b'), p('c'))
    const selection = new AllSelection(d)
    expect(selection.from).toEqual(pos([], 0))
    expect(selection.to).toEqual(pos([], 3))
    expect(selection.empty).toBe(false)
  })

  it('re-reads the document it is mapped onto', () => {
    // It holds no positions to remap, only a count, so mapping means
    // pointing it at the new document and asking again.
    const before = new AllSelection(doc(p('a')))
    const after = before.map(doc(p('a'), p('b')))
    expect(after).toBeInstanceOf(AllSelection)
    expect(after.to).toEqual(pos([], 2))
  })

  it('equals any other whole-document selection, and nothing else', () => {
    const selection = new AllSelection(doc(p('a')))
    expect(selection.eq(new AllSelection(doc(p('different'))))).toBe(true)
    expect(selection.eq(new TextSelection(pos([0], 0)))).toBe(false)
    expect(selection.toJSON()).toEqual({ type: 'all' })
  })
})

describe('selectionNear', () => {
  it('keeps a position that is already inside a textblock', () => {
    const d = doc(p('hello'))
    expect(selectionNear(d, pos([0], 3)).from).toEqual(pos([0], 3))
  })

  it('moves out of a block that holds no text', () => {
    // A blockquote is not a textblock: a caret cannot sit directly in one, so
    // the repair walks on to the first block that can hold it.
    const d = doc(blockquote(p('inside')))
    const selection = selectionNear(d, pos([0], 0))
    expect(selection.from).toEqual(pos([0, 0], 0))
  })

  it('clamps a position that is past the end of the document', () => {
    // This is the case the repair exists for: a stale selection left behind by
    // an edit that removed what it pointed at.
    const d = doc(p('one'), p('two'))
    const selection = selectionNear(d, pos([9], 99))
    expect(selection.from).toEqual(pos([1], 3))
  })

  it('falls back to the end when the document holds no textblock at all', () => {
    // A document of nothing but rules has nowhere to put a caret. The repair
    // must still return something rather than throwing on the empty walk.
    const d = doc(hr(), hr())
    expect(selectionNear(d, pos([0], 0)).from).toEqual(pos([], 0))
  })
})

describe('TextSelection edges', () => {
  it('finds the first and last places a caret can go', () => {
    const d = doc(blockquote(p('first')), p('last'))
    expect(TextSelection.atStart(d).from).toEqual(pos([0, 0], 0))
    expect(TextSelection.atEnd(d).from).toEqual(pos([1], 4))
  })

  it('degrades to the document root when there is nowhere to put a caret', () => {
    const d = doc(hr())
    expect(TextSelection.atStart(d).from).toEqual(pos([], 0))
    expect(TextSelection.atEnd(d).from).toEqual(pos([], 0))
  })
})

describe('path helpers', () => {
  it('compares paths by every index', () => {
    expect(pathsEqual([0, 1], [0, 1])).toBe(true)
    expect(pathsEqual([0, 1], [0, 2])).toBe(false)
    expect(pathsEqual([0], [0, 1])).toBe(false)
  })

  it('recognises a prefix, which is what "inside" means for a path', () => {
    expect(pathStartsWith([0, 1, 2], [0, 1])).toBe(true)
    expect(pathStartsWith([0, 1], [0, 1])).toBe(true)
    expect(pathStartsWith([0, 1], [0, 1, 2])).toBe(false)
    expect(pathStartsWith([1, 0], [0])).toBe(false)
  })

  it('climbs to the parent, and refuses to climb past the root', () => {
    expect(parentPathOf([0, 1, 2])).toEqual([0, 1])
    expect(parentPathOf([0])).toEqual([])
    expect(() => parentPathOf([])).toThrow(RangeError)
  })

  it('reads the index a path ends on, and refuses when there is none', () => {
    expect(lastIndexOfPath([0, 4])).toBe(4)
    expect(() => lastIndexOfPath([])).toThrow(RangeError)
  })
})
