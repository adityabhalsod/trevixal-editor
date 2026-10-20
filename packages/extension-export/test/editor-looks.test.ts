import {
  type Attrs,
  type EditorNode,
  Fragment,
  Schema,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToODT } from '../src/odt'
import type { RenderedBlock, RenderedBox } from '../src/rendered'
import { serializeToRTF } from '../src/rtf'
import { readZip } from '../src/zip'
import { extraNodes, partText, pngDataURL } from './helpers'

/**
 * The blocks the bundled extensions add that the writers lay out as the
 * editor does, declared here in the shapes those extensions give them.
 */
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    ...extraNodes(),
    callout: { content: 'block+', group: 'block', attrs: { variant: { default: 'info' } } },
    gallery: { content: 'image+', group: 'block', attrs: { columns: { default: 2 } } },
    columnBlock: { content: 'column+', group: 'block' },
    column: { content: 'block+' },
    footnoteRef: {
      inline: true,
      atom: true,
      group: 'inline',
      attrs: { id: {} },
      toHTML: (node) => ({ tag: 'sup', text: String(node.attrs.id) }),
    },
    footnoteList: { content: 'footnoteItem+', group: 'block' },
    footnoteItem: { content: 'block+', attrs: { id: {} } },
    endnoteList: { content: 'endnoteItem+', group: 'block' },
    endnoteItem: { content: 'block+', attrs: { id: {} } },
    mathBlock: {
      atom: true,
      group: 'block',
      attrs: { latex: { default: '' }, numbered: { default: false }, number: { default: null } },
      toHTML: () => ({
        tag: 'div',
        innerHTML: '<math display="block"><msup><mi>x</mi><mn>2</mn></msup></math>',
      }),
      exportText: (node) => String(node.attrs.latex),
    },
    iframeEmbed: {
      atom: true,
      group: 'block',
      attrs: { src: { default: '' }, title: { default: null } },
    },
    linkCard: {
      atom: true,
      group: 'block',
      attrs: {
        href: { default: '' },
        title: { default: null },
        description: { default: null },
        siteName: { default: null },
      },
    },
  },
  marks: defaultMarks(),
})

const para = (...content: (EditorNode | string)[]): EditorNode =>
  schema.node(
    'paragraph',
    undefined,
    Fragment.from(content.map((each) => (typeof each === 'string' ? schema.text(each) : each))),
  )
const node = (name: string, attrs: Attrs = {}, content: EditorNode[] = []): EditorNode =>
  schema.node(name, attrs, Fragment.from(content))
