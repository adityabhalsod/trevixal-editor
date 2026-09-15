import type { EditorNode } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { escapeRTF, serializeToRTF } from '../src/rtf'
import {
  blockquote,
  bulletList,
  cell,
  codeBlock,
  doc,
  hardBreak,
  heading,
  horizontalRule,
  image,
  listItem,
  mark,
  orderedList,
  p,
  row,
  table,
  taskItem,
  taskList,
  text,
} from './helpers'

const rich = doc(
  heading(1, 'Report'),
  heading(2, 'Summary'),
  p([
    text('plain '),
    text('bold', mark('bold')),
    text(' '),
    text('italic', mark('italic')),
    text(' '),
    text('under', mark('underline')),
    text(' '),
    text('struck', mark('strikethrough')),
    text(' '),
    text('up', mark('superscript')),
    text(' '),
    text('down', mark('subscript')),
  ]),
  p([text('see '), text('site', mark('link', { href: 'https://example.com/' })), text(' now')]),
  codeBlock('const x = 1;\nreturn x;'),
  bulletList(listItem(p('First')), listItem(p('Second'))),
  orderedList(3, listItem(p('Alpha')), listItem(p('Beta'))),
  table(
    undefined,
    row(cell('Name', { header: true }), cell('Price', { header: true })),
    row(cell('pear'), cell('12')),
  ),
)

const output = serializeToRTF(rich)

describe('serializeToRTF document shell', () => {
  it('opens with an RTF 1 header and closes the group', () => {
    expect(output.startsWith('{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033')).toBe(true)
    expect(output.endsWith('}')).toBe(true)
  })

  it('writes a font table holding the body and code fonts', () => {
    expect(output).toContain(
      '{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Courier New;}}',
    )
  })

  it('writes an empty colour table when nothing needs a colour', () => {
    expect(serializeToRTF(doc(p('plain')))).toContain('{\\colortbl;}')
  })

  it('honours the font and size options', () => {
    const custom = serializeToRTF(doc(p('x')), { fontFamily: '"Georgia", serif', fontSize: 12 })
    expect(custom).toContain('{\\f0\\fnil\\fcharset0 Georgia;}')
    expect(custom).toContain('\\f0\\fs24 x\\par')
  })
})

describe('serializeToRTF blocks', () => {
  it('sizes headings and marks them bold and keep-with-next', () => {
    expect(output).toContain('\\sb240\\sa120\\keepn\\b\\f0\\fs48 Report\\par')
    expect(output).toContain('\\sb240\\sa120\\keepn\\b\\f0\\fs40 Summary\\par')
  })

  it('ends every paragraph with \\par', () => {
    expect(output).toContain('\\par')
    expect(output.split('\\par').length).toBeGreaterThan(5)
  })

  it('writes a code block in the monospace font a step smaller', () => {
    expect(output).toContain('\\f1\\fs20 const x = 1;\\line return x;\\par')
  })

  it('indents and italicises a blockquote', () => {
    const quoted = serializeToRTF(doc(blockquote(p('Quoted'))))
    expect(quoted).toContain('\\pard\\plain\\li720\\i\\f0\\fs22 Quoted\\par')
  })

  it('draws a horizontal rule as a bottom border', () => {
    expect(serializeToRTF(doc(horizontalRule()))).toContain('\\brdrb\\brdrs\\brdrw10\\brsp20\\fs6')
  })

  it('applies paragraph alignment and indent steps', () => {
    const laid = serializeToRTF(doc(p('mid', { align: 'center' }), p('in', { indent: 2 })))
    expect(laid).toContain('\\pard\\plain\\qc')
    expect(laid).toContain('\\pard\\plain\\li1440')
  })

  it('applies spacing and line-height attrs', () => {
    const spaced = serializeToRTF(
      doc(p('x', { spaceBefore: '12pt', spaceAfter: '6pt', lineHeight: '1.5' })),
    )
    expect(spaced).toContain('\\sb240\\sa120\\sl360\\slmult1')
  })

  it('renders a hard break as \\line', () => {
    expect(serializeToRTF(doc(p([text('a'), hardBreak(), text('b')])))).toContain('a\\line b')
  })

  it('renders an image as its alt text', () => {
    const withImage = serializeToRTF(doc(image({ src: 'https://x/y.png', alt: 'A chart' })))
    expect(withImage).toContain('[A chart]\\par')
  })
})

