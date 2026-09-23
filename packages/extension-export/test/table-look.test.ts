import { describe, expect, it } from 'vitest'
import { mix, tableLook } from '../src/table-look'
import { cell, row, table } from './helpers'

const colors = { page: { r: 255, g: 255, b: 255 }, ink: { r: 0, g: 0, b: 0 } }
const BLUE = { r: 0x15, g: 0x60, b: 0x82 }

/** Header, three body rows and a total, three columns across. */
function figures(attrs: Record<string, unknown>) {
  return table(
    attrs,
    row(
      cell('Region', { header: true }),
      cell('Q1', { header: true }),
      cell('Q2', { header: true }),
    ),
    row(cell('North'), cell('1'), cell('2')),
    row(cell('South'), cell('3'), cell('4')),
    row(cell('East'), cell('5'), cell('6')),
    row(cell('Total'), cell('9'), cell('12')),
  )
}

describe('tableLook', () => {
  it('leaves a plain table plain, for the document style to draw', () => {
    const look = tableLook(figures({}), colors)
    expect(look.styled).toBe(false)
    expect(look.line).toEqual({ style: 'single', points: 0.5, color: null })
    expect(look.cell(0, 0)).toEqual({ fill: null, ink: null, bold: true, top: null, bottom: null })
    expect(look.cell(1, 1)).toEqual({ fill: null, ink: null, bold: false, top: null, bottom: null })
  })

  it('fills the header row of a header style with the accent, in white, and tints the lines', () => {
    const look = tableLook(figures({ tableStyle: 'header', accentColor: '#156082' }), colors)
    expect(look.styled).toBe(true)
    expect(look.cell(0, 1)).toMatchObject({ fill: BLUE, ink: colors.page, bold: true })
    expect(look.line.color).toEqual(mix(BLUE, colors.page, 0.45))
  })

  it('draws the neutral header in the ink, its words in the page colour', () => {
    const page = { r: 30, g: 30, b: 36 }
    const ink = { r: 229, g: 229, b: 229 }
    const look = tableLook(figures({ tableStyle: 'header' }), { page, ink })
    expect(look.cell(0, 0)).toMatchObject({ fill: ink, ink: page })
  })

  it('rules off the header row of a grid style rather than filling it', () => {
    const look = tableLook(figures({ tableStyle: 'grid', accentColor: '#156082' }), colors)
    expect(look.cell(0, 0)).toMatchObject({
      fill: null,
      bottom: { style: 'single', points: 1.5, color: BLUE },
    })
  })

  it('bands the body from its first row under a header, and across the columns', () => {
    const look = tableLook(
      figures({ tableStyle: 'header', accentColor: '#156082', bandedRows: true }),
      colors,
    )
    const band = mix(BLUE, colors.page, 0.16)
    expect([1, 2, 3, 4].map((index) => look.cell(index, 1).fill)).toEqual([band, null, band, null])
    const columns = tableLook(figures({ bandedColumns: true }), colors)
    expect([0, 1, 2].map((index) => columns.cell(1, index).fill !== null)).toEqual([
      true,
      false,
      true,
    ])
    // The header row is never banded.
    expect(columns.cell(0, 0).fill).toBeNull()
  })

  it('sets the first and last columns and the total row in bold, the total under a double rule', () => {
    const look = tableLook(figures({ firstColumn: true, lastColumn: true, totalRow: true }), colors)
    expect([0, 1, 2].map((index) => look.cell(2, index).bold)).toEqual([true, false, true])
    expect(look.cell(4, 1)).toMatchObject({ bold: true, top: { style: 'double', points: 0.5 } })
  })

  it('draws every line with the pen, its colour first', () => {
    const look = tableLook(
      figures({
        borderStyle: 'dashed',
        borderWidth: '2.25pt',
        borderColor: '#ff0000',
        tableStyle: 'grid',
      }),
      colors,
    )
    expect(look.line).toEqual({ style: 'dashed', points: 2.25, color: { r: 255, g: 0, b: 0 } })
  })

  it('draws only the lines a border style keeps, and the rules of a style only with the inside ones', () => {
    const outer = tableLook(figures({ borders: 'outer', totalRow: true }), colors)
    expect(outer.edges).toMatchObject({ top: true, left: true, insideH: false, insideV: false })
    expect(outer.cell(4, 0).top).toBeNull()
    const rows = tableLook(figures({ borders: 'horizontal' }), colors)
    expect(rows.edges).toMatchObject({
      top: true,
      left: false,
      right: false,
      insideH: true,
      insideV: false,
    })
  })
})
