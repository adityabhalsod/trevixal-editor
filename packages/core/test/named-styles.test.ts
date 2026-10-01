// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { splitBlock } from '../src/commands/commands'
import {
  characterStyleAt,
  deleteStyle,
  newStyleId,
  paragraphStyleOf,
  setParagraphStyle,
  setStyle,
  toggleCharacterStyle,
} from '../src/commands/named-styles'
import { createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import {
  type NamedStyle,
  documentStyles,
  namedStylesCSS,
  parseStoredStyles,
  storedStylesAttr,
} from '../src/schema/named-styles'
import { serializeToHTML } from '../src/serialize/html'
import { serializeToHTMLDocument } from '../src/serialize/html-document'
import { parseHTML } from '../src/serialize/parse-html'
import { TextSelection } from '../src/state/selection'
import { doc, h, p, testSchema } from './helpers'

function editorWith(...blocks: ReturnType<typeof p>[]) {
  return createEditor({ schema: testSchema, doc: doc(...blocks), history: { groupDelay: 0 } })
}

function select(editor: ReturnType<typeof editorWith>, from: [number[], number], to = from): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos(...from), pos(...to))))
}

describe('the styles a document has', () => {
  it('are the built-in ones as they ship, until the document changes one or adds its own', () => {
    const editor = editorWith(p('Body'))
    const names = documentStyles(editor.state.doc).map((style) => style.name)
    expect(names.slice(0, 4)).toEqual(['Normal', 'Title', 'Subtitle', 'Heading 1'])
    expect(names).toContain('Emphasis')
    expect(editor.state.doc.attrs.styles).toBeNull()
    expect(serializeToHTML(editor.state.doc)).toBe('<p>Body</p>')
    editor.destroy()
  })

  it('keep only what differs, and drop what does not read', () => {
    const stored = parseStoredStyles(
      JSON.stringify([
        { id: 'normal', props: { fontSize: 12, color: 'red; x: url(evil)', bold: 'yes' } },
        { id: 'memo', name: 'Memo', kind: 'paragraph', props: { italic: true, align: 'center' } },
        { id: '1bad', name: 'Bad', props: {} },
        { id: 'callout', kind: 'character', props: { align: 'center', color: '#c00' } },
      ]),
    )
    expect(stored.map((style) => [style.id, style.props])).toEqual([
      ['normal', { fontSize: 12 }],
      ['memo', { italic: true, align: 'center' }],
    ])
    const normal = stored[0] as NamedStyle
    expect(storedStylesAttr([{ ...normal, props: {} }])).toBeNull()
  })
})

describe('paragraph styles', () => {
  it('turn a paragraph into a heading and back, keeping its layout', () => {
    const aligned = testSchema.node(
      'paragraph',
      { align: 'center' },
      Fragment.of(testSchema.text('Plan')),
    )
    const editor = editorWith(aligned)
    select(editor, [[0], 1])
    expect(editor.exec(setParagraphStyle('heading2'))).toBe(true)
    const heading = editor.state.doc.child(0)
    expect([heading.type.name, heading.attrs.level, heading.attrs.align]).toEqual([
      'heading',
      2,
      'center',
    ])
    expect(paragraphStyleOf(heading)).toBe('heading2')
    editor.exec(setParagraphStyle('title'))
    const title = editor.state.doc.child(0)
    expect([title.type.name, title.attrs.paragraphStyle, title.attrs.align]).toEqual([
      'paragraph',
      'title',
      'center',
    ])
    expect(serializeToHTML(editor.state.doc)).toBe(
      '<p style="text-align: center" data-paragraph-style="title">Plan</p>',
    )
    editor.exec(setParagraphStyle('normal'))
    expect(editor.state.doc.child(0).attrs.paragraphStyle).toBeNull()
    editor.destroy()
  })

  it('go on in Normal after a Title or Subtitle, as Word’s own do, and in the same style after any other', () => {
    const styled = (paragraphStyle: string, text: string) =>
      testSchema.node('paragraph', { paragraphStyle }, Fragment.of(testSchema.text(text)))
    const editor = editorWith(
      styled('title', 'Plan'),
      styled('subtitle', 'Draft'),
      styled('memo', 'Memo'),
    )
    const styles = () =>
      editor.state.doc.content.children.map((block) => block.attrs.paragraphStyle)
    select(editor, [[0], 4])
    editor.exec(splitBlock)
    select(editor, [[2], 5])
    editor.exec(splitBlock)
    expect(styles()).toEqual(['title', null, 'subtitle', null, 'memo'])
    // Split anywhere but the end, a Title is two Titles, as in Word.
    select(editor, [[0], 2])
    editor.exec(splitBlock)
    select(editor, [[5], 4])
    editor.exec(splitBlock)
    expect(styles()).toEqual(['title', 'title', null, 'subtitle', null, 'memo', 'memo'])
    editor.destroy()
  })

  it('refuse a style the document does not have, or a character one', () => {
    const editor = editorWith(p('x'))
    select(editor, [[0], 0])
    expect(editor.exec(setParagraphStyle('nothing'))).toBe(false)
    expect(editor.exec(setParagraphStyle('emphasis'))).toBe(false)
    editor.destroy()
  })

  it('leave a paragraph where a heading cannot stand as it is', () => {
    // A box that holds paragraphs only, beside a quote that holds any block.
    const schema = new Schema({
      nodes: {
        ...defaultNodes(),
        box: { content: 'paragraph+', group: 'block', toHTML: () => ({ tag: 'div' }) },
      },
      marks: defaultMarks(),
    })
    const para = (text: string) => schema.node('paragraph', undefined, [schema.text(text)])
    const editor = createEditor({
      schema,
      doc: schema.node('doc', undefined, [
        schema.node('box', undefined, [para('boxed')]),
        schema.node('blockquote', undefined, [para('quoted')]),
      ]),
    })
    select(editor as never, [[0, 0], 0], [[1, 0], 6])
    editor.exec(setParagraphStyle('heading1'))
    expect(editor.state.doc.child(0).child(0).type.name).toBe('paragraph')
    expect(editor.state.doc.child(1).child(0).type.name).toBe('heading')
    editor.destroy()
  })
})