describe('serializeToRTF inline marks', () => {
  it('emits a control word per character mark', () => {
    expect(output).toContain('{\\b bold}')
    expect(output).toContain('{\\i italic}')
    expect(output).toContain('{\\ul under}')
    expect(output).toContain('{\\strike struck}')
    expect(output).toContain('{\\super up}')
    expect(output).toContain('{\\sub down}')
  })

  it('combines stacked marks into one group', () => {
    const both = serializeToRTF(doc(p([text('x', mark('bold'), mark('italic'))])))
    expect(both).toContain('{\\b\\i x}')
  })

  it('writes a link as a HYPERLINK field', () => {
    expect(output).toContain('{\\field{\\*\\fldinst{HYPERLINK "https://example.com/"}}')
    expect(output).toContain('site}}}')
  })

  it('merges adjacent runs that share a href into one field', () => {
    const link = mark('link', { href: 'https://example.com/' })
    const merged = serializeToRTF(
      doc(p([text('one ', link), text('two', link, mark('bold')), text(' after')])),
    )
    expect(merged.match(/HYPERLINK/g)).toHaveLength(1)
    expect(merged).toContain('{\\b two}')
    expect(merged).toContain(' after')
  })

  it('registers highlight and text colours in the colour table', () => {
    const coloured = serializeToRTF(
      doc(
        p([text('hot', mark('highlight')), text('blue', mark('textColor', { color: '#0000ff' }))]),
      ),
    )
    expect(coloured).toContain('{\\colortbl;\\red255\\green255\\blue0;\\red0\\green0\\blue255;}')
    expect(coloured).toContain('{\\highlight1 hot}')
    expect(coloured).toContain('{\\cf2 blue}')
  })

  it('reuses a colour table slot for a repeated colour', () => {
    const twice = serializeToRTF(
      doc(
        p([text('a', mark('textColor', { color: 'red' }))]),
        p([text('b', mark('textColor', { color: '#ff0000' }))]),
      ),
    )
    expect(twice).toContain('{\\colortbl;\\red255\\green0\\blue0;}')
    expect(twice).toContain('{\\cf1 a}')
    expect(twice).toContain('{\\cf1 b}')
  })

  it('adds a font-family mark to the font table', () => {
    const fonted = serializeToRTF(
      doc(p([text('x', mark('fontFamily', { family: '"Fira Sans", sans-serif' }))])),
    )
    expect(fonted).toContain('{\\f2\\fnil\\fcharset0 Fira Sans;}')
    expect(fonted).toContain('{\\f2 x}')
  })

  it('converts a font-size mark to half-points', () => {
    expect(serializeToRTF(doc(p([text('x', mark('fontSize', { size: '18pt' }))])))).toContain(
      '{\\fs36 x}',
    )
  })

  it('switches a code mark to the monospace font', () => {
    expect(serializeToRTF(doc(p([text('x', mark('code'))])))).toContain('{\\f1 x}')
  })
})

describe('serializeToRTF lists', () => {
  it('writes bullets with a hanging indent', () => {
    expect(output).toContain('\\li720\\fi-360\\f0\\fs22 \\bullet\\tab First')
    expect(output).toContain('\\bullet\\tab Second')
  })

  it('numbers an ordered list from its start attr', () => {
    expect(output).toContain('3.\\tab Alpha')
    expect(output).toContain('4.\\tab Beta')
  })

  it('nests a sublist one indent stop deeper', () => {
    const nested = serializeToRTF(
      doc(bulletList(listItem(p('Outer'), bulletList(listItem(p('Inner')))))),
    )
    expect(nested).toContain('\\li720\\fi-360\\f0\\fs22 \\bullet\\tab Outer')
    expect(nested).toContain('\\li1440\\fi-360\\f0\\fs22 \\bullet\\tab Inner')
  })

  it('marks task items with a ballot glyph', () => {
    const tasks = serializeToRTF(
      doc(taskList(taskItem(true, p('done')), taskItem(false, p('todo')))),
    )
    expect(tasks).toContain('\\u9745?\\tab done')
    expect(tasks).toContain('\\u9744?\\tab todo')
  })
})