const page = (...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', undefined, Fragment.from(blocks))

/** A callout as the stylesheet draws it: a pale ground, a line down its left. */
const CALLOUT: RenderedBox = {
  fill: '#eef4ff',
  border: { color: '#3366cc', width: 4, sides: ['left'] },
}

/** Two callouts, a titled code block, tasks, notes and the rest, with what the editor drew of them. */
function sample(): { document: EditorNode; rendered: Map<EditorNode, RenderedBlock> } {
  const first = node('callout', {}, [para('Careful.')])
  const second = node('callout', {}, [para('Second.')])
  const code = node('codeBlock', { language: 'js', title: 'app.js', lineNumbers: true }, [
    schema.text('a\nb'),
  ])
  const done = para('Done')
  const marker = node('footnoteRef', { id: '1' })
  const document = page(
    first,
    second,
    code,
    node('taskList', {}, [
      node('taskItem', { checked: true }, [done]),
      node('taskItem', { checked: false }, [para('Open')]),
    ]),
    para('Said', marker),
    node('footnoteList', {}, [node('footnoteItem', { id: '1' }, [para('A footnote.')])]),
    node('endnoteList', {}, [node('endnoteItem', { id: '1' }, [para('An endnote.')])]),
    node('columnBlock', {}, [
      node('column', {}, [para('Left')]),
      node('column', {}, [para('Right')]),
    ]),
    node('gallery', {}, [
      node('image', { src: pngDataURL(4, 4), alt: 'A' }),
      node('image', { src: pngDataURL(4, 4), alt: 'B' }),
    ]),
    node('mathBlock', { latex: 'x^2' }),
    node('mathBlock', { latex: 'x^2', numbered: true, number: '1' }),
    node('iframeEmbed', { src: 'https://video.test/1', title: 'Talk' }),
    node('linkCard', {
      href: 'https://site.test/a',
      title: 'A page',
      description: 'About it',
      siteName: 'Site',
    }),
  )
  const rendered = new Map<EditorNode, RenderedBlock>([
    [first, { box: CALLOUT }],
    [second, { box: CALLOUT }],
    [code, { box: { fill: '#f5f5f5' }, lines: [{ line: 2, band: '#fff3c4' }] }],
    [done, { look: { strike: true, color: '#777777' } }],
    [marker, { look: { raised: true, scale: 0.75 } }],
  ])
  return { document, rendered }
}

/** Each `<w:p>` of the body, in order. */
async function wordParagraphs(
  document: EditorNode,
  rendered: Map<EditorNode, RenderedBlock>,
): Promise<{ paragraphs: string[]; parts: ReadonlyMap<string, Uint8Array> }> {
  const parts = await readZip(await serializeToDOCX(document, { rendered }))
  const body = partText(parts, 'word/document.xml')
  return { paragraphs: body.match(/<w:p>.*?<\/w:p>/g) ?? [], parts }
}

describe('what the editor draws, in Word', () => {
  it('boxes a callout as the editor draws it, and keeps two boxes apart', async () => {
    const { document, rendered } = sample()
    const { paragraphs } = await wordParagraphs(document, rendered)
    const box =
      '<w:pBdr><w:left w:val="single" w:sz="24" w:space="4" w:color="3366CC"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="EEF4FF"/>'
    expect(paragraphs[0]).toContain(box)
    // Word joins paragraphs boxed alike into one box; a sliver between keeps two.
    expect(paragraphs[1]).toBe(
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>',
    )
    expect(paragraphs[2]).toContain(box)
  })

  it('keeps a tab’s title and its content one box, ruled on no side they share', async () => {
    const title = para('Tab')
    const content = para('Content')
    const { paragraphs } = await wordParagraphs(
      page(title, content),
      new Map([
        [title, { box: { border: { color: '#cccccc', width: 1, sides: ['bottom'] } } }],
        [content, { box: { border: { color: '#cccccc', width: 1, sides: ['top'] } } }],
      ]),
    )
    expect(paragraphs).toHaveLength(2)
  })

  it('writes a code block’s title, its numbered lines and the line picked out', async () => {
    const { document, rendered } = sample()
    const { paragraphs } = await wordParagraphs(document, rendered)
    const [title, first, second] = paragraphs.filter((each) => each.includes('w:val="Code"'))
    expect(title).toContain('<w:bottom w:val="single"')
    expect(title).toContain('>app.js<')
    expect(first).toContain('<w:t xml:space="preserve">1  </w:t>')
    expect(first).toContain('w:fill="F5F5F5"')
    expect(second).toContain('<w:t xml:space="preserve">2  </w:t>')
    expect(second).toContain('w:fill="FFF3C4"')
    // The space after the block comes once, under its last line.
    expect(first).not.toContain('w:after=')
    expect(second).toContain('<w:spacing w:after="160"/>')
  })

  it('strikes a finished task’s words but not its box, and tallies the list', async () => {
    const { document, rendered } = sample()
    const { paragraphs } = await wordParagraphs(document, rendered)
    const done = paragraphs.find((each) => each.includes('>Done<')) ?? ''
    expect(done).toContain(
      '<w:r><w:t xml:space="preserve">☑ </w:t></w:r><w:r><w:rPr><w:strike/><w:color w:val="777777"/></w:rPr>',
    )
    expect(paragraphs.some((each) => each.includes('>1 of 2 done<'))).toBe(true)
  })

  it('raises a footnote’s marker, without shrinking a superscript again', async () => {
    const { document, rendered } = sample()
    const { paragraphs } = await wordParagraphs(document, rendered)
    const said = paragraphs.find((each) => each.includes('>Said<')) ?? ''
    expect(said).toContain(
      '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">1</w:t>',
    )
  })

  it('numbers footnotes 1, 2, 3 and endnotes i, ii, iii', async () => {
    const { document, rendered } = sample()
    const { paragraphs, parts } = await wordParagraphs(document, rendered)
    const numberOf = (words: string) =>
      /<w:numId w:val="(\d+)"\/>/.exec(paragraphs.find((each) => each.includes(words)) ?? '')?.[1]
    const footnotes = numberOf('A footnote.')
    const endnotes = numberOf('An endnote.')
    expect(footnotes).toBeDefined()
    expect(endnotes).not.toBe(footnotes)
    const numbering = partText(parts, 'word/numbering.xml')
    expect(numbering).toMatch(
      new RegExp(`<w:num w:numId="${endnotes}">.*?<w:numFmt w:val="lowerRoman"/>`),
    )
  })

  it('sets columns side by side in a table without lines', async () => {
    const { document, rendered } = sample()
    const parts = await readZip(await serializeToDOCX(document, { rendered }))
    const table = /<w:tbl>.*?<\/w:tbl>/.exec(partText(parts, 'word/document.xml'))?.[0] ?? ''
    expect(table).toContain('<w:insideV w:val="nil"/>')
    expect(table.match(/<w:tc>/g)).toHaveLength(2)
    expect(table).toContain('>Left<')
    expect(table).toContain('>Right<')
  })

  it('sets a gallery’s pictures side by side, sharing the width between them', async () => {
    const { document, rendered } = sample()
    const { paragraphs } = await wordParagraphs(document, rendered)
    const gallery = paragraphs.find((each) => each.includes('<w:drawing>')) ?? ''
    expect(gallery.match(/<w:drawing>/g)).toHaveLength(2)
    // Two columns of 6.5in less the gap: 308px a picture, in EMU.
    expect(gallery).toContain('<wp:extent cx="2933700" cy="2933700"/>')
  })

  it('writes an equation as Word’s own, and a numbered one with its number at the margin', async () => {
    const { document, rendered } = sample()
    const { paragraphs } = await wordParagraphs(document, rendered)
    const [display, numbered] = paragraphs.filter((each) => each.includes('<m:oMath>'))
    expect(display).toContain('<w:jc w:val="center"/></w:pPr><m:oMathPara><m:oMath><m:sSup>')
    expect(numbered).toContain(
      '<w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/>',
    )
    expect(numbered).toContain('<w:t xml:space="preserve">(1)</w:t>')
  })

  it('links an embed by its title, and a link card by its page’s', async () => {
    const { document, rendered } = sample()
    const { paragraphs, parts } = await wordParagraphs(document, rendered)
    expect(paragraphs.some((each) => /<w:hyperlink r:id="rId\d+">.*>Talk</.test(each))).toBe(true)
    expect(
      paragraphs.some((each) => /<w:hyperlink r:id="rId\d+">.*<w:b\/>.*>A page</.test(each)),
    ).toBe(true)
    const relationships = partText(parts, 'word/_rels/document.xml.rels')
    expect(relationships).toContain('Target="https://video.test/1"')
    expect(relationships).toContain('Target="https://site.test/a"')
  })
})

describe('what the editor draws, in RTF', () => {
  const rtf = (): string => {
    const { document, rendered } = sample()
    return serializeToRTF(document, { rendered })
  }

  it('boxes a callout, and keeps two boxes apart', () => {
    const lines = rtf().split('\n')
    const careful = lines.findIndex((line) => line.endsWith('Careful.\\par'))
    expect(lines[careful]).toMatch(/\\brdrl\\brdrs\\brdrw60\\brsp80\\brdrcf\d+\\cbpat\d+/)
    expect(lines[careful + 1]).toBe('\\pard\\plain\\sl-120\\slmult0\\fs4 \\par')
  })

  it('numbers a code block’s lines in grey, and bands the line picked out', () => {
    const output = rtf()
    expect(output).toMatch(/\\f1\\fs20 \{\\cf\d+ 1 {2}\}a\\par/)
    expect(output).toMatch(/\\sa160\\cbpat\d+\\f1\\fs20 \{\\cf\d+ 2 {2}\}b\\par/)
    // The grey joins the colour table even without a theme to name it.
    expect(output).toContain('\\red118\\green118\\blue118;')
  })

  it('strikes a finished task’s words but not its box, and tallies the list', () => {
    const output = rtf()
    expect(output).toContain('\\strike\\f0\\fs22 {\\strike0 \\u9745?}\\tab Done\\par')
    expect(output).toMatch(/\\fs18\\cf\d+ 1 of 2 done\\par/)
  })

  it('numbers footnotes and endnotes as the editor does', () => {
    const output = rtf()
    expect(output).toContain('1.\\tab A footnote.\\par')
    expect(output).toContain('i.\\tab An endnote.\\par')
  })

  it('links a link card’s title, with no space before its words', () => {
    expect(rtf()).toContain('{\\fldrslt{A page}}')
  })
})

describe('what the editor draws, in OpenDocument', () => {
  async function odt(): Promise<{ content: string; parts: ReadonlyMap<string, Uint8Array> }> {
    const { document, rendered } = sample()
    const parts = await readZip(await serializeToODT(document, { rendered }))
    return { content: partText(parts, 'content.xml'), parts }
  }

  /** The automatic style a paragraph holding `words` is set in. */
  function styleOf(content: string, words: string): string {
    const name = new RegExp(`<text:p text:style-name="([^"]+)">${words}`).exec(content)?.[1]
    return (
      new RegExp(`<style:style style:name="${name}"[^]*?</style:style>`).exec(content)?.[0] ?? ''
    )
  }

  it('boxes a callout in a style of its own', async () => {
    const { content } = await odt()
    const style = styleOf(content, 'Careful.')
    expect(style).toContain('fo:background-color="#eef4ff"')
    expect(style).toContain('fo:border-left="3pt solid #3366cc"')
  })

  it('writes an equation as a formula object, listed in the manifest', async () => {
    const { content, parts } = await odt()
    expect(content).toContain('<draw:object xlink:href="./Object 1"')
    expect(partText(parts, 'Object 1/content.xml')).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
    expect(partText(parts, 'META-INF/manifest.xml')).toContain(
      'manifest:full-path="Object 1/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.formula"',
    )
  })

  it('strikes a finished task’s words but not its box, and tallies the list', async () => {
    const { content } = await odt()
    const box = /<text:span text:style-name="([^"]+)">☑<\/text:span> Done/.exec(content)?.[1]
    expect(box).toBeDefined()
    expect(content).toMatch(
      new RegExp(
        `<style:style style:name="${box}"[^>]*><style:text-properties style:text-line-through-style="none"`,
      ),
    )
    expect(content).toContain('1 of 2 done')
  })

  it('numbers endnotes in roman numerals', async () => {
    const { content } = await odt()
    expect(content).toMatch(/<text:list-level-style-number [^>]*style:num-format="i"/)
  })
})
