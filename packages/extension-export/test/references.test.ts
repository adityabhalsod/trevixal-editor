import {
  type Attrs,
  type EditorNode,
  Fragment,
  type Mark,
  Schema,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { readZip } from '../src/zip'
import { extraNodes, partText } from './helpers'

// The reference nodes live in extension-blocks, which this package does not
// depend on, so the shapes both writers read are declared here, as the table
// and image nodes are in helpers.ts.
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    ...extraNodes(),
    captionNumber: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { kind: { default: 'figure' }, id: { default: null }, number: { default: null } },
      toHTML: (node) => ({ tag: 'span', text: String(node.attrs.number ?? '') }),
    },
    crossReference: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { target: { default: null }, format: { default: 'label' }, text: { default: '' } },
      toHTML: (node) => ({ tag: 'span', text: String(node.attrs.text) }),
    },
    captionList: {
      group: 'block',
      atom: true,
      attrs: { kind: { default: 'figure' }, entries: { default: '[]' } },
    },
    documentIndex: { group: 'block', atom: true, attrs: { entries: { default: '[]' } } },
  },
  marks: {
    ...defaultMarks(),
    indexTerm: {
      attrs: { id: { default: null }, entry: { default: null }, sub: { default: null } },
    },
  },
})

const text = (value: string, marks: Mark[] = []): EditorNode => schema.text(value, marks)
const p = (children: (EditorNode | string)[] = [], attrs?: Attrs): EditorNode =>
  schema.node(
    'paragraph',
    attrs,
    Fragment.from(children.map((child) => (typeof child === 'string' ? text(child) : child))),
  )
const h = (level: number, words: string, id: string | null = null): EditorNode =>
  schema.node('heading', { level, id }, [text(words)])
