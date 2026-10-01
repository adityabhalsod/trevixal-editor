// @vitest-environment happy-dom
import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  Schema,
  TableMap,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  FORMULA_ERROR,
  FORMULA_ZERO_DIVIDE,
  evaluateFormula,
  filterRows,
  formatFormulaResult,
  formulaSteps,
  hideColumn,
  insertFormula,
  insertTableChart,
  installFormulaUpdater,
  parseCellNumber,
  setColumnType,
  showAllColumns,
  showAllRows,
  tableChartSource,
  tableColumnLabels,
  toggleCellChecked,
} from '../src'
import { cellShownText, formulaNodes } from '../src/formula'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes(), ...formulaNodes() },
  marks: defaultMarks(),
})

function p(...content: (string | EditorNode)[]): EditorNode {
  return schema.node(
    'paragraph',
    undefined,
    content.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  )
}

function formula(expression: string, format: string | null = null): EditorNode {
  return schema.node('tableFormula', { expression, format, result: '' })
}

function cell(content: string | EditorNode, attrs: Record<string, unknown> = {}): EditorNode {
  const paragraph = typeof content === 'string' ? (content ? p(content) : p()) : p(content)
  return schema.node('tableCell', attrs, Fragment.of(paragraph))
}

const head = (text: string) => cell(text, { header: true })

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function docOf(...rows: EditorNode[]): EditorNode {
  return schema.node(
    'doc',
    undefined,
    Fragment.from([schema.node('table', undefined, Fragment.from(rows)), p('after')]),
  )
}

/**
 * | Item     | Cost     |
 * | Hall     | 1,200.00 |
 * | Catering | 2,640.00 |
 * | Lights   | 780      |
 */
const budget = (...extra: EditorNode[]) =>
  docOf(
    row(head('Item'), head('Cost')),
    row(cell('Hall'), cell('1,200.00')),
    row(cell('Catering'), cell('2,640.00')),
    row(cell('Lights'), cell('780')),
    ...extra,
  )

function at(doc: EditorNode, rowIndex: number, cellIndex: number, offset = 0): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos([0, rowIndex, cellIndex, 0], offset)),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** Every formula step applied: the results as the updater would leave them. */
function settled(doc: EditorNode): EditorNode {
  const state = EditorState.create({ schema, doc })
  const tr = state.tr
  for (const step of formulaSteps(doc)) tr.step(step)
  return state.apply(tr).doc
}

const texts = (doc: EditorNode): string[][] =>
  doc
    .child(0)
    .content.children.map((line) => line.content.children.map((node) => cellShownText(node)))

describe('reading a cell as a number', () => {
  it('reads what a spreadsheet would', () => {
    expect(parseCellNumber('1,200.50')).toBe(1200.5)
    expect(parseCellNumber('£1,200')).toBe(1200)
    expect(parseCellNumber('25%')).toBe(0.25)
    expect(parseCellNumber('(40)')).toBe(-40)
    expect(parseCellNumber('-3.5')).toBe(-3.5)
    expect(parseCellNumber('Total')).toBeNull()
    expect(parseCellNumber('')).toBeNull()
  })
})

