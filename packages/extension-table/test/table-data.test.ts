// @vitest-environment happy-dom
import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  type Path,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  compareCellText,
  convertTableToText,
  convertTextToTable,
  csvAtSelection,
  detectDelimiter,
  detectTextSeparator,
  insertTableFromCSV,
  parseCSV,
  rowsToCSV,
  setCellBackground,
  setTableBorderColor,
  setTableBorders,
  sortTable,
  tableToCSV,
  tableToRows,
} from '../src/features'
import { tableNodes } from '../src/schema'
import { tableUICommands } from '../src/ui'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node(
    'tableCell',
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.of(p(text)),
  )
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function table(...rows: EditorNode[]): EditorNode {
  return schema.node('table', undefined, Fragment.from(rows))
}

function docOf(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', undefined, Fragment.from(blocks))
}

function stateAt(doc: EditorNode, path: Path, offset = 0, head?: [Path, number]): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos(path, offset), head ? pos(head[0], head[1]) : undefined),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** Cell texts of the table at the top of the document, row by row. */
function grid(doc: EditorNode, index = 0): string[][] {
  return tableToRows(doc.child(index))
}

const priced = docOf(
  table(
    row(cell('Name', { header: true }), cell('Price', { header: true })),
    row(cell('pear'), cell('1,200')),
    row(cell('Apple'), cell('30')),
    row(cell('fig'), cell('')),
    row(cell('banana'), cell('30')),
  ),
)

describe('cell background', () => {
  it('paints the cell at the caret and clears it again', () => {
    const state = stateAt(priced, [0, 1, 0, 0], 0)
    const painted = run(state, setCellBackground('#ffee00'))
    expect(painted.doc.child(0).child(1).child(0).attrs.background).toBe('#ffee00')
    expect(serializeToHTML(painted.doc)).toContain('background-color: #ffee00')
    const cleared = run(painted, setCellBackground(null))
    expect(cleared.doc.child(0).child(1).child(0).attrs.background).toBeNull()
  })

  it('covers the rectangle between the selection ends', () => {
    const state = stateAt(priced, [0, 1, 0, 0], 0, [[0, 2, 1, 0], 0])
    const next = run(state, setCellBackground('rgb(200, 200, 255)'))
    const backgrounds = next.doc
      .child(0)
      .content.children.map((line) => line.content.children.map((c) => c.attrs.background))
    expect(backgrounds[1]).toEqual(['rgb(200, 200, 255)', 'rgb(200, 200, 255)'])
    expect(backgrounds[2]).toEqual(['rgb(200, 200, 255)', 'rgb(200, 200, 255)'])
    expect(backgrounds[0]).toEqual([null, null])
    expect(backgrounds[3]).toEqual([null, null])
  })

  it('declines outside a table and for a colour the sanitizer rejects', () => {
    expect(setCellBackground('#fff')(stateAt(docOf(p('x')), [0], 0))).toBeNull()
    expect(setCellBackground('url(javascript:1)')(stateAt(priced, [0, 1, 0, 0], 0))).toBeNull()
  })

  it('round-trips through HTML', () => {
    const state = run(stateAt(priced, [0, 1, 0, 0], 0), setCellBackground('#ffee00'))
    const parsed = parseHTML(schema, serializeToHTML(state.doc))
    expect(parsed.child(0).child(1).child(0).attrs.background).toBe('#ffee00')
  })
})

describe('table borders', () => {
  it('sets a border style and colour as data attributes', () => {
    const state = run(stateAt(priced, [0, 1, 0, 0], 0), setTableBorders('outer'))
    const coloured = run(state, setTableBorderColor('#123456'))
    const html = serializeToHTML(coloured.doc)
    expect(html).toContain('data-borders="outer"')
    expect(html).toContain('data-border-color="#123456"')
    expect(html).toContain('--tvx-table-border: #123456')
    const parsed = parseHTML(schema, html)
    expect(parsed.child(0).attrs.borders).toBe('outer')
    expect(parsed.child(0).attrs.borderColor).toBe('#123456')
  })

  it('declines an unknown style and a no-op', () => {
    const state = stateAt(priced, [0, 1, 0, 0], 0)
    expect(setTableBorders('dotted' as never)(state)).toBeNull()
    expect(setTableBorders(null)(state)).toBeNull()
  })
})

