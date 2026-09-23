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
import { cellSideHidden, showCellBorder } from '../src/draw-table'
import { tableNodes } from '../src/schema'
import {
  TABLE_STYLE_GALLERY,
  setTableBorderStyle,
  setTableBorderWidth,
  setTableStyle,
  tableDesignAt,
  toggleTableStyleOption,
} from '../src/table-design'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function cell(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node(
    'tableCell',
    { header: false, colspan: 1, align: null, ...attrs },
    Fragment.of(schema.node('paragraph', undefined, text ? [schema.text(text)] : [])),
  )
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

function docOf(attrs: Record<string, unknown>, ...rows: EditorNode[]): EditorNode {
  return schema.node(
    'doc',
    undefined,
    Fragment.of(schema.node('table', attrs, Fragment.from(rows))),
  )
}

function caret(doc: EditorNode, path: Path = [0, 0, 0, 0], offset = 0): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, offset)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

const table = (state: EditorState): EditorNode => state.doc.child(0)
const plain = () => docOf({}, row(cell('a'), cell('b')), row(cell('c'), cell('d')))

describe('table design attributes in HTML', () => {
  it('travel as data attributes, and the accent as a custom property too', () => {
    const doc = docOf(
      {
        tableStyle: 'header',
        accentColor: '#156082',
        firstColumn: true,
        bandedRows: true,
        borderStyle: 'dashed',
        borderWidth: '1.5pt',
      },
      row(cell('a')),
    )
    const html = serializeToHTML(doc)
    for (const expected of [
      'data-table-style="header"',
      'data-accent-color="#156082"',
      '--tvx-table-accent: #156082',
      'data-first-column=""',
      'data-banded-rows=""',
      'data-border-style="dashed"',
      'data-border-width="1.5pt"',
    ]) {
      expect(html).toContain(expected)
    }
    expect(html).not.toContain('data-last-column')
    const back = parseHTML(schema, html, document).child(0).attrs
    expect(back).toMatchObject({
      tableStyle: 'header',
      accentColor: '#156082',
      firstColumn: true,
      lastColumn: false,
      totalRow: false,
      bandedRows: true,
      bandedColumns: false,
      borderStyle: 'dashed',
      borderWidth: '1.5pt',
    })
  })

  it('writes nothing for the defaults, and drops what it does not know', () => {
    expect(serializeToHTML(plain())).toContain('<table><tr>')
    const back = parseHTML(
      schema,
      '<table data-table-style="fancy" data-accent-color="#156082" data-border-style="wavy" data-border-width="9pt"><tr><td></td></tr></table>',
      document,
    ).child(0).attrs
    expect(back).toMatchObject({
      tableStyle: null,
      accentColor: null,
      borderStyle: null,
      borderWidth: null,
    })
  })
})

describe('setTableStyle', () => {
  it('draws the table in a style and an accent, keeping the selection', () => {
    const before = caret(plain(), [0, 1, 1, 0])
    const state = run(before, setTableStyle('header', '#E97132'))
    expect(table(state).attrs).toMatchObject({ tableStyle: 'header', accentColor: '#E97132' })
    expect(state.selection.from).toEqual(pos([0, 1, 1, 0], 0))
  })

  it('draws it in the text colour without an accent, and returns to the grid for null', () => {
    let state = run(caret(plain()), setTableStyle('grid'))
    expect(table(state).attrs).toMatchObject({ tableStyle: 'grid', accentColor: null })
    state = run(state, setTableStyle(null, '#156082'))
    // No style, no accent: a colour only means something to a style.
    expect(table(state).attrs).toMatchObject({ tableStyle: null, accentColor: null })
  })

  it('declines a style or colour it does not know, and a look the table already has', () => {
    const state = caret(plain())
    expect(setTableStyle('fancy' as never)(state)).toBeNull()
    expect(setTableStyle('grid', 'not a colour')(state)).toBeNull()
    expect(setTableStyle(null)(state)).toBeNull()
  })
})

