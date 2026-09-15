import { describe, expect, it } from 'vitest'
import {
  attrNumber,
  attrString,
  base64Decode,
  base64Encode,
  blockLayout,
  cellSpan,
  decodeDataURL,
  extensionForMime,
  hasMark,
  headingLevel,
  imageDimensions,
  listKind,
  listStart,
  markNamed,
  mimeForExtension,
  primaryFont,
  rowSpan,
  tableColumns,
  taskGlyph,
} from '../src/shared'
import {
  bulletList,
  cell,
  heading,
  listItem,
  mark,
  orderedList,
  p,
  pngBytes,
  row,
  table,
  taskItem,
  taskList,
  text,
} from './helpers'

describe('attribute readers', () => {
  const node = p('x', { align: 'center', indent: 2 })

  it('attrString returns non-empty strings only', () => {
    expect(attrString(node.attrs, 'align')).toBe('center')
    expect(attrString(node.attrs, 'lineHeight')).toBeNull()
    expect(attrString(node.attrs, 'indent')).toBeNull()
    expect(attrString({ a: '' }, 'a')).toBeNull()
  })

  it('attrNumber returns finite numbers only', () => {
    expect(attrNumber(node.attrs, 'indent')).toBe(2)
    expect(attrNumber(node.attrs, 'align')).toBeNull()
    expect(attrNumber({ a: Number.NaN }, 'a')).toBeNull()
    expect(attrNumber({ a: Number.POSITIVE_INFINITY }, 'a')).toBeNull()
  })
})

describe('mark helpers', () => {
  const marks = [mark('bold'), mark('link', { href: 'https://example.com/' })]

  it('markNamed finds a mark by type name', () => {
    expect(markNamed(marks, 'link')?.attrs.href).toBe('https://example.com/')
    expect(markNamed(marks, 'italic')).toBeUndefined()
  })

  it('hasMark reports presence', () => {
    expect(hasMark(marks, 'bold')).toBe(true)
    expect(hasMark(marks, 'italic')).toBe(false)
    expect(hasMark([], 'bold')).toBe(false)
  })
})

describe('block helpers', () => {
  it('headingLevel clamps to 1-6', () => {
    expect(headingLevel(heading(1, 'a'))).toBe(1)
    expect(headingLevel(heading(6, 'a'))).toBe(6)
    expect(headingLevel(heading(9, 'a'))).toBe(6)
    expect(headingLevel(heading(0, 'a'))).toBe(1)
    expect(headingLevel(p('a'))).toBe(1)
  })

  it('listStart defaults to 1', () => {
    expect(listStart(orderedList(7, listItem(p('a'))))).toBe(7)
    expect(listStart(bulletList(listItem(p('a'))))).toBe(1)
  })

  it('listKind names the three list containers', () => {
    expect(listKind(bulletList(listItem(p('a'))))).toBe('bullet')
    expect(listKind(orderedList(1, listItem(p('a'))))).toBe('ordered')
    expect(listKind(taskList(taskItem(false, p('a'))))).toBe('task')
    expect(listKind(p('a'))).toBeNull()
  })

  it('taskGlyph reflects the checked attr', () => {
    expect(taskGlyph(taskItem(true, p('a')))).toBe('☑')
    expect(taskGlyph(taskItem(false, p('a')))).toBe('☐')
  })

  it('primaryFont takes the first family and unquotes it', () => {
    expect(primaryFont('"Fira Sans", Helvetica, sans-serif')).toBe('Fira Sans')
    expect(primaryFont("'Courier New', monospace")).toBe('Courier New')
    expect(primaryFont('Georgia')).toBe('Georgia')
  })

  it('blockLayout converts the schema attrs into print units', () => {
    const layout = blockLayout(
      p('x', {
        align: 'justify',
        indent: 3,
        spaceBefore: '12pt',
        spaceAfter: '6pt',
        lineHeight: '1.5',
      }),
      11,
    )
    expect(layout).toEqual({
      align: 'justify',
      indent: 3,
      spaceBefore: 240,
      spaceAfter: 120,
      lineHeight: { multiplier: 1.5 },
    })
  })

  it('blockLayout drops an unknown alignment and clamps the indent', () => {
    const layout = blockLayout(p('x', { align: 'middle', indent: 20 }), 12)
    expect(layout.align).toBeNull()
    expect(layout.indent).toBe(8)
    expect(layout.spaceBefore).toBeNull()
    expect(layout.lineHeight).toBeNull()
  })
})

