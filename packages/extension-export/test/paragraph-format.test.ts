import { type Attrs, type EditorNode, Fragment } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { readZip } from '../src/zip'
import { p, partText, schema } from './helpers'

const settled = (attrs: Attrs, ...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', attrs, Fragment.from(blocks))

async function word(
  document: EditorNode,
): Promise<{ body: string; styles: string; settings: string }> {
  const parts = await readZip(await serializeToDOCX(document))
  return {
    body: partText(parts, 'word/document.xml'),
    styles: partText(parts, 'word/styles.xml'),
    settings: partText(parts, 'word/settings.xml'),
  }
}

const boxed = p('Boxed', {
  borderSides: 'top right bottom left',
  borderStyle: 'dashed',
  borderWidth: 2,
  borderColor: '#336699',
  shading: '#fff3c4',
})

describe('paragraph borders and shading in Word', () => {
  it('write each side as w:pBdr in schema order, and the fill as w:shd', async () => {
    const { body } = await word(settled({}, boxed))
    expect(body).toContain(
      '<w:pBdr><w:top w:val="dashed" w:sz="12" w:space="1" w:color="336699"/><w:left w:val="dashed" w:sz="12" w:space="4" w:color="336699"/><w:bottom w:val="dashed" w:sz="12" w:space="1" w:color="336699"/><w:right w:val="dashed" w:sz="12" w:space="4" w:color="336699"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="FFF3C4"/>',
    )
  })

  it('fill nothing for a colour that shows nothing, rather than black', async () => {
    const clear = settled({}, p('Clear', { shading: 'rgba(0, 0, 0, 0)' }))
    expect((await word(clear)).body).not.toContain('<w:shd')
    expect(serializeToRTF(clear)).not.toMatch(/\\cbpat/)
  })

  it('draw in the text colour when the border has none', async () => {
    const { body } = await word(settled({}, p('Rule', { borderSides: 'bottom' })))
    expect(body).toContain(
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>',
    )
  })
})

describe('drop caps in Word', () => {
  it('put the first letter in a frame of its own, dropped over its lines', async () => {
    const { body } = await word(
      settled({}, p('Once upon a time', { dropCap: 'drop', dropCapLines: 3 })),
    )
    expect(body).toContain(
      '<w:p><w:pPr><w:keepNext/><w:framePr w:dropCap="drop" w:lines="3" w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>',
    )
    expect(body).toContain('<w:t xml:space="preserve">O</w:t></w:r></w:p><w:p>')
    expect(body).toContain('<w:t xml:space="preserve">nce upon a time</w:t>')
  })

  it('hang it in the margin when asked, and leave a paragraph without text alone', async () => {
    const { body } = await word(
      settled(
        {},
        p('In the margin', { dropCap: 'margin', dropCapLines: 2 }),
        p('', { dropCap: 'drop' }),
      ),
    )
    expect(body).toContain('w:dropCap="margin" w:lines="2"')
    expect(body.match(/w:framePr/g)).toHaveLength(1)
  })
})

describe('hyphenation and widow control in Word', () => {
  it('keep widow control on by default, and hyphenate only when asked', async () => {
    const plain = await word(settled({}, p('x')))
    expect(plain.styles).toContain('<w:pPrDefault><w:pPr><w:widowControl/><w:spacing')
    expect(plain.settings).not.toContain('w:autoHyphenation')
    const set = await word(settled({ hyphenation: true, widowControl: false }, p('x')))
    expect(set.styles).not.toContain('w:widowControl')
    expect(set.settings).toContain('<w:displayBackgroundShape/><w:autoHyphenation/>')
  })
})

describe('paragraph formatting in RTF', () => {
  it('carries borders, shading, a drop cap, hyphenation and widow control', () => {
    const rtf = serializeToRTF(
      settled({ hyphenation: true }, boxed, p('Once', { dropCap: 'margin', dropCapLines: 3 })),
    )
    expect(rtf).toContain('\\widowctrl\\hyphauto1')
    expect(rtf).toMatch(/\\brdrt\\brdrdash\\brdrw30\\brsp20\\brdrcf\d+/)
    expect(rtf).toMatch(/\\brdrl\\brdrdash\\brdrw30\\brsp80\\brdrcf\d+/)
    expect(rtf).toMatch(/\\cbpat\d+/)
    expect(rtf).toMatch(/\\dropcapli3\\dropcapt2\\pvpara\\wraparound\\f0\\fs\d+ O\\par/)
    expect(rtf).toContain(' nce\\par')
  })
})

describe('text columns in Word and RTF', () => {
  it('set the section in newspaper columns, with the line between when asked', async () => {
    const { body } = await word(
      settled({ columns: 2, columnRule: true, lineNumbers: true }, p('x')),
    )
    expect(body).toContain(
      '<w:lnNumType w:countBy="1" w:restart="continuous"/><w:cols w:num="2" w:space="720" w:sep="1"/></w:sectPr>',
    )
    const plain = await word(settled({}, p('x')))
    expect(plain.body).not.toContain('w:cols')
    expect(serializeToRTF(settled({ columns: 3 }, p('x')))).toContain('\\sectd\\cols3\\colsx720')
    expect(serializeToRTF(settled({ columns: 2, columnRule: true }, p('x')))).toContain(
      '\\cols2\\colsx720\\linebetcol',
    )
  })
})

describe('tab stops in Word and RTF', () => {
  it('write each stop with its alignment, leader and position, and the tab as a tab', async () => {
    const contents = p('Results\t12', { tabStops: '72 center, 432 right dot' })
    const { body } = await word(settled({}, contents))
    expect(body).toContain(
      '<w:tabs><w:tab w:val="center" w:pos="1440"/><w:tab w:val="right" w:leader="dot" w:pos="8640"/></w:tabs>',
    )
    expect(body).toContain('<w:tab/>')
    const rtf = serializeToRTF(settled({}, contents))
    expect(rtf).toContain('\\tqc\\tx1440\\tqr\\tldot\\tx8640')
    expect(rtf).toContain('Results\\tab 12')
  })
})