const settled = (attrs: Attrs, ...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', attrs, Fragment.from(blocks))
const caption = (kind: string, number: number, id: string, words: string): EditorNode =>
  p([
    `${kind[0]?.toUpperCase()}${kind.slice(1)} `,
    schema.node('captionNumber', { kind, id, number }),
    `: ${words}`,
  ])
const ref = (target: string, format: string, shown: string): EditorNode =>
  schema.node('crossReference', { target, format, text: shown })

async function word(
  document: EditorNode,
): Promise<{ body: string; numbering: string; settings: string }> {
  const parts = await readZip(await serializeToDOCX(document))
  return {
    body: partText(parts, 'word/document.xml'),
    numbering: partText(parts, 'word/numbering.xml'),
    settings: partText(parts, 'word/settings.xml'),
  }
}

describe('heading numbering in Word', () => {
  it('numbers each top-level heading at its level from one shared list', async () => {
    const { body, numbering } = await word(
      settled({ headingNumbering: 'outline' }, h(1, 'Intro'), h(2, 'Scope'), p(['text'])),
    )
    expect(body).toContain(
      '<w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
    )
    expect(body).toContain(
      '<w:pStyle w:val="Heading2"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>',
    )
    expect(numbering).toContain('<w:abstractNum w:abstractNumId="90">')
    expect(numbering).toContain('<w:suff w:val="space"/><w:lvlText w:val="%1.%2."/>')
  })

  it('leaves the headings alone when the document does not number them', async () => {
    const { body, numbering } = await word(settled({}, h(1, 'Intro')))
    expect(body).not.toContain('<w:numPr>')
    expect(numbering).not.toContain('w:abstractNumId="90"')
  })
})

describe('captions and cross-references in Word', () => {
  it('write a caption’s number as a SEQ field, bookmarked for each format', async () => {
    const { body } = await word(settled({}, caption('figure', 2, 'fig-2', 'A cat')))
    expect(body).toContain('<w:pStyle w:val="Caption"/>')
    expect(body).toContain('w:instr=" SEQ Figure \\* ARABIC "')
    for (const name of ['_RefF_fig_2', '_RefL_fig_2', '_RefN_fig_2']) {
      expect(body).toContain(`w:name="${name}"`)
    }
  })

  it('point each format at its bookmark, showing the text the editor computed', async () => {
    const { body } = await word(
      settled(
        {},
        caption('figure', 1, 'fig-1', 'A cat'),
        p([
          ref('fig-1', 'label', 'Figure 1'),
          ref('fig-1', 'number', '1'),
          ref('fig-1', 'full', 'Figure 1: A cat'),
          ref('fig-1', 'text', 'A cat'),
        ]),
      ),
    )
    expect(body).toContain('w:instr=" REF _RefL_fig_1 \\h "')
    expect(body).toContain('w:instr=" REF _RefN_fig_1 \\h "')
    expect(body).toContain('w:instr=" REF _RefF_fig_1 \\h "')
    expect(body).toContain('<w:t xml:space="preserve">Figure 1</w:t>')
    // The caption's text alone has no bookmark to read: it is the text itself.
    expect(body.match(/REF _Ref/g)).toHaveLength(3)
  })

  it('read a numbered heading’s number with \\r, and its text without', async () => {
    const { body } = await word(
      settled(
        { headingNumbering: 'outline' },
        h(1, 'Intro', 'intro'),
        p([ref('intro', 'number', '1'), ref('intro', 'text', 'Intro')]),
      ),
    )
    expect(body).toContain('w:name="_RefH_intro"')
    expect(body).toContain('w:instr=" REF _RefH_intro \\r \\h "')
    expect(body).toContain('w:instr=" REF _RefH_intro \\h "')
  })

  it('read a nested heading by its text: Word numbers only the top level', async () => {
    const { body } = await word(
      settled(
        { headingNumbering: 'outline' },
        h(1, 'Intro', 'intro'),
        schema.node('blockquote', undefined, [h(2, 'Nested heading', 'nested')]),
        p([ref('nested', 'number', 'Nested heading'), ref('nested', 'full', 'Nested heading')]),
      ),
    )
    expect(body).not.toContain('REF _RefH_nested \\r')
    expect(body).toContain('w:instr=" REF _RefH_nested \\h "')
  })

  it('give every heading a bookmark of its own, however long the ids', async () => {
    const long = 'implementation-details-of-the-rendering'
    const { body } = await word(
      settled(
        {},
        h(1, 'Pipeline', `${long}-pipeline`),
        h(1, 'Engine', `${long}-engine`),
        p([ref(`${long}-pipeline`, 'text', 'Pipeline'), ref(`${long}-engine`, 'text', 'Engine')]),
      ),
    )
    const names = [...body.matchAll(/w:bookmarkStart w:id="\d+" w:name="([^"]+)"/g)].map(
      (match) => match[1] ?? '',
    )
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(40)
      expect(body).toContain(`w:instr=" REF ${name} \\h "`)
    }
  })
})

describe('tables of figures and the index in Word', () => {
  it('write a table of figures as a TOC over its sequence, linking each entry', async () => {
    const entries = JSON.stringify([{ id: 'fig-1', text: 'Figure 1: A cat' }])
    const { body, settings } = await word(
      settled(
        {},
        schema.node('captionList', { kind: 'figure', entries }),
        caption('figure', 1, 'fig-1', 'A cat'),
      ),
    )
    expect(body).toContain('TOC \\h \\z \\c &quot;Figure&quot;')
    expect(body).toContain('<w:hyperlink w:anchor="_RefF_fig_1" w:history="1">')
    expect(settings).toContain('<w:updateFields w:val="true"/>')
  })

  it('mark indexed words with XE fields, and write the index as INDEX', async () => {
    const term = (id: string, entry: string | null, sub: string | null): Mark =>
      schema.mark('indexTerm', { id, entry, sub })
    const entries = JSON.stringify([
      { term: 'Apples', locations: [{ id: 'xe-1', label: '1' }], subentries: [] },
    ])
    const { body } = await word(
      settled(
        {},
        p([
          text('Apples', [term('xe-1', null, null)]),
          ' and ',
          text('pears', [term('xe-2', 'Pears', 'ripe')]),
        ]),
        schema.node('documentIndex', { entries }),
      ),
    )
    expect(body).toContain('w:instr=" XE &quot;Apples&quot; "')
    expect(body).toContain('w:instr=" XE &quot;Pears:ripe&quot; "')
    expect(body).toContain(
      '<w:instrText xml:space="preserve"> INDEX \\e &quot;, &quot; </w:instrText>',
    )
    expect(body).toContain('<w:t xml:space="preserve">Apples, 1</w:t>')
  })

  it('escape a backslash in an entry, which XE reads as its escape', async () => {
    const { body } = await word(
      settled(
        {},
        p([text('C:\\path', [schema.mark('indexTerm', { id: 'xe-1', entry: 'C:\\path' })])]),
      ),
    )
    expect(body).toContain('w:instr=" XE &quot;C\\:\\\\path&quot; "')
  })
})

