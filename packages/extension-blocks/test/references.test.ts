// @vitest-environment happy-dom
import {
  type Command,
  type Editor,
  type EditorNode,
  Fragment,
  NodeSelection,
  ReplaceInlineStep,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
  setHeadingNumbering,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { insertFootnote } from '../src/commands'
import { fieldSteps, installFieldUpdater, referenceTargets } from '../src/fields'
import {
  insertCaption,
  insertCaptionList,
  insertCrossReference,
  insertDocumentIndex,
  insertEndnote,
  markIndexEntry,
} from '../src/reference-commands'
import { MISSING_REFERENCE, referenceMarks } from '../src/references'
import { blockNodes } from '../src/schema'

// Stand-ins for the image, table and math extensions: captions find what
// they caption by node name, so these need nothing but the names.
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    ...blockNodes(),
    image: {
      group: 'block',
      atom: true,
      attrs: { src: { default: '' } },
      toHTML: () => ({ tag: 'img', isVoid: true }),
    },
    figure: { content: 'image caption?', group: 'block', toHTML: () => ({ tag: 'figure' }) },
    caption: { content: 'inline*', toHTML: () => ({ tag: 'figcaption' }) },
    table: { content: 'tableRow+', group: 'block', toHTML: () => ({ tag: 'table' }) },
    tableRow: { content: 'tableCell+', toHTML: () => ({ tag: 'tr' }) },
    tableCell: { content: 'block+', toHTML: () => ({ tag: 'td' }) },
    mathBlock: {
      group: 'block',
      atom: true,
      attrs: { latex: { default: '' } },
      toHTML: () => ({ tag: 'div' }),
    },
  },
  marks: { ...defaultMarks(), ...referenceMarks() },
})

const p = (text = ''): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
const h = (level: number, text: string): EditorNode =>
  schema.node('heading', { level }, [schema.text(text)])
const image = (): EditorNode => schema.node('image', { src: 'cat.png' })
const table = (): EditorNode =>
  schema.node('table', undefined, [
    schema.node('tableRow', undefined, [schema.node('tableCell', undefined, [p('cell')])]),
  ])

function editorWith(...blocks: EditorNode[]): Editor {
  // Every edit its own undo step, so an undo takes back exactly one command.
  const editor = createEditor({
    schema,
    doc: schema.node('doc', undefined, Fragment.from(blocks)),
    history: { groupDelay: 0 },
  })
  installFieldUpdater(editor)
  return editor
}

function select(editor: Editor, selection: TextSelection | NodeSelection): void {
  editor.dispatch(editor.state.tr.setSelection(selection))
}

function run(editor: Editor, command: Command): boolean {
  return editor.exec(command)
}

/** Every caption's drawn text, in order. */
function captions(editor: Editor): string[] {
  return referenceTargets(editor.state.doc)
    .filter((target) => target.kind !== 'heading')
    .map((target) => target.full)
}

