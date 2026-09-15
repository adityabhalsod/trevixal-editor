import { describe, expect, it } from 'vitest'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { pos } from '../src/model/position'
import type { Step } from '../src/state/step'
import { SetNodeAttrsStep } from '../src/state/steps/attrs-step'
import { AddMarkStep, RemoveMarkStep } from '../src/state/steps/mark-steps'
import { MoveNodeStep, moveNodeTo } from '../src/state/steps/move-node'
import { ReplaceInlineStep } from '../src/state/steps/replace-inline'
import { ReplaceNodesStep } from '../src/state/steps/replace-nodes'
import { JoinNodesStep, SplitNodeStep } from '../src/state/steps/split-join'
import { LiftNodesStep, WrapNodesStep } from '../src/state/steps/wrap-lift'
import { blockquote, bold, doc, h, hr, p, testSchema, text } from './helpers'

function applyOk(step: Step, document: EditorNode): EditorNode {
  const result = step.apply(document)
  expect(result.failed).toBeNull()
  return result.doc as EditorNode
}

/** apply(step) → apply(invert(step)) must restore the document exactly. */
function expectInvertible(step: Step, document: EditorNode): EditorNode {
  const after = applyOk(step, document)
  const restored = applyOk(step.invert(document), after)
  expect(restored.eq(document)).toBe(true)
  return after
}

describe('step invertibility', () => {
  const base = doc(p(text('hello '), bold('world')), h(1, 'title'), p('tail'))

  it('ReplaceInlineStep insert / delete / replace', () => {
    expectInvertible(new ReplaceInlineStep([0], 3, 3, Fragment.of(text('XY'))), base)
    expectInvertible(new ReplaceInlineStep([0], 4, 9, Fragment.empty), base)
    expectInvertible(new ReplaceInlineStep([0], 2, 8, Fragment.of(bold('Z'))), base)
  })

  it('ReplaceNodesStep insert / remove', () => {
    expectInvertible(new ReplaceNodesStep([], 1, 1, Fragment.of(hr())), base)
    expectInvertible(new ReplaceNodesStep([], 0, 2, Fragment.empty), base)
  })

  it('Add/RemoveMarkStep', () => {
    const italic = testSchema.mark('italic')
    const after = expectInvertible(new AddMarkStep([0], 2, 9, italic), base)
    expectInvertible(new RemoveMarkStep([0], 2, 9, italic), after)
  })

  it('SetNodeAttrsStep', () => {
    expectInvertible(new SetNodeAttrsStep([1], { level: 3 }), base)
  })

  it('SplitNodeStep / JoinNodesStep', () => {
    const after = expectInvertible(new SplitNodeStep([0], 5), base)
    expect(after.childCount).toBe(4)
    expectInvertible(new JoinNodesStep([0], 5), after)
  })

  it('SplitNodeStep with a different after-type', () => {
    expectInvertible(new SplitNodeStep([1], 2, 'paragraph'), base)
  })

  it('WrapNodesStep / LiftNodesStep', () => {
    const after = expectInvertible(new WrapNodesStep([], 0, 2, 'blockquote'), base)
    expect(after.child(0).type.name).toBe('blockquote')
    expectInvertible(new LiftNodesStep([0], 2), after)
  })

  it('MoveNodeStep reorders and moves back', () => {
    const after = expectInvertible(new MoveNodeStep([], 0, 2), base)
    expect(after.child(2).textContent).toBe(base.child(0).textContent)
  })

  it('randomized MoveNodeStep round-trips (property test)', () => {
    let seed = 7
    const rand = (max: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % (max + 1)
    }
    const document = doc(p('a'), p('b'), h(1, 'c'), p('d'), hr(), p('e'))
    const last = document.childCount - 1
    for (let i = 0; i < 200; i++) {
      expectInvertible(new MoveNodeStep([], rand(last), rand(last)), document)
    }
  })

  it('randomized ReplaceInlineStep round-trips (property test)', () => {
    let seed = 42
    const rand = (max: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % (max + 1)
    }
    const document = doc(p(text('abcdefgh'), bold('ijklm'), text('nopq')))
    const length = 17
    for (let i = 0; i < 200; i++) {
      const a = rand(length)
      const b = rand(length)
      const [from, to] = a <= b ? [a, b] : [b, a]
      const insert =
        rand(2) === 0
          ? Fragment.empty
          : Fragment.of(rand(1) === 0 ? text('XY') : bold(String(rand(9))))
      expectInvertible(new ReplaceInlineStep([0], from, to, insert), document)
    }
  })
})

describe('step failure handling', () => {
  it('fails gracefully instead of throwing', () => {
    const base = doc(p('hi'))
    expect(new ReplaceInlineStep([9], 0, 0, Fragment.empty).apply(base).failed).toMatch(/no node/)
    expect(new ReplaceInlineStep([0], 0, 99, Fragment.empty).apply(base).failed).toMatch(/bounds/)
    expect(new JoinNodesStep([0], 2).apply(base).failed).toMatch(/no next sibling/)
  })
})

