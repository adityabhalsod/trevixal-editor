// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import { serializeToTextFile } from '../src/serialize/html'
import { serializeToMarkdown } from '../src/serialize/markdown'
import { parseHTML } from '../src/serialize/parse-html'
import type { EditorView } from '../src/view/editor-view'

/**
 * The nodes the bundled extensions add that the plain-text and Markdown
 * writers name: callouts, notes, a gallery, a drawing, an embed, a poll,
 * references and a table that merges a cell down a column.
 */
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    callout: { content: 'block+', group: 'block', attrs: { variant: { default: 'info' } } },
    footnoteRef: {
      inline: true,
      atom: true,
      group: 'inline',
      attrs: { id: {} },
      toHTML: (node) => ({ tag: 'span', text: String(node.attrs.id) }),
    },
    endnoteRef: {
      inline: true,
      atom: true,
      group: 'inline',
      attrs: { id: {} },
      toHTML: () => ({ tag: 'span', text: 'i' }),
    },
    footnoteList: { content: 'footnoteItem+', group: 'block' },
    footnoteItem: { content: 'block+', attrs: { id: {} } },
    endnoteList: { content: 'endnoteItem+', group: 'block' },
    endnoteItem: { content: 'block+', attrs: { id: {} } },
    referenceList: {
      content: 'referenceItem+',
      group: 'block',
      attrs: { style: { default: 'ieee' } },
    },
    referenceItem: { content: 'inline*', attrs: { id: {} } },
    gallery: { content: 'image+', group: 'block' },
    image: {
      atom: true,
      attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null } },
    },
    drawing: {
      atom: true,
      group: 'block',
      toHTML: () => ({
        tag: 'div',
        innerHTML: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
      }),
    },
    iframeEmbed: {
      atom: true,
      group: 'block',
      attrs: { src: { default: '' }, title: { default: null } },
    },
    poll: { atom: true, group: 'block', exportText: () => 'Lunch?\nPizza: 2 votes\nSoup: 1 vote' },
    table: { content: 'tableRow+', group: 'block' },
    tableRow: { content: 'tableCell+' },
    tableCell: {
      content: 'block+',
      attrs: {
        header: { default: false },
        colspan: { default: 1 },
        rowspan: { default: 1 },
        align: { default: null },
      },
    },
  },
  marks: defaultMarks(),
})

const t = (value: string): EditorNode => schema.text(value)
const p = (...content: (EditorNode | string)[]): EditorNode =>
  schema.nodes.paragraph.create(
    undefined,
    Fragment.from(content.map((each) => (typeof each === 'string' ? t(each) : each))),
  )
const node = (
  name: string,
  attrs: Record<string, unknown> = {},
  content: EditorNode[] = [],
): EditorNode => schema.nodeType(name).create(attrs, Fragment.from(content))
const doc = (...blocks: EditorNode[]): EditorNode =>
  schema.topType.create(undefined, Fragment.from(blocks))
const cell = (text: string, attrs: Record<string, unknown> = {}): EditorNode =>
  node('tableCell', attrs, [p(text)])

const notes = doc(
  p('Said', node('footnoteRef', { id: '1' }), ' and', node('endnoteRef', { id: '1' })),
  node('footnoteList', {}, [node('footnoteItem', { id: '1' }, [p('A footnote.')])]),
  node('endnoteList', {}, [node('endnoteItem', { id: '1' }, [p('An endnote.')])]),
)

describe('the plain text file', () => {
  it('marks a list as the editor draws it: roman numerals in a roman list', () => {
    const list = node('orderedList', { start: 1, listStyle: 'upper-roman' }, [
      node('listItem', {}, [p('One')]),
      node('listItem', {}, [p('Two')]),
    ])
    expect(serializeToTextFile(doc(list))).toBe('I. One\nII. Two')
  })

  it('brackets a note’s marker and numbers the notes, endnotes in roman', () => {
    expect(serializeToTextFile(notes)).toBe('Said[1] and[i]\n1. A footnote.\ni. An endnote.')
  })

  it('numbers an IEEE reference list as its citations do', () => {
    const references = node('referenceList', {}, [
      node('referenceItem', { id: 'a' }, [t('A book.')]),
    ])
    expect(serializeToTextFile(doc(references))).toBe('[1] A book.')
  })

  it('keeps a merged cell’s place empty, so each row keeps its columns', () => {
    const table = node('table', {}, [
      node('tableRow', {}, [cell('Friday', { rowspan: 2 }), cell('Rehearsal')]),
      node('tableRow', {}, [cell('Sound check')]),
    ])
    expect(serializeToTextFile(doc(table))).toBe('Friday\tRehearsal\n\tSound check')
  })

  it('writes an atom of several lines a line each', () => {
    expect(serializeToTextFile(doc(node('poll')))).toBe('Lunch?\nPizza: 2 votes\nSoup: 1 vote')
  })
})

describe('Markdown of the extension blocks', () => {
  it('writes a callout as the GitHub alert of its colour', () => {
    const markdown = serializeToMarkdown(
      doc(node('callout', { variant: 'warning' }, [p('Careful.')])),
    )
    expect(markdown).toBe('> [!WARNING]\n> Careful.\n')
  })

  it('writes footnotes and endnotes as GFM footnotes, each under its own label', () => {
    expect(serializeToMarkdown(notes)).toBe(
      'Said[^1] and[^e1]\n\n[^1]: A footnote.\n\n[^e1]: An endnote.\n',
    )
  })

  it("keeps a gallery's pictures and a drawing's picture", () => {
    const gallery = node('gallery', {}, [node('image', { src: 'https://x.test/a.png', alt: 'A' })])
    const markdown = serializeToMarkdown(doc(gallery, node('drawing')))
    expect(markdown).toContain('![A](https://x.test/a.png)')
    expect(markdown).toContain('![Drawing](data:image/svg+xml,%3Csvg')
  })

  it('links an embed by its title', () => {
    const embed = node('iframeEmbed', { src: 'https://video.test/1', title: 'Talk' })
    expect(serializeToMarkdown(doc(embed))).toBe('[Talk](https://video.test/1)\n')
  })

  it('breaks an atom of several lines where its lines end', () => {
    expect(serializeToMarkdown(doc(node('poll')))).toBe(
      'Lunch?  \nPizza: 2 votes  \nSoup: 1 vote\n',
    )
  })
})

describe('pasting Markdown text', () => {
  function paste(text: string): EditorNode {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({
      schema,
      doc: doc(schema.nodes.paragraph.create()),
      element: host,
    })
    const view = editor.view as EditorView
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? text : ''), files: [] },
    })
    view.dom.dispatchEvent(event)
    const result = editor.state.doc
    editor.destroy()
    host.remove()
    return result
  }

  it('comes in as the headings and lists it marks up', () => {
    const result = paste('# Notes\n\n- one\n- two')
    expect(result.content.children.map((block) => block.type.name)).toEqual([
      'heading',
      'bulletList',
    ])
  })

  it('leaves prose as lines of text', () => {
    const result = paste('Dear Sam,\nThanks.')
    expect(result.content.children.map((block) => block.textContent)).toEqual([
      'Dear Sam,',
      'Thanks.',
    ])
  })
})

describe('parsing pasted HTML', () => {
  it('reads a heading Google Docs styled as its own default as a plain heading', () => {
    const result = parseHTML(schema, '<h1><span>Plan</span></h1>')
    expect(result.child(0).type.name).toBe('heading')
    expect(result.child(0).child(0).marks).toEqual([])
  })
})