describe('table geometry', () => {
  const grid = table(
    undefined,
    row(cell('a', { colspan: 2 }), cell('b')),
    row(cell('c'), cell('d'), cell('e')),
  )

  it('cellSpan reads colspan with a floor of 1', () => {
    expect(cellSpan(cell('a', { colspan: 3 }))).toBe(3)
    expect(cellSpan(cell('a'))).toBe(1)
    expect(cellSpan(cell('a', { colspan: 0 }))).toBe(1)
    expect(cellSpan(cell('a', { colspan: -2 }))).toBe(1)
  })

  it('rowSpan totals the spans of a row', () => {
    expect(rowSpan(grid.child(0))).toBe(3)
    expect(rowSpan(grid.child(1))).toBe(3)
  })

  it('tableColumns takes the widest row', () => {
    expect(tableColumns(grid)).toBe(3)
    expect(tableColumns(table(undefined, row(cell('a'))))).toBe(1)
  })
})

describe('data URLs and base64', () => {
  it('decodes a base64 data URL', () => {
    const decoded = decodeDataURL('data:image/png;base64,iVBORw0=')
    expect(decoded?.mime).toBe('image/png')
    expect([...(decoded?.bytes as Uint8Array)].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('decodes a percent-encoded data URL', () => {
    const decoded = decodeDataURL('data:text/plain,hello%20world')
    expect(decoded?.mime).toBe('text/plain')
    expect(new TextDecoder().decode(decoded?.bytes as Uint8Array)).toBe('hello world')
  })

  it('lowercases the mime and defaults it when absent', () => {
    expect(decodeDataURL('data:IMAGE/PNG;base64,AAAA')?.mime).toBe('image/png')
    expect(decodeDataURL('data:,x')?.mime).toBe('application/octet-stream')
  })

  it('returns null for anything that is not a data URL', () => {
    expect(decodeDataURL('https://example.com/a.png')).toBeNull()
    expect(decodeDataURL('data:image/png;base64')).toBeNull()
    expect(decodeDataURL('')).toBeNull()
  })

  it('round-trips arbitrary bytes through base64', () => {
    for (let length = 0; length < 8; length++) {
      const source = new Uint8Array(length)
      for (let index = 0; index < length; index++) source[index] = (index * 37 + 11) & 0xff
      expect([...base64Decode(base64Encode(source))]).toEqual([...source])
    }
  })

  it('pads base64 output to a multiple of four', () => {
    expect(base64Encode(new Uint8Array([0x4d]))).toBe('TQ==')
    expect(base64Encode(new Uint8Array([0x4d, 0x61]))).toBe('TWE=')
    expect(base64Encode(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe('TWFu')
    expect(base64Encode(new Uint8Array(0))).toBe('')
  })

  it('decodes base64 that carries whitespace and padding', () => {
    expect(new TextDecoder().decode(base64Decode('TWFu\n TQ= ='))).toBe('ManM')
  })
})

describe('mime types', () => {
  it('maps mime types to extensions', () => {
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('IMAGE/JPEG')).toBe('jpeg')
    expect(extensionForMime('image/jpg')).toBe('jpeg')
    expect(extensionForMime('image/svg+xml')).toBe('svg')
    expect(extensionForMime('application/pdf')).toBe('bin')
  })

  it('maps extensions back to mime types', () => {
    expect(mimeForExtension('png')).toBe('image/png')
    expect(mimeForExtension('.JPG')).toBe('image/jpeg')
    expect(mimeForExtension('emf')).toBe('image/x-emf')
    expect(mimeForExtension('wmf')).toBe('image/x-wmf')
    expect(mimeForExtension('exe')).toBe('application/octet-stream')
  })
})

describe('imageDimensions', () => {
  it('reads a PNG header', () => {
    expect(imageDimensions(pngBytes(640, 480))).toEqual({ width: 640, height: 480 })
  })

  it('reads a GIF header', () => {
    const gif = new Uint8Array(10)
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0)
    new DataView(gif.buffer).setUint16(6, 300, true)
    new DataView(gif.buffer).setUint16(8, 200, true)
    expect(imageDimensions(gif)).toEqual({ width: 300, height: 200 })
  })

  it('reads a JPEG SOF0 frame header', () => {
    const jpeg = new Uint8Array(15)
    jpeg.set([0xff, 0xd8, 0xff, 0xc0], 0)
    const view = new DataView(jpeg.buffer)
    view.setUint16(4, 11)
    jpeg[6] = 8
    view.setUint16(7, 120)
    view.setUint16(9, 160)
    expect(imageDimensions(jpeg)).toEqual({ width: 160, height: 120 })
  })

  it('returns null for bytes it cannot sniff', () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    expect(imageDimensions(new TextEncoder().encode('<svg/>'))).toBeNull()
    expect(imageDimensions(new Uint8Array(0))).toBeNull()
  })
})

describe('text nodes carry their marks', () => {
  it('markNamed reads a mark off a text node', () => {
    const node = text('linked', mark('link', { href: 'https://example.com/' }))
    expect(markNamed(node.marks, 'link')?.attrs.href).toBe('https://example.com/')
  })
})
