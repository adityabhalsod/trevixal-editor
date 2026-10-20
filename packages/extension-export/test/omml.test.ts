import { describe, expect, it } from 'vitest'
import { mathMLToOMML } from '../src/omml'

/** OMML's run of math text. */
const run = (text: string): string => `<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`

describe('MathML as Office Math', () => {
  it('writes a variable in italic, as Word does, and a function name upright', () => {
    expect(mathMLToOMML('<math><mi>x</mi></math>')).toBe(`<m:oMath>${run('x')}</m:oMath>`)
    expect(mathMLToOMML('<math><mi>sin</mi><mi>x</mi></math>')).toBe(
      `<m:oMath><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">sin</m:t></m:r>${run('x')}</m:oMath>`,
    )
  })

  it('writes a power, a fraction and a fraction without its bar', () => {
    expect(mathMLToOMML('<math><msup><mi>x</mi><mn>2</mn></msup></math>')).toBe(
      `<m:oMath><m:sSup><m:e>${run('x')}</m:e><m:sup>${run('2')}</m:sup></m:sSup></m:oMath>`,
    )
    expect(mathMLToOMML('<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>')).toBe(
      `<m:oMath><m:f><m:num>${run('1')}</m:num><m:den>${run('2')}</m:den></m:f></m:oMath>`,
    )
    expect(
      mathMLToOMML('<math><mfrac linethickness="0"><mi>n</mi><mi>k</mi></mfrac></math>'),
    ).toContain('<m:f><m:fPr><m:type m:val="noBar"/></m:fPr>')
  })

  it('writes a square root with its degree hidden, and a cube root with its own', () => {
    const roots = mathMLToOMML(
      '<math><msqrt><mi>x</mi></msqrt><mroot><mi>y</mi><mn>3</mn></mroot></math>',
    )
    expect(roots).toContain(
      `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run('x')}</m:e></m:rad>`,
    )
    expect(roots).toContain(`<m:rad><m:deg>${run('3')}</m:deg><m:e>${run('y')}</m:e></m:rad>`)
  })

  it('makes a sum with limits an n-ary over the term after it', () => {
    const sum = mathMLToOMML(
      '<math><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>a</mi><mi>i</mi></msub></math>',
    )
    expect(sum).toBe(
      `<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>${run('i')}${run('=')}${run('1')}</m:sub><m:sup>${run('n')}</m:sup><m:e><m:sSub><m:e>${run('a')}</m:e><m:sub>${run('i')}</m:sub></m:sSub></m:e></m:nary></m:oMath>`,
    )
  })

  it('writes an accent as the combining mark Word puts over its base', () => {
    expect(mathMLToOMML('<math><mover accent="true"><mi>x</mi><mo>^</mo></mover></math>')).toBe(
      `<m:oMath><m:acc><m:accPr><m:chr m:val="̂"/></m:accPr><m:e>${run('x')}</m:e></m:acc></m:oMath>`,
    )
  })

  it('writes a matrix in the brackets that stretch round it', () => {
    const matrix = mathMLToOMML(
      '<math><mrow><mo stretchy="true">(</mo><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>0</mn></mtd></mtr></mtable><mo stretchy="true">)</mo></mrow></math>',
    )
    expect(matrix).toBe(
      `<m:oMath><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:m><m:mr><m:e>${run('1')}</m:e><m:e>${run('0')}</m:e></m:mr></m:m></m:e></m:d></m:oMath>`,
    )
  })

  it('keeps words as words, and reads past the TeX a renderer annotates with', () => {
    expect(mathMLToOMML('<math><mtext>if</mtext></math>')).toBe(
      '<m:oMath><m:r><m:rPr><m:nor/></m:rPr><m:t xml:space="preserve">if</m:t></m:r></m:oMath>',
    )
    expect(
      mathMLToOMML(
        '<math><semantics><mi>y</mi><annotation encoding="application/x-tex">y</annotation></semantics></math>',
      ),
    ).toBe(`<m:oMath>${run('y')}</m:oMath>`)
  })

  it('gives nothing for markup that is not math', () => {
    expect(mathMLToOMML('<div>not math</div>')).toBeNull()
    expect(mathMLToOMML('')).toBeNull()
  })
})