describe('changing a style', () => {
  it('restyles everything in it at once, as one undo, and writes the look out as CSS', () => {
    const editor = editorWith(p('one'), p('two'))
    editor.exec(
      setStyle({
        id: 'normal',
        props: { fontFamily: 'Georgia', fontSize: 12, bold: false, spaceAfter: 6 },
      }),
    )
    const css = namedStylesCSS(editor.state.doc, '.scope')
    expect(css).toContain('.scope { font-family: Georgia; font-size: 12pt }')
    expect(css).toContain(
      '.scope p:not([data-paragraph-style]) { font-weight: 400; margin-bottom: 6pt }',
    )
    editor.exec(setStyle({ id: 'heading1', props: { color: '#224488' } }))
    expect(namedStylesCSS(editor.state.doc, '.scope')).toContain('.scope h1 { color: #224488 }')
    editor.undo()
    expect(namedStylesCSS(editor.state.doc, '.scope')).not.toContain('h1')
    editor.destroy()
  })

  it('adds the writer’s own styles under a fresh id, and carries them in the markup', () => {
    const editor = editorWith(p('Memo'))
    const id = newStyleId(editor.state.doc, 'Memo text')
    expect(id).toBe('memo-text')
    editor.exec(setStyle({ id, name: 'Memo text', kind: 'paragraph', props: { italic: true } }))
    expect(newStyleId(editor.state.doc, 'Memo text')).toBe('memo-text-2')
    expect(newStyleId(editor.state.doc, 'Normal')).toBe('normal-2')
    select(editor, [[0], 0])
    editor.exec(setParagraphStyle(id))
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain('data-paragraph-style="memo-text"')
    const back = parseHTML(testSchema, html)
    expect(documentStyles(back).find((style) => style.id === id)?.props).toEqual({ italic: true })
    expect(namedStylesCSS(back, '.s')).toContain(
      '.s p[data-paragraph-style="memo-text"] { font-style: italic }',
    )
    editor.destroy()
  })

  it('deletes one of the writer’s own, putting what was in it back to plain', () => {
    const editor = editorWith(p('Memo'))
    editor.exec(setStyle({ id: 'loud', name: 'Loud', kind: 'character', props: { bold: true } }))
    editor.exec(setStyle({ id: 'memo', name: 'Memo', kind: 'paragraph', props: { italic: true } }))
    select(editor, [[0], 0], [[0], 4])
    editor.exec(setParagraphStyle('memo'))
    editor.exec(toggleCharacterStyle('loud'))
    expect(characterStyleAt(editor.state)).toBe('loud')
    expect(editor.exec(deleteStyle('normal'))).toBe(false)
    editor.exec(deleteStyle('memo'))
    editor.exec(deleteStyle('loud'))
    expect(serializeToHTML(editor.state.doc)).toBe('<p>Memo</p>')
    editor.destroy()
  })
})

describe('character styles', () => {
  it('put the selected text in a style, and take it out on a second go', () => {
    const editor = editorWith(p('very important'))
    select(editor, [[0], 5], [[0], 14])
    editor.exec(toggleCharacterStyle('strong'))
    expect(serializeToHTML(editor.state.doc)).toBe(
      '<p>very <span data-char-style="strong">important</span></p>',
    )
    expect(characterStyleAt(editor.state)).toBe('strong')
    editor.exec(toggleCharacterStyle('strong'))
    expect(serializeToHTML(editor.state.doc)).toBe('<p>very important</p>')
    const heading = h(1, 'x')
    expect(paragraphStyleOf(heading)).toBe('heading1')
    editor.destroy()
  })
})

describe('named styles on a saved page', () => {
  it('come as a stylesheet of their own, scoped to the page’s content', () => {
    const editor = editorWith(p('Body'))
    editor.exec(setStyle({ id: 'normal', props: { fontSize: 12 } }))
    const page = serializeToHTMLDocument(editor.state.doc)
    expect(page).toContain('<style>\n.trevixal .trevixal-content { font-size: 12pt }\n</style>')
    expect(serializeToHTMLDocument(doc(p('plain')))).not.toContain('font-size: 12pt')
    editor.destroy()
  })
})
