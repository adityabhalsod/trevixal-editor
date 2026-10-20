// @vitest-environment happy-dom
import {
  EditorState,
  Fragment,
  NodeSelection,
  Schema,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { chemistryToLatex } from '../src/chemistry'
import { insertMathBlock, setMathNumbered } from '../src/commands'
import { latexToMathML } from '../src/mathml'
import { MATH_BLOCK_NODE, mathNodes } from '../src/schema'

const schema = new Schema({ nodes: { ...defaultNodes(), ...mathNodes() }, marks: defaultMarks() })

describe('chemistry', () => {
  it('sets element symbols upright and their counts lowered', () => {
    expect(chemistryToLatex('H2O')).toBe('\\mathrm{H}_{2}\\mathrm{O}')
    expect(chemistryToLatex('Ca(OH)2')).toBe('\\mathrm{Ca}(\\mathrm{O}\\mathrm{H})_{2}')
  })

  it('reads coefficients, arrows and states', () => {
    expect(chemistryToLatex('2H2 + O2 -> 2H2O')).toBe(
      '2\\mathrm{H}_{2} + \\mathrm{O}_{2} \\rightarrow 2\\mathrm{H}_{2}\\mathrm{O}',
    )
    expect(chemistryToLatex('NaCl(aq) <=> Na+ + Cl-')).toBe(
      '\\mathrm{Na}\\mathrm{Cl}\\mathrm{(aq)} \\rightleftharpoons \\mathrm{Na}^{+} + \\mathrm{Cl}^{-}',
    )
  })

  it('raises charges, and counts a hydrate’s water after its dot', () => {
    expect(chemistryToLatex('SO4^2-')).toBe('\\mathrm{S}\\mathrm{O}_{4}^{2-}')
    expect(chemistryToLatex('CuSO4*5H2O')).toBe(
      '\\mathrm{Cu}\\mathrm{S}\\mathrm{O}_{4} \\cdot 5\\mathrm{H}_{2}\\mathrm{O}',
    )
  })

  it('writes a condition over an arrow, and marks a gas given off', () => {
    expect(chemistryToLatex('CaCO3 ->[heat] CaO + CO2 ^')).toBe(
      '\\mathrm{Ca}\\mathrm{C}\\mathrm{O}_{3} \\overset{\\text{heat}}{\\rightarrow} \\mathrm{Ca}\\mathrm{O} + \\mathrm{C}\\mathrm{O}_{2} \\uparrow',
    )
  })

  it('draws \\ce in an equation, with no error in it', () => {
    const markup = latexToMathML('\\ce{H2O}')
    expect(markup).toContain('<msub>')
    expect(markup).toContain('mathvariant="normal"')
    expect(markup).not.toContain('merror')
  })
})

describe('numbered equations', () => {
  it('writes its number at the right, and reads it back', () => {
    const block = schema.node(MATH_BLOCK_NODE, {
      latex: 'E = mc^2',
      numbered: true,
      number: '2',
      id: 'eq-2',
    })
    const html = serializeToHTML(schema.node('doc', undefined, Fragment.of(block)))
    expect(html).toContain('data-numbered="true"')
    expect(html).toContain('id="eq-2"')
    expect(html).toContain('<span class="trevixal-math__number" aria-hidden="true">(2)</span>')
    expect(parseHTML(schema, html, document).child(0).attrs).toEqual({
      latex: 'E = mc^2',
      numbered: true,
      number: '2',
      id: 'eq-2',
    })
  })

  it('is put in numbered, and numbered or not later', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', undefined, Fragment.of(schema.node('paragraph'))),
    })
    state = state.apply(insertMathBlock('x', { numbered: true })(state) as never)
    expect(state.doc.child(0).attrs.numbered).toBe(true)
    const selected = state.apply(state.tr.setSelection(new NodeSelection([0])))
    const unnumbered = selected.apply(setMathNumbered(false)(selected) as never)
    expect(unnumbered.doc.child(0).attrs.numbered).toBe(false)
    expect(setMathNumbered(false)(unnumbered)).toBeNull()
  })
})
