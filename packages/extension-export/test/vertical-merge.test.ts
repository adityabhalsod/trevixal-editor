import { describe, expect, it } from 'vitest'
import { parseDOCX } from '../src/docx-reader'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { readZip } from '../src/zip'
import { cell, doc, partText, row, schema, table } from './helpers'

/**
 * | A | b |
 * |   | c |
 * | d | e |
 */
const merged = () =>
  doc(
    table(
      undefined,
      row(cell('A', { rowspan: 2 }), cell('b')),
      row(cell('c')),
      row(cell('d'), cell('e')),
    ),
  )

async function wordBody(): Promise<string> {
  return partText(await readZip(await serializeToDOCX(merged())), 'word/document.xml')
}

describe('a vertical merge in Word', () => {
  it('starts the merge in its first row and continues it, empty, in the next', async () => {
    const body = await wordBody()
    const rows = body.split('<w:tr>').slice(1)
    expect(rows[0]).toContain('<w:vMerge w:val="restart"/>')
    // The second row repeats the merged cell first, as a continuation.
    expect(rows[1]).toMatch(
      /^(<w:trPr>.*?<\/w:trPr>)?<w:tc><w:tcPr>[\s\S]*?<w:vMerge\/>[\s\S]*?<\/w:tcPr><w:p\/><\/w:tc>/,
    )
    expect(rows[2]).not.toContain('w:vMerge')
  })

  it('reads the merge back as a cell spanning the rows', async () => {
    const back = await parseDOCX(schema, await serializeToDOCX(merged()))
    const table = back.child(0)
    expect(table.childCount).toBe(3)
    expect(table.child(0).child(0).attrs.rowspan).toBe(2)
    expect(table.child(0).child(0).textContent).toBe('A')
    expect(table.child(1).content.children.map((node) => node.textContent)).toEqual(['c'])
    expect(table.child(2).content.children.map((node) => node.textContent)).toEqual(['d', 'e'])
  })
})

describe('a vertical merge in RTF', () => {
  it('marks the first cell and the continuation', () => {
    const rtf = serializeToRTF(merged())
    const rows = rtf.split('\\trowd').slice(1)
    expect(rows[0]).toContain('\\clvmgf')
    expect(rows[1]).toContain('\\clvmrg')
    expect(rows[2]).not.toMatch(/\\clvm/)
    // Every row still defines both columns.
    for (const line of rows) expect(line.match(/\\cellx/g)).toHaveLength(2)
  })
})
