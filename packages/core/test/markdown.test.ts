import { describe, expect, it } from 'vitest'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import { serializeToMarkdown } from '../src/serialize/markdown'
import { parseMarkdown } from '../src/serialize/parse-markdown'
import { blockquote, bold, br, doc, h, hr, italic, p, testSchema, text } from './helpers'

/** A schema with tables and images, to cover the extension-backed nodes. */
const richSchema = new Schema({
  nodes: {
    ...defaultNodes(),
    image: {
      inline: true,
      atom: true,
      group: 'inline',
      attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null } },
    },
    table: { content: 'tableRow+', group: 'block' },
    tableRow: { content: 'tableCell+' },
    tableCell: {
      content: 'block+',
      attrs: { header: { default: false }, colspan: { default: 1 }, align: { default: null } },
    },
  },
  marks: defaultMarks(),
})

function md(document: EditorNode): string {
  return serializeToMarkdown(document)
}

/** Serialize, parse back, and assert the document survived unchanged. */
function roundTrip(document: EditorNode, schema = testSchema): void {
  const markdown = serializeToMarkdown(document)
  const back = parseMarkdown(markdown, schema)
  expect(back.eq(document), `round trip failed for:\n${markdown}`).toBe(true)
}

function link(value: string, href: string): EditorNode {
  return testSchema.text(value, [testSchema.mark('link', { href })])
}

function code(value: string): EditorNode {
  return testSchema.text(value, [testSchema.mark('code')])
}

function strike(value: string): EditorNode {
  return testSchema.text(value, [testSchema.mark('strikethrough')])
}

function codeBlock(body: string, language: string | null = null): EditorNode {
  return testSchema.node(
    'codeBlock',
    { language },
    body ? Fragment.of(testSchema.text(body)) : Fragment.empty,
  )
}

function taskList(...items: EditorNode[]): EditorNode {
  return testSchema.node('taskList', undefined, Fragment.from(items))
}

function taskItem(checked: boolean, ...blocks: EditorNode[]): EditorNode {
  return testSchema.node('taskItem', { checked }, Fragment.from(blocks))
}

function ul(...items: EditorNode[]): EditorNode {
  return testSchema.node('bulletList', undefined, Fragment.from(items))
}

function ol(start: number, ...items: EditorNode[]): EditorNode {
  return testSchema.node('orderedList', { start }, Fragment.from(items))
}

function li(...blocks: EditorNode[]): EditorNode {
  return testSchema.node('listItem', undefined, Fragment.from(blocks))
}

