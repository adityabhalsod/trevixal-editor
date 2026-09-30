// @vitest-environment happy-dom
import { type EditorNode, Fragment } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { parseExportArchive } from '../src/archive-import'
import { serializeToEPUB } from '../src/epub'
import { escapeLaTeX, serializeToLaTeX } from '../src/latex'
import { parseODT, serializeToODT } from '../src/odt'
import { type PdfJsLike, linesToBlocks, pageLines, parsePDF } from '../src/pdf'
import { parseXML } from '../src/xml'
import { createZip, readZip } from '../src/zip'
import {
  bulletList,
  cell,
  codeBlock,
  heading,
  image,
  listItem,
  mark,
  orderedList,
  p,
  row,
  schema,
  table,
  text,
} from './helpers'

const doc = (...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', undefined, Fragment.from(blocks))

/** A one-pixel PNG, as the tests' picture. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const sample = doc(
  heading(1, 'Field notes'),
  p([text('Owls are '), text('quiet', mark('bold')), text(' & fast: 100% of them.')]),
  heading(2, 'Where'),
  bulletList(listItem(p('Barns')), listItem(p('Woods'))),
  orderedList(1, listItem(p('First'))),
  codeBlock('let owl = 1\n  hoot()', 'javascript'),
  table(
    undefined,
    row(cell('Name', { colspan: 2 }), cell('Age', { rowspan: 2 })),
    row(cell('Barn'), cell('Tawny')),
  ),
  image({ src: PNG, alt: 'A dot' }),
)

describe('LaTeX', () => {
  it('escapes every character LaTeX gives a meaning', () => {
    expect(escapeLaTeX('100% & $5_#{}~^\\')).toBe(
      '100\\% \\& \\$5\\_\\#\\{\\}\\textasciitilde{}\\textasciicircum{}\\textbackslash{}',
    )
  })

  it('writes an article: the title, sections, marks, lists, code and a table', () => {
    const tex = serializeToLaTeX(sample)
    expect(tex).toContain('\\documentclass{article}')
    expect(tex).toContain('\\title{Field notes}')
    expect(tex).toContain('\\maketitle')
    expect(tex).toContain('\\subsection{Where}')
    expect(tex).toContain('Owls are \\textbf{quiet} \\& fast: 100\\% of them.')
    expect(tex).toContain('\\begin{itemize}\n  \\item Barns')
    expect(tex).toContain('\\begin{enumerate}')
    expect(tex).toContain(
      '\\begin{lstlisting}[language=Java]\nlet owl = 1\n  hoot()\n\\end{lstlisting}',
    )
    expect(tex).toContain('\\usepackage{listings}')
    expect(tex).toContain('\\begin{tabular}')
    expect(tex.trim().endsWith('\\end{document}')).toBe(true)
  })
})

describe('EPUB', () => {
  it('packs a book: the mimetype first, a chapter per top heading, and its pictures', async () => {
    const book = serializeToEPUB(
      doc(heading(1, 'One'), p('a'), heading(1, 'Two'), image({ src: PNG })),
      document,
      {
        title: 'Notes',
        identifier: 'urn:uuid:test',
        modified: new Date('2026-01-01T00:00:00Z'),
      },
    )
    const parts = await readZip(book)
    const names = [...parts.keys()]
    expect(names[0]).toBe('mimetype')
    expect(new TextDecoder().decode(parts.get('mimetype'))).toBe('application/epub+zip')
    expect(names).toEqual(
      expect.arrayContaining([
        'OEBPS/chapter-1.xhtml',
        'OEBPS/chapter-2.xhtml',
        'OEBPS/images/image-1.png',
      ]),
    )
    const opf = new TextDecoder().decode(parts.get('OEBPS/content.opf'))
    expect(opf).toContain('<dc:title>Notes</dc:title>')
    expect(opf).toContain('<itemref idref="chapter-2"/>')
    const chapter = new TextDecoder().decode(parts.get('OEBPS/chapter-2.xhtml'))
    // Well formed, as an EPUB reader parses it.
    expect(() => parseXML(chapter)).not.toThrow()
    expect(chapter).toContain('src="images/image-1.png"')
    const nav = new TextDecoder().decode(parts.get('OEBPS/nav.xhtml'))
    expect(nav).toContain('<a href="chapter-1.xhtml">One</a>')
  })
})

describe('OpenDocument', () => {
  it('writes what it reads back: headings, marks, lists, code, merged cells and pictures', async () => {
    const bytes = serializeToODT(sample, { title: 'Field notes' })
    const parts = await readZip(bytes)
    expect([...parts.keys()][0]).toBe('mimetype')
    expect(parts.has('Pictures/image-1.png')).toBe(true)
    const back = await parseODT(schema, new Blob([new Uint8Array(bytes)]))
    const names = back.content.children.map((block) => block.type.name)
    expect(names).toEqual([
      'heading',
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'paragraph',
      'paragraph',
      'table',
      'image',
    ])
    expect(back.child(1).textContent).toBe('Owls are quiet & fast: 100% of them.')
    expect(
      back
        .child(1)
        .child(1)
        .marks.map((each) => each.type.name),
    ).toEqual(['bold'])
    // The code kept its indentation.
    expect(back.child(6).textContent).toBe('  hoot()')
    const merged = back.child(7).child(0)
    expect(merged.child(0).attrs.colspan).toBe(2)
    expect(merged.child(1).attrs.rowspan).toBe(2)
    expect(String(back.child(8).attrs.src)).toMatch(/^data:image\/png;base64,/)
  })
})

describe('Notion and Google Docs exports', () => {
  it('reads Notion’s Markdown pages with their pictures packed in', async () => {
    const zip = createZip([
      {
        name: 'Trip 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md',
        data: '# Trip\n\n![Map](Trip%201a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d/map.png)\n',
      },
      {
        name: 'Trip 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d/map.png',
        data: Uint8Array.from(atob(PNG.split(',')[1] as string), (char) => char.charCodeAt(0)),
      },
    ])
    const result = await parseExportArchive(schema, new Blob([new Uint8Array(zip)]), document)
    expect(result.child(0).textContent).toBe('Trip')
    const picture =
      result.content.children.find((block) => block.type.name === 'image') ??
      result.child(1).content.children.find((child) => child.type.name === 'image')
    expect(String(picture?.attrs.src)).toMatch(/^data:image\/png;base64,/)
  })

  it('reads Google Docs’ web page, its classes taken as the formatting they are', async () => {
    const zip = createZip([
      {
        name: 'Notes.html',
        data: '<html><head><style>.c1{font-weight:700}.c2{font-style:italic}</style></head><body><p><span>Plain </span><span class="c1">strong</span> <span class="c2">slanted</span></p></body></html>',
      },
    ])
    const result = await parseExportArchive(schema, new Blob([new Uint8Array(zip)]), document)
    const runs = result.child(0).content.children
    expect(
      runs.map((run) => [run.textContent, run.marks.map((each) => each.type.name).join('+')]),
    ).toEqual([
      ['Plain ', ''],
      ['strong', 'bold'],
      [' ', ''],
      ['slanted', 'italic'],
    ])
  })
})

describe('PDF text', () => {
  const item = (str: string, y: number, height = 10) => ({
    str,
    transform: [1, 0, 0, height, 72, y],
    height,
  })

  it('makes lines of runs on one baseline, and paragraphs of lines close together', () => {
    const lines = pageLines([
      item('Hello', 700),
      item('world', 700),
      item('and on', 688),
      item('New part', 650),
    ])
    expect(lines.map((line) => line.text)).toEqual(['Hello world', 'and on', 'New part'])
    const blocks = linesToBlocks(schema, [lines])
    expect(blocks.map((block) => block.textContent)).toEqual(['Hello world and on', 'New part'])
  })

  it('reads a line set well above the body size as a heading, and joins a broken word', async () => {
    const pdfjs: PdfJsLike = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({
              items: [
                item('Owls', 760, 20),
                item('They hoot at night and hunt by ear, a skill', 720),
                item('ful thing.', 708),
              ],
            }),
          }),
        }),
      }),
    }
    const result = await parsePDF(schema, new Blob([new Uint8Array([37, 80, 68, 70])]), pdfjs)
    expect(result.child(0).type.name).toBe('heading')
    expect(result.child(0).textContent).toBe('Owls')
    expect(result.child(1).textContent).toBe(
      'They hoot at night and hunt by ear, a skill ful thing.',
    )
  })
})