describe('captions', () => {
  it('number each kind on its own, in document order, and renumber as they move', () => {
    const editor = editorWith(p('one'), p('two'))
    select(editor, new TextSelection(pos([0], 3)))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'A cat' }))
    select(editor, new TextSelection(pos([2], 3)))
    run(editor, insertCaption('table', { label: 'Table', text: 'Sales' }))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'A dog' }))
    expect(captions(editor)).toEqual(['Figure 1: A cat', 'Table 1: Sales', 'Figure 2: A dog'])
    // A figure inserted first pushes the others along, inside the same edit.
    select(editor, new TextSelection(pos([0], 0)))
    run(editor, insertCaption('figure', { label: 'Fig.', text: 'First' }))
    expect(captions(editor)).toEqual([
      'Fig. 1: First',
      'Figure 2: A cat',
      'Table 1: Sales',
      'Figure 3: A dog',
    ])
    // One undo takes back the caption and the renumbering together.
    editor.undo()
    expect(captions(editor)).toEqual(['Figure 1: A cat', 'Table 1: Sales', 'Figure 2: A dog'])
    editor.destroy()
  })

  it('goes above a table, and below it when asked', () => {
    const editor = editorWith(p('before'), table())
    select(editor, new TextSelection(pos([1, 0, 0, 0], 0)))
    run(editor, insertCaption('table', { label: 'Table' }))
    expect(editor.state.doc.child(1).textContent).toBe('Table ')
    expect(editor.state.doc.child(2).type.name).toBe('table')
    select(editor, new TextSelection(pos([2, 0, 0, 0], 0)))
    run(editor, insertCaption('table', { label: 'Table', position: 'below' }))
    expect(editor.state.doc.child(3).type.name).toBe('paragraph')
    editor.destroy()
  })

  it('wraps a bare image in a figure, and numbers an existing caption in place', () => {
    const editor = editorWith(image(), p())
    select(editor, new NodeSelection([0]))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'Lake' }))
    const figure = editor.state.doc.child(0)
    expect(figure.type.name).toBe('figure')
    expect(captions(editor)).toEqual(['Figure 1: Lake'])

    const captioned = schema.node('figure', undefined, [
      image(),
      schema.node('caption', undefined, [schema.text('Mountains')]),
    ])
    const second = editorWith(captioned)
    select(second, new TextSelection(pos([0, 1], 2)))
    run(second, insertCaption('figure', { label: 'Figure' }))
    expect(captions(second)).toEqual(['Figure 1: Mountains'])
    // A caption already numbered is not numbered twice.
    expect(run(second, insertCaption('figure', { label: 'Figure' }))).toBe(false)
    editor.destroy()
    second.destroy()
  })

  it('goes below an equation', () => {
    const editor = editorWith(schema.node('mathBlock', { latex: 'e=mc^2' }), p('after'))
    select(editor, new NodeSelection([0]))
    run(editor, insertCaption('equation', { label: 'Equation' }))
    expect(editor.state.doc.child(1).textContent).toBe('Equation ')
    expect(captions(editor)).toEqual(['Equation 1'])
    editor.destroy()
  })

  it('goes beside a figure, not into it, when a table is captioned from its image', () => {
    const figure = schema.node('figure', undefined, [
      image(),
      schema.node('caption', undefined, [schema.text('A table of results')]),
    ])
    const editor = editorWith(figure, p('after'))
    select(editor, new NodeSelection([0, 0]))
    run(editor, insertCaption('table', { label: 'Table' }))
    const blocks = editor.state.doc.content.children
    expect(blocks.map((block) => block.type.name)).toEqual(['paragraph', 'figure', 'paragraph'])
    const kept = editor.state.doc.child(1)
    expect(kept.type.validContent(kept.content)).toBe(true)
    editor.destroy()
  })

  it('give a pasted copy a fresh id, so no two captions answer to one name', () => {
    const editor = editorWith(p('x'))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'A' }))
    const caption = editor.state.doc.child(1)
    editor.setContent(schema.node('doc', undefined, Fragment.from([caption, caption])))
    const ids = referenceTargets(editor.state.doc).map((target) => target.id)
    expect(ids).toEqual(['fig-1', 'fig-2'])
    editor.destroy()
  })
})

