import { type Attrs, type EditorNode, Fragment } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { readZip } from '../src/zip'
import { heading, mark, p, partText, schema, text } from './helpers'

const settled = (attrs: Attrs, ...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', attrs, Fragment.from(blocks))

const STYLES = JSON.stringify([
  { id: 'normal', props: { fontFamily: 'Georgia', fontSize: 12, spaceAfter: 6 } },
  { id: 'heading1', props: { color: '#224488', bold: false } },
  { id: 'memo', name: 'Memo text', kind: 'paragraph', props: { italic: true, align: 'center' } },
  { id: 'loud', name: 'Loud', kind: 'character', props: { bold: true, underline: true } },
])

const document = settled(
  { styles: STYLES },
  heading(1, 'Plan'),
  p('Body'),
  p('A memo', { paragraphStyle: 'memo' }),
  p([text('very '), text('important', mark('charStyle', { id: 'loud' }))]),
)

async function word(doc: EditorNode): Promise<{ body: string; styles: string }> {
  const parts = await readZip(await serializeToDOCX(doc))
  return { body: partText(parts, 'word/document.xml'), styles: partText(parts, 'word/styles.xml') }
}

describe('named styles in Word', () => {
  it('write the changed built-in styles and the writer’s own as Word styles', async () => {
    const { styles } = await word(document)
    expect(styles).toContain(
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>',
    )
    expect(styles).toContain(
      '<w:rPr><w:b w:val="0"/><w:bCs w:val="0"/><w:color w:val="224488"/><w:sz w:val="32"/>',
    )
    expect(styles).toContain(
      '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Tvx-memo"><w:name w:val="Memo text"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:iCs/></w:rPr></w:style>',
    )
    expect(styles).toContain(
      '<w:style w:type="character" w:customStyle="1" w:styleId="Tvx-loud"><w:name w:val="Loud"/><w:qFormat/><w:rPr><w:b/><w:bCs/><w:u w:val="single"/></w:rPr></w:style>',
    )
    // The built-in character styles are there for a run to point at, changed or not.
    expect(styles).toContain('w:styleId="Emphasis"')
    expect(styles).toContain('w:styleId="Subtitle"')
  })

  it('point each paragraph and run at its style', async () => {
    const { body } = await word(document)
    expect(body).toContain('<w:pPr><w:pStyle w:val="Tvx-memo"/></w:pPr>')
    expect(body).toContain(
      '<w:rPr><w:rStyle w:val="Tvx-loud"/></w:rPr><w:t xml:space="preserve">important</w:t>',
    )
    // A style the document does not have is not pointed at.
    const stray = await word(settled({}, p('x', { paragraphStyle: 'gone' })))
    expect(stray.body).not.toContain('Tvx-gone')
  })
})

describe('named styles in RTF', () => {
  it('write each style’s look into the paragraphs and runs in it', () => {
    const rtf = serializeToRTF(document)
    // Normal: Georgia at 12 pt, 6 pt after, for a body paragraph.
    expect(rtf).toMatch(/\\f\d+\\fs24\\sa120 Body\\par/)
    // The memo style, based on Normal: Normal's font, its own slant and alignment.
    expect(rtf).toMatch(/\\f\d+\\i\\qc A memo\\par/)
    expect(rtf).toMatch(/\{\\b\\ul important\}/)
  })

  it('draw a built-in style the document left alone in its own look, as Word’s', () => {
    const rtf = serializeToRTF(
      settled(
        {},
        p('Plan', { paragraphStyle: 'title' }),
        p('Draft', { paragraphStyle: 'subtitle' }),
        p([text('very '), text('important', mark('charStyle', { id: 'strong' }))]),
      ),
    )
    expect(rtf).toMatch(/\\fs56\\sa240 Plan\\par/)
    expect(rtf).toMatch(/\\fs30\\cf\d+\\sa160 Draft\\par/)
    expect(rtf).toMatch(/\{\\b important\}/)
  })
})