describe('toggleTableStyleOption', () => {
  it('turns each of the five switches on and off', () => {
    for (const option of [
      'firstColumn',
      'lastColumn',
      'totalRow',
      'bandedRows',
      'bandedColumns',
    ] as const) {
      const on = run(caret(plain()), toggleTableStyleOption(option))
      expect(table(on).attrs[option], option).toBe(true)
      const off = run(on, toggleTableStyleOption(option))
      expect(table(off).attrs[option], option).toBe(false)
    }
  })

  it('makes the first row header cells for the header row', () => {
    const state = run(caret(plain()), toggleTableStyleOption('headerRow'))
    expect(
      table(state)
        .child(0)
        .content.children.map((c) => c.attrs.header),
    ).toEqual([true, true])
    expect(tableDesignAt(state)?.options.headerRow).toBe(true)
  })

  it('declines outside a table', () => {
    const prose = EditorState.create({ schema })
    expect(toggleTableStyleOption('bandedRows')(prose)).toBeNull()
  })
})

describe('the pen', () => {
  it('sets the line style and weight, storing the defaults as nothing', () => {
    let state = run(caret(plain()), setTableBorderStyle('double'))
    state = run(state, setTableBorderWidth('3pt'))
    expect(table(state).attrs).toMatchObject({ borderStyle: 'double', borderWidth: '3pt' })
    state = run(state, setTableBorderStyle('solid'))
    state = run(state, setTableBorderWidth('0.5pt'))
    expect(table(state).attrs).toMatchObject({ borderStyle: null, borderWidth: null })
  })

  it('declines a style or weight it does not know', () => {
    expect(setTableBorderStyle('wavy' as never)(caret(plain()))).toBeNull()
    expect(setTableBorderWidth('9pt' as never)(caret(plain()))).toBeNull()
  })
})

describe('tableDesignAt', () => {
  it('reads the look of the table holding the selection', () => {
    const doc = docOf(
      {
        tableStyle: 'grid',
        accentColor: '#0f9ed5',
        totalRow: true,
        borders: 'outer',
        borderColor: '#333333',
      },
      row(cell('a', { header: true }), cell('b', { header: true })),
      row(cell('c'), cell('d')),
    )
    expect(tableDesignAt(caret(doc, [0, 1, 0, 0]))).toEqual({
      style: 'grid',
      accentColor: '#0f9ed5',
      options: {
        headerRow: true,
        firstColumn: false,
        lastColumn: false,
        totalRow: true,
        bandedRows: false,
        bandedColumns: false,
      },
      borders: 'outer',
      borderStyle: 'solid',
      borderWidth: '0.5pt',
      borderColor: '#333333',
    })
  })

  it('is null outside every table', () => {
    expect(tableDesignAt(EditorState.create({ schema }))).toBeNull()
  })
})

describe('TABLE_STYLE_GALLERY', () => {
  it('starts with the plain grid, then each look in the text colour and six accents', () => {
    expect(TABLE_STYLE_GALLERY).toHaveLength(15)
    expect(TABLE_STYLE_GALLERY[0]).toEqual({ label: 'Table grid', style: null, accentColor: null })
    expect(new Set(TABLE_STYLE_GALLERY.map((choice) => choice.label)).size).toBe(15)
    expect(TABLE_STYLE_GALLERY.filter((choice) => choice.style === 'header')).toHaveLength(7)
  })
})

describe('showCellBorder, the Border Painter', () => {
  it('draws a line again on both cells that share it', () => {
    const doc = docOf(
      {},
      row(cell('a', { hiddenBorders: 'right' }), cell('b', { hiddenBorders: 'left top' })),
    )
    const state = run(caret(doc), showCellBorder([0, 0, 1], 'left'))
    expect(
      table(state)
        .child(0)
        .content.children.map((c) => c.attrs.hiddenBorders),
    ).toEqual([null, 'top'])
  })

  it('draws a row line again under a merged cell, on every cell across it', () => {
    const doc = docOf(
      {},
      row(cell('wide', { colspan: 2 }), cell('c')),
      row(
        cell('d', { hiddenBorders: 'top' }),
        cell('e', { hiddenBorders: 'top' }),
        cell('f', { hiddenBorders: 'top' }),
      ),
    )
    expect(cellSideHidden(doc, [0, 0, 0], 'bottom')).toBe(true)
    const state = run(caret(doc), showCellBorder([0, 0, 0], 'bottom'))
    // The two cells under the merged one; the third was under another cell.
    expect(
      table(state)
        .child(1)
        .content.children.map((c) => c.attrs.hiddenBorders),
    ).toEqual([null, null, 'top'])
  })

  it('declines a line nothing hides', () => {
    expect(cellSideHidden(plain(), [0, 0, 0], 'right')).toBe(false)
    expect(showCellBorder([0, 0, 0], 'right')(caret(plain()))).toBeNull()
  })
})
