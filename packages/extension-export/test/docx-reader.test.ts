import { type EditorNode, Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { parseDOCX } from '../src/docx-reader'
import { serializeToDOCX } from '../src/docx-writer'
import { createZip } from '../src/zip'
import {
  bulletList,
  cell,
  doc,
  hardBreak,
  heading,
  image,
  listItem,
  mark,
  orderedList,
  p,
  pngDataURL,
  row,
  schema,
  table,
  text,
} from './helpers'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** A schema with neither tables nor images, to exercise the fallbacks. */
const plainSchema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function blocks(node: EditorNode): readonly EditorNode[] {
  return node.content.children
}

function names(node: EditorNode): string[] {
  return blocks(node).map((child) => child.type.name)
}

function markNames(node: EditorNode): string[][] {
  return node.content.children.map((child) => child.marks.map((m) => m.type.name).sort())
}

// --- a package assembled by hand, so the reader is proved on its own ---------

const DOCUMENT = [
  HEADER,
  `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>`,
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p>',
  '<w:p><w:r><w:t xml:space="preserve">See </w:t></w:r>',
  '<w:hyperlink r:id="rId7"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the site</w:t></w:r></w:hyperlink>',
  '</w:p>',
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Bulleted</w:t></w:r></w:p>',
  '<w:p><w:r><w:rPr><w:b/><w:i/><w:color w:val="C00000"/></w:rPr><w:t>Strong</w:t></w:r></w:p>',
  '<w:sdt><w:sdtContent><w:p><w:r><w:t>Inside a control</w:t></w:r></w:p></w:sdtContent></w:sdt>',
  '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
  '</w:body></w:document>',
].join('')

const STYLES = [
  HEADER,
  `<w:styles xmlns:w="${W}">`,
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>',
  '<w:style w:type="paragraph" w:styleId="TitleStyle"><w:name w:val="Title"/></w:style>',
  '</w:styles>',
].join('')

const NUMBERING = [
  HEADER,
  `<w:numbering xmlns:w="${W}">`,
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>',
  '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>',
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>',
  '</w:numbering>',
].join('')

const RELS = [
  HEADER,
  `<Relationships xmlns="${PKG_REL}">`,
  `<Relationship Id="rId7" Type="${R}/hyperlink" Target="https://example.com/docs" TargetMode="External"/>`,
  '</Relationships>',
].join('')

function handBuilt(document = DOCUMENT): Uint8Array {
  return createZip([
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
    { name: 'word/_rels/document.xml.rels', data: RELS },
  ])
}

/** A body holding only the given paragraphs, for focused cases. */
function bodyOf(...paragraphs: string[]): string {
  return [
    HEADER,
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>`,
    ...paragraphs,
    '</w:body></w:document>',
  ].join('')
}

describe('parseDOCX on a hand-built package', () => {
  it('maps a styled paragraph to a heading, keeping its alignment', async () => {
    const parsed = await parseDOCX(schema, handBuilt())
    const first = blocks(parsed)[0] as EditorNode
    expect(first.type.name).toBe('heading')
    expect(first.attrs.level).toBe(1)
    expect(first.attrs.align).toBe('center')
    expect(first.textContent).toBe('Report')
  })

  it('resolves a hyperlink relationship into a link mark', async () => {
    const parsed = await parseDOCX(schema, handBuilt())
    const paragraph = blocks(parsed)[1] as EditorNode
    expect(paragraph.textContent).toBe('See the site')
    const linked = paragraph.content.children[1] as EditorNode
    expect(linked.textContent).toBe('the site')
    expect(linked.marks[0]?.type.name).toBe('link')
    expect(linked.marks[0]?.attrs.href).toBe('https://example.com/docs')
  })

  it('turns a numbered paragraph into a bullet list', async () => {
    const parsed = await parseDOCX(schema, handBuilt())
    const list = blocks(parsed)[2] as EditorNode
    expect(list.type.name).toBe('bulletList')
    expect(list.textContent).toBe('Bulleted')
  })

  it('reads bold, italic and colour off a run', async () => {
    const parsed = await parseDOCX(schema, handBuilt())
    const paragraph = blocks(parsed)[3] as EditorNode
    const run = paragraph.content.children[0] as EditorNode
    expect(run.marks.map((m) => m.type.name).sort()).toEqual(['bold', 'italic', 'textColor'])
    const color = run.marks.find((m) => m.type.name === 'textColor')
    expect(color?.attrs.color).toBe('#c00000')
  })

  it('recurses into a structured document tag', async () => {
    const parsed = await parseDOCX(schema, handBuilt())
    const last = blocks(parsed)[4] as EditorNode
    expect(last.textContent).toBe('Inside a control')
  })

  it('honours numFmt and w:start when picking the list kind', async () => {
    const parsed = await parseDOCX(
      schema,
      handBuilt(
        bodyOf(
          '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Third</w:t></w:r></w:p>',
        ),
      ),
    )
    const list = blocks(parsed)[0] as EditorNode
    expect(list.type.name).toBe('orderedList')
    expect(list.attrs.start).toBe(3)
  })

  it('reads indentation as indent steps and tabs as tab characters', async () => {
    const parsed = await parseDOCX(
      schema,
      handBuilt(
        bodyOf(
          '<w:p><w:pPr><w:ind w:left="1440"/></w:pPr><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r></w:p>',
        ),
      ),
    )
    const paragraph = blocks(parsed)[0] as EditorNode
    expect(paragraph.attrs.indent).toBe(2)
    expect(paragraph.textContent).toBe('a\tb')
  })

  it('collapses a run of more than one empty paragraph', async () => {
    const parsed = await parseDOCX(
      schema,
      handBuilt(
        bodyOf(
          '<w:p><w:r><w:t>a</w:t></w:r></w:p>',
          '<w:p/>',
          '<w:p/>',
          '<w:p/>',
          '<w:p><w:r><w:t>b</w:t></w:r></w:p>',
        ),
      ),
    )
    expect(blocks(parsed)).toHaveLength(3)
    expect((blocks(parsed)[1] as EditorNode).childCount).toBe(0)
  })

  it('links to an internal anchor when there is no relationship', async () => {
    const parsed = await parseDOCX(
      schema,
      handBuilt(
        bodyOf('<w:p><w:hyperlink w:anchor="top"><w:r><w:t>Top</w:t></w:r></w:hyperlink></w:p>'),
      ),
    )
    const run = (blocks(parsed)[0] as EditorNode).content.children[0] as EditorNode
    expect(run.marks[0]?.attrs.href).toBe('#top')
  })

  it('ignores elements it does not understand instead of throwing', async () => {
    const parsed = await parseDOCX(
      schema,
      handBuilt(
        bodyOf(
          '<w:bookmarkStart w:id="0" w:name="_GoBack"/>',
          '<w:customXml><w:p><w:r><w:t>hidden</w:t></w:r></w:p></w:customXml>',
          '<w:p><w:r><w:t>kept</w:t></w:r><w:noBreakHyphen/><w:fldChar w:fldCharType="begin"/></w:p>',
        ),
      ),
    )
    expect(parsed.textContent).toBe('kept')
  })

  it('rejects an archive that is not a Word package', async () => {
    const zip = createZip([{ name: 'hello.txt', data: 'hi' }])
    await expect(parseDOCX(schema, zip)).rejects.toThrow(/word\/document\.xml/)
  })

  it('accepts an ArrayBuffer and a Blob as well as bytes', async () => {
    const bytes = handBuilt()
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const fromBuffer = await parseDOCX(schema, buffer as ArrayBuffer)
    const fromBlob = await parseDOCX(schema, new Blob([new Uint8Array(bytes)]))
    expect(fromBuffer.textContent).toBe(fromBlob.textContent)
    expect(fromBuffer.textContent).toContain('Report')
  })
})

// --- round trip through the writer ------------------------------------------

const roundTripDoc = doc(
  heading(2, 'Chapter'),
  p([
    text('plain '),
    text('bold', mark('bold')),
    text(' '),
    text('red', mark('textColor', { color: '#ff0000' })),
    text(' '),
    text('site', mark('link', { href: 'https://example.com/docs' })),
  ]),
  p([text('one'), hardBreak(), text('two')]),
  bulletList(listItem(p('first'), bulletList(listItem(p('nested')))), listItem(p('second'))),
  orderedList(5, listItem(p('five')), listItem(p('six'))),
  table(
    undefined,
    row(cell('Name', { header: true }), cell('Value', { header: true })),
    row(cell('spans both', { colspan: 2 })),
  ),
  image({ src: pngDataURL(20, 10), alt: 'chart' }),
)

async function roundTrip(target = schema, images?: 'embed' | 'skip'): Promise<EditorNode> {
  const bytes = await serializeToDOCX(roundTripDoc, { title: 'Round trip' })
  return parseDOCX(target, bytes, images ? { images } : undefined)
}

describe('serializeToDOCX → parseDOCX round trip', () => {
  it('keeps the sequence of block types', async () => {
    const parsed = await roundTrip()
    expect(names(parsed)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'bulletList',
      'orderedList',
      'table',
      'image',
    ])
  })

  it('keeps heading level and text', async () => {
    const parsed = await roundTrip()
    const first = blocks(parsed)[0] as EditorNode
    expect(first.attrs.level).toBe(2)
    expect(first.textContent).toBe('Chapter')
  })

  it('keeps inline marks and the link href', async () => {
    const parsed = await roundTrip()
    const paragraph = blocks(parsed)[1] as EditorNode
    expect(paragraph.textContent).toBe('plain bold red site')
    expect(markNames(paragraph)).toEqual([[], ['bold'], [], ['textColor'], [], ['link']])
    const link = paragraph.content.children[5] as EditorNode
    expect(link.marks[0]?.attrs.href).toBe('https://example.com/docs')
    const red = paragraph.content.children[3] as EditorNode
    expect(red.marks[0]?.attrs.color).toBe('#ff0000')
  })

  it('keeps a hard break', async () => {
    const parsed = await roundTrip()
    const paragraph = blocks(parsed)[2] as EditorNode
    expect(paragraph.content.children.map((child) => child.type.name)).toEqual([
      'text',
      'hardBreak',
      'text',
    ])
  })

  it('keeps list nesting', async () => {
    const parsed = await roundTrip()
    const list = blocks(parsed)[3] as EditorNode
    expect(list.type.name).toBe('bulletList')
    expect(list.childCount).toBe(2)
    const first = list.content.children[0] as EditorNode
    expect(first.content.children.map((child) => child.type.name)).toEqual([
      'paragraph',
      'bulletList',
    ])
    expect((first.content.children[1] as EditorNode).textContent).toBe('nested')
    expect((list.content.children[1] as EditorNode).textContent).toBe('second')
  })

  it("keeps an ordered list's start", async () => {
    const parsed = await roundTrip()
    const list = blocks(parsed)[4] as EditorNode
    expect(list.type.name).toBe('orderedList')
    expect(list.attrs.start).toBe(5)
    expect(list.textContent).toBe('fivesix')
  })

  it('keeps table shape, the header row and colspan', async () => {
    const parsed = await roundTrip()
    const built = blocks(parsed)[5] as EditorNode
    expect(built.childCount).toBe(2)
    const header = built.content.children[0] as EditorNode
    expect(header.content.children.map((c) => c.attrs.header)).toEqual([true, true])
    expect(header.textContent).toBe('NameValue')
    const body = built.content.children[1] as EditorNode
    expect(body.childCount).toBe(1)
    const wide = body.content.children[0] as EditorNode
    expect(wide.attrs.colspan).toBe(2)
    expect(wide.attrs.header).toBe(false)
    expect(wide.textContent).toBe('spans both')
  })

  it('re-embeds the image with its size in pixels', async () => {
    const parsed = await roundTrip()
    const embedded = blocks(parsed)[6] as EditorNode
    expect(embedded.type.name).toBe('image')
    expect(embedded.attrs.src).toBe(pngDataURL(20, 10))
    expect(embedded.attrs.alt).toBe('chart')
    expect(embedded.attrs.width).toBe('20px')
    expect(embedded.attrs.height).toBe('10px')
  })

  it('drops images when asked to skip them', async () => {
    const parsed = await roundTrip(schema, 'skip')
    expect(names(parsed)).not.toContain('image')
    expect(parsed.textContent).toContain('Chapter')
  })
})

describe('parseDOCX against a schema missing node types', () => {
  it('falls back to paragraphs when the schema has no table', async () => {
    const parsed = await roundTrip(plainSchema)
    expect(names(parsed)).not.toContain('table')
    expect(parsed.textContent).toContain('Name')
    expect(parsed.textContent).toContain('spans both')
  })

  it('drops images the schema cannot hold', async () => {
    const parsed = await roundTrip(plainSchema)
    expect(names(parsed)).not.toContain('image')
  })

  it('still nests lists, which the default schema does have', async () => {
    const parsed = await roundTrip(plainSchema)
    expect(names(parsed)).toContain('bulletList')
    expect(names(parsed)).toContain('orderedList')
  })
})