describe('serializeToRTF tables', () => {
  it('opens a row definition and closes with \\row', () => {
    expect(output).toContain('\\trowd\\trgaph108\\trleft-108')
    expect(output).toContain('\\row')
  })

  it('places a cell boundary at each column edge', () => {
    expect(output).toContain('\\cellx4680')
    expect(output).toContain('\\cellx9360')
  })

  it('ends each cell with \\cell instead of \\par', () => {
    expect(output).toContain('\\intbl\\b\\f0\\fs22 Name\\cell')
    expect(output).toContain('\\intbl\\f0\\fs22 pear\\cell')
  })

  it('draws cell borders unless the table asks for none', () => {
    expect(output).toContain('\\clbrdrt\\brdrs\\brdrw10')
    const bare = serializeToRTF(doc(table({ borders: 'none' }, row(cell('x')))))
    expect(bare).not.toContain('\\clbrdrt')
    expect(bare).toContain('\\cellx9360')
  })

  it('shades a cell background from the colour table', () => {
    const shaded = serializeToRTF(doc(table(undefined, row(cell('x', { background: '#ffee00' })))))
    expect(shaded).toContain('{\\colortbl;\\red255\\green238\\blue0;}')
    expect(shaded).toContain('\\clcbpat1')
  })

  it('widens a spanning cell by its colspan', () => {
    const spanned = serializeToRTF(
      doc(table(undefined, row(cell('wide', { colspan: 2 })), row(cell('a'), cell('b')))),
    )
    expect(spanned).toContain('\\cellx9360')
    expect(spanned).toContain('\\cellx4680')
  })
})

describe('escapeRTF', () => {
  it('escapes the three RTF syntax characters', () => {
    expect(escapeRTF('a{b}c\\d')).toBe('a\\{b\\}c\\\\d')
  })

  it('escapes them inside a serialized document too', () => {
    expect(serializeToRTF(doc(p('a{b}c\\d')))).toContain('a\\{b\\}c\\\\d')
  })

  it('turns newlines and tabs into control words', () => {
    expect(escapeRTF('a\nb\tc')).toBe('a\\line b\\tab c')
  })

  it('drops carriage returns and other control characters', () => {
    expect(escapeRTF('a\r\nbc')).toBe('a\\line bc')
  })

  it('writes a non-ASCII character as a signed \\uN? escape', () => {
    expect(escapeRTF('café')).toBe('caf\\u233?')
    expect(escapeRTF('☃')).toBe('\\u9731?')
  })

  it('writes an astral character as its two surrogate escapes', () => {
    expect(escapeRTF('😀')).toBe('\\u-10179?\\u-8704?')
  })

  it('leaves plain ASCII untouched', () => {
    expect(escapeRTF('The quick brown fox: 0-9 !@#$%^&*()_+=\'"')).toBe(
      'The quick brown fox: 0-9 !@#$%^&*()_+=\'"',
    )
  })

  it('escapes non-ASCII text through the serializer', () => {
    expect(serializeToRTF(doc(p('café ☃')))).toContain('caf\\u233? \\u9731?')
  })
})

describe('what the editor drew', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const source = doc(codeBlock('const x = 1'))
  const block = source.content.children[0] as EditorNode

  it('colours a code block with the runs the editor drew', () => {
    const rtf = serializeToRTF(source, {
      rendered: new Map([
        [block, { runs: [{ text: 'const', color: '#a626a4', bold: true }, { text: ' x = 1' }] }],
      ]),
    })
    expect(rtf).toContain('\\red166\\green38\\blue164;')
    // Each run is its own group, so the colour it sets does not leak past it.
    expect(rtf).toMatch(/\{\\cf1\\b const\} x = 1/)
  })

  it('embeds the picture a diagram block was previewing', () => {
    const rtf = serializeToRTF(source, {
      rendered: new Map([[block, { image: { src: PNG, width: 400, height: 200, alt: 'Flow' } }]]),
    })
    // Hexadecimal bytes in a `\pict` destination is how RTF spells a bitmap.
    expect(rtf).toContain('{\\pict\\pngblip')
    expect(rtf).toContain('\\picwgoal6000')
    expect(rtf).toContain('89504e47')
    // The drawing replaces the source it was drawn from.
    expect(rtf).not.toContain('const x = 1')
    expect(rtf).toContain('\\qc')
  })

  it('keeps the source when there is no bitmap it can embed', () => {
    // An SVG has no `\*blip` any reader decodes, so writing its bytes would
    // leave a block of hexadecimal nobody can render, and dropping the block
    // for it would lose the only readable thing it held.
    const rtf = serializeToRTF(source, {
      rendered: new Map([
        [
          block,
          {
            image: {
              src: 'data:image/svg+xml;base64,PHN2Zy8+',
              width: 400,
              height: 200,
              alt: 'Flow',
            },
          },
        ],
      ]),
    })
    expect(rtf).not.toContain('\\pict')
    expect(rtf).toContain('const x = 1')
  })

  it('writes the block exactly as before when nothing was captured', () => {
    const rtf = serializeToRTF(source)
    expect(rtf).not.toContain('\\pict')
    expect(rtf).toContain('const x = 1')
  })
})