describe('sortTable', () => {
  it('sorts body rows by the caret column, keeping the header and blanks last', () => {
    const state = stateAt(priced, [0, 1, 0, 0], 0)
    const sorted = run(state, sortTable())
    expect(grid(sorted.doc).map((line) => line[0])).toEqual([
      'Name',
      'Apple',
      'banana',
      'fig',
      'pear',
    ])
    // The caret stays with the pear row, now at the bottom.
    expect(sorted.selection.from.path).toEqual([0, 4, 0, 0])
  })

  it('sorts numerically and stably, and reverses for desc', () => {
    const state = stateAt(priced, [0, 1, 1, 0], 0)
    const asc = grid(run(state, sortTable({ direction: 'asc' })).doc).map((line) => line[1])
    expect(asc).toEqual(['Price', '30', '30', '1,200', ''])
    const desc = grid(run(state, sortTable({ direction: 'desc' })).doc).map((line) => line[1])
    expect(desc).toEqual(['Price', '1,200', '30', '30', ''])
    // Ties keep their document order in both directions.
    const ascNames = grid(run(state, sortTable({ direction: 'asc' })).doc).map((line) => line[0])
    expect(ascNames.slice(1, 3)).toEqual(['Apple', 'banana'])
  })

  it('declines when the order would not change or the table is too small', () => {
    const state = stateAt(priced, [0, 1, 0, 0], 0)
    const sorted = run(state, sortTable())
    expect(sortTable()(sorted)).toBeNull()
    const tiny = docOf(table(row(cell('b')), row(cell('a'))))
    expect(sortTable({ header: false })(stateAt(tiny, [0, 0, 0, 0], 0))).not.toBeNull()
    expect(sortTable()(stateAt(docOf(table(row(cell('a')))), [0, 0, 0, 0], 0))).toBeNull()
  })

  it('compares like a spreadsheet', () => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    expect(compareCellText('9', '10', collator)).toBeLessThan(0)
    expect(compareCellText('1,000', '999', collator)).toBeGreaterThan(0)
    expect(compareCellText('b', 'A', collator)).toBeGreaterThan(0)
    expect(compareCellText('', 'a', collator)).toBeGreaterThan(0)
  })
})

