// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { insertContent, setBlockType, splitBlock } from '../src/commands/commands'
import {
  setDocumentAttrs,
  setDocumentDirection,
  setHeadingNumbering,
  setLineNumbers,
  setTextDirection,
} from '../src/commands/document'
import { createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import { nodeFromJSON } from '../src/model/json'
import type { EditorNode } from '../src/model/node'
import { headingNumbers } from '../src/schema/heading-numbering'
import { serializeToHTML } from '../src/serialize/html'
import { serializeToHTMLDocument } from '../src/serialize/html-document'
import { parseHTML } from '../src/serialize/parse-html'
import { SplitNodeStep } from '../src/state/steps/split-join'
import { blockquote, cursor, doc, h, p, range, stateWith, testSchema } from './helpers'

function settled(attrs: Record<string, unknown>, ...children: EditorNode[]): EditorNode {
  return testSchema.node('doc', attrs, Fragment.from(children))
}

function labels(document: EditorNode): string[] {
  return headingNumbers(document).map((entry) => entry.label)
}

describe('document settings in HTML', () => {
  it('writes a document without settings exactly as before: no wrapper', () => {
    expect(serializeToHTML(doc(p('plain')))).toBe('<p>plain</p>')
  })

  it('wraps the blocks in one element carrying the settings, and reads them back', () => {
    const document = settled(
      { headingNumbering: 'outline', direction: 'rtl', lineNumbers: true },
      h(1, 'One'),
    )
    const html = serializeToHTML(document)
    expect(html).toBe(
      '<div data-heading-numbering="outline" dir="rtl" data-line-numbers="" data-trevixal-document=""><h1>One</h1></div>',
    )
    const back = parseHTML(testSchema, html)
    expect(back.attrs).toMatchObject({
      headingNumbering: 'outline',
      direction: 'rtl',
      lineNumbers: true,
    })
    expect(back.content.children.map((child) => child.type.name)).toEqual(['heading'])
  })

  it('finds the settings on a saved page, inside its body', () => {
    const document = settled({ headingNumbering: 'roman-outline' }, h(2, 'Two'))
    const back = parseHTML(testSchema, serializeToHTMLDocument(document))
    expect(back.attrs.headingNumbering).toBe('roman-outline')
  })

  it('drops values it does not know rather than carrying them', () => {
    const back = parseHTML(
      testSchema,
      '<div data-trevixal-document data-heading-numbering="symbols" dir="sideways"><p>x</p></div>',
    )
    expect(back.attrs).toMatchObject({
      headingNumbering: null,
      direction: null,
      lineNumbers: false,
    })
  })

  it('travels in JSON as the doc node’s attrs', () => {
    const document = settled({ lineNumbers: true }, p('x'))
    const json = document.toJSON()
    expect(json.attrs).toEqual({ lineNumbers: true })
    expect(nodeFromJSON(testSchema, json).attrs.lineNumbers).toBe(true)
  })
})

describe('the settings commands', () => {
  it('each set one setting, undo as one step, and decline what is already so', () => {
    // Every command its own undo step, however quickly they follow each other.
    const editor = createEditor({
      schema: testSchema,
      doc: doc(h(1, 'Title')),
      history: { groupDelay: 0 },
    })
    expect(editor.exec(setHeadingNumbering('outline'))).toBe(true)
    expect(editor.exec(setHeadingNumbering('outline'))).toBe(false)
    expect(editor.exec(setDocumentDirection('rtl'))).toBe(true)
    expect(editor.exec(setLineNumbers(true))).toBe(true)
    expect(editor.state.doc.attrs).toMatchObject({
      headingNumbering: 'outline',
      direction: 'rtl',
      lineNumbers: true,
    })
    expect(editor.getSnapshot().documentAttrs.direction).toBe('rtl')
    editor.undo()
    expect(editor.state.doc.attrs).toMatchObject({
      headingNumbering: 'outline',
      direction: 'rtl',
      lineNumbers: false,
    })
    // Left to right is the default, so it is stored as nothing.
    expect(editor.exec(setDocumentDirection('ltr'))).toBe(true)
    expect(editor.state.doc.attrs.direction).toBeNull()
    editor.undo()
    expect(editor.state.doc.attrs.direction).toBe('rtl')
    editor.destroy()
  })

  it('come with a document loaded whole, and go with one that has none', () => {
    const editor = createEditor({ schema: testSchema, doc: doc(p('x')) })
    editor.setContent(settled({ headingNumbering: 'outline', lineNumbers: true }, h(1, 'A')))
    expect(editor.state.doc.attrs).toMatchObject({ headingNumbering: 'outline', lineNumbers: true })
    editor.setContent({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(editor.state.doc.attrs).toMatchObject({ headingNumbering: null, lineNumbers: false })
    editor.destroy()
  })

  it('refuses a scheme headings cannot be numbered with, and an attr the doc does not have', () => {
    const state = stateWith(doc(h(1, 'Title')))
    expect(setHeadingNumbering('symbols')(state)).toBeNull()
    expect(setHeadingNumbering('nonsense')(state)).toBeNull()
    expect(setDocumentAttrs({ colour: 'red' })(state)).toBeNull()
  })

  it('puts the settings on the editing surface, and takes them off again', () => {
    const host = window.document.createElement('div')
    window.document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, doc: doc(h(1, 'Title')), element: host })
    const surface = editor.view?.dom as HTMLElement
    editor.exec(setHeadingNumbering('outline'))
    editor.exec(setDocumentDirection('rtl'))
    expect(surface.getAttribute('data-heading-numbering')).toBe('outline')
    expect(surface.getAttribute('dir')).toBe('rtl')
    expect(surface.hasAttribute('data-trevixal-document')).toBe(true)
    editor.exec(setHeadingNumbering(null))
    editor.exec(setDocumentDirection('ltr'))
    expect(surface.hasAttribute('data-heading-numbering')).toBe(false)
    expect(surface.hasAttribute('dir')).toBe(false)
    expect(surface.hasAttribute('data-trevixal-document')).toBe(false)
    // The surface's own attributes are none of the document's business.
    expect(surface.getAttribute('role')).toBe('textbox')
    editor.destroy()
    host.remove()
  })
})

describe('heading numbers', () => {
  it('number nothing until the document asks', () => {
    expect(headingNumbers(doc(h(1, 'A'), h(2, 'B')))).toEqual([])
  })

  it('run down the outline, each heading resetting the levels below it', () => {
    const document = settled(
      { headingNumbering: 'outline' },
      h(1, 'A'),
      h(2, 'A.1'),
      h(2, 'A.2'),
      h(3, 'A.2.1'),
      h(1, 'B'),
      h(2, 'B.1'),
    )
    expect(labels(document)).toEqual(['1.', '1.1.', '1.2.', '1.2.1.', '2.', '2.1.'])
  })

  it('count a skipped level as 0, as the counters and Word do', () => {
    expect(labels(settled({ headingNumbering: 'outline' }, h(1, 'A'), h(3, 'deep')))).toEqual([
      '1.',
      '1.0.1.',
    ])
  })

  it('take each level’s own style under a list scheme', () => {
    const headings = [h(1, 'A'), h(2, 'B'), h(3, 'C'), h(2, 'D')]
    expect(labels(settled({ headingNumbering: 'default' }, ...headings))).toEqual([
      '1.',
      'a.',
      'i.',
      'b.',
    ])
    expect(labels(settled({ headingNumbering: 'parenthesis' }, ...headings))).toEqual([
      '1)',
      'a)',
      'i)',
      'b)',
    ])
    expect(labels(settled({ headingNumbering: 'roman-outline' }, ...headings))).toEqual([
      'I.',
      'A.',
      '1.',
      'B.',
    ])
  })

  it('leave a heading inside another block alone, and report where each one is', () => {
    const document = settled(
      { headingNumbering: 'outline' },
      h(1, 'A'),
      blockquote(h(1, 'quoted')),
      p('text'),
      h(1, 'B'),
    )
    expect(headingNumbers(document).map(({ index, label }) => [index, label])).toEqual([
      [0, '1.'],
      [3, '2.'],
    ])
  })
})

describe('text direction on blocks', () => {
  it('writes dir, reads it back, and clears it', () => {
    const editor = createEditor({ schema: testSchema, doc: doc(p('one'), p('two')) })
    editor.commands.selectAll()
    expect(editor.exec(setTextDirection('rtl'))).toBe(true)
    expect(editor.getHTML()).toBe('<p dir="rtl">one</p><p dir="rtl">two</p>')
    const back = parseHTML(testSchema, editor.getHTML())
    expect(back.content.children.map((child) => child.attrs.dir)).toEqual(['rtl', 'rtl'])
    expect(editor.exec(setTextDirection(null))).toBe(true)
    expect(editor.getHTML()).toBe('<p>one</p><p>two</p>')
    editor.destroy()
  })

  it('skips a code block, which has no direction of its own', () => {
    const state = stateWith(doc(p('x')), cursor([0], 0))
    const code = setBlockType('codeBlock')(state)
    const next = state.apply(code as NonNullable<typeof code>)
    expect(setTextDirection('rtl')(next)).toBeNull()
  })

  it('indents from the start side, and reads the indents other editors write', () => {
    const editor = createEditor({ schema: testSchema, doc: doc(p('x')) })
    editor.commands.selectAll()
    editor.commands.indent()
    expect(editor.getHTML()).toBe('<p style="margin-inline-start: 2.5rem">x</p>')
    const indentOf = (html: string): unknown =>
      parseHTML(testSchema, html).content.children[0]?.attrs.indent
    expect(indentOf('<p style="margin-inline-start: 5rem">x</p>')).toBe(2)
    expect(indentOf('<p style="margin-left: 5rem">x</p>')).toBe(2)
    expect(indentOf('<p dir="rtl" style="margin-right: 5rem">x</p>')).toBe(2)
    editor.destroy()
  })
})

describe('block ids', () => {
  it('give a paragraph a link target that survives a round trip', () => {
    const document = doc(
      testSchema.node('paragraph', { id: 'intro' }, Fragment.of(testSchema.text('x'))),
    )
    expect(serializeToHTML(document)).toBe('<p id="intro">x</p>')
    expect(parseHTML(testSchema, '<p id="intro">x</p>').content.children[0]?.attrs.id).toBe('intro')
    // Ids the kit generates for its own navigation never enter a document.
    expect(parseHTML(testSchema, '<p id="tvx-3">x</p>').content.children[0]?.attrs.id).toBeNull()
  })

  const part = (): EditorNode =>
    testSchema.node('heading', { level: 2, id: 'part' }, Fragment.of(testSchema.text('Part two')))
  const blocks = (document: EditorNode): [string, unknown][] =>
    document.content.children.map((block) => [block.textContent, block.attrs.id ?? null])

  it('stay with the first half of a split, and come back whole when it is undone', () => {
    const state = stateWith(doc(part()), range([0], 4, [0], 4))
    const step = new SplitNodeStep([0], 4)
    const split = state.apply(state.tr.step(step))
    const [first, second] = split.doc.content.children
    expect(first?.attrs.id).toBe('part')
    expect(second?.attrs.id).toBeNull()
    expect(second?.attrs.level).toBe(2)
    const undone = split.apply(split.tr.step(step.invert()))
    expect(undone.doc.eq(state.doc)).toBe(true)
  })

  it('stay with the words when Enter or a paste lands at the very start', () => {
    const state = stateWith(doc(part()), cursor([0], 0))
    const entered = splitBlock(state)
    if (!entered) throw new Error('Enter did nothing')
    expect(blocks(state.apply(entered).doc)).toEqual([
      ['', null],
      ['Part two', 'part'],
    ])
    const pasted = insertContent([p('one'), p('two')])(state)
    if (!pasted) throw new Error('the paste did nothing')
    expect(blocks(state.apply(pasted).doc)).toEqual([
      ['one', null],
      ['two', null],
      ['Part two', 'part'],
    ])
  })
})
