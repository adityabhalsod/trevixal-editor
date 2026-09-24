import {
  type Attrs,
  type EditorNode,
  Fragment,
  customListScheme,
  storedListSchemesAttr,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { XmlElement, parseXML } from '../src/xml'
import { readZip } from '../src/zip'
import { cell, doc, listItem, p, partText, row, schema, table } from './helpers'

const STEPS = customListScheme('custom-1', 'Steps', [
  { style: 'decimal', text: 'Step %1:', start: 3, indent: 2 },
  { style: 'lower-alpha', text: '%1.%2)', start: 1, indent: 1 },
  { style: 'bullet', text: '–', start: 1, indent: 1 },
])

function withSchemes(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', { listSchemes: storedListSchemesAttr([STEPS]) }, Fragment.from(blocks))
}

function ol(attrs: Attrs | undefined, ...items: EditorNode[]): EditorNode {
  return schema.node('orderedList', attrs, Fragment.from(items))
}

function task(attrs: Attrs, text: string): EditorNode {
  return schema.node('taskItem', { checked: false, ...attrs }, Fragment.of(p(text)))
}

function tasks(...items: EditorNode[]): EditorNode {
  return schema.node('taskList', undefined, Fragment.from(items))
}

/** Two levels under the defined scheme. */
function steps(start?: number): EditorNode {
  return withSchemes(
    ol(
      { numbering: 'custom-1', ...(start ? { start } : {}) },
      listItem(p('Plan'), ol(undefined, listItem(p('Scope')))),
    ),
  )
}

async function docxParts(
  document: EditorNode,
): Promise<{ numbering: XmlElement; body: XmlElement }> {
  const parts = await readZip(await serializeToDOCX(document))
  return {
    numbering: parseXML(partText(parts, 'word/numbering.xml')),
    body: parseXML(partText(parts, 'word/document.xml')),
  }
}

describe('a defined multilevel scheme in Word', () => {
  it('becomes an abstract numbering of its own: each level’s style, marker, start and indent', async () => {
    const { numbering } = await docxParts(steps())
    const abstract = numbering
      .findAll('w:abstractNum')
      .find((node) => node.child('w:multiLevelType')?.attr('w:val') === 'multilevel')
    const levels = abstract?.findAll('w:lvl').slice(0, 3) ?? []
    expect(
      levels.map((lvl) => [
        lvl.child('w:numFmt')?.attr('w:val'),
        lvl.child('w:lvlText')?.attr('w:val'),
        lvl.child('w:start')?.attr('w:val'),
      ]),
    ).toEqual([
      ['decimal', 'Step %1:', '3'],
      ['lowerLetter', '%1.%2)', '1'],
      ['bullet', '–', '1'],
    ])
    // The indents add up level by level, in twips: 2em, then 1em more, at the 11pt body size.
    const indents = levels.map((lvl) => lvl.child('w:pPr')?.child('w:ind')?.attr('w:left'))
    expect(indents).toEqual(['440', '660', '880'])
  })

  it('starts the list where its first level says, unless the list sets its own start', async () => {
    const own = (await docxParts(steps())).numbering
    const overrides = (numbering: XmlElement) =>
      numbering.findAll('w:startOverride').map((node) => node.attr('w:val'))
    expect(overrides(own)).toEqual(['3'])
    expect(overrides((await docxParts(steps(7))).numbering)).toEqual(['7'])
  })
})

describe('a defined multilevel scheme in RTF', () => {
  it('writes each item’s marker as the scheme numbers it, from the level’s start', () => {
    const rtf = serializeToRTF(steps())
    expect(rtf).toContain('Step 3:\\tab ')
    expect(rtf).toContain('3.a)\\tab ')
  })
})

describe('task due dates and assignees', () => {
  const plan = () =>
    doc(tasks(task({ assignee: 'Priya', due: '2026-10-01' }, 'Draft'), task({}, 'Send')))

  it('follow the task in Word, smaller and in grey', async () => {
    const { body } = await docxParts(plan())
    const paragraphs = body.findAll('w:p')
    const first = paragraphs[0]
    const runs = first?.findAll('w:r') ?? []
    const last = runs[runs.length - 1]
    expect(
      last
        ?.findAll('w:t')
        .map((node) => node.text())
        .join(''),
    ).toBe(' @Priya · 2026-10-01')
    expect(last?.child('w:rPr')?.child('w:color')?.attr('w:val')).toBe('767676')
    // A task with neither is written as it was.
    expect(
      paragraphs[1]
        ?.findAll('w:t')
        .map((node) => node.text())
        .join(''),
    ).toBe('☐ Send')
  })

  it('follow the task in RTF', () => {
    const rtf = serializeToRTF(plan())
    expect(rtf).toMatch(/Draft\{\\cf\d+\\fs\d+ {2}@Priya \\u183\? 2026-10-01\}\\par/)
  })
})

describe('table layout in Word', () => {
  it('writes a table’s own cell padding as its cell margins, and each cell’s vertical alignment', async () => {
    const { body } = await docxParts(
      doc(
        table(
          { cellPadding: '16px' },
          row(
            cell('a', { verticalAlign: 'middle' }),
            cell('b', { verticalAlign: 'bottom' }),
            cell('c'),
          ),
        ),
      ),
    )
    const margins = body.find('w:tblCellMar')
    const sides = margins?.children.flatMap((side) =>
      side instanceof XmlElement ? [`${side.name}=${side.attr('w:w')}`] : [],
    )
    expect(sides).toEqual(['w:top=240', 'w:left=240', 'w:bottom=240', 'w:right=240'])
    expect(body.findAll('w:vAlign').map((node) => node.attr('w:val'))).toEqual(['center', 'bottom'])
  })

  it('keeps marking a header row to repeat on every page, as it always has', async () => {
    const { body } = await docxParts(
      doc(table(undefined, row(cell('h', { header: true })), row(cell('b')))),
    )
    expect(body.findAll('w:tblHeader')).toHaveLength(1)
  })
})

describe('table layout in RTF', () => {
  it('repeats the header row, pads the cells and aligns them', () => {
    const rtf = serializeToRTF(
      doc(
        table(
          { cellPadding: '4px' },
          row(cell('h', { header: true })),
          row(cell('m', { verticalAlign: 'middle' })),
          row(cell('b', { verticalAlign: 'bottom' })),
        ),
      ),
    )
    const rows = rtf.split('\\trowd').slice(1)
    expect(rows[0]).toContain('\\trhdr')
    expect(rows[1]).not.toContain('\\trhdr')
    expect(rtf).toContain('\\trpaddl60\\trpaddfl3\\trpaddt60\\trpaddft3')
    expect(rows[1]).toContain('\\clvertalc')
    expect(rows[2]).toContain('\\clvertalb')
  })

  it('writes a table in a cell as RTF’s nested table', () => {
    const inner = table(undefined, row(cell('x'), cell('y')))
    const rtf = serializeToRTF(doc(table(undefined, row(cell([p('outer'), inner]), cell('z')))))
    expect(rtf).toContain('\\itap2')
    expect(rtf.match(/\\nestcell/g)).toHaveLength(2)
    expect(rtf).toContain('{\\*\\nesttableprops\\trowd')
    expect(rtf).toContain('\\nestrow}{\\nonesttables\\par}')
    // The outer row still ends as a row, and the inner table shares out its cell.
    expect(rtf.match(/\\row\b/g)).toHaveLength(1)
    const nested = /\\nesttableprops(.*?)\\nestrow/.exec(rtf)?.[1] ?? ''
    expect([...nested.matchAll(/\\cellx(\d+)/g)].map((match) => Number(match[1]))).toEqual([
      2340, 4680,
    ])
  })
})
