import { type EditorNode, Fragment, Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToDOCX } from '../src/docx-writer'
import { readZip } from '../src/zip'
import { partText } from './helpers'

// The comments extension's mark, as the document carries it.
const schema = new Schema({
  nodes: defaultNodes(),
  marks: {
    ...defaultMarks(),
    comment: {
      attrs: { id: {} },
      toHTML: (mark) => ({ tag: 'span', attrs: { 'data-comment': String(mark.attrs.id) } }),
    },
  },
})

const commented = (value: string, id: string): EditorNode =>
  schema.text(value, [schema.mark('comment', { id })])
const plain = (value: string): EditorNode => schema.text(value)
const paragraph = (...inline: EditorNode[]): EditorNode =>
  schema.node('paragraph', undefined, Fragment.from(inline))

const threads = JSON.stringify([
  {
    id: 'c1',
    resolved: false,
    comments: [
      { author: 'Ada Lovelace', text: 'Is the total right?', time: Date.UTC(2026, 8, 1) },
      { author: 'Sam', text: 'Checked, yes.', time: Date.UTC(2026, 8, 2) },
    ],
  },
  { id: 'gone', resolved: false, comments: [{ author: 'Ada', text: 'No text left', time: 0 }] },
])

describe('comments in a Word document', () => {
  it('writes each thread with its replies, its range across paragraphs, and its reference', async () => {
    const doc = schema.node('doc', { comments: threads }, [
      paragraph(plain('The '), commented('total is', 'c1')),
      paragraph(commented('twelve', 'c1'), plain(' pounds.')),
    ])
    const parts = await readZip(await serializeToDOCX(doc))
    const comments = partText(parts, 'word/comments.xml')
    expect(comments).toContain(
      '<w:comment w:id="0" w:author="Ada Lovelace" w:date="2026-09-01T00:00:00Z" w:initials="AL">',
    )
    expect(comments).toContain('Is the total right?')
    expect(comments).toContain('Sam: Checked, yes.')
    // A thread whose text is gone has nothing to hang on.
    expect(comments).not.toContain('No text left')

    const body = partText(parts, 'word/document.xml')
    expect(body.match(/<w:commentRangeStart w:id="0"\/>/g)).toHaveLength(1)
    expect(body.match(/<w:commentRangeEnd w:id="0"\/>/g)).toHaveLength(1)
    expect(body.indexOf('commentRangeStart')).toBeLessThan(body.indexOf('total is'))
    expect(body.indexOf('commentRangeEnd')).toBeGreaterThan(body.indexOf('twelve'))
    expect(body).toContain('<w:commentReference w:id="0"/>')

    expect(partText(parts, '[Content_Types].xml')).toContain('/word/comments.xml')
    expect(partText(parts, 'word/_rels/document.xml.rels')).toContain('Target="comments.xml"')
  })

  it('writes no comments part for a document without any', async () => {
    const parts = await readZip(
      await serializeToDOCX(schema.node('doc', undefined, [paragraph(plain('Hi'))])),
    )
    expect(parts.has('word/comments.xml')).toBe(false)
    expect(partText(parts, '[Content_Types].xml')).not.toContain('comments')
  })
})
