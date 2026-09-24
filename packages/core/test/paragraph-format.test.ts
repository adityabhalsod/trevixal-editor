// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { splitBlock } from '../src/commands/commands'
import { setHyphenation, setWidowControl } from '../src/commands/document'
import {
  insertTabAtStop,
  setDropCap,
  setParagraphBorder,
  setParagraphShading,
} from '../src/commands/paragraph-format'
import { createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import {
  dropCapOf,
  formatTabStops,
  paragraphBorderOf,
  paragraphShadingOf,
  parseTabStops,
  tabStopsOf,
} from '../src/schema/paragraph-format'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import { TextSelection } from '../src/state/selection'
import { doc, p, testSchema } from './helpers'

function editorWith(...blocks: ReturnType<typeof p>[]) {
  return createEditor({
    schema: testSchema,
    doc: doc(...blocks),
    history: { groupDelay: 0 },
  })
}

describe('paragraph borders and shading', () => {
  it('rule the selected paragraphs, and write the rule into their markup', () => {
    const editor = editorWith(p('boxed'), p('plain'))
    editor.exec(
      setParagraphBorder({ sides: ['top', 'bottom'], style: 'dashed', width: 2, color: '#336699' }),
    )
    const boxed = editor.state.doc.child(0)
    expect(paragraphBorderOf(boxed.attrs)).toEqual({
      sides: ['top', 'bottom'],
      style: 'dashed',
      width: 2,
      color: '#336699',
    })
    expect(paragraphBorderOf(editor.state.doc.child(1).attrs)).toBeNull()
    expect(serializeToHTML(editor.state.doc)).toContain(
      '<p style="border-top: 2px dashed #336699; padding-top: 0.2em; border-bottom: 2px dashed #336699; padding-bottom: 0.2em">boxed</p>',
    )
    editor.exec(setParagraphBorder(null))
    expect(serializeToHTML(editor.state.doc)).toBe('<p>boxed</p><p>plain</p>')
    editor.destroy()
  })

  it('fill a paragraph, and refuse a colour that is not one', () => {
    const editor = editorWith(p('filled'))
    expect(editor.exec(setParagraphShading('#fff3c4'))).toBe(true)
    expect(serializeToHTML(editor.state.doc)).toBe(
      '<p style="background-color: #fff3c4">filled</p>',
    )
    expect(editor.exec(setParagraphShading('red; background: url(x)'))).toBe(false)
    // A colour that shows nothing is no fill, whether set or pasted: a browser
    // writes one on a block it copies, and Word would take it as black.
    expect(editor.exec(setParagraphShading('rgba(0, 0, 0, 0)'))).toBe(true)
    expect(serializeToHTML(editor.state.doc)).toBe('<p>filled</p>')
    const pasted = parseHTML(
      testSchema,
      '<p style="background-color: rgba(0, 0, 0, 0)">a</p><p style="background-color: transparent">b</p><p style="background-color: rgb(0, 0, 0)">c</p>',
    )
    expect([0, 1, 2].map((index) => pasted.child(index).attrs.shading)).toEqual([
      null,
      null,
      'rgb(0, 0, 0)',
    ])
    expect(paragraphShadingOf({ shading: '#ffffff00' })).toBeNull()
    expect(paragraphShadingOf({ shading: 'hsl(0 0% 0% / 0%)' })).toBeNull()
    expect(paragraphShadingOf({ shading: 'rgba(255, 0, 0, 0.5)' })).toBe('rgba(255, 0, 0, 0.5)')
    editor.destroy()
  })

  it('come back from their own markup, and from another editor’s', () => {
    const own = serializeToHTML(
      doc(
        testSchema.node(
          'paragraph',
          {
            borderSides: 'top right bottom left',
            borderStyle: 'double',
            borderWidth: 3,
            borderColor: null,
            shading: '#eeeeee',
          },
          Fragment.of(testSchema.text('box')),
        ),
      ),
    )
    const back = parseHTML(testSchema, own).child(0).attrs
    expect(paragraphBorderOf(back)).toEqual({
      sides: ['top', 'right', 'bottom', 'left'],
      style: 'double',
      width: 3,
      color: null,
    })
    expect(back.shading).toBe('#eeeeee')
    const foreign = parseHTML(
      testSchema,
      '<p style="border-left: 4px solid rgb(200, 0, 0); background-color: rgb(255, 240, 200)">x</p>',
    ).child(0).attrs
    expect(paragraphBorderOf(foreign)).toEqual({
      sides: ['left'],
      style: 'solid',
      width: 4,
      color: 'rgb(200, 0, 0)',
    })
    expect(foreign.shading).toBe('rgb(255, 240, 200)')
  })

  it('skip a code block, which has no borders of its own', () => {
    const code = testSchema.node('codeBlock', undefined, Fragment.of(testSchema.text('b')))
    const editor = createEditor({ schema: testSchema, doc: doc(p('a'), code) })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0), pos([1], 1))))
    editor.exec(setParagraphShading('#eee'))
    expect(editor.state.doc.child(0).attrs.shading).toBe('#eee')
    expect('shading' in editor.state.doc.child(1).attrs).toBe(false)
    editor.destroy()
  })
})

