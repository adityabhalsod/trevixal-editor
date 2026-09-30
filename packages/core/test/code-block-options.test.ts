// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Fragment } from '../src/model/fragment'
import { codeBlockTitle, lineRangeTest, normalizeLineRanges } from '../src/schema/code-block'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import { p, testSchema } from './helpers'

describe('code block options', () => {
  it('writes each option as an attribute of the block, and reads it back', () => {
    const block = testSchema.node(
      'codeBlock',
      {
        language: 'ts',
        lineNumbers: true,
        highlightLines: ' 2, 4 - 6 ',
        wrap: true,
        title: '  src/app.ts ',
        collapsed: true,
      },
      Fragment.of(testSchema.text('a\nb')),
    )
    const html = serializeToHTML(testSchema.topType.create(undefined, Fragment.of(block)))

    expect(html).toBe(
      '<pre data-language="ts" data-line-numbers="true" data-highlight-lines="2,4-6" data-wrap="true" data-title="src/app.ts" data-collapsed="true"><code>a\nb</code></pre>',
    )
    const back = parseHTML(testSchema, html, document).child(0)
    expect(back.attrs).toEqual({
      language: 'ts',
      id: null,
      lineNumbers: true,
      highlightLines: '2,4-6',
      wrap: true,
      title: 'src/app.ts',
      collapsed: true,
    })
  })

  it('keeps a plain block’s HTML as it always was', () => {
    const block = testSchema.node('codeBlock', {}, Fragment.of(testSchema.text('x')))
    expect(serializeToHTML(testSchema.topType.create(undefined, Fragment.of(block)))).toBe(
      '<pre><code>x</code></pre>',
    )
  })

  it('reads line ranges one way and drops what names no line', () => {
    expect(normalizeLineRanges('1, 3-5,x, 0, 9-7')).toBe('1,3-5')
    expect(normalizeLineRanges('nothing')).toBeNull()
    const picked = lineRangeTest('1,3-5')
    expect([1, 2, 3, 4, 5, 6].map(picked)).toEqual([true, false, true, true, true, false])
  })

  it('keeps a title on one line and bounded', () => {
    expect(codeBlockTitle(' a\n b ')).toBe('a b')
    expect(codeBlockTitle('x'.repeat(500))?.length).toBe(120)
    expect(codeBlockTitle('   ')).toBeNull()
  })

  it('carries front matter through HTML with the document', () => {
    const withFront = testSchema.topType.create(
      { frontMatter: 'title: Notes' },
      Fragment.of(p('Body')),
    )
    const html = serializeToHTML(withFront)
    expect(html).toContain('data-front-matter="title: Notes"')
    expect(parseHTML(testSchema, html, document).attrs.frontMatter).toBe('title: Notes')
  })

  it('carries a saved theme through HTML with the document, and not an oversized one', () => {
    const theme = '{"format":"trevixal-theme","base":"dark","tokens":{}}'
    const html = serializeToHTML(testSchema.topType.create({ theme }, Fragment.of(p('Body'))))
    expect(html).toContain('data-document-theme="{&quot;format&quot;')
    expect(parseHTML(testSchema, html, document).attrs.theme).toBe(theme)
    const huge = serializeToHTML(
      testSchema.topType.create({ theme: 'x'.repeat(9000) }, Fragment.of(p('Body'))),
    )
    expect(huge).not.toContain('data-document-theme')
  })
})
