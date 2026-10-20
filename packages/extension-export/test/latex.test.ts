import {
  type Attrs,
  type EditorNode,
  Fragment,
  Schema,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToLaTeX } from '../src/latex'

/** Notes, citations, a cross-reference and math, in the shapes the extensions give them. */
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    footnoteRef: { inline: true, atom: true, group: 'inline', attrs: { id: {} } },
    endnoteRef: { inline: true, atom: true, group: 'inline', attrs: { id: {} } },
    footnoteList: { content: 'footnoteItem+', group: 'block' },
    footnoteItem: { content: 'block+', attrs: { id: {} } },
    endnoteList: { content: 'endnoteItem+', group: 'block' },
    endnoteItem: { content: 'block+', attrs: { id: {} } },
    citation: { inline: true, atom: true, group: 'inline', attrs: { id: {} } },
    referenceList: { content: 'referenceItem+', group: 'block' },
    referenceItem: { content: 'inline*', attrs: { id: {} } },
    crossReference: {
      inline: true,
      atom: true,
      group: 'inline',
      attrs: { target: {}, text: { default: '' } },
      exportText: (node) => String(node.attrs.text),
    },
    math: { inline: true, atom: true, group: 'inline', attrs: { latex: { default: '' } } },
  },
  marks: defaultMarks(),
})

const node = (name: string, attrs: Attrs = {}, content: (EditorNode | string)[] = []): EditorNode =>
  schema.node(
    name,
    attrs,
    Fragment.from(content.map((each) => (typeof each === 'string' ? schema.text(each) : each))),
  )
const para = (...content: (EditorNode | string)[]): EditorNode => node('paragraph', {}, content)
const latexOf = (...blocks: EditorNode[]): string => serializeToLaTeX(node('doc', {}, blocks))

describe('LaTeX of the extension blocks', () => {
  it('sets a footnote’s words where it is cited, and nothing at the list', () => {
    const latex = latexOf(
      para('Said', node('footnoteRef', { id: '1' }), '.'),
      node('footnoteList', {}, [node('footnoteItem', { id: '1' }, [para('A footnote.')])]),
    )
    expect(latex).toContain('Said\\footnote{A footnote.}.')
    expect(latex.match(/A footnote\./g)).toHaveLength(1)
  })

  it('gathers endnotes at their list, with the package that does', () => {
    const latex = latexOf(
      para('Said', node('endnoteRef', { id: '1' })),
      node('endnoteList', {}, [node('endnoteItem', { id: '1' }, [para('An endnote.')])]),
    )
    expect(latex).toContain('Said\\endnote{An endnote.}')
    expect(latex).toContain('\\usepackage{endnotes}')
    expect(latex).toContain('\\theendnotes')
  })

  it('cites a reference by its key, and lists the references as a bibliography', () => {
    const latex = latexOf(
      para('As ', node('citation', { id: 'smith-2020' }), ' shows.'),
      node('referenceList', {}, [node('referenceItem', { id: 'smith-2020' }, ['Smith, A book.'])]),
    )
    expect(latex).toContain('As \\cite{smith-2020} shows.')
    expect(latex).toContain(
      '\\begin{thebibliography}{1}\n\\bibitem{smith-2020} Smith, A book.\n\\end{thebibliography}',
    )
  })

  it('links a cross-reference to the heading it names, and leaves words that name none', () => {
    const latex = latexOf(
      node('heading', { level: 2, id: 'method' }, ['Method']),
      para('See ', node('crossReference', { target: 'method', text: 'Method' }), '.'),
      para('And ', node('crossReference', { target: 'gone', text: 'Gone' }), '.'),
    )
    expect(latex).toContain('\\subsection{Method}\\label{method}')
    expect(latex).toContain('See \\hyperref[method]{Method}.')
    expect(latex).toContain('And Gone.')
  })

  it('maps a symbol pdfLaTeX cannot set, in text and in code, and only under pdfLaTeX', () => {
    const latex = latexOf(para('Done ✓'), node('codeBlock', {}, ['ok ✓']))
    expect(latex).toContain('\\ifPDFTeX\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}')
    expect(latex).toContain(
      '\\newunicodechar{✓}{\\checkmark}\n\\else\n\\usepackage{fontspec}\n\\fi',
    )
    expect(latex).toContain('\\ifPDFTeX\\lstset{literate={✓}{{\\checkmark}}1}\\fi')
    expect(latexOf(para('Plain'))).not.toContain('newunicodechar')
  })

  it('loads mhchem for a chemical formula', () => {
    expect(latexOf(para(node('math', { latex: '\\ce{H2O}' })))).toContain(
      '\\usepackage[version=4]{mhchem}',
    )
    expect(latexOf(para(node('math', { latex: 'x^2' })))).not.toContain('mhchem')
  })
})
