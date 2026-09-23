import { type Attrs, type EditorNode, Fragment } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { serializeToRTF } from '../src/rtf'
import { type XmlElement, parseXML } from '../src/xml'
import { readZip } from '../src/zip'
import { doc, listItem, p, partText, schema, taskItem, taskList } from './helpers'

function ol(attrs: Attrs | undefined, ...items: EditorNode[]): EditorNode {
  return schema.node('orderedList', attrs, Fragment.from(items))
}

function ul(attrs: Attrs | undefined, ...items: EditorNode[]): EditorNode {
  return schema.node('bulletList', attrs, Fragment.from(items))
}

/** Three levels of one list, each level holding two items. */
function tree(root: (children: EditorNode[]) => EditorNode, nested: typeof ol): EditorNode {
  return doc(
    root([
      listItem(
        p('one'),
        nested(
          undefined,
          listItem(p('two'), nested(undefined, listItem(p('three')))),
          listItem(p('two b')),
        ),
      ),
      listItem(p('one b')),
    ]),
  )
}

async function docxParts(document: EditorNode): Promise<{ numbering: XmlElement; body: string }> {
  const parts = await readZip(await serializeToDOCX(document))
  return {
    numbering: parseXML(partText(parts, 'word/numbering.xml')),
    body: partText(parts, 'word/document.xml'),
  }
}

/** `w:numFmt` and `w:lvlText` of each of an abstract's first levels. */
function levels(numbering: XmlElement, abstractId: string, count = 4): string[] {
  const abstract = numbering
    .findAll('w:abstractNum')
    .find((node) => node.attr('w:abstractNumId') === abstractId)
  return (abstract?.findAll('w:lvl') ?? [])
    .slice(0, count)
    .map(
      (lvl) => `${lvl.child('w:numFmt')?.attr('w:val')} ${lvl.child('w:lvlText')?.attr('w:val')}`,
    )
}

/** The `w:numId` each list paragraph points at, with its level, in order. */
function numbered(body: string): string[] {
  return parseXML(body)
    .findAll('w:numPr')
    .map(
      (numPr) => `${numPr.child('w:numId')?.attr('w:val')}@${numPr.child('w:ilvl')?.attr('w:val')}`,
    )
}

/** The marker in front of each list paragraph, as RTF writes it. */
function rtfMarkers(document: EditorNode): string[] {
  return [...serializeToRTF(document).matchAll(/ ([^ \\{}]+|\\u-?\d+\?)\\tab /g)].map(
    (match) => match[1] as string,
  )
}

describe('Word numbering by level', () => {
  it('numbers a plain nested list 1. a. i. and round again', async () => {
    const { numbering } = await docxParts(doc(ol(undefined, listItem(p('a')))))
    expect(levels(numbering, '1')).toEqual([
      'decimal %1.',
      'lowerLetter %2.',
      'lowerRoman %3.',
      'decimal %4.',
    ])
  })

  it('keeps one instance per list when no scheme is stored', async () => {
    const { body } = await docxParts(tree((items) => ol(undefined, ...items), ol))
    // Five numbered paragraphs across three lists: three instances, as before.
    expect(new Set(numbered(body).map((ref) => ref.split('@')[0])).size).toBe(3)
  })
})

