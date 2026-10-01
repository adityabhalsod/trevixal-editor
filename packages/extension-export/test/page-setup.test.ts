import {
  DEFAULT_PAGE_SETUP,
  type EditorNode,
  Fragment,
  Schema,
  defaultMarks,
  defaultNodes,
  storedPageSetup,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { parseDOCX } from '../src/docx-reader'
import { serializeToDOCX } from '../src/docx-writer'
import { readZip } from '../src/zip'
import { partText } from './helpers'

// The page and section breaks of extension-blocks, as a document carries them.
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    pageBreak: { group: 'block', atom: true, toHTML: () => ({ tag: 'div' }) },
    sectionBreak: {
      group: 'block',
      atom: true,
      attrs: {
        orientation: { default: null },
        columns: { default: null },
        margin: { default: null },
      },
      toHTML: () => ({ tag: 'div' }),
    },
  },
  marks: defaultMarks(),
})

const paragraph = (text: string): EditorNode =>
  schema.node('paragraph', undefined, [schema.text(text)])
const documentOf = (attrs: Record<string, unknown>, ...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', attrs, Fragment.from(blocks))

async function wordParts(doc: EditorNode): Promise<ReadonlyMap<string, Uint8Array>> {
  return readZip(await serializeToDOCX(doc))
}

describe('page setup in a Word document', () => {
  it('keeps the page Word export always had, for a document never set up', async () => {
    const parts = await wordParts(documentOf({}, paragraph('Text')))
    expect(partText(parts, 'word/document.xml')).toContain('<w:pgSz w:w="12240" w:h="15840"/>')
    expect(parts.has('word/header1.xml')).toBe(false)
  })

  it('sets the paper, the margins, and a header and footer with page fields', async () => {
    const pageSetup = storedPageSetup({
      ...DEFAULT_PAGE_SETUP,
      orientation: 'landscape',
      margins: { top: 10, right: 15, bottom: 20, left: 25 },
      header: 'Report',
      footer: 'Page {page} of {pages}',
    })
    const parts = await wordParts(documentOf({ pageSetup }, paragraph('Text')))
    const body = partText(parts, 'word/document.xml')
    expect(body).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>')
    expect(body).toContain('w:top="567" w:right="850" w:bottom="1134" w:left="1417"')
    expect(body).toMatch(
      /<w:headerReference w:type="default" r:id="rId\d+"\/><w:footerReference w:type="default" r:id="rId\d+"\/>/,
    )
    expect(partText(parts, 'word/header1.xml')).toContain('>Report</w:t>')
    const footer = partText(parts, 'word/footer1.xml')
    expect(footer).toContain('<w:fldSimple w:instr=" PAGE ">')
    expect(footer).toContain('<w:fldSimple w:instr=" NUMPAGES ">')
    expect(partText(parts, 'word/_rels/document.xml.rels')).toContain('Target="footer1.xml"')
    expect(partText(parts, '[Content_Types].xml')).toContain('/word/header1.xml')
  })

  it('ends each section on its own page, and breaks the page where the document does', async () => {
    const turned = schema.node('sectionBreak', {
      orientation: 'landscape',
      columns: 2,
      margin: null,
    })
    const parts = await wordParts(
      documentOf(
        {},
        paragraph('One'),
        schema.node('pageBreak'),
        paragraph('Two'),
        turned,
        paragraph('Three'),
      ),
    )
    const body = partText(parts, 'word/document.xml')
    expect(body).toContain('<w:br w:type="page"/>')
    // The first section ends in a paragraph of its own, upright; the last is the body's, turned.
    const ended = body.indexOf('<w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/>')
    expect(ended).toBeGreaterThan(body.indexOf('Two'))
    expect(ended).toBeLessThan(body.indexOf('Three'))
    expect(body).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>')
    expect(body).toContain('<w:cols w:num="2" w:space="720"/>')
  })

  it('reads a page break back as one, not as a line break', async () => {
    const written = await serializeToDOCX(
      documentOf({}, paragraph('One'), schema.node('pageBreak'), paragraph('Two')),
    )
    const read = await parseDOCX(schema, written)
    expect(read.content.children.map((node) => node.type.name)).toEqual([
      'paragraph',
      'pageBreak',
      'paragraph',
    ])
  })
})
