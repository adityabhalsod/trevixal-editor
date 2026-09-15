// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import { bold, doc, h, p, testSchema, text } from './helpers'

function parse(html: string): ReturnType<typeof parseHTML> {
  return parseHTML(testSchema, html)
}

describe('HTML import', () => {
  it('parses paragraphs, headings and marks', () => {
    const result = parse('<h2>Title</h2><p>plain <strong>bold</strong></p>')
    expect(result.eq(doc(h(2, 'Title'), p(text('plain '), bold('bold'))))).toBe(true)
  })

  it('parses legacy tags (b, i, strike) into the canonical marks', () => {
    const result = parse('<p><b>a</b><i>b</i><strike>c</strike></p>')
    const marks = result.child(0).content.children.map((child) => child.marks[0]?.type.name)
    expect(marks).toEqual(['bold', 'italic', 'strikethrough'])
  })

  it('parses lists, wrapping bare item text in paragraphs', () => {
    const result = parse('<ul><li>one</li><li><p>two</p></li></ul>')
    const list = result.child(0)
    expect(list.type.name).toBe('bulletList')
    expect(list.childCount).toBe(2)
    expect(list.child(0).child(0).type.name).toBe('paragraph')
    expect(result.textContent).toBe('onetwo')
  })

  it('keeps ordered list start attributes', () => {
    const result = parse('<ol start="4"><li><p>x</p></li></ol>')
    expect(result.child(0).attrs.start).toBe(4)
  })

  it('preserves whitespace inside code blocks', () => {
    const result = parse('<pre><code>line 1\n  line 2</code></pre>')
    expect(result.child(0).type.name).toBe('codeBlock')
    expect(result.child(0).textContent).toBe('line 1\n  line 2')
  })

  it('keeps content of unknown wrappers, dropping their formatting', () => {
    const result = parse('<div><span style="color:red">styled</span> text</div>')
    expect(result.eq(doc(p('styled text')))).toBe(true)
  })

  it('drops whitespace between blocks', () => {
    const result = parse('<p>a</p>\n  <p>b</p>')
    expect(result.eq(doc(p('a'), p('b')))).toBe(true)
  })

  it('produces a valid empty document from empty input', () => {
    const result = parse('')
    expect(result.eq(doc(p()))).toBe(true)
  })
})

describe('XSS corpus', () => {
  const vectors: readonly [name: string, html: string, forbidden: RegExp][] = [
    ['script tag', '<p>ok</p><script>alert(1)</script>', /script|alert/],
    ['inline event handler', '<p onmouseover="alert(1)">ok</p>', /onmouseover|alert/],
    ['javascript: URL', '<a href="javascript:alert(1)">click</a>', /javascript|href/],
    ['mixed-case javascript: URL', '<a href="JaVaScRiPt:alert(1)">x</a>', /javascript|href/i],
    ['tab-smuggled URL', '<a href="java\tscript:alert(1)">x</a>', /script|href/],
    ['data: URL', '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', /data:|href/],
    ['img onerror', '<p><img src="x" onerror="alert(1)">text</p>', /img|onerror/],
    ['svg payload', '<svg onload="alert(1)"><script>alert(2)</script></svg><p>ok</p>', /svg|alert/],
    ['iframe embed', '<iframe src="https://evil.example"></iframe><p>ok</p>', /iframe|evil/],
    ['object embed', '<object data="x"></object><p>ok</p>', /object/],
    [
      'style with expression',
      '<style>p{background:expression(alert(1))}</style><p>ok</p>',
      /style|expression/,
    ],
    ['css expression attr', '<p style="width:expression(alert(1))">ok</p>', /style|expression/],
    [
      'form controls',
      '<form action="https://evil.example"><input value="x"></form><p>ok</p>',
      /form|input|evil/,
    ],
    [
      'math payload',
      '<math><mtext><script>alert(1)</script></mtext></math><p>ok</p>',
      /math|alert/,
    ],
    [
      'meta refresh',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>ok</p>',
      /meta|javascript/,
    ],
  ]

  for (const [name, html, forbidden] of vectors) {
    it(`neutralizes ${name}`, () => {
      const result = parse(html)
      const out = serializeToHTML(result)
      expect(out).not.toMatch(forbidden)
    })
  }

  it('keeps the safe content around the payloads', () => {
    const result = parse('<p>before</p><script>alert(1)</script><p>after</p>')
    expect(result.textContent).toBe('beforeafter')
  })

  it('keeps link text when the href is unsafe', () => {
    const result = parse('<p><a href="javascript:alert(1)">still here</a></p>')
    expect(result.textContent).toBe('still here')
    expect(serializeToHTML(result)).toBe('<p>still here</p>')
  })
})