describe('formulas', () => {
  const scopeOf = (doc: EditorNode, row: number, column: number) => {
    const map = TableMap.of(doc.child(0))
    return {
      map,
      cell: map.at(row, column) as NonNullable<ReturnType<TableMap['at']>>,
      valueOf: (found: NonNullable<ReturnType<TableMap['at']>>) =>
        parseCellNumber(cellShownText(found.node)),
    }
  }

  it('adds up the numbers above, stopping at the header', () => {
    const doc = budget(row(cell('Total'), cell('')))
    expect(evaluateFormula('=SUM(ABOVE)', scopeOf(doc, 4, 1))).toBe(4620)
  })

  it('works out Word’s other functions and directions', () => {
    const doc = docOf(row(cell('2'), cell('4'), cell('9'), cell('')))
    const scope = scopeOf(doc, 0, 3)
    expect(evaluateFormula('AVERAGE(LEFT)', scope)).toBe(5)
    expect(evaluateFormula('COUNT(LEFT)', scope)).toBe(3)
    expect(evaluateFormula('MIN(LEFT)', scope)).toBe(2)
    expect(evaluateFormula('MAX(LEFT)', scope)).toBe(9)
    expect(evaluateFormula('PRODUCT(LEFT)', scope)).toBe(72)
  })

  it('reads cell references, ranges and arithmetic', () => {
    const doc = docOf(row(cell('2'), cell('4')), row(cell('10'), cell('')))
    const scope = scopeOf(doc, 1, 1)
    expect(evaluateFormula('A1*B1+A2', scope)).toBe(18)
    expect(evaluateFormula('SUM(A1:B1)', scope)).toBe(6)
    expect(evaluateFormula('(A1+B1)/2', scope)).toBe(3)
    expect(evaluateFormula('MAX(A1, A2, 7)', scope)).toBe(10)
  })

  it('says what Word says when it cannot', () => {
    const doc = docOf(row(cell('2'), cell('')))
    const scope = scopeOf(doc, 0, 1)
    expect(() => evaluateFormula('TOTAL(LEFT)', scope)).toThrow(FORMULA_ERROR)
    expect(() => evaluateFormula('A1/0', scope)).toThrow(FORMULA_ZERO_DIVIDE)
    expect(() => evaluateFormula('SUM(LEFT', scope)).toThrow(FORMULA_ERROR)
  })

  it('writes a result in a number format', () => {
    expect(formatFormulaResult(4620, '#,##0.00')).toBe('4,620.00')
    expect(formatFormulaResult(0.256, '0.0%')).toBe('25.6%')
    expect(formatFormulaResult(1234.5, '£#,##0')).toBe('£1,235')
    expect(formatFormulaResult(-12, '0.00')).toBe('-12.00')
    expect(formatFormulaResult(10 / 3, null)).toBe('3.33')
    expect(formatFormulaResult(7, null)).toBe('7')
  })

  it('fills in and keeps the result current as the table changes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const doc = budget(row(cell('Total'), cell(formula('SUM(ABOVE)', '#,##0.00'))))
    const editor = createEditor({ schema, doc, element: host })
    installFormulaUpdater(editor)
    expect(texts(editor.state.doc)[4]).toEqual(['Total', '4,620.00'])
    // Type a digit into the lights' cost: 780 becomes 7800.
    editor.exec((state) => state.tr.setSelection(new TextSelection(pos([0, 3, 1, 0], 3))))
    editor.commands.insertText('0')
    expect(texts(editor.state.doc)[4]).toEqual(['Total', '11,640.00'])
    editor.destroy()
  })

  it('lets one formula use another’s result', () => {
    const doc = settled(
      docOf(
        row(cell('2'), cell('3'), cell(formula('SUM(LEFT)'))),
        row(cell(''), cell(''), cell(formula('C1*10'))),
      ),
    )
    expect(texts(doc)).toEqual([
      ['2', '3', '5'],
      ['', '', '50'],
    ])
  })

  it('goes in at the caret in a cell, and changes the one beside the caret', () => {
    const state = at(budget(row(cell('Total'), cell(''))), 4, 1)
    const inserted = run(state, insertFormula('=SUM(ABOVE)'))
    const node = inserted.doc.child(0).child(4).child(1).child(0).child(0)
    expect(node.attrs).toMatchObject({ expression: 'SUM(ABOVE)', format: null })
    const changed = run(inserted, insertFormula('MAX(ABOVE)', '0'))
    expect(changed.doc.child(0).child(4).child(1).child(0).child(0).attrs).toMatchObject({
      expression: 'MAX(ABOVE)',
      format: '0',
    })
  })

  it('declines outside a table', () => {
    const state = EditorState.create({
      schema,
      doc: schema.node('doc', undefined, Fragment.of(p('x'))),
      selection: new TextSelection(pos([0], 0)),
    })
    expect(insertFormula('SUM(ABOVE)')(state)).toBeNull()
  })

  it('travels through HTML with its expression, format and result', () => {
    const doc = settled(budget(row(cell('Total'), cell(formula('SUM(ABOVE)', '0.00')))))
    const html = serializeToHTML(doc)
    expect(html).toContain('data-formula="SUM(ABOVE)"')
    expect(html).toContain('>4620.00</span>')
    const back = parseHTML(schema, html)
    expect(back.child(0).child(4).child(1).child(0).child(0).attrs).toMatchObject({
      expression: 'SUM(ABOVE)',
      format: '0.00',
      result: '4620.00',
    })
  })
})

