import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDOCX } from '../src/docx-reader'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { escapeXML, parseXML } from '../src/xml'
import { createZip, readZip } from '../src/zip'
import {
  bulletList,
  cell,
  doc,
  heading,
  listItem,
  mark,
  orderedList,
  p,
  partText,
  row,
  schema,
  table,
  text,
} from './helpers'

async function documentXML(node: ReturnType<typeof doc>): Promise<string> {
  const parts = await readZip(await serializeToDOCX(node))
  return partText(parts, 'word/document.xml')
}

async function numberingXML(node: ReturnType<typeof doc>): Promise<string> {
  const parts = await readZip(await serializeToDOCX(node))
  return partText(parts, 'word/numbering.xml')
}

function hasUnzip(): boolean {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/** A minimal DOCX package built by hand so the reader sees exactly the XML under test. */
function packageWith(body: string, numbering = ''): Uint8Array {
  return createZip([
    {
      name: '[Content_Types].xml',
      data: `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    },
    {
      name: 'word/document.xml',
      data: `${XML_HEADER}<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    },
    ...(numbering
      ? [
          {
            name: 'word/numbering.xml',
            data: `${XML_HEADER}<w:numbering xmlns:w="${W}">${numbering}</w:numbering>`,
          },
        ]
      : []),
  ])
}

describe('review 2: XML escaping', () => {
  it('strips characters that XML 1.0 forbids so Word does not reject the part', () => {
    const escaped = escapeXML('a\u0000b\u0001c\u0008d\u000be\u000cf\u001fg\ufffeh\uffffi')
    expect(escaped).toBe('abcdefghi')
  })

  it('keeps tab, newline and carriage return, which XML allows', () => {
    expect(escapeXML('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })

  it('drops a lone surrogate, which cannot be encoded as UTF-8', () => {
    expect(escapeXML('x\ud800y')).toBe('xy')
    expect(escapeXML('x\udc00y')).toBe('xy')
    // A proper pair survives.
    expect(escapeXML('x😀y')).toBe('x😀y')
  })

  it('keeps control characters out of the DOCX body', async () => {
    const xml = await documentXML(doc(p('bad\u0007bell')))
    expect(xml).not.toContain('\u0007')
    expect(xml).toContain('badbell')
  })

  it('keeps control characters out of the RTF body', () => {
    expect(serializeToRTF(doc(p('bad\u0007bell')))).toContain('badbell')
  })
})

describe('review 2: DOCX list numbering', () => {
  it('restarts every ordered list instead of continuing the previous one', async () => {
    const xml = await numberingXML(
      doc(
        orderedList(1, listItem(p('one')), listItem(p('two'))),
        p('between'),
        orderedList(1, listItem(p('again'))),
      ),
    )
    const root = parseXML(xml)
    const nums = root.childrenNamed('w:num')
    expect(nums).toHaveLength(2)
    // Word treats several w:num instances sharing an abstractNum as one
    // continuous list unless each carries a startOverride.
    for (const num of nums) {
      const override = num.child('w:lvlOverride')
      expect(override?.attr('w:ilvl')).toBe('0')
      expect(override?.child('w:startOverride')?.attr('w:val')).toBe('1')
    }
  })

  it('puts the start override on the level a nested ordered list uses', async () => {
    const xml = await numberingXML(
      doc(bulletList(listItem(p('outer'), orderedList(3, listItem(p('inner')))))),
    )
    const root = parseXML(xml)
    const nested = root
      .childrenNamed('w:num')
      .find((num) => num.child('w:abstractNumId')?.attr('w:val') === '1')
    expect(nested).toBeDefined()
    const override = nested?.child('w:lvlOverride')
    expect(override?.attr('w:ilvl')).toBe('1')
    expect(override?.child('w:startOverride')?.attr('w:val')).toBe('3')
  })
})

describe('review 2: DOCX hyperlink targets', () => {
  it('percent-encodes characters that are not valid in a URI', async () => {
    const link = mark('link', { href: 'https://example.com/a b/{c}|d^e`f"g<h>i\\j' })
    const parts = await readZip(await serializeToDOCX(doc(p([text('go', link)]))))
    const rels = partText(parts, 'word/_rels/document.xml.rels')
    expect(rels).toContain('Target="https://example.com/a%20b/%7Bc%7D%7Cd%5Ee%60f%22g%3Ch%3Ei%5Cj"')
  })

  it('percent-encodes non-ASCII characters as UTF-8', async () => {
    const link = mark('link', { href: 'https://例え.jp/パス?q=ü' })
    const parts = await readZip(await serializeToDOCX(doc(p([text('go', link)]))))
    const rels = partText(parts, 'word/_rels/document.xml.rels')
    expect(rels).toContain('Target="https://%E4%BE%8B%E3%81%88.jp/%E3%83%91%E3%82%B9?q=%C3%BC"')
  })

  it('leaves an already-encoded URL alone', async () => {
    const link = mark('link', { href: 'https://example.com/a%20b?x=1&y=2#frag' })
    const parts = await readZip(await serializeToDOCX(doc(p([text('go', link)]))))
    const rels = partText(parts, 'word/_rels/document.xml.rels')
    expect(rels).toContain('Target="https://example.com/a%20b?x=1&amp;y=2#frag"')
  })
})

describe('review 2: DOCX reader', () => {
  const numbering =
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'

  it('does not turn a list paragraph’s hanging indent into an extra indent step', async () => {
    const body =
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t>item</w:t></w:r></w:p>'
    const parsed = await parseDOCX(schema, packageWith(body, numbering))
    const list = parsed.child(0)
    expect(list.type.name).toBe('bulletList')
    const paragraph = list.child(0).child(0)
    expect(paragraph.type.name).toBe('paragraph')
    expect(paragraph.attrs.indent).toBe(0)
  })

  it('still honours the indent of an ordinary paragraph', async () => {
    const body = '<w:p><w:pPr><w:ind w:left="1440"/></w:pPr><w:r><w:t>indented</w:t></w:r></w:p>'
    const parsed = await parseDOCX(schema, packageWith(body))
    expect(parsed.child(0).attrs.indent).toBe(2)
  })
})

describe('review 2: ZIP reader robustness', () => {
  function withMethod(archive: Uint8Array, method: number): Uint8Array {
    // Patch the compression method in both the local header (offset 8) and
    // the central directory entry (offset 10 from its signature).
    const out = new Uint8Array(archive)
    out[8] = method & 0xff
    out[9] = (method >>> 8) & 0xff
    const central = findSignature(out, 0x02014b50)
    out[central + 10] = method & 0xff
    out[central + 11] = (method >>> 8) & 0xff
    return out
  }

  function findSignature(data: Uint8Array, signature: number): number {
    for (let offset = 0; offset + 4 <= data.length; offset++) {
      const value =
        ((data[offset] as number) |
          ((data[offset + 1] as number) << 8) |
          ((data[offset + 2] as number) << 16) |
          ((data[offset + 3] as number) << 24)) >>>
        0
      if (value === signature) return offset
    }
    throw new Error('signature not found')
  }

  it('rejects a corrupt deflated entry with an error instead of an unhandled rejection', async () => {
    const archive = withMethod(createZip([{ name: 'a.txt', data: 'not really deflated data' }]), 8)
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      await expect(readZip(archive)).rejects.toThrow()
      // Let any stray rejection from the stream writer surface.
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])
  })

  it('names ZIP64 when the compressed size is the ZIP64 marker', async () => {
    const archive = new Uint8Array(createZip([{ name: 'a.txt', data: 'hello' }]))
    const central = findSignature(archive, 0x02014b50)
    archive.set([0xff, 0xff, 0xff, 0xff], central + 20)
    await expect(readZip(archive)).rejects.toThrow(/ZIP64/)
  })

  it('rejects a truncated archive without hanging', async () => {
    const archive = createZip([{ name: 'a.txt', data: 'hello world' }])
    await expect(readZip(archive.subarray(0, archive.length - 30))).rejects.toThrow()
    await expect(readZip(archive.subarray(0, 10))).rejects.toThrow()
  })
})

describe('review 2: package validity', () => {
  it.skipIf(!hasUnzip())('produces an archive unzip -t accepts', async () => {
    const bytes = await serializeToDOCX(
      doc(
        heading(1, 'Title'),
        p([text('bold', mark('bold')), text(' plain')]),
        orderedList(1, listItem(p('one')), listItem(p('two'))),
        table(undefined, row(cell('a', { header: true }), cell('b'))),
        p('x'.repeat(70_000)),
        p(''),
      ),
    )
    const dir = mkdtempSync(join(tmpdir(), 'trevixal-docx-'))
    const file = join(dir, 'out.docx')
    writeFileSync(file, bytes)
    const output = execFileSync('unzip', ['-t', file], { encoding: 'utf8' })
    expect(output).toContain('No errors detected')
  })
})