describe('the theme', () => {
  const nord = {
    'color-bg': '#2e3440',
    'color-text': '#eceff4',
    'color-accent': '#88c0d0',
    'color-code-bg': '#434c5e',
  }
  const themed = (): string =>
    serializeToRTF(doc(heading(1, 'Report'), p('Body'), codeBlock('x = 1')), { theme: nord })

  it('lists the theme colours first in the colour table', () => {
    // Registered before the body is written, so their indices are known while
    // paragraphs are being written rather than only once the table is built.
    expect(themed()).toContain(
      '{\\colortbl;\\red236\\green239\\blue244;\\red46\\green52\\blue64;\\red67\\green76\\blue94;',
    )
  })

  it('restates the ink on every paragraph', () => {
    // `\plain` resets the colour to the reader's automatic one, so a theme
    // set once at the top would last exactly one paragraph.
    const rtf = themed()
    const paragraphs = rtf.split('\\pard\\plain').slice(1)
    expect(paragraphs).not.toHaveLength(0)
    for (const paragraph of paragraphs) expect(paragraph.startsWith('\\cbpat2\\cf1')).toBe(true)
  })

  it('shades each paragraph as well as the page', () => {
    // The page background is an ignorable group. The first thing a simpler
    // reader skips. Without the paragraph shading under it, such a reader
    // would render the theme's pale ink on its own white page.
    const rtf = themed()
    expect(rtf).toContain('{\\*\\background')
    expect(rtf).toContain('\\viewbksp1')
    expect(rtf).toContain('\\cbpat2')
  })

  it('packs the page colour the way a shape property wants it', () => {
    // Office shape colours are 0x00BBGGRR, not the RGB the rest of the file
    // writes: #2e3440 packs as 0x40342e, which is 4207662.
    expect(themed()).toContain('{\\sp{\\sn fillColor}{\\sv 4207662}}')
  })

  it('gives a code block its own ground', () => {
    expect(themed()).toMatch(/\\pard\\plain\\cbpat2\\cf1\\cbpat3\\f1/)
  })

  it('colours the rules a table and a horizontal rule draw', () => {
    // Left uncoloured they come out in the reader's automatic black, which on
    // a dark page is a grid nobody can see.
    const rtf = serializeToRTF(
      doc(table({ borders: 'all' }, row(cell('a'), cell('b'))), horizontalRule()),
      { theme: { ...nord, 'color-border': '#4c566a' } },
    )
    expect(rtf).toContain('\\red76\\green86\\blue106;')
    expect(rtf).toContain('\\clbrdrt\\brdrs\\brdrw10\\brdrcf4')
    expect(rtf).toContain('\\brdrb\\brdrs\\brdrw10\\brdrcf4')
  })

  it('colours links with the theme accent', () => {
    const rtf = serializeToRTF(doc(p([text('go', mark('link', { href: 'https://a.example' }))])), {
      theme: nord,
    })
    expect(rtf).toContain('\\red136\\green192\\blue208;')
    expect(rtf).not.toContain('\\red5\\green99\\blue193;')
  })

  it('leaves the default colours alone without a theme', () => {
    const rtf = serializeToRTF(doc(table({ borders: 'all' }, row(cell('a'))), p('Body')))
    expect(rtf).not.toContain('\\cbpat')
    expect(rtf).not.toContain('{\\*\\background')
    expect(rtf).not.toContain('\\brdrcf')
    expect(rtf).toContain('\\pard\\plain\\f0')
  })

  it('ignores a colour RTF cannot carry', () => {
    const rtf = serializeToRTF(doc(p('Body')), {
      theme: { 'color-bg': 'transparent', 'color-text': '#eceff4' },
    })
    expect(rtf).not.toContain('\\cbpat')
    expect(rtf).toContain('\\cf1')
  })
})