describe('text to table', () => {
  it('detects the separator every line shares', () => {
    expect(detectTextSeparator(['a\tb', 'c\td'])).toBe('tab')
    expect(detectTextSeparator(['| a | b |', '|---|---|', '| c | d |'])).toBe('pipe')
    expect(detectTextSeparator(['a, b', 'c, d'])).toBe('comma')
    expect(detectTextSeparator(['a;b', 'c;d'])).toBe('semicolon')
    expect(detectTextSeparator(['a  b', 'c  d'])).toBe('spaces')
    expect(detectTextSeparator(['a, b', 'no comma'])).toBeNull()
  })

  it('converts a run of paragraphs into a table with a header row', () => {
    const doc = docOf(p('intro'), p('Name, Price'), p('pear, 3'), p('fig, 4, extra'), p('outro'))
    const state = stateAt(doc, [1], 0, [[3], 2])
    const next = run(state, convertTextToTable())
    expect(next.doc.childCount).toBe(3)
    const made = next.doc.child(1)
    expect(made.type.name).toBe('table')
    expect(tableToRows(made)).toEqual([
      ['Name', 'Price', ''],
      ['pear', '3', ''],
      ['fig', '4', 'extra'],
    ])
    expect(made.child(0).child(0).attrs.header).toBe(true)
    expect(next.selection.from.path).toEqual([1, 0, 0, 0])
  })

  it('reads a markdown table, dropping the rule row', () => {
    const doc = docOf(p('| a | b |'), p('|---|---|'), p('| 1 | 2 |'))
    const next = run(stateAt(doc, [0], 0, [[2], 1]), convertTextToTable({ headerRow: false }))
    expect(tableToRows(next.doc.child(0))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(next.doc.child(0).child(0).child(0).attrs.header).toBe(false)
  })

  it('declines inside a table', () => {
    expect(convertTextToTable()(stateAt(priced, [0, 1, 0, 0], 0))).toBeNull()
  })
})

describe('table to text', () => {
  it('flattens rows to tab-separated paragraphs', () => {
    const next = run(stateAt(priced, [0, 2, 0, 0], 0), convertTableToText())
    expect(next.doc.childCount).toBe(5)
    expect(next.doc.child(0).textContent).toBe('Name\tPrice')
    expect(next.doc.child(1).textContent).toBe('pear\t1,200')
    expect(next.selection.from.path).toEqual([0])
    const custom = run(stateAt(priced, [0, 2, 0, 0], 0), convertTableToText({ separator: ' | ' }))
    expect(custom.doc.child(2).textContent).toBe('Apple | 30')
  })
})

describe('CSV', () => {
  it('parses quoted fields, escaped quotes, embedded newlines and CRLF', () => {
    const text = 'a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n'
    expect(parseCSV(text, ',')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'line1\nline2'],
    ])
  })

  it('detects the delimiter from the first line', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(detectDelimiter('"a;b",c\n1,2')).toBe(',')
    expect(parseCSV('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('serializes with quoting only where needed and expands merged cells', () => {
    expect(rowsToCSV([['plain', 'has,comma', 'has "quote"', ' padded ']])).toBe(
      'plain,"has,comma","has ""quote"""," padded "',
    )
    const merged = table(
      row(cell('wide', { colspan: 2 }), cell('c')),
      row(cell('1'), cell('2'), cell('3')),
    )
    expect(tableToCSV(merged)).toBe('wide,,c\r\n1,2,3')
  })

  it('reads the table at the selection and inserts one from CSV', () => {
    expect(csvAtSelection(stateAt(priced, [0, 1, 0, 0], 0))).toBe(
      'Name,Price\r\npear,"1,200"\r\nApple,30\r\nfig,\r\nbanana,30',
    )
    expect(csvAtSelection(stateAt(docOf(p('x')), [0], 0))).toBeNull()

    const empty = stateAt(docOf(p('')), [0], 0)
    const inserted = run(empty, insertTableFromCSV('h1,h2\n1,2'))
    expect(inserted.doc.childCount).toBe(1)
    expect(tableToRows(inserted.doc.child(0))).toEqual([
      ['h1', 'h2'],
      ['1', '2'],
    ])
    expect(inserted.selection.from.path).toEqual([0, 0, 0, 0])

    const after = run(stateAt(docOf(p('text')), [0], 2), insertTableFromCSV('a;b\n1;2'))
    expect(after.doc.childCount).toBe(2)
    expect(after.doc.child(1).type.name).toBe('table')
    expect(insertTableFromCSV('\n\n')(empty)).toBeNull()
  })
})

describe('tableUICommands', () => {
  it('exposes the new data commands', () => {
    const commands = tableUICommands()
    expect(typeof commands.setCellBackground('#fff')).toBe('function')
    expect(typeof commands.setTableBorders('none')).toBe('function')
    expect(typeof commands.sortAscending).toBe('function')
    expect(typeof commands.convertTextToTable).toBe('function')
    expect(commands.csvAtSelection(stateAt(priced, [0, 1, 0, 0], 0))).toContain('Name,Price')
  })
})

describe('parsing', () => {
  it('reads a table whose rows are wrapped in thead and tbody', () => {
    // Every browser and word processor emits the section elements, which the
    // schema has no node for; the rows have to come through them regardless.
    const parsed = parseHTML(
      schema,
      '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
    )
    expect(parsed.childCount).toBe(1)
    const tableNode = parsed.child(0)
    expect(tableNode.type.name).toBe('table')
    expect(
      tableNode.content.children.map((r) => r.content.children.map((c) => c.textContent)),
    ).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
    ])
    // A th keeps its header-ness through the wrapper; a td stays a body cell.
    const [headerRow, bodyRow] = tableNode.content.children
    expect(headerRow?.content.children.map((c) => c.attrs.header)).toEqual([true, true])
    expect(bodyRow?.content.children.map((c) => c.attrs.header)).toEqual([false, false])
  })
})