describe('cross-references', () => {
  it('read their target in each format, and follow it when it renumbers', () => {
    const editor = editorWith(p('see '), p('body'))
    select(editor, new TextSelection(pos([1], 4)))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'A cat' }))
    const target = referenceTargets(editor.state.doc).find((entry) => entry.kind === 'figure')
    if (!target) throw new Error('no caption')
    select(editor, new TextSelection(pos([0], 4)))
    for (const format of ['label', 'number', 'text', 'full'] as const) {
      run(editor, insertCrossReference(target, format))
    }
    const texts = () =>
      editor.state.doc
        .child(0)
        .content.children.filter((child) => child.type.name === 'crossReference')
        .map((child) => child.attrs.text)
    expect(texts()).toEqual(['Figure 1', '1', 'A cat', 'Figure 1: A cat'])

    // Another figure ahead of it makes it Figure 2, in the same edit.
    select(editor, new TextSelection(pos([0], 0)))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'Earlier' }))
    expect(texts()).toEqual(['Figure 2', '2', 'A cat', 'Figure 2: A cat'])
    editor.destroy()
  })

  it('leave a reference inside a caption out of that caption, so nothing feeds on itself', () => {
    const editor = editorWith(p('body'))
    select(editor, new TextSelection(pos([0], 4)))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'See' }))
    const target = referenceTargets(editor.state.doc).find((entry) => entry.kind === 'figure')
    if (!target) throw new Error('no caption')
    // A reference to the caption it sits in, which once grew by a copy of
    // itself on every edit.
    run(editor, insertCrossReference(target, 'full'))
    const reference = () =>
      editor.state.doc
        .child(1)
        .content.children.find((child) => child.type.name === 'crossReference')?.attrs.text
    expect(reference()).toBe('Figure 1: See')
    select(editor, new TextSelection(pos([0], 4)))
    const type =
      (at: number): Command =>
      (state) =>
        state.tr.step(new ReplaceInlineStep([0], at, at, Fragment.of(schema.text('!'))))
    run(editor, type(4))
    run(editor, type(5))
    expect(reference()).toBe('Figure 1: See')
    expect(captions(editor)).toEqual(['Figure 1: See'])
    // Settled: nothing is left to update once an edit has been applied.
    expect(fieldSteps(editor.state.doc)).toEqual([])
    editor.destroy()
  })

  it('find the heading they name where replacing a selection has moved it', () => {
    const editor = editorWith(p('see one'), p('two three'), h(1, 'Results'), p('after'))
    const heading = referenceTargets(editor.state.doc).find((entry) => entry.kind === 'heading')
    if (!heading) throw new Error('no heading')
    // Replacing a selection across two paragraphs joins them: the heading moves up.
    select(editor, new TextSelection(pos([0], 4), pos([1], 4)))
    run(editor, insertCrossReference(heading, 'text'))
    const doc = editor.state.doc
    expect(doc.child(1).type.name).toBe('heading')
    expect(doc.child(1).attrs.id).toBe('results')
    expect(doc.child(2).attrs.id ?? null).toBeNull()
    const reference = doc
      .child(0)
      .content.children.find((child) => child.type.name === 'crossReference')
    expect(reference?.attrs.text).toBe('Results')
    editor.destroy()
  })

  it('give a heading an id the first time it is pointed at, and read its number', () => {
    const editor = editorWith(h(1, 'Intro'), h(2, 'Results so far'), p('as in '))
    run(editor, setHeadingNumbering('outline'))
    const heading = referenceTargets(editor.state.doc).find(
      (entry) => entry.text === 'Results so far',
    )
    if (!heading) throw new Error('no heading')
    expect(heading.id).toBeNull()
    select(editor, new TextSelection(pos([2], 6)))
    run(editor, insertCrossReference(heading, 'number'))
    run(editor, insertCrossReference(heading, 'full'))
    expect(editor.state.doc.child(1).attrs.id).toBe('results-so-far')
    const refs = editor.state.doc.child(2).content.children.filter((child) => child.isAtom)
    expect(refs.map((child) => child.attrs.text)).toEqual(['1.1', '1.1 Results so far'])
    editor.destroy()
  })

  it('read the number of a footnote or an endnote', () => {
    const editor = editorWith(p('claim'), p('see '))
    select(editor, new TextSelection(pos([0], 5)))
    run(editor, insertFootnote())
    run(editor, insertEndnote())
    const notes = referenceTargets(editor.state.doc).filter(
      (target) => target.kind === 'footnote' || target.kind === 'endnote',
    )
    expect(notes.map((note) => [note.kind, note.id, note.label])).toEqual([
      ['footnote', 'fn-1', '1'],
      ['endnote', 'en-1', 'i'],
    ])
    editor.destroy()
  })

  it('say so when the target is gone', () => {
    const editor = editorWith(p('x'))
    run(editor, insertCaption('figure', { label: 'Figure' }))
    const target = referenceTargets(editor.state.doc)[0]
    if (!target) throw new Error('no caption')
    select(editor, new TextSelection(pos([0], 1)))
    run(editor, insertCrossReference(target, 'label'))
    // Delete the caption paragraph.
    editor.setContent(schema.node('doc', undefined, Fragment.from([editor.state.doc.child(0)])))
    const reference = editor.state.doc.child(0).content.children.find((child) => child.isAtom)
    expect(reference?.attrs.text).toBe(MISSING_REFERENCE)
    editor.destroy()
  })
})

