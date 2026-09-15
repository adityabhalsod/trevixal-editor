import { describe, expect, it } from 'vitest'
import { defaultMathRenderer, latexToMathML, toDoubleStruck, toScript } from '../src/mathml'

const NS = 'http://www.w3.org/1998/Math/MathML'

/** Just the body: the `<math>` wrapper is asserted once, on its own. */
function body(latex: string, display = false): string {
  const html = latexToMathML(latex, { display })
  const open = `<math xmlns="${NS}" display="${display ? 'block' : 'inline'}">`
  expect(html.startsWith(open)).toBe(true)
  expect(html.endsWith('</math>')).toBe(true)
  return html.slice(open.length, -'</math>'.length)
}

describe('latexToMathML wrapper', () => {
  it('namespaces the root and marks inline mode', () => {
    expect(latexToMathML('x')).toBe(`<math xmlns="${NS}" display="inline"><mi>x</mi></math>`)
  })

  it('marks display mode on the root', () => {
    expect(latexToMathML('x', { display: true })).toBe(
      `<math xmlns="${NS}" display="block"><mi>x</mi></math>`,
    )
  })

  it('renders empty source as an empty root rather than failing', () => {
    expect(latexToMathML('')).toBe(`<math xmlns="${NS}" display="inline"></math>`)
  })
})

describe('latexToMathML scripts', () => {
  it('superscripts a number', () => {
    expect(body('x^2')).toBe('<msup><mi>x</mi><mn>2</mn></msup>')
  })

  it('subscripts an identifier', () => {
    expect(body('a_i')).toBe('<msub><mi>a</mi><mi>i</mi></msub>')
  })

  it('combines a subscript and superscript into msubsup', () => {
    expect(body('a_i^2')).toBe('<msubsup><mi>a</mi><mi>i</mi><mn>2</mn></msubsup>')
  })

  it('groups a braced subscript', () => {
    expect(body('x_{ij}')).toBe('<msub><mi>x</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub>')
  })

  it('renders a single prime as a superscript operator', () => {
    expect(body("f'")).toBe('<msup><mi>f</mi><mo>′</mo></msup>')
  })

  it('collapses a double prime into one character', () => {
    expect(body("f''")).toBe('<msup><mi>f</mi><mo>″</mo></msup>')
  })
})

describe('latexToMathML fractions and roots', () => {
  it('renders a fraction', () => {
    expect(body('\\frac{1}{2}')).toBe('<mfrac><mn>1</mn><mn>2</mn></mfrac>')
  })

  it('renders a square root', () => {
    expect(body('\\sqrt{2}')).toBe('<msqrt><mn>2</mn></msqrt>')
  })

  it('renders an nth root with the index second, as mroot requires', () => {
    expect(body('\\sqrt[3]{x}')).toBe('<mroot><mi>x</mi><mn>3</mn></mroot>')
  })

  it('renders a binomial as a line-less fraction in parentheses', () => {
    expect(body('\\binom{n}{k}')).toBe(
      '<mrow><mo>(</mo><mfrac linethickness="0"><mi>n</mi><mi>k</mi></mfrac><mo>)</mo></mrow>',
    )
  })
})

describe('latexToMathML symbols', () => {
  it('maps Greek letters and keeps the operator between them', () => {
    expect(body('\\alpha+\\beta')).toBe('<mrow><mi>α</mi><mo>+</mo><mi>β</mi></mrow>')
  })

  it('maps an identifier-like symbol', () => {
    expect(body('\\infty')).toBe('<mi>∞</mi>')
  })

  it('maps a binary operator command', () => {
    expect(body('2 \\times 3')).toBe('<mrow><mn>2</mn><mo>×</mo><mn>3</mn></mrow>')
  })

  it('maps a dot operator', () => {
    expect(body('a \\cdot b')).toBe('<mrow><mi>a</mi><mo>⋅</mo><mi>b</mi></mrow>')
  })

  it('renders blackboard bold from the named table', () => {
    expect(body('\\mathbb{R}')).toBe('<mi>ℝ</mi>')
  })

  it('renders script letters from the named table', () => {
    expect(body('\\mathcal{L}')).toBe('<mi>ℒ</mi>')
  })
})

describe('latexToMathML operators and functions', () => {
  it('puts sum limits above and below in display mode', () => {
    expect(body('\\sum_{i=1}^{n} i', true)).toBe(
      '<mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mi>i</mi></mrow>',
    )
  })

  it('puts the same sum limits beside the operator inline', () => {
    expect(body('\\sum_{i=1}^{n} i')).toBe(
      '<mrow><msubsup><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></msubsup><mi>i</mi></mrow>',
    )
  })

  it('puts a limit under \\lim even inline', () => {
    expect(body('\\lim_{x \\to 0}')).toBe(
      '<munder><mi>lim</mi><mrow><mi>x</mi><mo>→</mo><mn>0</mn></mrow></munder><mo>&#x2061;</mo>',
    )
  })

  it('keeps \\max limits beside it inline but under it in display', () => {
    expect(body('\\max_{i} a_i')).toBe(
      '<mrow><msub><mi>max</mi><mi>i</mi></msub><mo>&#x2061;</mo><msub><mi>a</mi><mi>i</mi></msub></mrow>',
    )
    expect(body('\\max_{i} a_i', true)).toBe(
      '<mrow><munder><mi>max</mi><mi>i</mi></munder><mo>&#x2061;</mo><msub><mi>a</mi><mi>i</mi></msub></mrow>',
    )
  })

  it('renders an integral with bounds and a thin space', () => {
    expect(body('\\int_0^1 f(x)\\,dx')).toBe(
      '<mrow><msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo><mspace width="0.167em"/><mi>d</mi><mi>x</mi></mrow>',
    )
  })

  it('follows a named function with U+2061 function application', () => {
    expect(body('\\sin x')).toBe('<mrow><mi>sin</mi><mo>&#x2061;</mo><mi>x</mi></mrow>')
  })

  it('treats \\operatorname like a named function', () => {
    expect(body('\\operatorname{sgn}')).toBe('<mi>sgn</mi><mo>&#x2061;</mo>')
  })

  it('subscripts a named function before applying it', () => {
    expect(body('\\log_2 n')).toBe(
      '<mrow><msub><mi>log</mi><mn>2</mn></msub><mo>&#x2061;</mo><mi>n</mi></mrow>',
    )
  })
})