describe('document settings in Word', () => {
  it('number lines in the section, and run a right-to-left document right to left', async () => {
    const { body } = await word(
      settled({ lineNumbers: true, direction: 'rtl' }, p(['שלום']), p(['left'], { dir: 'ltr' })),
    )
    expect(body).toContain(
      '<w:lnNumType w:countBy="1" w:restart="continuous"/><w:bidi/></w:sectPr>',
    )
    expect(body).toContain('<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr>')
    // A paragraph set left to right stays so inside it.
    expect(body).toContain('<w:p><w:r><w:t xml:space="preserve">left</w:t></w:r></w:p>')
  })

  it('keep left and right where the editor shows them, and lay out lists and tables from the right', async () => {
    const entries = JSON.stringify([{ id: 'fig-1', text: 'Figure 1: A cat' }])
    const cell = schema.node('tableCell', undefined, [p(['A'])])
    const { body } = await word(
      settled(
        { direction: 'rtl' },
        p(['flush left'], { align: 'left' }),
        schema.node('captionList', { kind: 'figure', entries }),
        schema.node('table', undefined, [schema.node('tableRow', undefined, [cell])]),
      ),
    )
    // Word reads left in a right-to-left paragraph as its start, the right.
    expect(body).toContain('<w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>')
    expect(body).toContain('<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/>')
    expect(body).toContain('<w:tblStyle w:val="TableGrid"/><w:bidiVisual/><w:tblW')
  })
})

describe('the reference apparatus in RTF', () => {
  it('carries heading numbers, caption fields, lists, line numbers and direction', () => {
    const entries = JSON.stringify([{ id: 'fig-1', text: 'Figure 1: A cat' }])
    const rtf = serializeToRTF(
      settled(
        { headingNumbering: 'outline', lineNumbers: true, direction: 'rtl' },
        h(1, 'Intro'),
        caption('figure', 1, 'fig-1', 'A cat'),
        schema.node('captionList', { kind: 'figure', entries }),
      ),
    )
    expect(rtf).toContain('\\rtldoc\\widowctrl\\sectd\\linemod1\\linex360\\linecont')
    expect(rtf).toContain('\\rtlpar')
    expect(rtf).toContain('1. Intro')
    expect(rtf).toContain('{\\field{\\*\\fldinst SEQ Figure \\\\* ARABIC}{\\fldrslt 1}}')
    expect(rtf).toContain(' Figure 1: A cat\\par')
  })

  it('number a heading by its place, even one node standing at two', () => {
    const chapter = h(1, 'Chapter')
    const rtf = serializeToRTF(settled({ headingNumbering: 'outline' }, chapter, p(['x']), chapter))
    expect(rtf).toContain('1. Chapter')
    expect(rtf).toContain('2. Chapter')
  })

  it('lay out a right-to-left document’s tables and lists from the right', () => {
    const entries = JSON.stringify([{ id: 'fig-1', text: 'Figure 1: A cat' }])
    const cell = schema.node('tableCell', undefined, [p(['A'])])
    const rtf = serializeToRTF(
      settled(
        { direction: 'rtl' },
        schema.node('captionList', { kind: 'figure', entries }),
        schema.node('table', undefined, [schema.node('tableRow', undefined, [cell])]),
      ),
    )
    expect(rtf).toContain('\\trowd\\rtlrow')
    expect(rtf).toMatch(/\\rtlpar[^\n]* Figure 1: A cat\\par/)
  })
})