describe('tables of figures and the index', () => {
  it('list one kind of caption as links, kept current', () => {
    const editor = editorWith(p('top'), p('body'))
    select(editor, new TextSelection(pos([0], 3)))
    run(editor, insertCaptionList('figure'))
    select(editor, new TextSelection(pos([2], 4)))
    run(editor, insertCaption('figure', { label: 'Figure', text: 'A cat' }))
    run(editor, insertCaption('table', { label: 'Table', text: 'Not a figure' }))
    const html = serializeToHTML(editor.state.doc.child(1))
    expect(html).toContain('data-caption-list="figure"')
    expect(html).toContain(
      '<span class="trevixal-ref-link" data-href="#fig-1">Figure 1: A cat</span>',
    )
    expect(html).not.toContain('Not a figure')
    editor.destroy()
  })

  it('collect marked words under their entries, with subentries and section numbers', () => {
    const editor = editorWith(h(1, 'Fruit'), p('Apples and pears'), h(1, 'More'), p('apples again'))
    run(editor, setHeadingNumbering('outline'))
    const mark = (block: number, from: number, to: number, entry = '', sub = '') => {
      select(editor, new TextSelection(pos([block], from), pos([block], to)))
      run(editor, markIndexEntry({ entry, sub }))
    }
    mark(1, 0, 6)
    mark(1, 11, 16, 'Pears', 'ripe')
    mark(3, 0, 6)
    select(editor, new TextSelection(pos([3], 12)))
    run(editor, insertDocumentIndex)
    const index = editor.state.doc.child(4)
    expect(JSON.parse(String(index.attrs.entries))).toEqual([
      {
        term: 'Apples',
        locations: [
          { id: 'xe-1', label: '1' },
          { id: 'xe-3', label: '2' },
        ],
        subentries: [],
      },
      {
        term: 'Pears',
        locations: [],
        subentries: [{ term: 'ripe', locations: [{ id: 'xe-2', label: '1' }] }],
      },
    ])
    expect(serializeToHTML(index)).toContain('<p class="trevixal-index__letter">A</p>')
    editor.destroy()
  })
  it('keep an entry as marked while text is typed on after it, and count one mark once', () => {
    const editor = editorWith(p('Apples'), p('Machine'), p('learning models'))
    select(editor, new TextSelection(pos([0], 0), pos([0], 6)))
    run(editor, markIndexEntry())
    // Typing straight after the marked word takes the mark along, as bold
    // does, and the entry stays filed under the word that was marked.
    select(editor, new TextSelection(pos([0], 6)))
    editor.commands.insertText(', pears and plums')
    // One mark over two paragraphs is one place in the index.
    select(editor, new TextSelection(pos([1], 0), pos([2], 8)))
    run(editor, markIndexEntry())
    select(editor, new TextSelection(pos([2], 15)))
    run(editor, insertDocumentIndex)
    const entries = JSON.parse(String(editor.state.doc.child(3).attrs.entries)) as {
      term: string
      locations: unknown[]
    }[]
    expect(entries.map((entry) => [entry.term, entry.locations.length])).toEqual([
      ['Apples', 1],
      ['Machine learning', 1],
    ])
    editor.destroy()
  })
})

describe('endnotes', () => {
  it('keep their own list at the very end, after the footnotes, numbered i, ii, iii', () => {
    const editor = editorWith(p('text'))
    select(editor, new TextSelection(pos([0], 4)))
    run(editor, insertEndnote())
    run(editor, insertEndnote())
    run(editor, insertFootnote())
    const names = editor.state.doc.content.children.map((child) => child.type.name)
    expect(names).toEqual(['paragraph', 'footnoteList', 'endnoteList'])
    const html = serializeToHTML(editor.state.doc.child(0))
    expect(html).toContain('data-endnote="1" data-href="#en-1">i</span>')
    expect(html).toContain('data-endnote="2" data-href="#en-2">ii</span>')
    editor.destroy()
  })

  it('decline an id already in use, as footnotes do', () => {
    const editor = editorWith(p('text'))
    select(editor, new TextSelection(pos([0], 4)))
    expect(run(editor, insertEndnote('1'))).toBe(true)
    expect(run(editor, insertEndnote('1'))).toBe(false)
    editor.destroy()
  })
})

describe('the reference nodes in HTML', () => {
  it('read back as the same nodes, their results recomputed rather than trusted', () => {
    const editor = editorWith(p('see '), p('x'))
    select(editor, new TextSelection(pos([1], 1)))
    run(editor, insertCaption('table', { label: 'Table', text: 'T' }))
    const target = referenceTargets(editor.state.doc)[0]
    if (!target) throw new Error('no caption')
    select(editor, new TextSelection(pos([0], 4)))
    run(editor, insertCrossReference(target, 'label'))
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain(
      '<span class="trevixal-xref" data-xref="tab-1" data-xref-format="label" data-href="#tab-1">Table 1</span>',
    )
    const back = parseHTML(schema, html)
    expect(fieldSteps(back)).toEqual([])
    editor.destroy()
  })

  it('leave a document with no fields untouched', () => {
    expect(fieldSteps(schema.node('doc', undefined, [p('plain')]))).toEqual([])
  })
})
