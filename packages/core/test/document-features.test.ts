// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { clearAllFormatting, clearBlockFormatting } from '../src/commands/commands'
import { linkifyText } from '../src/commands/links'
import { continueNumberingFromPrevious } from '../src/commands/lists'
import { createEditor } from '../src/editor/editor'
import { HISTORY_LABEL } from '../src/history/history'
import { applyInputRules, defaultInputRules } from '../src/input-rules/input-rules'
import { paragraphCount, sentenceCount, wordCount } from '../src/model/counts'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes, safeElementId } from '../src/schema/basic'
import { escapeHTML, serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import { SetNodeAttrsStep } from '../src/state/steps/attrs-step'
import { bold, cursor, doc, p, range, stateWith, testSchema, text } from './helpers'

describe('document counts', () => {
  const sample = doc(p('Hello world. How are you?'), p(''), p('Third line'))

  it('counts sentences by terminal punctuation and block ends', () => {
    expect(sentenceCount(sample)).toBe(3)
  })

  it('counts only paragraphs with visible text', () => {
    expect(paragraphCount(sample)).toBe(2)
    expect(wordCount(sample)).toBe(7)
  })
})

describe('linkifyText', () => {
  it('wraps every URL in a link mark and keeps the text around it', () => {
    const nodes = linkifyText(testSchema, 'see https://a.com/x, and www.b.org.')
    expect(nodes).not.toBeNull()
    expect(nodes?.map((node) => node.textContent)).toEqual([
      'see ',
      'https://a.com/x',
      ', and ',
      'www.b.org',
      '.',
    ])
    expect(nodes?.[1]?.marks[0]?.attrs.href).toBe('https://a.com/x')
    // A scheme-less www. address gets one, or the browser treats it as relative.
    expect(nodes?.[3]?.marks[0]?.attrs.href).toBe('https://www.b.org')
    expect(nodes?.[0]?.marks).toHaveLength(0)
  })

  it('declines text without a URL', () => {
    expect(linkifyText(testSchema, 'no links here')).toBeNull()
  })
})

describe('inline code input rule', () => {
  it('turns `text` into the code mark on the closing backtick', () => {
    const state = stateWith(doc(p('use `foo')), cursor([0], 8))
    const tr = applyInputRules(state, '`', defaultInputRules())
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    const block = next.doc.child(0)
    expect(block.textContent).toBe('use foo')
    expect(block.content.children[1]?.marks.map((mark) => mark.type.name)).toEqual(['code'])
    expect(next.selection.from.offset).toBe(7)
  })

  it('leaves three backticks to the code block rule', () => {
    const state = stateWith(doc(p('``')), cursor([0], 2))
    const tr = applyInputRules(state, '`', defaultInputRules())
    expect(tr).not.toBeNull()
    expect(state.apply(tr as NonNullable<typeof tr>).doc.child(0).type.name).toBe('codeBlock')
  })
})

describe('continueNumberingFromPrevious', () => {
  const item = (label: string) => testSchema.node('listItem', undefined, Fragment.of(p(label)))
  const ordered = (start: number, ...labels: string[]) =>
    testSchema.node('orderedList', { start }, Fragment.from(labels.map(item)))

  it('numbers on from where the previous ordered list stopped', () => {
    const state = stateWith(
      doc(ordered(3, 'a', 'b'), p('between'), ordered(1, 'c')),
      cursor([2, 0, 0], 0),
    )
    const tr = continueNumberingFromPrevious(state)
    expect(tr).not.toBeNull()
    expect(state.apply(tr as NonNullable<typeof tr>).doc.child(2).attrs.start).toBe(5)
  })

  it('declines when there is no earlier ordered list', () => {
    const state = stateWith(doc(p('x'), ordered(1, 'c')), cursor([1, 0, 0], 0))
    expect(continueNumberingFromPrevious(state)).toBeNull()
  })
})

describe('clearing block formatting', () => {
  const styled = testSchema.node(
    'paragraph',
    { align: 'center', indent: 2, lineHeight: '1.8' },
    Fragment.of(bold('Loud')),
  )

  it('resets layout attributes and keeps the marks', () => {
    const state = stateWith(doc(styled), cursor([0], 1))
    const tr = clearBlockFormatting(state)
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.child(0).attrs).toMatchObject({ align: null, indent: 0, lineHeight: null })
    expect(next.doc.child(0).content.children[0]?.marks).toHaveLength(1)
  })

  it('clears marks and layout together in one transaction', () => {
    const state = stateWith(doc(styled), range([0], 0, [0], 4))
    const tr = clearAllFormatting(state)
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.child(0).content.children[0]?.marks).toHaveLength(0)
    expect(next.doc.child(0).attrs.align).toBeNull()
  })

  it('declines when nothing needs resetting', () => {
    expect(clearBlockFormatting(stateWith(doc(p('plain')), cursor([0], 0)))).toBeNull()
  })
})

