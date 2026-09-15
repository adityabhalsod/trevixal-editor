// @vitest-environment happy-dom
import {
  EditorState,
  Fragment,
  NodeSelection,
  Schema,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { deleteMath } from '../src/commands'
import { latexToMathML } from '../src/mathml'
import { MATH_BLOCK_NODE, mathNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...mathNodes() },
  marks: defaultMarks(),
})

describe('inherited object keys are not commands', () => {
  const inherited = [
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ]

  it('renders every inherited key as an unknown command', () => {
    for (const name of inherited) {
      const html = latexToMathML(`\\${name}`)
      expect(html, name).toContain('trevixal-math__unknown')
      expect(html, name).not.toContain('native code')
      expect(html, name).not.toContain('[object')
    }
  })

  it('does not treat an inherited key as a font, text, accent or environment', () => {
    for (const source of [
      '\\constructor{x}',
      '\\toString{x}',
      '\\begin{toString}a\\end{toString}',
      '\\left\\constructor a\\right)',
    ]) {
      const html = latexToMathML(source)
      expect(html, source).not.toContain('native code')
      expect(html, source).not.toContain('[object')
    }
  })

  it('leaks nothing when Object.prototype carries a hostile key', () => {
    const proto = Object.prototype as unknown as Record<string, string>
    proto.planted = '"><img src=x onerror=alert(1)>'
    try {
      const html = latexToMathML('\\planted')
      expect(html).not.toContain('<img')
      expect(html).toContain('trevixal-math__unknown')
    } finally {
      Reflect.deleteProperty(proto, 'planted')
    }
  })
})

describe('\\not on escaped relations', () => {
  it('uses the precomposed negation for < and >', () => {
    expect(latexToMathML('\\not<')).toContain('<mo>≮</mo>')
    expect(latexToMathML('\\not>')).toContain('<mo>≯</mo>')
  })

  it('still negates = and \\in', () => {
    expect(latexToMathML('\\not=')).toContain('<mo>≠</mo>')
    expect(latexToMathML('\\not\\in')).toContain('<mo>∉</mo>')
  })
})

describe('deleteMath on a display formula', () => {
  it('leaves a selection that still addresses a node', () => {
    const doc = schema.node(
      'doc',
      undefined,
      Fragment.from([
        schema.node('paragraph', undefined, [schema.text('before')]),
        schema.node(MATH_BLOCK_NODE, { latex: 'x' }),
      ]),
    )
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([1]) })
    const tr = deleteMath(state)
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.childCount).toBe(1)
    const from = next.selection.from
    expect(from.path.every((index) => index >= 0)).toBe(true)
    expect(next.selection.from.path).not.toEqual([1])
  })
})
