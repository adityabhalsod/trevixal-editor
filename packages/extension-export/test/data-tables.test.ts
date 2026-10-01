import { Fragment, Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { readZip } from '../src/zip'
import { extraNodes, partText } from './helpers'

const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    ...extraNodes(),
    tableFormula: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { expression: { default: '' }, format: { default: null }, result: { default: '' } },
    },
  },
  marks: defaultMarks(),
})

function doc() {
  const paragraph = (...content: ReturnType<typeof schema.text>[]) =>
    schema.node('paragraph', undefined, content)
  const cell = (attrs: Record<string, unknown>, ...content: ReturnType<typeof schema.text>[]) =>
    schema.node('tableCell', attrs, Fragment.of(paragraph(...content)))
  const formula = schema.node('tableFormula', {
    expression: 'SUM(ABOVE)',
    format: '#,##0.00',
    result: '1,980.00',
  })
  return schema.node(
    'doc',
    undefined,
    Fragment.of(
      schema.node(
        'table',
        undefined,
        Fragment.from([
          schema.node(
            'tableRow',
            undefined,
            Fragment.from([
              cell({ valueType: 'checkbox', checked: true }, schema.text('Paid')),
              cell({}, schema.text('1,200.00')),
            ]),
          ),
          schema.node(
            'tableRow',
            undefined,
            Fragment.from([
              cell({ valueType: 'checkbox', checked: false }),
              cell({}, formula as never),
            ]),
          ),
        ]),
      ),
    ),
  )
}

describe('a table as data in Word and RTF', () => {
  it('writes a formula as Word’s = field, with its result and picture', async () => {
    const body = partText(await readZip(await serializeToDOCX(doc())), 'word/document.xml')
    expect(body).toContain('w:instr=" = SUM(ABOVE) \\# &quot;#,##0.00&quot; "')
    expect(body).toContain('1,980.00')
  })

  it('shows a checkbox cell’s box as a character', async () => {
    const body = partText(await readZip(await serializeToDOCX(doc())), 'word/document.xml')
    expect(body).toContain('☑ ')
    expect(body).toContain('☐ ')
    const rtf = serializeToRTF(doc())
    expect(rtf).toContain('\\fldinst = SUM(ABOVE) \\\\# "#,##0.00"')
    expect(rtf).toMatch(/\\u9745\?|☑/)
  })
})
