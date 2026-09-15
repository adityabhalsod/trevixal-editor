import { describe, expect, it } from 'vitest'
import {
  docxExporter,
  docxImporter,
  exportFormats,
  importFormats,
  rtfExporter,
} from '../src/formats'
import { readZip } from '../src/zip'
import { doc, heading, p, schema } from './helpers'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const sample = doc(heading(1, 'Quarterly review'), p('Revenue held steady.'))
const exportContext = { schema, title: 'Quarterly review' }

const decoder = new TextDecoder()

describe('docxExporter', () => {
  it('describes itself for a save menu', () => {
    const exporter = docxExporter()
    expect(exporter.name).toBe('docx')
    expect(exporter.label).toBe('Word document (.docx)')
    expect(exporter.extension).toBe('docx')
    expect(exporter.mime).toBe(DOCX_MIME)
  })

  it('serializes to a readable OOXML package', async () => {
    const bytes = await docxExporter().serialize(sample, exportContext)
    expect(bytes).toBeInstanceOf(Uint8Array)
    const parts = await readZip(bytes as Uint8Array)
    expect([...parts.keys()]).toContain('word/document.xml')
    expect(decoder.decode(parts.get('word/document.xml') as Uint8Array)).toContain(
      'Quarterly review',
    )
  })

  it('passes the context title into the core properties', async () => {
    const bytes = (await docxExporter().serialize(sample, exportContext)) as Uint8Array
    const parts = await readZip(bytes)
    expect(decoder.decode(parts.get('docProps/core.xml') as Uint8Array)).toContain(
      '<dc:title>Quarterly review</dc:title>',
    )
  })
})

describe('rtfExporter', () => {
  it('describes itself for a save menu', () => {
    const exporter = rtfExporter()
    expect(exporter.name).toBe('rtf')
    expect(exporter.label).toBe('Rich text (.rtf)')
    expect(exporter.extension).toBe('rtf')
    expect(exporter.mime).toBe('application/rtf')
  })

  it('serializes to an RTF string', async () => {
    const rtf = await rtfExporter().serialize(sample, exportContext)
    expect(typeof rtf).toBe('string')
    expect(rtf as string).toMatch(/^\{\\rtf1\\ansi/)
    expect(rtf as string).toContain('Quarterly review')
  })
})

describe('docxImporter', () => {
  it('describes itself for a file picker', () => {
    const importer = docxImporter()
    expect(importer.name).toBe('docx')
    expect(importer.label).toBe('Word document (.docx)')
    expect(importer.extensions).toEqual(['docx'])
  })

  it('parses a file written by the matching exporter', async () => {
    const bytes = (await docxExporter().serialize(sample, exportContext)) as Uint8Array
    const file = new File([new Uint8Array(bytes)], 'review.docx', { type: DOCX_MIME })
    const parsed = await docxImporter().parse(file, { schema })
    expect(parsed.content.children.map((child) => child.type.name)).toEqual([
      'heading',
      'paragraph',
    ])
    expect(parsed.textContent).toBe('Quarterly reviewRevenue held steady.')
  })
})

describe('the theme on the export context', () => {
  // The exporters are built once, at startup; the theme changes while the
  // editor runs. It therefore has to arrive with the document rather than
  // with the descriptor, or every download carries the palette that happened
  // to be in force when the menu was assembled.
  const themed = { ...exportContext, theme: { tokens: { 'color-bg': '#2e3440' } } }

  it('reaches the DOCX writer', async () => {
    const parts = await readZip((await docxExporter().serialize(sample, themed)) as Uint8Array)
    expect(decoder.decode(parts.get('word/document.xml'))).toContain(
      '<w:background w:color="2E3440"/>',
    )
  })

  it('reaches the RTF writer', () => {
    expect(rtfExporter().serialize(sample, themed)).toContain('{\\*\\background')
  })

  it('lets an explicit option override it', async () => {
    // `docxExporter({ theme })` is the host pinning a palette; the live one
    // must not overwrite that.
    const pinned = docxExporter({ theme: { 'color-bg': '#ffee00' } })
    const parts = await readZip((await pinned.serialize(sample, themed)) as Uint8Array)
    expect(decoder.decode(parts.get('word/document.xml'))).toContain(
      '<w:background w:color="FFEE00"/>',
    )
  })
})

describe('format registries', () => {
  it('lists both exporters, DOCX first', () => {
    expect(exportFormats().map((format) => format.name)).toEqual(['docx', 'rtf'])
  })

  it('lists the DOCX importer', () => {
    expect(importFormats().map((format) => format.name)).toEqual(['docx'])
  })

  it('hands back fresh descriptors so a caller may not mutate the registry', () => {
    expect(exportFormats()).not.toBe(exportFormats())
    expect(importFormats()).not.toBe(importFormats())
  })
})
