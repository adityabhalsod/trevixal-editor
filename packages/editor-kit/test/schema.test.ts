import { createEditor, serializeToHTML } from '@trevixal/core'
import { describe, expect, test } from 'vitest'
import { initialContent } from '../src/content'
import { createFullSchema } from '../src/schema'

/**
 * The schema is the contract between a server that stores documents and the
 * browser that edits them, so these ask the question a server asks: can this
 * schema read what the editor wrote, with no DOM in the room?
 */
describe('createFullSchema', () => {
  test('knows the node types the extensions contribute', () => {
    const schema = createFullSchema()
    // One per extension that adds nodes: table, image, blocks, embed, math.
    for (const name of ['tableCell', 'image', 'callout', 'attachment', 'mathBlock']) {
      expect(schema.nodes[name], name).toBeDefined()
    }
    // And the marks track changes adds, without which a suggestion loads as
    // plain text and silently stops being reviewable.
    expect(schema.marks.insertion).toBeDefined()
  })

  test('loads and serializes the seeded document without an element', () => {
    // No `element`, which is the whole point: this is what `examples/ssr`
    // runs in plain Node. A missing node type throws here rather than
    // rendering an empty page in production.
    const editor = createEditor({ schema: createFullSchema(), content: initialContent })
    try {
      const html = serializeToHTML(editor.state.doc)
      expect(html).toContain('<table>')
      expect(html).toContain('<h1>Trevixal</h1>')
    } finally {
      editor.destroy()
    }
  })
})