describe('column types', () => {
  it('formats a column of numbers, leaving the header alone', () => {
    const next = run(at(budget(), 1, 1), setColumnType('currency'))
    expect(texts(next.doc).map((line) => line[1])).toEqual([
      'Cost',
      '$1,200.00',
      '$2,640.00',
      '$780.00',
    ])
    expect(next.doc.child(0).child(1).child(1).attrs.valueType).toBe('currency')
    expect(serializeToHTML(next.doc)).toContain('data-value-type="currency"')
  })

  it('keeps the currency sign the column already uses', () => {
    const doc = docOf(row(cell('£5')), row(cell('12')))
    const next = run(at(doc, 0, 0), setColumnType('currency'))
    expect(texts(next.doc)).toEqual([['£5.00'], ['£12.00']])
  })

  it('writes percentages and dates as they should read', () => {
    const doc = docOf(
      row(cell('0.25'), cell('2026-10-1')),
      row(cell('40'), cell('October 3, 2026')),
    )
    const percent = run(at(doc, 0, 0), setColumnType('percentage'))
    expect(texts(percent.doc).map((line) => line[0])).toEqual(['25%', '40%'])
    const dates = run(at(doc, 0, 1), setColumnType('date'))
    expect(texts(dates.doc).map((line) => line[1])).toEqual(['2026-10-01', '2026-10-03'])
  })

  it('turns a column into checkboxes, ticked where the text said so', () => {
    const doc = docOf(row(cell('yes')), row(cell('no')), row(cell('Keep this')))
    const next = run(at(doc, 0, 0), setColumnType('checkbox'))
    const cells = next.doc.child(0).content.children.map((line) => line.child(0))
    expect(cells.map((node) => node.attrs.checked)).toEqual([true, false, false])
    expect(cells.map((node) => node.textContent)).toEqual(['', '', 'Keep this'])
    const toggled = run(next, toggleCellChecked([0, 1, 0]))
    expect(toggled.doc.child(0).child(1).child(0).attrs.checked).toBe(true)
    expect(serializeToHTML(toggled.doc)).toContain('data-checked')
  })

  it('takes a type off again with text', () => {
    const typed = run(at(budget(), 1, 1), setColumnType('number'))
    const plain = run(typed, setColumnType('text'))
    expect(plain.doc.child(0).child(1).child(1).attrs.valueType).toBeNull()
  })
})

describe('filters and hidden columns', () => {
  it('hides the body rows that do not pass, and shows them all again', () => {
    const labels = tableColumnLabels(at(budget(), 1, 0))
    expect(labels).toEqual(['A: Item', 'B: Cost'])
    const filtered = run(
      at(budget(), 1, 0),
      filterRows({ column: 1, condition: 'greater', value: '1000' }),
    )
    const hidden = filtered.doc.child(0).content.children.map((line) => line.attrs.hidden)
    expect(hidden).toEqual([false, false, false, true])
    expect(serializeToHTML(filtered.doc)).toContain('<tr data-hidden="">')
    const shown = run(filtered, showAllRows)
    expect(shown.doc.child(0).content.children.every((line) => line.attrs.hidden !== true)).toBe(
      true,
    )
  })

  it('moves the caret out of a row it hides', () => {
    const next = run(
      at(budget(), 3, 0),
      filterRows({ column: 0, condition: 'contains', value: 'a' }),
    )
    // Lights has no "a"; the caret goes up to the first row still showing.
    expect(next.selection.from.path.slice(0, 2)).toEqual([0, 0])
  })

  it('hides a column and brings it back', () => {
    const hidden = run(at(budget(), 1, 1), hideColumn)
    const cells = hidden.doc.child(0).content.children.map((line) => line.child(1).attrs.hidden)
    expect(cells).toEqual([true, true, true, true])
    // The caret went to the column still showing.
    expect(hidden.selection.from.path.slice(0, 3)).toEqual([0, 1, 0])
    // Hiding the last column showing would leave nothing to see.
    expect(hideColumn(hidden)).toBeNull()
    const back = run(hidden, showAllColumns)
    expect(back.doc.child(0).child(1).child(1).attrs.hidden).toBe(false)
  })
})

