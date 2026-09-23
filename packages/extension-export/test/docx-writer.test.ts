import type { EditorNode } from '@trevixal/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { isXmlElement, parseXML } from '../src/xml'
import { readZip } from '../src/zip'
import {
  blockquote,
  bulletList,
  cell,
  codeBlock,
  doc,
  hardBreak,
  heading,
  horizontalRule,
  image,
  listItem,
  mark,
  orderedList,
  p,
  partText,
  pngDataURL,
  row,
  table,
  taskItem,
  taskList,
  text,
} from './helpers'

const rich = doc(
  heading(1, 'Report'),
  heading(3, 'Detail'),
  p([
    text('plain '),
    text('bold', mark('bold')),
    text('italic', mark('italic')),
    text('under', mark('underline')),
    text('struck', mark('strikethrough')),
    text('up', mark('superscript')),
    text('down', mark('subscript')),
    text('lit', mark('highlight')),
    text('red', mark('textColor', { color: '#ff0000' })),
    text('mono', mark('code')),
  ]),
  p([text('see '), text('site', mark('link', { href: 'https://example.com/a b' }))]),
  blockquote(p('Quoted')),
  codeBlock('line one\nline two'),
  horizontalRule(),
  bulletList(listItem(p('First')), listItem(p('Second'), bulletList(listItem(p('Nested'))))),
  orderedList(5, listItem(p('Alpha'))),
  taskList(taskItem(true, p('done')), taskItem(false, p('todo'))),
  table(
    { borders: 'all' },
    row(cell('Name', { header: true }), cell('Price', { header: true })),
    row(cell('wide', { colspan: 2 })),
    row(cell('pear', { align: 'center', background: '#ffee00' }), cell('12')),
  ),
  image({ src: pngDataURL(1200, 600), alt: 'A chart' }),
  p([text('a'), hardBreak(), text('b\tc')]),
)

let parts: ReadonlyMap<string, Uint8Array>
let body: string

beforeAll(async () => {
  parts = await readZip(await serializeToDOCX(rich, { title: 'Q3 & Q4', creator: 'Ada <A>' }))
  body = partText(parts, 'word/document.xml')
})

describe('the package shape', () => {
  it('produces bytes that read back as a ZIP', () => {
    expect(parts.size).toBeGreaterThan(0)
  })

  it('contains every required OOXML part', () => {
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/settings.xml',
      'word/_rels/document.xml.rels',
    ]) {
      expect(parts.has(name)).toBe(true)
    }
  })

  it('parses every XML part with the package parser', () => {
    for (const [name] of parts) {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue
      const root = parseXML(partText(parts, name))
      expect(root.name).not.toBe('#document')
    }
  })

  it('declares an override for each XML part in [Content_Types].xml', () => {
    const types = partText(parts, '[Content_Types].xml')
    const root = parseXML(types)
    const overrides = root.childrenNamed('Override').map((node) => node.attr('PartName'))
    expect(overrides).toContain('/word/document.xml')
    expect(overrides).toContain('/word/styles.xml')
    expect(overrides).toContain('/word/numbering.xml')
    expect(overrides).toContain('/docProps/core.xml')
    expect(overrides).toContain('/docProps/app.xml')
    expect(types).toContain('<Default Extension="rels"')
  })

  it('points the package relationships at the document part', () => {
    const root = parseXML(partText(parts, '_rels/.rels'))
    const targets = root.childrenNamed('Relationship').map((node) => node.attr('Target'))
    expect(targets).toEqual(['word/document.xml', 'docProps/core.xml', 'docProps/app.xml'])
  })

  it('writes escaped core properties', () => {
    const core = partText(parts, 'docProps/core.xml')
    expect(core).toContain('<dc:title>Q3 &amp; Q4</dc:title>')
    expect(core).toContain('<dc:creator>Ada &lt;A&gt;</dc:creator>')
    expect(parseXML(core).find('dcterms:created')?.text()).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  it('omits title and creator when they are not supplied', async () => {
    const bare = await readZip(await serializeToDOCX(doc(p('x'))))
    const core = partText(bare, 'docProps/core.xml')
    expect(core).not.toContain('<dc:title>')
    expect(core).not.toContain('<dc:creator>')
  })

  it('nests the body in a w:document with a section', () => {
    const root = parseXML(body)
    expect(root.name).toBe('w:document')
    expect(root.child('w:body')).toBeDefined()
    expect(root.find('w:sectPr')).toBeDefined()
  })
})