describe('Word numbering under a scheme', () => {
  it('shares one instance across the whole tree, each list at its own level', async () => {
    const { numbering, body } = await docxParts(
      tree((items) => ol({ numbering: 'outline' }, ...items), ol),
    )
    expect(numbered(body)).toEqual(['1@0', '1@1', '1@2', '1@1', '1@0'])
    expect(numbering.findAll('w:num')).toHaveLength(1)
  })

  it('writes an outline as legal numbering, every ancestor in the text', async () => {
    const { numbering } = await docxParts(
      tree((items) => ol({ numbering: 'outline' }, ...items), ol),
    )
    expect(levels(numbering, '2', 3)).toEqual([
      'decimal %1.',
      'decimal %1.%2.',
      'decimal %1.%2.%3.',
    ])
    const scheme = numbering.findAll('w:abstractNum')[2]
    expect(scheme?.child('w:multiLevelType')?.attr('w:val')).toBe('multilevel')
    expect(scheme?.findAll('w:isLgl')).toHaveLength(9)
  })

  it('closes each level with a parenthesis', async () => {
    const { numbering } = await docxParts(
      tree((items) => ol({ numbering: 'parenthesis' }, ...items), ol),
    )
    expect(levels(numbering, '2', 3)).toEqual(['decimal %1)', 'lowerLetter %2)', 'lowerRoman %3)'])
  })

  it('walks I. A. 1. a. i. for a roman outline', async () => {
    const { numbering } = await docxParts(doc(ol({ numbering: 'roman-outline' }, listItem(p('a')))))
    expect(levels(numbering, '2', 5)).toEqual([
      'upperRoman %1.',
      'upperLetter %2.',
      'decimal %3.',
      'lowerLetter %4.',
      'lowerRoman %5.',
    ])
  })

  it('bullets each level with its own glyph', async () => {
    const { numbering } = await docxParts(
      tree((items) => ul({ numbering: 'symbols' }, ...items), ul),
    )
    expect(levels(numbering, '2', 4)).toEqual(['bullet ❖', 'bullet ➢', 'bullet ▪', 'bullet ❖'])
  })

  it('defines a scheme once, however many lists use it', async () => {
    const { numbering } = await docxParts(
      doc(
        ol({ numbering: 'outline' }, listItem(p('a'))),
        p('between'),
        ol({ numbering: 'outline' }, listItem(p('b'))),
      ),
    )
    expect(numbering.findAll('w:abstractNum')).toHaveLength(3)
    // Two lists, two instances: the second restarts rather than continuing.
    expect(numbering.findAll('w:num')).toHaveLength(2)
  })

  it('gives a list of the other type inside the tree an instance of its own', async () => {
    const { body } = await docxParts(
      doc(ol({ numbering: 'outline' }, listItem(p('a'), ul(undefined, listItem(p('b')))))),
    )
    expect(numbered(body)).toEqual(['1@0', '2@1'])
  })

  it('carries a tree on past a task list inside it', async () => {
    const { body } = await docxParts(
      doc(
        ol(
          { numbering: 'outline' },
          listItem(p('a'), taskList(taskItem(false, p('t'), ol(undefined, listItem(p('deep')))))),
        ),
      ),
    )
    // The task item has a glyph, not numbering; the list inside it rejoins.
    expect(numbered(body)).toEqual(['1@0', '1@2'])
  })
})

describe('a list’s own marker style in Word', () => {
  it('replaces its level, beside the start it restarts at', async () => {
    const { numbering } = await docxParts(
      doc(ol({ start: 4, listStyle: 'upper-roman' }, listItem(p('a')))),
    )
    const override = numbering.find('w:lvlOverride')
    expect(override?.child('w:startOverride')?.attr('w:val')).toBe('4')
    expect(override?.find('w:numFmt')?.attr('w:val')).toBe('upperRoman')
    expect(override?.find('w:lvlText')?.attr('w:val')).toBe('%1.')
  })

  it('draws a bullet list’s chosen glyph', async () => {
    const { numbering } = await docxParts(doc(ul({ listStyle: 'square' }, listItem(p('a')))))
    const override = numbering.find('w:lvlOverride')
    expect(override?.child('w:startOverride')).toBeUndefined()
    expect(override?.find('w:lvlText')?.attr('w:val')).toBe('▪')
  })
})

describe('RTF markers', () => {
  it('number a plain nested list 1. a. i.', () => {
    expect(rtfMarkers(tree((items) => ol(undefined, ...items), ol))).toEqual([
      '1.',
      'a.',
      'i.',
      'b.',
      '2.',
    ])
  })

  it('follow an outline, every ancestor in the number', () => {
    expect(rtfMarkers(tree((items) => ol({ numbering: 'outline' }, ...items), ol))).toEqual([
      '1.',
      '1.1.',
      '1.1.1.',
      '1.2.',
      '2.',
    ])
  })

  it('close with a parenthesis, counting on from the start', () => {
    expect(
      rtfMarkers(
        doc(
          ol(
            { numbering: 'parenthesis', start: 3 },
            listItem(p('c'), ol(undefined, listItem(p('x')), listItem(p('y')))),
          ),
        ),
      ),
    ).toEqual(['3)', 'a)', 'b)'])
  })

  it('draw a bulleted scheme’s glyphs', () => {
    // RTF spells anything past ASCII as `\uN?`.
    expect(rtfMarkers(tree((items) => ul({ numbering: 'symbols' }, ...items), ul))).toEqual([
      '\\u10070?',
      '\\u10146?',
      '\\u9642?',
      '\\u10146?',
      '\\u10070?',
    ])
  })

  it('use a list’s own style over the level’s', () => {
    expect(
      rtfMarkers(
        doc(ol({ listStyle: 'upper-roman' }, listItem(p('a')), listItem(p('b')), listItem(p('c')))),
      ),
    ).toEqual(['I.', 'II.', 'III.'])
  })
})