describe('charts from a table', () => {
  it('draws a pie of the first column of numbers', () => {
    expect(tableChartSource(budget().child(0), 'pie')).toBe(
      'pie title Cost\n    "Hall" : 1200\n    "Catering" : 2640\n    "Lights" : 780',
    )
  })

  it('draws bars and lines with the labels along the bottom', () => {
    expect(tableChartSource(budget().child(0), 'bar')).toBe(
      'xychart-beta\n    x-axis ["Hall", "Catering", "Lights"]\n    y-axis "Cost"\n    bar [1200, 2640, 780]',
    )
  })

  it('draws a second series as a line, since Mermaid would lay its bars over the first', () => {
    const halves = docOf(
      row(head('Region'), head('Q1'), head('Q2')),
      row(cell('North'), cell('1200'), cell('1480')),
      row(cell('South'), cell('980'), cell('1120')),
    )
    expect(tableChartSource(halves.child(0), 'bar')).toBe(
      'xychart-beta\n    x-axis ["North", "South"]\n    bar [1200, 980]\n    line [1480, 1120]',
    )
    // A line chart draws every series as a line already.
    expect(tableChartSource(halves.child(0), 'line')).toBe(
      'xychart-beta\n    x-axis ["North", "South"]\n    line [1200, 980]\n    line [1480, 1120]',
    )
  })

  it('leaves out a total row its formulas work out, as it leaves out Word’s', () => {
    const totalled = budget(row(cell('Total'), cell(formula('SUM(ABOVE)'))))
    expect(tableChartSource(settled(totalled).child(0), 'bar')).toBe(
      'xychart-beta\n    x-axis ["Hall", "Catering", "Lights"]\n    y-axis "Cost"\n    bar [1200, 2640, 780]',
    )
  })

  it('goes in after the table as a Mermaid block', () => {
    const next = run(at(budget(), 1, 1), insertTableChart('line'))
    const block = next.doc.child(1)
    expect(block.type.name).toBe('codeBlock')
    expect(block.attrs.language).toBe('mermaid')
    expect(block.textContent).toContain('line [1200, 2640, 780]')
  })

  it('declines a table with no numbers', () => {
    const doc = docOf(row(head('A'), head('B')), row(cell('x'), cell('y')))
    expect(insertTableChart('pie')(at(doc, 1, 0))).toBeNull()
  })
})

describe('pasting from a spreadsheet', () => {
  it('reads Excel’s and Google Sheets’ numbers as typed cells', () => {
    const html =
      '<table><tr><td x:num="1234.5">1,234.50</td><td x:num="0.2">20%</td>' +
      `<td data-sheets-value='{"1":3,"3":12}'>$12.00</td><td x:bool="TRUE">TRUE</td>` +
      '<td>plain</td></tr></table>'
    const doc = parseHTML(schema, html)
    const types = doc
      .child(0)
      .child(0)
      .content.children.map((node) => node.attrs.valueType)
    expect(types).toEqual(['number', 'percentage', 'currency', 'checkbox', null])
    expect(doc.child(0).child(0).child(3).attrs.checked).toBe(true)
  })
})
