// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type CitationSource,
  SourceFileError,
  citationLabel,
  formatReference,
  parseBibTeX,
  parseCSLJSON,
  parseSources,
} from '../src/citation-styles'
import {
  citationStyleOf,
  importSources,
  insertCitation,
  referenceChoices,
  setCitationStyle,
} from '../src/citations'
import { blockNodes } from '../src/schema'

const schema = new Schema({ nodes: { ...defaultNodes(), ...blockNodes() }, marks: defaultMarks() })
const editors: Editor[] = []

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
})

const BIB = `
@article{smith2020,
  author = {Smith, John and Doe, Jane},
  title = {{Reading} on Screens},
  journal = {Journal of Reading},
  year = 2020,
  volume = {12},
  number = {3},
  pages = {45--67},
  doi = {10.1000/xyz}
}
@book{adams1999,
  author = "Ada Adams",
  title = {A Short Book},
  publisher = {Northwind Press},
  year = {1999}
}`

const smith: CitationSource = {
  type: 'article-journal',
  author: [
    { family: 'Smith', given: 'John' },
    { family: 'Doe', given: 'Jane' },
  ],
  issued: 2020,
  title: 'Reading on Screens',
  containerTitle: 'Journal of Reading',
  volume: '12',
  issue: '3',
  page: '45–67',
  doi: '10.1000/xyz',
}

describe('reading sources', () => {
  it('reads BibTeX entries, braces, quotes and both ways of naming people', () => {
    const [first, second] = parseBibTeX(BIB)
    expect(first).toEqual({ id: 'smith2020', source: smith })
    expect(second?.source).toMatchObject({
      type: 'book',
      author: [{ family: 'Adams', given: 'Ada' }],
      issued: 1999,
      publisher: 'Northwind Press',
    })
  })

  it('reads CSL-JSON, and says so when a file has nothing in it', () => {
    const [item] = parseCSLJSON(
      JSON.stringify([
        {
          id: 'lee',
          type: 'webpage',
          title: 'Plain Words',
          author: [{ family: 'Lee', given: 'Min' }],
          issued: { 'date-parts': [[2021, 5]] },
          URL: 'https://example.com/plain',
        },
      ]),
    )
    expect(item).toEqual({
      id: 'lee',
      source: {
        type: 'webpage',
        author: [{ family: 'Lee', given: 'Min' }],
        issued: 2021,
        title: 'Plain Words',
        url: 'https://example.com/plain',
      },
    })
    expect(() => parseSources('no entries here')).toThrow(SourceFileError)
  })
})

describe('the four styles', () => {
  it('write the same article the way each style guide sets it', () => {
    expect(formatReference(smith, 'apa')).toBe(
      'Smith, J., & Doe, J. (2020). Reading on Screens. Journal of Reading, 12(3), 45–67. https://doi.org/10.1000/xyz',
    )
    expect(formatReference(smith, 'mla')).toBe(
      'Smith, John, and Jane Doe. “Reading on Screens.” Journal of Reading, vol. 12, no. 3, 2020, pp. 45–67. https://doi.org/10.1000/xyz',
    )
    expect(formatReference(smith, 'chicago')).toBe(
      'Smith, John, and Jane Doe. 2020. “Reading on Screens.” Journal of Reading 12 (3): 45–67. https://doi.org/10.1000/xyz',
    )
    expect(formatReference(smith, 'ieee')).toBe(
      'J. Smith and J. Doe, “Reading on Screens,” Journal of Reading, vol. 12, no. 3, pp. 45–67, 2020. https://doi.org/10.1000/xyz',
    )
  })

  it('cite by author and year, or by number', () => {
    expect(citationLabel(smith, 'apa', 0)).toBe('(Smith & Doe, 2020)')
    expect(citationLabel(smith, 'mla', 0)).toBe('(Smith and Doe)')
    expect(citationLabel(smith, 'chicago', 0)).toBe('(Smith and Doe 2020)')
    expect(citationLabel(smith, 'ieee', 2)).toBe('3')
    expect(citationLabel(null, 'apa', 1)).toBe('2')
  })
})

describe('the reference list in a style', () => {
  function mount(doc: EditorNode): Editor {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host, doc })
    editors.push(editor)
    return editor
  }

  it('imports sources once, sorts them by author and relabels every citation', () => {
    const editor = mount(parseHTML(schema, '<p>As shown here</p>', document))
    const sources = parseBibTeX(BIB)
    expect(editor.exec(importSources(sources))).toBe(true)
    expect(editor.exec(importSources(sources))).toBe(false)
    expect(referenceChoices(editor.state.doc).map((choice) => choice.id)).toEqual([
      'smith2020',
      'adams1999',
    ])
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 13))))
    editor.exec(insertCitation('', 'smith2020'))
    expect(serializeToHTML(editor.state.doc)).toContain('[<a href="#ref-smith2020">1</a>]')

    editor.exec(setCitationStyle('apa'))
    expect(citationStyleOf(editor.state.doc)).toBe('apa')
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain('<a href="#ref-smith2020">(Smith &amp; Doe, 2020)</a>')
    expect(html).toContain('data-citation-style="apa"')
    // Adams before Smith, now the list is alphabetical.
    expect(referenceChoices(editor.state.doc).map((choice) => choice.id)).toEqual([
      'adams1999',
      'smith2020',
    ])
    expect(referenceChoices(editor.state.doc)[0]?.label).toBe(
      'Adams, A. (1999). A Short Book. Northwind Press.',
    )

    // Everything the style needs comes back from the saved page.
    const back = parseHTML(schema, html, document)
    expect(citationStyleOf(back)).toBe('apa')
    expect(serializeToHTML(back)).toBe(html)
  })
})
