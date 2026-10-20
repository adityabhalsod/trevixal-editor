import { describe, expect, it } from 'vitest'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { Schema } from '../src/model/schema'
import { TableMap } from '../src/model/table-map'
import { serializeToMarkdown } from '../src/serialize/markdown'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    table: { content: 'tableRow+', group: 'block' },
    tableRow: { content: 'tableCell+' },
    tableCell: {
      content: 'paragraph+',
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, align: { default: null } },
    },
  },
  marks: {},
})

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  const paragraph = schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
  return schema.node('tableCell', attrs, Fragment.of(paragraph))
}

function table(...rows: EditorNode[][]): EditorNode {
  return schema.node(
    'table',
    undefined,
    Fragment.from(rows.map((cells) => schema.node('tableRow', undefined, Fragment.from(cells)))),
  )
}

const text = (map: TableMap, row: number, column: number): string | null =>
  map.at(row, column)?.node.textContent ?? null

describe('TableMap', () => {
  it('lays a row with spans out as HTML does', () => {
    const map = TableMap.of(
      table(
        [cell('A', { rowspan: 2 }), cell('B', { colspan: 2 })],
        [cell('c'), cell('d')],
        [cell('e'), cell('f'), cell('g')],
      ),
    )
    expect([map.width, map.height]).toEqual([3, 3])
    expect([0, 1, 2].map((column) => text(map, 1, column))).toEqual(['A', 'c', 'd'])
    expect(map.cellAt(1, 0)).toMatchObject({ top: 1, left: 1, width: 1, height: 1 })
    expect(map.cellAt(0, 0)).toMatchObject({ top: 0, left: 0, width: 1, height: 2 })
  })

  it('stops a span at the last row, and leaves a short row with holes', () => {
    const map = TableMap.of(table([cell('A', { rowspan: 5 }), cell('b')], [cell('c')]))
    expect(map.cellAt(0, 0)?.height).toBe(2)
    const ragged = TableMap.of(table([cell('a'), cell('b')], [cell('c')]))
    expect(ragged.at(1, 1)).toBeNull()
  })

  it('finds the cells in a rectangle once each, and grows one to whole cells', () => {
    const map = TableMap.of(
      table([cell('A', { rowspan: 2 }), cell('b')], [cell('c')], [cell('d'), cell('e')]),
    )
    const rect = { top: 1, left: 0, bottom: 2, right: 2 }
    expect(map.cellsIn(rect).map((found) => found.node.textContent)).toEqual(['A', 'c'])
    expect(map.expand(rect)).toEqual({ top: 0, left: 0, bottom: 2, right: 2 })
  })

  it('keeps one map per table node', () => {
    const node = table([cell('a')])
    expect(TableMap.of(node)).toBe(TableMap.of(node))
  })
})

describe('a merged cell in Markdown', () => {
  it('gives its text once and keeps every row its columns', () => {
    const doc = schema.node(
      'doc',
      undefined,
      Fragment.of(
        table([cell('A', { rowspan: 2 }), cell('b')], [cell('c')], [cell('Wide', { colspan: 2 })]),
      ),
    )
    expect(serializeToMarkdown(doc).trim()).toBe('| A | b |\n| --- | --- |\n|  | c |\n| Wide |  |')
  })
})
