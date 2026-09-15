// @vitest-environment happy-dom
// Converted from an exploration probe that asked whether a serialized table
// survives a parse, and what happens to the `<tbody>` nobody writes. The
// schema emits `<tr>` straight under `<table>`; every real browser inserts a
// `<tbody>` around them, and so does anything pasted from a spreadsheet or a
// word processor. No parse rule mentions one, so the rows only survive
// because the walk descends through an element it has no rule for, which is
// worth pinning, since a rule that dropped unknown elements and their
// subtrees would silently turn a pasted table into nothing.
import {
  Fragment,
  Schema,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

const p = (text = '') => schema.node('paragraph', undefined, text ? [schema.text(text)] : [])

const cell = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.node(
    'tableCell',
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.of(p(text)),
  )

const row = (...cells: ReturnType<typeof cell>[]) =>
  schema.node('tableRow', undefined, Fragment.from(cells))

describe('table HTML round trip', () => {
  it('survives the tbody a parser inserts, with every cell attribute intact', () => {
    const doc = schema.node(
      'doc',
      undefined,
      Fragment.from([
        schema.node(
          'table',
          undefined,
          Fragment.from([
            row(cell('a', { header: true }), cell('b', { header: true })),
            row(cell('c'), cell('d', { align: 'center', background: '#ff0000', width: '120px' })),
          ]),
        ),
      ]),
    )
    const html = serializeToHTML(doc)
    // No tbody is written.
    expect(html).toContain('<table><tr><th>')
    expect(html).not.toContain('<tbody>')

    // One that arrives with a tbody parses to exactly the same document, so a
    // copy out of this editor and a copy out of a spreadsheet agree.
    const wrapped = html
      .replace('<table>', '<table><tbody>')
      .replace('</table>', '</tbody></table>')
    expect(serializeToHTML(parseHTML(schema, wrapped, document))).toBe(html)

    const back = parseHTML(schema, html, document)
    expect(serializeToHTML(back)).toBe(html)
    const table = back.child(0)
    expect(table.type.name).toBe('table')
    expect(table.childCount).toBe(2)
    expect(table.child(0).child(0).attrs.header).toBe(true)
    expect(table.child(1).child(1).attrs).toMatchObject({
      align: 'center',
      background: '#ff0000',
      width: '120px',
      header: false,
    })
  })
})