describe('latexToMathML accents and delimiters', () => {
  it('renders \\vec as an accent above', () => {
    expect(body('\\vec{v}')).toBe('<mover accent="true"><mi>v</mi><mo>→</mo></mover>')
  })

  it('renders \\hat as an accent above', () => {
    expect(body('\\hat{a}')).toBe('<mover accent="true"><mi>a</mi><mo>^</mo></mover>')
  })

  it('renders \\overline as a non-accent line over a group', () => {
    expect(body('\\overline{AB}')).toBe(
      '<mover accent="false"><mrow><mi>A</mi><mi>B</mi></mrow><mo>¯</mo></mover>',
    )
  })

  it('makes \\left and \\right delimiters stretchy', () => {
    expect(body('\\left(\\frac{a}{b}\\right)')).toBe(
      '<mrow><mo stretchy="true">(</mo><mfrac><mi>a</mi><mi>b</mi></mfrac><mo stretchy="true">)</mo></mrow>',
    )
  })
})

describe('latexToMathML environments', () => {
  it('renders pmatrix as a parenthesised table', () => {
    expect(body('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}')).toBe(
      '<mrow><mo>(</mo><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable><mo>)</mo></mrow>',
    )
  })

  it('renders cases as a left-aligned table with only an opening brace', () => {
    expect(body('\\begin{cases} x & y \\\\ z & w \\end{cases}')).toBe(
      '<mrow><mo>{</mo><mtable columnalign="left"><mtr><mtd><mi>x</mi></mtd><mtd><mi>y</mi></mtd></mtr><mtr><mtd><mi>z</mi></mtd><mtd><mi>w</mi></mtd></mtr></mtable></mrow>',
    )
  })
})

describe('latexToMathML text mode', () => {
  it('keeps \\text content, including its trailing space, in an mtext', () => {
    expect(body('\\text{if } x>0')).toBe(
      '<mrow><mtext>if </mtext><mi>x</mi><mo>&gt;</mo><mn>0</mn></mrow>',
    )
  })

  it('escapes a bare < in math mode', () => {
    expect(body('x < y')).toBe('<mrow><mi>x</mi><mo>&lt;</mo><mi>y</mi></mrow>')
  })

  it('escapes markup inside \\text so it can never become an element', () => {
    const html = latexToMathML('\\text{<script>alert(1)</script>}')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('escapes markup echoed back by an unknown command', () => {
    const html = latexToMathML('\\badcmd<img src=x>')
    expect(html).not.toContain('<img')
    expect(html).toContain('<mtext class="trevixal-math__unknown">\\badcmd</mtext>')
    expect(html).toContain('<mo>&lt;</mo>')
  })

  it('escapes markup echoed back by an error node', () => {
    const html = latexToMathML('\\frac{<img src=x onerror="alert(1)">')
    expect(html).toContain('<merror>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })
})

describe('latexToMathML resilience', () => {
  it('flags an unknown command instead of dropping it', () => {
    expect(body('\\notacommand')).toBe(
      '<mtext class="trevixal-math__unknown">\\notacommand</mtext>',
    )
  })

  it('reports an unbalanced brace as an error node without throwing', () => {
    expect(() => latexToMathML('\\frac{1}{2')).not.toThrow()
    expect(body('\\frac{1}{2')).toBe('<merror><mtext>\\frac{1}{2</mtext></merror>')
  })

  it('survives an unmatched \\left', () => {
    expect(() => latexToMathML('\\left( x')).not.toThrow()
    expect(latexToMathML('\\left( x')).toContain('<merror>')
  })

  it('renders an empty group as an empty row', () => {
    expect(body('{}')).toBe('<mrow></mrow>')
  })

  it('coerces a non-string source rather than throwing', () => {
    expect(() => latexToMathML(undefined as unknown as string)).not.toThrow()
  })
})

describe('latexToMathML equations', () => {
  it('renders a familiar equation end to end', () => {
    expect(body('E = mc^2')).toBe(
      '<mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>',
    )
  })

  it('renders a Greek coefficient with a power', () => {
    expect(body('\\pi r^2')).toBe('<mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow>')
  })

  it('puts a bare product limit underneath in display mode', () => {
    expect(body('\\prod_{k}', true)).toBe('<munder><mo>∏</mo><mi>k</mi></munder>')
  })
})

describe('alphabet helpers', () => {
  it('uses the named double-struck characters where Unicode has them', () => {
    expect(toDoubleStruck('R')).toBe('ℝ')
    expect(toDoubleStruck('A')).toBe('𝔸')
  })

  it('uses the named script characters where Unicode has them', () => {
    expect(toScript('L')).toBe('ℒ')
    expect(toScript('A')).toBe('𝒜')
  })
})

describe('defaultMathRenderer', () => {
  it('is latexToMathML in the MathRenderer shape', () => {
    expect(defaultMathRenderer('x^2', false)).toBe(latexToMathML('x^2', { display: false }))
    expect(defaultMathRenderer('x^2', true)).toBe(latexToMathML('x^2', { display: true }))
  })
})