describe('drop caps', () => {
  it('drop the first letter over three lines by default, or hang it in the margin', () => {
    const editor = editorWith(p('Once upon a time'))
    editor.exec(setDropCap('drop'))
    expect(dropCapOf(editor.state.doc.child(0).attrs)).toEqual({ kind: 'drop', lines: 3 })
    expect(serializeToHTML(editor.state.doc)).toBe(
      '<p data-drop-cap="drop" data-drop-cap-lines="3">Once upon a time</p>',
    )
    editor.exec(setDropCap('margin', 9))
    expect(dropCapOf(editor.state.doc.child(0).attrs)).toEqual({ kind: 'margin', lines: 5 })
    const back = parseHTML(testSchema, serializeToHTML(editor.state.doc))
    expect(dropCapOf(back.child(0).attrs)).toEqual({ kind: 'margin', lines: 5 })
    editor.exec(setDropCap(null))
    expect(serializeToHTML(editor.state.doc)).toBe('<p>Once upon a time</p>')
    editor.destroy()
  })

  it('stay with the paragraph they open when Enter starts another, which keeps the rest of its format', () => {
    const editor = editorWith(p('Once upon a time'))
    editor.exec(setDropCap('drop'))
    editor.exec(setParagraphBorder({ sides: ['left'], style: 'solid', width: 2, color: null }))
    // At the end, in the middle and at the start: never a second drop cap.
    for (const offset of [16, 5, 0]) {
      editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], offset))))
      editor.exec(splitBlock)
    }
    const blocks = editor.state.doc.content.children
    expect(
      blocks.map((block) => [block.textContent, dropCapOf(block.attrs)?.kind ?? null]),
    ).toEqual([
      ['', null],
      ['Once ', 'drop'],
      ['upon a time', null],
      ['', null],
    ])
    expect(blocks.every((block) => paragraphBorderOf(block.attrs)?.sides.join() === 'left')).toBe(
      true,
    )
    editor.destroy()
  })
})

describe('hyphenation and widow control', () => {
  it('are document settings: hyphenation off and widow control on until changed', () => {
    const editor = editorWith(p('text'))
    expect(editor.state.doc.attrs).toMatchObject({ hyphenation: false, widowControl: true })
    expect(serializeToHTML(editor.state.doc)).toBe('<p>text</p>')
    editor.exec(setHyphenation(true))
    editor.exec(setWidowControl(false))
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain('data-hyphenation=""')
    expect(html).toContain('data-widow-control="off"')
    expect(parseHTML(testSchema, html).attrs).toMatchObject({
      hyphenation: true,
      widowControl: false,
    })
    editor.undo()
    expect(editor.state.doc.attrs.widowControl).toBe(true)
    editor.destroy()
  })
})

describe('text columns', () => {
  it('are a document setting, from one to three, with a line between when asked', () => {
    const editor = editorWith(p('flows'))
    expect(editor.state.doc.attrs).toMatchObject({ columns: 1, columnRule: false })
    expect(editor.commands.setColumns(2)).toBe(true)
    expect(editor.commands.setColumnRule(true)).toBe(true)
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain('data-columns="2"')
    expect(html).toContain('data-column-rule=""')
    expect(parseHTML(testSchema, html).attrs).toMatchObject({ columns: 2, columnRule: true })
    editor.commands.setColumns(9)
    expect(editor.state.doc.attrs.columns).toBe(3)
    // One column is the ordinary page: nothing is written, the rule included.
    editor.commands.setColumns(1)
    expect(serializeToHTML(editor.state.doc)).toBe('<p>flows</p>')
    editor.destroy()
  })
})

describe('tab stops', () => {
  it('read and write as positions in points, alignments and leaders, in order', () => {
    expect(parseTabStops('216 right dot, 72, nonsense, 0 left, 144 decimal hyphen')).toEqual([
      { position: 72, align: 'left', leader: 'none' },
      { position: 144, align: 'decimal', leader: 'hyphen' },
      { position: 216, align: 'right', leader: 'dot' },
    ])
    expect(
      formatTabStops([
        { position: 72, align: 'left', leader: 'none' },
        { position: 216, align: 'right', leader: 'dot' },
      ]),
    ).toBe('72 left, 216 right dot')
  })

  it('are set on the selected paragraphs, and come back from their markup', () => {
    const editor = editorWith(p('Results'))
    editor.commands.setTabStops([{ position: 432, align: 'right', leader: 'dot' }])
    expect(tabStopsOf(editor.state.doc.child(0).attrs)).toEqual([
      { position: 432, align: 'right', leader: 'dot' },
    ])
    const html = serializeToHTML(editor.state.doc)
    expect(html).toBe('<p data-tab-stops="432 right dot">Results</p>')
    expect(tabStopsOf(parseHTML(testSchema, html).child(0).attrs)).toHaveLength(1)
    editor.commands.setTabStops(null)
    expect(serializeToHTML(editor.state.doc)).toBe('<p>Results</p>')
    editor.destroy()
  })

  it('make Tab type a tab in their paragraph, and nowhere else', () => {
    const stopped = testSchema.node(
      'paragraph',
      { tabStops: '432 right dot' },
      Fragment.of(testSchema.text('Results')),
    )
    const editor = createEditor({ schema: testSchema, doc: doc(stopped, p('plain')) })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 7))))
    expect(editor.exec(insertTabAtStop)).toBe(true)
    expect(editor.state.doc.child(0).textContent).toBe('Results\t')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 5))))
    expect(editor.exec(insertTabAtStop)).toBe(false)
    editor.destroy()
  })
})