describe('serializeToMarkdown', () => {
  it('writes headings, paragraphs and rules', () => {
    expect(md(doc(h(2, 'Title'), p('Body'), hr()))).toBe('## Title\n\nBody\n\n---\n')
  })

  it('writes the inline marks it has syntax for', () => {
    expect(md(doc(p(bold('b'), ' ', italic('i'), ' ', strike('s'), ' ', code('c'))))).toBe(
      '**b** _i_ ~~s~~ `c`\n',
    )
  })

  it('writes links with their destination', () => {
    expect(md(doc(p(link('site', 'https://x.dev'))))).toBe('[site](https://x.dev)\n')
  })

  it('writes a fenced code block with its language', () => {
    expect(md(doc(codeBlock('const a = 1', 'ts')))).toBe('```ts\nconst a = 1\n```\n')
  })

  it('lengthens the fence when the code contains backticks', () => {
    const out = md(doc(codeBlock('a ``` b', 'md')))
    expect(out).toBe('````md\na ``` b\n````\n')
  })

  it('writes a hard break as two trailing spaces', () => {
    expect(md(doc(p('a', br(), 'b')))).toBe('a  \nb\n')
  })

  it('writes blockquotes with a marker on every line', () => {
    expect(md(doc(blockquote(p('one'), p('two'))))).toBe('> one\n>\n> two\n')
  })

  it('writes nested lists indented under their parent item', () => {
    const document = doc(ul(li(p('a'), ul(li(p('b'))))))
    expect(md(document)).toBe('- a\n\n  - b\n')
  })

  it('writes an ordered list from its start attribute', () => {
    expect(md(doc(ol(3, li(p('x')), li(p('y')))))).toBe('3. x\n4. y\n')
  })

  it('escapes markdown control characters in text', () => {
    // The central round-trip trap: this must come back as literal text.
    expect(md(doc(p('*not emphasis*')))).toBe('\\*not emphasis\\*\n')
    expect(md(doc(p('# not a heading')))).toBe('\\# not a heading\n')
    expect(md(doc(p('- not a list')))).toBe('\\- not a list\n')
    expect(md(doc(p('a_b_c')))).toBe('a\\_b\\_c\n')
    expect(md(doc(p('[not a link](x)')))).toBe('\\[not a link\\](x)\n')
  })

  it('does not escape inside a code span, where nothing is markup', () => {
    expect(md(doc(p(code('*literal*'))))).toBe('`*literal*`\n')
  })

  it('writes images and tables from an extended schema', () => {
    const image = richSchema.node('image', { src: 'https://x.dev/a.png', alt: 'A' })
    const paragraph = richSchema.node('paragraph', undefined, Fragment.of(image))
    const document = richSchema.node('doc', undefined, Fragment.of(paragraph))
    expect(serializeToMarkdown(document)).toBe('![A](https://x.dev/a.png)\n')
  })

  it('writes a GFM pipe table with an alignment row', () => {
    const cell = (value: string, header: boolean, align: string | null): EditorNode =>
      richSchema.node(
        'tableCell',
        { header, align },
        Fragment.of(richSchema.node('paragraph', undefined, Fragment.of(richSchema.text(value)))),
      )
    const row = (...cells: EditorNode[]): EditorNode =>
      richSchema.node('tableRow', undefined, Fragment.from(cells))
    const table = richSchema.node(
      'table',
      undefined,
      Fragment.of(
        row(cell('H1', true, 'left'), cell('H2', true, 'center')),
        row(cell('a', false, null), cell('b', false, null)),
      ),
    )
    const document = richSchema.node('doc', undefined, Fragment.of(table))
    expect(serializeToMarkdown(document)).toBe('| H1 | H2 |\n| :--- | :---: |\n| a | b |\n')
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs and rules', () => {
    expect(
      parseMarkdown('## Title\n\nBody\n\n---\n', testSchema).eq(
        doc(h(2, 'Title'), p('Body'), hr()),
      ),
    ).toBe(true)
  })

  it('reads the inline marks', () => {
    const parsed = parseMarkdown('**b** _i_ ~~s~~ `c`', testSchema)
    expect(parsed.eq(doc(p(bold('b'), ' ', italic('i'), ' ', strike('s'), ' ', code('c'))))).toBe(
      true,
    )
  })

  it('reads *asterisk* emphasis as italic too', () => {
    expect(parseMarkdown('*i*', testSchema).eq(doc(p(italic('i'))))).toBe(true)
  })

  it('reads a link', () => {
    expect(
      parseMarkdown('[site](https://x.dev)', testSchema).eq(doc(p(link('site', 'https://x.dev')))),
    ).toBe(true)
  })

  it('drops an unsafe link destination but keeps its text', () => {
    // The same rule the HTML parser applies: no mark, text preserved.
    const parsed = parseMarkdown('[click](javascript:alert(1))', testSchema)
    expect(parsed.eq(doc(p('click')))).toBe(true)
  })

  it('reads a fenced code block and its language', () => {
    const parsed = parseMarkdown('```ts\nconst a = 1\n```', testSchema)
    expect(parsed.eq(doc(codeBlock('const a = 1', 'ts')))).toBe(true)
  })

  it('reads a blockquote', () => {
    expect(
      parseMarkdown('> one\n>\n> two', testSchema).eq(doc(blockquote(p('one'), p('two')))),
    ).toBe(true)
  })

  it('reads nested lists', () => {
    expect(parseMarkdown('- a\n\n  - b', testSchema).eq(doc(ul(li(p('a'), ul(li(p('b')))))))).toBe(
      true,
    )
  })

  it('reads an ordered list start', () => {
    expect(parseMarkdown('3. x\n4. y', testSchema).eq(doc(ol(3, li(p('x')), li(p('y')))))).toBe(
      true,
    )
  })

  it('honours backslash escapes rather than reading them as markup', () => {
    expect(parseMarkdown('\\*not emphasis\\*', testSchema).eq(doc(p('*not emphasis*')))).toBe(true)
    expect(parseMarkdown('\\# not a heading', testSchema).eq(doc(p('# not a heading')))).toBe(true)
  })

  it('joins soft-wrapped lines into one paragraph', () => {
    expect(parseMarkdown('one\ntwo', testSchema).eq(doc(p('one two')))).toBe(true)
  })

  it('reads two trailing spaces as a hard break', () => {
    expect(parseMarkdown('a  \nb', testSchema).eq(doc(p('a', br(), 'b')))).toBe(true)
  })

  it('yields an empty paragraph for empty input', () => {
    expect(parseMarkdown('', testSchema).eq(doc(p()))).toBe(true)
    expect(parseMarkdown('   \n\n  ', testSchema).eq(doc(p()))).toBe(true)
  })

  it('reads a pipe table when the schema has table nodes', () => {
    const parsed = parseMarkdown('| H1 | H2 |\n| :--- | ---: |\n| a | b |', richSchema)
    const table = parsed.child(0)
    expect(table.type.name).toBe('table')
    expect(table.childCount).toBe(2)
    expect(table.child(0).child(0).attrs.header).toBe(true)
    expect(table.child(0).child(0).attrs.align).toBe('left')
    expect(table.child(0).child(1).attrs.align).toBe('right')
    expect(table.child(1).child(1).textContent).toBe('b')
  })
})