describe('history entries', () => {
  it('labels undo groups by what they did', () => {
    const editor = createEditor({
      schema: testSchema,
      content: doc(p('Hi')).toJSON(),
      history: { groupDelay: 0 },
    })
    editor.commands.insertText('!')
    expect(editor.historyEntries().undo.map((entry) => entry.label)).toEqual(['Typing'])
    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    expect(editor.historyEntries().undo.at(-1)?.label).toBe('Text formatting')

    const block = editor.state.doc.child(0)
    editor.dispatch(
      editor.state.tr
        .step(new SetNodeAttrsStep([0], { ...block.attrs, align: 'center' }))
        .setMeta(HISTORY_LABEL, 'Center paragraph'),
    )
    const entries = editor.historyEntries()
    expect(entries.undo.at(-1)).toMatchObject({ label: 'Center paragraph', size: 1 })
    expect(entries.undo.at(-1)?.timestamp).toBeGreaterThan(0)

    editor.undo()
    expect(editor.historyEntries().redo.at(-1)?.label).toBe('Center paragraph')
    editor.clearHistory()
    expect(editor.historyEntries()).toEqual({ undo: [], redo: [] })
    expect(editor.canUndo).toBe(false)
  })
})

describe('setContent', () => {
  it('replaces the document outside the history by default', () => {
    const editor = createEditor({ schema: testSchema, content: doc(p('Old')).toJSON() })
    editor.commands.insertText('x')
    editor.setContent(doc(p('New')).toJSON())
    expect(editor.getText()).toBe('New')
    expect(editor.canUndo).toBe(false)
    expect(editor.state.selection.from).toEqual(pos([0], 0))
  })

  it('can record the replacement as an undoable step', () => {
    const editor = createEditor({ schema: testSchema, content: doc(p('New')).toJSON() })
    editor.setContent(doc(p('Undoable')), { addToHistory: true })
    expect(editor.canUndo).toBe(true)
    editor.undo()
    expect(editor.getText()).toBe('New')
  })
})

describe('trusted inner markup', () => {
  const widgetSchema = new Schema({
    nodes: {
      ...defaultNodes(),
      widget: {
        group: 'block',
        atom: true,
        attrs: { label: { default: 'x' } },
        toHTML: (node) => ({
          tag: 'div',
          attrs: { class: 'widget' },
          innerHTML: `<b>${escapeHTML(String(node.attrs.label))}</b>`,
        }),
      },
      chip: {
        group: 'inline',
        inline: true,
        atom: true,
        attrs: { label: { default: 'c' } },
        toHTML: (node) => ({
          tag: 'span',
          attrs: { class: 'chip' },
          innerHTML: `<i>${escapeHTML(String(node.attrs.label))}</i>`,
        }),
      },
    },
    marks: defaultMarks(),
  })
  const sample = widgetSchema.node(
    'doc',
    undefined,
    Fragment.from([
      widgetSchema.node('widget', { label: 'one' }),
      widgetSchema.node('paragraph', undefined, Fragment.of(widgetSchema.node('chip'))),
    ]),
  )

  it('serializes verbatim in place of a text label', () => {
    expect(serializeToHTML(sample)).toBe(
      '<div class="widget"><b>one</b></div><p><span class="chip"><i>c</i></span></p>',
    )
  })

  it('renders it into atoms and refreshes it when the attributes change', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema: widgetSchema, doc: sample, element: host })
    expect(host.querySelector('.widget')?.innerHTML).toBe('<b>one</b>')
    expect(host.querySelector('.chip')?.innerHTML).toBe('<i>c</i>')
    editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep([0], { label: 'two' })))
    expect(host.querySelector('.widget')?.innerHTML).toBe('<b>two</b>')
    editor.destroy()
  })
})

describe('sanitizer opt-in for schema-declared tags', () => {
  const embedSchema = new Schema({
    nodes: {
      ...defaultNodes(),
      frame: {
        group: 'block',
        atom: true,
        attrs: { src: { default: '' } },
        toHTML: (node) => ({ tag: 'iframe', attrs: { src: String(node.attrs.src) } }),
        parseHTML: [
          { tag: 'iframe', getAttrs: (element) => ({ src: element.getAttribute('src') }) },
        ],
      },
    },
    marks: defaultMarks(),
  })

  it('keeps a dangerous tag the schema has claimed', () => {
    const parsed = parseHTML(embedSchema, '<p>a</p><iframe src="https://example.com/e"></iframe>')
    expect(parsed.child(1).type.name).toBe('frame')
    expect(parsed.child(1).attrs.src).toBe('https://example.com/e')
  })

  it('still drops it for a schema that does not', () => {
    const parsed = parseHTML(
      testSchema,
      '<p>a</p><iframe src="https://example.com/e"></iframe><p>b</p>',
    )
    expect(parsed.childCount).toBe(2)
  })
})

describe('heading ids', () => {
  it('round-trips a safe id and rejects generated or malformed ones', () => {
    const heading = testSchema.node(
      'heading',
      { level: 2, id: 'intro' },
      Fragment.of(text('Intro')),
    )
    expect(serializeToHTML(heading)).toBe('<h2 id="intro">Intro</h2>')
    expect(parseHTML(testSchema, '<h2 id="intro">x</h2>').child(0).attrs.id).toBe('intro')
    expect(parseHTML(testSchema, '<h2 id="tvx-toc-1">x</h2>').child(0).attrs.id).toBeNull()
    expect(safeElementId('1abc')).toBeNull()
    expect(safeElementId('a b')).toBeNull()
    expect(safeElementId('section-2.1')).toBe('section-2.1')
  })
})

describe('spellcheck', () => {
  it('is settable at construction and at runtime', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, element: host, spellcheck: false })
    expect(editor.view?.dom.getAttribute('spellcheck')).toBe('false')
    expect(editor.view?.spellcheck).toBe(false)
    editor.setSpellcheck(true)
    expect(editor.view?.spellcheck).toBe(true)
    editor.destroy()
  })
})