describe('MoveNodeStep', () => {
  const document = doc(p('zero'), p('one'), p('two'), p('three'))

  it('moves a child the way splice counts', () => {
    const moved = applyOk(new MoveNodeStep([], 0, 2), document)
    expect([0, 1, 2, 3].map((i) => moved.child(i).textContent)).toEqual([
      'one',
      'two',
      'zero',
      'three',
    ])
  })

  it('moves backwards as well as forwards', () => {
    const moved = applyOk(new MoveNodeStep([], 3, 1), document)
    expect([0, 1, 2, 3].map((i) => moved.child(i).textContent)).toEqual([
      'zero',
      'three',
      'one',
      'two',
    ])
  })

  it('carries positions inside the moved node with it', () => {
    // This is the whole reason the step exists. Composing the same edit out of
    // a remove and an insert maps a position inside the moved node onto the
    // parent, which is why such a move has to restore the caret by hand.
    const step = new MoveNodeStep([], 0, 2)
    expect(step.mapPosition(pos([0], 2))).toEqual(pos([2], 2))
  })

  it('shifts the siblings the move stepped over, and leaves the rest alone', () => {
    const forward = new MoveNodeStep([], 0, 2)
    expect(forward.mapPosition(pos([1], 0))).toEqual(pos([0], 0))
    expect(forward.mapPosition(pos([2], 0))).toEqual(pos([1], 0))
    expect(forward.mapPosition(pos([3], 0))).toEqual(pos([3], 0))

    const backward = new MoveNodeStep([], 3, 1)
    expect(backward.mapPosition(pos([1], 0))).toEqual(pos([2], 0))
    expect(backward.mapPosition(pos([0], 0))).toEqual(pos([0], 0))
  })

  it('leaves positions in another branch of the tree untouched', () => {
    const nested = doc(blockquote(p('a'), p('b')), p('outside'))
    const step = new MoveNodeStep([0], 0, 1)
    applyOk(step, nested)
    expect(step.mapPosition(pos([1], 3))).toEqual(pos([1], 3))
  })

  it('is a no-op when a node is moved to where it already is', () => {
    const step = new MoveNodeStep([], 1, 1)
    expect(applyOk(step, document)).toBe(document)
    expect(step.mapPosition(pos([1], 0))).toEqual(pos([1], 0))
  })

  it('refuses an index that is not there, rather than throwing', () => {
    expect(new MoveNodeStep([], 0, 9).apply(document).failed).toMatch(/bounds/)
    expect(new MoveNodeStep([9], 0, 1).apply(document).failed).toMatch(/no node/)
    expect(new MoveNodeStep([0], 0, 1).apply(document).failed).toMatch(/inline/)
    expect(() => new MoveNodeStep([], -1, 0)).toThrow(RangeError)
  })

  it('addresses the node by path through moveNodeTo', () => {
    expect(moveNodeTo([2], 0)).toMatchObject({ parentPath: [], from: 2, to: 0 })
    expect(() => moveNodeTo([], 0)).toThrow(RangeError)
  })

  it('serializes what it did', () => {
    expect(new MoveNodeStep([0, 1], 2, 3).toJSON()).toEqual({
      stepType: 'moveNode',
      parentPath: [0, 1],
      from: 2,
      to: 3,
    })
  })
})

describe('position mapping', () => {
  it('maps through inline replacement', () => {
    const step = new ReplaceInlineStep([0], 2, 5, Fragment.of(text('longer!')))
    expect(step.mapPosition(pos([0], 1))).toEqual(pos([0], 1))
    expect(step.mapPosition(pos([0], 8))).toEqual(pos([0], 12))
    expect(step.mapPosition(pos([0], 3), -1)).toEqual(pos([0], 2))
    expect(step.mapPosition(pos([0], 3), 1)).toEqual(pos([0], 9))
    expect(step.mapPosition(pos([1], 3))).toEqual(pos([1], 3))
  })

  it('maps through node replacement', () => {
    const step = new ReplaceNodesStep([], 1, 2, Fragment.empty)
    expect(step.mapPosition(pos([0], 4))).toEqual(pos([0], 4))
    expect(step.mapPosition(pos([2], 4))).toEqual(pos([1], 4))
    expect(step.mapPosition(pos([1], 4), -1)).toEqual(pos([], 1))
  })

  it('maps through split and join', () => {
    const split = new SplitNodeStep([0], 3)
    expect(split.mapPosition(pos([0], 2))).toEqual(pos([0], 2))
    expect(split.mapPosition(pos([0], 5))).toEqual(pos([1], 2))
    expect(split.mapPosition(pos([1], 0))).toEqual(pos([2], 0))
    const join = new JoinNodesStep([0], 3)
    expect(join.mapPosition(pos([1], 2))).toEqual(pos([0], 5))
    expect(join.mapPosition(pos([2], 1))).toEqual(pos([1], 1))
  })

  it('maps through wrap and lift', () => {
    const wrap = new WrapNodesStep([], 1, 3, 'blockquote')
    expect(wrap.mapPosition(pos([1], 2))).toEqual(pos([1, 0], 2))
    expect(wrap.mapPosition(pos([2], 0))).toEqual(pos([1, 1], 0))
    expect(wrap.mapPosition(pos([3], 4))).toEqual(pos([2], 4))
    const liftStep = new LiftNodesStep([1], 2)
    expect(liftStep.mapPosition(pos([1, 0], 2))).toEqual(pos([1], 2))
    expect(liftStep.mapPosition(pos([1, 1], 0))).toEqual(pos([2], 0))
    expect(liftStep.mapPosition(pos([2], 4))).toEqual(pos([3], 4))
  })

  it('split/join mapping round-trips (property test)', () => {
    for (let offset = 0; offset <= 6; offset++) {
      const split = new SplitNodeStep([0], 3)
      const join = new JoinNodesStep([0], 3)
      const there = split.mapPosition(pos([0], offset), -1)
      expect(join.mapPosition(there)).toEqual(pos([0], offset))
    }
  })
})

describe('blockquote content', () => {
  it('wraps into valid structures', () => {
    const wrapped = applyOk(new WrapNodesStep([], 0, 1, 'blockquote'), doc(p('a'), p('b')))
    expect(wrapped.eq(doc(blockquote(p('a')), p('b')))).toBe(true)
    expect(wrapped.type.validContent(wrapped.content)).toBe(true)
  })
})