describe('markdown round trip', () => {
  it('preserves a rich document', () => {
    roundTrip(
      doc(
        h(1, 'Heading'),
        p(
          'Plain paragraph with ',
          bold('bold'),
          ', ',
          italic('italic'),
          ' and ',
          code('code'),
          '.',
        ),
        p(link('a link', 'https://example.com')),
        blockquote(p('Quoted text')),
        codeBlock('function f() {\n  return 1\n}', 'js'),
        ul(li(p('first')), li(p('second'))),
        ol(1, li(p('one')), li(p('two'))),
        hr(),
        p('Trailing paragraph'),
      ),
    )
  })

  it('preserves text that looks like markup', () => {
    // Every one of these becomes markup if the serializer forgets to escape.
    roundTrip(doc(p('*not emphasis*')))
    roundTrip(doc(p('# not a heading')))
    roundTrip(doc(p('- not a list item')))
    roundTrip(doc(p('1. not an ordered item')))
    roundTrip(doc(p('> not a quote')))
    roundTrip(doc(p('a_b_c and a*b*c')))
    roundTrip(doc(p('[not a link](https://x.dev)')))
    roundTrip(doc(p('`not code`')))
    roundTrip(doc(p('--- not a rule')))
    roundTrip(doc(p('~~not strike~~')))
  })

  it('preserves marks combined on one span', () => {
    const both = testSchema.text('both', [testSchema.mark('bold'), testSchema.mark('italic')])
    roundTrip(doc(p(both)))
  })

  it('preserves nested lists and multi-block items', () => {
    roundTrip(doc(ul(li(p('outer'), ul(li(p('inner')))))))
    roundTrip(doc(ul(li(p('one'), p('two')))))
  })

  it('preserves a code block containing backticks and blank lines', () => {
    roundTrip(doc(codeBlock('a ``` b\n\nc', 'md')))
    roundTrip(doc(codeBlock('', null)))
  })

  it('preserves unicode text', () => {
    roundTrip(doc(p('héllo ✓ 😀 中文')))
  })

  it('preserves hard breaks', () => {
    roundTrip(doc(p('a', br(), 'b')))
  })

  it('preserves a link whose URL contains parentheses', () => {
    roundTrip(doc(p(link('wiki', 'https://x.dev/a_(b)'))))
  })

  it('preserves text with backslashes', () => {
    roundTrip(doc(p('a\\b')))
    roundTrip(doc(p(text('C:\\path\\to'))))
  })

  it('preserves task list items and their checked state', () => {
    roundTrip(doc(taskList(taskItem(false, p('todo')), taskItem(true, p('done')))))
  })
})

describe('task lists in markdown', () => {
  it('writes a checkbox per item', () => {
    expect(md(doc(taskList(taskItem(false, p('a')), taskItem(true, p('b')))))).toBe(
      '- [ ] a\n- [x] b\n',
    )
  })

  it('reads a checkbox list back as a task list', () => {
    const parsed = parseMarkdown('- [ ] a\n- [x] b', testSchema)
    expect(parsed.child(0).type.name).toBe('taskList')
    expect(parsed.child(0).child(0).attrs.checked).toBe(false)
    expect(parsed.child(0).child(1).attrs.checked).toBe(true)
    expect(parsed.child(0).child(1).textContent).toBe('b')
  })

  it('reads a plain bullet list as a bullet list, not a task list', () => {
    expect(parseMarkdown('- a', testSchema).child(0).type.name).toBe('bulletList')
  })
})
