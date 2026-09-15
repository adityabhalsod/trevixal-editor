import { Schema, defaultMarks, defaultNodes, nodeFromJSON } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  BLANK_DOCUMENT,
  defaultTemplates,
  documentTitleFrom,
  templateToDoc,
} from '../src/templates'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

describe('defaultTemplates', () => {
  it('offers the blank page first and gives every template an identity', () => {
    const templates = defaultTemplates()
    expect(templates.length).toBeGreaterThan(1)
    expect(templates[0]?.id).toBe('blank')
    expect(templates[0]?.doc).toEqual(BLANK_DOCUMENT)
    expect(new Set(templates.map((template) => template.id)).size).toBe(templates.length)
    for (const template of templates) {
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.description.length).toBeGreaterThan(0)
      expect(template.icon?.length).toBeGreaterThan(0)
    }
  })

  it('names the templates a host is expected to offer', () => {
    expect(defaultTemplates().map((template) => template.id)).toEqual([
      'blank',
      'meeting-notes',
      'project-brief',
      'blog-post',
      'weekly-report',
      'readme',
    ])
  })

  it('loads every template into a stock schema', () => {
    for (const template of defaultTemplates()) {
      expect(() => nodeFromJSON(schema, template.doc), template.id).not.toThrow()
      const node = nodeFromJSON(schema, template.doc)
      expect([template.id, node.type.name]).toEqual([template.id, 'doc'])
      expect(node.content.children.length).toBeGreaterThan(0)
    }
  })

  it('normalizes every template through templateToDoc', () => {
    for (const template of defaultTemplates()) {
      const node = templateToDoc(template, schema)
      expect([template.id, node.type.name]).toEqual([template.id, 'doc'])
      // Round-tripping the normalized node keeps it loadable.
      expect(() => nodeFromJSON(schema, node.toJSON()), template.id).not.toThrow()
    }
  })

  it('uses only marks the stock schema knows', () => {
    const marks = new Set<string>()
    const walk = (node: { marks?: { type: string }[]; content?: unknown[] }): void => {
      for (const mark of node.marks ?? []) marks.add(mark.type)
      for (const child of node.content ?? []) walk(child as typeof node)
    }
    for (const template of defaultTemplates()) walk(template.doc as never)
    expect(marks.size).toBeGreaterThan(0)
    for (const name of marks) expect([name, schema.marks[name] !== undefined]).toEqual([name, true])
  })

  it('starts every non-blank template with a level 1 heading', () => {
    for (const template of defaultTemplates().slice(1)) {
      const first = template.doc.content?.[0]
      expect([template.id, first?.type, first?.attrs?.level]).toEqual([template.id, 'heading', 1])
    }
  })
})

describe('documentTitleFrom', () => {
  it('returns the first heading of a template', () => {
    const titles = defaultTemplates().map((template) => documentTitleFrom(template.doc))
    expect(titles).toEqual([
      'Untitled',
      'Meeting notes',
      'Project brief',
      'Post title',
      'Weekly report',
      'Project name',
    ])
  })

  it('reads a heading that is not the first block', () => {
    expect(
      documentTitleFrom({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Preamble.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Later' }] },
        ],
      }),
    ).toBe('Later')
  })

  it('accepts an EditorNode as well as JSON', () => {
    const node = templateToDoc(defaultTemplates()[1] as never, schema)
    expect(documentTitleFrom(node)).toBe('Meeting notes')
  })

  it('falls back to the prose, then to the untitled label', () => {
    expect(
      documentTitleFrom({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No heading here.' }] }],
      }),
    ).toBe('No heading here.')
    expect(documentTitleFrom(BLANK_DOCUMENT)).toBe('Untitled')
    expect(documentTitleFrom(BLANK_DOCUMENT, 'New document')).toBe('New document')
  })

  it('skips an empty heading', () => {
    expect(
      documentTitleFrom({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 } },
          { type: 'paragraph', content: [{ type: 'text', text: 'Prose wins.' }] },
        ],
      }),
    ).toBe('Prose wins.')
  })
})