describe('document body markup', () => {
  it('styles headings by level', () => {
    expect(body).toContain('<w:pStyle w:val="Heading1"/>')
    expect(body).toContain('<w:pStyle w:val="Heading3"/>')
  })

  it('defines the heading styles it references', () => {
    const styles = partText(parts, 'word/styles.xml')
    const ids = parseXML(styles)
      .findAll('w:style')
      .map((node) => node.attr('w:styleId'))
    for (const id of [
      'Normal',
      'Heading1',
      'Heading3',
      'Quote',
      'Code',
      'ListParagraph',
      'Hyperlink',
      'TableGrid',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('emits one run property element per mark', () => {
    expect(body).toContain('<w:b/><w:bCs/>')
    expect(body).toContain('<w:i/><w:iCs/>')
    expect(body).toContain('<w:u w:val="single"/>')
    expect(body).toContain('<w:strike/>')
    expect(body).toContain('<w:vertAlign w:val="superscript"/>')
    expect(body).toContain('<w:vertAlign w:val="subscript"/>')
    expect(body).toContain('<w:highlight w:val="yellow"/>')
    expect(body).toContain('<w:color w:val="FF0000"/>')
    expect(body).toContain('<w:rFonts w:ascii="Consolas"')
  })

  it('wraps run text in space-preserving w:t', () => {
    expect(body).toContain('<w:t xml:space="preserve">plain </w:t>')
  })

  it('splits tabs and hard breaks out of a run', () => {
    expect(body).toContain('<w:r><w:br/></w:r>')
    expect(body).toContain(
      '<w:t xml:space="preserve">b</w:t><w:tab/><w:t xml:space="preserve">c</w:t>',
    )
  })

  it('writes a hyperlink with an external relationship', () => {
    const link = parseXML(body).find('w:hyperlink')
    expect(link).toBeDefined()
    const id = link?.attr('r:id') as string
    expect(id).toMatch(/^rId\d+$/)
    const rels = parseXML(partText(parts, 'word/_rels/document.xml.rels'))
    const match = rels.childrenNamed('Relationship').find((node) => node.attr('Id') === id)
    expect(match?.attr('Target')).toBe('https://example.com/a%20b')
    expect(match?.attr('TargetMode')).toBe('External')
    expect(match?.attr('Type')).toMatch(/\/hyperlink$/)
  })

  it('styles link runs with the Hyperlink character style', () => {
    expect(body).toContain('<w:rStyle w:val="Hyperlink"/>')
  })

  it('styles a blockquote and a code block', () => {
    expect(body).toContain('<w:pStyle w:val="Quote"/>')
    expect(body).toContain('<w:pStyle w:val="Code"/>')
  })

  it('gives each code-block line its own paragraph', () => {
    expect(body).toContain('<w:t xml:space="preserve">line one</w:t>')
    expect(body).toContain('<w:t xml:space="preserve">line two</w:t>')
  })

  it('draws a horizontal rule as a bottom paragraph border', () => {
    expect(body).toContain(
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>',
    )
  })

  it('carries block layout attrs into w:spacing, w:ind and w:jc', async () => {
    const laid = doc(
      p('x', { align: 'justify', indent: 2, spaceBefore: '12pt', lineHeight: '1.5' }),
      p('y', { align: 'center' }),
    )
    const archive = await readZip(await serializeToDOCX(laid))
    const laidBody = partText(archive, 'word/document.xml')
    expect(laidBody).toContain('<w:spacing w:before="240" w:line="360" w:lineRule="auto"/>')
    expect(laidBody).toContain('<w:ind w:left="1440"/>')
    expect(laidBody).toContain('<w:jc w:val="both"/>')
    expect(laidBody).toContain('<w:jc w:val="center"/>')
  })
})

describe('numbering', () => {
  it('references a numbering instance from each list paragraph', () => {
    expect(body).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    expect(body).toContain('<w:pStyle w:val="ListParagraph"/>')
  })

  it('nests a sublist at the next ilvl', () => {
    expect(body).toContain('<w:ilvl w:val="1"/>')
  })

  it('defines bullet and decimal abstract numbering', () => {
    const numbering = partText(parts, 'word/numbering.xml')
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>')
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>')
    expect(parseXML(numbering).findAll('w:abstractNum')).toHaveLength(2)
  })

  it('overrides the start of an ordered list', () => {
    expect(partText(parts, 'word/numbering.xml')).toContain('<w:startOverride w:val="5"/>')
  })

  it('registers one w:num per list in the document', () => {
    const nums = parseXML(partText(parts, 'word/numbering.xml')).findAll('w:num')
    // Three bullet/ordered lists; the task list carries literal glyphs instead.
    expect(nums).toHaveLength(3)
    expect(nums.map((node) => node.attr('w:numId'))).toEqual(['1', '2', '3'])
  })

  it('prefixes task items with a ballot glyph rather than numbering', () => {
    expect(body).toContain('<w:t xml:space="preserve">☑ </w:t>')
    expect(body).toContain('<w:t xml:space="preserve">☐ </w:t>')
  })
})

describe('tables', () => {
  it('writes a w:tbl with a grid matching the widest row', () => {
    const tbl = parseXML(body).find('w:tbl')
    expect(tbl).toBeDefined()
    expect(tbl?.find('w:tblGrid')?.childrenNamed('w:gridCol')).toHaveLength(2)
    expect(tbl?.childrenNamed('w:tr')).toHaveLength(3)
  })

  it('spans a merged cell with w:gridSpan', () => {
    expect(body).toContain('<w:gridSpan w:val="2"/>')
  })

  it('repeats a fully-header row and bolds its runs', () => {
    expect(body).toContain('<w:trPr><w:tblHeader/></w:trPr>')
    const tbl = parseXML(body).find('w:tbl')
    const first = tbl?.childrenNamed('w:tr')[0]
    expect(first?.findAll('w:b')).toHaveLength(2)
  })

  it('shades and aligns a cell', () => {
    expect(body).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFEE00"/>')
    expect(body).toContain('<w:jc w:val="center"/>')
  })

  it('turns every border off when the table asks for none', async () => {
    const bare = await readZip(
      await serializeToDOCX(doc(table({ borders: 'none' }, row(cell('x'))))),
    )
    expect(partText(bare, 'word/document.xml')).toContain('<w:tblBorders><w:top w:val="nil"/>')
  })

  it('colours the borders when the table names a colour', async () => {
    const tinted = await readZip(
      await serializeToDOCX(doc(table({ borderColor: '#336699' }, row(cell('x'))))),
    )
    expect(partText(tinted, 'word/document.xml')).toContain(
      '<w:top w:val="single" w:sz="4" w:space="0" w:color="336699"/>',
    )
  })

  it('leaves out a line the Eraser took, on both cells that share it', async () => {
    const rubbed = await readZip(
      await serializeToDOCX(
        doc(
          table(
            undefined,
            row(cell('a', { hiddenBorders: 'right' }), cell('b')),
            row(cell('c'), cell('d', { hiddenBorders: 'top bottom' })),
          ),
        ),
      ),
    )
    const cells = parseXML(partText(rubbed, 'word/document.xml')).findAll('w:tc')
    const nil = cells.map((tc) =>
      (tc.find('w:tcBorders')?.children ?? []).filter(isXmlElement).map((side) => side.name),
    )
    // Word draws a shared line if either cell has it, so the neighbour of an
    // erased side leaves out its own side of the line too.
    expect(nil).toEqual([['w:right'], ['w:left', 'w:bottom'], [], ['w:top', 'w:bottom']])
  })

  it('spells a table style out for Word: lines, fills, header ink and its style options', async () => {
    const styled = await readZip(
      await serializeToDOCX(
        doc(
          table(
            {
              tableStyle: 'header',
              accentColor: '#156082',
              bandedRows: true,
              totalRow: true,
              borderStyle: 'dashed',
              borderWidth: '1.5pt',
            },
            row(cell('Region', { header: true }), cell('Q1', { header: true })),
            row(cell('North'), cell('1')),
            row(cell('South'), cell('2')),
            row(cell('Total'), cell('3')),
          ),
        ),
      ),
    )
    const xml = partText(styled, 'word/document.xml')
    // Every line with the pen, in the style's tint of its colour.
    expect(xml).toContain('<w:insideH w:val="dashed" w:sz="12" w:space="0" w:color="96B7C7"/>')
    // The header row filled with the accent, its words in white.
    const cells = parseXML(xml).findAll('w:tc')
    expect(cells[0]?.find('w:shd')?.attr('w:fill')).toBe('156082')
    expect(cells[0]?.find('w:color')?.attr('w:val')).toBe('FFFFFF')
    // The first row of the body is banded, the next is not.
    expect(cells[2]?.find('w:shd')?.attr('w:fill')).toBe('DAE6EB')
    expect(cells[4]?.find('w:shd')).toBeUndefined()
    // The total row under Word's double rule, in bold.
    expect(cells[6]?.find('w:tcBorders')?.find('w:top')?.attr('w:val')).toBe('double')
    expect(cells[6]?.findAll('w:b').length).toBeGreaterThan(0)
    expect(xml).toContain(
      'w:firstRow="1" w:lastRow="1" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"',
    )
  })

  it('writes a plain table exactly as before', async () => {
    const plain = await readZip(await serializeToDOCX(doc(table(undefined, row(cell('x'))))))
    const xml = partText(plain, 'word/document.xml')
    expect(xml).not.toContain('<w:tblBorders>')
    expect(xml).toContain('<w:tblLook w:val="04A0"')
  })

  it('closes a cell whose last block is a nested table with an empty paragraph', async () => {
    const nested = await readZip(
      await serializeToDOCX(
        doc(table(undefined, row(cell([table(undefined, row(cell('inner')))])))),
      ),
    )
    expect(partText(nested, 'word/document.xml')).toContain('</w:tbl><w:p/></w:tc>')
  })
})

describe('images', () => {
  it('stores a data: image as a media part with a relationship', () => {
    expect(parts.has('word/media/image1.png')).toBe(true)
    const bytes = parts.get('word/media/image1.png') as Uint8Array
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const rels = parseXML(partText(parts, 'word/_rels/document.xml.rels'))
    const rel = rels
      .childrenNamed('Relationship')
      .find((node) => node.attr('Target') === 'media/image1.png')
    expect(rel?.attr('Type')).toMatch(/\/image$/)
    expect(rel?.attr('TargetMode')).toBeUndefined()
    expect(body).toContain(`<a:blip r:embed="${rel?.attr('Id')}"/>`)
  })

  it('declares the media extension in [Content_Types].xml', () => {
    expect(partText(parts, '[Content_Types].xml')).toContain(
      '<Default Extension="png" ContentType="image/png"/>',
    )
  })

  it('scales an oversized image to the text width, keeping its ratio', () => {
    const extent = parseXML(body).find('wp:extent')
    // 1200x600 clamps to 624px wide, so 312px tall, in EMUs.
    expect(extent?.attr('cx')).toBe(String(624 * 9525))
    expect(extent?.attr('cy')).toBe(String(312 * 9525))
  })

  it('carries the alt text into the drawing descriptions', () => {
    expect(body).toContain('descr="A chart"')
  })

  it('links a remote image instead of embedding it', async () => {
    const remote = await readZip(
      await serializeToDOCX(doc(image({ src: 'https://example.com/x.png', alt: 'Remote' }))),
    )
    const remoteBody = partText(remote, 'word/document.xml')
    expect(remoteBody).toContain('<w:hyperlink')
    expect(remoteBody).toContain('<w:t xml:space="preserve">Remote</w:t>')
    expect([...remote.keys()].some((name) => name.startsWith('word/media/'))).toBe(false)
  })

  it('falls back to bracketed text for an image with no source', async () => {
    const none = await readZip(await serializeToDOCX(doc(image({ src: '', alt: 'Missing' }))))
    expect(partText(none, 'word/document.xml')).toContain(
      '<w:t xml:space="preserve">[Missing]</w:t>',
    )
  })
})

describe('options and determinism', () => {
  it('uses the requested body font and size in the default style', async () => {
    const styled = await readZip(
      await serializeToDOCX(doc(p('x')), { fontFamily: '"Fira Sans", sans-serif', fontSize: 14 }),
    )
    const styles = partText(styled, 'word/styles.xml')
    expect(styles).toContain('w:ascii="Fira Sans"')
    expect(styles).toContain('<w:sz w:val="28"/>')
  })

  it('resolves a font-size mark against the body size', async () => {
    const sized = await readZip(
      await serializeToDOCX(doc(p([text('x', mark('fontSize', { size: '2em' }))])), {
        fontSize: 10,
      }),
    )
    expect(partText(sized, 'word/document.xml')).toContain('<w:sz w:val="40"/><w:szCs w:val="40"/>')
  })

  it('produces an identical document part on every run', async () => {
    const again = await readZip(await serializeToDOCX(rich, { title: 'Q3 & Q4' }))
    expect(partText(again, 'word/document.xml')).toBe(body)
  })

  it('handles an empty document', async () => {
    const empty = await readZip(await serializeToDOCX(doc(p(''))))
    const root = parseXML(partText(empty, 'word/document.xml'))
    expect(root.child('w:body')?.childrenNamed('w:p')).toHaveLength(1)
  })
})

describe('what the editor drew', () => {
  // A one-pixel PNG, so the writer has real bytes to embed and measure.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const source = doc(codeBlock('const x = 1'))
  const block = source.content.children[0] as EditorNode

  it('colours a code block with the runs the editor drew', async () => {
    // Syntax highlighting is a decoration layer, so the model holds one plain
    // string; without the capture every code block exports in one colour.
    const parts = await readZip(
      await serializeToDOCX(source, {
        rendered: new Map([
          [
            block,
            {
              runs: [{ text: 'const', color: '#a626a4', bold: true }, { text: ' x = 1' }],
            },
          ],
        ]),
      }),
    )
    const body = partText(parts, 'word/document.xml')
    expect(body).toContain('<w:color w:val="A626A4"/><w:b/><w:bCs/>')
    expect(body).toContain('<w:t xml:space="preserve">const</w:t>')
    expect(body).toContain('<w:t xml:space="preserve"> x = 1</w:t>')
  })

  it('ignores a capture keyed by nodes from another document', async () => {
    const parts = await readZip(
      await serializeToDOCX(doc(codeBlock('a\nb')), {
        rendered: new Map([
          [
            doc(codeBlock('a\nb')).content.children[0] as EditorNode,
            { runs: [{ text: 'a\nb', color: '#112233' }] },
          ],
        ]),
      }),
    )
    // Different node identity: the capture is keyed by the editor's own
    // nodes, so an unrelated document simply gets the plain rendering.
    expect(partText(parts, 'word/document.xml')).not.toContain('112233')
  })

  it('embeds the picture a diagram block was previewing', async () => {
    const parts = await readZip(
      await serializeToDOCX(source, {
        rendered: new Map([[block, { image: { src: PNG, width: 400, height: 200, alt: 'Flow' } }]]),
      }),
    )
    expect([...parts.keys()].some((name) => name.startsWith('word/media/'))).toBe(true)
    const body = partText(parts, 'word/document.xml')
    expect(body).toContain('<w:drawing>')
    expect(body).toContain('descr="Flow"')
    // The drawing replaces the source it was drawn from. The source is the
    // instruction that made the picture, not a second reading of it.
    expect(body).not.toContain('const x = 1')
    expect(body).toContain('<w:jc w:val="center"/>')
  })

  it('keeps the source when nothing managed to draw a picture', async () => {
    // Dropping the block in favour of an image that is not there would lose
    // the only readable thing it held.
    const parts = await readZip(
      await serializeToDOCX(source, {
        rendered: new Map([[block, { image: { width: 400, height: 200, alt: 'Flow' } }]]),
      }),
    )
    const body = partText(parts, 'word/document.xml')
    expect(body).toContain('const x = 1')
    expect(body).not.toContain('<w:drawing>')
  })

  it('writes the block exactly as before when nothing was captured', async () => {
    const plain = await readZip(await serializeToDOCX(source))
    expect(partText(plain, 'word/document.xml')).not.toContain('<w:drawing>')
    expect(partText(plain, 'word/document.xml')).toContain('const x = 1')
  })
})

describe('the theme', () => {
  const nord = {
    'color-bg': '#2e3440',
    'color-text': '#eceff4',
    'color-text-muted': '#a9b1c1',
    'color-accent': '#88c0d0',
    'color-border': '#4c566a',
    'color-code-bg': '#434c5e',
  }
  let themed: ReadonlyMap<string, Uint8Array>

  beforeAll(async () => {
    themed = await readZip(await serializeToDOCX(rich, { theme: nord }))
  })

  it('paints the page, and tells Word to draw it', () => {
    // `w:background` on its own is stored and ignored; Word only paints it
    // when the settings part asks for it.
    expect(partText(themed, 'word/document.xml')).toContain('<w:background w:color="2E3440"/>')
    expect(partText(themed, 'word/settings.xml')).toContain('<w:displayBackgroundShape/>')
  })

  it('puts the background before the body, where the schema wants it', () => {
    const root = parseXML(partText(themed, 'word/document.xml'))
    expect(root.children.filter(isXmlElement).map((child) => child.name)).toEqual([
      'w:background',
      'w:body',
    ])
  })

  it('sets the body ink once, on the default run properties', () => {
    // Per run it would be both enormous and wrong: a style with a colour of
    // its own has to keep it.
    const styles = partText(themed, 'word/styles.xml')
    expect(styles).toContain('<w:rPrDefault><w:rPr>')
    expect(styles).toMatch(/<w:rPrDefault><w:rPr>.*?<w:color w:val="ECEFF4"\/>/s)
  })

  it('themes the styles that carried a hard-coded colour', () => {
    const styles = partText(themed, 'word/styles.xml')
    // Links, captions and the quote rule.
    expect(styles).toContain('<w:color w:val="88C0D0"/><w:u w:val="single"/>')
    expect(styles).toContain('<w:color w:val="A9B1C1"/>')
    expect(styles).toContain('w:color="4C566A"')
    // A code block keeps its own ground, and needs ink that shows on it.
    expect(styles).toContain('<w:shd w:val="clear" w:color="auto" w:fill="434C5E"/>')
    expect(styles).not.toContain('0563C1')
    expect(styles).not.toContain('F2F2F2')
  })

  it('gives table rules a colour rather than leaving Word to choose', () => {
    // `auto` means "pick one", and on a dark page Word picks against us.
    const grid = partText(themed, 'word/styles.xml')
    expect(grid).toContain('<w:top w:val="single" w:sz="4" w:space="0" w:color="4C566A"/>')
  })

  it('relates the settings part whether or not a theme was passed', async () => {
    // Media relationships are numbered from the end of this list, so a theme
    // changing its length would move every image in the document.
    const plain = partText(parts, 'word/_rels/document.xml.rels')
    expect(plain).toBe(partText(themed, 'word/_rels/document.xml.rels'))
    expect(plain).toContain('Target="settings.xml"')
  })

  it('writes the plain black-on-white when there is no theme', () => {
    const styles = partText(parts, 'word/styles.xml')
    expect(partText(parts, 'word/document.xml')).not.toContain('<w:background')
    expect(styles).toContain('0563C1')
    expect(styles).toContain('F2F2F2')
  })

  it('ignores a token holding something Word cannot express', () => {
    // A gradient, a `var()` that never resolved, `transparent`: the writer
    // keeps the colour it had rather than emitting a value Word will reject.
    return serializeToDOCX(rich, {
      theme: { 'color-bg': 'linear-gradient(red, blue)', 'color-text': 'transparent' },
    })
      .then(readZip)
      .then((broken) => {
        expect(partText(broken, 'word/document.xml')).not.toContain('<w:background')
        expect(partText(broken, 'word/styles.xml')).not.toContain('<w:color w:val="undefined"')
      })
  })
})
